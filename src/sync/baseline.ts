import localforage from "localforage";
import type { BaselineEntry, ProviderKind } from "../types";

const DATABASE_NAME = "encsync";

export interface BaselineStore {
  set(key: string, entry: BaselineEntry): Promise<void>;
  dropEntry(key: string): Promise<void>;
  getAll(): Promise<Map<string, BaselineEntry>>;
  clear(): Promise<void>;
}

export class LocalBaselineStore implements BaselineStore {
  private constructor(private readonly store: LocalForage) {}

  static create(kind: ProviderKind): LocalBaselineStore {
    const store = localforage.createInstance({
      name: DATABASE_NAME,
      storeName: kind,
    });
    return new LocalBaselineStore(store);
  }

  async set(key: string, entry: BaselineEntry): Promise<void> {
    await this.store.setItem<BaselineEntry>(key, entry);
  }

  async dropEntry(key: string): Promise<void> {
    await this.store.removeItem(key);
  }

  async getAll(): Promise<Map<string, BaselineEntry>> {
    const entries = new Map<string, BaselineEntry>();
    await this.store.iterate<BaselineEntry, void>((value, key) => {
      entries.set(key, value);
    });
    return entries;
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }
}
