import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-claude-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // Auth via token secret
  const token = req.headers.get("x-claude-token");
  const expected = Deno.env.get("CLAUDE_WEBHOOK_TOKEN") ?? "";
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "Non autorise" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

  try {
    const body = await req.json();
    const { action } = body;

    // --- Dashboard summary ---
    if (action === "get_dashboard_summary") {
      const [tasks, dossiers, controls] = await Promise.all([
        sb.from("tasks").select("status", { count: "exact" }),
        sb.from("dossiers").select("id", { count: "exact" }),
        sb.from("controls").select("status", { count: "exact" }).eq("status", "pending"),
      ]);
      return json({
        tasks_total: tasks.count ?? 0,
        dossiers_total: dossiers.count ?? 0,
        controls_pending: controls.count ?? 0,
      });
    }

    // --- Create tasks in batch ---
    if (action === "create_tasks_batch") {
      const { data, error } = await sb.from("tasks").insert(body.tasks);
      if (error) throw error;
      return json({ created: body.tasks.length });
    }

    // --- Fix / patch any table ---
    if (action === "fix_data") {
      const { table, id, patch } = body;
      const allowed = ["tasks", "dossiers", "members", "controls", "suivi_paie_lines", "app_config"];
      if (!allowed.includes(table)) throw new Error(`Table non autorisee: ${table}`);
      const { error } = await sb.from(table).update(patch).eq("id", id);
      if (error) throw error;
      return json({ patched: true, table, id });
    }

    // --- Trigger silae sync ---
    if (action === "trigger_silae_sync") {
      const res = await fetch(`${SB_URL}/functions/v1/silae-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({ period: body.period }),
      });
      const data = await res.json();
      return json(data);
    }

    // --- Read any table ---
    if (action === "read_table") {
      const { table, filters, limit } = body;
      let query = sb.from(table).select("*");
      if (filters) {
        for (const [col, val] of Object.entries(filters)) {
          query = query.eq(col, val);
        }
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return json({ rows: data });
    }

    return json({ error: `Action inconnue: ${action}` }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
