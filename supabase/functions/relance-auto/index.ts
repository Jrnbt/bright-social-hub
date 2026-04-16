import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Delai en jours avant relance (configurable)
const DELAI_RELANCE_JOURS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const MISSIVE_KEY = Deno.env.get("MISSIVE_API_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

  try {
    // 1. Trouver les taches non traitees depuis plus de N jours
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DELAI_RELANCE_JOURS);

    const { data: overdueTasks, error } = await sb
      .from("tasks")
      .select("id, title, assignee, dossier, created_at, status, priority")
      .in("status", ["todo", "progress"])
      .lt("created_at", cutoff.toISOString());

    if (error) throw error;
    if (!overdueTasks || overdueTasks.length === 0) {
      return json({ relances_sent: 0, message: "Aucune tache en retard" });
    }

    // 2. Regrouper par assignee (GP)
    const byAssignee = new Map<string, typeof overdueTasks>();
    for (const t of overdueTasks) {
      const key = t.assignee || "non_assigne";
      if (!byAssignee.has(key)) byAssignee.set(key, []);
      byAssignee.get(key)!.push(t);
    }

    // 3. Recuperer les emails des membres
    const memberIds = [...byAssignee.keys()].filter((k) => k !== "non_assigne");
    // Note: les membres n'ont pas d'email en base actuellement.
    // On cree une tache de relance interne a la place.
    const relanceTasks: any[] = [];

    for (const [assignee, tasks] of byAssignee) {
      if (assignee === "non_assigne") continue;

      const { data: member } = await sb
        .from("members")
        .select("firstname, lastname")
        .eq("id", assignee)
        .maybeSingle();

      const memberName = member
        ? `${member.firstname} ${member.lastname}`
        : "Membre inconnu";

      const taskList = tasks
        .map((t) => `- ${t.title} (${t.priority})`)
        .join("\n");

      relanceTasks.push({
        id: `task_relance_${Date.now()}_${assignee}`,
        title: `RELANCE: ${tasks.length} tache(s) en retard pour ${memberName}`,
        priority: "urgent",
        category: "admin",
        assignee: assignee,
        due: new Date().toISOString().split("T")[0],
        dossier: "",
        description: `Les taches suivantes sont non traitees depuis plus de ${DELAI_RELANCE_JOURS} jours:\n\n${taskList}`,
        status: "todo",
        source: "silae",
        created_at: new Date().toISOString(),
      });

      // Si Missive est configuree, envoyer un email via Missive
      if (MISSIVE_KEY) {
        try {
          // Note: l'envoi d'email via Missive necessite l'endpoint POST /drafts
          // On pourra l'activer quand l'API Missive sera configuree
        } catch {
          // Silently ignore email errors
        }
      }
    }

    if (relanceTasks.length > 0) {
      await sb.from("tasks").upsert(relanceTasks, { onConflict: "id", ignoreDuplicates: true });
    }

    return json({
      relances_sent: relanceTasks.length,
      overdue_tasks_total: overdueTasks.length,
      gp_concerned: byAssignee.size,
    });
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
