import type { Express } from 'express';

import { createCommandHistoryStore } from '../commandHistoryStore.js';
import {
  createLlmProviderStore,
  type LlmProviderInput,
  type LlmProviderType,
} from '../llmProviderStore.js';
import type { LlmMessage } from '../llmClient.js';
import { createNodeStore, type AuthMode, type NodeInput } from '../nodeStore.js';
import {
  createScriptLibraryStore,
  type CreateScriptInput,
  type ScriptKind,
  type ScriptScope,
  type ScriptVariableDefinition,
} from '../scriptLibraryStore.js';
import type { OpsAgentRuntime } from '../agent/agentRuntime.js';
import type { FileMemoryStore } from '../agent/fileMemoryStore.js';

export type NodeStore = Awaited<ReturnType<typeof createNodeStore>>;
export type CommandHistoryStore = Awaited<ReturnType<typeof createCommandHistoryStore>>;
export type LlmProviderStore = Awaited<ReturnType<typeof createLlmProviderStore>>;
export type ScriptLibraryStore = Awaited<ReturnType<typeof createScriptLibraryStore>>;

export type HttpApiDependencies = {
  nodeStore: NodeStore;
  commandHistoryStore: CommandHistoryStore;
  llmProviderStore: LlmProviderStore;
  scriptLibraryStore: ScriptLibraryStore;
  fileMemoryStore: FileMemoryStore;
  agentRuntime: OpsAgentRuntime;
};

export type HttpRouteApp = Pick<Express, 'get' | 'post' | 'put' | 'delete'>;

export class RequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readRequiredString(
  body: Record<string, unknown>,
  key: string,
  label: string,
  options?: { allowEmpty?: boolean }
) {
  const value = body[key];
  if (typeof value !== 'string') {
    throw new RequestError(400, `${label}不能为空。`);
  }

  const trimmed = value.trim();
  if (!options?.allowEmpty && !trimmed) {
    throw new RequestError(400, `${label}不能为空。`);
  }

  return trimmed;
}

export function readOptionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new RequestError(400, `${key}格式错误。`);
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function readOptionalBoolean(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new RequestError(400, `${key}格式错误。`);
  }

  return value;
}

export function readPort(body: Record<string, unknown>) {
  const value = body.port;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RequestError(400, '端口必须是整数。');
  }

  if (value < 1 || value > 65535) {
    throw new RequestError(400, '端口必须在 1 到 65535 之间。');
  }

  return value;
}

export function readAuthMode(body: Record<string, unknown>): AuthMode {
  const authMode = body.authMode;
  if (authMode !== 'password' && authMode !== 'privateKey') {
    throw new RequestError(400, '验证方式不正确。');
  }

  return authMode;
}

export function parseNodeInput(payload: unknown, options?: { allowMissingSecret?: boolean }): NodeInput {
  if (!isRecord(payload)) {
    throw new RequestError(400, '节点配置格式错误。');
  }

  const host = readRequiredString(payload, 'host', '主机地址');
  const authMode = readAuthMode(payload);
  const password = readOptionalString(payload, 'password');
  const privateKey = readOptionalString(payload, 'privateKey');
  const passphrase = readOptionalString(payload, 'passphrase');

  if (authMode === 'password' && !password && !options?.allowMissingSecret) {
    throw new RequestError(400, '密码验证必须提供密码。');
  }

  if (authMode === 'privateKey' && !privateKey && !options?.allowMissingSecret) {
    throw new RequestError(400, '密钥验证必须提供私钥。');
  }

  return {
    name: readOptionalString(payload, 'name') ?? host,
    groupId: readOptionalString(payload, 'groupId'),
    groupName: readOptionalString(payload, 'groupName') ?? '默认',
    jumpHostId: readOptionalString(payload, 'jumpHostId'),
    host,
    port: readPort(payload),
    username: readRequiredString(payload, 'username', '用户名'),
    authMode,
    password,
    privateKey,
    passphrase,
    note: readOptionalString(payload, 'note') ?? '',
  };
}

