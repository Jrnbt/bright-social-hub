// Authentification OAuth2 Silae (Azure AD client_credentials)

const TOKEN_URL = "https://payroll-api-auth.silae.fr/oauth2/v2.0/token";
export const SILAE_API_BASE = "https://payroll-api.silae.fr/payroll";

let tokenCache: { token: string; expiresAt: number } = { token: "", expiresAt: 0 };

/** Obtient un access token Silae via OAuth2 client_credentials */
export async function getSilaeToken(): Promise<string> {
  // Return cached token if still valid (with 60s margin)
  if (tokenCache.token && Date.now() / 1000 < tokenCache.expiresAt - 60) {
    return tokenCache.token;
  }

  const clientId = Deno.env.get("SILAE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("SILAE_CLIENT_SECRET") ?? "";
  const scope = Deno.env.get("SILAE_SCOPE") ?? "https://silaecloudb2c.onmicrosoft.com/36658aca-9556-41b7-9e48-77e90b006f34/.default";

  if (!clientId || !clientSecret) {
    throw new Error("SILAE_CLIENT_ID ou SILAE_CLIENT_SECRET non configure");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
  });

  if (!res.ok) {
    throw new Error(`Erreur auth Silae: ${res.status}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() / 1000 + (data.expires_in ?? 3600),
  };

  return tokenCache.token;
}

/** Appel POST authentifie vers l'API Silae */
export async function silaePost(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const token = await getSilaeToken();
  const subscriptionKey = Deno.env.get("SILAE_SUBSCRIPTION_KEY") ?? "";

  const res = await fetch(`${SILAE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Silae API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}
