// Authentification partagee pour toutes les Edge Functions
// Verifie le JWT Supabase OU un token Claude

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthResult {
  ok: boolean;
  userId?: string;
  role?: string;
  error?: string;
}

/** Verifie que l'appelant est authentifie via JWT Supabase */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, error: "Token manquant" };
  }

  const token = authHeader.replace("Bearer ", "");
  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const sb = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) {
    return { ok: false, error: "Token invalide" };
  }

  return { ok: true, userId: user.id, role: user.role ?? "authenticated" };
}

/** Verifie le token Claude (pour claude-webhook) */
export function verifyClaudeToken(req: Request): boolean {
  const token = req.headers.get("x-claude-token") ?? "";
  const expected = Deno.env.get("CLAUDE_WEBHOOK_TOKEN") ?? "";
  return !!expected && token === expected;
}

/** Reponse 401 standard */
export function unauthorizedResponse(cors: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Non autorise" }),
    { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
  );
}
