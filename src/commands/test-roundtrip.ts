import { Notice, TFile } from "obsidian";
import { CryptoLayer } from "../crypto/encrypt";
import type EncSyncPlugin from "../main";
import { createProvider } from "../providers";
import { ProviderError } from "../providers/base";

export async function runTestRoundTrip(plugin: EncSyncPlugin): Promise<void> {
  const s = plugin.settings;
  if (!s.webdav || !s.webdav.server || !s.webdav.username || !s.encryptionPassword) {
    new Notice(
      "EncSync: set WebDAV server, username, password, and the encryption password first.",
    );
    return;
  }

  const file = plugin.app.workspace.getActiveFile();
  if (!(file instanceof TFile)) {
    new Notice("EncSync: open a note to test with.");
    return;
  }

  const provider = createProvider(s);
  if (!provider) {
    new Notice("EncSync: no provider configured.");
    return;
  }

  try {
    const crypto = new CryptoLayer(s.encryptionPassword);

    await provider.mkdir("");
    const content = await plugin.app.vault.read(file);
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
      e instanceof ProviderError ? `${e.kind}: ${e.message}` : ((e as Error).message ?? String(e));
    new Notice(`EncSync error: ${msg}`, 10000);
  }
}
