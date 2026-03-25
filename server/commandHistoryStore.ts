import { randomUUID } from 'node:crypto';

import { getSqliteDatabase, type SqlDatabaseHandle, type SqlRow } from './database.js';

export type CommandHistoryRecord = {
  id: string;
  command: string;
  nodeId: string | null;
  rank: number;
  lastUsed: number;
  createdAt: string;
};

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} is not a string`);
  return value;
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(`${field} is not a number`);
  return value;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value;
}

function mapRow(row: SqlRow): CommandHistoryRecord {
  return {
    id: readString(row['id'], 'id'),
    command: readString(row['command'], 'command'),
    nodeId: readNullableString(row['node_id']),
    rank: readNumber(row['rank'], 'rank'),
    lastUsed: readNumber(row['last_used'], 'last_used'),
    createdAt: readString(row['created_at'], 'created_at'),
  };
}

function queryAll(database: SqlDatabaseHandle, sql: string, params?: Record<string, unknown>): CommandHistoryRecord[] {
  const statement = database.prepare(sql, params as never);
  const rows: CommandHistoryRecord[] = [];
  try {
    while (statement.step()) {
      rows.push(mapRow(statement.getAsObject()));
    }
  } finally {
    statement.free();
  }
  return rows;
}

function frecency(rank: number, lastUsed: number): number {
  const age = Date.now() - lastUsed;
  const H = 3_600_000;
  const D = 86_400_000;
  const W = 604_800_000;
  const m = age < H ? 4 : age < D ? 2 : age < W ? 0.5 : 0.25;
  return rank * m;
}

export async function createCommandHistoryStore() {
  const { database, persist } = await getSqliteDatabase();

  function upsertCommand(command: string, nodeId: string | null): CommandHistoryRecord {
    const now = Date.now();

    // Check if the record already exists (same command + nodeId)
    const existing = queryAll(
      database,
      nodeId
        ? `SELECT id, rank FROM command_history WHERE command = :command AND node_id = :node_id LIMIT 1`
        : `SELECT id, rank FROM command_history WHERE command = :command AND node_id IS NULL LIMIT 1`,
      nodeId ? { ':command': command, ':node_id': nodeId } : { ':command': command }
    );

    if (existing.length > 0 && existing[0]) {
      const rec = existing[0];
      database.run(
        `UPDATE command_history SET rank = rank + 1, last_used = :now WHERE id = :id`,
        { ':now': now, ':id': rec.id }
      );
      void persist();
      return { ...rec, rank: rec.rank + 1, lastUsed: now };
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    database.run(
      `INSERT INTO command_history (id, command, node_id, rank, last_used, created_at)
       VALUES (:id, :command, :node_id, 1, :now, :created_at)`,
      { ':id': id, ':command': command, ':node_id': nodeId, ':now': now, ':created_at': createdAt }
    );
    void persist();
    return { id, command, nodeId, rank: 1, lastUsed: now, createdAt };
  }

  function searchCommands(q: string, nodeId?: string): CommandHistoryRecord[] {
    const rows = nodeId
      ? queryAll(database, `SELECT * FROM command_history WHERE node_id = :node_id`, { ':node_id': nodeId })
      : queryAll(database, `SELECT * FROM command_history`);

    const lower = q.toLowerCase();
    const filtered = lower
      ? rows.filter((r) => r.command.toLowerCase().includes(lower))
      : rows;

    return filtered
      .sort((a, b) => frecency(b.rank, b.lastUsed) - frecency(a.rank, a.lastUsed))
      .slice(0, 200);
  }

  function deleteCommand(id: string): void {
    database.run(`DELETE FROM command_history WHERE id = :id`, { ':id': id });
    void persist();
  }

  return { upsertCommand, searchCommands, deleteCommand };
}
