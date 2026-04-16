import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyClaudeToken, unauthorizedResponse } from "../_shared/auth.ts";
import { jsonResponse, errorResponse, sanitizeForLog, isValidPeriod } from "../_shared/validate.ts";

// --- Allowlists ---

const READ_TABLE_ALLOWLIST = new Set([
  "tasks",
  "dossiers",
  "members",
  "controls",
  "control_checks",
  "suivi_paie_mois",
  "suivi_paie_lines",
  "app_config",
  "silae_sync_log",
]);

const MAX_READ_ROWS = 1000;

const FIX_DATA_TABLES = new Set([
  "tasks",
  "dossiers",
  "members",
  "controls",
  "suivi_paie_lines",
  "app_config",
]);

// Per-table column whitelist for fix_data patches
const FIX_DATA_COLUMNS: Record<string, Set<string>> = {
  tasks: new Set([
    "title", "description", "status", "priority", "category",
    "assignee", "due", "dossier", "source",
  ]),
  dossiers: new Set([
    "nom", "responsable", "effectif", "convention",
    "date_radiation", "notes",
  ]),
  members: new Set([
    "name", "email", "role", "avatar", "phone",
  ]),
  controls: new Set([
    "status", "notes", "assigned_to", "due_date", "priority",
  ]),
  suivi_paie_lines: new Set([
    "gp", "date_reception", "traitement_par", "date_envoi_bulletins",
    "notes", "statut",
  ]),
  app_config: new Set([
    "value",
  ]),
};

const VALID_ACTIONS = new Set([
  "get_dashboard_summary",
  "create_tasks_batch",
  "fix_data",
  "trigger_silae_sync",
  "read_table",
]);

const MAX_BATCH_TASKS = 50;

const TASK_REQUIRED_FIELDS = ["title", "status", "priority", "category"];

const VALID_TASK_STATUSES = new Set(["todo", "in_progress", "done", "cancelled"]);
const VALID_TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

// --- Validation helpers ---

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateTask(task: unknown, index: number): string | null {
  if (typeof task !== "object" || task === null || Array.isArray(task)) {
    return `Tache ${index}: objet invalide`;
  }
  const t = task as Record<string, unknown>;

  for (const field of TASK_REQUIRED_FIELDS) {
    if (!isNonEmptyString(t[field])) {
      return `Tache ${index}: champ "${field}" requis (string non vide)`;
    }
  }

  if (!VALID_TASK_STATUSES.has(t.status as string)) {
    return `Tache ${index}: status invalide. Valeurs: ${[...VALID_TASK_STATUSES].join(", ")}`;
  }

  if (!VALID_TASK_PRIORITIES.has(t.priority as string)) {
    return `Tache ${index}: priority invalide. Valeurs: ${[...VALID_TASK_PRIORITIES].join(", ")}`;
  }

  return null;
}

function validatePatch(
  table: string,
  patch: unknown
): { valid: boolean; error?: string; sanitized?: Record<string, unknown> } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { valid: false, error: "patch doit etre un objet" };
  }

  const allowedCols = FIX_DATA_COLUMNS[table];
  if (!allowedCols) {
    return { valid: false, error: "Table non autorisee pour fix_data" };
  }

  const patchObj = patch as Record<string, unknown>;
  const keys = Object.keys(patchObj);

  if (keys.length === 0) {
    return { valid: false, error: "patch ne peut pas etre vide" };
  }

  const disallowed = keys.filter((k) => !allowedCols.has(k));
  if (disallowed.length > 0) {
    return {
      valid: false,
      error: `Colonnes non autorisees pour ${table}: ${disallowed.join(", ")}`,
    };
  }

  // Build sanitized patch with only allowed columns
  const sanitized: Record<string, unknown> = {};
  for (const k of keys) {
    sanitized[k] = patchObj[k];
  }

  return { valid: true, sanitized };
}

// --- Main ---

