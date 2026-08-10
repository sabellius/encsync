export const DEFAULT_PCLOUD_CLIENT_ID = "";

export const PCLOUD_LOCATION = {
  US: 1,
  EU: 2,
} as const;

export type PCloudLocationId = (typeof PCLOUD_LOCATION)[keyof typeof PCLOUD_LOCATION];

export interface PCloudConfig {
  clientId: string;
  accessToken: string;
  locationId: PCloudLocationId;
  hostname: string;
  rootPath: string;
}

export function defaultPCloudConfig(): PCloudConfig {
  return {
    clientId: DEFAULT_PCLOUD_CLIENT_ID,
    accessToken: "",
    locationId: PCLOUD_LOCATION.US,
    hostname: "",
    rootPath: "/EncSync",
  };
}
