import type EncSyncPlugin from "./main";
import { syncNow } from "./sync/trigger";

export function registerTriggers(plugin: EncSyncPlugin): void {
  plugin.addRibbonIcon("refresh-cw", "EncSync: sync now", () => {
    void syncNow(plugin);
  });

  plugin.addCommand({
    id: "sync-now",
    name: "Sync now",
    callback: () => {
      void syncNow(plugin);
    },
  });

  if (plugin.settings.autoSyncIntervalMs > 0) {
    plugin.registerInterval(
      window.setInterval(() => {
        void syncNow(plugin, true);
      }, plugin.settings.autoSyncIntervalMs),
    );
  }

  const handler = () => plugin.scheduleSyncOnSave();
  plugin.registerEvent(plugin.app.vault.on("create", handler));
  plugin.registerEvent(plugin.app.vault.on("modify", handler));
  plugin.registerEvent(plugin.app.vault.on("delete", handler));
}
