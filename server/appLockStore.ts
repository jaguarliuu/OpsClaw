import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { getSqliteDatabase } from './database.js';

const pbkdf2 = promisify(crypto.pbkdf2);

const KEY = 'app_lock_hash';
const ITERATIONS = 100_000;
const KEYLEN = 64;
const DIGEST = 'sha512';

export type AppLockStore = {
  hasPassword: () => boolean;
  setPassword: (password: string, currentPassword?: string) => Promise<void>;
  verifyPassword: (password: string) => Promise<boolean>;
  clearPassword: () => void;
};

export async function createAppLockStore(): Promise<AppLockStore> {
  const { database, persist } = await getSqliteDatabase();

  function readHash(): string | null {
    const result = database.exec(`SELECT value FROM app_settings WHERE key = '${KEY}';`);
    const value = result[0]?.values[0]?.[0];
    return typeof value === 'string' ? value : null;
  }

  function hasPassword(): boolean {
    return readHash() !== null;
  }

  async function verifyPassword(password: string): Promise<boolean> {
    const stored = readHash();
    if (!stored) return false;
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const hash = await pbkdf2(password, salt, ITERATIONS, KEYLEN, DIGEST);
    return hash.toString('hex') === hashHex;
  }

  async function setPassword(password: string, currentPassword?: string): Promise<void> {
    if (hasPassword()) {
      if (!currentPassword || !(await verifyPassword(currentPassword))) {
        throw new Error('WRONG_CURRENT_PASSWORD');
      }
    }
    const salt = crypto.randomBytes(32);
    const hash = await pbkdf2(password, salt, ITERATIONS, KEYLEN, DIGEST);
    const stored = `${salt.toString('hex')}:${hash.toString('hex')}`;
    database.run(
      `INSERT INTO app_settings (key, value) VALUES (:key, :value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      { ':key': KEY, ':value': stored }
    );
    await persist();
  }

  function clearPassword(): void {
    database.run(`DELETE FROM app_settings WHERE key = '${KEY}';`);
    void persist();
  }

  return { hasPassword, setPassword, verifyPassword, clearPassword };
}
