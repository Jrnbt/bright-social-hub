import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { jsonResponse, errorResponse } from "../_shared/validate.ts";

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
] as const;

const ALLOWED_ACTIONS = ["fetch", "list"] as const;
type AllowedAction = typeof ALLOWED_ACTIONS[number];
const FETCH_TIMEOUT_MS = 10_000;
const MAX_XML_LENGTH = 2_000_000; // 2 MB — reject oversized responses before parsing
const MAX_ITEMS_PER_FEED = 10;

interface ParsedArticle {
  title: string;
  summary: string;
  source: string;
  source_url: string;
  published_at: string;
  category: string;
}

/** Extract text content from an XML element using safe string methods */
function extractTag(block: string, tagName: string): string {
  // Use indexOf-based extraction instead of regex to avoid ReDoS
  const openCdata = `<${tagName}><![CDATA[`;
  const closeCdata = `]]></${tagName}>`;
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  // Try CDATA first
  let start = block.indexOf(openCdata);
  if (start !== -1) {
    start += openCdata.length;
    const end = block.indexOf(closeCdata, start);
    if (end !== -1) {
      return block.slice(start, end);
    }
  }

  // Try plain tag
  start = block.indexOf(openTag);
  if (start !== -1) {
    start += openTag.length;
    const end = block.indexOf(closeTag, start);
    if (end !== -1) {
      return block.slice(start, end);
    }
  }

  return "";
}

/** Extract all <item> blocks without a global regex */
function extractItems(xml: string, maxItems: number): string[] {
  const items: string[] = [];
  let searchFrom = 0;

  while (items.length < maxItems) {
    const openIdx = xml.indexOf("<item>", searchFrom);
    if (openIdx === -1) break;
    const closeIdx = xml.indexOf("</item>", openIdx);
    if (closeIdx === -1) break;

    items.push(xml.slice(openIdx + 6, closeIdx));
    searchFrom = closeIdx + 7;
  }

  return items;
}

/** Strip HTML tags using a safe, non-backtracking approach */
function stripHtml(s: string): string {
  // Simple state-machine: skip everything between < and >
  let result = "";
  let inTag = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "<") {
      inTag = true;
    } else if (s[i] === ">") {
      inTag = false;
    } else if (!inTag) {
      result += s[i];
    }
  }
  return result;
}

async function fetchRss(
  source: typeof RSS_SOURCES[number],
): Promise<ParsedArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "BrightSocialHub/1.0" },
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const xml = await res.text();

    // Reject oversized payloads before parsing
    if (xml.length > MAX_XML_LENGTH) {
      console.error(`RSS feed too large from ${source.name}: ${xml.length} bytes`);
      return [];
    }

    const itemBlocks = extractItems(xml, MAX_ITEMS_PER_FEED);
    const articles: ParsedArticle[] = [];

    for (const block of itemBlocks) {
      const title = extractTag(block, "title");
      const desc = extractTag(block, "description");
      const link = extractTag(block, "link");
      const pubDate = extractTag(block, "pubDate");

      if (title) {
        articles.push({
          title: title.trim().slice(0, 300),
          summary: stripHtml(desc).trim().slice(0, 500),
          source: source.name,
          source_url: link.trim().slice(0, 2000),
          published_at: pubDate
            ? new Date(pubDate).toISOString()
            : new Date().toISOString(),
          category: source.category,
        });
      }
    }

    return articles;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error(`RSS fetch timeout for ${source.name}`);
    } else {
      console.error(`RSS fetch error for ${source.name}`);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
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

  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(SB_URL, SB_KEY);

  try {
    // Parse input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const rawAction = (body as Record<string, unknown>)?.action;
    const action: AllowedAction =
      typeof rawAction === "string" && ALLOWED_ACTIONS.includes(rawAction as AllowedAction)
        ? (rawAction as AllowedAction)
        : "fetch";

    if (action === "list") {
      const { data, error } = await sb
        .from("veille_articles")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("veille-sociale list error:", error);
        return errorResponse("Erreur lors de la recuperation des articles", cors, 500);
      }

      return jsonResponse({ articles: data ?? [] }, cors);
    }

    // Action "fetch": retrieve RSS feeds and store
    const allArticles: ParsedArticle[] = [];
    const results = await Promise.allSettled(RSS_SOURCES.map(fetchRss));
    for (const r of results) {
      if (r.status === "fulfilled") allArticles.push(...r.value);
    }

    // Upsert into DB (dedup by title + source)
    let inserted = 0;
    for (const a of allArticles) {
      const rawId = a.title + a.source;
      // Safe base64 ID generation with length limit
      const id = `veille_${btoa(rawId.slice(0, 60)).slice(0, 40).replace(/[^a-zA-Z0-9]/g, "_")}`;
      const { error } = await sb.from("veille_articles").upsert(
        {
          id,
          ...a,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (!error) inserted++;
    }

    return jsonResponse(
      {
        sources_checked: RSS_SOURCES.length,
        articles_found: allArticles.length,
        articles_stored: inserted,
      },
      cors,
    );
  } catch (err) {
    console.error("veille-sociale error:", err);
    return errorResponse("Erreur interne du service", cors, 500);
  }
});
