import { Notice, type ObsidianProtocolData, Plugin } from "obsidian";
import { registerCommands } from "./commands";
import { CryptoLayer } from "./crypto/encrypt";
import {
  DEFAULT_KOOFR_CLIENT_ID,
  defaultKoofrConfig,
  KOOFR_AUTH_URL,
  KOOFR_SCOPE,
} from "./providers/koofr";
import { buildAuthorizeUrl, generateState, OAUTH_REDIRECT_URI, PROXY_URL } from "./providers/oauth";
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

  private ensureKoofr() {
    if (!this.settings.koofr) this.settings.koofr = defaultKoofrConfig();
    return this.settings.koofr;
  }

  private ensurePCloud() {
    if (!this.settings.pcloud) this.settings.pcloud = defaultPCloudConfig();
    return this.settings.pcloud;
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
    let responseType: "token" | "code";
    let redirectUri: string;

    if (provider === "koofr") {
      authUrl = KOOFR_AUTH_URL;
      scope = KOOFR_SCOPE;
      clientId = this.ensureKoofr().clientId || DEFAULT_KOOFR_CLIENT_ID;
      responseType = "code";
      redirectUri = `${PROXY_URL}/callback`;
    } else {
      authUrl = PCLOUD_AUTH_URL;
      scope = PCLOUD_SCOPE;
      clientId = this.ensurePCloud().clientId || DEFAULT_PCLOUD_CLIENT_ID;
      responseType = "token";
      redirectUri = OAUTH_REDIRECT_URI;
    }

    const url = buildAuthorizeUrl({ authUrl, clientId, scope, state, responseType, redirectUri });
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

      const provider = this.pendingOAuth.get(state);
      if (!provider) {
        new Notice("EncSync: unexpected OAuth callback", 10000);
        return;
      }

      this.pendingOAuth.delete(state);

      const accessToken = params.access_token;
      const refreshToken = params.refresh_token;

      if (!accessToken || accessToken === "true") {
        new Notice("EncSync: no access token received", 10000);
        return;
      }

      if (provider === "koofr") {
        const koofr = this.ensureKoofr();
        koofr.accessToken = accessToken;
        if (refreshToken && refreshToken !== "true") {
          koofr.refreshToken = refreshToken;
        } else {
          new Notice("EncSync: no refresh token received from proxy", 10000);
          return;
        }
      } else {
        const pcloud = this.ensurePCloud();
        pcloud.accessToken = accessToken;
        const locationId = params.locationid;
        const hostname = params.hostname;
        if (locationId && locationId !== "true") {
          pcloud.locationId = Number(locationId) as PCloudLocationId;
        }
        if (hostname && hostname !== "true") {
          pcloud.hostname = hostname;
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
