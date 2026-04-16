import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { jsonResponse, errorResponse, sanitizeForLog } from "../_shared/validate.ts";

// Delai en jours avant relance (configurable)
const DELAI_RELANCE_JOURS = 3;
const MAX_OVERDUE_TASKS = 500;
const MAX_TASK_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2000;

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

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const MISSIVE_KEY = Deno.env.get("MISSIVE_API_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

  try {
    // 1. Find tasks untreated for more than N days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DELAI_RELANCE_JOURS);

    const { data: overdueTasks, error } = await sb
      .from("tasks")
      .select("id, title, assignee, dossier, created_at, status, priority")
      .in("status", ["todo", "progress"])
      .lt("created_at", cutoff.toISOString())
      .limit(MAX_OVERDUE_TASKS);

    if (error) {
      console.error("relance-auto query error:", error);
      return errorResponse("Erreur lors de la recherche des taches", cors, 500);
    }

    if (!overdueTasks || overdueTasks.length === 0) {
      return jsonResponse(
        { relances_sent: 0, message: "Aucune tache en retard" },
        cors,
      );
    }

    // 2. Group by assignee
    const byAssignee = new Map<string, typeof overdueTasks>();
    for (const t of overdueTasks) {
      const key = t.assignee || "non_assigne";
      if (!byAssignee.has(key)) byAssignee.set(key, []);
      byAssignee.get(key)!.push(t);
    }

    // 3. Build reminder tasks with secure random IDs
    const memberIds = [...byAssignee.keys()].filter((k) => k !== "non_assigne");

    const relanceTasks: Array<{
      id: string;
      title: string;
      priority: string;
      category: string;
      assignee: string;
      due: string;
      dossier: string;
      description: string;
      status: string;
      source: string;
      created_at: string;
    }> = [];

    for (const [assignee, tasks] of byAssignee) {
      if (assignee === "non_assigne") continue;

      const { data: member } = await sb
        .from("members")
        .select("firstname, lastname")
        .eq("id", assignee)
        .maybeSingle();

      const memberName = member
        ? sanitizeForLog(`${member.firstname} ${member.lastname}`, 100)
        : "Membre inconnu";

      const taskList = tasks
        .map(
          (t) =>
            `- ${sanitizeForLog(t.title, MAX_TASK_TITLE_LENGTH)} (${sanitizeForLog(t.priority, 20)})`,
        )
        .join("\n");

      const description =
        `Les taches suivantes sont non traitees depuis plus de ${DELAI_RELANCE_JOURS} jours:\n\n${taskList}`;

      relanceTasks.push({
        id: crypto.randomUUID(),
        title: sanitizeForLog(
          `RELANCE: ${tasks.length} tache(s) en retard pour ${memberName}`,
          MAX_TASK_TITLE_LENGTH,
        ),
        priority: "urgent",
        category: "admin",
        assignee: assignee,
        due: new Date().toISOString().split("T")[0],
        dossier: "",
        description: description.slice(0, MAX_DESCRIPTION_LENGTH),
        status: "todo",
        source: "silae",
        created_at: new Date().toISOString(),
      });

      // If Missive is configured, send email via Missive
      if (MISSIVE_KEY) {
        try {
          // Note: email sending via Missive requires the POST /drafts endpoint
          // Can be enabled when Missive API is configured
        } catch {
          // Silently ignore email errors
        }
      }
    }

    if (relanceTasks.length > 0) {
      const { error: upsertError } = await sb
        .from("tasks")
        .upsert(relanceTasks, { onConflict: "id", ignoreDuplicates: true });

      if (upsertError) {
        console.error("relance-auto upsert error:", upsertError);
        return errorResponse("Erreur lors de la creation des relances", cors, 500);
      }
    }

    return jsonResponse(
      {
        relances_sent: relanceTasks.length,
        overdue_tasks_total: overdueTasks.length,
        gp_concerned: byAssignee.size,
      },
      cors,
    );
  } catch (err) {
    console.error("relance-auto error:", err);
    return errorResponse("Erreur interne du service", cors, 500);
  }
});
