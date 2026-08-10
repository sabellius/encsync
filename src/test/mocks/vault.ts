import { TAbstractFile, TFile } from "./obsidian";

interface StoredFile {
  content: ArrayBuffer;
  mtime: number;
}

export class MockVault {
  configDir = ".obsidian";
  private files = new Map<string, StoredFile>();
  private trashed = new Set<string>();

  readonly adapter = {
    writeBinary: async (path: string, data: ArrayBuffer): Promise<void> => {
      this.files.set(path, { content: data, mtime: Date.now() });
    },
    rename: async (oldPath: string, newPath: string): Promise<void> => {
      const file = this.files.get(oldPath);
      if (!file) throw new Error(`file not found: ${oldPath}`);
      this.files.delete(oldPath);
      this.files.set(newPath, file);
    },
    exists: async (path: string): Promise<boolean> => {
      return this.files.has(path);
    },
  };

  addFile(path: string, content: string, mtime?: number): void {
    const encoded = new TextEncoder().encode(content);
    this.files.set(path, {
      content: encoded.buffer,
      mtime: mtime ?? Date.now(),
    });
  }

  addBinaryFile(path: string, data: Uint8Array, mtime?: number): void {
    this.files.set(path, {
      content: data.buffer as ArrayBuffer,
      mtime: mtime ?? Date.now(),
    });
  }

  removeFile(path: string): void {
    this.files.delete(path);
  }

  getFile(path: string): ArrayBuffer | undefined {
    return this.files.get(path)?.content;
  }

  getFileContent(path: string): string | undefined {
    const buffer = this.files.get(path)?.content;
    if (!buffer) return undefined;
    return new TextDecoder().decode(buffer);
  }

  getFileMtime(path: string): number | undefined {
    return this.files.get(path)?.mtime;
  }

  getTrashed(): string[] {
    return [...this.trashed];
  }

  getFiles(): TFile[] {
    return [...this.files.keys()].map((path) => {
      const stored = this.files.get(path)!;
      return new TFile(path, { mtime: stored.mtime, size: stored.content.byteLength });
    });
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    if (!this.files.has(path)) return null;
    const stored = this.files.get(path)!;
    return new TFile(path, { mtime: stored.mtime, size: stored.content.byteLength });
  }

  async readBinary(file: TFile): Promise<ArrayBuffer> {
    const stored = this.files.get(file.path);
    if (!stored) throw new Error(`file not found: ${file.path}`);
    return stored.content;
  }

  trashFile(path: string): void {
    this.files.delete(path);
    this.trashed.add(path);
  }
}