serve(async (req) => {
  const cors = getCorsHeaders(req);

  // Preflight
  if (req.method === "OPTIONS") {
    return corsResponse(req);
  }

  // Auth via Claude token
  if (!verifyClaudeToken(req)) {
    return unauthorizedResponse(cors);
  }

  // Supabase service client
  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SB_URL || !SB_KEY) {
    console.error("claude-webhook: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY non configure");
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

    const bodyObj = body as Record<string, unknown>;
    const { action } = bodyObj;

    // Validate action
    if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
      return errorResponse("Action non reconnue", cors, 400);
    }

    // ========================================
    // get_dashboard_summary
    // ========================================
    if (action === "get_dashboard_summary") {
      const [tasks, dossiers, controls] = await Promise.all([
        sb.from("tasks").select("status", { count: "exact" }),
        sb.from("dossiers").select("id", { count: "exact" }),
        sb.from("controls").select("status", { count: "exact" }).eq("status", "pending"),
      ]);
      return jsonResponse(
        {
          tasks_total: tasks.count ?? 0,
          dossiers_total: dossiers.count ?? 0,
          controls_pending: controls.count ?? 0,
        },
        cors
      );
    }

    // ========================================
    // create_tasks_batch
    // ========================================
    if (action === "create_tasks_batch") {
      const tasks = bodyObj.tasks;

      // Must be an array
      if (!Array.isArray(tasks)) {
        return errorResponse("tasks doit etre un tableau", cors, 400);
      }

      // Max batch size
      if (tasks.length === 0) {
        return errorResponse("tasks ne peut pas etre vide", cors, 400);
      }
      if (tasks.length > MAX_BATCH_TASKS) {
        return errorResponse(`Maximum ${MAX_BATCH_TASKS} taches par batch`, cors, 400);
      }

      // Validate each task
      for (let i = 0; i < tasks.length; i++) {
        const err = validateTask(tasks[i], i);
        if (err) {
          return errorResponse(err, cors, 400);
        }
      }

      // Assign IDs to tasks that don't have one
      const tasksWithIds = tasks.map((t: Record<string, unknown>) => ({
        ...t,
        id: isNonEmptyString(t.id) ? t.id : crypto.randomUUID(),
        created_at: t.created_at ?? new Date().toISOString(),
      }));

      const { error } = await sb.from("tasks").insert(tasksWithIds);
      if (error) {
        console.error("claude-webhook: create_tasks_batch insert error", error);
        return errorResponse("Erreur lors de la creation des taches", cors, 500);
      }

      return jsonResponse({ created: tasksWithIds.length }, cors);
    }

    // ========================================
    // fix_data
    // ========================================
    if (action === "fix_data") {
      const { table, id, patch } = bodyObj as {
        table?: unknown;
        id?: unknown;
        patch?: unknown;
        action: string;
      };

      // Validate table
      if (typeof table !== "string" || !FIX_DATA_TABLES.has(table)) {
        return errorResponse(
          `Table non autorisee. Valeurs: ${[...FIX_DATA_TABLES].join(", ")}`,
          cors,
          400
        );
      }

      // Validate id
      if (!isNonEmptyString(id)) {
        return errorResponse("id (string) requis", cors, 400);
      }

      // Validate and sanitize patch columns
      const patchResult = validatePatch(table, patch);
      if (!patchResult.valid) {
        return errorResponse(patchResult.error!, cors, 400);
      }

      const { error } = await sb.from(table).update(patchResult.sanitized!).eq("id", id);
      if (error) {
        console.error(`claude-webhook: fix_data error table=${sanitizeForLog(table)} id=${sanitizeForLog(id as string)}`, error);
        return errorResponse("Erreur lors de la mise a jour", cors, 500);
      }

      return jsonResponse({ patched: true, table, id }, cors);
    }

    // ========================================
    // trigger_silae_sync
    // ========================================
    if (action === "trigger_silae_sync") {
      const period = bodyObj.period;

      // Validate period
      if (typeof period !== "string" || !isValidPeriod(period)) {
        return errorResponse("period requis au format YYYY-MM (ex: 2026-03)", cors, 400);
      }

      const res = await fetch(`${SB_URL}/functions/v1/silae-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({ period }),
      });

      if (!res.ok) {
        console.error(`claude-webhook: trigger_silae_sync error status=${res.status}`);
        return errorResponse("Erreur lors du declenchement de la synchronisation", cors, 502);
      }

      const data = await res.json();
      return jsonResponse(data, cors);
    }

    // ========================================
    // read_table
    // ========================================
    if (action === "read_table") {
      const { table, filters, limit } = bodyObj as {
        table?: unknown;
        filters?: unknown;
        limit?: unknown;
        action: string;
      };

      // Validate table against allowlist
      if (typeof table !== "string" || !READ_TABLE_ALLOWLIST.has(table)) {
        return errorResponse(
          `Table non autorisee. Valeurs: ${[...READ_TABLE_ALLOWLIST].join(", ")}`,
          cors,
          400
        );
      }

      // Validate and cap limit
      let rowLimit = MAX_READ_ROWS;
      if (limit !== undefined) {
        if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
          return errorResponse(`limit doit etre un entier positif (max ${MAX_READ_ROWS})`, cors, 400);
        }
        rowLimit = Math.min(limit, MAX_READ_ROWS);
      }

      // Build query
      let query = sb.from(table).select("*");

      // Validate and apply filters
      if (filters !== undefined) {
        if (typeof filters !== "object" || filters === null || Array.isArray(filters)) {
          return errorResponse("filters doit etre un objet {colonne: valeur}", cors, 400);
        }
        const filtersObj = filters as Record<string, unknown>;
        for (const [col, val] of Object.entries(filtersObj)) {
          // Basic column name validation (alphanumeric + underscore only)
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
            return errorResponse(`Nom de colonne invalide: ${sanitizeForLog(col)}`, cors, 400);
          }
          // Only allow primitive filter values
          if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean" && val !== null) {
            return errorResponse(`Valeur de filtre invalide pour ${sanitizeForLog(col)}`, cors, 400);
          }
          query = query.eq(col, val);
        }
      }

      query = query.limit(rowLimit);

      const { data, error } = await query;
      if (error) {
        console.error(`claude-webhook: read_table error table=${sanitizeForLog(table)}`, error);
        return errorResponse("Erreur lors de la lecture", cors, 500);
      }

      return jsonResponse({ rows: data }, cors);
    }

    // Should not be reached due to action validation above
    return errorResponse("Action non reconnue", cors, 400);
  } catch (err) {
    console.error("claude-webhook: erreur interne", err);
    return errorResponse("Erreur interne du serveur", cors, 500);
  }
});
