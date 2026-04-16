import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sources RSS fiables pour la veille sociale francaise
const RSS_SOURCES = [
  {
    name: "Legifrance",
    url: "https://www.legifrance.gouv.fr/rss/lastJO.xml",
    category: "legislation",
  },
  {
    name: "URSSAF",
    url: "https://www.urssaf.fr/accueil/rss/actualites.xml",
    category: "social",
  },
  {
    name: "Service-Public.fr",
    url: "https://www.service-public.fr/rss/entreprise.xml",
    category: "legislation",
  },
  {
    name: "Editions Legislatives",
    url: "https://www.editions-legislatives.fr/rss/actualites",
    category: "legislation",
  },
];

interface ParsedArticle {
  title: string;
  summary: string;
  source: string;
  source_url: string;
  published_at: string;
  category: string;
}

async function fetchRss(source: typeof RSS_SOURCES[number]): Promise<ParsedArticle[]> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "BrightSocialHub/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // Simple RSS parser (extract <item> elements)
    const items: ParsedArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] ?? "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

      if (title) {
        items.push({
          title: title.trim().slice(0, 300),
          summary: desc.replace(/<[^>]*>/g, "").trim().slice(0, 500),
          source: source.name,
          source_url: link.trim(),
          published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          category: source.category,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

  try {
    const { action } = await req.json().catch(() => ({ action: "fetch" }));

    if (action === "list") {
      // Retourne les articles stockes en base
      const { data, error } = await sb
        .from("veille_articles")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ articles: data ?? [] });
    }

    // Action "fetch" : recupere les flux RSS et stocke
    const allArticles: ParsedArticle[] = [];
    const results = await Promise.allSettled(RSS_SOURCES.map(fetchRss));
    for (const r of results) {
      if (r.status === "fulfilled") allArticles.push(...r.value);
    }

    // Upsert en base (dedup par title + source)
    let inserted = 0;
    for (const a of allArticles) {
      const id = `veille_${btoa(a.title + a.source).slice(0, 40).replace(/[^a-zA-Z0-9]/g, "_")}`;
      const { error } = await sb.from("veille_articles").upsert({
        id,
        ...a,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "id", ignoreDuplicates: true });
      if (!error) inserted++;
    }

    return json({
      sources_checked: RSS_SOURCES.length,
      articles_found: allArticles.length,
      articles_stored: inserted,
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
