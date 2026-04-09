import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';

import { resolveDatabaseFilePath, resolveOpsClawDataDir } from './runtimePaths.js';

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');

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

const LLM_PROVIDER_TYPES = ['zhipu', 'minimax', 'qwen', 'deepseek', 'openai_compatible'] as const;

const LLM_PROVIDERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK (provider_type IN (${LLM_PROVIDER_TYPES.map((value) => `'${value}'`).join(', ')})),
    base_url TEXT,
    api_key TEXT,
    model TEXT NOT NULL DEFAULT '',
    models TEXT NOT NULL DEFAULT '[]',
    default_model TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    max_tokens INTEGER DEFAULT 4096,
    temperature REAL DEFAULT 0.7,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

function toSqlRows(
  result: Array<{ columns: string[]; values: SqliteValue[][] }>
) {
  const statement = result[0];
  if (!statement) {
    return [] as SqlRow[];
  }

  return statement.values.map((row) => {
    const item: SqlRow = {};
    statement.columns.forEach((column, index) => {
      item[column] = row[index] ?? null;
    });
    return item;
  });
}

function readString(value: SqliteValue, field: string) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function queryMany<T>(
  database: SqlDatabaseHandle,
  sql: string,
  mapRow: (row: SqlRow) => T,
  params?: SqlParams
) {
  const statement = database.prepare(sql, params);
  const rows: T[] = [];

  try {
    while (statement.step()) {
      rows.push(mapRow(statement.getAsObject()));
    }
  } finally {
    statement.free();
  }

  return rows;
}

function queryTableColumns(database: SqlDatabaseHandle, tableName: string) {
  const rows = queryMany(
    database,
    `PRAGMA table_info(${tableName})`,
    (row) => readString(row.name, 'name')
  );

  return new Set(rows);
}

