import { Notice, TFile } from "obsidian";
import { CryptoLayer } from "../crypto/encrypt";
import type EncSyncPlugin from "../main";
import { createProvider, getProviderReadinessError } from "../providers";
import { ProviderError } from "../providers/base";

export async function runTestRoundTrip(plugin: EncSyncPlugin): Promise<void> {
  const settings = plugin.settings;
  const readinessError = getProviderReadinessError(settings);
  if (readinessError || !settings.encryptionPassword) {
    new Notice(`EncSync: ${readinessError ?? "set the encryption password"} first.`);
    return;
  }

  const file = plugin.app.workspace.getActiveFile();
  if (!(file instanceof TFile)) {
    new Notice("EncSync: open a note to test with.");
    return;
  }

  const provider = createProvider(settings);
  if (!provider) {
    new Notice("EncSync: no provider configured.");
    return;
  }

  try {
    const crypto = await CryptoLayer.create(settings.encryptionPassword);

    await provider.ensureRoot();
    const content = await plugin.app.vault.read(file);
    const plaintext = new TextEncoder().encode(content);
    const encPath = await crypto.encryptPath(file.path);
    const ciphertext = await crypto.encryptData(plaintext);

    await provider.writeFile(encPath, ciphertext);
    const listing = await provider.walk();
    const found = listing.some((entry) => entry.path === encPath);
    const downloaded = await provider.readFile(encPath);
    const roundtrip = new TextDecoder().decode(await crypto.decryptData(downloaded));
    const decryptOk = roundtrip === content;

    new Notice(
      `EncSync round-trip ${found && decryptOk ? "OK" : "FAILED"}: ${plaintext.byteLength}B → ${ciphertext.byteLength}B encrypted; remote entries: ${listing.length}; decrypt match: ${decryptOk}`,
      10000,
    );
  } catch (error) {
    const message =
      error instanceof ProviderError
        ? `${error.kind}: ${error.message}`
        : ((error as Error).message ?? String(error));
    new Notice(`EncSync error: ${message}`, 10000);
  }
}
