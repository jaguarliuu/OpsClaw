import type { AuthMode, CommandRecord, LlmProvider } from '@/features/workbench/types';
import { buildServerHttpBaseUrl } from '@/features/workbench/serverBase';

export type NodeSummaryRecord = {
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

export type NodeDetailRecord = NodeSummaryRecord & {
  password: string | null;
  privateKey: string | null;
  passphrase: string | null;
};

export type NodeUpsertInput = {
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

export type GroupRecord = {
  id: string;
  name: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
};

async function readJson<T>(response: Response) {
  const payload = (await response.json()) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? '请求失败。');
  }

  return payload;
}

export async function fetchNodes() {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes`);
  const payload = await readJson<{ items: NodeSummaryRecord[] }>(response);
  return payload.items;
}

export async function fetchGroups() {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/groups`);
  const payload = await readJson<{ items: GroupRecord[] }>(response);
  return payload.items;
}

export async function fetchNode(id: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${id}`);
  const payload = await readJson<{ item: NodeDetailRecord }>(response);
  return payload.item;
}

export async function createGroup(name: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  const payload = await readJson<{ item: GroupRecord }>(response);
  return payload.item;
}

export async function renameGroup(id: string, name: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/groups/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  const payload = await readJson<{ item: GroupRecord }>(response);
  return payload.item;
}

export async function deleteGroup(id: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/groups/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? '删除分组失败。');
  }
}

export async function createNode(input: NodeUpsertInput) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = await readJson<{ item: NodeSummaryRecord }>(response);
  return payload.item;
}

export async function updateNode(id: string, input: NodeUpsertInput) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = await readJson<{ item: NodeSummaryRecord }>(response);
  return payload.item;
}

export async function moveNodeToGroup(id: string, groupId: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${id}/group`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ groupId }),
  });

  const payload = await readJson<{ item: NodeSummaryRecord }>(response);
  return payload.item;
}

export async function deleteNode(id: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? '删除失败。');
  }
}

export async function fetchPingAll(): Promise<Record<string, { online: boolean; latencyMs?: number }>> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/ping-all`);
  if (!response.ok) {
    throw new Error('ping-all 请求失败。');
  }
  return response.json() as Promise<Record<string, { online: boolean; latencyMs?: number }>>;
}

export async function recordCommand(input: { command: string; nodeId?: string }): Promise<CommandRecord> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ item: CommandRecord }>(response);
  return payload.item;
}

export async function searchCommands(q: string, nodeId?: string): Promise<CommandRecord[]> {
  const params = new URLSearchParams({ q });
  if (nodeId) params.set('nodeId', nodeId);
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/commands/search?${params.toString()}`);
  const payload = await readJson<{ items: CommandRecord[] }>(response);
  return payload.items;
}

export async function deleteCommand(id: string): Promise<void> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/commands/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 204) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? '删除历史命令失败。');
  }
}

export async function fetchLlmProviders(): Promise<LlmProvider[]> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/llm/providers`);
  const payload = await readJson<{ items: LlmProvider[] }>(response);
  return payload.items;
}

export async function createLlmProvider(input: {
  name: string;
  providerType: string;
  baseUrl?: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<LlmProvider> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/llm/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ item: LlmProvider }>(response);
  return payload.item;
}

export async function updateLlmProvider(id: string, input: Partial<{
  name: string;
  providerType: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}>): Promise<LlmProvider> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/llm/providers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ item: LlmProvider }>(response);
  return payload.item;
}

export async function deleteLlmProvider(id: string): Promise<void> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/llm/providers/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 204) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? '删除 LLM 配置失败。');
  }
}

export async function setDefaultLlmProvider(id: string): Promise<void> {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/llm/providers/${id}/default`, {
    method: 'PUT',
  });
  if (!response.ok && response.status !== 204) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? '设置默认 LLM 失败。');
  }
}
