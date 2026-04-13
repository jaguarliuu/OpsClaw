import { getSqliteDatabase, type SqlDatabaseHandle, type SqlParams, type SqlRow } from './database.js';

export const SFTP_TRANSFER_DIRECTIONS = ['upload', 'download'] as const;
export const SFTP_TRANSFER_STATUSES = [
  'queued',
  'running',
  'paused',
  'retrying',
  'completed',
  'failed',
  'cancelled',
  'canceled',
] as const;
export const SFTP_CHECKSUM_STATUSES = ['pending', 'matched', 'mismatched', 'skipped', 'failed'] as const;

export type SftpTransferDirection = (typeof SFTP_TRANSFER_DIRECTIONS)[number];
export type SftpTransferStatus = (typeof SFTP_TRANSFER_STATUSES)[number];
export type SftpChecksumStatus = (typeof SFTP_CHECKSUM_STATUSES)[number];

const transferDirectionSet = new Set<string>(SFTP_TRANSFER_DIRECTIONS);
const transferStatusSet = new Set<string>(SFTP_TRANSFER_STATUSES);
const checksumStatusSet = new Set<string>(SFTP_CHECKSUM_STATUSES);

export type SftpHostKeyRecord = {
  nodeId: string;
  algorithm: string;
  fingerprint: string;
  seenAt: string;
};

export type UpsertSftpHostKeyInput = {
  nodeId: string;
  algorithm: string;
  fingerprint: string;
};

export type SftpTransferTaskRecord = {
  taskId: string;
  nodeId: string;
  direction: SftpTransferDirection;
  localPath: string;
  remotePath: string;
  tempLocalPath: string | null;
  tempRemotePath: string | null;
  totalBytes: number | null;
  transferredBytes: number;
  lastConfirmedOffset: number;
  chunkSize: number;
  status: SftpTransferStatus;
  retryCount: number;
  errorMessage: string | null;
  checksumStatus: SftpChecksumStatus;
  createdAt: string;
  updatedAt: string;
};

export type SftpTransferTaskRecordInput = {
  taskId: string;
  nodeId: string;
  direction: SftpTransferDirection;
  localPath: string;
  remotePath: string;
  tempLocalPath?: string | null;
  tempRemotePath?: string | null;
  totalBytes?: number | null;
  transferredBytes: number;
  lastConfirmedOffset: number;
  chunkSize: number;
  status: SftpTransferStatus;
  retryCount: number;
  errorMessage?: string | null;
  checksumStatus: SftpChecksumStatus;
};

