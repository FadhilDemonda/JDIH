'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { getCurrentUser } from '@/lib/domain';

export function ForcePasswordView() {
  const router = useRouter();
  const { state, loaded, loggedIn, saving, writeAction } = useJdih();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');

  const user = getCurrentUser(state);

  useEffect(() => {
    if (!loaded) return;
    if (!loggedIn || !user) {
      router.replace('/login');
      return;
    }
    if (!user.must_change_password) {
      router.replace('/dokumen');
    }
  }, [loaded, loggedIn, user, router]);

  if (!loaded || !loggedIn || !user) {
    return <p className="empty-state" role="status">Memuat JDIH…</p>;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (p1.length < 8 || !/[a-zA-Z]/.test(p1) || !/\d/.test(p1)) {
      setErr('Password minimal 8 karakter kombinasi huruf dan angka.');
      return;
    }
    if (p1 !== p2) {
      setErr('Konfirmasi password tidak cocok.');
      return;
    }
    setErr('');
    writeAction('auth/password', 'POST', { password: p1 }, 'Password diperbarui.', () => router.replace('/dokumen'));
  }

  return (
    <section className="auth-card" aria-label="Ganti Password Wajib">
      <div className="auth-header">
        <div className="auth-crest">
          <img src="/assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="42" height="56" className="auth-logo" decoding="async" />
        </div>
        <div>
          <h1 className="page-title">Ganti Password Awal</h1>
          <p className="page-subtitle">Demi keamanan akun {user.nik}, tetapkan password baru minimal 8 karakter.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field-grid">
          <div className="field col-12">
            <label htmlFor="gp-pass1">Password baru (huruf dan angka)</label>
            <input
              id="gp-pass1"
              type="password"
              className="input"
              placeholder="Minimal 8 karakter"
              value={p1}
              onChange={(e) => setP1(e.target.value)}
            />
          </div>
          <div className="field col-12">
            <label htmlFor="gp-pass2">Ulangi password baru</label>
            <input
              id="gp-pass2"
              type="password"
              className="input"
              placeholder="Ketik ulang password"
              value={p2}
              onChange={(e) => setP2(e.target.value)}
            />
          </div>
          <div className="col-12">
            <p id="gp-err" className="field-error" role="alert" hidden={!err}>
              {err}
            </p>
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
              Simpan Password &amp; Masuk
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
