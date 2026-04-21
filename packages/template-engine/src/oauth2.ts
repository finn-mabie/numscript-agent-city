// Minimal OAuth2 client-credentials token provider.
// Fetches once, caches until expiry-minus-skew, refreshes on next call.
//
// Use with `new LedgerClient(baseUrl, ledger, { getAuthToken: clientCredentials(...) })`.

export interface ClientCredentialsConfig {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  /** Seconds of safety margin before expiry to force a refresh. Default: 30s. */
  refreshSkewSeconds?: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Returns an async callback that yields a fresh bearer token on demand.
 * Internally caches the token until it's within `refreshSkewSeconds` of expiry.
 */
export function clientCredentials(cfg: ClientCredentialsConfig): () => Promise<string> {
  const skew = (cfg.refreshSkewSeconds ?? 30) * 1000;
  let cached: CachedToken | null = null;
  let inflight: Promise<CachedToken> | null = null;

  async function fetchToken(): Promise<CachedToken> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret
    });
    const res = await fetch(cfg.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!res.ok) {
      throw new Error(
        `OAuth2 token fetch failed: HTTP ${res.status} ${await res.text().catch(() => "")}`
      );
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    if (!json.access_token) {
      throw new Error("OAuth2 token response missing access_token");
    }
    return {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000
    };
  }

  return async function getAuthToken(): Promise<string> {
    if (cached && Date.now() + skew < cached.expiresAt) {
      return cached.accessToken;
    }
    if (!inflight) {
      inflight = fetchToken().finally(() => {
        inflight = null;
      });
    }
    cached = await inflight;
    return cached.accessToken;
  };
}
