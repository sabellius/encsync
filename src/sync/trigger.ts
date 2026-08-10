import { Notice } from "obsidian";
import type EncSyncPlugin from "../main";
import { createProvider, getProviderReadinessError } from "../providers";
import { SyncEngine, type SyncResult } from "./engine";

export async function syncNow(plugin: EncSyncPlugin, silent = false): Promise<void> {
  try {
    const settings = plugin.settings;

    const readinessError = getProviderReadinessError(settings);
    if (readinessError) {
      if (!silent) new Notice(`EncSync: ${readinessError}.`);
      return;
    }

    if (!settings.encryptionPassword) {
      if (!silent) new Notice("EncSync: set the encryption password first.");
      return;
    }

    const crypto = await plugin.getOrCreateCryptoLayer();
    const baselineStore = plugin.getOrCreateBaselineStore();
    const provider = createProvider(settings);
    if (!provider) {
      if (!silent) new Notice("EncSync: no provider configured.");
      return;
    }

    const engine = new SyncEngine(
      plugin.app,
      plugin.app.vault,
      provider,
      crypto,
      baselineStore,
      settings,
    );
    const result = await engine.run();

    reportSyncResult(result, silent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`EncSync: ${message}`, 10000);
  }
}

function reportSyncResult(result: SyncResult, silent: boolean): void {
  if (result.status === "aborted") {
    if (result.reason === "sync already in progress") return;
    new Notice(`EncSync: ${result.reason}`, 10000);
    return;
  }

  const hasChanges =
    result.pushed > 0 ||
    result.pulled > 0 ||
    result.deletedLocal > 0 ||
    result.deletedRemote > 0 ||
    result.conflicts > 0;

  if (silent && !hasChanges && result.errors.length === 0) return;

  const parts: string[] = [];
  if (result.pushed > 0) parts.push(`${result.pushed} pushed`);
  if (result.pulled > 0) parts.push(`${result.pulled} pulled`);
  if (result.deletedLocal > 0) parts.push(`${result.deletedLocal} deleted locally`);
  if (result.deletedRemote > 0) parts.push(`${result.deletedRemote} deleted remotely`);
  if (result.conflicts > 0) parts.push(`${result.conflicts} conflicts`);

  const summary = parts.length > 0 ? parts.join(", ") : "everything up to date";
  const duration = result.errors.length > 0 ? 10000 : 5000;

  new Notice(`EncSync: ${summary}`, duration);
}
