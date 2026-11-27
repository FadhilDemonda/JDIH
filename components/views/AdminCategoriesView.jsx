'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useJdih } from '@/components/providers/JdihProvider';
import { getCurrentUser } from '@/lib/domain';

export function AdminCategoriesView() {
  const router = useRouter();
  const { state, saving, writeAction, showToast } = useJdih();

  const user = getCurrentUser(state);
  const allowed = Boolean(user?.is_super_admin);

  const [edits, setEdits] = useState({});

  useEffect(() => {
    if (!allowed) router.replace('/403');
  }, [allowed, router]);

  useEffect(() => {
    const next = {};
    state.categories.forEach((c) => {
      next[c.id] = { contoh_nomor: c.contoh_nomor, template_version: String(c.template_version) };
    });
    setEdits(next);
  }, [state.categories]);

  if (!allowed) return null;

  function updateField(cid, key, val) {
    setEdits((prev) => ({
      ...prev,
      [cid]: { ...(prev[cid] || {}), [key]: val },
    }));
  }

  function handleSave(cid) {
    const row = edits[cid] || {};
    const ex = String(row.contoh_nomor || '').trim();
    const ver = Number(row.template_version) || 1;
    if (!ex) {
      showToast('Contoh nomor wajib diisi.', 'error');
      return;
    }
    writeAction(`admin/categories/${cid}`, 'PATCH', { contoh_nomor: ex, template_version: ver }, 'Pengaturan jenis dokumen disimpan.');
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengaturan Jenis Dokumen</h1>
          <p className="page-subtitle">
            Atur contoh format nomor (placeholder formulir) dan versi template untuk 5 jenis dokumen tetap.
          </p>
        </div>
      </div>

      <section className="surface-panel">
        <div className="responsive-table-region">
          <div className="table-wrap responsive-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Label Jenis</th>
                  <th>Contoh Nomor (Panduan Formulir)</th>
                  <th>Versi Template</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {state.categories.map((c) => {
                  const val = edits[c.id] || { contoh_nomor: c.contoh_nomor, template_version: String(c.template_version) };
                  return (
                    <tr key={c.id}>
                      <td className="tabular"><strong>{c.kode}</strong></td>
                      <td>{c.label}</td>
                      <td>
                        <input
                          className="input tabular"
                          aria-label={`Contoh nomor ${c.label}`}
                          value={val.contoh_nomor}
                          onChange={(e) => updateField(c.id, 'contoh_nomor', e.target.value)}
                        />
                      </td>
                      <td style={{ width: '120px' }}>
                        <input
                          className="input tabular"
                          type="number"
                          min="1"
                          aria-label={`Versi template ${c.label}`}
                          value={val.template_version}
                          onChange={(e) => updateField(c.id, 'template_version', e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-compact"
                          disabled={saving}
                          onClick={() => handleSave(c.id)}
                        >
                          Simpan
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="responsive-cards" role="list">
            {state.categories.map((c) => {
              const val = edits[c.id] || { contoh_nomor: c.contoh_nomor, template_version: String(c.template_version) };
              return (
                <li key={c.id} className="responsive-card">
                  <div className="responsive-card-head">
                    <h3><span className="tabular">{c.kode}</span> - {c.label}</h3>
                  </div>
                  <div className="responsive-card-fields">
                    <div className="field">
                      <label htmlFor={`card-cat-ex-${c.id}`}>Contoh Nomor (Panduan Formulir)</label>
                      <input
                        id={`card-cat-ex-${c.id}`}
                        className="input tabular"
                        value={val.contoh_nomor}
                        onChange={(e) => updateField(c.id, 'contoh_nomor', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`card-cat-ver-${c.id}`}>Versi Template</label>
                      <input
                        id={`card-cat-ver-${c.id}`}
                        className="input tabular"
                        type="number"
                        min="1"
                        value={val.template_version}
                        onChange={(e) => updateField(c.id, 'template_version', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="responsive-card-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      disabled={saving}
                      onClick={() => handleSave(c.id)}
                    >
                      Simpan
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
