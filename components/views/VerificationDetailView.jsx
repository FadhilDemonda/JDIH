'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { AnnotationList, DocumentPreviewStage } from '@/components/preview/DocumentPreviewStage';
import { Icon } from '@/components/ui/Icon';
import { fileUrl, versionPath } from '@/lib/api';
import {
  canVerifyUnit,
  getCategory,
  getCurrentUser,
  getScanPdfAttachment,
  getUnit,
  getUser,
  returnedAnnotations,
} from '@/lib/domain';
import { formatDateID, formatReviewActionLabel, formatTimestamp, getStatusBadge } from '@/lib/format';

export function VerificationDetailView({ versionId }) {
  const router = useRouter();
  const {
    state,
    saving,
    writeAction,
    openDialog,
    previewModeByVersion,
    setPreviewModeByVersion,
  } = useJdih();

  const user = getCurrentUser(state);
  const ver = state.versions.find((v) => v.id === versionId && v.status !== 'DIHAPUS');
  const doc = ver ? state.documents.find((d) => d.id === ver.document_id) : null;
  const authorized = Boolean(ver && ver.submitted_at && doc && canVerifyUnit(state, user, doc.unit_id));

  const [draftAnnotations, setDraftAnnotations] = useState([]);
  const [draftKey, setDraftKey] = useState('');

  useEffect(() => {
    if (!ver || !ver.submitted_at || !doc || !canVerifyUnit(state, user, doc.unit_id)) {
      router.replace('/403');
    }
  }, [ver, doc, state, user, router]);

  useEffect(() => {
    if (!ver || !user) return;
    const key = `${ver.id}:${ver.submitted_at}:${user.id}`;
    if (draftKey !== key) {
      setDraftAnnotations([]);
      setDraftKey(key);
    }
  }, [ver, user, draftKey]);

  const returnedList = useMemo(() => (ver ? returnedAnnotations(state, ver) : []), [state, ver]);

  if (!authorized || !ver || !doc) {
    return <p className="empty-state" role="status">Memuat detail verifikasi…</p>;
  }

  const unit = getUnit(state, doc.unit_id);
  const cat = getCategory(state, doc.category_id);
  const submitter = getUser(state, ver.created_by);
  const logs = state.reviewLogs.filter((l) => l.version_id === ver.id);
  const canDecide = ver.status === 'MENUNGGU_VERIFIKASI' && (user.is_super_admin || ver.created_by !== user.id);
  const canAnnotate = canDecide && ver.metode === 'TEMPLATE';
  const annotations = canAnnotate ? draftAnnotations : returnedList;

  const scanAtt = getScanPdfAttachment(ver);
  const chosenMode = previewModeByVersion[ver.id];
  const verifPreviewMode =
    chosenMode === 'CURRENT' || chosenMode === 'SCAN'
      ? chosenMode
      : ver.metode === 'UPLOAD' && scanAtt
        ? 'SCAN'
        : 'CURRENT';

  const statusBadge = getStatusBadge(ver.status);

  async function handleApprove() {
    const res = await openDialog({
      title: 'Setujui dan Terbitkan Dokumen',
      body: (
        <>
          <p>
            Dokumen <strong>{ver.judul}</strong> ({ver.nomor} · Rev {ver.revisi_label}) akan langsung diterbitkan dan dapat dibaca seluruh staf.
          </p>
          <p><strong>Mulai berlaku pada {formatDateID(ver.tgl_berlaku)}.</strong></p>
        </>
      ),
      confirmLabel: 'Ya, Setujui & Terbitkan',
    });
    if (!res) return;
    await writeAction(
      versionPath(ver.id, '/review'),
      'POST',
      { aksi: 'SETUJUI', submitted_at: ver.submitted_at },
      'Dokumen diterbitkan',
      () => {
        setDraftAnnotations([]);
        router.push(`/dokumen/${doc.id}`);
      }
    );
  }

  async function handleReturn() {
    const res = await openDialog({
      title: 'Kembalikan Pengajuan',
      body: (
        <p>
          Pengajuan akan dikembalikan ke <strong>{submitter?.nama || 'Koordinator/SPV'}</strong> untuk diperbaiki tanpa membuat versi baru.
        </p>
      ),
      confirmLabel: 'Kembalikan Pengajuan',
      confirmTone: 'danger',
      requireNote: true,
      noteOptional: annotations.length > 0,
      noteLabel: 'Catatan perbaikan untuk Koordinator/SPV',
      notePlaceholder: 'Tuliskan bagian yang harus dilengkapi atau diperbaiki...',
    });
    if (!res) return;
    await writeAction(
      versionPath(ver.id, '/review'),
      'POST',
      { aksi: 'KEMBALIKAN', catatan: res.note, annotations, submitted_at: ver.submitted_at },
      'Pengajuan dikembalikan ke Koordinator/SPV.',
      () => {
        setDraftAnnotations([]);
        router.push('/verifikasi');
      }
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/verifikasi" className="btn btn-ghost btn-compact back-link">
            <Icon name="arrowLeft" />
            <span>Kembali ke Antrean Verifikasi</span>
          </Link>
          <h1 className="page-title">{ver.judul}</h1>
          <p className="page-subtitle tabular">
            {ver.nomor} · {unit ? unit.nama : '-'} · Diajukan {formatTimestamp(ver.submitted_at)} oleh {submitter?.nama || '-'}
          </p>
        </div>
      </div>

      <div className="workbench-grid">
        <div>
          <section className="surface-panel">
            <h2 className="section-heading">Ringkasan Pengajuan</h2>
            <dl className="meta-dl">
              <div>
                <dt>Status Saat Ini</dt>
                <dd><span className={`status-pill status-${statusBadge.tone}`}>{statusBadge.label}</span></dd>
              </div>
              <div><dt>Jenis Dokumen</dt><dd>{cat ? cat.label : '-'}</dd></div>
              <div><dt>Label Revisi</dt><dd className="tabular">Rev {ver.revisi_label}</dd></div>
              <div><dt>Tanggal Mulai Berlaku</dt><dd className="tabular">{formatDateID(ver.tgl_berlaku)}</dd></div>
              <div><dt>Metode Penyusunan</dt><dd>{ver.metode === 'TEMPLATE' ? 'Template Sistem' : 'Upload PDF'}</dd></div>
              <div><dt>Kata Kunci</dt><dd>{ver.kata_kunci || '-'}</dd></div>
            </dl>
            <div className="panel-divider">
              <div className="meta-label-sm">Ringkasan Perubahan</div>
              <div style={{ marginTop: '4px' }}>{ver.ringkasan_perubahan || '-'}</div>
            </div>
          </section>

          <section className="surface-panel">
            <h2 className="section-heading">Jejak Pengajuan &amp; Keputusan</h2>
            <ul className="timeline">
              {logs.length ? (
                logs.map((l) => (
                  <li key={l.id} className="timeline-item" style={{ cursor: 'default' }}>
                    <div className="timeline-top">
                      <strong>{formatReviewActionLabel(l.aksi)} - {getUser(state, l.user_id)?.nama || '-'}</strong>
                      <span className="timeline-meta tabular">{formatTimestamp(l.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)' }}>{l.catatan}</div>
                    <AnnotationList annotations={l.annotations || []} />
                  </li>
                ))
              ) : (
                <li className="timeline-item" style={{ cursor: 'default' }}>Belum ada riwayat keputusan.</li>
              )}
            </ul>
          </section>
        </div>

        <DocumentPreviewStage
          id="review-preview-stage"
          ariaLabel="Pemeriksaan berkas dokumen"
          stageLabel={verifPreviewMode === 'SCAN' ? 'Pemeriksaan PDF Hasil Scan' : 'Pemeriksaan Berkas Dokumen'}
          version={ver}
          doc={doc}
          mode={verifPreviewMode}
          onModeChange={(nextMode) => setPreviewModeByVersion((prev) => ({ ...prev, [ver.id]: nextMode }))}
          annotations={annotations}
          canAnnotate={canAnnotate}
          onChangeAnnotations={setDraftAnnotations}
          footer={
            ver.attachments?.length ? (
              <ul className="file-pickers">
                {ver.attachments.map((file) => (
                  <li key={file.id || file.nama}>
                    {file.id ? <a href={fileUrl(ver, file.id, true)}>{file.nama}</a> : file.nama}
                  </li>
                ))}
              </ul>
            ) : null
          }
        />
      </div>

      {canDecide ? (
        <div className="bottom-action-bar">
          <button type="button" className="btn btn-danger" disabled={saving} onClick={handleReturn}>
            Kembalikan dengan Catatan
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleApprove}>
            Setujui &amp; Terbitkan
          </button>
        </div>
      ) : null}
    </>
  );
}
