'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { Icon } from '@/components/ui/Icon';
import { getCurrentUser, isAnyKoordinator, isAnyManajer } from '@/lib/domain';
import { formatNotifTypeLabel, formatTimestamp, normalizeAppUrl } from '@/lib/format';

export function NotificationsView() {
  const router = useRouter();
  const { state, saving, refreshState, writeAction } = useJdih();

  const user = getCurrentUser(state);
  const allowed = isAnyKoordinator(state, user) || isAnyManajer(state, user);

  useEffect(() => {
    if (!allowed) {
      router.replace('/403');
      return;
    }
    refreshState();
  }, [allowed, router, refreshState]);

  const items = useMemo(() => {
    if (!allowed || !user) return [];
    return state.notifications
      .filter((n) => (user.is_super_admin || n.user_id === user.id) && n.is_relevant)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [allowed, state.notifications, user]);

  if (!allowed) return null;

  function openNotification(n) {
    writeAction('notifications/read', 'POST', { id: n.id }, '', () => {
      router.push(normalizeAppUrl(n.url));
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifikasi Aplikasi</h1>
          <p className="page-subtitle">Pemberitahuan pengajuan baru, persetujuan, dan pengembalian dokumen unit Anda.</p>
        </div>
      </div>

      <section className="surface-panel">
        {items.length === 0 ? (
          <div className="empty-state">
            <Icon name="bell" />
            <h3>Belum ada notifikasi</h3>
            <p>Notifikasi muncul otomatis saat terjadi pengajuan atau keputusan verifikasi.</p>
          </div>
        ) : (
          <ul className="timeline">
            {items.map((n) => (
              <li
                key={n.id}
                className={`timeline-item${n.is_read ? '' : ' selected'}`}
                tabIndex={0}
                role="button"
                onClick={() => openNotification(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openNotification(n);
                  }
                }}
              >
                <div className="timeline-top">
                  <strong>{formatNotifTypeLabel(n.jenis)}</strong>
                  <span className={`status-pill status-${n.is_read ? 'neutral' : 'info'}`}>
                    {n.is_read ? 'Dibaca' : 'Baru'}
                  </span>
                </div>
                <div>{n.pesan}</div>
                <div className="timeline-meta tabular" style={{ marginTop: '4px' }}>
                  {formatTimestamp(n.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="bottom-action-bar">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={saving}
          onClick={() => writeAction('notifications/read', 'POST', { all: true })}
        >
          Tandai Semua Dibaca
        </button>
      </div>
    </>
  );
}
