import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { isValidPeriod, jsonResponse, errorResponse } from "../_shared/validate.ts";
import { silaePost } from "../_shared/silae-auth.ts";

interface SalaryEntry { matriculeSalarie: string; nomAffiche: string }

function prevPeriod(p: string): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextPeriod(p: string): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toIsoDate(period: string): string {
  return `${period}-01T00:00:00`;
}

async function fetchSalaries(numero: string, period: string): Promise<SalaryEntry[]> {
  try {
    const data = await silaePost("/v1/InfosSalaries/ListeSalaries", {
      numeroDossier: numero,
      listeSalariesOptions: { optionActifALaDate: toIsoDate(period) },
    });
    return data.listeSalariesInformations ?? [];
  } catch (e) {
    console.error(`[silae-sync] fetchSalaries ${numero}:`, e);
    return [];
  }
}

async function checkBulletinExists(
  numero: string, matricule: string, period: string
): Promise<boolean> {
  // Essayer identifiantEmploi 1 puis 0 (varie selon les dossiers)
  for (const emploiId of [1, 0]) {
    try {
      await silaePost("/v1/InfosBulletins/SalarieBulletinEntete", {
        numeroDossier: numero,
        requeteSalarieBulletinEntete: {
          matriculeSalarie: matricule,
          identifiantEmploi: emploiId,
          periode: toIsoDate(period),
          indicePeriode: 0,
        },
      });
      return true;
    } catch {
      // Essayer le suivant
    }
  }
  return false;
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return corsResponse(req);

  const auth = await verifyAuth(req);
  if (!auth.ok) return unauthorizedResponse(cors);

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

  let logId: number | null = null;
  try {
    const { period } = await req.json();
    if (!period || !isValidPeriod(period)) {
      return errorResponse("Format periode invalide (attendu: YYYY-MM)", cors, 400);
    }

    const pPrev = prevPeriod(period);
    const pNext = nextPeriod(period);

    // Log debut
    const { data: logRow } = await sb.from("silae_sync_log").insert({
      period, status: "running",
    }).select().single();
    logId = logRow?.id;

    // PHASE 1 : Lister dossiers + effectif M + ecrire les lignes immediatement
    const dossierData = await silaePost("/v1/InfosTechniquesDossiers/ListeDossiers", {
      typeDossiers: 0, etatDossier: 2,
    });
    const allDossiers: { numero: string; raisonSociale: string; siret: string }[] =
      dossierData.listeDossiers ?? [];

    const moisId = `sp_${period.replace("-", "_")}`;
    await sb.from("suivi_paie_mois").upsert({
      id: moisId, period, last_sync_at: new Date().toISOString(),
    }, { onConflict: "period" });

    // Fetch effectif M pour tous les dossiers (batch 10)
    const activeDossiers: { numero: string; nom: string; siret: string; salaries: SalaryEntry[] }[] = [];
    const allResults: { numero: string; nom: string; siret: string; salaries: SalaryEntry[] }[] = [];

    const BATCH_SAL = 10;
    for (let i = 0; i < allDossiers.length; i += BATCH_SAL) {
      const batch = allDossiers.slice(i, i + BATCH_SAL);
      const results = await Promise.all(
        batch.map(async (d) => ({
          numero: d.numero,
          nom: d.raisonSociale.trim(),
          siret: d.siret,
          salaries: await fetchSalaries(d.numero, period),
        }))
      );
      allResults.push(...results);
    }

    // Batch upsert dossiers (1 seul appel DB)
    const now = new Date().toISOString();
    const dossierRows = allResults.map((r) => ({
      id: `dos_${r.numero}`, numero: r.numero, nom: r.nom, siret: r.siret,
      effectif: r.salaries.length, synced_from_silae: true, last_silae_sync: now,
    }));
    await sb.from("dossiers").upsert(dossierRows, { onConflict: "numero", ignoreDuplicates: false });

    // Pre-fetch toutes les lignes existantes (1 seul appel DB)
    const { data: existingLines } = await sb.from("suivi_paie_lines")
      .select("numero_dossier, gp, date_reception, traitement_par, date_envoi_bulletins, bs_calcules, entrees, sorties")
      .eq("mois_id", moisId);
    const existingMap = new Map((existingLines ?? []).map((l) => [l.numero_dossier, l]));

    // Batch upsert lignes suivi (1 seul appel DB)
    const lineRows = allResults.filter((r) => r.salaries.length > 0).map((r) => {
      activeDossiers.push(r);
      const ex = existingMap.get(r.numero);
      return {
        id: `spl_${period.replace("-", "_")}_${r.numero}`, mois_id: moisId,
        numero_dossier: r.numero, nom_dossier: r.nom, effectif: r.salaries.length,
        bs_calcules: ex?.bs_calcules ?? 0, entrees: ex?.entrees ?? 0, sorties: ex?.sorties ?? 0,
        synced_from_silae: true, last_silae_sync: now,
        gp: ex?.gp ?? "", date_reception: ex?.date_reception ?? "",
        traitement_par: ex?.traitement_par ?? "", date_envoi_bulletins: ex?.date_envoi_bulletins ?? "",
      };
    });
    if (lineRows.length > 0) {
      await sb.from("suivi_paie_lines").upsert(lineRows, { onConflict: "id" });
    }

    // PHASE 2 : Enrichir avec entrees/sorties + BS calcules (best effort)
    let totalEntrees = 0;
    let totalSorties = 0;
    let totalBsCalcules = 0;

    for (const d of activeDossiers) {
      try {
        // Entrees/sorties
        const [salPrev, salNext] = await Promise.all([
          fetchSalaries(d.numero, pPrev),
          fetchSalaries(d.numero, pNext),
        ]);

        const matPrev = new Set(salPrev.map((s) => s.matriculeSalarie));
        const matCurr = new Set(d.salaries.map((s) => s.matriculeSalarie));
        const matNext = new Set(salNext.map((s) => s.matriculeSalarie));

        const entrees = [...matCurr].filter((m) => !matPrev.has(m)).length;
        const sorties = [...matCurr].filter((m) => !matNext.has(m)).length;

        // BS calcules
        let bsCalcules = 0;
        for (let j = 0; j < d.salaries.length; j += 5) {
          const salBatch = d.salaries.slice(j, j + 5);
          const checks = await Promise.all(
            salBatch.map((s) => checkBulletinExists(d.numero, s.matriculeSalarie, period))
          );
          bsCalcules += checks.filter(Boolean).length;
        }

        totalEntrees += entrees;
        totalSorties += sorties;
        totalBsCalcules += bsCalcules;

        // Update la ligne avec les donnees enrichies
        await sb.from("suivi_paie_lines").update({
          entrees,
          sorties,
          bs_calcules: bsCalcules,
        }).eq("id", `spl_${period.replace("-", "_")}_${d.numero}`);

        // Snapshots
        await sb.from("silae_salaries_snapshot").upsert(
          d.salaries.map((s) => ({
            numero_dossier: d.numero,
            period,
            matricule: s.matriculeSalarie,
            nom_complet: s.nomAffiche,
          })),
          { onConflict: "numero_dossier,period,matricule" }
        );
      } catch (e) {
        console.error(`[silae-sync] Enrichissement ${d.numero}:`, e);
        // Continue avec le dossier suivant
      }
    }

    // Log fin
    if (logId) {
      await sb.from("silae_sync_log").update({
        status: "ok",
        finished_at: new Date().toISOString(),
        dossiers_synced: allDossiers.length,
        entrees_detected: totalEntrees,
        sorties_detected: totalSorties,
      }).eq("id", logId);
    }

    return jsonResponse({
      status: "ok", period,
      dossiers_synced: allDossiers.length,
      dossiers_actifs: activeDossiers.length,
      effectif_total: activeDossiers.reduce((s, d) => s + d.salaries.length, 0),
      bs_calcules_total: totalBsCalcules,
      entrees_total: totalEntrees,
      sorties_total: totalSorties,
    }, cors);
  } catch (e) {
    console.error("[silae-sync]", e);
    // Marquer le log en erreur
    if (logId) {
      await sb.from("silae_sync_log").update({
        status: "error",
        error_message: String(e).slice(0, 500),
        finished_at: new Date().toISOString(),
      }).eq("id", logId).catch(() => {});
    }
    return errorResponse("Erreur lors de la synchronisation Silae", cors);
  }
});
