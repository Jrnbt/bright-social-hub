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
  } catch {
    return [];
  }
}

async function checkBulletinExists(
  numero: string, matricule: string, period: string
): Promise<boolean> {
  try {
    await silaePost("/v1/InfosBulletins/SalarieBulletinEntete", {
      numeroDossier: numero,
      requeteSalarieBulletinEntete: {
        matriculeSalarie: matricule,
        identifiantEmploi: 1,
        periode: toIsoDate(period),
        indicePeriode: 0,
      },
    });
    return true;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return corsResponse(req);

  const auth = await verifyAuth(req);
  if (!auth.ok) return unauthorizedResponse(cors);

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

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
    const logId = logRow?.id;

    // PHASE 1 : Lister dossiers + effectif mois M (rapide)
    const dossierData = await silaePost("/v1/InfosTechniquesDossiers/ListeDossiers", {
      typeDossiers: 0, etatDossier: 2,
    });
    const allDossiers: { numero: string; raisonSociale: string; siret: string }[] =
      dossierData.listeDossiers ?? [];

    // Fetch effectif M pour tous les dossiers (batch 10)
    const dossierSalaries: Map<string, SalaryEntry[]> = new Map();
    const BATCH_SAL = 10;
    for (let i = 0; i < allDossiers.length; i += BATCH_SAL) {
      const batch = allDossiers.slice(i, i + BATCH_SAL);
      const results = await Promise.all(
        batch.map(async (d) => ({
          numero: d.numero,
          salaries: await fetchSalaries(d.numero, period),
        }))
      );
      for (const r of results) {
        if (r.salaries.length > 0) dossierSalaries.set(r.numero, r.salaries);
      }
    }

    // Upsert tous les dossiers (effectif)
    for (const d of allDossiers) {
      const eff = dossierSalaries.get(d.numero)?.length ?? 0;
      await sb.from("dossiers").upsert({
        id: `dos_${d.numero}`,
        numero: d.numero,
        nom: d.raisonSociale.trim(),
        siret: d.siret,
        effectif: eff,
        synced_from_silae: true,
        last_silae_sync: new Date().toISOString(),
      }, { onConflict: "numero", ignoreDuplicates: false });
    }

    // PHASE 2 : Pour les dossiers avec effectif > 0 : entrees/sorties + BS calcules
    const activeDossiers = allDossiers.filter((d) => dossierSalaries.has(d.numero));
    let totalEntrees = 0;
    let totalSorties = 0;
    let totalBsCalcules = 0;

    const moisId = `sp_${period.replace("-", "_")}`;
    await sb.from("suivi_paie_mois").upsert({
      id: moisId, period, last_sync_at: new Date().toISOString(),
    }, { onConflict: "period" });

    // Traiter les dossiers actifs par batch de 3 (plus de detail par dossier)
    const BATCH_ACTIVE = 3;
    for (let i = 0; i < activeDossiers.length; i += BATCH_ACTIVE) {
      const batch = activeDossiers.slice(i, i + BATCH_ACTIVE);
      await Promise.all(
        batch.map(async (d) => {
          const salCurr = dossierSalaries.get(d.numero) ?? [];

          // Entrees/sorties : fetch M-1 et M+1
          const [salPrev, salNext] = await Promise.all([
            fetchSalaries(d.numero, pPrev),
            fetchSalaries(d.numero, pNext),
          ]);

          const matPrev = new Set(salPrev.map((s) => s.matriculeSalarie));
          const matCurr = new Set(salCurr.map((s) => s.matriculeSalarie));
          const matNext = new Set(salNext.map((s) => s.matriculeSalarie));

          const entrees = [...matCurr].filter((m) => !matPrev.has(m)).length;
          const sorties = [...matCurr].filter((m) => !matNext.has(m)).length;

          // BS calcules : check bulletin par salarie (batch 5)
          let bsCalcules = 0;
          for (let j = 0; j < salCurr.length; j += 5) {
            const salBatch = salCurr.slice(j, j + 5);
            const checks = await Promise.all(
              salBatch.map((s) => checkBulletinExists(d.numero, s.matriculeSalarie, period))
            );
            bsCalcules += checks.filter(Boolean).length;
          }

          totalEntrees += entrees;
          totalSorties += sorties;
          totalBsCalcules += bsCalcules;

          // Preserve manual fields
          const existing = await sb.from("suivi_paie_lines")
            .select("gp, date_reception, traitement_par, date_envoi_bulletins")
            .eq("mois_id", moisId).eq("numero_dossier", d.numero).maybeSingle();

          await sb.from("suivi_paie_lines").upsert({
            id: `spl_${period.replace("-", "_")}_${d.numero}`,
            mois_id: moisId,
            numero_dossier: d.numero,
            nom_dossier: d.raisonSociale.trim(),
            effectif: salCurr.length,
            bs_calcules: bsCalcules,
            entrees,
            sorties,
            synced_from_silae: true,
            last_silae_sync: new Date().toISOString(),
            gp: existing?.data?.gp ?? "",
            date_reception: existing?.data?.date_reception ?? "",
            traitement_par: existing?.data?.traitement_par ?? "",
            date_envoi_bulletins: existing?.data?.date_envoi_bulletins ?? "",
          }, { onConflict: "id" });

          // Snapshots
          if (salCurr.length > 0) {
            await sb.from("silae_salaries_snapshot").upsert(
              salCurr.map((s) => ({
                numero_dossier: d.numero,
                period,
                matricule: s.matriculeSalarie,
                nom_complet: s.nomAffiche,
              })),
              { onConflict: "numero_dossier,period,matricule" }
            );
          }
        })
      );
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
      effectif_total: [...dossierSalaries.values()].reduce((s, v) => s + v.length, 0),
      bs_calcules_total: totalBsCalcules,
      entrees_total: totalEntrees,
      sorties_total: totalSorties,
    }, cors);
  } catch (e) {
    console.error("[silae-sync]", e);
    return errorResponse("Erreur lors de la synchronisation Silae", cors);
  }
});
