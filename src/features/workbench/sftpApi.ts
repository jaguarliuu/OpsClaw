import type {
  SftpDirectoryPayload,
  SftpTransferTask,
} from './types.js';
import { buildFetchDebugMessage } from './httpDebugModel.js';
import { buildServerHttpBaseUrl } from './serverBase.js';

async function readJson<T>(response: Response) {
  const payload = (await response.json()) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? '请求失败。');
  }

  return payload;
}

async function fetchFromOpsClaw(path: string, init?: RequestInit) {
  const url = `${buildServerHttpBaseUrl()}${path}`;

  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(
      buildFetchDebugMessage({
        method: init?.method ?? 'GET',
        url,
        error,
        location: {
          protocol: window.location.protocol,
          origin: window.location.origin,
        },
        runtime: window.__OPSCLAW_RUNTIME__,
      })
    );
  }
}

export async function fetchSftpDirectory(nodeId: string, path: string) {
  const response = await fetchFromOpsClaw(
    `/api/nodes/${encodeURIComponent(nodeId)}/sftp/list?path=${encodeURIComponent(path)}`
  );
  const payload = await readJson<{ path: string; items: SftpDirectoryPayload['items'] }>(response);

  return {
    nodeId,
    path: payload.path,
    items: payload.items,
  } satisfies SftpDirectoryPayload;
}

export async function fetchSftpTasks(nodeId: string) {
  const response = await fetchFromOpsClaw(
    `/api/nodes/${encodeURIComponent(nodeId)}/sftp/tasks`
  );
  const payload = await readJson<{ items: SftpTransferTask[] }>(response);
  return payload.items;
}
