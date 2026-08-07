export const PCLOUD_LOCATION = {
  US: 1,
  EU: 2,
} as const;

export type PCloudLocationId = (typeof PCLOUD_LOCATION)[keyof typeof PCLOUD_LOCATION];

export interface PCloudConfig {
  accessToken: string;
  locationId: PCloudLocationId;
  hostname: string;
  rootPath: string;
}
