import { randomUUID } from 'node:crypto';

import { getSqliteDatabase, type SqlDatabaseHandle, type SqlParams, type SqlRow } from './database.js';

export type ScriptScope = 'global' | 'node';
export type ScriptKind = 'plain' | 'template';
export type ScriptVariableInputType = 'text' | 'textarea';

export type ScriptVariableDefinition = {
  name: string;
  label: string;
  inputType: ScriptVariableInputType;
  required: boolean;
  defaultValue: string;
  placeholder: string;
};

export type ScriptLibraryItem = {
  id: string;
  key: string;
  alias: string;
  scope: ScriptScope;
  nodeId: string | null;
  title: string;
  description: string;
  kind: ScriptKind;
  content: string;
  variables: ScriptVariableDefinition[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ResolvedScriptLibraryItem = ScriptLibraryItem & {
  resolvedFrom: ScriptScope;
  overridesGlobal: boolean;
};

export type CreateScriptInput = {
  key: string;
  alias: string;
  scope: ScriptScope;
  nodeId: string | null;
  title: string;
  description?: string;
  kind: ScriptKind;
  content: string;
  variables: ScriptVariableDefinition[];
  tags: string[];
};

export type UpdateScriptInput = Partial<Omit<CreateScriptInput, 'scope' | 'nodeId'>> & {
  scope?: ScriptScope;
  nodeId?: string | null;
};

const SCRIPT_ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

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

function readScope(value: SqlRow[string]): ScriptScope {
  if (value !== 'global' && value !== 'node') {
    throw new Error('Invalid script scope.');
  }

  return value;
}

function readKind(value: SqlRow[string]): ScriptKind {
  if (value !== 'plain' && value !== 'template') {
    throw new Error('Invalid script kind.');
  }

  return value;
}

function parseJsonArray<T>(value: SqlRow[string], field: string): T[] {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} value.`);
  }

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid ${field} json value.`);
  }

  return parsed as T[];
}

function normalizeScriptVariable(value: unknown): ScriptVariableDefinition {
  if (typeof value !== 'object' || value === null) {
    throw new Error('脚本变量定义格式错误。');
  }

  const row = value as Record<string, unknown>;
  const inputType = row.inputType;
  if (inputType !== 'text' && inputType !== 'textarea') {
    throw new Error('脚本变量输入类型不正确。');
  }

  if (typeof row.name !== 'string' || !row.name.trim()) {
    throw new Error('脚本变量名称不能为空。');
  }

  if (typeof row.label !== 'string' || !row.label.trim()) {
    throw new Error('脚本变量标签不能为空。');
  }

  return {
    name: row.name.trim(),
    label: row.label.trim(),
    inputType,
    required: Boolean(row.required),
    defaultValue: typeof row.defaultValue === 'string' ? row.defaultValue : '',
    placeholder: typeof row.placeholder === 'string' ? row.placeholder : '',
  };
}

