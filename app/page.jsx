'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { getCurrentUser } from '@/lib/domain';

export default function HomePage() {
  const router = useRouter();
  const { state, loaded, loggedIn } = useJdih();
  const user = getCurrentUser(state);

  useEffect(() => {
    if (!loaded) return;
    if (!loggedIn || !user) {
      router.replace('/login');
    } else if (user.must_change_password) {
      router.replace('/ganti-password');
    } else {
      router.replace('/dokumen');
    }
  }, [loaded, loggedIn, user, router]);

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
