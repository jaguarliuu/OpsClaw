import type {
  ManagedScriptLibraryItem,
  ScriptLibraryItem,
  ScriptLibraryUpsertInput,
} from './types.js';
import { buildServerHttpBaseUrl } from './serverBase';
import { dispatchScriptLibraryChanged } from './scriptLibraryEvents.js';

async function readJson<T>(response: Response) {
  const payload = (await response.json()) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? '请求失败。');
  }

  return payload;
}

export async function fetchScripts(nodeId?: string | null) {
  const url = new URL(`${buildServerHttpBaseUrl()}/api/scripts`);
  if (nodeId) {
    url.searchParams.set('nodeId', nodeId);
  }

  const response = await fetch(url);
  const payload = await readJson<{ items: ScriptLibraryItem[] }>(response);
  return payload.items;
}

export async function fetchManagedScripts(input?: {
  scope?: 'global' | 'node';
  nodeId?: string | null;
}) {
  const url = new URL(`${buildServerHttpBaseUrl()}/api/scripts/manage`);

  if (input?.scope) {
    url.searchParams.set('scope', input.scope);
  }
  if (input?.nodeId) {
    url.searchParams.set('nodeId', input.nodeId);
  }

  const response = await fetch(url);
  const payload = await readJson<{ items: ManagedScriptLibraryItem[] }>(response);
  return payload.items;
}

export async function createScript(input: ScriptLibraryUpsertInput) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/scripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ item: ManagedScriptLibraryItem }>(response);
  dispatchScriptLibraryChanged({
    nodeId: payload.item.scope === 'node' ? payload.item.nodeId : null,
  });
  return payload.item;
}

export async function updateScript(id: string, input: Partial<ScriptLibraryUpsertInput>) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/scripts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ item: ManagedScriptLibraryItem }>(response);
  dispatchScriptLibraryChanged({
    nodeId: payload.item.scope === 'node' ? payload.item.nodeId : null,
  });
  return payload.item;
}

export async function deleteScript(id: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/scripts/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? '删除脚本失败。');
  }

  dispatchScriptLibraryChanged({ nodeId: null });
}
