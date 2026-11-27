import React from 'react';
import { Readable } from 'node:stream';
import { Document, Image, Page, Text, View, StyleSheet, renderToStream } from '@react-pdf/renderer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const logoFile = path.join(process.cwd(), 'mockup', 'assets', 'logo-rs-annisa.png');
const h = React.createElement;

const SPO_SECTION_LABELS = {
  PENGERTIAN: 'PENGERTIAN',
  TUJUAN: 'TUJUAN',
  KEBIJAKAN_REFERENSI: 'KEBIJAKAN',
  LANGKAH: 'PROSEDUR',
  UNIT_TERKAIT: 'UNIT TERKAIT',
  FORMULIR_PENDUKUNG: 'DOKUMEN PENDUKUNG',
};

const styles = StyleSheet.create({
  page: { padding: 71, fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.4, color: '#202020' },
  header: { border: '1 solid #2a2a2a', marginBottom: 18, padding: 10, flexDirection: 'row', alignItems: 'center' },
  logo: { width: 32, height: 42, marginRight: 12 },
  hospital: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginVertical: 4 },
  heading: { fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 2 },
  footer: { position: 'absolute', bottom: 42, left: 71, right: 71, fontSize: 8, color: '#505050',
    borderTop: '1 solid #aaaaaa', paddingTop: 5 },

  // Official SPO bordered table layout (matches images/007. SPO PERMINTAAN DATASET.pdf)
  spoPage: { paddingTop: 212, paddingBottom: 44, paddingHorizontal: 48, fontSize: 9.5, fontFamily: 'Helvetica', lineHeight: 1.38, color: '#000000' },
  spoKopFixed: { position: 'absolute', top: 42, left: 48, right: 48, height: 170, border: '1 solid #000000', backgroundColor: '#ffffff' },
  spoKopTop: { flexDirection: 'row', height: 84, borderBottom: '1 solid #000000' },
  spoBrandCell: { width: '24%', borderRight: '1 solid #000000', alignItems: 'center', justifyContent: 'center', padding: 5 },
  spoBrandText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', lineHeight: 1.2 },
  spoLogo: { width: 34, height: 45, marginTop: 4 },
  spoTopRight: { width: '76%', flexDirection: 'column' },
  spoTitleBox: { height: 40, borderBottom: '1 solid #000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  spoTitleText: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', lineHeight: 1.2 },
  spoMetaRow: { height: 44, flexDirection: 'row' },
  spoMetaDoc: { width: '46.05%', borderRight: '1 solid #000000', alignItems: 'center', justifyContent: 'center', padding: 4 },
  spoMetaRev: { width: '22.37%', borderRight: '1 solid #000000', alignItems: 'center', justifyContent: 'center', padding: 4 },
  spoMetaPage: { width: '31.58%', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 10, paddingHorizontal: 4 },
  spoMetaText: { fontSize: 9, textAlign: 'center', lineHeight: 1.25 },
  spoPageNumFixed: { position: 'absolute', top: 105, right: 49, width: 119, fontSize: 9, textAlign: 'center', color: '#000000' },
  spoKopBottom: { height: 86, flexDirection: 'row' },
  spoTypeCell: { width: '24%', borderRight: '1 solid #000000', alignItems: 'center', justifyContent: 'center', padding: 6 },
  spoTypeText: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', lineHeight: 1.3 },
  spoDateCell: { width: '35%', borderRight: '1 solid #000000', alignItems: 'center', justifyContent: 'center', padding: 6 },
  spoSignCell: { width: '41%', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8 },
  spoSignText: { fontSize: 9, textAlign: 'center', lineHeight: 1.25 },
  spoRow: { flexDirection: 'row', borderLeft: '1 solid #000000', borderRight: '1 solid #000000', borderBottom: '1 solid #000000' },
  spoLabelCell: { width: '24%', borderRight: '1 solid #000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 8 },
  spoLabelText: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  spoBodyCell: { width: '76%', paddingHorizontal: 8, paddingVertical: 6 },
  spoListRow: { flexDirection: 'row', marginBottom: 2 },
  spoListNum: { width: 16, fontSize: 9.5 },
  spoSubNum: { width: 14, marginLeft: 14, fontSize: 9.5 },
  spoListText: { flex: 1, fontSize: 9.5 },
  spoPara: { fontSize: 9.5, marginBottom: 2 },
});

