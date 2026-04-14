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

function readDownloadFileName(response: Response, fallbackName: string) {
  const disposition = response.headers.get('content-disposition');
  if (!disposition) {
    return fallbackName;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = disposition.match(/filename="([^"]+)"/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallbackName;
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

export async function createSftpDirectory(nodeId: string, path: string) {
  const response = await fetchFromOpsClaw(
    `/api/nodes/${encodeURIComponent(nodeId)}/sftp/directories`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    }
  );

  return readJson<{ path: string }>(response);
}

export async function uploadSftpBrowserFile(nodeId: string, remotePath: string, file: File) {
  const response = await fetchFromOpsClaw(
    `/api/nodes/${encodeURIComponent(nodeId)}/sftp/file-content?path=${encodeURIComponent(remotePath)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: await file.arrayBuffer(),
    }
  );

  return readJson<{ path: string; size: number }>(response);
}

export async function uploadSftpLocalFile(nodeId: string, remotePath: string, localPath: string) {
  const response = await fetchFromOpsClaw(`/api/nodes/${encodeURIComponent(nodeId)}/sftp/file-local`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      remotePath,
      localPath,
    }),
  });

  return readJson<{ path: string; size: number }>(response);
}

export async function fetchSftpFilePreview(nodeId: string, remotePath: string) {
  const response = await fetchFromOpsClaw(
    `/api/nodes/${encodeURIComponent(nodeId)}/sftp/preview?path=${encodeURIComponent(remotePath)}`
  );
  return readJson<{ path: string; content: string }>(response);
}

export async function downloadSftpFile(nodeId: string, remotePath: string) {
  const fallbackName = remotePath.split('/').filter(Boolean).pop() ?? 'download';
  const response = await fetchFromOpsClaw(
    `/api/nodes/${encodeURIComponent(nodeId)}/sftp/file?path=${encodeURIComponent(remotePath)}`
  );

  if (!response.ok) {
    let message = '下载失败。';
    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message ?? message;
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    throw new Error(message);
  }

  return {
    blob: await response.blob(),
    fileName: readDownloadFileName(response, fallbackName),
  };
}
