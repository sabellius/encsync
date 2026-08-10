export const DEFAULT_KOOFR_CLIENT_ID = "";

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
