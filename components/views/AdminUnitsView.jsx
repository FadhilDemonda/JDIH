'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { Icon } from '@/components/ui/Icon';
import { RowMenu } from '@/components/ui/RowMenu';
import { getCurrentUser, getUser } from '@/lib/domain';

export function AdminUnitsView() {
  const router = useRouter();
  const { state, saving, writeAction, showToast, openDialog, adminUnitSearch, setAdminUnitSearch } = useJdih();
  const [importResult, setImportResult] = useState(null);
  const [importProgress, setImportProgress] = useState(null);

  const user = getCurrentUser(state);
  const allowed = Boolean(user?.is_super_admin);

  useEffect(() => {
    if (!allowed) router.replace('/403');
  }, [allowed, router]);

  const list = useMemo(() => {
    const q = adminUnitSearch.trim().toLowerCase();
    return state.units.filter((u) => !q || `${u.kode} ${u.nama}`.toLowerCase().includes(q));
  }, [state.units, adminUnitSearch]);

  if (!allowed) return null;

  async function handleImportUnits() {
    const selection = await openDialog({
      title: 'Impor Unit dari CSV',
      body: (
        <div className="field">
          <label htmlFor="unit-import-file">Berkas CSV</label>
          <input
            id="unit-import-file"
            className="input"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="unit-import-help"
            required
          />
          <p id="unit-import-help" className="field-help">
            Gunakan kolom KODE dan UNIT. Jika kode atau nama unit sudah ada, baris itu dilewati.
          </p>
        </div>
      ),
      confirmLabel: 'Impor Unit',
      onValidate: (dialog) => {
        const input = dialog.querySelector('#unit-import-file');
        return input.reportValidity() ? { file: input.files[0] } : null;
      },
    });
    if (!selection) return;

    let csv;
    try {
      csv = await selection.file.text();
    } catch {
      showToast('Berkas CSV gagal dibaca. Pilih berkas dan coba lagi.', 'error');
      return;
    }
    setImportResult(null);
    setImportProgress({ processed: 0, total: null });
    const result = { imported: 0, skipped: [], error: '' };
    let cursor = 0;
    try {
      do {
        const batch = await writeAction('admin/units/import', 'POST', { cursor, csv }, '', undefined, {
          timeoutMs: 60_000,
          onError: (error) => {
            result.error = error.name === 'TimeoutError'
              ? 'Server terlalu lama merespons. Coba impor ulang berkas yang sama.'
              : error.message;
          },
        });
        if (!batch) {
          result.error ||= 'Penyimpanan sedang sibuk. Coba impor ulang.';
          break;
        }
        if (result.imported === 0 && batch.imported > 0) setAdminUnitSearch('');
        result.imported += batch.imported;
        result.skipped = result.skipped.concat(batch.skipped);
        cursor = batch.nextCursor;
        setImportProgress({ processed: cursor ?? batch.total, total: batch.total });
      } while (Number.isInteger(cursor));
      setImportResult(result);
    } finally {
      setImportProgress(null);
    }
  }

  async function handleAddUnit() {
    const res = await openDialog({
      title: 'Tambah Unit Kerja Baru',
      body: (
        <div className="field-grid">
          <div className="field col-4">
            <label htmlFor="new-u-kode">Kode Unit</label>
            <input id="new-u-kode" className="input" placeholder="PPI" />
          </div>
          <div className="field col-8">
            <label htmlFor="new-u-nama">Nama Unit</label>
            <input id="new-u-nama" className="input" placeholder="Komite PPI" />
          </div>
        </div>
      ),
      confirmLabel: 'Simpan & Buat Folder Drive',
      onValidate: (dialog) => {
        const kode = (dialog.querySelector('#new-u-kode')?.value || '').trim().toUpperCase();
        const nama = (dialog.querySelector('#new-u-nama')?.value || '').trim();
        if (!kode || !nama) {
          showToast('Kode dan nama unit wajib diisi.', 'error');
          return null;
        }
        if (state.units.some((u) => u.kode.toUpperCase() === kode || u.nama.toLowerCase() === nama.toLowerCase())) {
          showToast('Kode/Nama unit sudah terdaftar', 'error');
          return null;
        }
        return { kode, nama };
      },
    });
    if (!res) return;
    await writeAction('admin/units', 'POST', { kode: res.kode, nama: res.nama }, 'Unit ditambahkan.');
  }

  function buildUnitMenu(unit) {
    return [
      {
        label: 'Edit Unit',
        onClick: async () => {
          const res = await openDialog({
            title: 'Edit Unit',
            body: (
              <div className="field-grid">
                <div className="field col-4">
                  <label htmlFor="edit-unit-code">Kode Unit</label>
                  <input id="edit-unit-code" className="input" defaultValue={unit.kode} />
                </div>
                <div className="field col-8">
                  <label htmlFor="edit-unit-name">Nama Unit</label>
                  <input id="edit-unit-name" className="input" defaultValue={unit.nama} />
                </div>
              </div>
            ),
            confirmLabel: 'Simpan Unit',
            onValidate: (dialog) => ({
              kode: dialog.querySelector('#edit-unit-code').value,
              nama: dialog.querySelector('#edit-unit-name').value,
            }),
          });
          if (!res) return;
          await writeAction(`admin/units/${unit.id}`, 'PATCH', { kode: res.kode, nama: res.nama }, 'Unit diperbarui.');
        },
      },
      {
        label: 'Hapus Unit',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const hasDocs = state.documents.some((d) => d.unit_id === unit.id);
          if (hasDocs) {
            showToast('Unit masih memiliki dokumen; hanya dapat dinonaktifkan.', 'error');
            return;
          }
          await writeAction(`admin/units/${unit.id}`, 'DELETE', undefined, 'Unit dihapus.');
        },
      },
    ];
  }

  const rowData = list.map((u, idx) => {
    const docCount = state.documents.filter((d) => d.unit_id === u.id).length;
    const koCount = state.userUnits.filter((uu) => uu.unit_id === u.id && uu.peran === 'KOORDINATOR' && uu.is_active).length;
    const mgrNames = state.userUnits
      .filter((uu) => uu.unit_id === u.id && uu.peran === 'MANAJER' && uu.is_active)
      .map((uu) => getUser(state, uu.user_id)?.nama)
      .filter(Boolean);
    return { u, idx, docCount, koCount, mgrNames };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen Unit Kerja</h1>
          <p className="page-subtitle">
            Mengelola {state.units.length} unit RS AN-NISA dan keterkaitan folder Shared Drive otomatis.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" disabled={saving || Boolean(importProgress)} onClick={handleImportUnits}>
            <Icon name="upload" />
            <span>{importProgress ? 'Mengimpor Unit…' : 'Impor Unit'}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={handleAddUnit}>
            <Icon name="plus" />
            <span>Tambah Unit</span>
          </button>
        </div>
      </div>

      {importProgress && (
        <div className="notice-banner" role="status">
          {importProgress.total
            ? `${importProgress.processed} dari ${importProgress.total} baris diproses.`
            : 'Membaca CSV dan menyimpan kelompok unit pertama…'}
        </div>
      )}

      {importResult && (
        <section className={`notice-banner${importResult.error || importResult.imported === 0 ? ' warning' : ''}`} aria-labelledby="unit-import-result">
          <div>
            <strong id="unit-import-result" role="status">
              {importResult.imported} unit diimpor, {importResult.skipped.length} baris dilewati.
            </strong>
            {importResult.error && <p role="alert">{importResult.error}</p>}
            {importResult.skipped.length > 0 && (
              <details>
                <summary>Lihat baris yang dilewati</summary>
                <div className="import-preview-wrap">
                  <table className="data-table">
                    <thead><tr><th scope="col">Baris CSV</th><th scope="col">Alasan</th></tr></thead>
                    <tbody>
                      {importResult.skipped.map(({ row, reason }) => (
                        <tr key={row}><td className="tabular">{row}</td><td>{reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      <section className="surface-panel">
        <div className="filter-subrow">
          <div className="field admin-search-field">
            <label htmlFor="unit-search">Cari kode atau nama unit</label>
            <input
              id="unit-search"
              className="input"
              type="search"
              value={adminUnitSearch}
              placeholder="Contoh: DTO, IGD, Farmasi"
              onChange={(e) => setAdminUnitSearch(e.target.value)}
            />
          </div>
          <span className="tabular meta-label-sm">
            Menampilkan {list.length} dari {state.units.length} unit
          </span>
        </div>

        {rowData.length === 0 ? (
          <div className="empty-state">
            <Icon name="building" />
            <h3>Unit tidak ditemukan</h3>
            <p>Ubah kata kunci pencarian kode atau nama unit.</p>
          </div>
        ) : (
          <div className="responsive-table-region">
            <div className="table-wrap responsive-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Kode</th>
                    <th>Nama Unit</th>
                    <th>Folder Shared Drive</th>
                    <th>Dokumen</th>
                    <th>Koord./SPV</th>
                    <th>Manajer</th>
                    <th>Status</th>
                    <th className="col-actions">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rowData.map(({ u, idx, docCount, koCount, mgrNames }) => (
                    <tr key={u.id}>
                      <td className="tabular">{idx + 1}</td>
                      <td className="tabular"><strong>{u.kode}</strong></td>
                      <td>{u.nama}</td>
                      <td className="tabular meta-label-sm">[{u.kode} - {u.nama}]</td>
                      <td className="tabular">{docCount}</td>
                      <td className="tabular">{koCount}</td>
                      <td>{mgrNames.join(', ') || 'Belum disetel'}</td>
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
                            onClick={() => writeAction(`admin/units/${u.id}`, 'PATCH', { is_active: !u.is_active }, 'Status unit diperbarui.')}
                          >
                            {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <RowMenu triggerLabel={`Aksi lainnya unit ${u.nama}`} items={buildUnitMenu(u)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="responsive-cards" role="list">
              {rowData.map(({ u, docCount, koCount, mgrNames }) => (
                <li key={u.id} className="responsive-card">
                  <div className="responsive-card-head">
                    <h3><span className="tabular">{u.kode}</span> - {u.nama}</h3>
                    <span className={`status-pill status-${u.is_active ? 'success' : 'danger'}`}>
                      {u.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <dl>
                    <div><dt>Folder Drive</dt><dd className="tabular">[{u.kode} - {u.nama}]</dd></div>
                    <div><dt>Dokumen</dt><dd className="tabular">{docCount} · Koord. {koCount}</dd></div>
                    <div><dt>Manajer</dt><dd>{mgrNames.join(', ') || 'Belum disetel'}</dd></div>
                  </dl>
                  <div className="responsive-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => writeAction(`admin/units/${u.id}`, 'PATCH', { is_active: !u.is_active }, 'Status unit diperbarui.')}
                    >
                      {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <RowMenu triggerLabel={`Aksi lainnya unit ${u.nama}`} items={buildUnitMenu(u)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
