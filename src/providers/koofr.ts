export const DEFAULT_KOOFR_CLIENT_ID = "4TZ3AD7XDFC52A5FPVX3E72OU6ACRIV2";
export const KOOFR_AUTH_URL = "https://app.koofr.net/oauth2/auth";
export const KOOFR_SCOPE = "files.edit";

export interface KoofrConfig {
  clientId: string;
  accessToken: string;
  hostname: string;
  rootPath: string;
}

export function defaultKoofrConfig(): KoofrConfig {
  return {
    clientId: DEFAULT_KOOFR_CLIENT_ID,
    accessToken: "",
    hostname: "https://app.koofr.net",
    rootPath: "/EncSync",
  };
}
