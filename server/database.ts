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
const SFTP_TRANSFER_DIRECTIONS = ['upload', 'download'] as const;
const SFTP_TRANSFER_STATUSES = [
  'queued',
  'running',
  'paused',
  'retrying',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
] as const;
const SFTP_CHECKSUM_STATUSES = ['pending', 'matched', 'mismatch', 'skipped'] as const;

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

const SFTP_TRANSFER_TASKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sftp_transfer_tasks (
    task_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN (${SFTP_TRANSFER_DIRECTIONS.map((value) => `'${value}'`).join(', ')})),
    local_path TEXT NOT NULL,
    remote_path TEXT NOT NULL,
    temp_local_path TEXT,
    temp_remote_path TEXT,
    total_bytes INTEGER CHECK (total_bytes IS NULL OR total_bytes >= 0),
    transferred_bytes INTEGER NOT NULL CHECK (transferred_bytes >= 0),
    last_confirmed_offset INTEGER NOT NULL CHECK (last_confirmed_offset >= 0),
    chunk_size INTEGER NOT NULL CHECK (chunk_size > 0),
    status TEXT NOT NULL CHECK (status IN (${SFTP_TRANSFER_STATUSES.map((value) => `'${value}'`).join(', ')})),
    retry_count INTEGER NOT NULL CHECK (retry_count >= 0),
    error_message TEXT,
    checksum_status TEXT NOT NULL CHECK (checksum_status IN (${SFTP_CHECKSUM_STATUSES.map((value) => `'${value}'`).join(', ')})),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (total_bytes IS NULL OR transferred_bytes <= total_bytes),
    CHECK (last_confirmed_offset <= transferred_bytes)
  );
