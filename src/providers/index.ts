import type { EncSyncSettings } from "../types";
import type { SyncProvider } from "./base";
import { WebDavProvider } from "./webdav";

export function createProvider(settings: EncSyncSettings): SyncProvider | null {
  if (settings.provider === "webdav" && settings.webdav) {
    return new WebDavProvider(settings.webdav);
  }
  return null;
}
