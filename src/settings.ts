import { App, PluginSettingTab } from "obsidian";
import EncSyncPlugin from "./main";

export class EncSyncSettingTab extends PluginSettingTab {
  plugin: EncSyncPlugin;

  constructor(app: App, plugin: EncSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
  }
}
