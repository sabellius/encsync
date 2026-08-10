import { Plugin } from "obsidian";
import { registerCommands } from "./commands";
import { CryptoLayer } from "./crypto/encrypt";
import { EncSyncSettingTab } from "./settings";
import { type BaselineStore, LocalBaselineStore } from "./sync/baseline";
import { syncNow } from "./sync/trigger";
import { registerTriggers } from "./triggers";
import { DEFAULT_SETTINGS, EncSyncSettings, type ProviderKind } from "./types";

export default class EncSyncPlugin extends Plugin {
  settings!: EncSyncSettings;

  private cryptoLayer: CryptoLayer | null = null;
  private cryptoLayerPassword = "";
  private baselineStore: LocalBaselineStore | null = null;
  private baselineStoreKind: ProviderKind | null = null;
  private syncDebounceTimer: number | undefined;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new EncSyncSettingTab(this.app, this));
    registerCommands(this);
    registerTriggers(this);
  }

  onunload() {
    this.cryptoLayer = null;
    this.cryptoLayerPassword = "";
    this.baselineStore = null;
    this.baselineStoreKind = null;
    if (this.syncDebounceTimer) window.clearTimeout(this.syncDebounceTimer);
  }

  async getOrCreateCryptoLayer(): Promise<CryptoLayer> {
    const password = this.settings.encryptionPassword;
    if (this.cryptoLayer && this.cryptoLayerPassword === password) {
      return this.cryptoLayer;
    }
    this.cryptoLayer = await CryptoLayer.create(password);
    this.cryptoLayerPassword = password;
    return this.cryptoLayer;
  }

  getOrCreateBaselineStore(): BaselineStore {
    const kind = this.settings.provider;
    if (this.baselineStore && this.baselineStoreKind === kind) {
      return this.baselineStore;
    }
    this.baselineStore = LocalBaselineStore.create(kind);
    this.baselineStoreKind = kind;
    return this.baselineStore;
  }

  scheduleSyncOnSave(): void {
    if (this.syncDebounceTimer) window.clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = window.setTimeout(() => {
      void syncNow(this, true);
    }, this.settings.syncOnSaveDelayMs);
  }

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
