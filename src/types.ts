export type ProviderKind = "pcloud" | "webdav";

export interface PCloudConfig {
  accessToken: string;
  locationid: 1 | 2;
  hostname: string;
  rootPath: string;
}

export interface WebDavConfig {
  server: string;
  username: string;
  password: string;
  rootPath: string;
}

export interface EncSyncSettings {
  provider: ProviderKind;
  pcloud: PCloudConfig | null;
  webdav: WebDavConfig | null;
  encryptionPassword: string;
  autoSyncIntervalMs: number;
  syncOnSaveDelayMs: number;
  deletionGuardPct: number;
  ignorePaths: string[];
}

export const DEFAULT_SETTINGS: EncSyncSettings = {
  provider: "webdav",
  pcloud: null,
  webdav: null,
  encryptionPassword: "",
  autoSyncIntervalMs: 5 * 60 * 1000,
  syncOnSaveDelayMs: 5 * 1000,
  deletionGuardPct: 20,
  ignorePaths: [],
};

export interface FileBaselineEntry {
  type: "file";
  key: string;
  mtimeCli: number;
  mtimeSvr: number;
  size: number;
  sizeEnc: number;
  hash: string;
}

export interface FolderBaselineEntry {
  type: "folder";
  key: string;
  mtimeCli: number;
  mtimeSvr: number;
}

export type BaselineEntry = FileBaselineEntry | FolderBaselineEntry;
