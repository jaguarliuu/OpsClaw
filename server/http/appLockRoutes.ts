import type { HttpRouteApp, HttpApiDependencies } from './support.js';
import { RequestError, isRecord, readRequiredString } from './support.js';

export function registerAppLockRoutes(app: HttpRouteApp, { appLockStore }: HttpApiDependencies) {
  app.get('/api/app-lock/status', (_req, res) => {
    res.json({ hasPassword: appLockStore.hasPassword() });
  });

  app.post('/api/app-lock/verify', async (req, res) => {
    try {
      if (!isRecord(req.body)) throw new RequestError(400, '请求格式错误。');
      const password = readRequiredString(req.body, 'password', '密码');
      const ok = await appLockStore.verifyPassword(password);
      if (!ok) throw new RequestError(401, '密码错误，请重试。');
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof RequestError) {
        res.status(error.statusCode).json({ message: error.message });
        return;
      }
      console.error(error);
      res.status(500).json({ message: '操作失败。' });
    }
  });

  app.post('/api/app-lock/password', async (req, res) => {
    try {
      if (!isRecord(req.body)) throw new RequestError(400, '请求格式错误。');
      const password = readRequiredString(req.body, 'password', '密码');
      const currentPassword =
        typeof req.body.currentPassword === 'string' ? req.body.currentPassword : undefined;
      await appLockStore.setPassword(password, currentPassword);
      res.sendStatus(204);
    } catch (error) {
      if (error instanceof Error && error.message === 'WRONG_CURRENT_PASSWORD') {
        res.status(401).json({ message: '当前密码错误。' });
        return;
      }
      if (error instanceof RequestError) {
        res.status(error.statusCode).json({ message: error.message });
        return;
      }
      console.error(error);
      res.status(500).json({ message: '操作失败。' });
    }
  });

  app.delete('/api/app-lock/password', async (req, res) => {
    try {
      if (!isRecord(req.body)) throw new RequestError(400, '请求格式错误。');
      const currentPassword = readRequiredString(req.body, 'currentPassword', '当前密码');
      const ok = await appLockStore.verifyPassword(currentPassword);
      if (!ok) throw new RequestError(401, '当前密码错误。');
      appLockStore.clearPassword();
      res.sendStatus(204);
    } catch (error) {
      if (error instanceof RequestError) {
        res.status(error.statusCode).json({ message: error.message });
        return;
      }
      console.error(error);
      res.status(500).json({ message: '操作失败。' });
    }
  });
}
