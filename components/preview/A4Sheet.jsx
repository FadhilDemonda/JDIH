'use client';

import { useJdih } from '@/components/providers/JdihProvider';
import { getCategory, getUnit, SPO_SECTION_LABELS } from '@/lib/domain';
import { formatDateID } from '@/lib/format';
import { AnnotatedText } from './AnnotatedText';

export function A4Sheet({ version, doc, annotations = [] }) {
  const { state } = useJdih();
  const unit = getUnit(state, doc.unit_id);
  const cat = getCategory(state, doc.category_id);
  const sections = version.sections || {};

  if (cat?.kode === 'SPO' || doc?.category_id === 'cat-spo') {
    const secEntries = version.template_sections || cat?.sections || [];
    const approver = sections.PEJABAT_PENETAP?.trim() || 'Dr. dr. Ediansyah, MARS';
    const issuedDate = formatDateID(version.tgl_berlaku || version.tgl_dokumen);

    return (
      <div className="a4-sheet-scroll">
        <div className="a4-sheet a4-sheet-spo" aria-label="Pratinjau dokumen SPO A4">
          <table className="a4-spo-table">
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td rowSpan={2} className="a4-spo-brand">
                  <div>RS AN-NISA<br />TANGERANG</div>
                  <img
                    src="/assets/logo-rs-annisa.png"
                    alt="Logo RS An-Nisa Tangerang"
                    width="44"
                    height="58"
                    className="a4-spo-logo"
                    decoding="async"
                  />
                </td>
                <td colSpan={3} className="a4-spo-title">
                  {version.judul ? <AnnotatedText text={version.judul} field="judul" annotations={annotations} /> : 'JUDUL DOKUMEN'}
                </td>
              </tr>
              <tr>
                <td className="a4-spo-meta-cell">
                  <div>No.Dokumen</div>
                  <div className="tabular">
                    {version.nomor ? <AnnotatedText text={version.nomor} field="nomor" annotations={annotations} /> : '-'}
                  </div>
                </td>
                <td className="a4-spo-meta-cell">
                  <div>No.Revisi</div>
                  <div className="tabular">
                    {version.revisi_label ? <AnnotatedText text={version.revisi_label} field="revisi_label" annotations={annotations} /> : '00'}
                  </div>
                </td>
                <td className="a4-spo-meta-cell">
                  <div>Halaman</div>
                  <div className="tabular">1/1</div>
                </td>
              </tr>
              <tr>
                <td className="a4-spo-type">STANDAR<br />PROSEDUR<br />OPERASIONAL</td>
                <td className="a4-spo-meta-cell">
                  <div>Tanggal Terbit</div>
                  <div className="tabular">{issuedDate}</div>
                </td>
                <td colSpan={2} className="a4-spo-sign">
                  <div>Ditetapkan,<br />Direktur RS</div>
                  <div className="a4-spo-sign-space" />
                  <div>{approver}</div>
                </td>
              </tr>
              {secEntries.map((s) => {
                const spoLabel = SPO_SECTION_LABELS[s.code] || s.label.replace(/\s*\((?:dapat diurutkan|bila ada)\)\s*$/i, '').toUpperCase();
                const val = sections[s.code];
                if (s.code === 'FORMULIR_PENDUKUNG') {
                  const hasText = Array.isArray(val) ? val.some((x) => x?.trim()) : Boolean(String(val || '').trim());
                  if (!hasText) return null;
                }
                if (s.type === 'list') {
                  const items = Array.isArray(val) && val.length ? val : ['Belum ada butir diisi.'];
                  return (
                    <tr key={s.code} data-section-label={spoLabel}>
                      <td className="a4-spo-sec-label">{spoLabel}</td>
                      <td colSpan={3} className="a4-spo-sec-body">
                        <ol className="a4-spo-list">
                          {items.map((item, idx) => (
                            <li key={idx}>
                              {Array.isArray(val)
                                ? <AnnotatedText text={item} field={s.code} index={idx} annotations={annotations} />
                                : item}
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={s.code} data-section-label={spoLabel}>
                    <td className="a4-spo-sec-label">{spoLabel}</td>
                    <td colSpan={3} className="a4-spo-sec-body">
                      <p>{val ? <AnnotatedText text={val} field={s.code} annotations={annotations} /> : 'Belum diisi.'}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const secEntries = (version.template_sections || cat?.sections || []).filter(
    ({ code }) => code !== 'TEMPAT_TGL_PENETAPAN' && code !== 'PEJABAT_PENETAP'
  );
  const approver = sections.PEJABAT_PENETAP;
  const approvalPlace = sections.TEMPAT_TGL_PENETAPAN;

  return (
    <div className="a4-sheet-scroll">
      <div className="a4-sheet" aria-label="Pratinjau dokumen PDF A4">
        <table className="a4-kop">
          <tbody>
            <tr>
              <td rowSpan={2} className="a4-kop-brand" style={{ width: '28%' }}>
                <div className="a4-kop-brand-inner">
                  <img
                    src="/assets/logo-rs-annisa.png"
                    alt="Logo RS An-Nisa Tangerang"
                    width="38"
                    height="50"
                    className="a4-logo"
                    decoding="async"
                  />
                  <div>RS AN-NISA</div>
                  <div style={{ fontWeight: 500, color: 'var(--paper-muted)' }}>Tangerang</div>
                </div>
              </td>
              <td rowSpan={2} className="a4-doc-title" style={{ width: '42%' }}>
                {version.judul ? <AnnotatedText text={version.judul} field="judul" annotations={annotations} /> : 'Judul Dokumen'}
              </td>
              <td style={{ width: '30%' }}>
                <strong>No. Dokumen:</strong>{' '}
                <span className="tabular">
                  {version.nomor ? <AnnotatedText text={version.nomor} field="nomor" annotations={annotations} /> : '-'}
                </span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>No. Revisi:</strong>{' '}
                <span className="tabular">
                  {version.revisi_label ? <AnnotatedText text={version.revisi_label} field="revisi_label" annotations={annotations} /> : '00'}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>Jenis:</strong> {cat ? cat.label : '-'}</td>
              <td><strong>Unit Pemilik:</strong> {unit ? unit.nama : '-'}</td>
              <td><strong>Mulai Berlaku:</strong> <span className="tabular">{formatDateID(version.tgl_berlaku)}</span></td>
            </tr>
          </tbody>
        </table>

        {secEntries.map((s) => {
          const pdfLabel = s.label.replace(/\s*\((?:dapat diurutkan|bila ada)\)\s*$/i, '');
          const val = sections[s.code];
          if (s.type === 'list') {
            const items = Array.isArray(val) && val.length ? val : ['Belum ada butir diisi.'];
            return (
              <div key={s.code} className="a4-section">
                <h4>{pdfLabel}</h4>
                <ol>
                  {items.map((item, idx) => (
                    <li key={idx}>
                      {Array.isArray(val)
                        ? <AnnotatedText text={item} field={s.code} index={idx} annotations={annotations} />
                        : item}
                    </li>
                  ))}
                </ol>
              </div>
            );
          }
          return (
            <div key={s.code} className="a4-section">
              <h4>{pdfLabel}</h4>
              <p>{val ? <AnnotatedText text={val} field={s.code} annotations={annotations} /> : 'Belum diisi.'}</p>
            </div>
          );
        })}

        {approvalPlace || approver ? (
          <div className="a4-sign">
            <div className="a4-sign-box">
              <div className="tabular">
                <AnnotatedText text={approvalPlace} field="TEMPAT_TGL_PENETAPAN" annotations={annotations} />
              </div>
              <div className="a4-sign-space" />
              <div>
                <strong>
                  <AnnotatedText text={approver} field="PEJABAT_PENETAP" annotations={annotations} />
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        <div className="a4-footer">
          <span>Unit: {unit ? unit.nama : '-'}</span>
          <span>Dokumen terkendali - JDIH RS AN-NISA</span>
        </div>
      </div>
    </div>
  );
}
