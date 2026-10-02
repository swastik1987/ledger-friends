import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

// Phase 0 spike (throwaway) — see docs/android-spike-runbook.md.
// Proves @capacitor-community/sqlite works in the Android WebView and that its
// data survives app kills. Native-only: the plugin's browser fallback
// (jeep-sqlite/WASM) isn't wired up, so this refuses to run on the web.
//
// expenses stores the full server row as JSON (row_json) instead of mirroring
// every column — enough to prove the sync mechanics. Phase 2 replaces it with
// explicit columns that React Query can read directly.

const DB_NAME = 'expensesync_spike';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  tracker_id TEXT NOT NULL,
  date TEXT NOT NULL,
  updated_at TEXT,
  row_json TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'synced'
);
CREATE INDEX IF NOT EXISTS idx_expenses_tracker_date ON expenses (tracker_id, date);
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

const sqlite = new SQLiteConnection(CapacitorSQLite);
let dbPromise: Promise<SQLiteDBConnection> | null = null;

async function openDb(): Promise<SQLiteDBConnection> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('The SQLite spike only runs in the Android build.');
  }
  // Reconciles the JS-side connection map with the native side after a
  // WebView reload, so a stale connection object isn't reused.
  await sqlite.checkConnectionsConsistency();
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const db = exists
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  if (!(await db.isDBOpen()).result) await db.open();
  await db.execute(SCHEMA);
  return db;
}

export function getDb(): Promise<SQLiteDBConnection> {
  if (!dbPromise) {
    dbPromise = openDb().catch(err => {
      dbPromise = null; // let the next call retry
      throw err;
    });
  }
  return dbPromise;
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const res = await db.query('SELECT value FROM meta WHERE key = ?', [key]);
  return (res.values?.[0]?.value as string | undefined) ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