function readString(value: SqlRow[string], field: string) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readNullableString(value: SqlRow[string], field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readNumber(value: SqlRow[string], field: string) {
  if (typeof value !== 'number') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readNullableNumber(value: SqlRow[string], field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readTransferDirection(value: SqlRow[string]) {
  if (typeof value !== 'string' || !transferDirectionSet.has(value)) {
    throw new Error('Invalid sftp transfer direction value.');
  }

  return value as SftpTransferDirection;
}

function readTransferStatus(value: SqlRow[string]) {
  if (typeof value !== 'string' || !transferStatusSet.has(value)) {
    throw new Error('Invalid sftp transfer status value.');
  }

  return value as SftpTransferStatus;
}

function readChecksumStatus(value: SqlRow[string]) {
  if (typeof value !== 'string' || !checksumStatusSet.has(value)) {
    throw new Error('Invalid sftp checksum status value.');
  }

  return value as SftpChecksumStatus;
}

function assertTransferTaskInput(input: SftpTransferTaskRecordInput) {
  const totalBytes = input.totalBytes ?? null;

  if (!transferDirectionSet.has(input.direction)) {
    throw new Error('Invalid sftp transfer task direction.');
  }
  if (!transferStatusSet.has(input.status)) {
    throw new Error('Invalid sftp transfer task status.');
  }
  if (!checksumStatusSet.has(input.checksumStatus)) {
    throw new Error('Invalid sftp transfer task checksumStatus.');
  }
  if (input.totalBytes !== undefined && input.totalBytes !== null && input.totalBytes < 0) {
    throw new Error('SFTP transfer totalBytes must be >= 0.');
  }
  if (input.transferredBytes < 0) {
    throw new Error('SFTP transfer transferredBytes must be >= 0.');
  }
  if (input.lastConfirmedOffset < 0) {
    throw new Error('SFTP transfer lastConfirmedOffset must be >= 0.');
  }
  if (input.chunkSize <= 0) {
    throw new Error('SFTP transfer chunkSize must be > 0.');
  }
  if (input.retryCount < 0) {
    throw new Error('SFTP transfer retryCount must be >= 0.');
  }
  if (totalBytes !== null && input.transferredBytes > totalBytes) {
    throw new Error('SFTP transfer transferredBytes must be <= totalBytes.');
  }
  if (input.lastConfirmedOffset > input.transferredBytes) {
    throw new Error('SFTP transfer lastConfirmedOffset must be <= transferredBytes.');
  }
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

function queryOne<T>(
  database: SqlDatabaseHandle,
  sql: string,
  mapRow: (row: SqlRow) => T,
  params?: SqlParams
) {
  const [row] = queryMany(database, sql, mapRow, params);
  return row ?? null;
}

function mapHostKeyRow(row: SqlRow): SftpHostKeyRecord {
  return {
    nodeId: readString(row.node_id, 'node_id'),
    algorithm: readString(row.algorithm, 'algorithm'),
    fingerprint: readString(row.fingerprint, 'fingerprint'),
    seenAt: readString(row.seen_at, 'seen_at'),
  };
}

function mapTransferTaskRow(row: SqlRow): SftpTransferTaskRecord {
  return {
    taskId: readString(row.task_id, 'task_id'),
    nodeId: readString(row.node_id, 'node_id'),
    direction: readTransferDirection(row.direction),
    localPath: readString(row.local_path, 'local_path'),
    remotePath: readString(row.remote_path, 'remote_path'),
    tempLocalPath: readNullableString(row.temp_local_path, 'temp_local_path'),
    tempRemotePath: readNullableString(row.temp_remote_path, 'temp_remote_path'),
    totalBytes: readNullableNumber(row.total_bytes, 'total_bytes'),
    transferredBytes: readNumber(row.transferred_bytes, 'transferred_bytes'),
    lastConfirmedOffset: readNumber(row.last_confirmed_offset, 'last_confirmed_offset'),
    chunkSize: readNumber(row.chunk_size, 'chunk_size'),
    status: readTransferStatus(row.status),
    retryCount: readNumber(row.retry_count, 'retry_count'),
    errorMessage: readNullableString(row.error_message, 'error_message'),
    checksumStatus: readChecksumStatus(row.checksum_status),
    createdAt: readString(row.created_at, 'created_at'),
    updatedAt: readString(row.updated_at, 'updated_at'),
  };
}

export async function createSftpStore() {
  const { database, persist } = await getSqliteDatabase();

  return {
    async getHostKey(nodeId: string) {
      return queryOne(
        database,
        `
          SELECT *
          FROM sftp_host_keys
          WHERE node_id = :nodeId
        `,
        mapHostKeyRow,
        { ':nodeId': nodeId }
      );
    },

    async upsertHostKey(input: UpsertSftpHostKeyInput) {
      const now = new Date().toISOString();
      database.run(
        `
          INSERT INTO sftp_host_keys (node_id, algorithm, fingerprint, seen_at)
          VALUES (:nodeId, :algorithm, :fingerprint, :seenAt)
          ON CONFLICT(node_id) DO UPDATE SET
            algorithm = excluded.algorithm,
            fingerprint = excluded.fingerprint,
            seen_at = excluded.seen_at
        `,
        {
          ':nodeId': input.nodeId,
          ':algorithm': input.algorithm,
          ':fingerprint': input.fingerprint,
          ':seenAt': now,
        }
      );

      await persist();
    },

    async upsertTransferTask(input: SftpTransferTaskRecordInput) {
      assertTransferTaskInput(input);
      const now = new Date().toISOString();
      const existing = queryOne(
        database,
        `
          SELECT created_at
          FROM sftp_transfer_tasks
          WHERE task_id = :taskId
        `,
        (row) => readString(row.created_at, 'created_at'),
        { ':taskId': input.taskId }
      );
      const createdAt = existing ?? now;

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
          )
          ON CONFLICT(task_id) DO UPDATE SET
            node_id = excluded.node_id,
            direction = excluded.direction,
            local_path = excluded.local_path,
            remote_path = excluded.remote_path,
            temp_local_path = excluded.temp_local_path,
            temp_remote_path = excluded.temp_remote_path,
            total_bytes = excluded.total_bytes,
            transferred_bytes = excluded.transferred_bytes,
            last_confirmed_offset = excluded.last_confirmed_offset,
            chunk_size = excluded.chunk_size,
            status = excluded.status,
            retry_count = excluded.retry_count,
            error_message = excluded.error_message,
            checksum_status = excluded.checksum_status,
            updated_at = excluded.updated_at
        `,
        {
          ':taskId': input.taskId,
          ':nodeId': input.nodeId,
          ':direction': input.direction,
          ':localPath': input.localPath,
          ':remotePath': input.remotePath,
          ':tempLocalPath': input.tempLocalPath ?? null,
          ':tempRemotePath': input.tempRemotePath ?? null,
          ':totalBytes': input.totalBytes ?? null,
          ':transferredBytes': input.transferredBytes,
          ':lastConfirmedOffset': input.lastConfirmedOffset,
          ':chunkSize': input.chunkSize,
          ':status': input.status,
          ':retryCount': input.retryCount,
          ':errorMessage': input.errorMessage ?? null,
          ':checksumStatus': input.checksumStatus,
          ':createdAt': createdAt,
          ':updatedAt': now,
        }
      );

      await persist();
    },

    async listResumableTasks(nodeId: string) {
      return queryMany(
        database,
        `
          SELECT *
          FROM sftp_transfer_tasks
          WHERE node_id = :nodeId
            AND status IN ('queued', 'running', 'paused', 'retrying')
          ORDER BY updated_at DESC
        `,
        mapTransferTaskRow,
        { ':nodeId': nodeId }
      );
    },

    async deleteTasksForNode(nodeId: string) {
      database.run(
        `
          DELETE FROM sftp_transfer_tasks
          WHERE node_id = :nodeId
        `,
        { ':nodeId': nodeId }
      );
      await persist();
    },
  };
}
