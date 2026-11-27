'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Icon } from '@/components/ui/Icon';
import { getCurrentUser, getUserUnitsFor, isAnyKoordinator } from '@/lib/domain';

export function NewDocumentView() {
  const router = useRouter();
  const { state, saving, writeAction, draftStep1, setDraftStep1 } = useJdih();
  const user = getCurrentUser(state);
  const allowed = isAnyKoordinator(state, user);

  const catRefs = useRef([]);
  const methodRefs = useRef([]);

  const allowedUnits = useMemo(() => {
    if (!allowed) return [];
    if (user.is_super_admin) return state.units.filter((u) => u.is_active);
    const ids = getUserUnitsFor(state, user.id, 'KOORDINATOR');
    return state.units.filter((u) => u.is_active && ids.includes(u.id));
  }, [allowed, state, user]);

  useEffect(() => {
    if (!allowed) {
      router.replace('/403');
      return;
    }
    if (!draftStep1.unitId || !allowedUnits.some((u) => u.id === draftStep1.unitId)) {
      setDraftStep1((prev) => ({ ...prev, unitId: allowedUnits[0]?.id || '' }));
    }
  }, [allowed, allowedUnits, draftStep1.unitId, setDraftStep1, router]);

  if (!allowed) return null;

  const selectedUnitId =
    allowedUnits.some((u) => u.id === draftStep1.unitId) ? draftStep1.unitId : allowedUnits[0]?.id || '';

  function handleRadioArrow(e, refs, values, onSelect) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const buttons = refs.current.filter(Boolean);
    const idx = buttons.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const nextIdx = (idx + delta + buttons.length) % buttons.length;
    onSelect(values[nextIdx]);
    buttons[nextIdx]?.focus();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/pengajuan" className="btn btn-ghost btn-compact back-link">
            <Icon name="arrowLeft" />
            <span>Kembali ke Pengajuan Unit</span>
          </Link>
          <h1 className="page-title">Buat Dokumen Baru</h1>
          <p className="page-subtitle">Langkah 1 dari 2: pilih unit pemilik, jenis regulasi, dan metode penyusunan.</p>
        </div>
      </div>

      <section className="surface-panel" style={{ maxWidth: '860px' }}>
        <div className="field-grid">
          <div className="field col-12">
            <label id="lbl-step1-unit" htmlFor="step1-unit">Unit pemilik dokumen <span className="req-mark">*</span></label>
            <CustomSelect
              id="step1-unit"
              ariaLabelledBy="lbl-step1-unit"
              value={selectedUnitId}
              options={allowedUnits.map((u) => ({ value: u.id, label: u.nama }))}
              onChange={(val) => setDraftStep1((prev) => ({ ...prev, unitId: val }))}
            />
            <p className="field-help">Hanya menampilkan unit sesuai penugasan Koordinator/SPV Anda.</p>
          </div>

          <div className="field col-12">
            <label>Jenis dokumen (5 jenis tetap RS AN-NISA) <span className="req-mark">*</span></label>
            <div
              className="choice-grid"
              role="radiogroup"
              aria-label="Pilih jenis dokumen"
              onKeyDown={(e) =>
                handleRadioArrow(
                  e,
                  catRefs,
                  state.categories.map((c) => c.id),
                  (id) => setDraftStep1((prev) => ({ ...prev, categoryId: id }))
                )
              }
            >
              {state.categories.map((c, idx) => (
                <button
                  key={c.id}
                  ref={(el) => { catRefs.current[idx] = el; }}
                  type="button"
                  className="choice-option"
                  role="radio"
                  aria-checked={draftStep1.categoryId === c.id}
                  onClick={() => setDraftStep1((prev) => ({ ...prev, categoryId: c.id }))}
                >
                  <strong>{c.label}</strong>
                  <span className="tabular meta-label-sm">Contoh: {c.contoh_nomor}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field col-12">
            <label>Metode penyusunan <span className="req-mark">*</span></label>
            <div
              className="choice-grid"
              role="radiogroup"
              aria-label="Pilih metode penyusunan"
              onKeyDown={(e) =>
                handleRadioArrow(
                  e,
                  methodRefs,
                  ['TEMPLATE', 'UPLOAD'],
                  (m) => setDraftStep1((prev) => ({ ...prev, metode: m }))
                )
              }
            >
              <button
                ref={(el) => { methodRefs.current[0] = el; }}
                type="button"
                className="choice-option"
                role="radio"
                aria-checked={draftStep1.metode === 'TEMPLATE'}
                onClick={() => setDraftStep1((prev) => ({ ...prev, metode: 'TEMPLATE' }))}
              >
                <strong>Buat dari Template</strong>
                <span className="meta-label-sm">Isi format resmi RS AN-NISA. Sistem akan membuat PDF.</span>
              </button>
              <button
                ref={(el) => { methodRefs.current[1] = el; }}
                type="button"
                className="choice-option"
                role="radio"
                aria-checked={draftStep1.metode === 'UPLOAD'}
                onClick={() => setDraftStep1((prev) => ({ ...prev, metode: 'UPLOAD' }))}
              >
                <strong>Unggah PDF</strong>
                <span className="meta-label-sm">Gunakan PDF yang sudah tersedia. Ukuran maksimal 20 MB.</span>
              </button>
            </div>
          </div>
        </div>

        <div className="action-row-end">
          <Link href="/pengajuan" className="btn btn-secondary">Batal</Link>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !selectedUnitId}
            onClick={() =>
              writeAction(
                'documents',
                'POST',
                { unit_id: selectedUnitId, category_id: draftStep1.categoryId, metode: draftStep1.metode },
                '',
                ({ versionId }) => router.push(`/pengajuan/${versionId}`)
              )
            }
          >
            Lanjut isi dokumen
          </button>
        </div>
      </section>
    </>
  );
}
