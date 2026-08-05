import type { ProviderKind } from "../types";

export interface RemoteEntity {
  path: string;
  type: "file" | "folder";
  sizeEnc: number;
  mtimeSvr: number;
}

export type ProviderErrorKind = "not-found" | "auth" | "network" | "server" | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

export interface SyncProvider {
  readonly kind: ProviderKind;
  checkConnect(): Promise<void>;
  getUserDisplayName(): Promise<string | null>;
  listRootFolders(): Promise<string[]>;
  walk(): Promise<RemoteEntity[]>;
  stat(path: string): Promise<RemoteEntity | null>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<RemoteEntity>;
  mkdir(path: string): Promise<void>;
  rm(path: string): Promise<void>;
}
