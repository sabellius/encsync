import { App, PluginSettingTab, Setting } from "obsidian";
import EncSyncPlugin from "./main";
import type { WebDavConfig } from "./types";

export class EncSyncSettingTab extends PluginSettingTab {
  plugin: EncSyncPlugin;

  constructor(app: App, plugin: EncSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const s = this.plugin.settings;
    const webdav: WebDavConfig = s.webdav ?? {
      server: "",
      username: "",
      password: "",
      rootPath: "/EncSync",
    };

    new Setting(containerEl)
      .setName("WebDAV server")
      .setDesc("Base URL, e.g. https://app.koofr.net/dav/Koofr")
      .addText((t) =>
        t.setValue(webdav.server).onChange(async (v) => {
          webdav.server = v.trim();
          s.webdav = webdav;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("WebDAV username").addText((t) =>
      t.setValue(webdav.username).onChange(async (v) => {
        webdav.username = v.trim();
        s.webdav = webdav;
        await this.plugin.saveSettings();
      }),
    );

    new Setting(containerEl).setName("WebDAV password").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(webdav.password).onChange(async (v) => {
        webdav.password = v;
        s.webdav = webdav;
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl)
      .setName("Remote base folder")
      .setDesc("Folder under the WebDAV root, e.g. /EncSync")
      .addText((t) =>
        t.setValue(webdav.rootPath).onChange(async (v) => {
          webdav.rootPath = v.trim() || "/";
          s.webdav = webdav;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Encryption password")
      .setDesc("Encrypts your vault end-to-end. Remember it; there is no recovery.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(s.encryptionPassword).onChange(async (v) => {
          s.encryptionPassword = v;
          await this.plugin.saveSettings();
        });
      });
  }
}
