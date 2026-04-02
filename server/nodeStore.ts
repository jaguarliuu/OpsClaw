import { randomUUID } from 'node:crypto';

import type { SqlDatabaseHandle, SqlParams, SqlRow } from './database.js';
import { getSqliteDatabase } from './database.js';
import { getSecretVault } from './secretVault.js';

const defaultGroupName = '默认';

export type AuthMode = 'password' | 'privateKey';

export type GroupSummary = {
  id: string;
  name: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type NodeInput = {
  name: string;
  groupId?: string;
  groupName?: string;
  jumpHostId?: string;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  note?: string;
};

export type StoredNodeSummary = {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string;
  jumpHostId: string | null;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredNodeDetail = StoredNodeSummary & {
  password: null;
  privateKey: null;
  passphrase: null;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasPassphrase: boolean;
};

export type StoredNodeWithSecrets = StoredNodeSummary & {
  password: string | null;
  privateKey: string | null;
  passphrase: string | null;
};

type RowValue = SqlRow[string];

function readString(value: RowValue, field: string) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readNullableString(value: RowValue) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid nullable string value.');
  }

  return value;
}

function readNumber(value: RowValue, field: string) {
  if (typeof value !== 'number') {
    throw new Error(`Invalid ${field} value.`);
  }

  return value;
}

function readAuthMode(row: SqlRow) {
  const authMode = readString(row.auth_mode, 'auth_mode');
  if (authMode !== 'password' && authMode !== 'privateKey') {
    throw new Error('Invalid auth_mode value.');
  }

  return authMode;
}

function mapGroupSummary(row: SqlRow): GroupSummary {
  return {
    id: readString(row.id, 'id'),
    name: readString(row.name, 'name'),
    nodeCount: readNumber(row.node_count, 'node_count'),
    createdAt: readString(row.created_at, 'created_at'),
    updatedAt: readString(row.updated_at, 'updated_at'),
  };
}

