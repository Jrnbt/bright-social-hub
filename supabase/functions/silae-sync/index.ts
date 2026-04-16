import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SalaryEntry { matriculeSalarie: string; nomAffiche: string }

// Appel Silae via silae-proxy interne
async function silaeCall(action: string, params: Record<string, any>): Promise<any> {
  const SILAE_URL = Deno.env.get("SILAE_API_URL") ?? "";
  const SILAE_TOKEN = Deno.env.get("SILAE_API_TOKEN") ?? "";

  const endpoints: Record<string, string> = {
    lister_dossiers: "/api/v1/Dossiers/ListerDossiers",
    lister_salaries: "/api/v1/Salaries/ListerSalariesInformations",
  };

  const res = await fetch(`${SILAE_URL}${endpoints[action]}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SILAE_TOKEN}`,
    },
    body: JSON.stringify(params),
  });
  return res.json();
}

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
  const data = await silaeCall("lister_salaries", {
    numeroDossier: numero,
    dateReference: toIsoDate(period),
  });
  return data.listeSalariesInformations ?? [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

  try {
    const { period } = await req.json();
    if (!period) throw new Error("period requis (ex: 2026-03)");

    const pPrev = prevPeriod(period);
    const pNext = nextPeriod(period);

    // Log debut
    const { data: logRow } = await sb.from("silae_sync_log").insert({
      period, status: "running",
    }).select().single();
    const logId = logRow?.id;

    // 1. Lister tous les dossiers en production
    const dossierData = await silaeCall("lister_dossiers", { etatDossier: 2 });
    const dossiers: { numero: string; raisonSociale: string; siret: string }[] =
      dossierData.listeDossiers ?? [];

    // 2. Pour chaque dossier, fetch M-1, M, M+1 (par batch de 10)
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

          // Entrees = dans M, absent de M-1
          const entrees = [...matCurr].filter((m) => !matPrev.has(m)).length;
          // Sorties = dans M, absent de M+1
          const sorties = [...matCurr].filter((m) => !matNext.has(m)).length;

          return {
            numero: d.numero,
            nom: d.raisonSociale.trim(),
            siret: d.siret,
            bulletins: salCurr.length,
            entrees,
            sorties,
          };
        })
      );

      for (const r of results) {
        totalEntrees += r.entrees;
        totalSorties += r.sorties;

        // Upsert dossier
        await sb.from("dossiers").upsert({
          id: `dos_silae_${r.numero}`,
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

        // Snapshots salaries pour historique
        const salCurr = await fetchSalaries(r.numero, period);
        if (salCurr.length > 0) {
          await sb.from("silae_salaries_snapshot").upsert(
            salCurr.map((s) => ({
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

    // 3. Upsert suivi_paie_mois + lines
    const moisId = `sp_${period.replace("-", "_")}`;
    await sb.from("suivi_paie_mois").upsert({
      id: moisId,
      period,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: "period" });

    for (const l of lines) {
      // Preserve manual fields via selective update
      const existing = await sb.from("suivi_paie_lines")
        .select("gp, date_reception, traitement_par, date_envoi_bulletins")
        .eq("mois_id", moisId)
        .eq("numero_dossier", l.numero)
        .maybeSingle();

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
        // Preserve manual fields
        gp: existing?.data?.gp ?? "",
        date_reception: existing?.data?.date_reception ?? "",
        traitement_par: existing?.data?.traitement_par ?? "",
        date_envoi_bulletins: existing?.data?.date_envoi_bulletins ?? "",
      }, { onConflict: "id" });
    }

    // 4. Auto-generation de taches pour anomalies detectees
    const autoTasks: any[] = [];
    for (const l of lines) {
      // Trouver le dossier et son GP responsable
      const { data: dosRow } = await sb.from("dossiers")
        .select("id, responsable")
        .eq("numero", l.numero)
        .maybeSingle();
      const dosId = dosRow?.id ?? `dos_silae_${l.numero}`;
      const gpId = dosRow?.responsable ?? null;

      // Anomalie: entrees detectees -> tache de verification
      if (l.entrees > 0) {
        autoTasks.push({
          id: `task_auto_ent_${period.replace("-","_")}_${l.numero}`,
          title: `Verifier ${l.entrees} entree(s) — ${l.nom} (${period})`,
          priority: "high",
          category: "paie",
          assignee: gpId,
          due: "",
          dossier: dosId,
          description: `${l.entrees} nouveau(x) salarie(s) detecte(s) en ${period}. Verifier les elements de paie.`,
          status: "todo",
          source: "silae",
          created_at: new Date().toISOString(),
        });
      }

      // Anomalie: sorties detectees -> tache de verification
      if (l.sorties > 0) {
        autoTasks.push({
          id: `task_auto_sor_${period.replace("-","_")}_${l.numero}`,
          title: `Verifier ${l.sorties} sortie(s) — ${l.nom} (${period})`,
          priority: "high",
          category: "paie",
          assignee: gpId,
          due: "",
          dossier: dosId,
          description: `${l.sorties} depart(s) detecte(s) en ${period}. Verifier STC et solde de tout compte.`,
          status: "todo",
          source: "silae",
          created_at: new Date().toISOString(),
        });
      }

      // Anomalie: 0 bulletins alors que dossier actif -> verification
      if (l.bulletins === 0) {
        autoTasks.push({
          id: `task_auto_nob_${period.replace("-","_")}_${l.numero}`,
          title: `Aucun bulletin detecte — ${l.nom} (${period})`,
          priority: "urgent",
          category: "paie",
          assignee: gpId,
          due: "",
          dossier: dosId,
          description: `Le dossier ${l.nom} n'a aucun bulletin en ${period}. Verifier si c'est normal.`,
          status: "todo",
          source: "silae",
          created_at: new Date().toISOString(),
        });
      }
    }

    // Upsert tasks (evite les doublons grace a l'id deterministe)
    if (autoTasks.length > 0) {
      await sb.from("tasks").upsert(autoTasks, { onConflict: "id", ignoreDuplicates: true });
    }

    // 5. Log fin
    if (logId) {
      await sb.from("silae_sync_log").update({
        status: "ok",
        finished_at: new Date().toISOString(),
        dossiers_synced: dossiers.length,
        entrees_detected: totalEntrees,
        sorties_detected: totalSorties,
      }).eq("id", logId);
    }

    return new Response(JSON.stringify({
      status: "ok",
      period,
      dossiers_synced: dossiers.length,
      lines_with_data: lines.length,
      entrees_total: totalEntrees,
      sorties_total: totalSorties,
      auto_tasks_created: autoTasks.length,
    }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
