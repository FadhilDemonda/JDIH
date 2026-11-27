'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Icon } from '@/components/ui/Icon';
import { RowMenu } from '@/components/ui/RowMenu';
import { getCurrentUser, getRolesSummary } from '@/lib/domain';
import {
  downloadUserImportTemplate,
  formatNikInput,
  isValidNik,
  parseUserImportText,
} from '@/lib/format';

function AddUserModal({ open, initialTab, onClose, units, users, saving, writeAction, showToast, onTempPassword }) {
  const dialogRef = useRef(null);
  const tabRefs = useRef([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [nik, setNik] = useState('');
  const [nama, setNama] = useState('');
  const [password, setPassword] = useState('');
  const [peran, setPeran] = useState('STAF');
  const [unitHome, setUnitHome] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [defaultPw, setDefaultPw] = useState('annisa123');
  const [impText, setImpText] = useState('');
  const [formErr, setFormErr] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setActiveTab(initialTab);
      setNik('');
      setNama('');
      setPassword('');
      setPeran('STAF');
      setUnitHome('');
      setUnitFilter('');
      setSelectedUnits([]);
      setDefaultPw('annisa123');
      setImpText('');
      setFormErr('');
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open, initialTab]);

  const parsedImport = useMemo(
    () => parseUserImportText(impText, defaultPw, users),
    [impText, defaultPw, users]
  );
  const validImportRows = parsedImport.filter((r) => r.valid);
  const skippedImportCount = parsedImport.length - validImportRows.length;

  const isUnitRole = peran === 'KOORDINATOR' || peran === 'MANAJER';
  const filteredUnits = useMemo(() => {
    const q = unitFilter.trim().toLowerCase();
    return q ? units.filter((u) => `${u.kode} ${u.nama}`.toLowerCase().includes(q)) : units;
  }, [units, unitFilter]);

  function toggleUnit(unitId) {
    setSelectedUnits((prev) => (prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]));
    setFormErr('');
  }

  async function handleSubmit() {
    if (activeTab === 'IMPORT') {
      const pw = defaultPw.trim() || 'annisa123';
      if (pw.length < 8 || pw.length > 72 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
        setFormErr('Template password minimal 8 karakter kombinasi huruf dan angka.');
        return;
      }
      if (!parsedImport.length) {
        setFormErr('Tempel data CSV/Excel atau pilih berkas CSV terlebih dahulu.');
        return;
      }
      if (!validImportRows.length) {
        setFormErr(`Tidak ada baris valid untuk diimpor (${parsedImport[0]?.reason || 'periksa format data'}).`);
        return;
      }
      if (validImportRows.length > 500) {
        setFormErr('Maksimal 500 pengguna dalam sekali impor.');
        return;
      }
      setFormErr('');
      await writeAction(
        'admin/users/import',
        'POST',
        {
          default_password: pw,
          users: validImportRows.map(({ nik: n, nama: nm, password: p }) => ({ nik: n, nama: nm, password: p })),
        },
        '',
        (out) => {
          const totalSkipped = (out.skipped?.length || 0) + skippedImportCount;
          const msg = totalSkipped
            ? `${out.imported} pengguna berhasil diimpor, ${totalSkipped} baris dilewati.`
            : `${out.imported} pengguna berhasil diimpor.`;
          showToast(msg, 'success');
          onClose();
        }
      );
      return;
    }

    const cleanNik = formatNikInput(nik);
    const cleanNama = nama.trim();
    if (!isValidNik(cleanNik) || !cleanNama) {
      setFormErr('Format NIK harus 0000.00.00 dan nama wajib diisi.');
      return;
    }
    if (users.some((u) => u.nik === cleanNik)) {
      setFormErr('NIK sudah terdaftar.');
      return;
    }
    if (password && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setFormErr('Password minimal 8 karakter kombinasi huruf dan angka.');
      return;
    }
    if (isUnitRole && selectedUnits.length === 0) {
      setFormErr(`Pilih minimal satu unit kerja untuk peran ${peran === 'KOORDINATOR' ? 'Koordinator/SPV' : 'Manajer'}.`);
      return;
    }
    setFormErr('');
    await writeAction(
      'admin/users',
      'POST',
      {
        nik: cleanNik,
        nama: cleanNama,
        password,
        peran,
        is_super_admin: peran === 'SUPER_ADMIN',
        unit_ids: selectedUnits,
        unit_home: unitHome,
      },
      'Pengguna tersimpan.',
      (res) => {
        onClose();
        onTempPassword(res);
      }
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog dialog-wide"
      aria-labelledby="add-user-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <form method="dialog" className="modal-card" noValidate>
          <div className="modal-header">
            <h2 id="add-user-dialog-title" className="modal-title">Tambah Pengguna Baru</h2>
            <button type="button" className="icon-btn" aria-label="Tutup dialog" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          <div className="modal-body">
            <div className="tablist" role="tablist" aria-label="Mode tambah pengguna" style={{ marginBottom: '14px' }}>
              {[
                { key: 'SINGLE', id: 'nu-tab-single', panel: 'nu-panel-single', label: 'Tambah Satu' },
                { key: 'IMPORT', id: 'nu-tab-import', panel: 'nu-panel-import', label: 'Impor Massal (CSV / Excel)' },
              ].map((tab, idx) => (
                <button
                  key={tab.key}
                  ref={(el) => { tabRefs.current[idx] = el; }}
                  type="button"
                  role="tab"
                  id={tab.id}
                  aria-controls={tab.panel}
                  aria-selected={activeTab === tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setFormErr('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      const nextIdx = (idx + 1) % 2;
                      const nextKey = nextIdx === 0 ? 'SINGLE' : 'IMPORT';
                      setActiveTab(nextKey);
                      setFormErr('');
                      tabRefs.current[nextIdx]?.focus();
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div id="nu-panel-single" role="tabpanel" aria-labelledby="nu-tab-single" hidden={activeTab !== 'SINGLE'}>
              <div className="field-grid">
                <div className="field col-5">
                  <label htmlFor="nu-nik">NIK (0000.00.00) <span className="req-mark">*</span></label>
                  <input
                    id="nu-nik"
                    className="input tabular"
                    placeholder="1995.03.11"
                    value={nik}
                    onChange={(e) => {
                      setNik(formatNikInput(e.target.value));
                      setFormErr('');
                    }}
                  />
                </div>
                <div className="field col-7">
                  <label htmlFor="nu-nama">Nama Lengkap &amp; Gelar <span className="req-mark">*</span></label>
                  <input
                    id="nu-nama"
                    className="input"
                    placeholder="Ns. Sari Indah, S.Kep"
                    value={nama}
                    onChange={(e) => {
                      setNama(e.target.value);
                      setFormErr('');
                    }}
                  />
                </div>
                <div className="field col-12">
                  <label htmlFor="nu-password">Password awal (kosongkan untuk pakai annisa123)</label>
                  <input
                    id="nu-password"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    placeholder="annisa123"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="field col-12">
                  <label id="lbl-nu-role" htmlFor="nu-role">Peran Pengguna <span className="req-mark">*</span></label>
                  <CustomSelect
                    id="nu-role"
                    ariaLabelledBy="lbl-nu-role"
                    value={peran}
                    options={[
                      { value: 'STAF', label: 'Staf (baca seluruh dokumen terbit)' },
                      { value: 'KOORDINATOR', label: 'Koordinator / SPV (susun & ajukan dokumen unit)' },
                      { value: 'MANAJER', label: 'Manajer (verifikasi & terbitkan dokumen unit)' },
                      { value: 'SUPER_ADMIN', label: 'Super Admin (akses penuh sistem)' },
                    ]}
                    onChange={(val) => {
                      setPeran(val);
                      setFormErr('');
                    }}
                  />
                </div>

                {!isUnitRole ? (
                  <div className="field col-12">
                    <label id="lbl-nu-home-unit" htmlFor="nu-home-unit">Unit Utama (opsional)</label>
                    <CustomSelect
                      id="nu-home-unit"
                      ariaLabelledBy="lbl-nu-home-unit"
                      value={unitHome}
                      options={[
                        { value: '', label: 'Staf RS (Umum)' },
                        ...units.map((u) => ({ value: u.nama, label: `${u.kode} - ${u.nama}` })),
                      ]}
                      onChange={setUnitHome}
                    />
                  </div>
                ) : (
                  <div className="field col-12">
                    <label htmlFor="nu-unit-filter">Penugasan Unit Kerja <span className="req-mark">*</span></label>
                    <input
                      id="nu-unit-filter"
                      type="search"
                      className="input"
                      placeholder="Cari nama atau kode unit..."
                      value={unitFilter}
                      onChange={(e) => setUnitFilter(e.target.value)}
                    />
                    <div className="unit-checklist" role="group" aria-label="Pilih unit kerja">
                      {filteredUnits.map((u) => (
                        <label key={u.id} className="unit-check-item">
                          <input
                            type="checkbox"
                            checked={selectedUnits.includes(u.id)}
                            onChange={() => toggleUnit(u.id)}
                          />
                          <span><strong>{u.kode}</strong> - {u.nama}</span>
                        </label>
                      ))}
                    </div>
                    <p className="field-help">Pilih satu atau lebih unit yang dikelola oleh pengguna ini.</p>
                  </div>
                )}
              </div>
            </div>

            <div id="nu-panel-import" role="tabpanel" aria-labelledby="nu-tab-import" hidden={activeTab !== 'IMPORT'}>
              <div className="field-grid">
                <div className="field col-12">
                  <label htmlFor="imp-default-pw">Template Password Awal (jika kolom password kosong)</label>
                  <input
                    id="imp-default-pw"
                    className="input tabular"
                    value={defaultPw}
                    placeholder="annisa123"
                    onChange={(e) => {
                      setDefaultPw(e.target.value);
                      setFormErr('');
                    }}
                  />
                  <p className="field-help">
                    Dipakai otomatis untuk baris yang tidak mengisi kolom password. Pengguna wajib mengganti password saat login pertama.
                  </p>
                </div>

                <div className="field col-12">
                  <label htmlFor="imp-text">
                    Data Impor (CSV / salin-tempel dari Excel atau Google Sheets) <span className="req-mark">*</span>
                  </label>
                  <div className="import-toolbar" style={{ marginBottom: '8px' }}>
                    <label className="btn btn-secondary btn-compact">
                      <Icon name="upload" />
                      <span>Pilih Berkas CSV/TXT</span>
                      <input
                        type="file"
                        accept=".csv,.txt,text/csv,text/plain"
                        className="file-picker"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setImpText(await file.text());
                            setFormErr('');
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={downloadUserImportTemplate}
                    >
                      <Icon name="download" />
                      <span>Unduh Template CSV</span>
                    </button>
                  </div>
                  <textarea
                    id="imp-text"
                    className="textarea tabular"
                    rows={6}
                    placeholder={'nik,nama,password\n1995.03.11,"Ns. Sari Indah, S.Kep",annisa123\n1996.04.12,"Apt. Doni Pratama, S.Farm",'}
                    value={impText}
                    onChange={(e) => {
                      setImpText(e.target.value);
                      setFormErr('');
                    }}
                  />
                  <p className="field-help">
                    Kolom: <strong>NIK</strong>, <strong>Nama Pengguna</strong>, dan <strong>Password</strong> (opsional, otomatis <code>annisa123</code>). Mendukung pemisah koma, titik koma, atau tab Excel.
                  </p>
                </div>

                {parsedImport.length > 0 ? (
                  <div className="col-12">
                    <p className="field-help tabular" style={{ marginTop: '4px' }}>
                      <strong>{validImportRows.length}</strong> siap diimpor · <strong>{skippedImportCount}</strong> dilewati
                    </p>
                    <div className="import-preview-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>NIK</th>
                            <th>Nama Pengguna</th>
                            <th>Password</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedImport.slice(0, 50).map((r) => (
                            <tr key={r.row}>
                              <td className="tabular">{r.nik || '-'}</td>
                              <td>{r.nama || '-'}</td>
                              <td className="tabular">{r.password || '-'}</td>
                              <td>
                                <span className={`status-pill status-${r.valid ? 'success' : 'danger'}`}>
                                  {r.reason}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {parsedImport.length > 50 ? (
                      <p className="field-help">Menampilkan 50 baris pertama dari {parsedImport.length} baris.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <p id="nu-form-error" className="field-error" role="alert" style={{ marginTop: '10px' }} hidden={!formErr}>
              {formErr}
            </p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSubmit}>
              {activeTab === 'IMPORT'
                ? (validImportRows.length > 0 ? `Impor ${validImportRows.length} Pengguna` : 'Impor Pengguna')
                : 'Simpan Pengguna'}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}

export function AdminUsersView() {
  const router = useRouter();
  const {
    state,
    saving,
    writeAction,
    showToast,
    openDialog,
    adminUserSearch,
    setAdminUserSearch,
    adminUserPage,
    setAdminUserPage,
    adminUserPageSize,
    setAdminUserPageSize,
  } = useJdih();

  const [modalState, setModalState] = useState({ open: false, tab: 'SINGLE' });
  const user = getCurrentUser(state);
  const allowed = Boolean(user?.is_super_admin);

  useEffect(() => {
    if (!allowed) router.replace('/403');
  }, [allowed, router]);

  const filtered = useMemo(() => {
    const q = adminUserSearch.trim().toLowerCase();
    return state.users.filter((u) => !q || `${u.nama} ${u.nik}`.toLowerCase().includes(q));
  }, [state.users, adminUserSearch]);

  if (!allowed) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / adminUserPageSize));
  const safePage = Math.min(adminUserPage, totalPages);
  const rows = filtered.slice((safePage - 1) * adminUserPageSize, safePage * adminUserPageSize);
  const activeUnits = state.units.filter((u) => u.is_active);

  async function showTemporaryPassword({ temporaryPassword }) {
    if (!temporaryPassword) return;
    await openDialog({
      title: 'Password Awal Pengguna',
      body: (
        <>
          <p>Salin password ini untuk pengguna. Pengguna wajib menggantinya saat pertama masuk.</p>
          <input className="input tabular" aria-label="Password awal" defaultValue={temporaryPassword} readOnly />
        </>
      ),
      confirmLabel: 'Tutup',
    });
  }

  function buildUserMenu(u) {
    return [
      {
        label: 'Edit Pengguna',
        onClick: async () => {
          const res = await openDialog({
            title: 'Edit Pengguna',
            body: (
              <div className="field-grid">
                <div className="field col-5">
                  <label htmlFor="edit-user-nik">NIK</label>
                  <input id="edit-user-nik" className="input tabular" defaultValue={u.nik} />
                </div>
                <div className="field col-7">
                  <label htmlFor="edit-user-name">Nama</label>
                  <input id="edit-user-name" className="input" defaultValue={u.nama} />
                </div>
                <div className="field col-12">
                  <label htmlFor="edit-user-unit">Unit Utama</label>
                  <input id="edit-user-unit" className="input" defaultValue={u.unit_home} />
                </div>
              </div>
            ),
            confirmLabel: 'Simpan Pengguna',
            onValidate: (dialog) => ({
              nik: formatNikInput(dialog.querySelector('#edit-user-nik').value),
              nama: dialog.querySelector('#edit-user-name').value,
              unit_home: dialog.querySelector('#edit-user-unit').value,
            }),
          });
          if (!res) return;
          await writeAction(`admin/users/${u.id}`, 'PATCH', { nik: res.nik, nama: res.nama, unit_home: res.unit_home }, 'Pengguna diperbarui.');
        },
      },
      {
        label: u.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun',
        danger: u.is_active,
        onClick: () => {
          if (u.id === state.currentUserId) {
            showToast('Tidak dapat menonaktifkan akun Super Admin yang sedang aktif.', 'error');
            return;
          }
          writeAction(`admin/users/${u.id}`, 'PATCH', { is_active: !u.is_active }, 'Status akun diperbarui.');
        },
      },
    ];
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen Pengguna</h1>
          <p className="page-subtitle">Daftar akun pegawai berbasis NIK format 0000.00.00.</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setModalState({ open: true, tab: 'IMPORT' })}
          >
            <Icon name="upload" />
            <span>Impor Pengguna</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalState({ open: true, tab: 'SINGLE' })}
          >
            <Icon name="plus" />
            <span>Tambah Pengguna</span>
          </button>
        </div>
      </div>

      <section className="surface-panel">
        <div className="filter-subrow">
          <div className="field admin-search-field">
            <label htmlFor="user-search">Cari nama atau NIK</label>
            <input
              id="user-search"
              className="input"
              type="search"
              value={adminUserSearch}
              placeholder="Contoh: 1221.21.23 atau Budi"
              onChange={(e) => {
                setAdminUserSearch(e.target.value);
                setAdminUserPage(1);
              }}
            />
          </div>
          <span className="tabular meta-label-sm">Total {filtered.length} pengguna</span>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <Icon name="users" />
            <h3>Pengguna tidak ditemukan</h3>
            <p>Ubah kata kunci pencarian nama atau NIK.</p>
          </div>
        ) : (
          <>
            <div className="responsive-table-region">
              <div className="table-wrap responsive-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>NIK</th>
                      <th>Nama Lengkap</th>
                      <th>Peran Aktif</th>
                      <th>Status</th>
                      <th className="col-actions">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => (
                      <tr key={u.id}>
                        <td className="tabular"><strong>{u.nik}</strong></td>
                        <td>{u.nama}</td>
                        <td>{getRolesSummary(state, u).join(' · ')}</td>
                        <td>
                          <span className={`status-pill status-${u.is_active ? 'success' : 'danger'}`}>
                            {u.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="col-actions">
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-compact"
                              onClick={() => writeAction(`admin/users/${u.id}/reset`, 'POST', {}, 'Password direset.', showTemporaryPassword)}
                            >
                              Reset Password
                            </button>
                            <RowMenu triggerLabel={`Aksi lainnya untuk ${u.nama}`} items={buildUserMenu(u)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="responsive-cards" role="list">
                {rows.map((u) => (
                  <li key={u.id} className="responsive-card">
                    <div className="responsive-card-head">
                      <h3>{u.nama}</h3>
                      <span className={`status-pill status-${u.is_active ? 'success' : 'danger'}`}>
                        {u.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <dl>
                      <div><dt>NIK</dt><dd className="tabular"><strong>{u.nik}</strong></dd></div>
                      <div><dt>Peran</dt><dd>{getRolesSummary(state, u).join(' · ')}</dd></div>
                    </dl>
                    <div className="responsive-card-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => writeAction(`admin/users/${u.id}/reset`, 'POST', {}, 'Password direset.', showTemporaryPassword)}
                      >
                        Reset Password
                      </button>
                      <RowMenu triggerLabel={`Aksi lainnya untuk ${u.nama}`} items={buildUserMenu(u)} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pagination-bar">
              <div className="pagination-controls">
                <label id="lbl-user-pagesize" htmlFor="user-pagesize">Baris per halaman</label>
                <CustomSelect
                  id="user-pagesize"
                  ariaLabelledBy="lbl-user-pagesize"
                  compact
                  value={String(adminUserPageSize)}
                  options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(val) => {
                    setAdminUserPageSize(Number(val) || 10);
                    setAdminUserPage(1);
                  }}
                />
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={safePage <= 1}
                  onClick={() => setAdminUserPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </button>
                <span className="tabular">Halaman {safePage} dari {totalPages}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={safePage >= totalPages}
                  onClick={() => setAdminUserPage((p) => Math.min(totalPages, p + 1))}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <AddUserModal
        open={modalState.open}
        initialTab={modalState.tab}
        onClose={() => setModalState((prev) => ({ ...prev, open: false }))}
        units={activeUnits}
        users={state.users}
        saving={saving}
        writeAction={writeAction}
        showToast={showToast}
        onTempPassword={showTemporaryPassword}
      />
    </>
  );
}
