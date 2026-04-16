import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { jsonResponse, errorResponse, sanitizeForLog } from "../_shared/validate.ts";

// --- Action allowlist with parameter validation ---

interface ActionDef {
  method: string;
  path: string;
  validate: (p: unknown) => string | null; // returns error msg or null if valid
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isIsoDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v);
}

function isValidEtatDossier(v: unknown): boolean {
  return v === 0 || v === 1 || v === 2 || v === undefined;
}

const SILAE_ACTIONS: Record<string, ActionDef> = {
  lister_dossiers: {
    method: "POST",
    path: "/api/v1/Dossiers/ListerDossiers",
    validate: (p: unknown) => {
      const params = p as Record<string, unknown> | undefined;
      if (params && params.etatDossier !== undefined && !isValidEtatDossier(params.etatDossier)) {
        return "etatDossier doit etre 0, 1 ou 2";
      }
      return null;
    },
  },
  lister_salaries: {
    method: "POST",
    path: "/api/v1/Salaries/ListerSalariesInformations",
    validate: (p: unknown) => {
      const params = p as Record<string, unknown> | undefined;
      if (!params || !isNonEmptyString(params.numeroDossier)) {
        return "numeroDossier (string) requis";
      }
      if (!isIsoDate(params.dateReference)) {
        return "dateReference requis au format ISO (ex: 2026-03-01T00:00:00)";
      }
      return null;
    },
  },
  get_bulletin_entete: {
    method: "POST",
    path: "/api/v1/Bulletins/ListerBulletinsEntetes",
    validate: (p: unknown) => {
      const params = p as Record<string, unknown> | undefined;
      if (!params || !isNonEmptyString(params.numeroDossier)) {
        return "numeroDossier (string) requis";
      }
      if (!isNonEmptyString(params.matriculeSalarie)) {
        return "matriculeSalarie (string) requis";
      }
      if (typeof params.identifiantEmploi !== "number") {
        return "identifiantEmploi (number) requis";
      }
      if (!isIsoDate(params.periode)) {
        return "periode requis au format ISO (ex: 2026-03-01T00:00:00)";
      }
      return null;
    },
  },
  get_detail_cotisations: {
    method: "POST",
    path: "/api/v1/Bulletins/ListerLignesBulletinCotisations",
    validate: (p: unknown) => {
      const params = p as Record<string, unknown> | undefined;
      if (!params || !isNonEmptyString(params.numeroDossier)) {
        return "numeroDossier (string) requis";
      }
      if (!isNonEmptyString(params.matriculeSalarie)) {
        return "matriculeSalarie (string) requis";
      }
      if (typeof params.identifiantEmploi !== "number") {
        return "identifiantEmploi (number) requis";
      }
      if (!isIsoDate(params.periode)) {
        return "periode requis au format ISO (ex: 2026-03-01T00:00:00)";
      }
      return null;
    },
  },
  lister_absences: {
    method: "POST",
    path: "/api/v1/Absences/ListerAbsences",
    validate: (p: unknown) => {
      const params = p as Record<string, unknown> | undefined;
      if (!params || !isNonEmptyString(params.numeroDossier)) {
        return "numeroDossier (string) requis";
      }
      if (!isNonEmptyString(params.matriculeSalarie)) {
        return "matriculeSalarie (string) requis";
      }
      if (!isIsoDate(params.periodeDebut)) {
        return "periodeDebut requis au format ISO (ex: 2026-01-01T00:00:00)";
      }
      if (!isIsoDate(params.periodeFin)) {
        return "periodeFin requis au format ISO (ex: 2026-03-31T00:00:00)";
      }
      return null;
    },
  },
};

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

    // Validate action is a string and in the allowlist
    if (typeof action !== "string" || !SILAE_ACTIONS[action]) {
      return errorResponse("Action non reconnue", cors, 400);
    }

    const route = SILAE_ACTIONS[action];

    // Validate params per action
    const validationError = route.validate(params);
    if (validationError) {
      return errorResponse(validationError, cors, 400);
    }

    // Call Silae API
    const SILAE_URL = Deno.env.get("SILAE_API_URL") ?? "";
    const SILAE_TOKEN = Deno.env.get("SILAE_API_TOKEN") ?? "";

    if (!SILAE_URL || !SILAE_TOKEN) {
      console.error("silae-proxy: SILAE_API_URL ou SILAE_API_TOKEN non configure");
      return errorResponse("Configuration serveur manquante", cors, 500);
    }

    const res = await fetch(`${SILAE_URL}${route.path}`, {
      method: route.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SILAE_TOKEN}`,
      },
      body: JSON.stringify(params ?? {}),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`silae-proxy: Silae API error status=${res.status} action=${sanitizeForLog(action)}`);
      return errorResponse("Erreur lors de l'appel Silae", cors, res.status >= 500 ? 502 : res.status);
    }

    return jsonResponse(data, cors);
  } catch (err) {
    console.error("silae-proxy: erreur interne", err);
    return errorResponse("Erreur interne du serveur", cors, 500);
  }
});
