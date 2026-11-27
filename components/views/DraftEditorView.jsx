'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { DocumentPreviewStage } from '@/components/preview/DocumentPreviewStage';
import { Icon } from '@/components/ui/Icon';
import { api, fileUrl, uploadChunkedFile, versionPath } from '@/lib/api';
import {
  canEditUnit,
  checkNumberConflict,
  draftInput,
  getCategory,
  getCurrentUser,
  getScanPdfAttachment,
  getUnit,
  getUser,
  returnedAnnotations,
} from '@/lib/domain';
import { formatTimestamp, getStatusBadge } from '@/lib/format';

export function DraftEditorView({ versionId }) {
  const router = useRouter();
  const {
    state,
    saving,
    dirtyDraft,
    setDirtyDraft,
    setSnapshot,
    writeAction,
    showToast,
    openDialog,
    uploadState,
    setUploadState,
    previewModeByVersion,
    setPreviewModeByVersion,
  } = useJdih();

  const user = getCurrentUser(state);
  const ver = state.versions.find((v) => v.id === versionId && v.status !== 'DIHAPUS');
  const doc = ver ? state.documents.find((d) => d.id === ver.document_id) : null;
  const authorized = Boolean(ver && ver.status !== 'DISETUJUI' && doc && canEditUnit(state, user, doc.unit_id));

  const [draft, setDraft] = useState(() => (ver ? structuredClone(ver) : null));
  const [previewDraft, setPreviewDraft] = useState(() => (ver ? structuredClone(ver) : null));
  const [errors, setErrors] = useState({ judul: '', nomor: '', ringkasan: '', upload: '' });
  const previewTimerRef = useRef(null);
  const lastSyncRef = useRef('');

  useEffect(() => {
    if (!ver || ver.status === 'DISETUJUI' || !doc || !canEditUnit(state, user, doc.unit_id)) {
      router.replace('/403');
    }
  }, [ver, doc, state, user, router]);

  useEffect(() => {
    if (!ver) return;
    const syncKey = `${ver.id}:${ver.edit_version}:${ver.status}:${(ver.attachments || []).length}`;
    if (lastSyncRef.current === syncKey) return;
    if (!dirtyDraft || lastSyncRef.current.split(':')[0] !== ver.id) {
      const cloned = structuredClone(ver);
      setDraft(cloned);
      setPreviewDraft(cloned);
    } else {
      setDraft((prev) => (prev ? { ...prev, attachments: ver.attachments, status: ver.status } : structuredClone(ver)));
    }
    lastSyncRef.current = syncKey;
  }, [ver, dirtyDraft]);

  useEffect(() => {
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      setPreviewDraft(draft);
    }, 120);
    return () => clearTimeout(previewTimerRef.current);
  }, [draft]);

  const annotations = useMemo(() => (ver ? returnedAnnotations(state, ver) : []), [state, ver]);

  if (!authorized || !draft || !previewDraft || !doc) {
    return <p className="empty-state" role="status">Memuat editor draf…</p>;
  }

  const unit = getUnit(state, doc.unit_id);
  const cat = getCategory(state, doc.category_id);
  const isLocked = !['DRAF', 'DIKEMBALIKAN'].includes(ver.status);
  const isRevision = state.versions.some((v) => v.document_id === doc.id && v.status === 'DISETUJUI');
  const submitter = getUser(state, ver.created_by);
  const conflictInfo = checkNumberConflict(state, draft.nomor, doc.id);
  const scanAtt = getScanPdfAttachment(ver);

  const chosenMode = previewModeByVersion[ver.id];
  const previewMode =
    chosenMode === 'CURRENT' || chosenMode === 'SCAN'
      ? chosenMode
      : ver.metode === 'UPLOAD' && scanAtt
        ? 'SCAN'
        : 'CURRENT';

  function setMode(nextMode) {
    setPreviewModeByVersion((prev) => ({ ...prev, [ver.id]: nextMode }));
  }

  function updateMeta(key, value) {
    setDirtyDraft(true);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateSection(code, value) {
    setDirtyDraft(true);
    setDraft((prev) => ({ ...prev, sections: { ...(prev.sections || {}), [code]: value } }));
  }

  function updateListItem(code, idx, value) {
    setDirtyDraft(true);
    setDraft((prev) => {
      const curr = Array.isArray(prev.sections?.[code]) ? [...prev.sections[code]] : [''];
      curr[idx] = value;
      return { ...prev, sections: { ...(prev.sections || {}), [code]: curr } };
    });
  }

  function mutateList(code, act, idx) {
    setDirtyDraft(true);
    setDraft((prev) => {
      const curr = Array.isArray(prev.sections?.[code]) ? [...prev.sections[code]] : [''];
      if (act === 'add') curr.push('');
      if (act === 'del' && curr.length > 1) curr.splice(idx, 1);
      if (act === 'up' && idx > 0) [curr[idx - 1], curr[idx]] = [curr[idx], curr[idx - 1]];
      if (act === 'down' && idx < curr.length - 1) [curr[idx + 1], curr[idx]] = [curr[idx], curr[idx + 1]];
      return { ...prev, sections: { ...(prev.sections || {}), [code]: curr } };
    });
  }

  async function handleFileUpload(file, kind) {
    if (saving || !file) return;
    if (kind === 'PDF') {
      if (!/\.pdf$/i.test(file.name)) {
        setErrors((prev) => ({ ...prev, upload: 'Berkas utama harus PDF' }));
        showToast('Berkas utama harus PDF', 'error');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, upload: 'Ukuran melebihi batas 20 MB' }));
        showToast('Ukuran berkas maksimal 20 MB.', 'error');
        return;
      }
      setErrors((prev) => ({ ...prev, upload: '' }));
    }
    setUploadState({ status: 'UPLOADING', fileName: file.name, progress: 0 });
    try {
      const merged = await uploadChunkedFile({
        version: draft,
        file,
        kind,
        onProgress: (progress) => setUploadState((prev) => ({ ...prev, progress })),
        onState: setSnapshot,
      });
      if (merged) {
        setDraft((prev) => ({ ...prev, attachments: merged.attachments }));
        if (kind === 'PDF') setMode('SCAN');
      }
      showToast('Berkas tersimpan.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploadState({ status: 'IDLE', fileName: '', progress: 0 });
    }
  }

  async function handleDeleteScan() {
    if (!scanAtt || saving) return;
    const res = await openDialog({
      title: 'Hapus Berkas PDF',
      body: (
        <p>
          Berkas <strong>{scanAtt.nama}</strong> akan dihapus dari versi dokumen ini. Lanjutkan?
        </p>
      ),
      confirmLabel: 'Ya, Hapus PDF',
      confirmTone: 'danger',
    });
    if (!res) return;
    try {
      const localDraft = draftInput(draft);
      const result = await api(versionPath(ver.id, '/files/scan'), 'DELETE', undefined, { snapshot: false });
      const fresh = result.version || await api(versionPath(ver.id));
      const merged = { ...fresh, ...localDraft };
      setSnapshot((prev) => ({
        ...prev,
        versions: prev.versions.map((item) => (item.id === ver.id ? merged : item)),
      }));
      setDraft(merged);
      setMode('CURRENT');
      showToast('Berkas PDF dihapus.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function handleSaveDraft() {
    writeAction(versionPath(ver.id), 'PATCH', draftInput(draft), 'Draf tersimpan', ({ numberConflict, version }) => {
      setDirtyDraft(false);
      if (version) {
        setDraft(structuredClone(version));
        setPreviewDraft(structuredClone(version));
      }
      if (numberConflict) showToast('Nomor sudah dipakai dokumen lain.', 'error');
    });
  }

  async function handleSubmit() {
    let valid = true;
    const nextErr = { judul: '', nomor: '', ringkasan: '', upload: '' };

    if (!draft.judul.trim()) {
      nextErr.judul = 'Judul wajib diisi';
      valid = false;
    }
    const c = checkNumberConflict(state, draft.nomor, doc.id);
    if (!draft.nomor.trim()) {
      nextErr.nomor = 'Nomor wajib diisi';
      valid = false;
    } else if (c && !c.sameDoc && ['MENUNGGU_VERIFIKASI', 'DISETUJUI'].includes(c.conflict.status)) {
      nextErr.nomor = `Nomor sudah dipakai oleh ${c.conflict.judul}`;
      valid = false;
    }
    if (isRevision && !draft.ringkasan_perubahan.trim()) {
      nextErr.ringkasan = 'Ringkasan perubahan wajib diisi untuk revisi';
      valid = false;
    }
    setErrors(nextErr);

    if (!user.is_super_admin && !unit?.has_manager) {
      showToast('Manajer unit belum diseting, harap hubungi tim DTO.', 'error');
      return;
    }
    if (ver.metode === 'UPLOAD' && !ver.attachments?.some((file) => file.kind === 'PDF')) {
      showToast('Berkas PDF belum tersedia', 'error');
      return;
    }
    if (!valid) {
      showToast('Periksa kembali isian yang ditandai merah.', 'error');
      return;
    }

    const res = await openDialog({
      title: 'Ajukan Dokumen untuk Verifikasi',
      body: <p>Isi pengajuan terkunci selama verifikasi. Lanjutkan?</p>,
      confirmLabel: 'Ya, Ajukan',
    });
    if (!res) return;

    await writeAction(
      versionPath(ver.id, '/submit'),
      'POST',
      draftInput(draft),
      'Pengajuan terkirim. Status: Menunggu verifikasi.',
      () => setDirtyDraft(false)
    );
  }

  async function handleWithdraw() {
    const res = await openDialog({
      title: 'Tarik Pengajuan',
      body: (
        <p>
          Pengajuan <strong>{ver.judul}</strong> akan kembali ke status Draf dan dapat diedit ulang.
        </p>
      ),
      confirmLabel: 'Tarik Pengajuan',
    });
    if (!res) return;
    await writeAction(versionPath(ver.id, '/withdraw'), 'POST', {}, 'Pengajuan ditarik.');
  }

  const secEntries = ver.template_sections || cat?.sections || [];
  const otherFiles = (ver.attachments || []).filter((file) => file.kind !== 'PDF');
  const nomorError = errors.nomor || (conflictInfo && !conflictInfo.sameDoc ? `Nomor sudah dipakai oleh ${conflictInfo.conflict.judul}` : '');

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/pengajuan" className="btn btn-ghost btn-compact back-link">
            <Icon name="arrowLeft" />
            <span>Kembali ke Pengajuan Unit</span>
          </Link>
          <h1 className="page-title">{draft.judul || 'Draf Dokumen Baru'}</h1>
          <p className="page-subtitle">
            {unit ? unit.nama : '-'} · {cat ? cat.label : '-'} · Metode {ver.metode === 'TEMPLATE' ? 'Template' : 'Upload'}
          </p>
        </div>
      </div>

      {isLocked ? (
        <div className="notice-banner" role="status">
          <div>
            <strong>{getStatusBadge(ver.status).label}</strong>
            <p>
              Diajukan pada {formatTimestamp(ver.submitted_at)} oleh {submitter?.nama || '-'}. Isi dokumen terkunci selama diperiksa.
            </p>
          </div>
        </div>
      ) : null}

      {ver.status === 'DIKEMBALIKAN' && ver.return_note ? (
        <div className="notice-banner danger" role="status">
          <div>
            <strong>Dikembalikan oleh Manajer untuk perbaikan</strong>
            <p>{ver.return_note}</p>
          </div>
        </div>
      ) : null}

      <div className="workbench-grid">
        <div>
          <section className="surface-panel">
            <h2 className="section-heading">Metadata Dokumen</h2>
            <div className="field-grid">
              <div className="field col-12">
                <label htmlFor="meta-judul">Judul Dokumen <span className="req-mark">*</span></label>
                <input
                  id="meta-judul"
                  className={`input${errors.judul ? ' is-invalid' : ''}`}
                  value={draft.judul}
                  disabled={isLocked}
                  placeholder="Masukkan judul resmi regulasi"
                  aria-invalid={errors.judul ? 'true' : undefined}
                  aria-describedby={errors.judul ? 'err-judul' : undefined}
                  onChange={(e) => {
                    updateMeta('judul', e.target.value);
                    if (errors.judul) setErrors((prev) => ({ ...prev, judul: '' }));
                  }}
                />
                <p id="err-judul" className="field-error" role="alert" hidden={!errors.judul}>{errors.judul}</p>
              </div>

              <div className="field col-8">
                <label htmlFor="meta-nomor">Nomor Dokumen (Manual) <span className="req-mark">*</span></label>
                <input
                  id="meta-nomor"
                  className={`input tabular${nomorError ? ' is-invalid' : ''}`}
                  value={draft.nomor}
                  disabled={isLocked}
                  placeholder={cat?.contoh_nomor || ''}
                  aria-invalid={nomorError ? 'true' : undefined}
                  aria-describedby={nomorError ? 'err-nomor' : undefined}
                  onChange={(e) => {
                    updateMeta('nomor', e.target.value);
                    if (errors.nomor) setErrors((prev) => ({ ...prev, nomor: '' }));
                  }}
                />
                <p className="field-help">
                  Contoh nomor {cat?.label}: <strong className="tabular">{cat?.contoh_nomor}</strong>
                </p>
                <p id="err-nomor" className="field-error" role="alert" hidden={!nomorError && !conflictInfo?.sameDoc}>
                  {nomorError || (conflictInfo?.sameDoc ? 'Nomor sudah dipakai versi terbit dokumen ini.' : '')}
                </p>
              </div>

              <div className="field col-4">
                <label htmlFor="meta-revisi">Label Revisi <span className="req-mark">*</span></label>
                <input
                  id="meta-revisi"
                  className="input tabular"
                  value={draft.revisi_label}
                  disabled={isLocked}
                  placeholder="00"
                  onChange={(e) => updateMeta('revisi_label', e.target.value)}
                />
              </div>

              <div className="field col-6">
                <label htmlFor="meta-tgl-dok">Tanggal Dokumen <span className="req-mark">*</span></label>
                <input
                  id="meta-tgl-dok"
                  className="input tabular"
                  type="date"
                  value={draft.tgl_dokumen}
                  disabled={isLocked}
                  onChange={(e) => updateMeta('tgl_dokumen', e.target.value)}
                />
              </div>

              <div className="field col-6">
                <label htmlFor="meta-tgl-berlaku">Tanggal Mulai Berlaku <span className="req-mark">*</span></label>
                <input
                  id="meta-tgl-berlaku"
                  className="input tabular"
                  type="date"
                  value={draft.tgl_berlaku}
                  disabled={isLocked}
                  onChange={(e) => updateMeta('tgl_berlaku', e.target.value)}
                />
              </div>

              <div className="field col-12">
                <label htmlFor="meta-keywords">Kata Kunci Pencarian (opsional, pisah koma)</label>
                <input
                  id="meta-keywords"
                  className="input"
                  value={draft.kata_kunci}
                  disabled={isLocked}
                  placeholder="triase, gawat darurat, igd"
                  onChange={(e) => updateMeta('kata_kunci', e.target.value)}
                />
              </div>

              <div className="field col-12">
                <label htmlFor="meta-ringkasan">
                  Ringkasan Perubahan {isRevision ? <span className="req-mark">*</span> : '(opsional)'}
                </label>
                <textarea
                  id="meta-ringkasan"
                  className={`textarea${errors.ringkasan ? ' is-invalid' : ''}`}
                  value={draft.ringkasan_perubahan}
                  disabled={isLocked}
                  placeholder="Jelaskan ringkas perubahan dari versi sebelumnya"
                  aria-invalid={errors.ringkasan ? 'true' : undefined}
                  aria-describedby={errors.ringkasan ? 'err-ringkasan' : undefined}
                  onChange={(e) => {
                    updateMeta('ringkasan_perubahan', e.target.value);
                    if (errors.ringkasan) setErrors((prev) => ({ ...prev, ringkasan: '' }));
                  }}
                />
                <p id="err-ringkasan" className="field-error" role="alert" hidden={!errors.ringkasan}>
                  {errors.ringkasan}
                </p>
              </div>
            </div>
          </section>

          <section className="surface-panel">
            {ver.metode === 'TEMPLATE' ? (
              <>
                <h2 className="section-heading">Isian Editor Template ({cat?.label})</h2>
                <div className="field-grid">
                  {secEntries.map((s) => {
                    if (s.type === 'list') {
                      const arr = Array.isArray(draft.sections?.[s.code]) && draft.sections[s.code].length
                        ? draft.sections[s.code]
                        : [''];
                      return (
                        <div key={s.code} className="field col-12">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <label>{s.label}</label>
                            {!isLocked ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => mutateList(s.code, 'add', 0)}
                              >
                                <Icon name="plus" />
                                <span>Tambah Butir</span>
                              </button>
                            ) : null}
                          </div>
                          <div className="sortable-list">
                            {arr.map((item, idx) => (
                              <div key={idx} className="sortable-row">
                                <span className="sortable-num">{idx + 1}.</span>
                                <textarea
                                  className="textarea"
                                  aria-label={`${s.label} butir ${idx + 1}`}
                                  disabled={isLocked}
                                  value={item}
                                  onChange={(e) => updateListItem(s.code, idx, e.target.value)}
                                />
                                {!isLocked ? (
                                  <div className="sortable-actions">
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      aria-label="Pindah ke atas"
                                      disabled={idx === 0}
                                      onClick={() => mutateList(s.code, 'up', idx)}
                                    >
                                      <Icon name="up" />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      aria-label="Pindah ke bawah"
                                      disabled={idx === arr.length - 1}
                                      onClick={() => mutateList(s.code, 'down', idx)}
                                    >
                                      <Icon name="down" />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      aria-label="Hapus butir"
                                      disabled={arr.length <= 1}
                                      onClick={() => mutateList(s.code, 'del', idx)}
                                    >
                                      <Icon name="trash" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    if (s.type === 'text') {
                      return (
                        <div key={s.code} className="field col-12">
                          <label htmlFor={`sec-${s.code}`}>{s.label}</label>
                          <input
                            id={`sec-${s.code}`}
                            className="input"
                            value={draft.sections?.[s.code] || ''}
                            disabled={isLocked}
                            onChange={(e) => updateSection(s.code, e.target.value)}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={s.code} className="field col-12">
                        <label htmlFor={`sec-${s.code}`}>{s.label}</label>
                        <textarea
                          id={`sec-${s.code}`}
                          className="textarea"
                          value={draft.sections?.[s.code] || ''}
                          disabled={isLocked}
                          onChange={(e) => updateSection(s.code, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>

                {!isLocked || scanAtt ? (
                  <div className="scan-upload-box">
                    <div className="scan-upload-head">
                      <div>
                        <strong>PDF Hasil Scan (Opsional)</strong>
                        <p className="field-help">Unggah PDF hasil scan bertanda tangan untuk opsi pratinjau PDF Hasil Scan.</p>
                      </div>
                      {!isLocked ? (
                        <label className="btn btn-secondary btn-compact">
                          <Icon name="upload" />
                          <span>{scanAtt ? 'Ganti PDF Scan' : 'Unggah PDF Scan'}</span>
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            className="file-picker"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, 'PDF');
                              e.target.value = '';
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                    {scanAtt ? (
                      <div className="upload-file-row">
                        <span>
                          {scanAtt.id ? <a href={fileUrl(ver, scanAtt.id, true)}>{scanAtt.nama}</a> : scanAtt.nama}{' '}
                          <span className="tabular meta-label-sm">({scanAtt.ukuran})</span>
                        </span>
                        <div className="upload-file-actions">
                          <button type="button" className="btn btn-secondary btn-compact" onClick={() => setMode('SCAN')}>
                            Pratinjau PDF
                          </button>
                          <a
                            href={`${fileUrl(ver, 'scan')}?v=${encodeURIComponent(scanAtt.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-compact"
                          >
                            Buka Tab Baru
                          </a>
                          {!isLocked ? (
                            <button type="button" className="btn btn-danger btn-compact" onClick={handleDeleteScan}>
                              <Icon name="trash" />
                              <span>Hapus</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <h2 className="section-heading">Unggah berkas PDF</h2>
                <div className={`upload-zone${uploadState.status === 'UPLOADING' ? ' active' : ''}`}>
                  <p style={{ margin: '0 0 10px' }}>
                    Berkas utama wajib berformat <strong>PDF</strong> (maksimal 20 MB). Berkas sumber DOCX dan lampiran opsional.
                  </p>
                  {!isLocked ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
                      <label className="btn btn-secondary">
                        <Icon name="upload" />
                        <span>Pilih Berkas PDF</span>
                        <input
                          id="pdf-upload-input"
                          type="file"
                          accept=".pdf,application/pdf"
                          className="file-picker"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, 'PDF');
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                  <p id="err-upload" className="field-error" role="alert" hidden={!errors.upload} style={{ marginTop: '8px' }}>
                    {errors.upload}
                  </p>
                  {uploadState.status === 'UPLOADING' ? (
                    <>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${uploadState.progress}%` }} />
                      </div>
                      <p className="field-help tabular" style={{ marginTop: '6px' }}>
                        Mengunggah {uploadState.fileName} ({uploadState.progress}%)
                      </p>
                    </>
                  ) : null}
                  {scanAtt ? (
                    <div className="upload-file-row">
                      <span style={{ fontWeight: 600 }}>
                        {scanAtt.id ? <a href={fileUrl(ver, scanAtt.id, true)}>{scanAtt.nama}</a> : scanAtt.nama}{' '}
                        <span className="tabular meta-label-sm" style={{ fontWeight: 400 }}>({scanAtt.ukuran})</span>
                      </span>
                      <div className="upload-file-actions">
                        <button type="button" className="btn btn-secondary btn-compact" onClick={() => setMode('SCAN')}>
                          Pratinjau PDF
                        </button>
                        <a
                          href={`${fileUrl(ver, 'scan')}?v=${encodeURIComponent(scanAtt.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-compact"
                        >
                          Buka Tab Baru
                        </a>
                        {!isLocked ? (
                          <button type="button" className="btn btn-danger btn-compact" onClick={handleDeleteScan}>
                            <Icon name="trash" />
                            <span>Hapus</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {!isLocked ? (
              <div className="file-pickers">
                {ver.metode === 'UPLOAD' ? (
                  <label className="btn btn-secondary">
                    Pilih DOCX sumber
                    <input
                      type="file"
                      accept=".docx"
                      className="file-picker"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'SUMBER');
                        e.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
                <label className="btn btn-secondary">
                  Pilih lampiran
                  <input
                    type="file"
                    accept=".pdf,.docx,.png,.jpg,.jpeg"
                    className="file-picker"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'LAMPIRAN');
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            ) : null}

            {otherFiles.length ? (
              <ul>
                {otherFiles.map((file) => (
                  <li key={file.id || file.nama}>
                    {file.id ? <a href={fileUrl(ver, file.id, true)}>{file.nama}</a> : file.nama} ({file.ukuran})
                  </li>
                ))}
              </ul>
            ) : null}

            {uploadState.status === 'UPLOADING' && ver.metode === 'TEMPLATE' ? (
              <div className="upload-zone" role="status" style={{ marginTop: '12px' }}>
                <p>Mengunggah {uploadState.fileName} ({uploadState.progress}%)</p>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${uploadState.progress}%` }} />
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <DocumentPreviewStage
          id="edit-preview-stage"
          ariaLabel="Pratinjau langsung dokumen PDF A4"
          stageLabel={
            previewMode === 'SCAN'
              ? 'Pratinjau PDF Hasil Scan'
              : ver.metode === 'TEMPLATE'
                ? `Pratinjau Dokumen (Template v${ver.template_version})`
                : 'Pratinjau Ringkasan Dokumen'
          }
          version={{ ...previewDraft, attachments: ver.attachments }}
          doc={doc}
          mode={previewMode}
          onModeChange={setMode}
          canUploadScan={!isLocked}
          onUploadScan={(file) => handleFileUpload(file, 'PDF')}
          annotations={annotations}
          showReturnedDetails
        />
      </div>

      <div className="bottom-action-bar">
        {isLocked ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={handleWithdraw}>
              Tarik Pengajuan
            </button>
            {user.is_super_admin ? (
              <Link href={`/verifikasi/${ver.id}`} className="btn btn-primary">
                Verifikasi &amp; Setujui
              </Link>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={handleSaveDraft}>
              Simpan Draf
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSubmit}>
              Ajukan ke Manajer
            </button>
          </>
        )}
      </div>
    </>
  );
}
