import type { EncSyncSettings, ProviderKind } from "../types";
import type { SyncProvider } from "./base";
import { isWebDavConfigured, WebDavProvider } from "./webdav";

interface ProviderEntry {
  create(settings: EncSyncSettings): SyncProvider;
  isReady(settings: EncSyncSettings): boolean;
  readinessMessage: string;
}

const REGISTRY: Partial<Record<ProviderKind, ProviderEntry>> = {
  webdav: {
    create: (settings) => new WebDavProvider(settings.webdav!),
    isReady: (settings) => isWebDavConfigured(settings.webdav),
    readinessMessage: "set WebDAV server, username, and password",
  },
};

export function createProvider(settings: EncSyncSettings): SyncProvider | null {
  const entry = REGISTRY[settings.provider];
  if (!entry || !entry.isReady(settings)) return null;
  return entry.create(settings);
}

export function getProviderReadinessError(settings: EncSyncSettings): string | null {
  const entry = REGISTRY[settings.provider];
  if (!entry) return `provider "${settings.provider}" is not supported`;
  if (!entry.isReady(settings)) return entry.readinessMessage;
  return null;
}
