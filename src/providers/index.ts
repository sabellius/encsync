import type { EncSyncSettings } from "../types";
import { isWebDavConfigured } from "../types";
import type { SyncProvider } from "./base";
import { WebDavProvider } from "./webdav";

export function createProvider(settings: EncSyncSettings): SyncProvider | null {
  if (settings.provider === "webdav" && settings.webdav) {
    return new WebDavProvider(settings.webdav);
  }
  return null;
}

export function getProviderReadinessError(settings: EncSyncSettings): string | null {
  if (settings.provider === "webdav") {
    return isWebDavConfigured(settings.webdav) ? null : "set WebDAV server, username, and password";
  }
  return `provider "${settings.provider}" is not supported`;
}
