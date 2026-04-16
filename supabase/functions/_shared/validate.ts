// Validation d'entrees partagee

/** Valide un format periode YYYY-MM */
export function isValidPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

/** Sanitize une chaine pour les logs (pas d'injection) */
export function sanitizeForLog(s: string, maxLen = 200): string {
  return String(s).slice(0, maxLen).replace(/[<>"'&]/g, "");
}

/** Reponse JSON standard avec CORS */
export function jsonResponse(
  data: unknown,
  cors: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Reponse erreur generique (ne fuite jamais les details internes) */
export function errorResponse(
  publicMsg: string,
  cors: Record<string, string>,
  status = 500,
  _internalErr?: unknown
): Response {
  // En production, _internalErr serait envoye a un service de monitoring
  // Jamais expose au client
  return jsonResponse({ error: publicMsg }, cors, status);
}
