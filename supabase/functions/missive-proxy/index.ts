import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BASE = "https://mail.missiveapp.com/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { action, params } = await req.json();
    const MISSIVE_KEY = Deno.env.get("MISSIVE_API_KEY") ?? "";

    if (!MISSIVE_KEY) {
      return new Response(JSON.stringify({ error: "MISSIVE_API_KEY non configuree" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISSIVE_KEY}`,
    };

    if (action === "test_connection") {
      const res = await fetch(`${BASE}/organizations`, { headers });
      return new Response(JSON.stringify({ ok: res.ok }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (action === "conversations") {
      const box = params?.box ?? "inbox";
      const limit = params?.limit ?? 25;
      const url = `${BASE}/conversations?mailbox=${box}&limit=${limit}`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Action inconnue: ${action}` }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
