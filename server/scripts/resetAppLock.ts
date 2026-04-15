// 管理员工具：重置开屏密码（不经 HTTP API）
// 用法：npx tsx server/scripts/resetAppLock.ts
import { getSqliteDatabase } from '../database.js';

const { database, persist } = await getSqliteDatabase();
database.run(`DELETE FROM app_settings WHERE key = 'app_lock_hash';`);
await persist();
console.log('[resetAppLock] 开屏密码已清除，下次启动应用将直接进入。');
process.exit(0);