export function readOptionalInteger(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RequestError(400, `${key}格式错误。`);
  }

  return value;
}

export function readOptionalNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new RequestError(400, `${key}格式错误。`);
  }

  return value;
}

export function readProviderType(value: unknown): LlmProviderType {
  if (
    value !== 'zhipu' &&
    value !== 'minimax' &&
    value !== 'qwen' &&
    value !== 'deepseek' &&
    value !== 'openai_compatible'
  ) {
    throw new RequestError(400, 'LLM 提供商类型不正确。');
  }

  return value;
}

export function readModels(body: Record<string, unknown>, options?: { optional?: boolean }) {
  const value = body.models;
  if (value === undefined || value === null) {
    if (options?.optional) {
      return undefined;
    }
    throw new RequestError(400, '模型列表不能为空。');
  }

  if (!Array.isArray(value)) {
    throw new RequestError(400, '模型列表格式错误。');
  }

  const models = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  if (models.length === 0 && !options?.optional) {
    throw new RequestError(400, '模型列表不能为空。');
  }

  return models;
}

export function readOptionalModel(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new RequestError(400, `${key}格式错误。`);
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function parseCreateProviderInput(payload: unknown): LlmProviderInput {
  if (!isRecord(payload)) {
    throw new RequestError(400, 'LLM 配置格式错误。');
  }

  return {
    name: readRequiredString(payload, 'name', '名称'),
    providerType: readProviderType(payload.providerType),
    baseUrl: readOptionalString(payload, 'baseUrl'),
    apiKey: readRequiredString(payload, 'apiKey', 'API Key'),
    models: readModels(payload) ?? [],
    defaultModel: readOptionalModel(payload, 'defaultModel'),
    maxTokens: readOptionalInteger(payload, 'maxTokens'),
    temperature: readOptionalNumber(payload, 'temperature'),
  };
}

export function parseUpdateProviderInput(payload: unknown): Partial<LlmProviderInput> {
  if (!isRecord(payload)) {
    throw new RequestError(400, 'LLM 配置格式错误。');
  }

  const nextInput: Partial<LlmProviderInput> = {};

  if (payload.name !== undefined) {
    nextInput.name = readRequiredString(payload, 'name', '名称');
  }

  if (payload.providerType !== undefined) {
    nextInput.providerType = readProviderType(payload.providerType);
  }

  if (payload.baseUrl !== undefined) {
    nextInput.baseUrl = readOptionalString(payload, 'baseUrl');
  }

  if (payload.apiKey !== undefined) {
    const apiKey = readOptionalString(payload, 'apiKey');
    if (apiKey) {
      nextInput.apiKey = apiKey;
    }
  }

  if (payload.models !== undefined) {
    nextInput.models = readModels(payload, { optional: false });
  }

  if (payload.defaultModel !== undefined) {
    nextInput.defaultModel = readOptionalModel(payload, 'defaultModel');
  }

  if (payload.maxTokens !== undefined) {
    nextInput.maxTokens = readOptionalInteger(payload, 'maxTokens');
  }

  if (payload.temperature !== undefined) {
    nextInput.temperature = readOptionalNumber(payload, 'temperature');
  }

  return nextInput;
}

export function parseCsvImportInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new RequestError(400, 'CSV 导入请求格式错误。');
  }

  const csv = payload.csv;
  if (typeof csv !== 'string' || !csv.trim()) {
    throw new RequestError(400, 'CSV 内容不能为空。');
  }

  return { csv };
}

function readScriptScope(value: unknown): ScriptScope {
  if (value !== 'global' && value !== 'node') {
    throw new RequestError(400, '脚本作用域不正确。');
  }

  return value;
}

function readScriptKind(value: unknown): ScriptKind {
  if (value !== 'plain' && value !== 'template') {
    throw new RequestError(400, '脚本类型不正确。');
  }

  return value;
}

