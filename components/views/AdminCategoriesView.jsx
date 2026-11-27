'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Icon } from '@/components/ui/Icon';
import { RowMenu } from '@/components/ui/RowMenu';
import {
  categoryAllowsTemplate,
  getCurrentUser,
  getSortedCategories,
  isCategoryActive,
  isSpoCategoryLayout,
} from '@/lib/domain';

const SECTION_TYPE_OPTIONS = [
  { value: 'textarea', label: 'Paragraf' },
  { value: 'text', label: 'Teks Singkat' },
  { value: 'list', label: 'Daftar Bernomor' },
];

const LAYOUT_OPTIONS = [
  { value: 'STANDARD', label: 'Standar RS (Kop & Paragraf)' },
  { value: 'SPO', label: 'Tabel Resmi SPO (Kop Berkotak)' },
];

function createEmptySection() {
  return { code: '', label: '', type: 'textarea' };
}

function buildInitialDraft(modalState, categories) {
  if (!modalState) {
    return {
      kode: '',
      label: '',
      contoh_nomor: '',
      urutan: '1',
      allow_template: true,
      layout_type: 'STANDARD',
      template_version: '1',
      sections: [createEmptySection()],
    };
  }
  const { mode, category } = modalState;
  const maxOrder = Math.max(0, ...categories.map((c) => Number(c.urutan) || 0));
  if (mode === 'create') {
    return {
      kode: '',
      label: '',
      contoh_nomor: '',
      urutan: String(maxOrder + 1),
      allow_template: true,
      layout_type: 'STANDARD',
      template_version: '1',
      sections: [{ code: 'TUJUAN', label: 'Tujuan', type: 'textarea' }],
    };
  }
  const allowTpl = categoryAllowsTemplate(category);
  const layoutType = isSpoCategoryLayout(category) ? 'SPO' : 'STANDARD';
  const clonedSections = (category.sections || []).map((s) => ({
    code: mode === 'duplicate' ? '' : (s.code || ''),
    label: s.label || '',
    type: s.type || 'textarea',
  }));
  if (mode === 'duplicate') {
    return {
      kode: `${category.kode}_BARU`.slice(0, 30),
      label: `${category.label} (Salinan)`,
      contoh_nomor: category.contoh_nomor || '',
      urutan: String(maxOrder + 1),
      allow_template: allowTpl,
      layout_type: layoutType,
      template_version: '1',
      sections: clonedSections.length ? clonedSections : (allowTpl ? [createEmptySection()] : []),
    };
  }
  return {
    kode: category.kode || '',
    label: category.label || '',
    contoh_nomor: category.contoh_nomor || '',
    urutan: String(category.urutan || 1),
    allow_template: allowTpl,
    layout_type: layoutType,
    template_version: String(category.template_version || 1),
    sections: clonedSections.length ? clonedSections : (allowTpl ? [createEmptySection()] : []),
  };
}

function serializeStructure(sections, layoutType, allowTemplate) {
  return JSON.stringify({
    allowTemplate,
    layoutType: allowTemplate ? layoutType : 'STANDARD',
    sections: allowTemplate
      ? (sections || []).map((s) => ({
          code: String(s.code || '').trim(),
          label: String(s.label || '').trim(),
          type: s.type || 'textarea',
        }))
      : [],
  });
}

