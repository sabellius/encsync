import { type App, TFile, type Vault } from "obsidian";
import { CryptoLayer } from "../crypto/encrypt";
import type { RemoteEntity, SyncProvider } from "../providers/base";
import type { EncSyncSettings, FileBaselineEntry } from "../types";
import { BaselineStore } from "./baseline";
import { conflictPath } from "./conflict";
import { checkDeletionPercent, checkEmptyRemote, checkWrongPassword } from "./guards";

const MTIME_TOLERANCE_MS = 2000;

export type SyncResult =
  | {
      status: "ok";
      pushed: number;
      pulled: number;
      deletedLocal: number;
      deletedRemote: number;
      conflicts: number;
      skipped: number;
      errors: string[];
    }
  | { status: "aborted"; reason: string };

interface LocalEntity {
  path: string;
  mtime: number;
  size: number;
}

type FileAction =
  | "skip"
  | "push"
  | "pull"
  | "conflict"
  | "deleteLocal"
  | "deleteRemote"
  | "dropBaseline"
  | "seed";

let isSyncing = false;

export class SyncEngine {
  private readonly createdRemoteFolders = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly vault: Vault,
    private readonly provider: SyncProvider,
    private readonly crypto: CryptoLayer,
    private readonly baselineStore: BaselineStore,
    private readonly settings: EncSyncSettings,
  ) {}

  async run(): Promise<SyncResult> {
    if (isSyncing) {
      return { status: "aborted", reason: "sync already in progress" };
    }
    isSyncing = true;
    try {
      return await this.sync();
    } finally {
      isSyncing = false;
    }
  }

  private async sync(): Promise<SyncResult> {
    try {
      await this.provider.checkConnect();
      await this.provider.ensureRoot();
    } catch (error) {
      return { status: "aborted", reason: errorMessage(error) };
    }

    const allEntries = await this.baselineStore.getAll();
    const baseline = new Map<string, FileBaselineEntry>();
    for (const [path, entry] of allEntries) {
      if (entry.type === "file") baseline.set(path, entry);
    }

    const firstSync = baseline.size === 0;
    const localMap = await this.enumerateLocal();
    const { remoteMap, undecryptable } = await this.enumerateRemote();

    const wrongPassword = checkWrongPassword(undecryptable);
    if (!wrongPassword.ok) return { status: "aborted", reason: wrongPassword.reason };

    const emptyRemote = checkEmptyRemote(remoteMap.size, baseline.size);
    if (!emptyRemote.ok) return { status: "aborted", reason: emptyRemote.reason };

    const plan = await this.buildPlan(localMap, remoteMap, baseline, firstSync);

    const plannedDeletions = countDeletions(plan);
    const deletionGuard = checkDeletionPercent(
      plannedDeletions,
      baseline.size,
      this.settings.deletionGuardPct,
    );
    if (!deletionGuard.ok) return { status: "aborted", reason: deletionGuard.reason };

    const stats = {
      pushed: 0,
      pulled: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const [path, action] of plan) {
      if (action === "skip") {
        stats.skipped++;
        continue;
      }
      if (action === "push" || action === "pull" || action === "conflict" || action === "seed") {
        try {
          await this.executeTransfer(path, action, localMap, remoteMap, stats);
        } catch (error) {
          stats.errors.push(`${path}: ${errorMessage(error)}`);
        }
      }
    }

    for (const [path, action] of plan) {
      if (action === "deleteLocal" || action === "deleteRemote" || action === "dropBaseline") {
        try {
          await this.executeDeletion(path, action, stats);
        } catch (error) {
          stats.errors.push(`${path}: ${errorMessage(error)}`);
        }
      }
    }

    return { status: "ok", ...stats };
  }

  private async enumerateLocal(): Promise<Map<string, LocalEntity>> {
    const result = new Map<string, LocalEntity>();
    const configPrefix = `${this.vault.configDir}/`;

    for (const file of this.vault.getFiles()) {
      if (file.path.startsWith(configPrefix)) continue;
      if (this.matchesIgnorePaths(file.path)) continue;
      result.set(file.path, {
        path: file.path,
        mtime: file.stat.mtime,
        size: file.stat.size,
      });
    }

    return result;
  }

  private matchesIgnorePaths(path: string): boolean {
    for (const prefix of this.settings.ignorePaths) {
      if (!prefix) continue;
      if (path === prefix || path.startsWith(`${prefix}/`)) return true;
    }
    return false;
  }

  private async enumerateRemote(): Promise<{
    remoteMap: Map<string, RemoteEntity>;
    undecryptable: string[];
  }> {
    const listing = await this.provider.walk();
    const remoteMap = new Map<string, RemoteEntity>();
    const undecryptable: string[] = [];

    for (const entity of listing) {
      if (entity.type === "folder") continue;
      try {
        const vaultPath = await this.crypto.decryptPath(entity.path);
        remoteMap.set(vaultPath, entity);
      } catch {
        undecryptable.push(entity.path);
      }
    }

    return { remoteMap, undecryptable };
  }

  private async buildPlan(
    localMap: Map<string, LocalEntity>,
    remoteMap: Map<string, RemoteEntity>,
    baseline: Map<string, FileBaselineEntry>,
    firstSync: boolean,
  ): Promise<Map<string, FileAction>> {
    const plan = new Map<string, FileAction>();
    const allPaths = new Set([...localMap.keys(), ...remoteMap.keys(), ...baseline.keys()]);

    for (const path of allPaths) {
      const inLocal = localMap.has(path);
      const inRemote = remoteMap.has(path);
      const baselineEntry = baseline.get(path);

      if (inLocal && inRemote && baselineEntry) {
        plan.set(path, await this.decideChanged(path, localMap, remoteMap, baselineEntry));
      } else if (inLocal && inRemote && !baselineEntry) {
        plan.set(path, firstSync ? await this.decideReconcile(path, remoteMap) : "conflict");
      } else if (inLocal && !inRemote && baselineEntry) {
        plan.set(path, "deleteLocal");
      } else if (!inLocal && inRemote && baselineEntry) {
        plan.set(path, "deleteRemote");
      } else if (inLocal && !inRemote && !baselineEntry) {
        plan.set(path, "push");
      } else if (!inLocal && inRemote && !baselineEntry) {
        plan.set(path, "pull");
      } else if (!inLocal && !inRemote && baselineEntry) {
        plan.set(path, "dropBaseline");
      }
    }

    return plan;
  }

  private async decideChanged(
    path: string,
    localMap: Map<string, LocalEntity>,
    remoteMap: Map<string, RemoteEntity>,
    baselineEntry: FileBaselineEntry,
  ): Promise<FileAction> {
    const local = localMap.get(path)!;
    const remote = remoteMap.get(path)!;

    const localChanged = await this.detectLocalChange(path, local, baselineEntry);
    const remoteChanged =
      remote.sizeEnc !== baselineEntry.sizeEnc || remote.mtimeServer !== baselineEntry.mtimeServer;

    if (!localChanged && !remoteChanged) return "skip";
    if (localChanged && !remoteChanged) return "push";
    if (!localChanged && remoteChanged) return "pull";
    return "conflict";
  }

  private async detectLocalChange(
    path: string,
    local: LocalEntity,
    baselineEntry: FileBaselineEntry,
  ): Promise<boolean> {
    const mtimeDiff = Math.abs(local.mtime - baselineEntry.mtimeClient);
    const sizeMatch = local.size === baselineEntry.size;
    const mtimeMatch = mtimeDiff <= MTIME_TOLERANCE_MS;

    if (mtimeMatch && sizeMatch) return false;

    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return true;

    const content = await this.vault.readBinary(file);
    const hash = this.crypto.hash(new Uint8Array(content));
    return hash !== baselineEntry.hash;
  }

  private async decideReconcile(
    path: string,
    remoteMap: Map<string, RemoteEntity>,
  ): Promise<FileAction> {
    const localHash = await this.hashLocalFile(path);
    const remoteHash = await this.hashRemoteFile(remoteMap.get(path)!.path);
    return localHash === remoteHash ? "seed" : "conflict";
  }

  private async executeTransfer(
    path: string,
    action: FileAction,
    localMap: Map<string, LocalEntity>,
    remoteMap: Map<string, RemoteEntity>,
    stats: { pushed: number; pulled: number; conflicts: number; skipped: number },
  ): Promise<void> {
    switch (action) {
      case "push": {
        await this.pushFile(path);
        stats.pushed++;
        break;
      }
      case "pull": {
        await this.pullFile(path, remoteMap.get(path)!);
        stats.pulled++;
        break;
      }
      case "seed": {
        const local = localMap.get(path)!;
        const remote = remoteMap.get(path)!;
        const hash = await this.hashLocalFile(path);
        const entry = makeBaselineEntry(path, local.mtime, local.size, hash, remote);
        await this.baselineStore.set(path, entry);
        stats.skipped++;
        break;
      }
      case "conflict": {
        await this.resolveConflict(path, remoteMap, stats);
        break;
      }
    }
  }

  private async executeDeletion(
    path: string,
    action: FileAction,
    stats: { deletedLocal: number; deletedRemote: number },
  ): Promise<void> {
    switch (action) {
      case "deleteLocal": {
        const file = this.vault.getAbstractFileByPath(path);
        if (file) await this.app.fileManager.trashFile(file);
        await this.baselineStore.dropEntry(path);
        stats.deletedLocal++;
        break;
      }
      case "deleteRemote": {
        const encPath = await this.crypto.encryptPath(path);
        await this.provider.rm(encPath);
        await this.baselineStore.dropEntry(path);
        stats.deletedRemote++;
        break;
      }
      case "dropBaseline": {
        await this.baselineStore.dropEntry(path);
        break;
      }
    }
  }

  private async pushFile(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`local file not found: ${path}`);

    const content = await this.vault.readBinary(file);
    const plaintext = new Uint8Array(content);
    const hash = this.crypto.hash(plaintext);

    const encPath = await this.crypto.encryptPath(path);
    await this.ensureRemoteFolders(path);

    const ciphertext = await this.crypto.encryptData(plaintext);
    const remoteEntity = await this.provider.writeFile(encPath, ciphertext);

    const entry = makeBaselineEntry(path, file.stat.mtime, file.stat.size, hash, remoteEntity);
    await this.baselineStore.set(path, entry);
  }

  private async pullFile(path: string, remote: RemoteEntity): Promise<void> {
    const encPath = await this.crypto.encryptPath(path);
    const ciphertext = await this.provider.readFile(encPath);
    const plaintext = await this.crypto.decryptData(ciphertext);
    const hash = this.crypto.hash(plaintext);

    await this.vault.adapter.writeBinary(path, plaintext.buffer as ArrayBuffer);

    const file = this.vault.getAbstractFileByPath(path);
    const localMtime = file instanceof TFile ? file.stat.mtime : Date.now();
    const localSize = file instanceof TFile ? file.stat.size : plaintext.byteLength;

    const entry = makeBaselineEntry(path, localMtime, localSize, hash, remote);
    await this.baselineStore.set(path, entry);
  }

  private async resolveConflict(
    path: string,
    remoteMap: Map<string, RemoteEntity>,
    stats: { conflicts: number; pushed: number; pulled: number },
  ): Promise<void> {
    const conflictName = conflictPath(path);
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.adapter.rename(file.path, conflictName);
    }

    await this.pullFile(path, remoteMap.get(path)!);
    stats.pulled++;

    await this.pushFile(conflictName);
    stats.pushed++;
    stats.conflicts++;
  }

  private async ensureRemoteFolders(vaultPath: string): Promise<void> {
    const parts = vaultPath.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const dirPath = parts.slice(0, depth).join("/");
      if (this.createdRemoteFolders.has(dirPath)) continue;
      const encDirPath = await this.crypto.encryptPath(dirPath);
      await this.provider.mkdir(encDirPath);
      this.createdRemoteFolders.add(dirPath);
    }
  }

  private async hashLocalFile(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`local file not found: ${path}`);
    const content = await this.vault.readBinary(file);
    return this.crypto.hash(new Uint8Array(content));
  }

  private async hashRemoteFile(encPath: string): Promise<string> {
    const ciphertext = await this.provider.readFile(encPath);
    const plaintext = await this.crypto.decryptData(ciphertext);
    return this.crypto.hash(plaintext);
  }
}

function makeBaselineEntry(
  path: string,
  localMtime: number,
  localSize: number,
  hash: string,
  remote: RemoteEntity,
): FileBaselineEntry {
  return {
    type: "file",
    key: path,
    mtimeClient: localMtime,
    mtimeServer: remote.mtimeServer,
    size: localSize,
    sizeEnc: remote.sizeEnc,
    hash,
  };
}

function countDeletions(plan: Map<string, FileAction>): number {
  let count = 0;
  for (const action of plan.values()) {
    if (action === "deleteLocal" || action === "deleteRemote") count++;
  }
  return count;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