function mapScriptRow(row: SqlRow): ScriptLibraryItem {
  return {
    id: readString(row.id, 'id'),
    key: readString(row.key, 'key'),
    alias: readString(row.alias, 'alias'),
    scope: readScope(row.scope),
    nodeId: readNullableString(row.node_id),
    title: readString(row.title, 'title'),
    description: readString(row.description, 'description'),
    kind: readKind(row.kind),
    content: readString(row.content, 'content'),
    variables: parseJsonArray<unknown>(row.variables_json, 'variables_json').map(normalizeScriptVariable),
    tags: parseJsonArray<unknown>(row.tags_json, 'tags_json').filter(
      (value): value is string => typeof value === 'string'
    ),
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeAlias(value: string) {
  const alias = value.trim();
  if (!alias) {
    throw new Error('脚本 alias 不能为空。');
  }
  if (!SCRIPT_ALIAS_PATTERN.test(alias)) {
    throw new Error('脚本 alias 只能包含小写字母、数字、-、_。');
  }
  return alias;
}

function ensureValidVariables(kind: ScriptKind, variables: ScriptVariableDefinition[], content: string) {
  if (kind === 'plain') {
    if (variables.length > 0) {
      throw new Error('纯文本脚本不能包含模板变量。');
    }
    return;
  }

  const names = new Set<string>();
  for (const variable of variables) {
    if (names.has(variable.name)) {
      throw new Error('脚本变量名称不能重复。');
    }
    names.add(variable.name);
  }

  const placeholders = Array.from(content.matchAll(/\$\{([a-zA-Z0-9_]+)\}/g), (match) => match[1]);
  for (const placeholder of placeholders) {
    if (!names.has(placeholder)) {
      throw new Error(`模板变量 ${placeholder} 未定义。`);
    }
  }
}

function normalizeCreateInput(input: CreateScriptInput) {
  const key = input.key.trim();
  const alias = normalizeAlias(input.alias);
  const title = input.title.trim();
  const description = (input.description ?? '').trim();
  const content = input.content.trim();
  const tags = uniqueStrings(input.tags);
  const variables = input.variables.map(normalizeScriptVariable);

  if (!key) {
    throw new Error('脚本 key 不能为空。');
  }

  if (!title) {
    throw new Error('脚本标题不能为空。');
  }

  if (!content) {
    throw new Error('脚本内容不能为空。');
  }

  if (input.scope === 'node' && !input.nodeId) {
    throw new Error('节点脚本必须绑定节点。');
  }

  if (input.scope === 'global' && input.nodeId) {
    throw new Error('全局脚本不能绑定节点。');
  }

  ensureValidVariables(input.kind, variables, content);

  return {
    key,
    alias,
    scope: input.scope,
    nodeId: input.scope === 'node' ? input.nodeId : null,
    title,
    description,
    kind: input.kind,
    content,
    variables,
    tags,
  };
}

function normalizeUpdateInput(current: ScriptLibraryItem, input: UpdateScriptInput) {
  const scope = input.scope ?? current.scope;
  const nodeId = input.nodeId !== undefined ? input.nodeId : current.nodeId;
  const kind = input.kind ?? current.kind;
  const content = (input.content ?? current.content).trim();
  const variables = (input.variables ?? current.variables).map(normalizeScriptVariable);

  return normalizeCreateInput({
    key: input.key ?? current.key,
    alias: input.alias ?? current.alias,
    scope,
    nodeId,
    title: input.title ?? current.title,
    description: input.description ?? current.description,
    kind,
    content,
    variables,
    tags: input.tags ?? current.tags,
  });
}

function sortScripts(items: ResolvedScriptLibraryItem[]) {
  return items.sort((left, right) => left.key.localeCompare(right.key));
}

export async function createScriptLibraryStore() {
  const { database, persist } = await getSqliteDatabase();

  function listAllScripts() {
    return queryMany(
      database,
      'SELECT * FROM script_library ORDER BY created_at ASC',
      mapScriptRow
    );
  }

  function getScript(id: string) {
    return queryOne(
      database,
      'SELECT * FROM script_library WHERE id = :id',
      mapScriptRow,
      { ':id': id }
    );
  }

  function getScriptByScopeAndKey(scope: ScriptScope, nodeId: string | null, key: string) {
    if (scope === 'node') {
      return queryOne(
        database,
        `
          SELECT * FROM script_library
          WHERE scope = :scope AND node_id = :nodeId AND key = :key
        `,
        mapScriptRow,
        { ':scope': scope, ':nodeId': nodeId, ':key': key }
      );
    }

    return queryOne(
      database,
      `
        SELECT * FROM script_library
        WHERE scope = 'global' AND node_id IS NULL AND key = :key
      `,
      mapScriptRow,
      { ':key': key }
    );
  }

  function assertAliasAvailable(input: { alias: string; scope: ScriptScope; nodeId: string | null; excludeId?: string }) {
    const row = queryOne(
      database,
      `
        SELECT id FROM script_library
        WHERE alias = :alias
          AND (
            (scope = 'global' AND :scope = 'global')
            OR
            (scope = 'node' AND :scope = 'node' AND node_id = :nodeId)
          )
          AND (:excludeId IS NULL OR id != :excludeId)
      `,
      (value) => value,
      {
        ':alias': input.alias,
        ':scope': input.scope,
        ':nodeId': input.nodeId,
        ':excludeId': input.excludeId ?? null,
      }
    );

    if (row) {
      throw new Error('脚本 alias 已存在。');
    }
  }

  function listResolvedScripts(nodeId?: string): ResolvedScriptLibraryItem[] {
    const globalScripts = queryMany(
      database,
      `SELECT * FROM script_library WHERE scope = 'global'`,
      mapScriptRow
    );

    if (!nodeId) {
      return sortScripts(
        globalScripts.map((item) => ({
          ...item,
          resolvedFrom: 'global',
          overridesGlobal: false,
        }))
      );
    }

    const nodeScripts = queryMany(
      database,
      `SELECT * FROM script_library WHERE scope = 'node' AND node_id = :nodeId`,
      mapScriptRow,
      { ':nodeId': nodeId }
    );

    const resolved = new Map<string, ResolvedScriptLibraryItem>();
    for (const item of globalScripts) {
      resolved.set(item.alias, {
        ...item,
        resolvedFrom: 'global',
        overridesGlobal: false,
      });
    }

    for (const item of nodeScripts) {
      resolved.set(item.alias, {
        ...item,
        resolvedFrom: 'node',
        overridesGlobal: resolved.has(item.alias),
      });
    }

    return sortScripts(Array.from(resolved.values()));
  }

  function listManagedScripts(input?: { scope?: 'global' | 'node'; nodeId?: string }) {
    if (input?.scope === 'node') {
      return queryMany(
        database,
        `
          SELECT *
          FROM script_library
          WHERE scope = 'node' AND node_id = :nodeId
          ORDER BY alias COLLATE NOCASE ASC, created_at ASC
        `,
        mapScriptRow,
        {
          ':nodeId': input.nodeId ?? '',
        }
      );
    }

    if (input?.scope === 'global') {
      return queryMany(
        database,
        `
          SELECT *
          FROM script_library
          WHERE scope = 'global'
          ORDER BY alias COLLATE NOCASE ASC, created_at ASC
        `,
        mapScriptRow
      );
    }

    return queryMany(
      database,
      `
        SELECT *
        FROM script_library
        ORDER BY scope ASC, alias COLLATE NOCASE ASC, created_at ASC
      `,
      mapScriptRow
    );
  }

  function createScript(input: CreateScriptInput): ScriptLibraryItem {
    const next = normalizeCreateInput(input);
    const existing = getScriptByScopeAndKey(next.scope, next.nodeId, next.key);
    if (existing) {
      throw new Error('同一作用域下脚本 key 已存在。');
    }
    assertAliasAvailable({ alias: next.alias, scope: next.scope, nodeId: next.nodeId });
    const id = randomUUID();
    const now = new Date().toISOString();

    database.run(
      `
        INSERT INTO script_library (
          id, key, alias, scope, node_id, title, description, kind, content,
          variables_json, tags_json, created_at, updated_at
        ) VALUES (
          :id, :key, :alias, :scope, :nodeId, :title, :description, :kind, :content,
          :variablesJson, :tagsJson, :createdAt, :updatedAt
        )
      `,
      {
        ':id': id,
        ':key': next.key,
        ':alias': next.alias,
        ':scope': next.scope,
        ':nodeId': next.nodeId,
        ':title': next.title,
        ':description': next.description,
        ':kind': next.kind,
        ':content': next.content,
        ':variablesJson': JSON.stringify(next.variables),
        ':tagsJson': JSON.stringify(next.tags),
        ':createdAt': now,
        ':updatedAt': now,
      }
    );

    void persist();
    return getScript(id)!;
  }

  function updateScript(id: string, input: UpdateScriptInput): ScriptLibraryItem | null {
    const current = getScript(id);
    if (!current) {
      return null;
    }

    const next = normalizeUpdateInput(current, input);
    const existing = getScriptByScopeAndKey(next.scope, next.nodeId, next.key);
    if (existing && existing.id !== id) {
      throw new Error('同一作用域下脚本 key 已存在。');
    }
    assertAliasAvailable({ alias: next.alias, scope: next.scope, nodeId: next.nodeId, excludeId: id });
    const now = new Date().toISOString();

    database.run(
      `
        UPDATE script_library
        SET key = :key,
            alias = :alias,
            scope = :scope,
            node_id = :nodeId,
            title = :title,
            description = :description,
            kind = :kind,
            content = :content,
            variables_json = :variablesJson,
            tags_json = :tagsJson,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        ':id': id,
        ':key': next.key,
        ':alias': next.alias,
        ':scope': next.scope,
        ':nodeId': next.nodeId,
        ':title': next.title,
        ':description': next.description,
        ':kind': next.kind,
        ':content': next.content,
        ':variablesJson': JSON.stringify(next.variables),
        ':tagsJson': JSON.stringify(next.tags),
        ':updatedAt': now,
      }
    );

    void persist();
    return getScript(id);
  }

  function deleteScript(id: string) {
    database.run('DELETE FROM script_library WHERE id = :id', { ':id': id });
    void persist();
  }

  return {
    listAllScripts,
    listManagedScripts,
    listResolvedScripts,
    getScript,
    createScript,
    updateScript,
    deleteScript,
  };
}
