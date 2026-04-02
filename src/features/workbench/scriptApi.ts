import type { ScriptLibraryItem, ScriptLibraryUpsertInput } from './types.js';
import { buildServerHttpBaseUrl } from './serverBase';

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

export async function createScript(input: ScriptLibraryUpsertInput) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/scripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ item: ScriptLibraryItem }>(response);
  return payload.item;
}

export async function updateScript(id: string, input: Partial<ScriptLibraryUpsertInput>) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/scripts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ item: ScriptLibraryItem }>(response);
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
}
