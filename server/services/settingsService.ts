import { settingsSchema, type Settings } from '../../shared/schemas.js';
import { getDb } from '../db/connection.js';

const DEFAULTS: Settings = {
  yearFormat: 'BE',
  theme: 'light',
  accentColor: 'blue',
  thaiFont: 'anuphan',
};

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const raw: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) raw[r.key] = r.value;
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULTS;
}

export function updateSettings(input: Settings): Settings {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [k, v] of Object.entries(input)) stmt.run(k, String(v));
  })();
  return getSettings();
}
