'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { DialogHost } from '@/components/ui/DialogHost';

const JdihContext = createContext(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;
const IDLE_CHECK_MS = 30 * 1000;

const EMPTY_SNAPSHOT = {
  today: '',
  currentUserId: null,
  units: [],
  categories: [],
  users: [],
  userUnits: [],
  documents: [],
  versions: [],
  reviewLogs: [],
  documentLogs: [],
  notifications: [],
};

export function JdihProvider({ children }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState('light');
  const [saving, setSaving] = useState(false);
  const [dirtyDraft, setDirtyDraft] = useState(false);
  const [uploadState, setUploadState] = useState({ status: 'IDLE', fileName: '', progress: 0 });
  const [toasts, setToasts] = useState([]);
  const [dialogConfig, setDialogConfig] = useState(null);
  const dialogResolverRef = useRef(null);
  const savingRef = useRef(false);
  const revisionRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const lastPingRef = useRef(Date.now());

  // Persistent view UI state across route navigation
  const [lastListRoute, setLastListRoute] = useState('/dokumen');
  const [previewModeByVersion, setPreviewModeByVersion] = useState({});
  const [docFilters, setDocFilters] = useState({
    q: '', unitId: '', categoryId: '', sortBy: 'TERBARU', showInactive: false, moreOpen: false, pageSize: 10, page: 1,
  });
  const [myUnitDocFilters, setMyUnitDocFilters] = useState({
    q: '', unitId: '', categoryId: '', sortBy: 'TERBARU', showInactive: false, moreOpen: false, pageSize: 10, page: 1,
  });
  const [pengajuanFilter, setPengajuanFilter] = useState('SEMUA');
  const [pengajuanSort, setPengajuanSort] = useState('TERBARU');
  const [verifikasiTab, setVerifikasiTab] = useState('MENUNGGU');
  const [verifikasiSort, setVerifikasiSort] = useState('TERBARU');
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminUserPage, setAdminUserPage] = useState(1);
  const [adminUserPageSize, setAdminUserPageSize] = useState(10);
  const [adminUnitSearch, setAdminUnitSearch] = useState('');
  const [draftStep1, setDraftStep1] = useState({ unitId: '', categoryId: 'cat-spo', metode: 'TEMPLATE' });

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    const duration = type === 'error' ? 8000 : 4500;
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, duration);
  }, []);

  const receive = useCallback((nextSnap) => {
    revisionRef.current += 1;
    setSnapshot((prev) => ({ ...prev, ...nextSnap }));
    if (nextSnap?.currentUserId) {
      lastPingRef.current = Date.now();
    } else {
      setDirtyDraft(false);
    }
  }, []);

  const applyTheme = useCallback((nextTheme) => {
    setTheme(nextTheme);
    try {
      localStorage.setItem('jdih_theme', nextTheme);
    } catch {}
    document.documentElement.setAttribute('data-theme', nextTheme);
  }, []);

  const toggleThemeWithMotion = useCallback((ev) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const btn = ev?.currentTarget || null;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      applyTheme(nextTheme);
      return;
    }
    if (typeof document.startViewTransition === 'function' && btn) {
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const vt = document.startViewTransition(() => applyTheme(nextTheme));
      vt.ready
        .then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxR}px at ${x}px ${y}px)`] },
            { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
          );
        })
        .catch(() => {});
      return;
    }
    document.documentElement.classList.add('theme-transitioning');
    applyTheme(nextTheme);
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 300);
  }, [theme, applyTheme]);

  const openDialog = useCallback((config) => new Promise((resolve) => {
    dialogResolverRef.current = resolve;
    setDialogConfig(config);
  }), []);

  const resolveDialog = useCallback((val) => {
    const resolve = dialogResolverRef.current;
    dialogResolverRef.current = null;
    setDialogConfig(null);
    resolve?.(val);
  }, []);

  const refreshState = useCallback(async () => {
    if (savingRef.current || dirtyDraft) return;
    const rev = revisionRef.current;
    try {
      const nextSnap = await api('state');
      if (savingRef.current || revisionRef.current !== rev) return;
      receive(nextSnap);
    } catch (error) {
      if (error.status === 401 && !savingRef.current && revisionRef.current === rev) {
        receive(EMPTY_SNAPSHOT);
        router.replace('/login');
      }
    }
  }, [dirtyDraft, receive, router]);

  const writeAction = useCallback(async (url, method, body, successMessage, onDone) => {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await api(url, method, body);
      if (result.state) receive(result.state);
      if (successMessage) showToast(successMessage, 'success');
      if (onDone) await onDone(result);
      return result;
    } catch (error) {
      if (error.status === 401) {
        receive(EMPTY_SNAPSHOT);
        router.replace('/login');
      }
      showToast(error.message, 'error');
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [receive, router, showToast]);

  const logout = useCallback(async () => {
    await writeAction('auth/logout', 'POST', undefined, '', () => {
      receive(EMPTY_SNAPSHOT);
      router.replace('/login');
    });
  }, [receive, router, writeAction]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('jdih_theme') || 'light';
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } catch {}

    let active = true;
    (async () => {
      try {
        const snap = await api('state');
        if (active) receive(snap);
      } catch (error) {
        if (active && error.status !== 401) showToast(error.message, 'error');
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [receive, showToast]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (dirtyDraft || uploadState.status === 'UPLOADING') {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyDraft, uploadState.status]);

  const loggedIn = Boolean(snapshot.currentUserId);
  const state = { ...snapshot, loggedIn };

  useEffect(() => {
    if (!loggedIn) return undefined;
    const nowMs = Date.now();
    lastActivityRef.current = nowMs;
    lastPingRef.current = nowMs;
    let expired = false;

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const checkSession = () => {
      if (expired) return;
      const currentMs = Date.now();
      if (currentMs - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        expired = true;
        api('auth/logout', 'POST').catch(() => {});
        receive(EMPTY_SNAPSHOT);
        showToast('Sesi berakhir karena 30 menit tanpa aktivitas. Silakan masuk kembali.', 'error');
        router.replace('/login');
        return;
      }
      if (
        currentMs - lastPingRef.current >= KEEPALIVE_INTERVAL_MS &&
        lastActivityRef.current > lastPingRef.current
      ) {
        lastPingRef.current = currentMs;
        api('auth/ping', 'GET').catch((error) => {
          if (error?.status === 401 && !expired) {
            expired = true;
            receive(EMPTY_SNAPSHOT);
            showToast('Sesi berakhir. Silakan masuk kembali.', 'error');
            router.replace('/login');
          }
        });
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkSession();
    };

    const events = ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = setInterval(checkSession, IDLE_CHECK_MS);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, [loggedIn, receive, router, showToast]);

  const value = {
    state,
    loaded,
    loggedIn,
    theme,
    saving,
    dirtyDraft,
    setDirtyDraft,
    uploadState,
    setUploadState,
    setSnapshot,
    receive,
    refreshState,
    writeAction,
    showToast,
    openDialog,
    toggleThemeWithMotion,
    logout,
    lastListRoute,
    setLastListRoute,
    previewModeByVersion,
    setPreviewModeByVersion,
    docFilters,
    setDocFilters,
    myUnitDocFilters,
    setMyUnitDocFilters,
    pengajuanFilter,
    setPengajuanFilter,
    pengajuanSort,
    setPengajuanSort,
    verifikasiTab,
    setVerifikasiTab,
    verifikasiSort,
    setVerifikasiSort,
    adminUserSearch,
    setAdminUserSearch,
    adminUserPage,
    setAdminUserPage,
    adminUserPageSize,
    setAdminUserPageSize,
    adminUnitSearch,
    setAdminUnitSearch,
    draftStep1,
    setDraftStep1,
  };

  return (
    <JdihContext.Provider value={value}>
      {children}
      <DialogHost
        dialogConfig={dialogConfig}
        onResolve={resolveDialog}
        toasts={toasts}
        onDismissToast={dismissToast}
      />
    </JdihContext.Provider>
  );
}

export function useJdih() {
  const ctx = useContext(JdihContext);
  if (!ctx) throw new Error('useJdih must be used inside JdihProvider');
  return ctx;
}
