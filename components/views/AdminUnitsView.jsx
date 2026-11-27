'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { Icon } from '@/components/ui/Icon';
import { RowMenu } from '@/components/ui/RowMenu';
import { getCurrentUser, getUser } from '@/lib/domain';

export function AdminUnitsView() {
  const router = useRouter();
  const { state, writeAction, showToast, openDialog, adminUnitSearch, setAdminUnitSearch } = useJdih();

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
          <button type="button" className="btn btn-primary" onClick={handleAddUnit}>
            <Icon name="plus" />
            <span>Tambah Unit</span>
          </button>
        </div>
      </div>

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
