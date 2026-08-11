import { requestUrl } from "obsidian";

export const OAUTH_REDIRECT_URI = "https://sabellius.github.io/encsync-oauth/";
export const PROXY_URL = "https://encsync-oauth-proxy.main-account-96d.workers.dev";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthorizeUrlParams {
  authUrl: string;
  clientId: string;
  scope: string;
  state: string;
  responseType?: "token" | "code";
  redirectUri?: string;
}

export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(params.authUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", params.responseType ?? "token");
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", params.redirectUri ?? OAUTH_REDIRECT_URI);
  return url.toString();
}

export async function refreshViaProxy(refreshToken: string): Promise<TokenPair> {
  let res;
  try {
    res = await requestUrl({
      url: `${PROXY_URL}/refresh`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 0;
    const message = (error as Error).message ?? String(error);
    if (status === 401) throw new Error(`refresh denied by proxy (${message})`);
    if (status > 0) throw new Error(`proxy returned ${status}: ${message}`);
    throw new Error(`proxy unreachable: ${message}`);
  }
  const tokens = res.json as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token) {
    throw new Error("proxy returned no access token");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
  };
}
