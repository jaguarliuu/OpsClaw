import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const encryptionVersionPrefix = 'opsclaw:v1:';
const keyFilePath = path.resolve(process.cwd(), 'data', 'opsclaw.master.key');

function parseKey(rawValue: string) {
  const value = rawValue.trim();

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 32) {
    return decoded;
  }

  throw new Error('OPSCLAW_MASTER_KEY must be a 32-byte base64 string or 64-char hex string.');
}

async function loadOrCreateKey() {
  const envKey = process.env.OPSCLAW_MASTER_KEY;
  if (envKey) {
    return parseKey(envKey);
  }

  await fs.mkdir(path.dirname(keyFilePath), { recursive: true });

  try {
    const file = await fs.readFile(keyFilePath, 'utf8');
    return parseKey(file);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }

  const key = randomBytes(32);
  await fs.writeFile(keyFilePath, key.toString('base64'), { mode: 0o600 });
  await fs.chmod(keyFilePath, 0o600);
  return key;
}

export type SecretVault = {
  decrypt: (value: string | null) => string | null;
  encrypt: (value: string | null | undefined) => string | null;
};

let secretVaultPromise: Promise<SecretVault> | null = null;

async function createSecretVault(): Promise<SecretVault> {
  const key = await loadOrCreateKey();

  return {
    decrypt(value) {
      if (!value) {
        return null;
      }

      if (!value.startsWith(encryptionVersionPrefix)) {
        return value;
      }

      const payload = Buffer.from(value.slice(encryptionVersionPrefix.length), 'base64');
      const iv = payload.subarray(0, 12);
      const authTag = payload.subarray(12, 28);
      const ciphertext = payload.subarray(28);

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },

    encrypt(value) {
      if (!value) {
        return null;
      }

      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return `${encryptionVersionPrefix}${Buffer.concat([iv, authTag, ciphertext]).toString('base64')}`;
    },
  };
}

export function getSecretVault() {
  if (!secretVaultPromise) {
    secretVaultPromise = createSecretVault();
  }

  return secretVaultPromise;
}
