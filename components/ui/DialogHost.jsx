'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function DialogHost({ dialogConfig, onResolve, toasts, onDismissToast }) {
  const dialogRef = useRef(null);
  const noteInputRef = useRef(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (dialogConfig) {
      setNote(dialogConfig.noteValue || '');
      setNoteError('');
      if (!el.open) el.showModal();
      if (dialogConfig.requireNote && dialogConfig.noteValue) {
        setTimeout(() => noteInputRef.current?.focus(), 20);
      }
    } else if (el.open) {
      el.close();
    }
  }, [dialogConfig]);

  function handleCancel(e) {
    e.preventDefault();
    onResolve(null);
  }

  function handleConfirm() {
    if (!dialogConfig) return;
    if (dialogConfig.requireNote) {
      const trimmed = note.trim();
      if (!trimmed && !dialogConfig.noteOptional) {
        const label = (dialogConfig.noteLabel || 'Catatan').toLowerCase();
        setNoteError(label.includes('alasan') ? 'Alasan wajib diisi' : 'Catatan wajib diisi');
        noteInputRef.current?.focus();
        return;
      }
      onResolve({ confirmed: true, note: trimmed });
      return;
    }
    if (typeof dialogConfig.onValidate === 'function') {
      const result = dialogConfig.onValidate(dialogRef.current);
      if (!result) return;
      onResolve(typeof result === 'object' ? { confirmed: true, ...result } : { confirmed: true });
      return;
    }
    onResolve({ confirmed: true });
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        id="confirm-dialog"
        className={`modal-dialog${dialogConfig?.wide ? ' dialog-wide' : ''}`}
        aria-labelledby="confirm-dialog-title"
        onCancel={handleCancel}
      >
        {dialogConfig ? (
          <form method="dialog" className="modal-card" noValidate>
            <div className="modal-header">
              <h2 id="confirm-dialog-title" className="modal-title">{dialogConfig.title}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Tutup dialog"
                onClick={() => onResolve(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-body">
              {typeof dialogConfig.body === 'function' ? dialogConfig.body() : dialogConfig.body}
              {dialogConfig.requireNote ? (
                <div className="field" style={{ marginTop: '14px' }}>
                  <label htmlFor="dialog-note-input">
                    {dialogConfig.noteLabel || 'Catatan'}{' '}
                    {dialogConfig.noteOptional ? '(opsional)' : <span className="req-mark">*</span>}
                  </label>
                  <textarea
                    ref={noteInputRef}
                    id="dialog-note-input"
                    className={`textarea${noteError ? ' is-invalid' : ''}`}
                    maxLength={dialogConfig.noteMaxLength || 4000}
                    placeholder={dialogConfig.notePlaceholder || ''}
                    value={note}
                    aria-invalid={noteError ? 'true' : undefined}
                    aria-describedby={noteError ? 'dialog-note-error' : undefined}
                    onChange={(e) => {
                      setNote(e.target.value);
                      if (noteError) setNoteError('');
                    }}
                  />
                  <p id="dialog-note-error" className="field-error" role="alert" hidden={!noteError}>
                    {noteError}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              {!dialogConfig.hideCancel ? (
                <button type="button" className="btn btn-secondary" onClick={() => onResolve(null)}>
                  Batal
                </button>
              ) : null}
              <button
                type="button"
                className={`btn btn-${dialogConfig.confirmTone === 'danger' ? 'danger' : 'primary'}`}
                onClick={handleConfirm}
              >
                {dialogConfig.confirmLabel || 'Ya, Lanjutkan'}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      <div id="toast-region" className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`} role="status">
            <span>{toast.message}</span>
            <button
              type="button"
              className="icon-btn toast-close-btn"
              aria-label="Tutup notifikasi"
              onClick={() => onDismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
