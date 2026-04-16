import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { jsonResponse, errorResponse } from "../_shared/validate.ts";

const BASE = "https://mail.missiveapp.com/v1";

const VALID_BOXES = new Set(["inbox", "team_inbox", "all", "assigned"]);

const VALID_ACTIONS = new Set(["test_connection", "conversations"]);

function isPositiveInt(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
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

  try {
    // Parse body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Corps de requete JSON invalide", cors, 400);
    }

    const { action, params } = body as { action?: unknown; params?: unknown };

    // Validate action
    if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
      return errorResponse("Action non reconnue", cors, 400);
    }

    // Missive API key
    const MISSIVE_KEY = Deno.env.get("MISSIVE_API_KEY") ?? "";
    if (!MISSIVE_KEY) {
      console.error("missive-proxy: MISSIVE_API_KEY non configuree");
      return errorResponse("Configuration serveur manquante", cors, 500);
    }

    const missiveHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISSIVE_KEY}`,
    };

    // --- test_connection ---
    if (action === "test_connection") {
      const res = await fetch(`${BASE}/organizations`, { headers: missiveHeaders });
      return jsonResponse({ ok: res.ok }, cors);
    }

    // --- conversations ---
    if (action === "conversations") {
      const p = (params ?? {}) as Record<string, unknown>;

      // Validate box
      const box = p.box ?? "inbox";
      if (typeof box !== "string" || !VALID_BOXES.has(box)) {
        return errorResponse(
          `box invalide. Valeurs autorisees: ${[...VALID_BOXES].join(", ")}`,
          cors,
          400
        );
      }

      // Validate limit
      const limit = p.limit ?? 25;
      if (!isPositiveInt(limit, 1, 100)) {
        return errorResponse("limit doit etre un entier entre 1 et 100", cors, 400);
      }

      const url = `${BASE}/conversations?mailbox=${encodeURIComponent(box)}&limit=${limit}`;
      const res = await fetch(url, { headers: missiveHeaders });

      if (!res.ok) {
        console.error(`missive-proxy: Missive API error status=${res.status}`);
        return errorResponse("Erreur lors de l'appel Missive", cors, res.status >= 500 ? 502 : res.status);
      }

      const data = await res.json();
      return jsonResponse(data, cors);
    }

    // Should not be reached due to action validation above
    return errorResponse("Action non reconnue", cors, 400);
  } catch (err) {
    console.error("missive-proxy: erreur interne", err);
    return errorResponse("Erreur interne du serveur", cors, 500);
  }
});
