export const OAUTH_REDIRECT_URI = "https://sabellius.github.io/encsync-oauth/";

interface AuthorizeUrlParams {
  authUrl: string;
  clientId: string;
  scope: string;
  state: string;
}

export function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(params.authUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "token");
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
  return url.toString();
}
