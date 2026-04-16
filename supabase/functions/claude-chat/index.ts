import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const SILAE_URL = Deno.env.get("SILAE_API_URL") ?? "";
  const SILAE_TOKEN = Deno.env.get("SILAE_API_TOKEN") ?? "";
  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!ANTHROPIC_KEY) {
    return json({ error: "ANTHROPIC_API_KEY non configuree" }, 500);
  }

  const sb = createClient(SB_URL, SB_KEY);

  try {
    const { message, context } = await req.json();
    if (!message) throw new Error("message requis");

    // Construire le contexte metier a partir de la base
    const [tasksRes, dossiersRes, controlsRes] = await Promise.all([
      sb.from("tasks").select("id, title, status, priority, dossier, assignee").in("status", ["todo", "progress"]).limit(50),
      sb.from("dossiers").select("id, numero, nom, responsable, effectif").limit(200),
      sb.from("controls").select("id, dossier_name, period, status").order("created_at", { ascending: false }).limit(20),
    ]);

    const systemPrompt = `Tu es l'assistant IA de Bright Social Hub, l'application de gestion sociale du cabinet Bright Conseil.
Tu aides les gestionnaires de paie a analyser les dossiers, detecter des anomalies et repondre a leurs questions.

Contexte metier disponible:
- ${dossiersRes.data?.length ?? 0} dossiers en portefeuille
- ${tasksRes.data?.length ?? 0} taches actives (todo/en cours)
- ${controlsRes.data?.length ?? 0} controles recents

Dossiers: ${JSON.stringify(dossiersRes.data?.slice(0, 30) ?? [])}
Taches actives: ${JSON.stringify(tasksRes.data?.slice(0, 20) ?? [])}
Controles recents: ${JSON.stringify(controlsRes.data?.slice(0, 10) ?? [])}

${context ? `Contexte additionnel fourni par l'utilisateur: ${context}` : ""}

Tu peux:
- Analyser les donnees des dossiers
- Proposer des pistes d'analyse pour les ecarts
- Suggerer des controles a lancer
- Croiser les informations disponibles
Reponds en francais, de facon concise et actionnable.`;

    // Appel Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const result = await response.json();
    const reply = result.content?.[0]?.text ?? "Pas de reponse";

    return json({ reply });
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
