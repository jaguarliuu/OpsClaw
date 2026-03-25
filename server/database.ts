import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
const databaseFilePath = path.resolve(process.cwd(), 'data', 'opsclaw.sqlite');

const schema = `
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT '默认',
    group_id TEXT REFERENCES groups(id),
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_mode TEXT NOT NULL CHECK (auth_mode IN ('password', 'privateKey')),
    password TEXT,
    private_key TEXT,
    passphrase TEXT,
    password_encrypted TEXT,
    private_key_encrypted TEXT,
    passphrase_encrypted TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_group_name ON nodes(group_name);
  CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
`;

export type SqliteDatabase = {
  database: SqlDatabaseHandle;
  persist: () => Promise<void>;
  close: () => Promise<void>;
};

export type SqliteValue = number | string | Uint8Array | null;
export type SqlParams = Record<string, SqliteValue>;
export type SqlRow = Record<string, SqliteValue>;

export type SqlStatementHandle = {
  step: () => boolean;
  getAsObject: (params?: SqlParams | SqliteValue[] | null) => SqlRow;
  free: () => void;
};

export type SqlDatabaseHandle = {
  exec: (sql: string, params?: SqlParams | SqliteValue[] | null) => Array<{ columns: string[]; values: SqliteValue[][] }>;
  run: (sql: string, params?: SqlParams | SqliteValue[] | null) => void;
  prepare: (sql: string, params?: SqlParams | SqliteValue[] | null) => SqlStatementHandle;
  export: () => Uint8Array;
  close: () => void;
  getRowsModified: () => number;
};

function ensureNodeCredentialColumns(database: SqlDatabaseHandle) {
  const result = database.exec('PRAGMA table_info(nodes);');
  const rows = result[0]?.values ?? [];
  const existingColumns = new Set(
    rows
      .map((row) => row[1])
      .filter((value): value is string => typeof value === 'string')
  );

  if (!existingColumns.has('password_encrypted')) {
    database.run('ALTER TABLE nodes ADD COLUMN password_encrypted TEXT;');
  }

  if (!existingColumns.has('private_key_encrypted')) {
    database.run('ALTER TABLE nodes ADD COLUMN private_key_encrypted TEXT;');
  }

  if (!existingColumns.has('passphrase_encrypted')) {
    database.run('ALTER TABLE nodes ADD COLUMN passphrase_encrypted TEXT;');
  }

  if (!existingColumns.has('group_id')) {
    database.run('ALTER TABLE nodes ADD COLUMN group_id TEXT REFERENCES groups(id);');
    database.run('CREATE INDEX IF NOT EXISTS idx_nodes_group_id ON nodes(group_id);');
  }

  if (!existingColumns.has('jump_host_id')) {
    database.run('ALTER TABLE nodes ADD COLUMN jump_host_id TEXT;');
  }
}

let databasePromise: Promise<SqliteDatabase> | null = null;

async function createDatabase(): Promise<SqliteDatabase> {
  await fs.mkdir(path.dirname(databaseFilePath), { recursive: true });

  const SQL = await initSqlJs({
    locateFile(file) {
      if (file === 'sql-wasm.wasm') {
        return wasmPath;
      }

      return file;
    },
  });

  let initialData: Uint8Array | undefined;

  try {
    const file = await fs.readFile(databaseFilePath);
    initialData = new Uint8Array(file);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }

  const database = new SQL.Database(initialData) as unknown as SqlDatabaseHandle;
  database.run('PRAGMA foreign_keys = ON;');
  database.run(schema);
  ensureNodeCredentialColumns(database);

  let persistQueue = Promise.resolve();

  const persist = () => {
    const bytes = Buffer.from(database.export());
    persistQueue = persistQueue.then(() => fs.writeFile(databaseFilePath, bytes));
    return persistQueue;
  };

  if (!initialData) {
    await persist();
  }

  return {
    database,
    persist,
    async close() {
      await persistQueue;
      database.close();
    },
  };
}

export function getSqliteDatabase() {
  if (!databasePromise) {
    databasePromise = createDatabase();
  }

  return databasePromise;
}
