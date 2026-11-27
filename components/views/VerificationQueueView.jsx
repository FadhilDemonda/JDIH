'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Icon } from '@/components/ui/Icon';
import { canVerifyUnit, getCategory, getCurrentUser, getUnit, getUser, isAnyManajer } from '@/lib/domain';
import { formatDateID, formatTimestamp, getStatusBadge } from '@/lib/format';

export function VerificationQueueView() {
  const router = useRouter();
  const { state, refreshState, verifikasiTab, setVerifikasiTab, verifikasiSort, setVerifikasiSort } = useJdih();
  const tabRefs = useRef([]);

  const user = getCurrentUser(state);
  const allowed = isAnyManajer(state, user);

  useEffect(() => {
    if (!allowed) {
      router.replace('/403');
      return;
    }
    refreshState();
  }, [allowed, router, refreshState]);

  const pending = useMemo(() => {
    if (!allowed) return [];
    return state.versions.filter((v) => {
      if (v.status !== 'MENUNGGU_VERIFIKASI') return false;
      const doc = state.documents.find((d) => d.id === v.document_id);
      return doc && canVerifyUnit(state, user, doc.unit_id);
    });
  }, [allowed, state, user]);

  const history = useMemo(() => {
    if (!allowed) return [];
    return state.versions.filter((v) => {
      if (!['DISETUJUI', 'DIKEMBALIKAN'].includes(v.status)) return false;
      const doc = state.documents.find((d) => d.id === v.document_id);
      return doc && canVerifyUnit(state, user, doc.unit_id);
    });
  }, [allowed, state, user]);

  const rows = useMemo(() => {
    const raw = verifikasiTab === 'MENUNGGU' ? pending : history;
    return raw.slice().sort((a, b) => {
      const cmpJudul = () => (a.judul || '').localeCompare(b.judul || '', 'id', { sensitivity: 'base' });
      switch (verifikasiSort) {
        case 'TERLAMA': {
          const d = (a.submitted_at || a.approved_at || a.tgl_dokumen || '').localeCompare(b.submitted_at || b.approved_at || b.tgl_dokumen || '');
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
        case 'NOMOR_ASC': {
          const n = (a.nomor || '').localeCompare(b.nomor || '', 'id', { numeric: true, sensitivity: 'base' });
          return n !== 0 ? n : cmpJudul();
        }
        case 'TERBARU':
        default: {
          const d = (b.submitted_at || b.approved_at || b.tgl_dokumen || '').localeCompare(a.submitted_at || a.approved_at || a.tgl_dokumen || '');
          return d !== 0 ? d : cmpJudul();
        }
      }
    });
  }, [verifikasiTab, pending, history, verifikasiSort, state]);

  if (!allowed) return null;

  const tabs = [
    { key: 'MENUNGGU', id: 'tab-menunggu', label: `Menunggu Verifikasi (${pending.length})` },
    { key: 'RIWAYAT', id: 'tab-riwayat', label: `Riwayat Keputusan (${history.length})` },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Antrean Verifikasi Manajer</h1>
          <p className="page-subtitle">Periksa kelengkapan metadata, isi PDF, serta riwayat pengajuan dari unit yang Anda bawahi.</p>
        </div>
      </div>

      <section className="surface-panel">
        <div className="filter-subrow">
          <div className="tablist" role="tablist" aria-label="Kategori antrean verifikasi">
            {tabs.map((tab, idx) => (
              <button
                key={tab.key}
                ref={(el) => { tabRefs.current[idx] = el; }}
                type="button"
                role="tab"
                id={tab.id}
                aria-selected={verifikasiTab === tab.key}
                onClick={() => setVerifikasiTab(tab.key)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const nextIdx = (idx + 1) % tabs.length;
                    setVerifikasiTab(tabs[nextIdx].key);
                    tabRefs.current[nextIdx]?.focus();
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="filter-subrow-right">
            <div className="sort-inline">
              <label id="lbl-verifikasi-sort" htmlFor="verifikasi-sort">Urutkan</label>
              <CustomSelect
                id="verifikasi-sort"
                ariaLabelledBy="lbl-verifikasi-sort"
                value={verifikasiSort}
                options={[
                  { value: 'TERBARU', label: 'Ajuan terbaru' },
                  { value: 'TERLAMA', label: 'Ajuan terlama' },
                  { value: 'JUDUL_ASC', label: 'Judul (A-Z)' },
                  { value: 'UNIT_ASC', label: 'Unit kerja (A-Z)' },
                  { value: 'NOMOR_ASC', label: 'Nomor dokumen' },
                ]}
                onChange={setVerifikasiSort}
              />
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <Icon name="check" />
            <h3>Tidak ada pengajuan menunggu verifikasi</h3>
            <p>Semua pengajuan dari unit di bawah koordinasi Anda telah diputuskan.</p>
          </div>
        ) : (
          <div className="review-queue-results">
            <div className="table-wrap review-queue-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Judul</th>
                    <th>Nomor</th>
                    <th>Unit</th>
                    <th>Jenis</th>
                    <th>Revisi</th>
                    <th>Diajukan oleh</th>
                    <th>Tanggal Ajuan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const doc = state.documents.find((d) => d.id === v.document_id);
                    const needsReview = v.status === 'MENUNGGU_VERIFIKASI';
                    const badge = getStatusBadge(v.status);
                    const href = `/verifikasi/${v.id}`;
                    return (
                      <tr key={v.id}>
                        <td>
                          <Link href={href} className="table-title-link">{v.judul}</Link>
                          <div className="table-sub">
                            <span className={`status-pill status-${badge.tone}`}>{badge.label}</span>
                          </div>
                        </td>
                        <td className="tabular">{v.nomor}</td>
                        <td>{getUnit(state, doc.unit_id)?.nama || '-'}</td>
                        <td>{getCategory(state, doc.category_id)?.label || '-'}</td>
                        <td className="tabular">Rev {v.revisi_label}</td>
                        <td>{getUser(state, v.created_by)?.nama || '-'}</td>
                        <td className="tabular">{formatTimestamp(v.submitted_at)}</td>
                        <td>
                          <Link href={href} className={`btn ${needsReview ? 'btn-primary' : 'btn-secondary'} btn-compact`}>
                            {needsReview ? 'Periksa' : 'Detail'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="review-queue-cards" role="list">
              {rows.map((v) => {
                const doc = state.documents.find((d) => d.id === v.document_id);
                const needsReview = v.status === 'MENUNGGU_VERIFIKASI';
                const badge = getStatusBadge(v.status);
                const href = `/verifikasi/${v.id}`;
                const actionLabel = needsReview ? 'Periksa' : 'Detail';
                return (
                  <li key={v.id} className="review-queue-card">
                    <h2>{v.judul}</h2>
                    <span className={`status-pill status-${badge.tone}`}>{badge.label}</span>
                    <dl>
                      <div><dt>Unit</dt><dd>{getUnit(state, doc.unit_id)?.nama || '-'}</dd></div>
                      <div><dt>Diajukan</dt><dd className="tabular">{formatDateID(v.submitted_at)}</dd></div>
                    </dl>
                    <Link
                      href={href}
                      className={`btn ${needsReview ? 'btn-primary' : 'btn-secondary'}`}
                      aria-label={`${actionLabel} ${v.judul}`}
                    >
                      {actionLabel}
                    </Link>
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
