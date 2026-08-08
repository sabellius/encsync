import localforage from "localforage";
import type { BaselineEntry, ProviderKind } from "../types";

const DATABASE_NAME = "encsync";

export class BaselineStore {
  private constructor(private readonly store: LocalForage) {}

  static create(kind: ProviderKind): BaselineStore {
    const store = localforage.createInstance({
      name: DATABASE_NAME,
      storeName: kind,
    });
    return new BaselineStore(store);
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
