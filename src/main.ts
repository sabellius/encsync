import { Notice, Plugin, TFile } from "obsidian";
import { CryptoLayer } from "./crypto/encrypt";
import { ProviderError } from "./providers/base";
import { WebDavProvider } from "./providers/webdav";
import { EncSyncSettingTab } from "./settings";
import { DEFAULT_SETTINGS, EncSyncSettings } from "./types";

export default class EncSyncPlugin extends Plugin {
  settings!: EncSyncSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new EncSyncSettingTab(this.app, this));

    this.addCommand({
      id: "encsync-test-roundtrip",
      name: "Test sync round-trip (upload and download the active note)",
      callback: () => {
        void this.testRoundTrip();
      },
    });
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

  private async testRoundTrip(): Promise<void> {
    const s = this.settings;
    if (!s.webdav || !s.webdav.server || !s.webdav.username || !s.encryptionPassword) {
      new Notice(
        "EncSync: set WebDAV server, username, password, and the encryption password first.",
      );
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) {
      new Notice("EncSync: open a note to test with.");
      return;
    }

    try {
      const provider = new WebDavProvider(s.webdav);
      const crypto = new CryptoLayer(s.encryptionPassword);

      await provider.mkdir("");
      const content = await this.app.vault.read(file);
      const plaintext = new TextEncoder().encode(content);
      const encPath = await crypto.encryptPath(file.path);
      const ciphertext = await crypto.encryptData(plaintext);

      await provider.writeFile(encPath, ciphertext);
      const listing = await provider.walk();
      const found = listing.some((e) => e.path === encPath);
      const downloaded = await provider.readFile(encPath);
      const roundtrip = new TextDecoder().decode(await crypto.decryptData(downloaded));
      const decryptOk = roundtrip === content;

      new Notice(
        `EncSync round-trip ${found && decryptOk ? "OK" : "FAILED"}: ${plaintext.byteLength}B → ${ciphertext.byteLength}B encrypted; remote entries: ${listing.length}; decrypt match: ${decryptOk}`,
        10000,
      );
    } catch (e) {
      const msg =
        e instanceof ProviderError
          ? `${e.kind}: ${e.message}`
          : ((e as Error).message ?? String(e));
      new Notice(`EncSync error: ${msg}`, 10000);
    }
  }
}
