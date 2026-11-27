'use client';

import { useState } from 'react';
import { useJdih } from '@/components/providers/JdihProvider';
import { getCurrentUser, getRolesSummary } from '@/lib/domain';

export function ProfileView() {
  const { state, saving, writeAction, showToast } = useJdih();
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  const user = getCurrentUser(state);
  if (!user) return null;

  function handleSavePassword(e) {
    e.preventDefault();
    if (newPass.length < 8 || !/[a-zA-Z]/.test(newPass) || !/\d/.test(newPass)) {
      showToast('Password baru minimal 8 karakter kombinasi huruf dan angka.', 'error');
      return;
    }
    writeAction('auth/password', 'POST', { current: oldPass, password: newPass }, 'Password akun diperbarui.', () => {
      setOldPass('');
      setNewPass('');
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profil &amp; Keamanan Akun</h1>
          <p className="page-subtitle">Informasi identitas pegawai dan pengaturan password sesi Anda.</p>
        </div>
      </div>

      <div className="workbench-grid">
        <section className="surface-panel">
          <h2 className="section-heading">Identitas Pengguna</h2>
          <dl className="meta-dl">
            <div><dt>Nama Lengkap</dt><dd>{user.nama}</dd></div>
            <div><dt>NIK</dt><dd className="tabular">{user.nik}</dd></div>
            <div><dt>Unit Utama</dt><dd>{user.unit_home}</dd></div>
            <div><dt>Gabungan Hak Akses</dt><dd>{getRolesSummary(state, user).join(', ')}</dd></div>
          </dl>
        </section>

        <section className="surface-panel">
          <h2 className="section-heading">Ganti Password Sendiri</h2>
          <form onSubmit={handleSavePassword}>
            <div className="field-grid">
              <div className="field col-12">
                <label htmlFor="prof-old">Password saat ini</label>
                <input
                  id="prof-old"
                  type="password"
                  className="input"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                />
              </div>
              <div className="field col-12">
                <label htmlFor="prof-new">Password baru (minimal 8 karakter, huruf &amp; angka)</label>
                <input
                  id="prof-new"
                  type="password"
                  className="input"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  Simpan Password Baru
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