function CategoryFormModal({ modalState, categories, saving, onClose, onSave }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => buildInitialDraft(modalState, categories));
  const [autoBump, setAutoBump] = useState(true);
  const [formErr, setFormErr] = useState('');

  const isEdit = modalState?.mode === 'edit';
  const origCategory = modalState?.category || null;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (modalState) {
      setForm(buildInitialDraft(modalState, categories));
      setAutoBump(true);
      setFormErr('');
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [modalState, categories]);

  const structureChanged = useMemo(() => {
    if (!isEdit || !origCategory) return false;
    const origAllow = categoryAllowsTemplate(origCategory);
    const origLayout = isSpoCategoryLayout(origCategory) ? 'SPO' : 'STANDARD';
    return (
      serializeStructure(form.sections, form.layout_type, form.allow_template)
      !== serializeStructure(origCategory.sections, origLayout, origAllow)
    );
  }, [isEdit, origCategory, form.sections, form.layout_type, form.allow_template]);

  const origVersion = Number(origCategory?.template_version) || 1;
  const effectiveVersion = isEdit && form.allow_template && structureChanged && autoBump
    ? origVersion + 1
    : Number(form.template_version) || 1;

  function updateSection(idx, key, val) {
    setForm((prev) => {
      const next = [...prev.sections];
      next[idx] = { ...next[idx], [key]: val };
      return { ...prev, sections: next };
    });
    if (formErr) setFormErr('');
  }

  function mutateSection(act, idx) {
    setForm((prev) => {
      const next = [...prev.sections];
      if (act === 'add') next.push(createEmptySection());
      if (act === 'del' && next.length > 1) next.splice(idx, 1);
      if (act === 'up' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      if (act === 'down' && idx < next.length - 1) [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return { ...prev, sections: next };
    });
    if (formErr) setFormErr('');
  }

  function handleMethodChange(allowTemplate) {
    setForm((prev) => ({
      ...prev,
      allow_template: allowTemplate,
      layout_type: allowTemplate ? prev.layout_type : 'STANDARD',
      sections: allowTemplate && !prev.sections.length ? [createEmptySection()] : prev.sections,
    }));
    if (formErr) setFormErr('');
  }

  async function handleSubmit() {
    const kode = form.kode.trim().toUpperCase().replace(/\s+/g, '_');
    const label = form.label.trim();
    const contohNomor = form.contoh_nomor.trim();
    const urutan = Number(form.urutan);
    const templateVersion = effectiveVersion;

    if (!kode || !/^[A-Z0-9_-]{1,30}$/.test(kode)) {
      setFormErr('Kode jenis wajib diisi (maksimal 30 karakter: huruf, angka, - atau _).');
      return;
    }
    if (!label) {
      setFormErr('Label jenis dokumen wajib diisi.');
      return;
    }
    if (!contohNomor) {
      setFormErr('Contoh nomor wajib diisi sebagai panduan formulir.');
      return;
    }
    if (!Number.isSafeInteger(urutan) || urutan < 1 || urutan > 999) {
      setFormErr('Urutan tampil harus angka bulat 1 sampai 999.');
      return;
    }
    if (!Number.isSafeInteger(templateVersion) || templateVersion < 1 || templateVersion > 9999) {
      setFormErr('Versi template harus angka bulat minimal 1.');
      return;
    }
    if (categories.some((c) => (!isEdit || c.id !== origCategory.id) && (c.kode.toUpperCase() === kode || c.label.toLowerCase() === label.toLowerCase()))) {
      setFormErr('Kode atau label jenis dokumen sudah terdaftar.');
      return;
    }

    let cleanedSections = [];
    if (form.allow_template) {
      cleanedSections = form.sections.map((s) => ({
        ...(s.code ? { code: s.code } : {}),
        label: String(s.label || '').trim(),
        type: s.type || 'textarea',
      }));
      if (!cleanedSections.length || cleanedSections.some((s) => !s.label)) {
        setFormErr('Setiap bagian template wajib memiliki nama bagian.');
        return;
      }
    }

    const payload = {
      kode,
      label,
      contoh_nomor: contohNomor,
      urutan,
      allow_template: form.allow_template,
      layout_type: form.allow_template ? form.layout_type : 'STANDARD',
      template_version: templateVersion,
      sections: cleanedSections,
    };

    const ok = await onSave(payload, isEdit ? origCategory.id : null);
    if (ok) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog dialog-wide"
      aria-labelledby="category-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {modalState ? (
        <form method="dialog" className="modal-card" noValidate>
          <div className="modal-header">
            <h2 id="category-modal-title" className="modal-title">
              {isEdit
                ? `Edit Jenis Dokumen & Template (${origCategory.label})`
                : modalState.mode === 'duplicate'
                  ? `Duplikat Jenis Dokumen (${origCategory.label})`
                  : 'Tambah Jenis Dokumen Baru'}
            </h2>
            <button type="button" className="icon-btn" aria-label="Tutup dialog" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          <div className="modal-body">
            <div className="field-grid">
              <div className="field col-4">
                <label htmlFor="cat-kode">Kode Jenis <span className="req-mark">*</span></label>
                <input
                  id="cat-kode"
                  className="input tabular"
                  placeholder="PANDUAN"
                  maxLength={30}
                  value={form.kode}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, kode: e.target.value.toUpperCase() }));
                    if (formErr) setFormErr('');
                  }}
                />
              </div>

              <div className="field col-5">
                <label htmlFor="cat-label">Label Jenis Dokumen <span className="req-mark">*</span></label>
                <input
                  id="cat-label"
                  className="input"
                  placeholder="Panduan Praktik Klinis"
                  maxLength={120}
                  value={form.label}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, label: e.target.value }));
                    if (formErr) setFormErr('');
                  }}
                />
              </div>

              <div className="field col-3">
                <label htmlFor="cat-urutan">Urutan Tampil <span className="req-mark">*</span></label>
                <input
                  id="cat-urutan"
                  className="input tabular"
                  type="number"
                  min="1"
                  max="999"
                  value={form.urutan}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, urutan: e.target.value }));
                    if (formErr) setFormErr('');
                  }}
                />
              </div>

              <div className="field col-12">
                <label htmlFor="cat-contoh">Contoh Nomor (Panduan Formulir) <span className="req-mark">*</span></label>
                <input
                  id="cat-contoh"
                  className="input tabular"
                  placeholder="RSAN/PPK/6/IGD/001"
                  maxLength={180}
                  value={form.contoh_nomor}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, contoh_nomor: e.target.value }));
                    if (formErr) setFormErr('');
                  }}
                />
              </div>

              <div className="field col-12">
                <label>Metode Penyusunan yang Diizinkan <span className="req-mark">*</span></label>
                <div className="choice-grid" role="radiogroup" aria-label="Pilih metode penyusunan jenis dokumen">
                  <button
                    type="button"
                    className="choice-option"
                    role="radio"
                    aria-checked={form.allow_template}
                    onClick={() => handleMethodChange(true)}
                  >
                    <strong>Template &amp; Unggah PDF</strong>
                    <span className="meta-label-sm">
                      Penyusun dapat mengisi formulir template resmi RS atau mengunggah PDF siap pakai.
                    </span>
                  </button>
                  <button
                    type="button"
                    className="choice-option"
                    role="radio"
                    aria-checked={!form.allow_template}
                    onClick={() => handleMethodChange(false)}
                  >
                    <strong>Khusus Unggah PDF Tunggal</strong>
                    <span className="meta-label-sm">
                      Khusus arsip/data lama bertanda tangan basah hasil scan atau dokumen tanpa editor template.
                    </span>
                  </button>
                </div>
              </div>

              {form.allow_template ? (
                <>
                  <div className="field col-7">
                    <label id="lbl-cat-layout" htmlFor="cat-layout">Format Layout PDF</label>
                    <CustomSelect
                      id="cat-layout"
                      ariaLabelledBy="lbl-cat-layout"
                      value={form.layout_type}
                      options={LAYOUT_OPTIONS}
                      onChange={(val) => setForm((prev) => ({ ...prev, layout_type: val }))}
                    />
                  </div>

                  <div className="field col-5">
                    <label htmlFor="cat-version">Versi Template</label>
                    <input
                      id="cat-version"
                      className="input tabular"
                      type="number"
                      min="1"
                      max="9999"
                      value={String(effectiveVersion)}
                      onChange={(e) => {
                        setAutoBump(false);
                        setForm((prev) => ({ ...prev, template_version: e.target.value }));
                        if (formErr) setFormErr('');
                      }}
                    />
                  </div>

                  {isEdit ? (
                    <div className="field col-12">
                      <label className="category-bump-toggle">
                        <input
                          type="checkbox"
                          checked={autoBump}
                          onChange={(e) => setAutoBump(e.target.checked)}
                        />
                        <span>
                          Naikkan versi template otomatis (+1) saat struktur atau layout berubah
                          {structureChanged ? (
                            <strong className="tabular"> ({`v${origVersion} → v${origVersion + 1}`})</strong>
                          ) : null}
                        </span>
                      </label>
                    </div>
                  ) : null}

                  <div className="field col-12">
                    <div className="category-sections-head">
                      <div>
                        <label>Struktur Bagian Template <span className="req-mark">*</span></label>
                        <p className="field-help">
                          Dokumen terbit maupun draf lama tetap menyimpan snapshot versi template sebelumnya.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => mutateSection('add', 0)}
                      >
                        <Icon name="plus" />
                        <span>Tambah Bagian</span>
                      </button>
                    </div>

                    <div className="category-section-list">
                      {form.sections.map((sec, idx) => (
                        <div key={sec.code || `new-${idx}`} className="category-section-row">
                          <span className="sortable-num tabular">{idx + 1}.</span>
                          <input
                            className="input"
                            aria-label={`Nama bagian ${idx + 1}`}
                            placeholder="Nama bagian (contoh: Tujuan, Prosedur)"
                            maxLength={160}
                            value={sec.label}
                            onChange={(e) => updateSection(idx, 'label', e.target.value)}
                          />
                          <select
                            className="input"
                            aria-label={`Tipe isian bagian ${idx + 1}`}
                            value={sec.type}
                            onChange={(e) => updateSection(idx, 'type', e.target.value)}
                          >
                            {SECTION_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <div className="sortable-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="Pindah bagian ke atas"
                              disabled={idx === 0}
                              onClick={() => mutateSection('up', idx)}
                            >
                              <Icon name="up" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="Pindah bagian ke bawah"
                              disabled={idx === form.sections.length - 1}
                              onClick={() => mutateSection('down', idx)}
                            >
                              <Icon name="down" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="Hapus bagian"
                              disabled={form.sections.length <= 1}
                              onClick={() => mutateSection('del', idx)}
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="field col-12">
                  <div className="notice-banner" role="status">
                    <div>
                      <strong>Mode Unggah PDF Tunggal</strong>
                      <p>
                        Dokumen baru pada jenis ini langsung diarahkan ke unggah berkas PDF scan bertanda tangan tanpa pengisian editor template.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <p className="field-error" role="alert" hidden={!formErr} style={{ marginTop: '10px' }}>
              {formErr}
            </p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Batal
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSubmit}>
              {isEdit ? 'Simpan Perubahan' : 'Simpan Jenis Dokumen'}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}

export function AdminCategoriesView() {
  const router = useRouter();
  const { state, saving, writeAction, showToast, openDialog } = useJdih();

  const user = getCurrentUser(state);
  const allowed = Boolean(user?.is_super_admin);

  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState(null);

  useEffect(() => {
    if (!allowed) router.replace('/403');
  }, [allowed, router]);

  const sortedCategories = useMemo(() => getSortedCategories(state.categories), [state.categories]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedCategories.filter(
      (c) => !q || `${c.kode} ${c.label} ${c.contoh_nomor}`.toLowerCase().includes(q)
    );
  }, [sortedCategories, search]);

  if (!allowed) return null;

  async function handleSaveModal(payload, editId) {
    if (editId) {
      const ok = await writeAction(
        `admin/categories/${editId}`,
        'PATCH',
        payload,
        'Jenis dokumen dan versi template diperbarui.'
      );
      return Boolean(ok);
    }
    const ok = await writeAction(
      'admin/categories',
      'POST',
      payload,
      'Jenis dokumen baru ditambahkan.'
    );
    return Boolean(ok);
  }

  async function handleToggleActive(c) {
    const active = isCategoryActive(c);
    if (active && sortedCategories.filter(isCategoryActive).length <= 1) {
      showToast('Minimal satu jenis dokumen harus tetap aktif.', 'error');
      return;
    }
    await writeAction(
      `admin/categories/${c.id}`,
      'PATCH',
      { is_active: !active },
      active ? 'Jenis dokumen dinonaktifkan.' : 'Jenis dokumen diaktifkan kembali.'
    );
  }

  async function handleDeleteCategory(c, docCount) {
    if (docCount > 0) {
      showToast('Jenis dokumen masih memiliki dokumen; nonaktifkan saja jika tidak dipakai lagi.', 'error');
      return;
    }
    if (sortedCategories.filter(isCategoryActive).length <= 1 && isCategoryActive(c)) {
      showToast('Minimal satu jenis dokumen aktif harus tersedia.', 'error');
      return;
    }
    const res = await openDialog({
      title: 'Hapus Jenis Dokumen',
      body: (
        <p>
          Jenis dokumen <strong>{c.label}</strong> ({c.kode}) akan dihapus permanen. Lanjutkan?
        </p>
      ),
      confirmLabel: 'Ya, Hapus',
      confirmTone: 'danger',
    });
    if (!res) return;
    await writeAction(`admin/categories/${c.id}`, 'DELETE', undefined, 'Jenis dokumen dihapus.');
  }

  function buildCategoryMenu(c, docCount) {
    const active = isCategoryActive(c);
    return [
      {
        label: 'Edit Jenis & Template',
        onClick: () => setModalState({ mode: 'edit', category: c }),
      },
      {
        label: 'Duplikat Jenis Dokumen',
        onClick: () => setModalState({ mode: 'duplicate', category: c }),
      },
      {
        label: active ? 'Nonaktifkan Jenis' : 'Aktifkan Jenis',
        onClick: () => handleToggleActive(c),
      },
      {
        label: 'Hapus Jenis Dokumen',
        icon: 'trash',
        danger: true,
        onClick: () => handleDeleteCategory(c, docCount),
      },
    ];
  }

  const rowData = filteredCategories.map((c) => ({
    c,
    active: isCategoryActive(c),
    allowTemplate: categoryAllowsTemplate(c),
    isSpoLayout: isSpoCategoryLayout(c),
    docCount: state.documents.filter((d) => d.category_id === c.id).length,
    sectionCount: Array.isArray(c.sections) ? c.sections.length : 0,
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen Jenis Dokumen &amp; Template</h1>
          <p className="page-subtitle">
            Kelola {state.categories.length} jenis dokumen, mode penyusunan (template atau PDF tunggal), struktur bagian, dan versi template.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalState({ mode: 'create', category: null })}
          >
            <Icon name="plus" />
            <span>Tambah Jenis Dokumen</span>
          </button>
        </div>
      </div>

      <section className="surface-panel">
        <div className="filter-subrow">
          <div className="field admin-search-field">
            <label htmlFor="category-search">Cari kode atau label jenis dokumen</label>
            <input
              id="category-search"
              className="input"
              type="search"
              value={search}
              placeholder="Contoh: SPO, SK, Arsip Scan"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="tabular meta-label-sm">
            Menampilkan {filteredCategories.length} dari {state.categories.length} jenis dokumen
          </span>
        </div>

        {rowData.length === 0 ? (
          <div className="empty-state">
            <Icon name="tag" />
            <h3>Jenis dokumen tidak ditemukan</h3>
            <p>Ubah kata kunci pencarian atau tambah jenis dokumen baru.</p>
          </div>
        ) : (
          <div className="responsive-table-region">
            <div className="table-wrap responsive-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Urut</th>
                    <th>Kode</th>
                    <th>Label Jenis</th>
                    <th>Metode</th>
                    <th>Template</th>
                    <th>Contoh Nomor</th>
                    <th>Dokumen</th>
                    <th>Status</th>
                    <th className="col-actions">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rowData.map(({ c, active, allowTemplate, isSpoLayout, docCount, sectionCount }) => (
                    <tr key={c.id}>
                      <td className="tabular">{c.urutan || '-'}</td>
                      <td className="tabular"><strong>{c.kode}</strong></td>
                      <td>
                        <div>{c.label}</div>
                        {allowTemplate && isSpoLayout ? (
                          <div className="meta-label-sm">Layout Tabel SPO</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`status-pill status-${allowTemplate ? 'info' : 'neutral'}`}>
                          {allowTemplate ? 'Template & PDF' : 'PDF Tunggal'}
                        </span>
                      </td>
                      <td className="tabular">
                        {allowTemplate ? `v${c.template_version || 1} · ${sectionCount} bagian` : 'Tanpa template'}
                      </td>
                      <td className="tabular meta-label-sm">{c.contoh_nomor}</td>
                      <td className="tabular">{docCount}</td>
                      <td>
                        <span className={`status-pill status-${active ? 'success' : 'danger'}`}>
                          {active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="col-actions">
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            disabled={saving}
                            onClick={() => setModalState({ mode: 'edit', category: c })}
                          >
                            Edit &amp; Template
                          </button>
                          <RowMenu triggerLabel={`Aksi lainnya jenis ${c.label}`} items={buildCategoryMenu(c, docCount)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="responsive-cards" role="list">
              {rowData.map(({ c, active, allowTemplate, isSpoLayout, docCount, sectionCount }) => (
                <li key={c.id} className="responsive-card">
                  <div className="responsive-card-head">
                    <h3><span className="tabular">{c.kode}</span> - {c.label}</h3>
                    <span className={`status-pill status-${active ? 'success' : 'danger'}`}>
                      {active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Metode</dt>
                      <dd>{allowTemplate ? `Template & PDF${isSpoLayout ? ' (Tabel SPO)' : ''}` : 'PDF Tunggal'}</dd>
                    </div>
                    <div>
                      <dt>Template</dt>
                      <dd className="tabular">
                        {allowTemplate ? `v${c.template_version || 1} · ${sectionCount} bagian` : 'Tanpa template'}
                      </dd>
                    </div>
                    <div><dt>Contoh Nomor</dt><dd className="tabular">{c.contoh_nomor}</dd></div>
                    <div><dt>Dokumen</dt><dd className="tabular">{docCount} · Urutan {c.urutan || '-'}</dd></div>
                  </dl>
                  <div className="responsive-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={saving}
                      onClick={() => setModalState({ mode: 'edit', category: c })}
                    >
                      Edit &amp; Template
                    </button>
                    <RowMenu triggerLabel={`Aksi lainnya jenis ${c.label}`} items={buildCategoryMenu(c, docCount)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <CategoryFormModal
        modalState={modalState}
        categories={sortedCategories}
        saving={saving}
        onClose={() => setModalState(null)}
        onSave={handleSaveModal}
      />
    </>
  );
}