function mapNodeSummary(row: SqlRow): StoredNodeSummary {
  return {
    id: readString(row.id, 'id'),
    name: readString(row.name, 'name'),
    groupId: readNullableString(row.group_id),
    groupName: readString(row.group_name, 'group_name'),
    jumpHostId: readNullableString(row.jump_host_id),
    host: readString(row.host, 'host'),
    port: readNumber(row.port, 'port'),
    username: readString(row.username, 'username'),
    authMode: readAuthMode(row),
    note: readString(row.note, 'note'),
    createdAt: readString(row.created_at, 'created_at'),
    updatedAt: readString(row.updated_at, 'updated_at'),
  };
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

export async function createNodeStore() {
  const sqlite = await getSqliteDatabase();
  const { database, persist } = sqlite;
  const secretVault = await getSecretVault();

  const getGroupById = (id: string) =>
    queryOne(
      database,
      `
        SELECT
          groups.id,
          groups.name,
          groups.created_at,
          groups.updated_at,
          COUNT(nodes.id) AS node_count
        FROM groups
        LEFT JOIN nodes ON nodes.group_id = groups.id
        WHERE groups.id = :id
        GROUP BY groups.id
      `,
      mapGroupSummary,
      { ':id': id }
    );

  const getGroupByName = (name: string) =>
    queryOne(
      database,
      `
        SELECT
          groups.id,
          groups.name,
          groups.created_at,
          groups.updated_at,
          COUNT(nodes.id) AS node_count
        FROM groups
        LEFT JOIN nodes ON nodes.group_id = groups.id
        WHERE groups.name = :name
        GROUP BY groups.id
      `,
      mapGroupSummary,
      { ':name': name }
    );

  const getNodeSummaryById = (id: string) =>
    queryOne(
      database,
      `
        SELECT
          nodes.id,
          nodes.name,
          nodes.group_id,
          COALESCE(groups.name, nodes.group_name, '${defaultGroupName}') AS group_name,
          nodes.jump_host_id,
          nodes.host,
          nodes.port,
          nodes.username,
          nodes.auth_mode,
          nodes.note,
          nodes.created_at,
          nodes.updated_at
        FROM nodes
        LEFT JOIN groups ON groups.id = nodes.group_id
        WHERE nodes.id = :id
      `,
      mapNodeSummary,
      { ':id': id }
    );

  const mapNodeWithSecrets = (row: SqlRow): StoredNodeWithSecrets => ({
    ...mapNodeSummary(row),
    password: secretVault.decrypt(
      readNullableString(row.password_encrypted) ?? readNullableString(row.password)
    ),
    privateKey: secretVault.decrypt(
      readNullableString(row.private_key_encrypted) ?? readNullableString(row.private_key)
    ),
    passphrase: secretVault.decrypt(
      readNullableString(row.passphrase_encrypted) ?? readNullableString(row.passphrase)
    ),
  });

  const sanitizeNodeDetail = (node: StoredNodeWithSecrets): StoredNodeDetail => ({
    ...node,
    password: null,
    privateKey: null,
    passphrase: null,
    hasPassword: Boolean(node.password),
    hasPrivateKey: Boolean(node.privateKey),
    hasPassphrase: Boolean(node.passphrase),
  });

  const getNodeWithSecretsById = (id: string) =>
    queryOne(
      database,
      `
        SELECT
          nodes.id,
          nodes.name,
          nodes.group_id,
          COALESCE(groups.name, nodes.group_name, '${defaultGroupName}') AS group_name,
          nodes.jump_host_id,
          nodes.host,
          nodes.port,
          nodes.username,
          nodes.auth_mode,
          nodes.password,
          nodes.private_key,
          nodes.passphrase,
          nodes.password_encrypted,
          nodes.private_key_encrypted,
          nodes.passphrase_encrypted,
          nodes.note,
          nodes.created_at,
          nodes.updated_at
        FROM nodes
        LEFT JOIN groups ON groups.id = nodes.group_id
        WHERE nodes.id = :id
      `,
      mapNodeWithSecrets,
      { ':id': id }
    );

  const ensureGroup = (name: string) => {
    const existing = getGroupByName(name);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    database.run(
      `
        INSERT INTO groups (id, name, created_at, updated_at)
        VALUES (:id, :name, :created_at, :updated_at)
      `,
      {
        ':id': id,
        ':name': name,
        ':created_at': now,
        ':updated_at': now,
      }
    );

    return getGroupById(id);
  };

  const defaultGroup = ensureGroup(defaultGroupName);
  if (!defaultGroup) {
    throw new Error('Failed to initialize default group.');
  }

  const migrateExistingNodes = async () => {
    const rows = queryMany(
      database,
      `
        SELECT
          id,
          group_id,
          group_name,
          password,
          private_key,
          passphrase,
          password_encrypted,
          private_key_encrypted,
          passphrase_encrypted
        FROM nodes
      `,
      (row) => ({
        id: readString(row.id, 'id'),
        groupId: readNullableString(row.group_id),
        groupName: readNullableString(row.group_name) ?? defaultGroupName,
        password: readNullableString(row.password),
        privateKey: readNullableString(row.private_key),
        passphrase: readNullableString(row.passphrase),
        passwordEncrypted: readNullableString(row.password_encrypted),
        privateKeyEncrypted: readNullableString(row.private_key_encrypted),
        passphraseEncrypted: readNullableString(row.passphrase_encrypted),
      })
    );

    if (rows.length === 0) {
      return;
    }

    rows.forEach((row) => {
      const resolvedGroup =
        row.groupId && getGroupById(row.groupId)
          ? getGroupById(row.groupId)
          : ensureGroup(row.groupName || defaultGroupName);

      database.run(
        `
          UPDATE nodes
          SET
            group_id = :group_id,
            group_name = :group_name,
            password = NULL,
            private_key = NULL,
            passphrase = NULL,
            password_encrypted = :password_encrypted,
            private_key_encrypted = :private_key_encrypted,
            passphrase_encrypted = :passphrase_encrypted
          WHERE id = :id
        `,
        {
          ':id': row.id,
          ':group_id': resolvedGroup?.id ?? defaultGroup.id,
          ':group_name': resolvedGroup?.name ?? defaultGroup.name,
          ':password_encrypted':
            row.passwordEncrypted ?? secretVault.encrypt(row.password),
          ':private_key_encrypted':
            row.privateKeyEncrypted ?? secretVault.encrypt(row.privateKey),
          ':passphrase_encrypted':
            row.passphraseEncrypted ?? secretVault.encrypt(row.passphrase),
        }
      );
    });

    await persist();
  };

  await migrateExistingNodes();

  const resolveGroupForNode = (input: NodeInput) => {
    if (input.groupId) {
      const group = getGroupById(input.groupId);
      if (!group) {
        throw new Error('Group not found.');
      }

      return group;
    }

    return ensureGroup(input.groupName ?? defaultGroupName);
  };

  return {
    listGroups() {
      return queryMany(
        database,
        `
          SELECT
            groups.id,
            groups.name,
            groups.created_at,
            groups.updated_at,
            COUNT(nodes.id) AS node_count
          FROM groups
          LEFT JOIN nodes ON nodes.group_id = groups.id
          GROUP BY groups.id
          ORDER BY
            CASE WHEN groups.id = '${defaultGroup.id}' THEN 0 ELSE 1 END,
            groups.name COLLATE NOCASE
        `,
        mapGroupSummary
      );
    },

    getGroup(id: string) {
      return getGroupById(id);
    },

    createGroup(name: string) {
      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new Error('Group name is required.');
      }

      if (getGroupByName(normalizedName)) {
        throw new Error('Group name already exists.');
      }

      const now = new Date().toISOString();
      const id = randomUUID();
      database.run(
        `
          INSERT INTO groups (id, name, created_at, updated_at)
          VALUES (:id, :name, :created_at, :updated_at)
        `,
        {
          ':id': id,
          ':name': normalizedName,
          ':created_at': now,
          ':updated_at': now,
        }
      );

      return getGroupById(id);
    },

    async renameGroup(id: string, name: string) {
      const group = getGroupById(id);
      if (!group) {
        return null;
      }

      if (group.id === defaultGroup.id) {
        throw new Error('默认分组不能重命名。');
      }

      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new Error('Group name is required.');
      }

      const duplicateGroup = getGroupByName(normalizedName);
      if (duplicateGroup && duplicateGroup.id !== id) {
        throw new Error('Group name already exists.');
      }

      database.run(
        `
          UPDATE groups
          SET
            name = :name,
            updated_at = :updated_at
          WHERE id = :id
        `,
        {
          ':id': id,
          ':name': normalizedName,
          ':updated_at': new Date().toISOString(),
        }
      );

      database.run(
        `
          UPDATE nodes
          SET group_name = :group_name
          WHERE group_id = :group_id
        `,
        {
          ':group_id': id,
          ':group_name': normalizedName,
        }
      );

      await persist();
      return getGroupById(id);
    },

    async deleteGroup(id: string) {
      const group = getGroupById(id);
      if (!group) {
        return false;
      }

      if (group.id === defaultGroup.id) {
        throw new Error('默认分组不能删除。');
      }

      database.run(
        `
          UPDATE nodes
          SET
            group_id = :group_id,
            group_name = :group_name
          WHERE group_id = :source_group_id
        `,
        {
          ':group_id': defaultGroup.id,
          ':group_name': defaultGroup.name,
          ':source_group_id': id,
        }
      );

      database.run('DELETE FROM groups WHERE id = :id', { ':id': id });
      await persist();
      return true;
    },

    listNodes() {
      return queryMany(
        database,
        `
          SELECT
            nodes.id,
            nodes.name,
            nodes.group_id,
            COALESCE(groups.name, nodes.group_name, '${defaultGroupName}') AS group_name,
            nodes.jump_host_id,
            nodes.host,
            nodes.port,
            nodes.username,
            nodes.auth_mode,
            nodes.note,
            nodes.created_at,
            nodes.updated_at
          FROM nodes
          LEFT JOIN groups ON groups.id = nodes.group_id
          ORDER BY
            COALESCE(groups.name, nodes.group_name, '${defaultGroupName}') COLLATE NOCASE,
            nodes.name COLLATE NOCASE,
            nodes.host COLLATE NOCASE
        `,
        mapNodeSummary
      );
    },

    getNode(id: string) {
      const node = getNodeWithSecretsById(id);
      return node ? sanitizeNodeDetail(node) : null;
    },

    getNodeWithSecrets(id: string) {
      return getNodeWithSecretsById(id);
    },

    async createNode(input: NodeInput) {
      const now = new Date().toISOString();
      const id = randomUUID();
      const usesPassword = input.authMode === 'password';
      const group = resolveGroupForNode(input);

      database.run(
        `
          INSERT INTO nodes (
            id,
            name,
            group_id,
            group_name,
            jump_host_id,
            host,
            port,
            username,
            auth_mode,
            password,
            private_key,
            passphrase,
            password_encrypted,
            private_key_encrypted,
            passphrase_encrypted,
            note,
            created_at,
            updated_at
          )
          VALUES (
            :id,
            :name,
            :group_id,
            :group_name,
            :jump_host_id,
            :host,
            :port,
            :username,
            :auth_mode,
            NULL,
            NULL,
            NULL,
            :password_encrypted,
            :private_key_encrypted,
            :passphrase_encrypted,
            :note,
            :created_at,
            :updated_at
          )
        `,
        {
          ':id': id,
          ':name': input.name,
          ':group_id': group?.id ?? defaultGroup.id,
          ':group_name': group?.name ?? defaultGroup.name,
          ':jump_host_id': input.jumpHostId ?? null,
          ':host': input.host,
          ':port': input.port,
          ':username': input.username,
          ':auth_mode': input.authMode,
          ':password_encrypted': usesPassword ? secretVault.encrypt(input.password) : null,
          ':private_key_encrypted': usesPassword ? null : secretVault.encrypt(input.privateKey),
          ':passphrase_encrypted': usesPassword ? null : secretVault.encrypt(input.passphrase),
          ':note': input.note ?? '',
          ':created_at': now,
          ':updated_at': now,
        }
      );

      await persist();
      return getNodeSummaryById(id);
    },

    async updateNode(id: string, input: NodeInput) {
      const existing = getNodeSummaryById(id);
      if (!existing) {
        return null;
      }

      const existingWithSecrets = getNodeWithSecretsById(id);
      if (!existingWithSecrets) {
        return null;
      }

      const usesPassword = input.authMode === 'password';
      const group = resolveGroupForNode(input);
      const nextPassword = usesPassword
        ? input.password ?? existingWithSecrets.password
        : null;
      const nextPrivateKey = usesPassword
        ? null
        : input.privateKey ?? existingWithSecrets.privateKey;
      const nextPassphrase = usesPassword
        ? null
        : input.passphrase ?? existingWithSecrets.passphrase;

      database.run(
        `
          UPDATE nodes
          SET
            name = :name,
            group_id = :group_id,
            group_name = :group_name,
            jump_host_id = :jump_host_id,
            host = :host,
            port = :port,
            username = :username,
            auth_mode = :auth_mode,
            password = NULL,
            private_key = NULL,
            passphrase = NULL,
            password_encrypted = :password_encrypted,
            private_key_encrypted = :private_key_encrypted,
            passphrase_encrypted = :passphrase_encrypted,
            note = :note,
            updated_at = :updated_at
          WHERE id = :id
        `,
        {
          ':id': id,
          ':name': input.name,
          ':group_id': group?.id ?? defaultGroup.id,
          ':group_name': group?.name ?? defaultGroup.name,
          ':jump_host_id': input.jumpHostId ?? null,
          ':host': input.host,
          ':port': input.port,
          ':username': input.username,
          ':auth_mode': input.authMode,
          ':password_encrypted': secretVault.encrypt(nextPassword),
          ':private_key_encrypted': secretVault.encrypt(nextPrivateKey),
          ':passphrase_encrypted': secretVault.encrypt(nextPassphrase),
          ':note': input.note ?? existing.note,
          ':updated_at': new Date().toISOString(),
        }
      );

      await persist();
      return getNodeSummaryById(id);
    },

    async moveNodeToGroup(nodeId: string, groupId: string) {
      const node = getNodeSummaryById(nodeId);
      const group = getGroupById(groupId);

      if (!node || !group) {
        return null;
      }

      database.run(
        `
          UPDATE nodes
          SET
            group_id = :group_id,
            group_name = :group_name,
            updated_at = :updated_at
          WHERE id = :id
        `,
        {
          ':id': nodeId,
          ':group_id': group.id,
          ':group_name': group.name,
          ':updated_at': new Date().toISOString(),
        }
      );

      await persist();
      return getNodeSummaryById(nodeId);
    },

    async deleteNode(id: string) {
      database.run('DELETE FROM nodes WHERE id = :id', { ':id': id });
      const deleted = database.getRowsModified() > 0;

      if (deleted) {
        await persist();
      }

      return deleted;
    },
  };
}