function readNullableString(value: SqliteValue, field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function assertNoScriptAliasCollisions(database: SqlDatabaseHandle) {
  const globalCollisions = queryMany(
    database,
    `
      SELECT alias
      FROM script_library
      WHERE scope = 'global'
      GROUP BY alias
      HAVING COUNT(*) > 1
    `,
    (row) => readString(row.alias, 'alias')
  );

  if (globalCollisions.length > 0) {
    const aliases = globalCollisions.map((alias) => `"${alias}"`).join(', ');
    throw new Error(`Script library migration failed: duplicate global aliases found: ${aliases}.`);
  }

  const nodeCollisions = queryMany(
    database,
    `
      SELECT node_id, alias
      FROM script_library
      WHERE scope = 'node'
      GROUP BY node_id, alias
      HAVING COUNT(*) > 1
    `,
    (row) => ({
      nodeId: readNullableString(row.node_id, 'node_id'),
      alias: readString(row.alias, 'alias'),
    })
  );

  if (nodeCollisions.length > 0) {
    const entries = nodeCollisions
      .map((item) => `node_id=${item.nodeId ?? 'NULL'}, alias="${item.alias}"`)
      .join('; ');
    throw new Error(`Script library migration failed: duplicate node aliases found: ${entries}.`);
  }
}

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

function ensureCommandHistoryTable(database: SqlDatabaseHandle) {
  database.run(`
    CREATE TABLE IF NOT EXISTS command_history (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      node_id TEXT,
      rank INTEGER NOT NULL DEFAULT 1,
      last_used INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_ch_node_id ON command_history(node_id);`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_ch_last_used ON command_history(last_used DESC);`);
}

function ensureLlmProvidersTable(database: SqlDatabaseHandle) {
  database.run(LLM_PROVIDERS_TABLE_SQL);
  database.run(`CREATE INDEX IF NOT EXISTS idx_llm_enabled ON llm_providers(enabled);`);

  const tableRows = toSqlRows(
    database.exec(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'llm_providers';`)
  );
  const tableSql = typeof tableRows[0]?.sql === 'string' ? tableRows[0].sql : '';

  const infoRows = toSqlRows(database.exec('PRAGMA table_info(llm_providers);'));
  const cols = new Set(
    infoRows
      .map((row) => row.name)
      .filter((value): value is string => typeof value === 'string')
  );

  const needsRebuild =
    !cols.has('models') ||
    !cols.has('default_model') ||
    !tableSql.includes('openai_compatible');

  if (!needsRebuild) {
    return;
  }

  const legacyRows = toSqlRows(database.exec('SELECT * FROM llm_providers;'));

  database.run('ALTER TABLE llm_providers RENAME TO llm_providers_legacy;');
  database.run(LLM_PROVIDERS_TABLE_SQL);

  for (const row of legacyRows) {
    const rawModel = typeof row.model === 'string' ? row.model : '';
    const rawModels = typeof row.models === 'string' ? row.models : null;
    let models = rawModel ? [rawModel] : [];

    if (rawModels) {
      try {
        const parsedModels = JSON.parse(rawModels) as unknown;
        if (
          Array.isArray(parsedModels) &&
          parsedModels.every((item) => typeof item === 'string' && item.trim())
        ) {
          models = parsedModels as string[];
        }
      } catch {
        models = rawModel ? [rawModel] : [];
      }
    }

    const rawDefaultModel =
      typeof row.default_model === 'string' && row.default_model.trim()
        ? row.default_model.trim()
        : rawModel;
    const defaultModel = rawDefaultModel || models[0] || '';
    if (defaultModel && !models.includes(defaultModel)) {
      models = [...models, defaultModel];
    }

    database.run(
      `INSERT INTO llm_providers (
        id, name, provider_type, base_url, api_key, model, models, default_model,
        enabled, is_default, max_tokens, temperature, created_at, updated_at
      ) VALUES (
        :id, :name, :providerType, :baseUrl, :apiKey, :model, :models, :defaultModel,
        :enabled, :isDefault, :maxTokens, :temperature, :createdAt, :updatedAt
      );`,
      {
        ':id': row.id as string,
        ':name': row.name as string,
        ':providerType': row.provider_type as string,
        ':baseUrl': (row.base_url as string | null) ?? null,
        ':apiKey': (row.api_key as string | null) ?? null,
        ':model': defaultModel,
        ':models': JSON.stringify(models),
        ':defaultModel': defaultModel || null,
        ':enabled': typeof row.enabled === 'number' ? row.enabled : 1,
        ':isDefault': typeof row.is_default === 'number' ? row.is_default : 0,
        ':maxTokens': typeof row.max_tokens === 'number' ? row.max_tokens : 4096,
        ':temperature': typeof row.temperature === 'number' ? row.temperature : 0.7,
        ':createdAt':
          (typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()),
        ':updatedAt':
          (typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString()),
      }
    );
  }

  database.run('DROP TABLE llm_providers_legacy;');
  database.run(`CREATE INDEX IF NOT EXISTS idx_llm_enabled ON llm_providers(enabled);`);
}

function ensureScriptLibraryTable(database: SqlDatabaseHandle) {
  database.run(`
    CREATE TABLE IF NOT EXISTS script_library (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      alias TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'node')),
      node_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('plain', 'template')),
      content TEXT NOT NULL,
      variables_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scope, node_id, key)
    );
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_script_library_scope ON script_library(scope);`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_script_library_node_id ON script_library(node_id);`);
}

function ensureScriptLibraryAliasColumn(database: SqlDatabaseHandle) {
  const columns = queryTableColumns(database, 'script_library');
  if (!columns.has('alias')) {
    database.run(`ALTER TABLE script_library ADD COLUMN alias TEXT NOT NULL DEFAULT '';`);
  }
  database.run(`UPDATE script_library SET alias = key WHERE alias = '';`);
  assertNoScriptAliasCollisions(database);

  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_script_library_global_alias
    ON script_library(alias)
    WHERE scope = 'global';
  `);
  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_script_library_node_alias
    ON script_library(node_id, alias)
    WHERE scope = 'node';
  `);
}

let databasePromise: Promise<SqliteDatabase> | null = null;

function getDatabaseFilePath() {
  return resolveDatabaseFilePath(
    resolveOpsClawDataDir({
      cwd: process.cwd(),
      env: process.env,
    })
  );
}

async function createDatabase(): Promise<SqliteDatabase> {
  const databaseFilePath = getDatabaseFilePath();
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
  ensureCommandHistoryTable(database);
  ensureLlmProvidersTable(database);
  ensureScriptLibraryTable(database);
  ensureScriptLibraryAliasColumn(database);

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