function formatDateLong(input) {
  if (!input) return '-';
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return String(input);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

function renderSpoParagraphLines(keyPrefix, rawLines) {
  const nodes = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    const numbered = line.match(/^(\d+\.)\s+(.+)$/);
    if (numbered) {
      nodes.push(
        h(View, { key: keyPrefix + '-n-' + i, style: styles.spoListRow },
          h(Text, { style: styles.spoListNum }, numbered[1]),
          h(Text, { style: styles.spoListText }, numbered[2]),
        ),
      );
      continue;
    }
    const sub = line.match(/^([a-z]\.)\s+(.+)$/i);
    if (sub) {
      nodes.push(
        h(View, { key: keyPrefix + '-s-' + i, style: styles.spoListRow },
          h(Text, { style: styles.spoSubNum }, sub[1]),
          h(Text, { style: styles.spoListText }, sub[2]),
        ),
      );
      continue;
    }
    nodes.push(h(Text, { key: keyPrefix + '-p-' + i, style: styles.spoPara }, line));
  }
  return nodes;
}

function renderSpoDocument(version, logo, category = null) {
  const sections = version.sections || {};
  const approver = sections.PEJABAT_PENETAP?.trim() || 'Dr. dr. Ediansyah, MARS';
  const issuedDate = formatDateLong(version.tgl_berlaku || version.tgl_dokumen);
  const templateList = version.template_sections || [];
  const isLegacySpo = category?.kode === 'SPO' || category?.id === 'cat-spo';
  const typeLabel = isLegacySpo
    ? 'STANDAR\nPROSEDUR\nOPERASIONAL'
    : String(category?.label || 'DOKUMEN').toUpperCase();

  const bodyRows = templateList.flatMap(({ code, label }) => {
    const rowLabel = SPO_SECTION_LABELS[code] || label.replace(/\s*\((?:dapat diurutkan|bila ada)\)\s*$/i, '').toUpperCase();
    const value = sections[code];
    const items = Array.isArray(value) ? value.filter((item) => item?.trim()) : [];
    const textVal = !Array.isArray(value) ? String(value || '').trim() : '';

    if (code === 'FORMULIR_PENDUKUNG' && !items.length && !textVal) return [];

    let bodyNodes;
    if (Array.isArray(value)) {
      const listItems = items.length ? items : ['-'];
      bodyNodes = listItems.flatMap((entry, idx) => {
        const subLines = String(entry).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        const first = subLines[0] || '';
        const cleanedFirst = first.replace(/^\d+\.\s*/, '');
        const nodes = [
          h(View, { key: code + '-item-' + idx, style: styles.spoListRow, wrap: false },
            h(Text, { style: styles.spoListNum }, (idx + 1) + '.'),
            h(Text, { style: styles.spoListText }, cleanedFirst),
          ),
        ];
        for (let j = 1; j < subLines.length; j += 1) {
          const sub = subLines[j].match(/^([a-z]\.)\s+(.+)$/i);
          if (sub) {
            nodes.push(
              h(View, { key: code + '-item-' + idx + '-sub-' + j, style: styles.spoListRow, wrap: false },
                h(Text, { style: styles.spoSubNum }, sub[1]),
                h(Text, { style: styles.spoListText }, sub[2]),
              ),
            );
          } else {
            nodes.push(
              h(View, { key: code + '-item-' + idx + '-sub-' + j, style: styles.spoListRow, wrap: false },
                h(Text, { style: styles.spoListNum }, ''),
                h(Text, { style: styles.spoListText }, subLines[j]),
              ),
            );
          }
        }
        return nodes;
      });
    } else {
      const lines = textVal ? textVal.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : ['-'];
      bodyNodes = renderSpoParagraphLines(code, lines);
    }

    return [
      h(View, { key: code, style: styles.spoRow, wrap: code === 'LANGKAH' },
        h(View, { style: styles.spoLabelCell },
          h(Text, { style: styles.spoLabelText }, rowLabel),
        ),
        h(View, { style: styles.spoBodyCell }, ...bodyNodes),
      ),
    ];
  });

  return h(Document, { title: version.judul || 'Draf dokumen' },
    h(Page, { size: 'A4', style: styles.spoPage },
      h(View, { fixed: true, style: styles.spoKopFixed },
        h(View, { style: styles.spoKopTop },
          h(View, { style: styles.spoBrandCell },
            h(Text, { style: styles.spoBrandText }, 'RS AN-NISA\nTANGERANG'),
            h(Image, { src: logo, style: styles.spoLogo }),
          ),
          h(View, { style: styles.spoTopRight },
            h(View, { style: styles.spoTitleBox },
              h(Text, { style: styles.spoTitleText }, (version.judul || 'DRAF DOKUMEN').toUpperCase()),
            ),
            h(View, { style: styles.spoMetaRow },
              h(View, { style: styles.spoMetaDoc },
                h(Text, { style: styles.spoMetaText }, 'No.Dokumen\n' + (version.nomor || '-')),
              ),
              h(View, { style: styles.spoMetaRev },
                h(Text, { style: styles.spoMetaText }, 'No.Revisi\n' + (version.revisi_label || '00')),
              ),
              h(View, { style: styles.spoMetaPage },
                h(Text, { style: styles.spoMetaText }, 'Halaman'),
              ),
            ),
          ),
        ),
        h(View, { style: styles.spoKopBottom },
          h(View, { style: styles.spoTypeCell },
            h(Text, { style: styles.spoTypeText }, typeLabel),
          ),
          h(View, { style: styles.spoDateCell },
            h(Text, { style: styles.spoMetaText }, 'Tanggal Terbit\n' + issuedDate),
          ),
          h(View, { style: styles.spoSignCell },
            h(Text, { style: styles.spoSignText }, 'Ditetapkan,\nDirektur RS'),
            h(Text, { style: styles.spoSignText }, approver),
          ),
        ),
      ),
      h(Text, {
        fixed: true,
        style: styles.spoPageNumFixed,
        render: ({ pageNumber, totalPages }) => pageNumber + '/' + totalPages,
      }),
      ...bodyRows,
    ),
  );
}

