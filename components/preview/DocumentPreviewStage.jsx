'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useJdih } from '@/components/providers/JdihProvider';
import { Icon } from '@/components/ui/Icon';
import { fileUrl } from '@/lib/api';
import { getScanPdfAttachment } from '@/lib/domain';
import { A4Sheet } from './A4Sheet';

function annotationTarget(element) {
  return {
    field: element.dataset.reviewField,
    index: element.dataset.reviewIndex === '' ? null : Number(element.dataset.reviewIndex),
  };
}

function readAnnotationSelection(previewEl) {
  if (!previewEl) return null;
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const findSpan = (node) => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('[data-review-field]');
  const element = findSpan(range.startContainer);
  if (!element || !previewEl.contains(element) || findSpan(range.endContainer) !== element) return null;
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const quote = range.toString();
  const start = before.toString().length;
  return quote.trim() ? { ...annotationTarget(element), start, end: start + quote.length, quote } : null;
}

export function AnnotationList({ annotations, jump = false, editable = false, onJump, onEdit, onRemove }) {
  if (!annotations?.length) return null;
  return (
    <ol className="review-notes">
      {annotations.map((item, index) => (
        <li key={`${item.field}-${item.index ?? 'x'}-${index}`}>
          <blockquote>{item.quote}</blockquote>
          <p>{item.note}</p>
          {jump || editable ? (
            <div className="review-note-actions">
              {jump ? (
                <button type="button" className="btn btn-ghost btn-compact" onClick={() => onJump?.(index)}>
                  Lihat sorotan
                </button>
              ) : null}
              {editable ? (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    data-edit-note={index}
                    onClick={() => onEdit?.(index)}
                  >
                    Edit catatan
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    data-remove-note={index}
                    onClick={() => onRemove?.(index)}
                  >
                    Hapus catatan
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function DocumentPreviewStage({
  id,
  ariaLabel = 'Pratinjau dokumen',
  stageLabel,
  version,
  doc,
  mode,
  onModeChange,
  canUploadScan = false,
  onUploadScan,
  annotations = [],
  showReturnedDetails = false,
  canAnnotate = false,
  onChangeAnnotations,
  footer = null,
}) {
  const { showToast, openDialog } = useJdih();
  const stageRef = useRef(null);
  const previewRef = useRef(null);
  const pencilRef = useRef(null);
  const [armed, setArmed] = useState(false);
  const draggingRef = useRef(false);
  const timerRef = useRef(null);
  const recentSelectionRef = useRef(null);

  const scanAtt = getScanPdfAttachment(version);
  const scanUrl = scanAtt?.id ? `${fileUrl(version, 'scan')}?v=${encodeURIComponent(scanAtt.id)}` : null;

  const jumpToMark = useCallback((index) => {
    const mark = stageRef.current?.querySelector(`[data-review-marks~="${index}"]`);
    if (!mark) {
      showToast('Kutipan ini sudah berubah. Catatan aslinya tetap tersedia.', 'error');
      return;
    }
    mark.tabIndex = -1;
    mark.focus({ preventScroll: true });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    mark.scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : 'smooth' });
  }, [showToast]);

  const openNoteModal = useCallback(async (selection, editIndex = null) => {
    const editing = editIndex !== null;
    if (!editing && annotations.length >= 20) {
      showToast('Maksimal 20 catatan sorotan.', 'error');
      return;
    }
    if (selection?.quote?.length > 350) {
      showToast('Pilih teks maksimal 350 karakter.', 'error');
      return;
    }
    setArmed(false);
    recentSelectionRef.current = null;
    window.getSelection()?.removeAllRanges();

    const parts = [...(previewRef.current?.querySelectorAll('[data-review-field]') || [])]
      .filter((node) => node.textContent.trim());

    const partOptions = parts.map((node, i) => {
      const heading = node.closest('.a4-section')?.querySelector('h4')?.textContent
        || node.closest('[data-section-label]')?.dataset.sectionLabel;
      const text = node.textContent.trim();
      return {
        index: i,
        label: `${heading ? `${heading} · ` : ''}${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`,
      };
    });

    let selectedPartIdx = '0';
    const res = await openDialog({
      title: editing ? 'Edit Catatan' : 'Catatan pada Pratinjau',
      body: selection ? (
        <blockquote className="review-quote">{selection.quote}</blockquote>
      ) : (
        <div className="field">
          <label htmlFor="annotation-part">Bagian yang ditandai</label>
          <select
            className="input"
            id="annotation-part"
            defaultValue="0"
            onChange={(e) => { selectedPartIdx = e.target.value; }}
          >
            {partOptions.map((opt) => (
              <option key={opt.index} value={String(opt.index)}>{opt.label}</option>
            ))}
          </select>
        </div>
      ),
      confirmLabel: editing ? 'Simpan Catatan' : 'Tambah Catatan',
      requireNote: true,
      noteMaxLength: 500,
      noteValue: editing ? selection.note : '',
    });

    if (editing) {
      if (res) {
        const next = annotations.map((item, idx) => (idx === editIndex ? { ...item, note: res.note } : item));
        onChangeAnnotations?.(next);
        showToast('Catatan diperbarui.');
      }
      stageRef.current?.querySelector(`[data-edit-note="${editIndex}"]`)?.focus({ preventScroll: true });
      return;
    }

    pencilRef.current?.focus({ preventScroll: true });
    if (!res) return;

    const chosen = parts[Number(selectedPartIdx)];
    const target = selection || (chosen && {
      ...annotationTarget(chosen),
      start: 0,
      end: Math.min(chosen.textContent.length, 350),
      quote: chosen.textContent.slice(0, 350),
    });
    if (!target?.quote?.trim()) {
      showToast('Pilih bagian yang ingin diberi catatan.', 'error');
      return;
    }
    onChangeAnnotations?.([...annotations, { ...target, note: res.note }]);
    showToast('Catatan ditambahkan.');
  }, [annotations, onChangeAnnotations, openDialog, showToast]);

  useEffect(() => {
    if (!canAnnotate || mode !== 'CURRENT') {
      setArmed(false);
      return undefined;
    }

    const finishSelection = () => {
      clearTimeout(timerRef.current);
      const dialogOpen = document.getElementById('confirm-dialog')?.open;
      if (!armed || draggingRef.current || dialogOpen) return;
      const selection = readAnnotationSelection(previewRef.current);
      if (selection) openNoteModal(selection);
    };

    const onPointerDown = (event) => {
      clearTimeout(timerRef.current);
      draggingRef.current = event.pointerType !== 'touch' && Boolean(previewRef.current?.contains(event.target));
      if (pencilRef.current && event.target !== pencilRef.current && !pencilRef.current.contains(event.target)) {
        recentSelectionRef.current = null;
      }
    };
    const onPointerUp = (event) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (event.button === 0) finishSelection();
    };
    const onPointerCancel = () => { draggingRef.current = false; };
    const onSelectionChange = () => {
      const selection = readAnnotationSelection(previewRef.current);
      clearTimeout(timerRef.current);
      if (!selection) return;
      recentSelectionRef.current = selection;
      if (armed && !draggingRef.current) {
        timerRef.current = setTimeout(finishSelection, 300);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && armed) setArmed(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [armed, canAnnotate, mode, openNoteModal]);

  const showAnnotationToolbar = canAnnotate && mode === 'CURRENT';

  return (
    <section ref={stageRef} id={id} className="pdf-stage" aria-label={ariaLabel}>
      <div className="pdf-stage-bar">
        <span>{stageLabel}</span>
        <div className="segmented preview-mode-toggle" role="group" aria-label="Pilih mode pratinjau dokumen">
          <button
            type="button"
            className={mode === 'CURRENT' ? 'active' : ''}
            aria-pressed={mode === 'CURRENT'}
            onClick={() => onModeChange('CURRENT')}
          >
            Pratinjau Dokumen
          </button>
          <button
            type="button"
            className={mode === 'SCAN' ? 'active' : ''}
            aria-pressed={mode === 'SCAN'}
            onClick={() => onModeChange('SCAN')}
          >
            PDF Hasil Scan{scanAtt ? ' (Ada)' : ''}
          </button>
        </div>
      </div>

      {showReturnedDetails && annotations.length > 0 ? (
        <details className="review-annotation-panel" open>
          <summary>{annotations.length} catatan pada pratinjau</summary>
          <AnnotationList annotations={annotations} jump onJump={jumpToMark} />
        </details>
      ) : null}

      {showAnnotationToolbar ? (
        <div className="review-annotation-panel">
          <div className="review-annotation-toolbar">
            <p className="field-help" id="review-annotation-help" role="status">
              {armed ? 'Blok teks di pratinjau untuk membuka form catatan.' : 'Klik pensil, lalu blok teks di pratinjau.'}
            </p>
            <button
              ref={pencilRef}
              type="button"
              className="icon-btn"
              id="add-review-annotation"
              aria-label="Tambah catatan pada teks"
              aria-pressed={armed}
              title="Tambah catatan pada teks"
              aria-describedby="review-annotation-help"
              onClick={() => {
                if (armed) {
                  setArmed(false);
                  return;
                }
                if (annotations.length >= 20) {
                  showToast('Maksimal 20 catatan sorotan.', 'error');
                  return;
                }
                const sel = readAnnotationSelection(previewRef.current) || recentSelectionRef.current;
                if (sel && sel.quote.length <= 350) {
                  openNoteModal(sel);
                  return;
                }
                setArmed(true);
                if (sel) showToast('Pilih teks maksimal 350 karakter.', 'error');
              }}
            >
              <Icon name="edit" />
            </button>
          </div>
          {armed ? (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => openNoteModal(null)}
            >
              Pilih bagian
            </button>
          ) : null}
          <AnnotationList
            annotations={annotations}
            jump
            editable
            onJump={jumpToMark}
            onEdit={(idx) => openNoteModal(annotations[idx], idx)}
            onRemove={(idx) => {
              onChangeAnnotations?.(annotations.filter((_, i) => i !== idx));
              pencilRef.current?.focus();
            }}
          />
        </div>
      ) : canAnnotate && annotations.length > 0 ? (
        <div className="review-annotation-panel">
          <p className="field-help">{annotations.length} catatan sorotan tersimpan pada tab Pratinjau Dokumen.</p>
        </div>
      ) : null}

      <div ref={previewRef}>
        {mode === 'CURRENT' ? (
          <A4Sheet version={version} doc={doc} annotations={annotations} />
        ) : scanUrl ? (
          <>
            <div className="scan-preview-actions">
              <span className="tabular">{scanAtt?.nama || 'Dokumen_Scan.pdf'}</span>
              <a href={scanUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-compact">
                Buka Tab Baru
              </a>
            </div>
            <iframe className="pdf-frame" title="Pratinjau PDF Hasil Scan" src={scanUrl} />
          </>
        ) : (
          <div className="empty-state scan-empty-state">
            <Icon name="doc" />
            <h3>Belum ada PDF hasil scan</h3>
            <p>
              {canUploadScan
                ? 'Unggah berkas PDF hasil scan bertanda tangan agar dapat dipratinjau di sini.'
                : 'Dokumen ini belum memiliki berkas PDF hasil scan yang diunggah.'}
            </p>
            {canUploadScan ? (
              <label className="btn btn-primary">
                <Icon name="upload" />
                <span>Unggah PDF Hasil Scan</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="file-picker"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadScan?.(file);
                    e.target.value = '';
                  }}
                />
              </label>
            ) : null}
          </div>
        )}
      </div>

      {footer}
    </section>
  );
}
