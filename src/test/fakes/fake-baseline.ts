import type { BaselineStore } from "../../sync/baseline";
import type { BaselineEntry } from "../../types";

export class FakeBaselineStore implements BaselineStore {
  private entries = new Map<string, BaselineEntry>();

  async set(key: string, entry: BaselineEntry): Promise<void> {
    this.entries.set(key, entry);
  }

  async dropEntry(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async getAll(): Promise<Map<string, BaselineEntry>> {
    return new Map(this.entries);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): BaselineEntry | undefined {
    return this.entries.get(key);
  }
}
