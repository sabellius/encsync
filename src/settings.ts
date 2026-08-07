import { App, PluginSettingTab, Setting } from "obsidian";
import EncSyncPlugin from "./main";
import { blankWebDavConfig, type WebDavConfig } from "./types";

export class EncSyncSettingTab extends PluginSettingTab {
  plugin: EncSyncPlugin;

  constructor(app: App, plugin: EncSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private async setWebdav(
    webdav: WebDavConfig,
    mutate: (config: WebDavConfig) => void,
  ): Promise<void> {
    mutate(webdav);
    this.plugin.settings.webdav = webdav;
    await this.plugin.saveSettings();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const settings = this.plugin.settings;
    const webdav: WebDavConfig = settings.webdav ?? blankWebDavConfig();

    new Setting(containerEl)
      .setName("WebDAV server")
      .setDesc("Base URL, e.g. https://app.koofr.net/dav/Koofr")
      .addText((text) =>
        text.setValue(webdav.server).onChange(async (value) => {
          await this.setWebdav(webdav, (config) => {
            config.server = value.trim();
          });
        }),
      );

    new Setting(containerEl).setName("WebDAV username").addText((text) =>
      text.setValue(webdav.username).onChange(async (value) => {
        await this.setWebdav(webdav, (config) => {
          config.username = value.trim();
        });
      }),
    );

    new Setting(containerEl).setName("WebDAV password").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(webdav.password).onChange(async (value) => {
        await this.setWebdav(webdav, (config) => {
          config.password = value;
        });
      });
    });

    new Setting(containerEl)
      .setName("Remote base folder")
      .setDesc("Folder under the WebDAV root, e.g. /EncSync")
      .addText((text) =>
        text.setValue(webdav.rootPath).onChange(async (value) => {
          await this.setWebdav(webdav, (config) => {
            config.rootPath = value.trim() || "/";
          });
        }),
      );

    new Setting(containerEl)
      .setName("Encryption password")
      .setDesc("Encrypts your vault end-to-end. Remember it; there is no recovery.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(settings.encryptionPassword).onChange(async (value) => {
          settings.encryptionPassword = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
