import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, EncSyncSettings, EncSyncSettingTab } from "./settings";

export default class EncSyncPlugin extends Plugin {
  settings!: EncSyncSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new EncSyncSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<EncSyncSettings>,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
