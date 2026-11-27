'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useJdih } from '@/components/providers/JdihProvider';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Icon } from '@/components/ui/Icon';
import { PageCounts } from '@/components/ui/PageCounts';
import {
  getCategory,
  getCurrentUser,
  getMyUnitIds,
  getPrimaryPublishedVersion,
  getUnit,
  isAnyKoordinator,
} from '@/lib/domain';
import { formatDateID } from '@/lib/format';

export function DocumentListView({ myUnitsOnly = false }) {
  const {
    state,
    refreshState,
    setLastListRoute,
    docFilters,
    setDocFilters,
    myUnitDocFilters,
    setMyUnitDocFilters,
  } = useJdih();

  const searchRef = useRef(null);
  const f = myUnitsOnly ? myUnitDocFilters : docFilters;
  const setFilters = myUnitsOnly ? setMyUnitDocFilters : setDocFilters;
  const user = getCurrentUser(state);

  useEffect(() => {
    setLastListRoute(myUnitsOnly ? '/dokumen-unit' : '/dokumen');
    refreshState();
  }, [myUnitsOnly, setLastListRoute, refreshState]);

  const myUnitIds = useMemo(() => (myUnitsOnly ? getMyUnitIds(state, user) : []), [myUnitsOnly, state, user]);
  const myUnits = useMemo(
    () => (myUnitsOnly ? myUnitIds.map((id) => getUnit(state, id)).filter(Boolean) : []),
    [myUnitsOnly, myUnitIds, state]
  );
  const availableUnits = useMemo(
    () => (myUnitsOnly ? myUnits : state.units.filter((u) => u.is_active)),
    [myUnitsOnly, myUnits, state.units]
  );
  const effectiveUnitId = myUnitsOnly && f.unitId && !myUnitIds.includes(f.unitId) ? '' : f.unitId;
  const showUnitFilter = !myUnitsOnly || myUnits.length > 1;

  const publishedDocs = useMemo(() => {
    return state.documents
      .map((doc) => {
        if (myUnitsOnly && !myUnitIds.includes(doc.unit_id)) return null;
        if (!f.showInactive && doc.status_aktif !== 'AKTIF') return null;
        if (effectiveUnitId && doc.unit_id !== effectiveUnitId) return null;
        const pub = getPrimaryPublishedVersion(state, doc.id);
        if (!pub) return null;
        return { doc, version: pub.version, eff: pub.eff };
      })
      .filter(Boolean);
  }, [state, myUnitsOnly, myUnitIds, f.showInactive, effectiveUnitId]);

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return publishedDocs
      .filter(({ doc, version }) => {
        if (f.categoryId && doc.category_id !== f.categoryId) return false;
        if (q) {
          const hay = `${version.judul} ${version.nomor} ${version.kata_kunci || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmpJudul = () => (a.version.judul || '').localeCompare(b.version.judul || '', 'id', { sensitivity: 'base' });
        switch (f.sortBy) {
          case 'TERLAMA': {
            const d = (a.version.tgl_berlaku || '').localeCompare(b.version.tgl_berlaku || '');
            return d !== 0 ? d : cmpJudul();
          }
          case 'JUDUL_ASC':
            return cmpJudul();
          case 'NOMOR_ASC': {
            const n = (a.version.nomor || '').localeCompare(b.version.nomor || '', 'id', { numeric: true, sensitivity: 'base' });
            return n !== 0 ? n : cmpJudul();
          }
          case 'UNIT_ASC': {
            const ua = getUnit(state, a.doc.unit_id)?.nama || '';
            const ub = getUnit(state, b.doc.unit_id)?.nama || '';
            const u = ua.localeCompare(ub, 'id', { sensitivity: 'base' });
            return u !== 0 ? u : cmpJudul();
          }
          case 'TERBARU':
          default: {
            const d = (b.version.tgl_berlaku || '').localeCompare(a.version.tgl_berlaku || '');
            return d !== 0 ? d : cmpJudul();
          }
        }
      });
  }, [publishedDocs, f.categoryId, f.q, f.sortBy, state]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / f.pageSize));
  const safePage = Math.min(f.page, totalPages);
  const start = (safePage - 1) * f.pageSize;
  const rows = filtered.slice(start, start + f.pageSize);

  const hasActiveFilters = Boolean(f.q.trim() || effectiveUnitId || f.categoryId || f.showInactive);
  const advancedCount = Number(f.showInactive) + Number(f.sortBy !== 'TERBARU');
  const canReset = hasActiveFilters || advancedCount > 0;

  const pageTitle = myUnitsOnly ? 'Dokumen Unit Saya' : 'Daftar Dokumen Regulasi';
  const pageSubtitle = myUnitsOnly
    ? (myUnits.length ? myUnits.map((u) => u.nama).join(' · ') : 'Belum ada unit kerja yang terhubung ke akun Anda.')
    : 'Regulasi terbit dari seluruh unit RS AN-NISA.';

  const categoryCounts = state.categories.map(({ id, label }) => ({
    label,
    count: publishedDocs.filter(({ doc }) => doc.category_id === id).length,
  }));

  function resetFilters() {
    setFilters((prev) => ({
      q: '',
      unitId: '',
      categoryId: '',
      sortBy: 'TERBARU',
      showInactive: false,
      moreOpen: false,
      pageSize: prev.pageSize,
      page: 1,
    }));
    searchRef.current?.focus();
  }

  return (
    <>
      <div className="page-header page-header-with-counts">
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <p className="page-subtitle">{pageSubtitle}</p>
        </div>
        <div className="page-actions page-count-actions">
          <PageCounts label="Jumlah dokumen per jenis" counts={categoryCounts} />
          {isAnyKoordinator(state, user) ? (
            <Link href="/pengajuan/baru" className="btn btn-primary">
              <Icon name="plus" />
              <span>Buat Dokumen</span>
            </Link>
          ) : null}
        </div>
      </div>

      <section className="surface-panel" aria-label="Pencarian dan filter">
        <div className={`filter-bar${showUnitFilter ? '' : ' filter-bar-3'}`}>
          <div className="field document-filter-search">
            <label htmlFor="doc-search-input">Cari dokumen</label>
            <input
              ref={searchRef}
              id="doc-search-input"
              className="input"
              type="search"
              value={f.q}
              placeholder="Judul, nomor, atau kata kunci"
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value, page: 1 }))}
            />
          </div>

          {showUnitFilter ? (
            <div className="field">
              <label id="lbl-doc-unit-filter" htmlFor="doc-unit-filter">Unit kerja</label>
              <CustomSelect
                id="doc-unit-filter"
                ariaLabelledBy="lbl-doc-unit-filter"
                value={effectiveUnitId}
                options={[
                  { value: '', label: `${myUnitsOnly ? 'Semua unit saya' : 'Semua unit'} (${availableUnits.length})` },
                  ...availableUnits.map((u) => ({ value: u.id, label: u.nama })),
                ]}
                onChange={(val) => setFilters((prev) => ({ ...prev, unitId: val, page: 1 }))}
              />
            </div>
          ) : null}

          <div className="field">
            <label id="lbl-doc-cat-filter" htmlFor="doc-cat-filter">Jenis dokumen</label>
            <CustomSelect
              id="doc-cat-filter"
              ariaLabelledBy="lbl-doc-cat-filter"
              value={f.categoryId}
              options={[
                { value: '', label: 'Semua jenis' },
                ...state.categories.map((c) => ({ value: c.id, label: c.label })),
              ]}
              onChange={(val) => setFilters((prev) => ({ ...prev, categoryId: val, page: 1 }))}
            />
          </div>

          <div className="document-filter-actions">
            <button
              type="button"
              className="btn btn-secondary"
              id="doc-more-filter"
              aria-expanded={f.moreOpen}
              aria-controls="document-filter-options"
              onClick={() => setFilters((prev) => ({ ...prev, moreOpen: !prev.moreOpen }))}
            >
              <span>Filter lainnya{advancedCount ? ` (${advancedCount})` : ''}</span>
              <Icon name="chevronDown" />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              id="doc-reset-filter"
              hidden={!canReset}
              onClick={resetFilters}
            >
              Atur ulang
            </button>
          </div>
        </div>

        <div className="document-filter-options" id="document-filter-options" hidden={!f.moreOpen}>
          <div className="field">
            <label id="lbl-doc-sort-filter" htmlFor="doc-sort-filter">Urutkan</label>
            <CustomSelect
              id="doc-sort-filter"
              ariaLabelledBy="lbl-doc-sort-filter"
              value={f.sortBy}
              options={[
                { value: 'TERBARU', label: 'Berlaku terbaru' },
                { value: 'TERLAMA', label: 'Berlaku terlama' },
                { value: 'JUDUL_ASC', label: 'Judul (A-Z)' },
                { value: 'NOMOR_ASC', label: 'Nomor dokumen' },
                { value: 'UNIT_ASC', label: 'Unit kerja (A-Z)' },
              ]}
              onChange={(val) => setFilters((prev) => ({ ...prev, sortBy: val, page: 1 }))}
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              id="doc-show-inactive"
              checked={f.showInactive}
              onChange={(e) => setFilters((prev) => ({ ...prev, showInactive: e.target.checked, page: 1 }))}
            />
            <span>Tampilkan tidak aktif</span>
          </label>
        </div>
      </section>

      <hr className="document-section-divider" aria-hidden="true" />

      <section className="surface-panel" aria-labelledby="document-results-title">
        <div className="document-results-header">
          <h2 className="section-heading" id="document-results-title">
            {hasActiveFilters ? 'Hasil filter' : myUnitsOnly ? 'Regulasi unit saya' : 'Regulasi seluruh unit'}
          </h2>
          <span className="tabular"><strong>{filtered.length}</strong> dokumen</span>
        </div>

        {myUnitsOnly && myUnits.length === 0 ? (
          <div className="empty-state">
            <Icon name="folder" />
            <h3>Unit kerja belum terhubung</h3>
            <p>Akun Anda belum memiliki unit kerja yang terdaftar. Anda tetap dapat melihat seluruh regulasi di Daftar Dokumen.</p>
            <Link href="/dokumen" className="btn btn-secondary">Buka Daftar Dokumen</Link>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <Icon name="doc" />
            <h3>Dokumen tidak ditemukan</h3>
            <p>
              {myUnitsOnly && !hasActiveFilters
                ? 'Belum ada dokumen terbit untuk unit Anda. Anda dapat menelusuri regulasi unit lain di Daftar Dokumen.'
                : 'Coba ubah kata kunci pencarian atau hapus sebagian filter unit dan jenis.'}
            </p>
            {myUnitsOnly && !hasActiveFilters ? (
              <Link href="/dokumen" className="btn btn-secondary">Buka Daftar Dokumen</Link>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                Tampilkan Semua Dokumen
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="responsive-table-region">
              <div className="table-wrap responsive-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Judul</th>
                      <th>Nomor / Revisi</th>
                      <th>Unit</th>
                      <th>Jenis</th>
                      <th>Tanggal Berlaku</th>
                      <th>Status Keberlakuan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ doc, version, eff }) => {
                      const unit = getUnit(state, doc.unit_id);
                      const cat = getCategory(state, doc.category_id);
                      return (
                        <tr key={doc.id} className="document-link-row">
                          <td>
                            <Link href={`/dokumen/${doc.id}`} className="table-title-link">{version.judul}</Link>
                          </td>
                          <td className="tabular">
                            <div>{version.nomor}</div>
                            <div className="table-sub">Rev {version.revisi_label}</div>
                          </td>
                          <td>{unit ? unit.nama : '-'}</td>
                          <td>{cat ? cat.label : '-'}</td>
                          <td className="tabular">{formatDateID(version.tgl_berlaku)}</td>
                          <td>
                            {doc.status_aktif === 'TIDAK_AKTIF' ? (
                              <span className="status-pill status-danger">Tidak Aktif</span>
                            ) : (
                              <span className={`status-pill status-${eff.tone}`}>{eff.label}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="responsive-cards" role="list">
                {rows.map(({ doc, version, eff }) => {
                  const unit = getUnit(state, doc.unit_id);
                  const cat = getCategory(state, doc.category_id);
                  return (
                    <li key={doc.id} className="responsive-card document-link-row">
                      <div className="responsive-card-head">
                        <h3><Link href={`/dokumen/${doc.id}`} className="table-title-link">{version.judul}</Link></h3>
                        {doc.status_aktif === 'TIDAK_AKTIF' ? (
                          <span className="status-pill status-danger">Tidak Aktif</span>
                        ) : (
                          <span className={`status-pill status-${eff.tone}`}>{eff.label}</span>
                        )}
                      </div>
                      <dl>
                        <div><dt>Nomor</dt><dd className="tabular">{version.nomor} · Rev {version.revisi_label}</dd></div>
                        <div><dt>Unit</dt><dd>{unit ? unit.nama : '-'}</dd></div>
                        <div><dt>Jenis</dt><dd>{cat ? cat.label : '-'}</dd></div>
                        <div><dt>Berlaku</dt><dd className="tabular">{formatDateID(version.tgl_berlaku)}</dd></div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="pagination-bar">
              <div className="pagination-controls">
                <label id="lbl-doc-pagesize" htmlFor="doc-pagesize">Baris per halaman</label>
                <CustomSelect
                  id="doc-pagesize"
                  ariaLabelledBy="lbl-doc-pagesize"
                  compact
                  value={String(f.pageSize)}
                  options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(val) => setFilters((prev) => ({ ...prev, pageSize: Number(val), page: 1 }))}
                />
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={safePage <= 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, safePage - 1) }))}
                >
                  Sebelumnya
                </button>
                <span className="tabular">Halaman {safePage} dari {totalPages}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={safePage >= totalPages}
                  onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(totalPages, safePage + 1) }))}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
