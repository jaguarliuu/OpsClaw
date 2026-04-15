import { buildServerHttpBaseUrl } from './serverBase';

const base = () => buildServerHttpBaseUrl();

async function readJson<T>(res: Response): Promise<T> {
  const payload = await res.json() as T & { message?: string };
  if (!res.ok) throw new Error((payload as { message?: string }).message ?? '请求失败。');
  return payload;
}

export async function fetchAppLockStatus(): Promise<{ hasPassword: boolean }> {
  const res = await fetch(`${base()}/api/app-lock/status`);
  return readJson(res);
}

export async function verifyAppLockPassword(password: string): Promise<void> {
  const res = await fetch(`${base()}/api/app-lock/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  await readJson(res);
}

export async function setAppLockPassword(password: string, currentPassword?: string): Promise<void> {
  const res = await fetch(`${base()}/api/app-lock/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, currentPassword }),
  });
  if (!res.ok) {
    const payload = await res.json() as { message?: string };
    throw new Error(payload.message ?? '请求失败。');
  }
}

export async function deleteAppLockPassword(currentPassword: string): Promise<void> {
  const res = await fetch(`${base()}/api/app-lock/password`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword }),
  });
  if (!res.ok) {
    const payload = await res.json() as { message?: string };
    throw new Error(payload.message ?? '请求失败。');
  }
}
