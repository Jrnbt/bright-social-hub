// Authentification OAuth2 Silae (Azure AD client_credentials)

const TOKEN_URL = "https://payroll-api-auth.silae.fr/oauth2/v2.0/token";
const SILAE_API_BASE = "https://payroll-api.silae.fr/payroll";
const API_TIMEOUT_MS = 15000;

let tokenCache: { token: string; expiresAt: number } = { token: "", expiresAt: 0 };
let tokenPromise: Promise<string> | null = null;

/** Obtient un access token Silae via OAuth2 (avec dedup des requetes concurrentes) */
export async function getSilaeToken(): Promise<string> {
  if (tokenCache.token && Date.now() / 1000 < tokenCache.expiresAt - 60) {
    return tokenCache.token;
  }
  if (!tokenPromise) {
    tokenPromise = fetchNewToken().finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

async function fetchNewToken(): Promise<string> {
  const clientId = Deno.env.get("SILAE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("SILAE_CLIENT_SECRET") ?? "";
  const scope = Deno.env.get("SILAE_SCOPE") ?? "https://silaecloudb2c.onmicrosoft.com/36658aca-9556-41b7-9e48-77e90b006f34/.default";

  if (!clientId || !clientSecret) {
    throw new Error("SILAE_CLIENT_ID ou SILAE_CLIENT_SECRET non configure");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) throw new Error(`Erreur auth Silae: ${res.status}`);

    const data = await res.json();
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() / 1000 + (data.expires_in ?? 3600),
    };
    return tokenCache.token;
  } finally {
    clearTimeout(timer);
  }
}

/** Appel POST authentifie vers l'API Silae (avec timeout 15s) */
export async function silaePost(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const token = await getSilaeToken();
  const subscriptionKey = Deno.env.get("SILAE_SUBSCRIPTION_KEY") ?? "";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${SILAE_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "dossiers": "",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Silae API ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
