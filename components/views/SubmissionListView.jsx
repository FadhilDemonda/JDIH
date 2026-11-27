'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Icon } from '@/components/ui/Icon';
import { PageCounts } from '@/components/ui/PageCounts';
import { RowMenu } from '@/components/ui/RowMenu';
import { versionPath } from '@/lib/api';
import { canEditUnit, getCategory, getCurrentUser, getUnit, isAnyKoordinator } from '@/lib/domain';
import { formatDateID, getStatusBadge } from '@/lib/format';

export function SubmissionListView() {
  const router = useRouter();
  const {
    state,
    refreshState,
    writeAction,
    openDialog,
    pengajuanFilter,
    setPengajuanFilter,
    pengajuanSort,
    setPengajuanSort,
  } = useJdih();

  const user = getCurrentUser(state);
  const allowed = isAnyKoordinator(state, user);

  useEffect(() => {
    if (!allowed) {
      router.replace('/403');
      return;
    }
    refreshState();
  }, [allowed, router, refreshState]);

  const unitSubmissions = useMemo(() => {
    if (!allowed) return [];
    return state.versions.filter((v) => {
      if (v.status === 'DIHAPUS' || v.status === 'DISETUJUI') return false;
      const doc = state.documents.find((d) => d.id === v.document_id);
      return doc && canEditUnit(state, user, doc.unit_id);
    });
  }, [allowed, state, user]);

  const statusOptions = useMemo(
    () =>
      [
        ['DRAF', 'edit'],
        ['MENUNGGU_VERIFIKASI', 'clock'],
        ['DIKEMBALIKAN', 'undo'],
      ].map(([value, icon]) => ({
        value,
        icon,
        ...getStatusBadge(value),
        count: unitSubmissions.filter((version) => version.status === value).length,
      })),
    [unitSubmissions]
  );

  const items = useMemo(() => {
    return unitSubmissions
      .filter((v) => pengajuanFilter === 'SEMUA' || v.status === pengajuanFilter)
      .sort((a, b) => {
        const cmpJudul = () => (a.judul || '').localeCompare(b.judul || '', 'id', { sensitivity: 'base' });
        const cmpTerbaru = () => (b.submitted_at || b.tgl_dokumen || '').localeCompare(a.submitted_at || a.tgl_dokumen || '');
        switch (pengajuanSort) {
          case 'TERLAMA': {
            const d = (a.submitted_at || a.tgl_dokumen || '').localeCompare(b.submitted_at || b.tgl_dokumen || '');
            return d !== 0 ? d : cmpJudul();
          }
          case 'STATUS': {
            const rank = { DIKEMBALIKAN: 0, DRAF: 1, MENUNGGU_VERIFIKASI: 2 };
            const s = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
            if (s !== 0) return s;
            const d = cmpTerbaru();
            return d !== 0 ? d : cmpJudul();
          }
          case 'JUDUL_ASC':
            return cmpJudul();
          case 'UNIT_ASC': {
            const docA = state.documents.find((d) => d.id === a.document_id);
            const docB = state.documents.find((d) => d.id === b.document_id);
            const ua = docA ? (getUnit(state, docA.unit_id)?.nama || '') : '';
            const ub = docB ? (getUnit(state, docB.unit_id)?.nama || '') : '';
            const u = ua.localeCompare(ub, 'id', { sensitivity: 'base' });
            return u !== 0 ? u : cmpJudul();
          }
          case 'TERBARU':
          default: {
            const d = cmpTerbaru();
            return d !== 0 ? d : cmpJudul();
          }
        }
      });
  }, [unitSubmissions, pengajuanFilter, pengajuanSort, state]);

  if (!allowed) return null;

  function buildRowMenuItems(ver) {
    const menuItems = [];
    if (ver.status === 'MENUNGGU_VERIFIKASI') {
      menuItems.push({
        label: 'Tarik Pengajuan',
        icon: 'undo',
        onClick: async () => {
          const res = await openDialog({
            title: 'Tarik Pengajuan',
            body: (
              <p>
                Pengajuan <strong>{ver.judul}</strong> akan dikembalikan ke status Draf dan dihapus dari antrean Manajer.
              </p>
            ),
            confirmLabel: 'Tarik Pengajuan',
          });
          if (!res) return;
          await writeAction(versionPath(ver.id, '/withdraw'), 'POST', {}, 'Pengajuan ditarik.');
        },
      });
    }
    if (['DRAF', 'DIKEMBALIKAN'].includes(ver.status)) {
      menuItems.push({
        label: 'Hapus Draf',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const res = await openDialog({
            title: 'Hapus Draf',
            body: (
              <p>
                Draf <strong>{ver.judul || ver.nomor}</strong> akan dihapus permanen dari tampilan dan dicatat di log audit.
              </p>
            ),
            confirmLabel: 'Hapus Draf',
            confirmTone: 'danger',
          });
          if (!res) return;
          await writeAction(versionPath(ver.id), 'DELETE', undefined, 'Draf dihapus.');
        },
      });
    }
    return menuItems;
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Pengajuan Unit</h1>
        <div className="page-actions">
          <Link href="/pengajuan/baru" className="btn btn-primary">
            <Icon name="plus" />
            <span>Buat Dokumen</span>
          </Link>
        </div>
      </div>

      <PageCounts label="Jumlah pengajuan per status" counts={statusOptions} cards />

      <section className="surface-panel">
        <div className="filter-subrow">
          <div className="segmented" role="group" aria-label="Filter status pengajuan">
            {[{ value: 'SEMUA', label: 'Semua' }, ...statusOptions].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={pengajuanFilter === value ? 'active' : ''}
                aria-pressed={pengajuanFilter === value}
                onClick={() => setPengajuanFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="filter-subrow-right">
            <div className="sort-inline">
              <label id="lbl-pengajuan-sort" htmlFor="pengajuan-sort">Urutkan</label>
              <CustomSelect
                id="pengajuan-sort"
                ariaLabelledBy="lbl-pengajuan-sort"
                value={pengajuanSort}
                options={[
                  { value: 'TERBARU', label: 'Terbaru' },
                  { value: 'TERLAMA', label: 'Terlama' },
                  { value: 'STATUS', label: 'Status (Dikembalikan dulu)' },
                  { value: 'JUDUL_ASC', label: 'Judul (A-Z)' },
                  { value: 'UNIT_ASC', label: 'Unit kerja (A-Z)' },
                ]}
                onChange={setPengajuanSort}
              />
            </div>
            <span className="tabular meta-label-sm">
              Total <strong>{items.length}</strong> draf dan pengajuan
            </span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <Icon name="edit" />
            <h3>Belum ada draf atau pengajuan</h3>
            <p>Mulai buat dokumen baru dari template resmi atau unggah berkas PDF yang sudah tersedia.</p>
            <Link href="/pengajuan/baru" className="btn btn-primary">Buat Dokumen</Link>
          </div>
        ) : (
          <div className="responsive-table-region">
            <div className="table-wrap responsive-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Judul</th>
                    <th>Nomor</th>
                    <th>Unit</th>
                    <th>Jenis</th>
                    <th>Metode</th>
                    <th>Status</th>
                    <th className="col-actions">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((v) => {
                    const doc = state.documents.find((d) => d.id === v.document_id);
                    const unit = getUnit(state, doc.unit_id);
                    const cat = getCategory(state, doc.category_id);
                    const badge = getStatusBadge(v.status);
                    const awaitingReview = v.status === 'MENUNGGU_VERIFIKASI';
                    return (
                      <tr key={v.id}>
                        <td>
                          <Link href={`/pengajuan/${v.id}`} className="table-title-link">{v.judul || '(Tanpa Judul)'}</Link>
                          <div className="table-sub tabular">Rev {v.revisi_label} · Berlaku {formatDateID(v.tgl_berlaku)}</div>
                          {v.status === 'DIKEMBALIKAN' && v.return_note ? (
                            <div className="table-sub" style={{ color: 'var(--danger-text)' }}>
                              Catatan Manajer: {v.return_note}
                            </div>
                          ) : null}
                        </td>
                        <td className="tabular">{v.nomor || '-'}</td>
                        <td>{unit ? unit.nama : '-'}</td>
                        <td>{cat ? cat.label : '-'}</td>
                        <td>{v.metode === 'TEMPLATE' ? 'Template' : 'Upload'}</td>
                        <td><span className={`status-pill status-${badge.tone}`}>{badge.label}</span></td>
                        <td className="col-actions">
                          <div className="table-actions">
                            <Link
                              href={`/pengajuan/${v.id}`}
                              className={`btn ${awaitingReview ? 'btn-secondary' : 'btn-submission-edit'} btn-compact`}
                            >
                              {awaitingReview ? 'Lihat' : 'Edit'}
                            </Link>
                            <RowMenu
                              triggerLabel={`Aksi lainnya untuk ${v.judul || 'draf'}`}
                              items={buildRowMenuItems(v)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="responsive-cards" role="list">
              {items.map((v) => {
                const doc = state.documents.find((d) => d.id === v.document_id);
                const unit = getUnit(state, doc.unit_id);
                const cat = getCategory(state, doc.category_id);
                const badge = getStatusBadge(v.status);
                const awaitingReview = v.status === 'MENUNGGU_VERIFIKASI';
                return (
                  <li key={v.id} className="responsive-card">
                    <div className="responsive-card-head">
                      <h3><Link href={`/pengajuan/${v.id}`} className="table-title-link">{v.judul || '(Tanpa Judul)'}</Link></h3>
                      <span className={`status-pill status-${badge.tone}`}>{badge.label}</span>
                    </div>
                    {v.status === 'DIKEMBALIKAN' && v.return_note ? (
                      <div className="responsive-card-note">Catatan Manajer: {v.return_note}</div>
                    ) : null}
                    <dl>
                      <div><dt>Nomor</dt><dd className="tabular">{v.nomor || '-'} · Rev {v.revisi_label}</dd></div>
                      <div><dt>Unit</dt><dd>{unit ? unit.nama : '-'}</dd></div>
                      <div><dt>Jenis</dt><dd>{cat ? cat.label : '-'}</dd></div>
                      <div><dt>Metode</dt><dd>{v.metode === 'TEMPLATE' ? 'Template' : 'Upload'} · Berlaku {formatDateID(v.tgl_berlaku)}</dd></div>
                    </dl>
                    <div className="responsive-card-actions">
                      <Link
                        href={`/pengajuan/${v.id}`}
                        className={`btn ${awaitingReview ? 'btn-secondary' : 'btn-submission-edit'} btn-compact`}
                      >
                        {awaitingReview ? 'Lihat' : 'Edit'}
                      </Link>
                      <RowMenu
                        triggerLabel={`Aksi lainnya untuk ${v.judul || 'draf'}`}
                        items={buildRowMenuItems(v)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
