import { Notice, type ObsidianProtocolData, Plugin } from "obsidian";
import { registerCommands } from "./commands";
import { CryptoLayer } from "./crypto/encrypt";
import {
  DEFAULT_KOOFR_CLIENT_ID,
  defaultKoofrConfig,
  KOOFR_AUTH_URL,
  KOOFR_SCOPE,
} from "./providers/koofr";
import { buildAuthorizeUrl, generateState } from "./providers/oauth";
import {
  DEFAULT_PCLOUD_CLIENT_ID,
  defaultPCloudConfig,
  PCLOUD_AUTH_URL,
  PCLOUD_SCOPE,
  type PCloudLocationId,
} from "./providers/pcloud";
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
  private pendingOAuth: Map<string, ProviderKind> = new Map();
  private settingTab: EncSyncSettingTab | null = null;

  async onload() {
    await this.loadSettings();

    this.settingTab = new EncSyncSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    registerCommands(this);
    registerTriggers(this);

    this.registerObsidianProtocolHandler("encsync-cb", (params) => {
      void this.handleOAuthCallback(params);
    });
  }

  onunload() {
    this.cryptoLayer = null;
    this.cryptoLayerPassword = "";
    this.baselineStore = null;
    this.baselineStoreKind = null;
    this.pendingOAuth.clear();
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

  startOAuthFlow(provider: ProviderKind): void {
    const state = generateState();
    this.pendingOAuth.set(state, provider);

    let authUrl: string;
    let scope: string;
    let clientId: string;

    if (provider === "koofr") {
      authUrl = KOOFR_AUTH_URL;
      scope = KOOFR_SCOPE;
      if (!this.settings.koofr) this.settings.koofr = defaultKoofrConfig();
      clientId = this.settings.koofr.clientId || DEFAULT_KOOFR_CLIENT_ID;
    } else {
      authUrl = PCLOUD_AUTH_URL;
      scope = PCLOUD_SCOPE;
      if (!this.settings.pcloud) this.settings.pcloud = defaultPCloudConfig();
      clientId = this.settings.pcloud.clientId || DEFAULT_PCLOUD_CLIENT_ID;
    }

    const url = buildAuthorizeUrl({ authUrl, clientId, scope, state });
    window.open(url);
  }

  private async handleOAuthCallback(params: ObsidianProtocolData): Promise<void> {
    try {
      const error = params.error;
      if (error && error !== "true") {
        new Notice(`EncSync: authorization denied: ${error}`, 10000);
        return;
      }

      const state = params.state;
      if (!state || state === "true") {
        new Notice("EncSync: unexpected OAuth callback", 10000);
        return;
      }

      const accessToken = params.access_token;
      const provider = this.pendingOAuth.get(state);
      if (!provider) {
        new Notice("EncSync: unexpected OAuth callback", 10000);
        return;
      }

      this.pendingOAuth.delete(state);

      if (!accessToken || accessToken === "true") {
        new Notice("EncSync: no access token received", 10000);
        return;
      }

      if (provider === "koofr") {
        if (!this.settings.koofr) this.settings.koofr = defaultKoofrConfig();
        this.settings.koofr.accessToken = accessToken;
      } else {
        if (!this.settings.pcloud) this.settings.pcloud = defaultPCloudConfig();
        this.settings.pcloud.accessToken = accessToken;
        const locationId = params.locationid;
        const hostname = params.hostname;
        if (locationId && locationId !== "true") {
          this.settings.pcloud.locationId = Number(locationId) as PCloudLocationId;
        }
        if (hostname && hostname !== "true") {
          this.settings.pcloud.hostname = hostname;
        }
      }

      await this.saveSettings();
      this.settingTab?.update();
      new Notice(`EncSync: connected to ${provider}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`EncSync: ${message}`, 10000);
    }
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