export async function renderDocumentPdf(version, doc, unit, category = null) {
  const logo = 'data:image/png;base64,' + (await readFile(logoFile)).toString('base64');
  const isSpo = category?.layout_type === 'SPO' || (!category?.layout_type && (category?.kode === 'SPO' || doc?.category_id === 'cat-spo'));
  if (isSpo) {
    return Readable.toWeb(await renderToStream(renderSpoDocument(version, logo, category)));
  }

  const content = (version.template_sections || []).flatMap(({ code, label }) => {
    const value = version.sections?.[code];
    const lines = (Array.isArray(value) ? value : [value]).filter((line) => line?.trim());
    if (!lines.length) return [];
    return [
      h(Text, { key: code, style: styles.heading, minPresenceAhead: 20 }, label.replace(/ \(dapat diurutkan\)$/, '')),
      ...lines.map((line, i) => h(Text, { key: code + i }, Array.isArray(value) ? (i + 1) + '. ' + line : line)),
    ];
  });
  const tree = h(Document, { title: version.judul || 'Draf dokumen' },
    h(Page, { size: 'A4', style: styles.page },
      h(View, { style: styles.header, wrap: false },
        h(Image, { src: logo, style: styles.logo }),
        h(View, { style: { flex: 1 } },
          h(Text, { style: styles.hospital }, 'RS AN-NISA TANGERANG'),
          h(Text, { style: styles.title }, version.judul || 'Draf dokumen'),
          h(Text, null, (version.nomor || '-') + '  |  Revisi ' + version.revisi_label),
          h(Text, null, 'Terbit ' + formatDateLong(version.approved_at) + '  |  Berlaku ' + formatDateLong(version.tgl_berlaku)))),
      ...content,
      h(Text, { fixed: true, style: styles.footer, render: ({ pageNumber, totalPages }) =>
        (unit?.nama || doc.unit_id) + '  |  Dokumen terkendali JDIH RS AN-NISA  |  Halaman ' + pageNumber + '/' + totalPages })));
  return Readable.toWeb(await renderToStream(tree));
}
