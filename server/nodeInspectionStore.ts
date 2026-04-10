import { randomUUID } from 'node:crypto';

import { getSqliteDatabase, type SqlDatabaseHandle, type SqlParams, type SqlRow } from './database.js';

export type NodeInspectionSnapshotStatus = 'success' | 'error';

export type NodeInspectionProfile = {
  nodeId: string;
  scriptId: string;
  dashboardSchemaKey: string;
  createdAt: string;
  updatedAt: string;
};

export type NodeInspectionSnapshot = {
  id: string;
  nodeId: string;
  status: NodeInspectionSnapshotStatus;
  payloadJson: string | null;
  errorMessage: string | null;
  createdAt: string;
  createdAtMs: number;
};

export type UpsertNodeInspectionProfileInput = {
  nodeId: string;
  scriptId: string;
  dashboardSchemaKey: string;
};

export type CreateNodeInspectionSnapshotInput = {
  nodeId: string;
  status: NodeInspectionSnapshotStatus;
  payloadJson: string | null;
  errorMessage: string | null;
};

const SNAPSHOT_RETENTION_LIMIT = 10;

let lastSnapshotTimestampMs = 0;

function readString(value: SqlRow[string], field: string) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readNullableString(value: SqlRow[string]) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid nullable string value.');
  }

  return value;
}

