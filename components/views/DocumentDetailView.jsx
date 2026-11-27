'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { DocumentPreviewStage } from '@/components/preview/DocumentPreviewStage';
import { Icon } from '@/components/ui/Icon';
import { fileUrl, uploadChunkedFile, versionPath } from '@/lib/api';
import {
  canEditUnit,
  canVerifyUnit,
  computeEffectiveStatuses,
  getCategory,
  getCurrentUser,
  getOpenRevision,
  getScanPdfAttachment,
  getUnit,
  getUser,
} from '@/lib/domain';
import { formatDateID, formatTimestamp } from '@/lib/format';

export function DocumentDetailView({ docId }) {
  const router = useRouter();
  const {
    state,
    saving,
    setSnapshot,
    writeAction,
    showToast,
    openDialog,
    uploadState,
    setUploadState,
    lastListRoute,
    previewModeByVersion,
    setPreviewModeByVersion,
  } = useJdih();

  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const stageTopRef = useRef(null);

  const user = getCurrentUser(state);
  const doc = state.documents.find((d) => d.id === docId);

  const published = useMemo(
    () =>
      state.versions
        .filter((v) => v.document_id === docId && v.status === 'DISETUJUI')
        .sort((a, b) => b.tgl_berlaku.localeCompare(a.tgl_berlaku)),
    [state.versions, docId]
  );

  useEffect(() => {
    if (!doc) {
      router.replace('/dokumen');
      return;
    }
    if (!published.length) {
      if (!canEditUnit(state, user, doc.unit_id) && !canVerifyUnit(state, user, doc.unit_id)) {
        router.replace('/403');
        return;
      }
      const openVer = getOpenRevision(state, docId);
      if (openVer) router.replace(`/pengajuan/${openVer.id}`);
    }
  }, [doc, published.length, state, user, docId, router]);

  if (!doc || !published.length) {
    return <p className="empty-state" role="status">Memuat detail dokumen…</p>;
  }

  const { map, currentBerlakuId } = computeEffectiveStatuses(state, docId);
  const currentVersion = published.find((v) => v.id === currentBerlakuId);
  const activeVersion =
    published.find((v) => v.id === selectedVersionId) || currentVersion || published[0];

  const unit = getUnit(state, doc.unit_id);
  const cat = getCategory(state, doc.category_id);
  const canManage = canEditUnit(state, user, doc.unit_id);
  const openRev = getOpenRevision(state, docId);
  const eff = map.get(activeVersion.id);
  const canUploadScanOnDetail = canManage && activeVersion.metode === 'TEMPLATE';
  const detailScanAtt = getScanPdfAttachment(activeVersion);
  const chosenMode = previewModeByVersion[activeVersion.id];
  const detailPreviewMode =
    chosenMode === 'CURRENT' || chosenMode === 'SCAN'
      ? chosenMode
      : activeVersion.metode === 'UPLOAD' && detailScanAtt
        ? 'SCAN'
        : 'CURRENT';

  const isActiveDocument = doc.status_aktif === 'AKTIF';
  const useScanPdf = detailPreviewMode === 'SCAN' && Boolean(detailScanAtt?.id);
  const pdfUrl = fileUrl(activeVersion, useScanPdf ? 'scan' : 'pdf');

  function setVersionPreviewMode(nextMode) {
    setPreviewModeByVersion((prev) => ({ ...prev, [activeVersion.id]: nextMode }));
  }

  async function handleUploadScan(file) {
    if (saving || !file) return;
    setUploadState({ status: 'UPLOADING', fileName: file.name, progress: 0 });
    try {
      await uploadChunkedFile({
        version: activeVersion,
        file,
        kind: 'PDF',
        onProgress: (progress) => setUploadState((prev) => ({ ...prev, progress })),
        onState: setSnapshot,
      });
      setVersionPreviewMode('SCAN');
      showToast('Berkas tersimpan.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploadState({ status: 'IDLE', fileName: '', progress: 0 });
    }
  }

  async function handleDeleteScan() {
    if (!detailScanAtt) return;
    const res = await openDialog({
      title: 'Hapus Berkas PDF',
      body: (
        <p>
          Berkas <strong>{detailScanAtt.nama}</strong> akan dihapus dari versi dokumen ini. Lanjutkan?
        </p>
      ),
      confirmLabel: 'Ya, Hapus PDF',
      confirmTone: 'danger',
    });
    if (!res) return;
    await writeAction(versionPath(activeVersion.id, '/files/scan'), 'DELETE', undefined, 'Berkas PDF dihapus.', () => {
      setVersionPreviewMode('CURRENT');
    });
  }

  async function handleToggleStatus() {
    if (openRev) {
      showToast('Selesaikan atau hapus revisi terbuka terlebih dahulu.', 'error');
      return;
    }
    const activating = doc.status_aktif !== 'AKTIF';
    const res = await openDialog({
      title: activating ? 'Aktifkan Kembali Dokumen' : 'Nonaktifkan Dokumen',
      body: activating ? (
        <p>Dokumen <strong>{activeVersion.judul}</strong> akan tampil kembali di pencarian bawaan staf.</p>
      ) : (
        <p>Dokumen <strong>{activeVersion.judul}</strong> akan disembunyikan dari pencarian bawaan tanpa persetujuan Manajer.</p>
      ),
      confirmLabel: activating ? 'Aktifkan Dokumen' : 'Nonaktifkan Dokumen',
      confirmTone: activating ? 'primary' : 'danger',
      requireNote: true,
      noteLabel: activating ? 'Alasan pengaktifan kembali' : 'Alasan penonaktifan',
      notePlaceholder: activating ? 'Contoh: Regulasi kembali diberlakukan.' : 'Contoh: Dicabut dan tidak digunakan lagi.',
    });
    if (!res) return;
    await writeAction(
      `documents/${doc.id}/status`,
      'POST',
      { status_aktif: activating ? 'AKTIF' : 'TIDAK_AKTIF', alasan: res.note },
      'Status dokumen diperbarui.'
    );
  }

  async function handleCreateRevision() {
    if (openRev) {
      showToast('Sudah ada revisi terbuka. Mengarahkan ke draf revisi.', 'error');
      router.push(`/pengajuan/${openRev.id}`);
      return;
    }
    await writeAction(`documents/${doc.id}/revisions`, 'POST', {}, 'Draf revisi dibuat.', ({ versionId }) => {
      router.push(`/pengajuan/${versionId}`);
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href={lastListRoute || '/dokumen'} className="btn btn-ghost btn-compact back-link">
            <Icon name="arrowLeft" />
            <span>{lastListRoute === '/dokumen-unit' ? 'Kembali ke Dokumen Unit Saya' : 'Kembali ke Daftar Dokumen'}</span>
          </Link>
          <h1 className="page-title">{activeVersion.judul}</h1>
          <p className="page-subtitle tabular">{activeVersion.nomor} · {unit ? unit.nama : '-'}</p>
          <div className="document-version-context">
            <span className={`status-pill status-${isActiveDocument ? eff.tone : 'danger'}`}>
              {isActiveDocument ? eff.label : 'Tidak Aktif'} · Rev {activeVersion.revisi_label}
            </span>
            {isActiveDocument && currentVersion && currentVersion.id !== activeVersion.id ? (
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => setSelectedVersionId(currentVersion.id)}
              >
                Lihat versi yang berlaku · Rev {currentVersion.revisi_label}
              </button>
            ) : null}
          </div>
        </div>
        <div className="page-actions">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <Icon name="doc" />
            <span>Buka PDF di tab baru</span>
          </a>
        </div>
      </div>

      {doc.status_aktif === 'TIDAK_AKTIF' ? (
        <div className="notice-banner danger" role="status">
          <div>
            <strong>Dokumen berstatus Tidak Aktif sejak {formatDateID(doc.tgl_tidak_aktif)}</strong>
            <p>Alasan penonaktifan: {doc.alasan_tidak_aktif}</p>
          </div>
        </div>
      ) : null}

      {openRev && canManage ? (
        <div className="notice-banner warning" role="status">
          <div>
            <strong>Terdapat revisi terbuka (Rev {openRev.revisi_label})</strong>
            <p>Satu dokumen induk hanya mengizinkan satu revisi terbuka pada satu waktu.</p>
          </div>
          <Link href={`/pengajuan/${openRev.id}`} className="btn btn-secondary btn-compact">Buka Draf Revisi</Link>
        </div>
      ) : null}

      <div className="workbench-grid">
        <div>
          <section className="surface-panel">
            <h2 className="section-heading">Metadata Versi Terpilih</h2>
            <dl className="meta-dl">
              <div><dt>Nomor Dokumen</dt><dd className="tabular">{activeVersion.nomor}</dd></div>
              <div><dt>Unit Pemilik</dt><dd>{unit ? unit.nama : '-'}</dd></div>
              <div><dt>Jenis Dokumen</dt><dd>{cat ? cat.label : '-'}</dd></div>
              <div><dt>Label Revisi</dt><dd className="tabular">Rev {activeVersion.revisi_label}</dd></div>
              <div><dt>Tanggal Dokumen</dt><dd className="tabular">{formatDateID(activeVersion.tgl_dokumen)}</dd></div>
              <div><dt>Tanggal Mulai Berlaku</dt><dd className="tabular">{formatDateID(activeVersion.tgl_berlaku)}</dd></div>
              <div><dt>Status Keberlakuan</dt><dd><span className={`status-pill status-${eff.tone}`}>{eff.label}</span></dd></div>
              <div>
                <dt>Status Dokumen Induk</dt>
                <dd>
                  <span className={`status-pill status-${doc.status_aktif === 'AKTIF' ? 'success' : 'danger'}`}>
                    {doc.status_aktif === 'AKTIF' ? 'Aktif' : 'Tidak Aktif'}
                  </span>
                </dd>
              </div>
              <div><dt>Kata Kunci</dt><dd>{activeVersion.kata_kunci || '-'}</dd></div>
              <div><dt>Disetujui Oleh</dt><dd>{getUser(state, activeVersion.approved_by)?.nama || '-'}</dd></div>
            </dl>

            <div className="panel-divider">
              <div className="meta-label-sm" style={{ marginBottom: '4px' }}>Ringkasan Perubahan</div>
              <div>{activeVersion.ringkasan_perubahan || '-'}</div>
            </div>

            {activeVersion.attachments?.length || canUploadScanOnDetail ? (
              <div className="panel-divider">
                <div className="scan-upload-head" style={{ marginBottom: '8px' }}>
                  <div className="meta-label-sm">Lampiran &amp; Berkas PDF Hasil Scan</div>
                  {canUploadScanOnDetail ? (
                    <label className="btn btn-secondary btn-compact">
                      <Icon name="upload" />
                      <span>{detailScanAtt ? 'Ganti PDF Hasil Scan' : 'Unggah PDF Hasil Scan'}</span>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="file-picker"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadScan(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  ) : null}
                </div>

                {uploadState.status === 'UPLOADING' ? (
                  <div className="upload-zone" role="status" style={{ marginBottom: '10px' }}>
                    <p style={{ margin: 0 }}>Mengunggah {uploadState.fileName} ({uploadState.progress}%)</p>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${uploadState.progress}%` }} />
                    </div>
                  </div>
                ) : null}

                {(activeVersion.attachments || []).map((att) => {
                  const isScanPdf = att.kind === 'PDF';
                  return (
                    <div key={att.id || att.nama} className="upload-file-row">
                      <span>
                        {att.id ? <a href={fileUrl(activeVersion, att.id, true)}>{att.nama}</a> : att.nama}{' '}
                        <span className="tabular meta-label-sm">({att.ukuran})</span>
                      </span>
                      {isScanPdf ? (
                        <div className="upload-file-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onClick={() => {
                              setVersionPreviewMode('SCAN');
                              stageTopRef.current?.scrollIntoView({ block: 'nearest' });
                            }}
                          >
                            Pratinjau
                          </button>
                          {canUploadScanOnDetail ? (
                            <button
                              type="button"
                              className="btn btn-danger btn-compact"
                              onClick={handleDeleteScan}
                            >
                              <Icon name="trash" />
                              <span>Hapus</span>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="surface-panel">
            <h2 className="section-heading">Riwayat Versi ({published.length})</h2>
            <ul className="timeline">
              {published.map((v) => {
                const ve = map.get(v.id);
                const selected = v.id === activeVersion.id;
                return (
                  <li
                    key={v.id}
                    className={`timeline-item${selected ? ' selected' : ''}`}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedVersionId(v.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedVersionId(v.id);
                      }
                    }}
                  >
                    <div className="timeline-top">
                      <strong className="tabular">Revisi {v.revisi_label} - {v.nomor}</strong>
                      <span className={`status-pill status-${ve.tone}`}>{ve.label}</span>
                    </div>
                    <div className="timeline-meta tabular">
                      Berlaku: {formatDateID(v.tgl_berlaku)} · Disetujui: {formatTimestamp(v.approved_at)}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: 'var(--text-sm)' }}>{v.ringkasan_perubahan}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div ref={stageTopRef}>
          <DocumentPreviewStage
            id="detail-preview-stage"
            ariaLabel="Pratinjau berkas PDF"
            stageLabel={detailPreviewMode === 'SCAN' ? 'Pratinjau PDF Hasil Scan' : 'Pratinjau Dokumen'}
            version={activeVersion}
            doc={doc}
            mode={detailPreviewMode}
            onModeChange={setVersionPreviewMode}
            canUploadScan={canUploadScanOnDetail}
            onUploadScan={handleUploadScan}
          />
        </div>
      </div>

      <div className="bottom-action-bar">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => window.location.assign(fileUrl(activeVersion, useScanPdf ? 'scan' : 'pdf', true))}
        >
          <Icon name="download" />
          <span>{detailPreviewMode === 'SCAN' && detailScanAtt ? 'Unduh PDF Hasil Scan' : 'Unduh PDF'}</span>
        </button>
        {canManage && doc.status_aktif === 'AKTIF' ? (
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleCreateRevision}>
            Buat Revisi
          </button>
        ) : null}
        {canManage ? (
          <button
            type="button"
            className={`btn ${doc.status_aktif === 'AKTIF' ? 'btn-danger' : 'btn-secondary'}`}
            disabled={saving}
            onClick={handleToggleStatus}
          >
            {doc.status_aktif === 'AKTIF' ? 'Nonaktifkan Dokumen' : 'Aktifkan Kembali'}
          </button>
        ) : null}
      </div>
    </>
  );
}
