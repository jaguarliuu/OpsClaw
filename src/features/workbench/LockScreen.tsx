import { useState } from 'react';
import { useAppLock } from './AppLockContext';
import { verifyAppLockPassword } from './appLockApi';

export function LockScreen() {
  const { unlock } = useAppLock();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (!password || loading) return;
    setLoading(true);
    setError('');
    try {
      await verifyAppLockPassword(password);
      unlock();
    } catch {
      setError('密码错误，请重试。');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--app-bg-base)]">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mb-2 text-2xl font-bold tracking-tight text-[var(--app-text-primary)]">OpsClaw</div>
          <div className="text-sm text-[var(--app-text-secondary)]">请输入开屏密码以继续使用</div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock(); }}
          placeholder="请输入密码"
          disabled={loading}
          autoFocus
          className={`w-full rounded-lg border bg-[var(--app-bg-elevated2)] px-4 py-2.5 text-sm text-[var(--app-text-primary)] outline-none transition-colors placeholder:text-[var(--app-text-tertiary)] focus:border-[var(--app-accent-primary)] ${error ? 'border-red-500' : 'border-[var(--app-border-default)]'}`}
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <button
          onClick={() => void handleUnlock()}
          disabled={loading || !password}
          className="mt-4 w-full rounded-lg bg-[var(--app-accent-primary)] py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? '验证中…' : '解锁'}
        </button>
      </div>
    </div>
  );
}
