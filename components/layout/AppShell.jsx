'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { formatTimestamp, getUserInitials, normalizeAppUrl } from '@/lib/format';
import {
  getCurrentUser,
  getMyUnitPublishedCount,
  getPendingVerificationCountFor,
  getRolesSummary,
  getUnreadNotifications,
  isAnyKoordinator,
  isAnyManajer,
} from '@/lib/domain';

function resolveRouteTitle(pathname) {
  if (pathname === '/profil') return 'Profil Pengguna';
  if (pathname === '/dokumen') return 'Daftar Dokumen';
  if (pathname === '/dokumen-unit') return 'Dokumen Unit Saya';
  if (pathname.startsWith('/dokumen/')) return 'Detail Dokumen';
  if (pathname === '/pengajuan') return 'Pengajuan Unit';
  if (pathname === '/pengajuan/baru') return 'Buat Dokumen Baru';
  if (pathname.startsWith('/pengajuan/')) return 'Edit Draf Dokumen';
  if (pathname === '/verifikasi') return 'Antrean Verifikasi';
  if (pathname.startsWith('/verifikasi/')) return 'Detail Verifikasi';
  if (pathname === '/notifikasi') return 'Notifikasi';
  if (pathname === '/admin/unit') return 'Admin Unit';
  if (pathname === '/admin/pengguna') return 'Admin Pengguna';
  if (pathname === '/admin/koordinator') return 'Admin Koordinator/SPV';
  if (pathname === '/admin/manajer') return 'Admin Manajer';
  if (pathname === '/admin/jenis-dokumen') return 'Admin Jenis Dokumen';
  if (pathname === '/403') return 'Akses Ditolak';
  return 'Daftar Dokumen';
}

