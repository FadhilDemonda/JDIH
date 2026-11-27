'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { RowMenu } from '@/components/ui/RowMenu';
import { getCurrentUser, getUnit, getUser } from '@/lib/domain';

export function AdminAssignmentsView({ peran }) {
  const router = useRouter();
  const { state, saving, writeAction, showToast } = useJdih();

  const user = getCurrentUser(state);
  const allowed = Boolean(user?.is_super_admin);
  const isKoor = peran === 'KOORDINATOR';
  const oppositePeran = isKoor ? 'MANAJER' : 'KOORDINATOR';

  const activeUsers = useMemo(() => state.users.filter((u) => u.is_active), [state.users]);
  const activeUnits = useMemo(() => state.units.filter((u) => u.is_active), [state.units]);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  useEffect(() => {
    if (!allowed) router.replace('/403');
  }, [allowed, router]);

  useEffect(() => {
    if (!selectedUserId && activeUsers[0]) setSelectedUserId(activeUsers[0].id);
  }, [selectedUserId, activeUsers]);

  useEffect(() => {
    if (!selectedUnitId && activeUnits[0]) setSelectedUnitId(activeUnits[0].id);
  }, [selectedUnitId, activeUnits]);

  const assignments = useMemo(
    () => state.userUnits.filter((uu) => uu.peran === peran && uu.is_active),
    [state.userUnits, peran]
  );

  const grouped = useMemo(() => {
    const groupedMap = new Map();
    assignments.forEach((a) => {
      const u = getUser(state, a.user_id);
      const un = getUnit(state, a.unit_id);
      if (!groupedMap.has(a.user_id)) {
        groupedMap.set(a.user_id, { userId: a.user_id, user: u, entries: [] });
      }
      groupedMap.get(a.user_id).entries.push({ id: a.id, unitName: un ? un.nama : '-' });
    });
    return Array.from(groupedMap.values());
  }, [assignments, state]);

  if (!allowed) return null;

  function handleAssign() {
    const uid = selectedUserId || activeUsers[0]?.id;
    const unitId = selectedUnitId || activeUnits[0]?.id;
    if (!uid || !unitId) return;
    const conflict = state.userUnits.some(
      (uu) => uu.user_id === uid && uu.unit_id === unitId && uu.peran === oppositePeran && uu.is_active
    );
    if (conflict) {
      showToast('Ditolak: pengguna tidak boleh menjadi Koordinator/SPV dan Manajer di unit yang sama.', 'error');
      return;
    }
    if (state.userUnits.some((uu) => uu.user_id === uid && uu.unit_id === unitId && uu.peran === peran && uu.is_active)) {
      showToast('Penugasan sudah terdaftar aktif.', 'error');
      return;
    }
    writeAction('admin/assignments', 'POST', { user_id: uid, unit_id: unitId, peran }, 'Penugasan tersimpan.');
  }

  function buildAssignMenu(g) {
    const menuItems = g.entries.map((entry) => ({
      label: `Cabut ${entry.unitName}`,
      icon: 'trash',
      danger: true,
      onClick: () => writeAction(`admin/assignments/${entry.id}`, 'DELETE', undefined, 'Penugasan dicabut.'),
    }));
    if (g.entries.length > 1) {
      menuItems.push({
        label: 'Cabut Semua Unit',
        icon: 'trash',
        danger: true,
        onClick: () =>
          writeAction('admin/assignments/revoke', 'PATCH', { ids: g.entries.map((e) => e.id) }, 'Penugasan dicabut.'),
      });
    }
    return menuItems;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isKoor ? 'Manajemen Koordinator/SPV' : 'Manajemen Manajer'}</h1>
          <p className="page-subtitle">
            {isKoor
              ? 'Tetapkan Koordinator/SPV penyusun dokumen per unit kerja.'
              : 'Tetapkan Manajer verifikator untuk satu atau beberapa unit.'}
          </p>
        </div>
      </div>

      <section className="surface-panel">
        <h2 className="section-heading">Tambah Penugasan {isKoor ? 'Koordinator/SPV' : 'Manajer'}</h2>
        <div className="field-grid" style={{ alignItems: 'end' }}>
          <div className="field col-5">
            <label id="lbl-assign-user" htmlFor="assign-user">Pengguna aktif</label>
            <CustomSelect
              id="assign-user"
              ariaLabelledBy="lbl-assign-user"
              value={selectedUserId}
              options={activeUsers.map((u) => ({ value: u.id, label: `${u.nama} (${u.nik})` }))}
              onChange={setSelectedUserId}
            />
          </div>
          <div className="field col-5">
            <label id="lbl-assign-unit" htmlFor="assign-unit">Unit kerja aktif</label>
            <CustomSelect
              id="assign-unit"
              ariaLabelledBy="lbl-assign-unit"
              value={selectedUnitId}
              options={activeUnits.map((u) => ({ value: u.id, label: u.nama }))}
              onChange={setSelectedUnitId}
            />
          </div>
          <div className="field col-2">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleAssign}>
              Simpan
            </button>
          </div>
        </div>
      </section>

      <section className="surface-panel">
        <h2 className="section-heading">
          Daftar Penugasan Aktif ({grouped.length} {isKoor ? 'Koordinator/SPV' : 'Manajer'} · {assignments.length} Unit)
        </h2>

        <div className="responsive-table-region">
          <div className="table-wrap responsive-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th>NIK</th>
                  <th>Unit Penugasan</th>
                  <th className="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <tr key={g.userId}>
                    <td>{g.user?.nama || '-'}</td>
                    <td className="tabular">{g.user?.nik || '-'}</td>
                    <td>{g.entries.map((e) => e.unitName).join(', ')}</td>
                    <td className="col-actions">
                      <div className="table-actions">
                        <RowMenu
                          triggerLabel={`Kelola penugasan ${g.user?.nama || 'pengguna'}`}
                          items={buildAssignMenu(g)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="responsive-cards" role="list">
            {grouped.map((g) => (
              <li key={g.userId} className="responsive-card">
                <div className="responsive-card-head">
                  <h3>{g.user?.nama || '-'}</h3>
                  <RowMenu
                    triggerLabel={`Kelola penugasan ${g.user?.nama || 'pengguna'}`}
                    items={buildAssignMenu(g)}
                  />
                </div>
                <dl>
                  <div><dt>NIK</dt><dd className="tabular">{g.user?.nik || '-'}</dd></div>
                  <div><dt>Unit</dt><dd>{g.entries.map((e) => e.unitName).join(', ')}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
