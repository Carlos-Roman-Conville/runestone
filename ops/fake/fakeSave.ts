import type { SavePort } from "../save.js";

/** In-memory store. `snapshot()` lets a test simulate a restart by constructing a new FakeSave from it. */
export class FakeSave implements SavePort {
  private readonly data: Map<string, string>;

  constructor(initial?: Record<string, string>) {
    this.data = new Map(Object.entries(initial ?? {}));
  }

  async load(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async store(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}