export function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    state,
    loaded,
    loggedIn,
    theme,
    toggleThemeWithMotion,
    logout,
    lastListRoute,
    receive,
    writeAction,
    showToast,
  } = useJdih();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const prevPillRef = useRef(null);
  const menuToggleRef = useRef(null);
  const sidebarCloseRef = useRef(null);
  const bellRef = useRef(null);
  const notifPopRef = useRef(null);

  const user = getCurrentUser(state);

  useEffect(() => {
    if (!loaded) return;
    if (!loggedIn || !user) {
      router.replace('/login');
      return;
    }
    if (user.must_change_password) {
      router.replace('/ganti-password');
    }
  }, [loaded, loggedIn, user, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (
        notifOpen &&
        notifPopRef.current &&
        !notifPopRef.current.contains(e.target) &&
        bellRef.current &&
        !bellRef.current.contains(e.target)
      ) {
        setNotifOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          menuToggleRef.current?.focus();
        }
        if (notifOpen) {
          setNotifOpen(false);
          bellRef.current?.focus();
        }
      }
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen, notifOpen]);

  const groups = useMemo(() => {
    if (!user) return [];
    const pendingCount = getPendingVerificationCountFor(state, user);
    const draftCount = isAnyKoordinator(state, user)
      ? state.versions.filter((v) => {
          if (!['DRAF', 'DIKEMBALIKAN', 'MENUNGGU_VERIFIKASI'].includes(v.status)) return false;
          const doc = state.documents.find((d) => d.id === v.document_id);
          return doc && (user.is_super_admin || state.userUnits.some(
            (uu) => uu.user_id === user.id && uu.unit_id === doc.unit_id && uu.peran === 'KOORDINATOR' && uu.is_active
          ));
        }).length
      : 0;
    const myUnitDocCount = getMyUnitPublishedCount(state, user);
    const isMainDocActive = pathname === '/dokumen' || (pathname.startsWith('/dokumen/') && lastListRoute !== '/dokumen-unit');
    const isMyUnitDocActive = pathname === '/dokumen-unit' || (pathname.startsWith('/dokumen/') && lastListRoute === '/dokumen-unit');

    const result = [
      {
        title: 'Regulasi Internal',
        items: [
          { href: '/dokumen', label: 'Daftar Dokumen', icon: 'doc', active: isMainDocActive },
          { href: '/dokumen-unit', label: 'Dokumen Unit Saya', icon: 'folder', count: myUnitDocCount, active: isMyUnitDocActive },
        ],
      },
    ];

    if (isAnyKoordinator(state, user)) {
      result[0].items.push({
        href: '/pengajuan',
        label: 'Pengajuan Unit',
        icon: 'edit',
        count: draftCount,
        active: pathname.startsWith('/pengajuan'),
      });
    }

    if (isAnyManajer(state, user)) {
      result[0].items.push({
        href: '/verifikasi',
        label: 'Verifikasi Manajer',
        icon: 'check',
        count: pendingCount,
        active: pathname.startsWith('/verifikasi'),
      });
    }

    if (isAnyKoordinator(state, user) || isAnyManajer(state, user)) {
      result[0].items.push({
        href: '/notifikasi',
        label: 'Notifikasi',
        icon: 'bell',
        count: getUnreadNotifications(state, user).length,
        active: pathname === '/notifikasi',
      });
    }

    if (user.is_super_admin) {
      result.push({
        title: 'Administrasi Sistem',
        items: [
          { href: '/admin/unit', label: 'Unit Kerja', icon: 'building', count: state.units.length, active: pathname === '/admin/unit' },
          { href: '/admin/pengguna', label: 'Pengguna', icon: 'users', active: pathname === '/admin/pengguna' },
          { href: '/admin/koordinator', label: 'Penugasan Koordinator', icon: 'shield', active: pathname === '/admin/koordinator' },
          { href: '/admin/manajer', label: 'Penugasan Manajer', icon: 'shield', active: pathname === '/admin/manajer' },
          { href: '/admin/jenis-dokumen', label: 'Jenis Dokumen', icon: 'tag', active: pathname === '/admin/jenis-dokumen' },
        ],
      });
    }

    result.push({
      title: 'Akun',
      items: [{ href: '/profil', label: 'Profil & Keamanan', icon: 'user', active: pathname === '/profil' }],
    });
    return result;
  }, [state, user, pathname, lastListRoute]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const activeEl = nav.querySelector('.nav-item.active');
    if (!activeEl) {
      prevPillRef.current = null;
      pill.hidden = true;
      nav.classList.remove('nav-has-pill');
      return;
    }
    pill.hidden = false;
    nav.classList.add('nav-has-pill');

    const navRect = nav.getBoundingClientRect();
    const actRect = activeEl.getBoundingClientRect();
    const nextTop = Math.round(actRect.top - navRect.top + nav.scrollTop);
    const pillBaseH = pill.offsetHeight || 36;
    const nextScale = Number((actRect.height / pillBaseH).toFixed(4)) || 1;
    const prev = prevPillRef.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prev && !reduced && (prev.top !== nextTop || prev.scale !== nextScale)) {
      pill.style.transition = 'none';
      pill.style.transform = `translateY(${prev.top}px) scaleY(${prev.scale})`;
      void pill.offsetHeight;
      pill.style.transition = '';
      requestAnimationFrame(() => {
        pill.style.transform = `translateY(${nextTop}px) scaleY(${nextScale})`;
      });
    } else {
      pill.style.transition = 'none';
      pill.style.transform = `translateY(${nextTop}px) scaleY(${nextScale})`;
    }
    prevPillRef.current = { top: nextTop, scale: nextScale };
  }, [groups, pathname]);

  if (!loaded || !loggedIn || !user || user.must_change_password) {
    return (
      <div className="app-shell auth-only">
        <div className="workspace-frame">
          <main id="main-content" className="main-content" tabIndex={-1}>
            <p className="empty-state" role="status">Memuat JDIH…</p>
          </main>
        </div>
      </div>
    );
  }

  const unreadNotifications = getUnreadNotifications(state, user);
  const recentNotifications = state.notifications
    .filter((n) => (user.is_super_admin || n.user_id === user.id) && n.is_relevant)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);
  const roles = getRolesSummary(state, user);
  const nonStafRoles = roles.filter((r) => r !== 'Staf');
  const displayRole = nonStafRoles.length ? nonStafRoles[0] : 'Staf';

  async function toggleBell(e) {
    e.stopPropagation();
    const nextOpen = !notifOpen;
    setNotifOpen(nextOpen);
    if (nextOpen) {
      try {
        const { items } = await api('notifications');
        receive({ notifications: items });
      } catch (error) {
        showToast(error.message, 'error');
      }
    }
  }

  return (
    <div id="app-shell" className="app-shell">
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>

      <div
        id="sidebar-backdrop"
        className="sidebar-backdrop"
        hidden={!mobileMenuOpen}
        onClick={() => {
          setMobileMenuOpen(false);
          menuToggleRef.current?.focus();
        }}
      />

      <aside id="sidebar" className={`sidebar${mobileMenuOpen ? ' open' : ''}`} aria-label="Navigasi utama">
        <div className="sidebar-brand">
          <Link href="/dokumen" className="brand-link" aria-label="JDIH RS AN-NISA Beranda">
            <span className="brand-mark">
              <img src="/assets/logo-jdih-opt4-layers.svg" alt="" width="46" height="46" className="brand-logo" decoding="async" />
            </span>
            <span className="brand-copy">
              <strong className="brand-title">JDIH RS AN-NISA</strong>
              <span className="brand-sub">Repositori Regulasi Internal</span>
            </span>
          </Link>
          <button
            ref={sidebarCloseRef}
            id="sidebar-close-btn"
            className="icon-btn sidebar-close-btn"
            type="button"
            aria-label="Tutup menu navigasi"
            onClick={() => {
              setMobileMenuOpen(false);
              menuToggleRef.current?.focus();
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav ref={navRef} id="sidebar-nav" className="sidebar-nav" aria-label="Menu aplikasi">
          <div ref={pillRef} className="nav-active-pill" aria-hidden="true" hidden />
          {groups.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${item.active ? ' active' : ''}`}
                  aria-current={item.active ? 'page' : undefined}
                >
                  <span className="nav-item-left">
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </span>
                  {item.count > 0 ? <span className="nav-count">{item.count}</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="workspace-frame">
        <header id="topbar" className="topbar">
          <div className="topbar-left">
            <button
              ref={menuToggleRef}
              id="menu-toggle-btn"
              className="icon-btn menu-toggle-btn"
              type="button"
              aria-label="Buka menu navigasi"
              aria-expanded={mobileMenuOpen}
              aria-controls="sidebar"
              onClick={() => {
                setMobileMenuOpen(true);
                setTimeout(() => sidebarCloseRef.current?.focus(), 20);
              }}
            >
              <Icon name="menu" size={20} />
            </button>
            <div id="topbar-context" className="topbar-context">
              <span>RS AN-NISA</span>
              <span>/</span>
              <strong>{resolveRouteTitle(pathname)}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <button
              id="theme-toggle-btn"
              className="icon-btn topbar-action-btn"
              type="button"
              aria-label="Ubah tema tampilan"
              aria-pressed={theme === 'dark'}
              title="Ubah tema terang atau gelap"
              onClick={toggleThemeWithMotion}
            >
              <span className="theme-icon-stage" aria-hidden="true">
                <svg className="theme-svg theme-svg-sun" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="3.5" />
                  <path d="M10 2.2v1.6M10 16.2v1.6M2.2 10h1.6M16.2 10h1.6M4.5 4.5l1.1 1.1M14.4 14.4l1.1 1.1M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1" />
                </svg>
                <svg className="theme-svg theme-svg-moon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16.8 11.9A6.8 6.8 0 018.1 3.2a7 7 0 108.7 8.7z" />
                </svg>
              </span>
            </button>

            <div className="notif-wrapper">
              <button
                ref={bellRef}
                id="notif-bell-btn"
                className="icon-btn topbar-action-btn"
                type="button"
                aria-label="Notifikasi"
                aria-expanded={notifOpen}
                aria-controls="notif-popover"
                onClick={toggleBell}
              >
                <Icon name="bell" />
                <span id="notif-badge" className="notif-badge" hidden={unreadNotifications.length === 0}>
                  {unreadNotifications.length}
                </span>
              </button>

              <div
                ref={notifPopRef}
                id="notif-popover"
                className="notif-popover"
                role="region"
                aria-label="Daftar notifikasi terbaru"
                hidden={!notifOpen}
              >
                <div className="notif-popover-header">
                  <span>Notifikasi Terbaru</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => writeAction('notifications/read', 'POST', { all: true })}
                  >
                    Tandai dibaca
                  </button>
                </div>
                <div className="notif-popover-list">
                  {recentNotifications.length ? (
                    recentNotifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`notif-item${n.is_read ? '' : ' unread'}`}
                        onClick={() => {
                          writeAction('notifications/read', 'POST', { id: n.id }, '', () => {
                            setNotifOpen(false);
                            router.push(normalizeAppUrl(n.url));
                          });
                        }}
                      >
                        <div>{n.pesan}</div>
                        <span className="notif-item-time">{formatTimestamp(n.created_at)}</span>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '18px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                      Belum ada notifikasi baru.
                    </div>
                  )}
                </div>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
                  <Link
                    href="/notifikasi"
                    style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-text)', textDecoration: 'none' }}
                    onClick={() => setNotifOpen(false)}
                  >
                    Lihat semua notifikasi
                  </Link>
                </div>
              </div>
            </div>

            <Link href="/profil" id="user-profile-link" className="user-chip" aria-label="Profil pengguna">
              <span id="user-avatar" className="user-avatar" aria-hidden="true">{getUserInitials(user.nama)}</span>
              <span className="user-meta">
                <span id="user-name-label" className="user-name">{user.nama}</span>
                <span id="user-role-label" className="user-role">{displayRole}</span>
              </span>
            </Link>

            <button
              id="logout-btn"
              className="btn btn-ghost"
              type="button"
              aria-label="Keluar dari sesi"
              onClick={logout}
            >
              <Icon name="logout" size={16} />
              <span className="logout-text">Keluar</span>
            </button>
          </div>
        </header>

        <main key={pathname} id="main-content" className="main-content page-enter" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
