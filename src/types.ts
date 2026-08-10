import type { KoofrConfig } from "./providers/koofr";
import type { PCloudConfig } from "./providers/pcloud";
import type { WebDavConfig } from "./providers/webdav";

export type ProviderKind = "pcloud" | "webdav" | "koofr";

export interface EncSyncSettings {
  provider: ProviderKind;
  pcloud: PCloudConfig | null;
  webdav: WebDavConfig | null;
  koofr: KoofrConfig | null;
  encryptionPassword: string;
  autoSyncIntervalMs: number;
  syncOnSaveDelayMs: number;
  deletionGuardPct: number;
  ignorePaths: string[];
}

const DEFAULT_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_SYNC_ON_SAVE_DELAY_MS = 5 * 1000;
const DEFAULT_DELETION_GUARD_PERCENT = 20;

export const DEFAULT_SETTINGS: EncSyncSettings = {
  provider: "webdav",
  pcloud: null,
  webdav: null,
  koofr: null,
  encryptionPassword: "",
  autoSyncIntervalMs: DEFAULT_AUTO_SYNC_INTERVAL_MS,
  syncOnSaveDelayMs: DEFAULT_SYNC_ON_SAVE_DELAY_MS,
  deletionGuardPct: DEFAULT_DELETION_GUARD_PERCENT,
  ignorePaths: [],
};

export interface FileBaselineEntry {
  type: "file";
  key: string;
  mtimeClient: number;
  mtimeServer: number;
  size: number;
  sizeEnc: number;
  hash: string;
}

export interface FolderBaselineEntry {
  type: "folder";
  key: string;
  mtimeClient: number;
  mtimeServer: number;
}

export type BaselineEntry = FileBaselineEntry | FolderBaselineEntry;
