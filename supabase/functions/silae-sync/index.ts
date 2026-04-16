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
  const data = await silaePost("/v1/InfosSalaries/ListeSalaries", {
    numeroDossier: numero,
    listeSalariesOptions: { optionActifALaDate: toIsoDate(period) },
  });
  return data.listeSalariesInformations ?? [];
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

    // 1. Lister dossiers en production
    const dossierData = await silaePost("/v1/InfosTechniquesDossiers/ListeDossiers", {
      typeDossiers: 0, etatDossier: 2,
    });
    const dossiers: { numero: string; raisonSociale: string; siret: string }[] =
      dossierData.listeDossiers ?? [];

    // 2. Pour chaque dossier: fetch M-1, M, M+1
    let totalEntrees = 0;
    let totalSorties = 0;
    const lines: any[] = [];

    const BATCH = 10;
    for (let i = 0; i < dossiers.length; i += BATCH) {
      const batch = dossiers.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (d) => {
          const [salPrev, salCurr, salNext] = await Promise.all([
            fetchSalaries(d.numero, pPrev),
            fetchSalaries(d.numero, period),
            fetchSalaries(d.numero, pNext),
          ]);

          const matPrev = new Set(salPrev.map((s) => s.matriculeSalarie));
          const matCurr = new Set(salCurr.map((s) => s.matriculeSalarie));
          const matNext = new Set(salNext.map((s) => s.matriculeSalarie));

          const entrees = [...matCurr].filter((m) => !matPrev.has(m)).length;
          const sorties = [...matCurr].filter((m) => !matNext.has(m)).length;

          return {
            numero: d.numero,
            nom: d.raisonSociale.trim(),
            siret: d.siret,
            bulletins: salCurr.length,
            entrees,
            sorties,
            salCurr,
          };
        })
      );

      for (const r of results) {
        totalEntrees += r.entrees;
        totalSorties += r.sorties;

        // Upsert dossier
        await sb.from("dossiers").upsert({
          id: `dos_${r.numero}`,
          numero: r.numero,
          nom: r.nom,
          siret: r.siret,
          effectif: r.bulletins,
          synced_from_silae: true,
          last_silae_sync: new Date().toISOString(),
        }, { onConflict: "numero", ignoreDuplicates: false });

        if (r.bulletins > 0 || r.entrees > 0 || r.sorties > 0) {
          lines.push(r);
        }

        // Snapshots (reutilise salCurr, pas de double fetch)
        if (r.salCurr.length > 0) {
          await sb.from("silae_salaries_snapshot").upsert(
            r.salCurr.map((s) => ({
              numero_dossier: r.numero,
              period,
              matricule: s.matriculeSalarie,
              nom_complet: s.nomAffiche,
            })),
            { onConflict: "numero_dossier,period,matricule" }
          );
        }
      }
    }

    // 3. Upsert suivi paie
    const moisId = `sp_${period.replace("-", "_")}`;
    await sb.from("suivi_paie_mois").upsert({
      id: moisId, period, last_sync_at: new Date().toISOString(),
    }, { onConflict: "period" });

    for (const l of lines) {
      const existing = await sb.from("suivi_paie_lines")
        .select("gp, date_reception, traitement_par, date_envoi_bulletins")
        .eq("mois_id", moisId).eq("numero_dossier", l.numero).maybeSingle();

      await sb.from("suivi_paie_lines").upsert({
        id: `spl_${period.replace("-", "_")}_${l.numero}`,
        mois_id: moisId,
        numero_dossier: l.numero,
        nom_dossier: l.nom,
        nombre_bulletins: l.bulletins,
        entrees: l.entrees,
        sorties: l.sorties,
        synced_from_silae: true,
        last_silae_sync: new Date().toISOString(),
        gp: existing?.data?.gp ?? "",
        date_reception: existing?.data?.date_reception ?? "",
        traitement_par: existing?.data?.traitement_par ?? "",
        date_envoi_bulletins: existing?.data?.date_envoi_bulletins ?? "",
      }, { onConflict: "id" });
    }

    // 4. Log fin
    if (logId) {
      await sb.from("silae_sync_log").update({
        status: "ok",
        finished_at: new Date().toISOString(),
        dossiers_synced: dossiers.length,
        entrees_detected: totalEntrees,
        sorties_detected: totalSorties,
      }).eq("id", logId);
    }

    return jsonResponse({
      status: "ok", period,
      dossiers_synced: dossiers.length,
      lines_with_data: lines.length,
      entrees_total: totalEntrees,
      sorties_total: totalSorties,
    }, cors);
  } catch (e) {
    console.error("[silae-sync]", e);
    return errorResponse("Erreur lors de la synchronisation Silae", cors);
  }
});
