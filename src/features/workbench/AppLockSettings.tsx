import { useState } from 'react';
import { useAppLock } from './AppLockContext';
import { setAppLockPassword, deleteAppLockPassword } from './appLockApi';
import { SectionCard } from '@/components/ui/SectionCard';

export function AppLockSettings() {
  const { hasPassword, refreshStatus } = useAppLock();
  const [mode, setMode] = useState<'idle' | 'set' | 'change' | 'delete'>('idle');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setMode('idle'); setCurrent(''); setNext(''); setConfirm(''); setError(''); };

  const handleSubmit = async () => {
    setError('');
    if (mode === 'delete') {
      if (!current) { setError('请输入当前密码。'); return; }
      setLoading(true);
      try {
        await deleteAppLockPassword(current);
        await refreshStatus();
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : '操作失败。');
      } finally { setLoading(false); }
      return;
    }
    if (!next) { setError('请输入新密码。'); return; }
    if (next !== confirm) { setError('两次输入的密码不一致。'); return; }
    if (mode === 'change' && !current) { setError('请输入当前密码。'); return; }
    setLoading(true);
    try {
      await setAppLockPassword(next, mode === 'change' ? current : undefined);
      await refreshStatus();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败。');
    } finally { setLoading(false); }
  };

  const inputClass = 'w-full rounded-lg border border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none focus:border-[var(--app-accent-primary)] placeholder:text-[var(--app-text-tertiary)]';
  const btnPrimary = 'rounded-lg bg-[var(--app-accent-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40';
  const btnGhost = 'rounded-lg border border-[var(--app-border-default)] px-4 py-2 text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-elevated2)]';

  return (
    <SectionCard title="开屏密码" description="设置密码后，每次启动应用需验证身份才能使用。">
      {mode === 'idle' ? (
        <div className="flex gap-3">
          {!hasPassword ? (
            <button className={btnPrimary} onClick={() => setMode('set')}>设置密码</button>
          ) : (
            <>
              <button className={btnPrimary} onClick={() => setMode('change')}>修改密码</button>
              <button className={btnGhost} onClick={() => setMode('delete')}>删除密码</button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-sm">
          {(mode === 'change' || mode === 'delete') && (
            <input type="password" placeholder="当前密码" value={current}
              onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
          )}
          {mode !== 'delete' && (
            <>
              <input type="password" placeholder="新密码" value={next}
                onChange={(e) => setNext(e.target.value)} className={inputClass} />
              <input type="password" placeholder="确认新密码" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className={inputClass}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }} />
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={() => void handleSubmit()} disabled={loading}>
              {loading ? '处理中…' : mode === 'delete' ? '确认删除' : '保存'}
            </button>
            <button className={btnGhost} onClick={reset}>取消</button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