function readScriptVariables(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new RequestError(400, '脚本变量列表格式错误。');
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new RequestError(400, '脚本变量格式错误。');
    }

    const inputType = item.inputType;
    if (inputType !== 'text' && inputType !== 'textarea') {
      throw new RequestError(400, '脚本变量输入类型不正确。');
    }

    return {
      name: readRequiredString(item, 'name', '变量名'),
      label: readRequiredString(item, 'label', '变量标签'),
      inputType,
      required: readOptionalBoolean(item, 'required') ?? false,
      defaultValue: readOptionalString(item, 'defaultValue') ?? '',
      placeholder: readOptionalString(item, 'placeholder') ?? '',
    } satisfies ScriptVariableDefinition;
  });
}

function readScriptTags(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new RequestError(400, '脚本标签格式错误。');
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function parseCreateScriptInput(payload: unknown): CreateScriptInput {
  if (!isRecord(payload)) {
    throw new RequestError(400, '脚本配置格式错误。');
  }

  const scope = readScriptScope(payload.scope);

  return {
    key: readRequiredString(payload, 'key', '脚本 key'),
    scope,
    nodeId: scope === 'node' ? readRequiredString(payload, 'nodeId', '节点 ID') : null,
    title: readRequiredString(payload, 'title', '脚本标题'),
    description: readOptionalString(payload, 'description') ?? '',
    kind: readScriptKind(payload.kind),
    content: readRequiredString(payload, 'content', '脚本内容', { allowEmpty: true }),
    variables: readScriptVariables(payload, 'variables'),
    tags: readScriptTags(payload, 'tags'),
  };
}

export function parseUpdateScriptInput(payload: unknown): Partial<CreateScriptInput> {
  if (!isRecord(payload)) {
    throw new RequestError(400, '脚本配置格式错误。');
  }

  const nextInput: Partial<CreateScriptInput> = {};

  if (payload.key !== undefined) {
    nextInput.key = readRequiredString(payload, 'key', '脚本 key');
  }

  if (payload.scope !== undefined) {
    nextInput.scope = readScriptScope(payload.scope);
  }

  if (payload.nodeId !== undefined) {
    nextInput.nodeId =
      payload.nodeId === null ? null : readRequiredString(payload, 'nodeId', '节点 ID');
  }

  if (payload.title !== undefined) {
    nextInput.title = readRequiredString(payload, 'title', '脚本标题');
  }

  if (payload.description !== undefined) {
    nextInput.description = readOptionalString(payload, 'description') ?? '';
  }

  if (payload.kind !== undefined) {
    nextInput.kind = readScriptKind(payload.kind);
  }

  if (payload.content !== undefined) {
    nextInput.content = readRequiredString(payload, 'content', '脚本内容', { allowEmpty: true });
  }

  if (payload.variables !== undefined) {
    nextInput.variables = readScriptVariables(payload, 'variables');
  }

  if (payload.tags !== undefined) {
    nextInput.tags = readScriptTags(payload, 'tags');
  }

  return nextInput;
}

export function parseLlmMessages(payload: unknown): LlmMessage[] {
  if (!Array.isArray(payload)) {
    throw new RequestError(400, '消息列表格式错误。');
  }

  return payload.map((message) => {
    if (!isRecord(message)) {
      throw new RequestError(400, '消息格式错误。');
    }

    const role = message.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      throw new RequestError(400, '消息角色不正确。');
    }

    const content = message.content;
    if (typeof content !== 'string') {
      throw new RequestError(400, '消息内容必须是字符串。');
    }

    return { role, content };
  });
}

export function parseLlmChatInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new RequestError(400, 'LLM 对话请求格式错误。');
  }

  return {
    providerId: readRequiredString(payload, 'providerId', 'LLM 配置'),
    model: readRequiredString(payload, 'model', '模型'),
    messages: parseLlmMessages(payload.messages),
  };
}

export function parseGroupInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new RequestError(400, '分组配置格式错误。');
  }

  return {
    name: readRequiredString(payload, 'name', '分组名称'),
  };
}

export function parseMoveNodeInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new RequestError(400, '节点分组配置格式错误。');
  }

  return {
    groupId: readRequiredString(payload, 'groupId', '目标分组'),
  };
}
