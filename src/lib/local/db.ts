import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection, type capSQLiteSet } from '@capacitor-community/sqlite';

// The Android app's on-device store (@capacitor-community/sqlite). Native only:
// the plugin's browser fallback isn't wired up, and only the lazily imported
// local-store modules use this file.
//
// Each table keeps the server row as JSON (`row_json`) plus explicit columns
// for whatever the reads filter, sort or aggregate on. Rows are rebuilt from
// the JSON, so a column added on the server reaches the app without a local
// schema change.
//
// Since Phase 3 the store can hold changes that haven't reached the server
// yet (the outbox), so schema changes are migrations that keep the data: add
// a step to MIGRATIONS and bump SCHEMA_VERSION. Never drop tables to change
// the schema.

const DB_NAME = 'expensesync';
const SCHEMA_VERSION = 2;

const TABLES = ['expenses', 'outbox', 'trackers', 'tracker_members', 'profiles', 'categories', 'banks', 'meta'];

// The full schema at SCHEMA_VERSION, for a fresh install.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  tracker_id TEXT NOT NULL,
  date TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  category_id TEXT,
  amount REAL NOT NULL,
  is_debit INTEGER NOT NULL,
  is_transfer INTEGER NOT NULL,
  row_json TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'synced',
  local_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_expenses_tracker_date ON expenses (tracker_id, date);
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_entity ON outbox (entity_id);
CREATE TABLE IF NOT EXISTS trackers (
  id TEXT PRIMARY KEY NOT NULL,
  row_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracker_members (
  id TEXT PRIMARY KEY NOT NULL,
  tracker_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  row_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_tracker ON tracker_members (tracker_id);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  row_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  tracker_id TEXT,
  is_system INTEGER NOT NULL,
  row_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS banks (
  id TEXT PRIMARY KEY NOT NULL,
  row_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

// MIGRATIONS[n] upgrades a store at version n to n + 1, keeping its data.
const MIGRATIONS: Record<number, string> = {
  // Phase 3: per-row sync state and the outbox of unpushed changes.
  1: `
ALTER TABLE expenses ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE expenses ADD COLUMN local_deleted INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_entity ON outbox (entity_id);
`,
};

const sqlite = new SQLiteConnection(CapacitorSQLite);
let dbPromise: Promise<SQLiteDBConnection> | null = null;

async function openDb(): Promise<SQLiteDBConnection> {
  // Reconciles the JS-side connection map with the native side after a
  // WebView reload, so a stale connection object isn't reused.
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const db = exists
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  if (!(await db.isDBOpen()).result) await db.open();

  await db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);');
  const stored = (await db.query("SELECT value FROM meta WHERE key = 'schema_version'")).values?.[0]?.value;
  let version = stored ? Number(stored) : 0;

  if (version === 0) {
    await db.execute(SCHEMA);
  } else if (version > SCHEMA_VERSION) {
    // Written by a newer build (only after a downgrade install): its layout is
    // unknown, so start over. Unpushed changes in it are lost.
    await db.execute(TABLES.map(t => `DROP TABLE IF EXISTS ${t};`).join('\n'));
    await db.execute(SCHEMA);
  } else {
    for (; version < SCHEMA_VERSION; version++) {
      const step = MIGRATIONS[version];
      if (!step) throw new Error(`No local-store migration from version ${version}`);
      await db.execute(step, true);
    }
  }
  if (Number(stored) !== SCHEMA_VERSION) {
    await db.run(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [String(SCHEMA_VERSION)],
    );
  }
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

export async function query<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return ((await db.query(sql, values)).values ?? []) as T[];
}

// Bumped by wipe(). A pull passes the epoch it started under, and its writes
// are refused once the store has been wiped since: otherwise a pull still in
// flight at sign-out would write the account's rows, and its "synced" flags,
// back into the emptied store.
let epoch = 0;

export function currentEpoch(): number {
  return epoch;
}

export class StoreWipedError extends Error {
  constructor() {
    super('The local store was wiped while this pull was running.');
    this.name = 'StoreWipedError';
  }
}

/**
 * Runs the statements in one transaction, in chunks to keep each bridge call
 * small. With `expectEpoch`, refuses to write if the store was wiped since.
 */
export async function runInTransaction(statements: capSQLiteSet[], expectEpoch?: number): Promise<void> {
  if (statements.length === 0) return;
  const db = await getDb();
  // Checked right before each dispatch, with no await in between, so a wipe
  // can't slip in between the check and the write.
  const check = () => {
    if (expectEpoch !== undefined && expectEpoch !== epoch) throw new StoreWipedError();
  };
  const CHUNK = 500;
  writeVersion++;
  metaCache = null;
  try {
    if (statements.length <= CHUNK) {
      check();
      await db.executeSet(statements, true);
      return;
    }
    check();
    await db.beginTransaction();
    try {
      for (let i = 0; i < statements.length; i += CHUNK) {
        check();
        await db.executeSet(statements.slice(i, i + CHUNK), false);
      }
      check();
      await db.commitTransaction();
    } catch (err) {
      await db.rollbackTransaction().catch(() => undefined);
      throw err;
    }
  } finally {
    // Again after the write, so a read during it can't leave the cache holding old values.
    writeVersion++;
    metaCache = null;
  }
}

// Reads check meta keys constantly, and every plugin call is a bridge round
// trip, so meta is cached in memory and dropped on any write.
let metaCache: Map<string, string | null> | null = null;
let writeVersion = 0;

export async function getMeta(key: string): Promise<string | null> {
  if (metaCache) return metaCache.get(key) ?? null;
  const version = writeVersion;
  const rows = await query<{ key: string; value: string | null }>('SELECT key, value FROM meta');
  const fresh = new Map(rows.map(r => [r.key, r.value]));
  // Only cache if no write started meanwhile; otherwise these values may predate it.
  if (version === writeVersion) metaCache = fresh;
  return fresh.get(key) ?? null;
}

export function setMetaStatement(key: string, value: string | null): capSQLiteSet {
  return {
    statement: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    values: [key, value],
  };
}

/** Empties every table except the schema version (sign-out, or another user signing in). */
export async function wipe(): Promise<void> {
  epoch++;
  await runInTransaction([
    ...TABLES.filter(t => t !== 'meta').map(t => ({ statement: `DELETE FROM ${t};`, values: [] })),
    { statement: "DELETE FROM meta WHERE key != 'schema_version';", values: [] },
  ]);
}