function readNumber(value: SqlRow[string], field: string) {
  if (typeof value !== 'number') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readSnapshotStatus(value: SqlRow[string]): NodeInspectionSnapshotStatus {
  if (value !== 'success' && value !== 'error') {
    throw new Error('Invalid node inspection snapshot status.');
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

function queryOne<T>(
  database: SqlDatabaseHandle,
  sql: string,
  mapRow: (row: SqlRow) => T,
  params?: SqlParams
) {
  const [row] = queryMany(database, sql, mapRow, params);
  return row ?? null;
}

function mapProfileRow(row: SqlRow): NodeInspectionProfile {
  return {
    nodeId: readString(row.node_id, 'node_id'),
    scriptId: readString(row.script_id, 'script_id'),
    dashboardSchemaKey: readString(row.dashboard_schema_key, 'dashboard_schema_key'),
    createdAt: readString(row.created_at, 'created_at'),
    updatedAt: readString(row.updated_at, 'updated_at'),
  };
}

function mapSnapshotRow(row: SqlRow): NodeInspectionSnapshot {
  return {
    id: readString(row.id, 'id'),
    nodeId: readString(row.node_id, 'node_id'),
    status: readSnapshotStatus(row.status),
    payloadJson: readNullableString(row.payload_json),
    errorMessage: readNullableString(row.error_message),
    createdAt: readString(row.created_at, 'created_at'),
    createdAtMs: readNumber(row.created_at_ms, 'created_at_ms'),
  };
}

function normalizeProfileInput(input: UpsertNodeInspectionProfileInput) {
  const nodeId = input.nodeId.trim();
  const scriptId = input.scriptId.trim();
  const dashboardSchemaKey = input.dashboardSchemaKey.trim();

  if (!nodeId) {
    throw new Error('Node inspection profile nodeId 不能为空。');
  }

  if (!scriptId) {
    throw new Error('Node inspection profile scriptId 不能为空。');
  }

  if (!dashboardSchemaKey) {
    throw new Error('Node inspection profile dashboardSchemaKey 不能为空。');
  }

  return {
    nodeId,
    scriptId,
    dashboardSchemaKey,
  };
}

function normalizeSnapshotInput(input: CreateNodeInspectionSnapshotInput) {
  const nodeId = input.nodeId.trim();
  const payloadJson = input.payloadJson?.trim() ?? null;
  const errorMessage = input.errorMessage?.trim() ?? null;

  if (!nodeId) {
    throw new Error('Node inspection snapshot nodeId 不能为空。');
  }

  if (input.status !== 'success' && input.status !== 'error') {
    throw new Error('Node inspection snapshot status 不正确。');
  }

  return {
    nodeId,
    status: input.status,
    payloadJson: payloadJson || null,
    errorMessage,
  };
}

function nextSnapshotTimestampMs() {
  const now = Date.now();
  lastSnapshotTimestampMs = now > lastSnapshotTimestampMs ? now : lastSnapshotTimestampMs + 1;
  return lastSnapshotTimestampMs;
}

export async function createNodeInspectionStore() {
  const { database, persist } = await getSqliteDatabase();

  function getProfile(nodeId: string) {
    return queryOne(
      database,
      `
        SELECT *
        FROM node_inspection_profiles
        WHERE node_id = :nodeId
      `,
      mapProfileRow,
      { ':nodeId': nodeId }
    );
  }

  function upsertProfile(input: UpsertNodeInspectionProfileInput): NodeInspectionProfile {
    const next = normalizeProfileInput(input);
    const current = getProfile(next.nodeId);
    const now = new Date().toISOString();

    if (current) {
      database.run(
        `
          UPDATE node_inspection_profiles
          SET script_id = :scriptId,
              dashboard_schema_key = :dashboardSchemaKey,
              updated_at = :updatedAt
          WHERE node_id = :nodeId
        `,
        {
          ':nodeId': next.nodeId,
          ':scriptId': next.scriptId,
          ':dashboardSchemaKey': next.dashboardSchemaKey,
          ':updatedAt': now,
        }
      );
    } else {
      database.run(
        `
          INSERT INTO node_inspection_profiles (
            node_id, script_id, dashboard_schema_key, created_at, updated_at
          ) VALUES (
            :nodeId, :scriptId, :dashboardSchemaKey, :createdAt, :updatedAt
          )
        `,
        {
          ':nodeId': next.nodeId,
          ':scriptId': next.scriptId,
          ':dashboardSchemaKey': next.dashboardSchemaKey,
          ':createdAt': now,
          ':updatedAt': now,
        }
      );
    }

    void persist();
    return getProfile(next.nodeId)!;
  }

  function createSnapshot(input: CreateNodeInspectionSnapshotInput): NodeInspectionSnapshot {
    const next = normalizeSnapshotInput(input);
    const id = randomUUID();
    const createdAtMs = nextSnapshotTimestampMs();
    const createdAt = new Date(createdAtMs).toISOString();

    database.run(
      `
        INSERT INTO node_inspection_snapshots (
          id, node_id, status, payload_json, error_message, created_at, created_at_ms
        ) VALUES (
          :id, :nodeId, :status, :payloadJson, :errorMessage, :createdAt, :createdAtMs
        )
      `,
      {
        ':id': id,
        ':nodeId': next.nodeId,
        ':status': next.status,
        ':payloadJson': next.payloadJson,
        ':errorMessage': next.errorMessage,
        ':createdAt': createdAt,
        ':createdAtMs': createdAtMs,
      }
    );

    database.run(
      `
        DELETE FROM node_inspection_snapshots
        WHERE node_id = :nodeId
          AND id IN (
            SELECT id
            FROM node_inspection_snapshots
            WHERE node_id = :nodeId
            ORDER BY created_at_ms DESC
            LIMIT -1 OFFSET :retentionLimit
          )
      `,
      {
        ':nodeId': next.nodeId,
        ':retentionLimit': SNAPSHOT_RETENTION_LIMIT,
      }
    );

    void persist();
    return queryOne(
      database,
      `
        SELECT *
        FROM node_inspection_snapshots
        WHERE id = :id
      `,
      mapSnapshotRow,
      { ':id': id }
    )!;
  }

  function listSnapshots(nodeId: string) {
    return queryMany(
      database,
      `
        SELECT *
        FROM node_inspection_snapshots
        WHERE node_id = :nodeId
        ORDER BY created_at_ms DESC
      `,
      mapSnapshotRow,
      { ':nodeId': nodeId }
    );
  }

  function getLatestSuccessSnapshot(nodeId: string) {
    return queryOne(
      database,
      `
        SELECT *
        FROM node_inspection_snapshots
        WHERE node_id = :nodeId
          AND status = 'success'
        ORDER BY created_at_ms DESC
        LIMIT 1
      `,
      mapSnapshotRow,
      { ':nodeId': nodeId }
    );
  }

  function deleteNodeInspectionData(nodeId: string) {
    database.run(
      `
        DELETE FROM node_inspection_snapshots
        WHERE node_id = :nodeId
      `,
      { ':nodeId': nodeId }
    );
    database.run(
      `
        DELETE FROM node_inspection_profiles
        WHERE node_id = :nodeId
      `,
      { ':nodeId': nodeId }
    );
    void persist();
  }

  return {
    upsertProfile,
    getProfile,
    createSnapshot,
    listSnapshots,
    getLatestSuccessSnapshot,
    deleteNodeInspectionData,
  };
}
