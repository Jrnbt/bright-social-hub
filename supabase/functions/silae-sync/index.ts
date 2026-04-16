import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { isValidPeriod, jsonResponse, errorResponse, sanitizeForLog } from "../_shared/validate.ts";

interface SalaryEntry {
  matriculeSalarie: string;
  nomAffiche: string;
}

// --- Silae API direct call ---

async function silaeCall(action: string, params: Record<string, unknown>): Promise<unknown> {
  const SILAE_URL = Deno.env.get("SILAE_API_URL") ?? "";
  const SILAE_TOKEN = Deno.env.get("SILAE_API_TOKEN") ?? "";

  const endpoints: Record<string, string> = {
    lister_dossiers: "/api/v1/Dossiers/ListerDossiers",
    lister_salaries: "/api/v1/Salaries/ListerSalariesInformations",
  };

  const endpoint = endpoints[action];
  if (!endpoint) {
    throw new Error(`silaeCall: action inconnue: ${action}`);
  }

  const res = await fetch(`${SILAE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SILAE_TOKEN}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Silae API error: status ${res.status}`);
  }

  return res.json();
}

// --- Period helpers ---

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

// --- Salary fetch (reusable, no duplication) ---

async function fetchSalaries(numero: string, period: string): Promise<SalaryEntry[]> {
  const data = (await silaeCall("lister_salaries", {
    numeroDossier: numero,
    dateReference: toIsoDate(period),
  })) as { listeSalariesInformations?: SalaryEntry[] };
  return data.listeSalariesInformations ?? [];
}

// --- Main ---

serve(async (req) => {
  const cors = getCorsHeaders(req);

  // Preflight
  if (req.method === "OPTIONS") {
    return corsResponse(req);
  }

  // Auth
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return unauthorizedResponse(cors);
  }

  // Supabase service client
  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SB_URL || !SB_KEY) {
    console.error("silae-sync: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY non configure");
    return errorResponse("Configuration serveur manquante", cors, 500);
  }
  const sb = createClient(SB_URL, SB_KEY);

  try {
    // Parse body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Corps de requete JSON invalide", cors, 400);
    }

    const { period } = body as { period?: unknown };

    // Validate period
    if (typeof period !== "string" || !isValidPeriod(period)) {
      return errorResponse("period requis au format YYYY-MM (ex: 2026-03)", cors, 400);
    }

    // Check Silae config
    const SILAE_URL = Deno.env.get("SILAE_API_URL") ?? "";
    const SILAE_TOKEN = Deno.env.get("SILAE_API_TOKEN") ?? "";
    if (!SILAE_URL || !SILAE_TOKEN) {
      console.error("silae-sync: SILAE_API_URL ou SILAE_API_TOKEN non configure");
      return errorResponse("Configuration serveur manquante", cors, 500);
    }

    const pPrev = prevPeriod(period);
    const pNext = nextPeriod(period);

    // Log start
    const logId = crypto.randomUUID();
    await sb.from("silae_sync_log").insert({
      id: logId,
      period,
      status: "running",
    });

    // 1. List all production dossiers
    const dossierData = (await silaeCall("lister_dossiers", { etatDossier: 2 })) as {
      listeDossiers?: { numero: string; raisonSociale: string; siret: string }[];
    };
    const dossiers = dossierData.listeDossiers ?? [];

    // 2. For each dossier, fetch M-1, M, M+1 (batched by 10)
    let totalEntrees = 0;
    let totalSorties = 0;
    const lines: {
      numero: string;
      nom: string;
      siret: string;
      bulletins: number;
      entrees: number;
      sorties: number;
      salCurr: SalaryEntry[];
    }[] = [];

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

          // Entrees = in M, absent from M-1
          const entrees = [...matCurr].filter((m) => !matPrev.has(m)).length;
          // Sorties = in M, absent from M+1
          const sorties = [...matCurr].filter((m) => !matNext.has(m)).length;

          return {
            numero: d.numero,
            nom: d.raisonSociale.trim(),
            siret: d.siret,
            bulletins: salCurr.length,
            entrees,
            sorties,
            salCurr, // keep reference to avoid double fetch
          };
        })
      );

      for (const r of results) {
        totalEntrees += r.entrees;
        totalSorties += r.sorties;

        // Upsert dossier
        await sb.from("dossiers").upsert(
          {
            id: `dos_silae_${r.numero}`,
            numero: r.numero,
            nom: r.nom,
            siret: r.siret,
            effectif: r.bulletins,
            synced_from_silae: true,
            last_silae_sync: new Date().toISOString(),
          },
          { onConflict: "numero", ignoreDuplicates: false }
        );

        if (r.bulletins > 0 || r.entrees > 0 || r.sorties > 0) {
          lines.push(r);
        }

        // Snapshot salaries for history — reuse salCurr from above (NO second fetch)
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

    // 3. Upsert suivi_paie_mois + lines
    const moisId = `sp_${period.replace("-", "_")}`;
    await sb.from("suivi_paie_mois").upsert(
      {
        id: moisId,
        period,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "period" }
    );

    for (const l of lines) {
      // Preserve manual fields via selective read
      const existing = await sb
        .from("suivi_paie_lines")
        .select("gp, date_reception, traitement_par, date_envoi_bulletins")
        .eq("mois_id", moisId)
        .eq("numero_dossier", l.numero)
        .maybeSingle();

      await sb.from("suivi_paie_lines").upsert(
        {
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
        },
        { onConflict: "id" }
      );
    }

    // 4. Auto-generate tasks for detected anomalies
    const autoTasks: Record<string, unknown>[] = [];
    for (const l of lines) {
      // Find dossier and its responsible GP
      const { data: dosRow } = await sb
        .from("dossiers")
        .select("id, responsable")
        .eq("numero", l.numero)
        .maybeSingle();
      const dosId = dosRow?.id ?? `dos_silae_${l.numero}`;
      const gpId = dosRow?.responsable ?? null;

      // Anomaly: entries detected -> verification task
      if (l.entrees > 0) {
        autoTasks.push({
          id: crypto.randomUUID(),
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

      // Anomaly: exits detected -> verification task
      if (l.sorties > 0) {
        autoTasks.push({
          id: crypto.randomUUID(),
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

      // Anomaly: 0 bulletins on active dossier -> verification
      if (l.bulletins === 0) {
        autoTasks.push({
          id: crypto.randomUUID(),
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

    // Upsert tasks
    if (autoTasks.length > 0) {
      await sb.from("tasks").upsert(autoTasks, { onConflict: "id", ignoreDuplicates: true });
    }

    // 5. Log finish
    await sb.from("silae_sync_log").update({
      status: "ok",
      finished_at: new Date().toISOString(),
      dossiers_synced: dossiers.length,
      entrees_detected: totalEntrees,
      sorties_detected: totalSorties,
    }).eq("id", logId);

    return jsonResponse(
      {
        status: "ok",
        period,
        dossiers_synced: dossiers.length,
        lines_with_data: lines.length,
        entrees_total: totalEntrees,
        sorties_total: totalSorties,
        auto_tasks_created: autoTasks.length,
      },
      cors
    );
  } catch (err) {
    console.error("silae-sync: erreur interne", err);
    return errorResponse("Erreur interne du serveur", cors, 500);
  }
});
