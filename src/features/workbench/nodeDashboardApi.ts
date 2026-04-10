import type { NodeDashboardPayload } from './types.js';
import { buildServerHttpBaseUrl } from './serverBase';

async function readJson<T>(response: Response) {
  const payload = (await response.json()) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? '请求失败。');
  }

  return payload;
}

export async function fetchNodeDashboard(nodeId: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${nodeId}/dashboard`);
  return readJson<NodeDashboardPayload>(response);
}

export async function collectNodeDashboard(nodeId: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${nodeId}/dashboard/collect`, {
    method: 'POST',
  });
  return readJson<NodeDashboardPayload>(response);
}
