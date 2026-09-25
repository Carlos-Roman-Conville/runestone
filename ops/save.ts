/**
 * SavePort: durable key-value storage for Progress.serialize() output and settings.
 * Real implementation: Capacitor Preferences on phone, localStorage on web. Tests use ops/fake/fakeSave.ts.
 * Values are JSON strings; the caller owns the schema and its migrations.
 */
export interface SavePort {
  load(key: string): Promise<string | null>;
  store(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
