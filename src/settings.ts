import { App, PluginSettingTab, type Setting } from "obsidian";
import EncSyncPlugin from "./main";
import { defaultKoofrConfig, type KoofrConfig } from "./providers/koofr";
import { defaultPCloudConfig, PCLOUD_LOCATION, type PCloudConfig } from "./providers/pcloud";
import { defaultWebDavConfig, type WebDavConfig } from "./providers/webdav";

export class EncSyncSettingTab extends PluginSettingTab {
  plugin: EncSyncPlugin;

  constructor(app: App, plugin: EncSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override getSettingDefinitions() {
    return [
      {
        type: "group" as const,
        heading: "Provider",
        items: [
          {
            name: "Cloud provider",
            control: {
              type: "dropdown" as const,
              key: "provider",
              options: { webdav: "WebDAV", koofr: "Koofr", pcloud: "pCloud" },
            },
          },
        ],
      },

      {
        type: "group" as const,
        heading: "WebDAV",
        visible: () => this.plugin.settings.provider === "webdav",
        items: [
          {
            name: "Server",
            desc: "Base URL, e.g. https://app.koofr.net/dav/Koofr",
            control: { type: "text" as const, key: "webdav.server" },
          },
          {
            name: "Username",
            control: { type: "text" as const, key: "webdav.username" },
          },
          {
            name: "Password",
            render: (setting: Setting) => {
              setting.addText((text) => {
                text.inputEl.type = "password";
                text.setValue(this.plugin.settings.webdav?.password ?? "");
                text.onChange(async (value) => {
                  this.ensureWebDav().password = value;
                  await this.plugin.saveSettings();
                });
              });
            },
          },
          {
            name: "Remote base folder",
            desc: "Folder under the WebDAV root, e.g. /EncSync",
            control: { type: "text" as const, key: "webdav.rootPath" },
          },
        ],
      },

      {
        type: "group" as const,
        heading: "Koofr",
        visible: () => this.plugin.settings.provider === "koofr",
        items: [
          {
            name: "Client ID",
            desc: "OAuth client ID from koofr.net/developers",
            control: { type: "text" as const, key: "koofr.clientId" },
          },
          {
            name: "Connection",
            desc: this.plugin.settings.koofr?.accessToken ? "Connected" : "Not connected",
            action: () => {},
            disabled: true,
          },
          {
            name: "Remote base folder",
            desc: "Folder under the Koofr root, e.g. /EncSync",
            control: { type: "text" as const, key: "koofr.rootPath" },
          },
        ],
      },

      {
        type: "group" as const,
        heading: "pCloud",
        visible: () => this.plugin.settings.provider === "pcloud",
        items: [
          {
            name: "Location",
            control: {
              type: "dropdown" as const,
              key: "pcloud.locationId",
              options: {
                [String(PCLOUD_LOCATION.US)]: "United States",
                [String(PCLOUD_LOCATION.EU)]: "Europe",
              },
            },
          },
          {
            name: "Client ID",
            desc: "OAuth client ID from pCloud",
            control: { type: "text" as const, key: "pcloud.clientId" },
          },
          {
            name: "Connection",
            desc: this.plugin.settings.pcloud?.accessToken ? "Connected" : "Not connected",
            action: () => {},
            disabled: true,
          },
          {
            name: "Remote base folder",
            desc: "Folder under the pCloud root, e.g. /EncSync",
            control: { type: "text" as const, key: "pcloud.rootPath" },
          },
        ],
      },

      {
        type: "group" as const,
        heading: "Encryption",
        items: [
          {
            name: "Password",
            desc: "Encrypts your vault end-to-end. Remember it; there is no recovery.",
            render: (setting: Setting) => {
              setting.addText((text) => {
                text.inputEl.type = "password";
                text.setValue(this.plugin.settings.encryptionPassword);
                text.onChange(async (value) => {
                  this.plugin.settings.encryptionPassword = value;
                  await this.plugin.saveSettings();
                });
              });
            },
          },
        ],
      },

      {
        type: "group" as const,
        heading: "Sync behavior",
        items: [
          {
            name: "Auto-sync interval",
            desc: "Minutes between automatic syncs. Set to 0 to disable.",
            control: {
              type: "number" as const,
              key: "autoSyncIntervalMin",
              min: 0,
            },
          },
          {
            name: "Sync-on-save delay",
            desc: "Seconds to wait after a file changes before syncing.",
            control: {
              type: "number" as const,
              key: "syncOnSaveDelaySec",
              min: 0,
            },
          },
          {
            name: "Deletion guard",
            desc: "Maximum percentage of files that can be deleted in a single sync before it is aborted.",
            control: {
              type: "number" as const,
              key: "deletionGuardPct",
              min: 0,
              max: 100,
            },
          },
        ],
      },

      {
        type: "group" as const,
        heading: "Ignored paths",
        items: [
          {
            name: "Paths",
            desc: "Files and folders matching these paths are excluded from sync. One path per line.",
            control: {
              type: "textarea" as const,
              key: "ignorePathsText",
              rows: 6,
            },
          },
        ],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const settings = this.plugin.settings;

    if (key === "autoSyncIntervalMin") return settings.autoSyncIntervalMs / 60_000;
    if (key === "syncOnSaveDelaySec") return settings.syncOnSaveDelayMs / 1000;
    if (key === "ignorePathsText") return settings.ignorePaths.join("\n");
    if (key === "deletionGuardPct") return settings.deletionGuardPct;
    if (key === "encryptionPassword") return settings.encryptionPassword;
    if (key === "provider") return settings.provider;

    if (key === "pcloud.locationId") {
      return String(settings.pcloud?.locationId ?? PCLOUD_LOCATION.US);
    }

    return this.getPath(settings, key);
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings;

    if (key === "autoSyncIntervalMin") {
      settings.autoSyncIntervalMs = Math.max(0, (value as number) * 60_000);
    } else if (key === "syncOnSaveDelaySec") {
      settings.syncOnSaveDelayMs = Math.max(0, (value as number) * 1000);
    } else if (key === "ignorePathsText") {
      settings.ignorePaths = (value as string)
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p !== "");
    } else if (key === "pcloud.locationId") {
      this.ensurePCloud().locationId = Number(value) as PCloudConfig["locationId"];
    } else if (key.startsWith("webdav.")) {
      const field = key.slice(7);
      (this.ensureWebDav() as unknown as Record<string, unknown>)[field] = value;
    } else if (key.startsWith("koofr.")) {
      const field = key.slice(6);
      (this.ensureKoofr() as unknown as Record<string, unknown>)[field] = value;
    } else if (key.startsWith("pcloud.")) {
      const field = key.slice(7);
      (this.ensurePCloud() as unknown as Record<string, unknown>)[field] = value;
    } else {
      (settings as unknown as Record<string, unknown>)[key] = value;
    }

    await this.plugin.saveSettings();

    if (key === "provider") this.update();
  }

  private ensureWebDav(): WebDavConfig {
    if (!this.plugin.settings.webdav) {
      this.plugin.settings.webdav = defaultWebDavConfig();
    }
    return this.plugin.settings.webdav;
  }

  private ensureKoofr(): KoofrConfig {
    if (!this.plugin.settings.koofr) {
      this.plugin.settings.koofr = defaultKoofrConfig();
    }
    return this.plugin.settings.koofr;
  }

  private ensurePCloud(): PCloudConfig {
    if (!this.plugin.settings.pcloud) {
      this.plugin.settings.pcloud = defaultPCloudConfig();
    }
    return this.plugin.settings.pcloud;
  }

  private getPath(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return "";
      current = (current as Record<string, unknown>)[part];
    }
    return current ?? "";
  }
}