`;

const sftpTransferDirectionSet = new Set<string>(SFTP_TRANSFER_DIRECTIONS);
const sftpTransferStatusSet = new Set<string>(SFTP_TRANSFER_STATUSES);
const sftpChecksumStatusSet = new Set<string>(SFTP_CHECKSUM_STATUSES);

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseCheckInValues(tableSql: string, columnName: string) {
  const normalized = normalizeSql(tableSql);
  const match = normalized.match(new RegExp(`${columnName}\\s+in\\s*\\(([^)]*)\\)`));
  if (!match?.[1]) {
    return null;
  }

  const values = match[1]
    .split(',')
    .map((item) => item.trim())
    .map((item) => item.replace(/^'/, '').replace(/'$/, ''))
    .filter(Boolean);

  return new Set(values);
}

function hasExpectedCheckEnumValues(tableSql: string, columnName: string, expectedValues: readonly string[]) {
  const actualValues = parseCheckInValues(tableSql, columnName);
  if (!actualValues) {
    return false;
  }

  if (actualValues.size !== expectedValues.length) {
    return false;
  }

  return expectedValues.every((value) => actualValues.has(value.toLowerCase()));
}

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

function readNumber(value: SqliteValue, field: string) {
  if (typeof value !== 'number') {
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

type TableColumnInfo = {
  name: string;
  type: string;
  notNull: boolean;
};

function queryTableInfo(database: SqlDatabaseHandle, tableName: string) {
  return queryMany(
    database,
    `PRAGMA table_info(${tableName})`,
    (row): TableColumnInfo => ({
      name: readString(row.name, 'name'),
      type: typeof row.type === 'string' ? row.type : '',
      notNull: row.notnull === 1,
    })
  );
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

function readNullableNumber(value: SqliteValue, field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readSftpTransferDirection(value: SqliteValue) {
  if (typeof value !== 'string' || !sftpTransferDirectionSet.has(value)) {
    throw new Error(`Invalid sftp_transfer_tasks direction value: ${String(value)}.`);
  }

  return value;
}

function readSftpTransferStatus(value: SqliteValue) {
  if (typeof value !== 'string' || !sftpTransferStatusSet.has(value)) {
    throw new Error(`Invalid sftp_transfer_tasks status value: ${String(value)}.`);
  }

  return value;
}

function readSftpChecksumStatus(value: SqliteValue) {
  if (typeof value !== 'string' || !sftpChecksumStatusSet.has(value)) {
    throw new Error(`Invalid sftp_transfer_tasks checksum_status value: ${String(value)}.`);
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

function ensureSftpHostKeysTable(database: SqlDatabaseHandle) {
  database.run(`
    CREATE TABLE IF NOT EXISTS sftp_host_keys (
      node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
      algorithm TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      seen_at TEXT NOT NULL
    );
  `);
}

function ensureSftpTransferTasksTable(database: SqlDatabaseHandle) {
  const tableInfo = queryTableInfo(database, 'sftp_transfer_tasks');
  const columns = new Map(tableInfo.map((column) => [column.name, column]));
  const tableRows = toSqlRows(
    database.exec(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sftp_transfer_tasks';`)
  );
  const tableSql = typeof tableRows[0]?.sql === 'string' ? tableRows[0].sql : '';
  const requiredColumns = [
    'task_id',
    'node_id',
    'direction',
    'local_path',
    'remote_path',
    'temp_local_path',
    'temp_remote_path',
    'total_bytes',
    'transferred_bytes',
    'last_confirmed_offset',
    'chunk_size',
    'status',
    'retry_count',
    'error_message',
    'checksum_status',
    'created_at',
    'updated_at',
  ];

  if (columns.size === 0) {
    database.run(SFTP_TRANSFER_TASKS_TABLE_SQL);
  } else {
    const hasRequiredColumns = requiredColumns.every((column) => columns.has(column));
    const hasEnumChecks =
      hasExpectedCheckEnumValues(tableSql, 'direction', SFTP_TRANSFER_DIRECTIONS) &&
      hasExpectedCheckEnumValues(tableSql, 'status', SFTP_TRANSFER_STATUSES) &&
      hasExpectedCheckEnumValues(tableSql, 'checksum_status', SFTP_CHECKSUM_STATUSES);
    const hasCounterChecks =
      tableSql.includes(`total_bytes IS NULL OR total_bytes >= 0`) &&
      tableSql.includes(`transferred_bytes >= 0`) &&
      tableSql.includes(`last_confirmed_offset >= 0`) &&
      tableSql.includes(`chunk_size > 0`) &&
      tableSql.includes(`retry_count >= 0`) &&
      tableSql.includes(`transferred_bytes <= total_bytes`) &&
      tableSql.includes(`last_confirmed_offset <= transferred_bytes`);
    const needsRebuild = !hasRequiredColumns || !hasEnumChecks || !hasCounterChecks;

    if (needsRebuild) {
      const canMigrateRows =
        columns.has('task_id') &&
        columns.has('node_id') &&
        columns.has('direction') &&
        columns.has('local_path') &&
        columns.has('remote_path') &&
        columns.has('transferred_bytes') &&
        columns.has('last_confirmed_offset') &&
        columns.has('chunk_size') &&
        columns.has('status') &&
        columns.has('retry_count') &&
        columns.has('checksum_status') &&
        columns.has('created_at') &&
        columns.has('updated_at');

      if (!canMigrateRows) {
        const countRows = queryMany(
          database,
          `SELECT COUNT(*) AS count FROM sftp_transfer_tasks`,
          (row) => readNumber(row.count, 'count')
        );
        const rowCount = countRows[0] ?? 0;
        if (rowCount > 0) {
          throw new Error(
            'SFTP transfer tasks migration failed: legacy table is missing required columns with existing rows.'
          );
        }
      }

      const legacyRows = canMigrateRows
        ? queryMany(
            database,
            `
              SELECT
                task_id,
                node_id,
                direction,
                local_path,
                remote_path,
                ${columns.has('temp_local_path') ? 'temp_local_path' : 'NULL AS temp_local_path'},
                ${columns.has('temp_remote_path') ? 'temp_remote_path' : 'NULL AS temp_remote_path'},
                ${columns.has('total_bytes') ? 'total_bytes' : 'NULL AS total_bytes'},
                transferred_bytes,
                last_confirmed_offset,
                chunk_size,
                status,
                retry_count,
                ${columns.has('error_message') ? 'error_message' : 'NULL AS error_message'},
                checksum_status,
                created_at,
                updated_at
              FROM sftp_transfer_tasks
            `,
            (row) => {
              const taskId = readString(row.task_id, 'task_id');
              const totalBytes = readNullableNumber(row.total_bytes, 'total_bytes');
              const transferredBytes = readNumber(row.transferred_bytes, 'transferred_bytes');
              const lastConfirmedOffset = readNumber(row.last_confirmed_offset, 'last_confirmed_offset');
              const chunkSize = readNumber(row.chunk_size, 'chunk_size');
              const retryCount = readNumber(row.retry_count, 'retry_count');

              if (totalBytes !== null && totalBytes < 0) {
                throw new Error(`Invalid sftp_transfer_tasks total_bytes value for task "${taskId}".`);
              }
              if (transferredBytes < 0) {
                throw new Error(`Invalid sftp_transfer_tasks transferred_bytes value for task "${taskId}".`);
              }
              if (lastConfirmedOffset < 0) {
                throw new Error(`Invalid sftp_transfer_tasks last_confirmed_offset value for task "${taskId}".`);
              }
              if (chunkSize <= 0) {
                throw new Error(`Invalid sftp_transfer_tasks chunk_size value for task "${taskId}".`);
              }
              if (retryCount < 0) {
                throw new Error(`Invalid sftp_transfer_tasks retry_count value for task "${taskId}".`);
              }
              if (totalBytes !== null && transferredBytes > totalBytes) {
                throw new Error(
                  `Invalid sftp_transfer_tasks bytes relationship for task "${taskId}": transferred_bytes exceeds total_bytes.`
                );
              }
              if (lastConfirmedOffset > transferredBytes) {
                throw new Error(
                  `Invalid sftp_transfer_tasks offset relationship for task "${taskId}": last_confirmed_offset exceeds transferred_bytes.`
                );
              }

              return {
                taskId,
                nodeId: readString(row.node_id, 'node_id'),
                direction: readSftpTransferDirection(row.direction),
                localPath: readString(row.local_path, 'local_path'),
                remotePath: readString(row.remote_path, 'remote_path'),
                tempLocalPath: readNullableString(row.temp_local_path, 'temp_local_path'),
                tempRemotePath: readNullableString(row.temp_remote_path, 'temp_remote_path'),
                totalBytes,
                transferredBytes,
                lastConfirmedOffset,
                chunkSize,
                status: readSftpTransferStatus(row.status),
                retryCount,
                errorMessage: readNullableString(row.error_message, 'error_message'),
                checksumStatus: readSftpChecksumStatus(row.checksum_status),
                createdAt: readString(row.created_at, 'created_at'),
                updatedAt: readString(row.updated_at, 'updated_at'),
              };
            }
          )
        : [];

      database.run('ALTER TABLE sftp_transfer_tasks RENAME TO sftp_transfer_tasks_legacy;');
      database.run(SFTP_TRANSFER_TASKS_TABLE_SQL);

      for (const row of legacyRows) {
        database.run(
          `
            INSERT INTO sftp_transfer_tasks (
              task_id, node_id, direction, local_path, remote_path, temp_local_path, temp_remote_path,
              total_bytes, transferred_bytes, last_confirmed_offset, chunk_size, status, retry_count,
              error_message, checksum_status, created_at, updated_at
            ) VALUES (
              :taskId, :nodeId, :direction, :localPath, :remotePath, :tempLocalPath, :tempRemotePath,
              :totalBytes, :transferredBytes, :lastConfirmedOffset, :chunkSize, :status, :retryCount,
              :errorMessage, :checksumStatus, :createdAt, :updatedAt
            );
          `,
          {
            ':taskId': row.taskId,
            ':nodeId': row.nodeId,
            ':direction': row.direction,
            ':localPath': row.localPath,
            ':remotePath': row.remotePath,
            ':tempLocalPath': row.tempLocalPath,
            ':tempRemotePath': row.tempRemotePath,
            ':totalBytes': row.totalBytes,
            ':transferredBytes': row.transferredBytes,
            ':lastConfirmedOffset': row.lastConfirmedOffset,
            ':chunkSize': row.chunkSize,
            ':status': row.status,
            ':retryCount': row.retryCount,
            ':errorMessage': row.errorMessage,
            ':checksumStatus': row.checksumStatus,
            ':createdAt': row.createdAt,
            ':updatedAt': row.updatedAt,
          }
        );
      }

      database.run('DROP TABLE sftp_transfer_tasks_legacy;');
    }
  }

  database.run(`CREATE INDEX IF NOT EXISTS idx_sftp_transfer_tasks_node_id ON sftp_transfer_tasks(node_id);`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_sftp_transfer_tasks_status ON sftp_transfer_tasks(status);`);
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
      usage TEXT NOT NULL DEFAULT 'quick_run' CHECK (usage IN ('quick_run', 'inspection')),
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

function ensureScriptLibraryUsageColumn(database: SqlDatabaseHandle) {
  const columns = queryTableColumns(database, 'script_library');
  if (!columns.has('usage')) {
    database.run(`
      ALTER TABLE script_library
      ADD COLUMN usage TEXT NOT NULL DEFAULT 'quick_run'
      CHECK (usage IN ('quick_run', 'inspection'));
    `);
  }

  database.run(`
    UPDATE script_library
    SET usage = 'quick_run'
    WHERE usage IS NULL OR usage = '';
  `);
}

function ensureNodeInspectionProfilesTable(database: SqlDatabaseHandle) {
  const columns = queryTableColumns(database, 'node_inspection_profiles');
  const requiredColumns = ['node_id', 'script_id', 'dashboard_schema_key', 'created_at', 'updated_at'];
  if (columns.size === 0) {
    database.run(`
      CREATE TABLE IF NOT EXISTS node_inspection_profiles (
        node_id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        dashboard_schema_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    return;
  }

  const needsRebuild = requiredColumns.some((column) => !columns.has(column));
  if (!needsRebuild) {
    return;
  }

  database.run('ALTER TABLE node_inspection_profiles RENAME TO node_inspection_profiles_legacy;');
  database.run(`
    CREATE TABLE node_inspection_profiles (
      node_id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      dashboard_schema_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  database.run('DROP TABLE node_inspection_profiles_legacy;');
}

function ensureNodeInspectionSnapshotsTable(database: SqlDatabaseHandle) {
  const tableInfo = queryTableInfo(database, 'node_inspection_snapshots');
  const columns = new Map(tableInfo.map((column) => [column.name, column]));
  const tableRows = toSqlRows(
    database.exec(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'node_inspection_snapshots';`)
  );
  const tableSql = typeof tableRows[0]?.sql === 'string' ? tableRows[0].sql : '';
  const requiredColumns = ['id', 'node_id', 'status', 'payload_json', 'error_message', 'created_at', 'created_at_ms'];

  if (columns.size === 0) {
    database.run(`
      CREATE TABLE IF NOT EXISTS node_inspection_snapshots (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'error')),
        payload_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
    `);
  } else {
    const hasRequiredColumns = requiredColumns.every((column) => columns.has(column));
    const payloadAllowsNull = columns.get('payload_json')?.notNull === false;
    const createdAtMsType = columns.get('created_at_ms')?.type.toUpperCase() ?? '';
    const createdAtMsLooksNumeric = createdAtMsType.includes('INT') || createdAtMsType.includes('NUM');
    const statusMatchesCurrentConstraint =
      tableSql.includes(`'success'`) &&
      tableSql.includes(`'error'`) &&
      !tableSql.includes(`'failed'`);
    const needsRebuild =
      !hasRequiredColumns ||
      !payloadAllowsNull ||
      !createdAtMsLooksNumeric ||
      !statusMatchesCurrentConstraint;

    if (needsRebuild) {
      const canMigrateRows =
        columns.has('id') &&
        columns.has('node_id') &&
        columns.has('status') &&
        columns.has('created_at');
      const legacyRows = canMigrateRows
        ? queryMany(
            database,
            `
              SELECT
                id,
                node_id,
                status,
                ${columns.has('payload_json') ? 'payload_json' : 'NULL AS payload_json'},
                ${columns.has('error_message') ? 'error_message' : 'NULL AS error_message'},
                created_at,
                ${columns.has('created_at_ms') ? 'created_at_ms' : 'NULL AS created_at_ms'}
              FROM node_inspection_snapshots
            `,
            (row) => {
              const rawStatus = readString(row.status, 'status');
              const createdAt = readString(row.created_at, 'created_at');
              const parsedCreatedAtMs = Date.parse(createdAt);
              return {
                id: readString(row.id, 'id'),
                nodeId: readString(row.node_id, 'node_id'),
                status: rawStatus === 'failed' ? 'error' : rawStatus === 'error' ? 'error' : 'success',
                payloadJson: readNullableString(row.payload_json, 'payload_json'),
                errorMessage: readNullableString(row.error_message, 'error_message'),
                createdAt,
                createdAtMs:
                  typeof row.created_at_ms === 'number'
                    ? row.created_at_ms
                    : Number.isFinite(parsedCreatedAtMs)
                      ? parsedCreatedAtMs
                      : Date.now(),
              };
            }
          )
        : [];

      database.run('ALTER TABLE node_inspection_snapshots RENAME TO node_inspection_snapshots_legacy;');
      database.run(`
        CREATE TABLE node_inspection_snapshots (
          id TEXT PRIMARY KEY,
          node_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('success', 'error')),
          payload_json TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL
        );
      `);

      for (const row of legacyRows) {
        database.run(
          `
            INSERT INTO node_inspection_snapshots (
              id, node_id, status, payload_json, error_message, created_at, created_at_ms
            ) VALUES (
              :id, :nodeId, :status, :payloadJson, :errorMessage, :createdAt, :createdAtMs
            );
          `,
          {
            ':id': row.id,
            ':nodeId': row.nodeId,
            ':status': row.status,
            ':payloadJson': row.payloadJson,
            ':errorMessage': row.errorMessage,
            ':createdAt': row.createdAt,
            ':createdAtMs': row.createdAtMs,
          }
        );
      }

      database.run('DROP TABLE node_inspection_snapshots_legacy;');
    }
  }

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_node_inspection_snapshots_node_created_at
    ON node_inspection_snapshots(node_id, created_at_ms DESC);
  `);
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_node_inspection_snapshots_node_status_created_at
    ON node_inspection_snapshots(node_id, status, created_at_ms DESC);
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
  ensureSftpHostKeysTable(database);
  ensureSftpTransferTasksTable(database);
  ensureLlmProvidersTable(database);
  ensureScriptLibraryTable(database);
  ensureScriptLibraryAliasColumn(database);
  ensureScriptLibraryUsageColumn(database);
  ensureNodeInspectionProfilesTable(database);
  ensureNodeInspectionSnapshotsTable(database);

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
    const initializingPromise = createDatabase();
    const recoverablePromise = initializingPromise.catch((error) => {
      if (databasePromise === recoverablePromise) {
        databasePromise = null;
      }
      throw error;
    });
    databasePromise = recoverablePromise;
  }

  return databasePromise;
}

export async function resetSqliteDatabaseForTests() {
  if (!databasePromise) {
    return;
  }

  const currentPromise = databasePromise;
  databasePromise = null;

  try {
    const sqlite = await currentPromise;
    await sqlite.close();
  } catch {
    // Initialization can fail during migration checks; reset should still clear cache.
  }
}

export async function removeSqliteDatabaseFileForTests() {
  await resetSqliteDatabaseForTests();
  await fs.rm(getDatabaseFilePath(), { force: true });
}

export async function seedSqliteDatabaseFileForTests(
  configure: (database: SqlDatabaseHandle) => void | Promise<void>
) {
  await removeSqliteDatabaseFileForTests();

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

  const database = new SQL.Database() as unknown as SqlDatabaseHandle;
  try {
    database.run('PRAGMA foreign_keys = ON;');
    await configure(database);
    await fs.writeFile(databaseFilePath, Buffer.from(database.export()));
  } finally {
    database.close();
  }
}
