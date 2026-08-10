import type { RemoteEntity, SyncProvider } from "../../providers/base";
import type { ProviderKind } from "../../types";

interface StoredRemoteFile {
  data: Uint8Array;
  mtime: number;
  size: number;
}

export class FakeProvider implements SyncProvider {
  readonly kind: ProviderKind = "webdav";
  private files = new Map<string, StoredRemoteFile>();

  async checkConnect(): Promise<void> {}

  async ensureRoot(): Promise<void> {}

  async walk(): Promise<RemoteEntity[]> {
    const entities: RemoteEntity[] = [];
    for (const [path, file] of this.files) {
      entities.push({
        path,
        type: "file",
        sizeEnc: file.size,
        mtimeServer: file.mtime,
      });
    }
    return entities;
  }

  async stat(path: string): Promise<RemoteEntity | null> {
    const file = this.files.get(path);
    if (!file) return null;
    return {
      path,
      type: "file",
      sizeEnc: file.size,
      mtimeServer: file.mtime,
    };
  }

  async readFile(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) throw new Error(`remote file not found: ${path}`);
    return file.data;
  }

  async writeFile(path: string, data: Uint8Array): Promise<RemoteEntity> {
    const stored: StoredRemoteFile = {
      data: new Uint8Array(data),
      mtime: Date.now(),
      size: data.byteLength,
    };
    this.files.set(path, stored);
    return {
      path,
      type: "file",
      sizeEnc: stored.size,
      mtimeServer: stored.mtime,
    };
  }

  async mkdir(): Promise<void> {}

  async rm(path: string): Promise<void> {
    this.files.delete(path);
  }

  async getUserDisplayName(): Promise<string | null> {
    return "test-user";
  }

  async listRootFolders(): Promise<string[]> {
    return [];
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  getFileData(path: string): Uint8Array | undefined {
    return this.files.get(path)?.data;
  }
}
