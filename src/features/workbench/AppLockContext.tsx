import { createContext, useContext, useEffect, useState } from 'react';
import { fetchAppLockStatus } from './appLockApi';

type AppLockContextValue = {
  hasPassword: boolean;
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
  refreshStatus: () => Promise<void>;
};

const Ctx = createContext<AppLockContextValue | null>(null);

const IDLE_TIMEOUT = 5 * 60 * 1000;
const IDLE_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const;

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [hasPassword, setHasPassword] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshStatus = async () => {
    try {
      const { hasPassword: hp } = await fetchAppLockStatus();
      setHasPassword(hp);
      if (hp) setIsLocked(true);
    } catch {
      // 后端未就绪时不阻塞渲染
    }
  };

  useEffect(() => {
    void refreshStatus().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!hasPassword || isLocked) return;
    const timer = { id: 0 };
    const reset = () => {
      clearTimeout(timer.id);
      timer.id = window.setTimeout(() => setIsLocked(true), IDLE_TIMEOUT);
    };
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer.id);
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [hasPassword, isLocked]);

  if (!ready) return null;

  return (
    <Ctx.Provider value={{
      hasPassword,
      isLocked,
      lock: () => setIsLocked(true),
      unlock: () => setIsLocked(false),
      refreshStatus,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppLock must be inside AppLockProvider');
  return ctx;
}
