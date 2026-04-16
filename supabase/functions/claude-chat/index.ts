import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { jsonResponse, errorResponse, sanitizeForLog } from "../_shared/validate.ts";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 1000;
const MAX_DB_FIELD_LENGTH = 500;

/** Strip HTML tags and limit length for data injected into the prompt */
function sanitizeDbField(value: unknown, maxLen = MAX_DB_FIELD_LENGTH): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'&]/g, "")
    .slice(0, maxLen);
}

/** Sanitize an array of DB rows, keeping only allowed keys */
function sanitizeRows(
  rows: Record<string, unknown>[] | null,
  allowedKeys: string[],
  maxRows: number,
): Record<string, string>[] {
  if (!rows) return [];
  return rows.slice(0, maxRows).map((row) => {
    const clean: Record<string, string> = {};
    for (const key of allowedKeys) {
      if (key in row) {
        clean[key] = sanitizeDbField(row[key]);
      }
    }
    return clean;
  });
}

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

  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!ANTHROPIC_KEY) {
    return errorResponse("Configuration serveur incomplete", cors, 500);
  }

  const sb = createClient(SB_URL, SB_KEY);

  try {
    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Corps de requete JSON invalide", cors, 400);
    }

    const { message, context } = body as { message?: unknown; context?: unknown };

    if (!message || typeof message !== "string") {
      return errorResponse("Le champ 'message' est requis et doit etre une chaine", cors, 400);
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return errorResponse(
        `Le message ne peut pas depasser ${MAX_MESSAGE_LENGTH} caracteres`,
        cors,
        400,
      );
    }

    const sanitizedContext =
      context && typeof context === "string"
        ? sanitizeForLog(context, MAX_CONTEXT_LENGTH)
        : "";

    // Fetch business context from DB
    const [tasksRes, dossiersRes, controlsRes] = await Promise.all([
      sb
        .from("tasks")
        .select("id, title, status, priority, dossier, assignee")
        .in("status", ["todo", "progress"])
        .limit(50),
      sb
        .from("dossiers")
        .select("id, numero, nom, responsable, effectif")
        .limit(200),
      sb
        .from("controls")
        .select("id, dossier_name, period, status")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Sanitize all DB data before injecting into prompt
    const cleanDossiers = sanitizeRows(
      dossiersRes.data,
      ["id", "numero", "nom", "responsable", "effectif"],
      30,
    );
    const cleanTasks = sanitizeRows(
      tasksRes.data,
      ["id", "title", "status", "priority", "dossier", "assignee"],
      20,
    );
    const cleanControls = sanitizeRows(
      controlsRes.data,
      ["id", "dossier_name", "period", "status"],
      10,
    );

    const systemPrompt = `Tu es l'assistant IA de Bright Social Hub, l'application de gestion sociale du cabinet Bright Conseil.
Tu aides les gestionnaires de paie a analyser les dossiers, detecter des anomalies et repondre a leurs questions.

Contexte metier disponible:
- ${dossiersRes.data?.length ?? 0} dossiers en portefeuille
- ${tasksRes.data?.length ?? 0} taches actives (todo/en cours)
- ${controlsRes.data?.length ?? 0} controles recents

Dossiers: ${JSON.stringify(cleanDossiers)}
Taches actives: ${JSON.stringify(cleanTasks)}
Controles recents: ${JSON.stringify(cleanControls)}

${sanitizedContext ? `Contexte additionnel fourni par l'utilisateur: ${sanitizedContext}` : ""}

Tu peux:
- Analyser les donnees des dossiers
- Proposer des pistes d'analyse pour les ecarts
- Suggerer des controles a lancer
- Croiser les informations disponibles
Reponds en francais, de facon concise et actionnable.`;

    // Call LLM API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: message }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Never leak API details to the client
      console.error(`LLM API error: status=${response.status}`);
      return errorResponse("Erreur lors de la generation de la reponse", cors, 502);
    }

    const result = await response.json();
    const reply = result.content?.[0]?.text ?? "Pas de reponse";

    return jsonResponse({ reply }, cors);
  } catch (err) {
    // Never expose internal error details
    console.error("claude-chat error:", err);
    return errorResponse("Erreur interne du service", cors, 500);
  }
});
