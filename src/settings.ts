import { App, PluginSettingTab, Setting } from "obsidian";
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderProviderSelector(containerEl);

    switch (this.plugin.settings.provider) {
      case "webdav":
        this.renderWebDavFields(containerEl);
        break;
      case "koofr":
        this.renderKoofrFields(containerEl);
        break;
      case "pcloud":
        this.renderPCloudFields(containerEl);
        break;
    }

    this.renderEncryption(containerEl);
    this.renderSyncBehavior(containerEl);
    this.renderIgnorePaths(containerEl);
  }

  private renderProviderSelector(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Provider").setHeading();

    new Setting(containerEl).setName("Cloud provider").addDropdown((dropdown) => {
      dropdown
        .addOption("webdav", "WebDAV")
        .addOption("koofr", "Koofr")
        .addOption("pcloud", "pCloud")
        .setValue(this.plugin.settings.provider)
        .onChange(async (value) => {
          this.plugin.settings.provider = value as typeof this.plugin.settings.provider;
          await this.plugin.saveSettings();
          this.display();
        });
    });
  }

  private renderWebDavFields(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("WebDAV").setHeading();

    const webdav: WebDavConfig = this.plugin.settings.webdav ?? defaultWebDavConfig();
    this.plugin.settings.webdav = webdav;

    new Setting(containerEl)
      .setName("Server")
      .setDesc("Base URL, e.g. https://app.koofr.net/dav/Koofr")
      .addText((text) =>
        text.setValue(webdav.server).onChange(async (value) => {
          webdav.server = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("Username").addText((text) =>
      text.setValue(webdav.username).onChange(async (value) => {
        webdav.username = value.trim();
        await this.plugin.saveSettings();
      }),
    );

    new Setting(containerEl).setName("Password").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(webdav.password).onChange(async (value) => {
        webdav.password = value;
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl)
      .setName("Remote base folder")
      .setDesc("Folder under the WebDAV root, e.g. /EncSync")
      .addText((text) =>
        text.setValue(webdav.rootPath).onChange(async (value) => {
          webdav.rootPath = value.trim() || "/";
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderKoofrFields(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Koofr").setHeading();

    const koofr: KoofrConfig = this.plugin.settings.koofr ?? defaultKoofrConfig();
    this.plugin.settings.koofr = koofr;

    new Setting(containerEl)
      .setName("Client ID")
      .setDesc("OAuth client ID from koofr.net/developers")
      .addText((text) =>
        text.setValue(koofr.clientId).onChange(async (value) => {
          koofr.clientId = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Connection")
      .setDesc(koofr.accessToken ? "Connected" : "Not connected")
      .addButton((btn) => {
        btn
          .setButtonText("Connect")
          .setDisabled(true)
          .setTooltip("Available after OAuth support lands");
      });

    new Setting(containerEl)
      .setName("Remote base folder")
      .setDesc("Folder under the Koofr root, e.g. /EncSync")
      .addText((text) =>
        text.setValue(koofr.rootPath).onChange(async (value) => {
          koofr.rootPath = value.trim() || "/";
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderPCloudFields(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("pCloud").setHeading();

    const pcloud: PCloudConfig = this.plugin.settings.pcloud ?? defaultPCloudConfig();
    this.plugin.settings.pcloud = pcloud;

    new Setting(containerEl).setName("Location").addDropdown((dropdown) => {
      dropdown
        .addOption(String(PCLOUD_LOCATION.US), "United States")
        .addOption(String(PCLOUD_LOCATION.EU), "Europe")
        .setValue(String(pcloud.locationId))
        .onChange(async (value) => {
          pcloud.locationId = Number(value) as PCloudConfig["locationId"];
          await this.plugin.saveSettings();
        });
    });

    new Setting(containerEl)
      .setName("Client ID")
      .setDesc("OAuth client ID from pCloud")
      .addText((text) =>
        text.setValue(pcloud.clientId).onChange(async (value) => {
          pcloud.clientId = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Connection")
      .setDesc(pcloud.accessToken ? "Connected" : "Not connected")
      .addButton((btn) => {
        btn
          .setButtonText("Connect")
          .setDisabled(true)
          .setTooltip("Available after OAuth support lands");
      });

    new Setting(containerEl)
      .setName("Remote base folder")
      .setDesc("Folder under the pCloud root, e.g. /EncSync")
      .addText((text) =>
        text.setValue(pcloud.rootPath).onChange(async (value) => {
          pcloud.rootPath = value.trim() || "/";
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderEncryption(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("Encryption").setHeading();

    new Setting(containerEl)
      .setName("Password")
      .setDesc("Encrypts your vault end-to-end. Remember it; there is no recovery.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(settings.encryptionPassword).onChange(async (value) => {
          settings.encryptionPassword = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderSyncBehavior(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("Sync behavior").setHeading();

    new Setting(containerEl)
      .setName("Auto-sync interval")
      .setDesc("Minutes between automatic syncs. Set to 0 to disable.")
      .addText((text) => {
        text.setValue(String(settings.autoSyncIntervalMs / 60_000));
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.onChange(async (value) => {
          const minutes = parseInt(value, 10);
          if (isNaN(minutes) || minutes < 0) return;
          settings.autoSyncIntervalMs = minutes * 60_000;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Sync-on-save delay")
      .setDesc("Seconds to wait after a file changes before syncing.")
      .addText((text) => {
        text.setValue(String(settings.syncOnSaveDelayMs / 1000));
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.onChange(async (value) => {
          const seconds = parseInt(value, 10);
          if (isNaN(seconds) || seconds < 0) return;
          settings.syncOnSaveDelayMs = seconds * 1000;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Deletion guard")
      .setDesc(
        "Maximum percentage of files that can be deleted in a single sync before it is aborted.",
      )
      .addText((text) => {
        text.setValue(String(settings.deletionGuardPct));
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "100";
        text.onChange(async (value) => {
          const pct = parseInt(value, 10);
          if (isNaN(pct) || pct < 0 || pct > 100) return;
          settings.deletionGuardPct = pct;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderIgnorePaths(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    new Setting(containerEl).setName("Ignored paths").setHeading();

    new Setting(containerEl)
      .setName("Paths")
      .setDesc("Files and folders matching these paths are excluded from sync. One path per line.")
      .addTextArea((text) => {
        text.setValue(settings.ignorePaths.join("\n")).onChange(async (value) => {
          settings.ignorePaths = value
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p !== "");
          await this.plugin.saveSettings();
        });
        text.inputEl.rows = 6;
        text.inputEl.cols = 40;
      });
  }
}
