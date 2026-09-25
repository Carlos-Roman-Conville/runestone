import type { SavePort } from "../save.js";

/**
 * SavePort over Web Storage. Works in the browser and inside the Capacitor WebView,
 * where localStorage persists with the app. Step 7 may swap the phone to Capacitor
 * Preferences if a device wipes WebView storage; the key schema stays the same.
 */
export class LocalStorageSave implements SavePort {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  async load(key: string): Promise<string | null> {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  async store(key: string, value: string): Promise<void> {
    this.storage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(key);
  }
}
