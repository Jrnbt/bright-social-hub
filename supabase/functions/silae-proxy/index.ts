import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SILAE_ACTIONS: Record<string, { method: string; path: (p: any) => string }> = {
  lister_dossiers: {
    method: "POST",
    path: () => "/api/v1/Dossiers/ListerDossiers",
  },
  lister_salaries: {
    method: "POST",
    path: () => "/api/v1/Salaries/ListerSalariesInformations",
  },
  get_bulletin_entete: {
    method: "POST",
    path: () => "/api/v1/Bulletins/ListerBulletinsEntetes",
  },
  get_detail_cotisations: {
    method: "POST",
    path: () => "/api/v1/Bulletins/ListerLignesBulletinCotisations",
  },
  lister_absences: {
    method: "POST",
    path: () => "/api/v1/Absences/ListerAbsences",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { action, params } = await req.json();
    const route = SILAE_ACTIONS[action];
    if (!route) {
      return new Response(JSON.stringify({ error: `Action inconnue: ${action}` }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const SILAE_URL = Deno.env.get("SILAE_API_URL") ?? "";
    const SILAE_TOKEN = Deno.env.get("SILAE_API_TOKEN") ?? "";

    const res = await fetch(`${SILAE_URL}${route.path(params)}`, {
      method: route.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SILAE_TOKEN}`,
      },
      body: JSON.stringify(params ?? {}),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
