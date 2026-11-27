import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseUserImportText } from '../lib/format.js';

const http = process.env.JDIH_TEST_URL;
const root = http ? null : await mkdtemp(path.join(os.tmpdir(), 'jdih-test-'));
if (root) {
  process.env.JDIH_STORAGE = 'local';
  process.env.JDIH_DATA_DIR = root;
  process.env.JDIH_DEMO = '1';
}
const handleApi = root ? (await import('../server/api.mjs')).handleApi : null;
const googleStore = await import('../server/google-store.mjs');
const base = http || 'http://localhost:3000';
const suffix = randomUUID().slice(0, 8);
const writeKey = randomUUID();
const demoPassword = 'AnnisaDemo2026';

async function send(route, { method = 'GET', cookie, body, key, headers = {}, status = 200, raw = false } = {}) {
  if (cookie) headers.Cookie = cookie;
  if (key) headers['Idempotency-Key'] = key;
  if (body && !ArrayBuffer.isView(body)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const url = new URL('/api/' + route, base);
  const response = handleApi
    ? await handleApi(new Request(url, { method, body, headers }), url.pathname.slice(5).split('/'))
    : await fetch(url, { method, body, headers });
  assert.equal(response.status, status, method + ' ' + route + ' ' + (response.status === status ? '' : await response.text()));
  if (raw) return Buffer.from(await response.arrayBuffer());
  return { body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
}

function actor(nik) {
  return send('auth/login', { method: 'POST', body: { nik, password: demoPassword } });
}

const draftMetadata = {
  judul: 'Verifikasi JDIH ' + suffix, nomor: 'JDIH/UAT/' + suffix, kata_kunci: 'verifikasi',
  tgl_dokumen: '2026-01-01', tgl_berlaku: '2026-01-01', edit_version: 1,
  sections: { PENGERTIAN: 'Pengujian format dokumen JDIH.', LANGKAH: ['Susun dokumen.', 'Periksa dan terbitkan.'] },
};

async function run() {
  await send('state', { status: 401 });
  await send('auth/ping', { status: 401 });
  await send('auth/login', { method: 'POST', headers: { Origin: 'https://example.invalid' }, status: 403 });
  const [{ cookie: staff }, { cookie: coord }, { cookie: manager }, { cookie: admin }] =
    await Promise.all(['1989.04.12', '1985.11.03', '1978.02.19', '1221.21.23'].map(actor));
  assert.equal((await send('auth/ping', { cookie: staff })).body.ok, true);
  const create = { method: 'POST', cookie: coord, key: writeKey,
    body: { unit_id: 'u-21', category_id: 'cat-spo', metode: 'TEMPLATE' } };
  const { body: { documentId, versionId } } = await send('documents', create);
  assert.equal((await send('documents', create)).body.versionId, versionId);
  await send('documents', { ...create, cookie: staff, status: 403 });
  await send('versions/' + versionId, { cookie: staff, status: 403 });
  await send('versions/' + versionId + '/files/pdf', { cookie: staff, status: 403 });
  await send('versions/' + versionId, { cookie: manager, status: 403 });
  const result = await send('versions/' + versionId, { method: 'PATCH', cookie: coord, body: draftMetadata });
  assert.equal(result.body.version.edit_version, 2);
  await send('versions/' + versionId, { method: 'PATCH', cookie: coord, body: draftMetadata, status: 409 });
  await send('versions/' + versionId + '/submit', { method: 'POST', cookie: coord, body: { edit_version: 2 } });
  await send('versions/' + versionId, { method: 'PATCH', cookie: coord, body: draftMetadata, status: 409 });
  const notices = await send('notifications', { cookie: manager });
  assert(notices.body.items.some((note) => note.target_id === versionId));
  await send('versions/' + versionId + '/withdraw', { method: 'POST', cookie: coord });
  await send('versions/' + versionId, { cookie: manager, status: 403 });
  await send('versions/' + versionId + '/submit', { method: 'POST', cookie: coord });
  const review = 'versions/' + versionId + '/review';
  await send(review, { method: 'POST', cookie: coord, body: { aksi: 'SETUJUI' }, status: 403 });
  await send(review, { method: 'POST', cookie: manager, body: { aksi: 'KEMBALIKAN', catatan: '' }, status: 422 });
  const pending = (await send('versions/' + versionId, { cookie: manager })).body;
  const annotation = { field: 'LANGKAH', index: 1, start: 0, end: 7, quote: 'Periksa', note: 'Sebutkan petugas yang memeriksa.' };
  const returnWithNote = {
    method: 'POST', cookie: manager,
    body: { aksi: 'KEMBALIKAN', submitted_at: pending.submitted_at, annotations: [annotation] },
  };
  await send(review, { ...returnWithNote, body: { ...returnWithNote.body, submitted_at: '2020-01-01' }, status: 409 });
  await send(review, { ...returnWithNote, body: { ...returnWithNote.body, annotations: [{ ...annotation, quote: 'keliru' }] }, status: 409 });
  await send(review, returnWithNote);
  const returned = (await send('state', { cookie: coord })).body;
  assert.equal(returned.versions.find((version) => version.id === versionId).status, 'DIKEMBALIKAN');
  assert.deepEqual(returned.reviewLogs.find((log) => log.version_id === versionId && log.aksi === 'KEMBALIKAN').annotations, [annotation]);
  await send('versions/' + versionId, { cookie: staff, status: 403 });
  await send('versions/' + versionId + '/submit', { method: 'POST', cookie: coord });
  const decision = { method: 'POST', cookie: manager, key: randomUUID(), body: { aksi: 'SETUJUI' } };
  await send(review, decision);
  await send(review, decision);
  await send(review, { ...decision, key: null, status: 409 });

  const listing = await send('documents?q=' + suffix, { cookie: staff });
  assert.equal(listing.body.total, 1);
  assert.equal(listing.body.items[0].id, documentId);
  const staffState = (await send('state', { cookie: staff })).body;
  assert(!staffState.reviewLogs.some((log) => log.version_id === versionId));
  const pdf = await send('versions/' + versionId + '/files/pdf', { cookie: staff, raw: true });
  assert.equal(pdf.toString('ascii', 0, 5), '%PDF-');
  const { body: { versionId: revision } } = await send('documents/' + documentId + '/revisions', { method: 'POST', cookie: coord });
  await send('documents/' + documentId + '/revisions', { method: 'POST', cookie: coord, status: 409 });
  await send('versions/' + revision + '/submit', { method: 'POST', cookie: coord,
    body: { edit_version: 1, ringkasan_perubahan: 'Revisi terjadwal', tgl_berlaku: '2099-01-01' } });
  await send('versions/' + revision + '/review', { method: 'POST', cookie: manager, body: { aksi: 'SETUJUI' } });
  const published = await send('documents?q=' + suffix, { cookie: staff });
  assert.equal(published.body.items[0].version.id, versionId);
  const changeStatus = 'documents/' + documentId + '/status';
  await send(changeStatus, { method: 'POST', cookie: coord, body: { status_aktif: 'TIDAK_AKTIF', alasan: 'Diganti.' } });
  assert.equal((await send('documents?q=' + suffix, { cookie: staff })).body.total, 0);
  assert.equal((await send('documents?showInactive=true&q=' + suffix, { cookie: staff })).body.total, 1);
  await send(changeStatus, { method: 'POST', cookie: coord, body: { status_aktif: 'AKTIF', alasan: 'Berlaku kembali.' } });
  console.log('Lulus login, cakupan unit, konflik edit, idempotensi, pengajuan, review, PDF, revisi, dan status dokumen.');

  const { body: { versionId: imported } } = await send('documents', { method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: 'cat-spo', metode: 'UPLOAD' } });
  await send('versions/' + imported, { method: 'PATCH', cookie: coord,
    body: { ...draftMetadata, nomor: 'IMP/' + suffix, judul: 'Impor ' + suffix } });
  const fileRoute = 'versions/' + imported + '/files';
  const { body: { uploadId } } = await send(fileRoute, { method: 'POST', cookie: coord, body: { name: 'uji.pdf', size: pdf.length } });
  const part = { method: 'PUT', cookie: coord, body: pdf, headers: { 'Upload-Offset': '0' } };
  assert.equal((await send(fileRoute + '/' + uploadId, part)).body.ready, true);
  assert.equal((await send(fileRoute + '/' + uploadId, part)).body.offset, pdf.length);
  await send('versions/' + imported + '/submit', { method: 'POST', cookie: coord });
  await send('versions/' + imported + '/review', { method: 'POST', cookie: manager, body: { aksi: 'SETUJUI' } });
  assert.deepEqual(await send(fileRoute + '/pdf?download=1', { cookie: staff, raw: true }), pdf);
  console.log('Lulus unggah PDF, pengulangan potongan, dan unduh PDF asli.');

  // Verifikasi PDF non-SPO (cat-kebijakan) dan unggah PDF hasil scan pada dokumen TEMPLATE (draf & terbit)
  const { body: { versionId: kebVer } } = await send('documents', { method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: 'cat-kebijakan', metode: 'TEMPLATE' } });
  await send('versions/' + kebVer, { method: 'PATCH', cookie: coord,
    body: { ...draftMetadata, nomor: 'KEB/' + suffix, judul: 'Kebijakan ' + suffix,
      sections: { LATAR_BELAKANG: 'Uji kebijakan.', TUJUAN: 'Menjamin kompatibilitas PDF non-SPO.' } } });
  await send('versions/' + kebVer + '/submit', { method: 'POST', cookie: coord });
  await send('versions/' + kebVer + '/review', { method: 'POST', cookie: manager, body: { aksi: 'SETUJUI' } });
  const kebPdf = await send('versions/' + kebVer + '/files/pdf', { cookie: staff, raw: true });
  assert.equal(kebPdf.toString('ascii', 0, 5), '%PDF-');

  const scanBytesDraft = Buffer.concat([pdf, Buffer.from('\n%scan-draft\n')]);
  const { body: { versionId: tplScanVer } } = await send('documents', { method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: 'cat-spo', metode: 'TEMPLATE' } });
  const tplDraftScanRoute = 'versions/' + tplScanVer + '/files';
  const { body: { uploadId: tplDraftScanId } } = await send(tplDraftScanRoute, { method: 'POST', cookie: coord,
    body: { name: 'scan-draf.pdf', size: scanBytesDraft.length, kind: 'PDF' } });
  assert.equal((await send(tplDraftScanRoute + '/' + tplDraftScanId, {
    method: 'PUT', cookie: coord, body: scanBytesDraft, headers: { 'Upload-Offset': '0' } })).body.ready, true);
  assert.deepEqual(await send(tplDraftScanRoute + '/scan', { cookie: coord, raw: true }), scanBytesDraft);
  assert.equal((await send(tplDraftScanRoute + '/pdf', { cookie: coord, raw: true })).toString('ascii', 0, 5), '%PDF-');

  const scanBytesApproved = Buffer.concat([pdf, Buffer.from('\n%scan-approved\n')]);
  const approvedScanRoute = 'versions/' + versionId + '/files';
  await send(approvedScanRoute, { method: 'POST', cookie: staff,
    body: { name: 'scan-ditolak.pdf', size: scanBytesApproved.length, kind: 'PDF' }, status: 403 });
  const { body: { uploadId: approvedScanId } } = await send(approvedScanRoute, { method: 'POST', cookie: coord,
    body: { name: 'scan-resmi.pdf', size: scanBytesApproved.length, kind: 'PDF' } });
  assert.equal((await send(approvedScanRoute + '/' + approvedScanId, {
    method: 'PUT', cookie: coord, body: scanBytesApproved, headers: { 'Upload-Offset': '0' } })).body.ready, true);
  assert.deepEqual(await send(approvedScanRoute + '/scan', { cookie: staff, raw: true }), scanBytesApproved);

  await send(fileRoute, { method: 'POST', cookie: coord,
    body: { name: 'ganti-upload.pdf', size: pdf.length, kind: 'PDF' }, status: 409 });

  await send(tplDraftScanRoute + '/scan', { method: 'DELETE', cookie: coord });
  await send(tplDraftScanRoute + '/scan', { cookie: coord, status: 404 });
  await send(approvedScanRoute + '/scan', { method: 'DELETE', cookie: staff, status: 403 });
  await send(approvedScanRoute + '/scan', { method: 'DELETE', cookie: coord });
  await send(approvedScanRoute + '/scan', { cookie: staff, status: 404 });
  await send(fileRoute + '/scan', { method: 'DELETE', cookie: coord, status: 409 });
  console.log('Lulus PDF non-SPO, unggah/hapus & pratinjau PDF hasil scan pada template draf/terbit, dan proteksi versi upload terbit.');

  if (root) {
    const requests = await Promise.all(['u-21', 'u-32'].map(async (unit_id) => {
      const result = await send('documents', { method: 'POST', cookie: coord,
        body: { unit_id, category_id: 'cat-spo', metode: 'TEMPLATE' } });
      const version = result.body.versionId;
      await send('versions/' + version, { method: 'PATCH', cookie: coord, body: { ...draftMetadata, nomor: 'RACE/' + suffix } });
      return handleApi(new Request(base + '/api/versions/' + version + '/submit', { method: 'POST', headers: { Cookie: coord } }),
        ['versions', version, 'submit']);
    }));
    assert.deepEqual(requests.map(({ status }) => status).sort(), [200, 409]);
    console.log('Lulus benturan dua pengajuan dengan nomor yang sama.');
  }

  const { body: { id, temporaryPassword } } = await send('admin/users', { method: 'POST', cookie: admin,
    body: { nik: String(Math.floor(10_000_000 + Math.random() * 90_000_000)).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3'), nama: 'Uji ' + suffix } });
  const { body: { items } } = await send('admin/users', { cookie: admin });
  const { nik } = items.find((item) => item.id === id);
  await send('admin/assignments', { method: 'POST', cookie: admin, body: { user_id: id, unit_id: 'u-02', peran: 'MANAJER' } });
  await send('admin/assignments', { method: 'POST', cookie: admin, body: { user_id: id, unit_id: 'u-02', peran: 'KOORDINATOR' }, status: 409 });
  const { cookie: initial } = await send('auth/login', { method: 'POST', body: { nik, password: temporaryPassword } });
  await send('documents', { cookie: initial, status: 403 });
  const { cookie: changed } = await send('auth/password', { method: 'POST', cookie: initial, body: { password: 'PasswordUAT1' } });
  await send('documents', { cookie: changed });
  for (let i = 0; i < 5; i += 1) {
    await send('auth/login', { method: 'POST', body: { nik, password: 'Salah1' }, status: i === 4 ? 429 : 401 });
  }
  await send('auth/login', { method: 'POST', body: { nik, password: 'PasswordUAT1' }, status: 429 });
  const reset = await send('admin/users/' + id + '/reset', { method: 'POST', cookie: admin });
  await send('documents', { cookie: changed, status: 401 });
  await send('auth/login', { method: 'POST', body: { nik, password: reset.body.temporaryPassword } });

  const randNik = () => String(Math.floor(10_000_000 + Math.random() * 90_000_000)).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3');
  await send('admin/users', { method: 'POST', cookie: admin,
    body: { nik: randNik(), nama: 'Tanpa Unit', peran: 'MANAJER', unit_ids: [] }, status: 422 });
  const { body: { id: directCoordId } } = await send('admin/users', { method: 'POST', cookie: admin,
    body: { nik: randNik(), nama: 'Koor Langsung ' + suffix, peran: 'KOORDINATOR', unit_ids: ['u-21', 'u-32'] } });
  const { body: { items: directAssignments } } = await send('admin/assignments', { cookie: admin });
  assert.deepEqual(
    directAssignments.filter((a) => a.user_id === directCoordId && a.is_active && a.peran === 'KOORDINATOR')
      .map((a) => a.unit_id).sort(),
    ['u-21', 'u-32'],
  );
  console.log('Lulus admin, penugasan langsung saat tambah pengguna, ganti password wajib, lockout, dan reset sesi.');

  // Verifikasi Super Admin bisa tambah dokumen sendiri, ajukan tanpa manajer unit, dan setujui sendiri
  assert.match(documentId, /^doc-\d{3,}$/);
  assert.match(versionId, /^ver-\d{3,}$/);
  assert.match(id, /^usr-\d{3,}$/);
  assert.match(uploadId, /^att-\d{3,}$/);

  const { body: { id: freshUnitId } } = await send('admin/units', {
    method: 'POST', cookie: admin,
    body: { kode: 'UJI' + suffix.slice(0, 4).toUpperCase(), nama: 'Unit Uji ' + suffix },
  });
  assert.match(freshUnitId, /^u-\d{2,}$/);

  const importCode = 'IMP' + suffix.toUpperCase();
  const importName = 'Unit Impor, ' + suffix;
  const unitImport = {
    csv: [
      '\uFEFFKODE;UNIT',
      `uji${suffix.slice(0, 4)};Nama berbeda`,
      `LAIN${suffix};unit uji ${suffix.toUpperCase()}`,
      `${importCode};"${importName}"`,
      `${importCode.toLowerCase()};Nama duplikat dalam CSV`,
      `DUP${suffix};${importName.toUpperCase()}`,
      `KOSONG${suffix};`,
    ].join('\r\n'),
  };
  await send('admin/units/import', { method: 'POST', cookie: staff, body: unitImport, status: 403 });
  await send('admin/units/import', { method: 'POST', cookie: admin, body: { csv: 'Kode,Alamat\nA,Alamat' }, status: 422 });
  const { body: unitResult } = await send('admin/units/import', { method: 'POST', cookie: admin, body: unitImport });
  assert.equal(unitResult.imported, 1);
  assert.deepEqual(unitResult.skipped.map(({ row }) => row), [2, 3, 5, 6, 7]);
  assert.match(unitResult.skipped[0].reason, /^Kode/);
  assert.match(unitResult.skipped[1].reason, /^Nama/);
  const { body: { items: importedUnits } } = await send('admin/units', { cookie: admin });
  assert.equal(importedUnits.find(({ id }) => id === freshUnitId).nama, 'Unit Uji ' + suffix);
  const importedUnit = importedUnits.find(({ kode }) => kode === importCode);
  assert.equal(importedUnit.nama, importName);
  assert.equal(importedUnit.is_active, true);
  await send(`admin/units/${importedUnit.id}`, { method: 'PATCH', cookie: admin, body: { is_active: false } });
  const { body: repeatedImport } = await send('admin/units/import', { method: 'POST', cookie: admin, body: unitImport });
  assert.equal(repeatedImport.imported, 0);
  assert.equal(repeatedImport.skipped.length, 6);

  const bulkUnits = Array.from({ length: 35 }, (_, i) => `B${suffix}${i},Unit Bulk ${suffix} ${i}`);
  const bulkCsv = ['KODE,UNIT', ...bulkUnits, bulkUnits[0]].join('\n');
  let unitCursor = 0;
  let bulkImported = 0;
  const bulkSkipped = [];
  do {
    const { body: batch } = await send('admin/units/import', {
      method: 'POST', cookie: admin, body: { cursor: unitCursor, csv: bulkCsv },
    });
    assert.equal(batch.total, bulkUnits.length + 1);
    if (batch.nextCursor !== null) assert(batch.nextCursor > unitCursor);
    if (unitCursor === 0) assert.notEqual(batch.nextCursor, null);
    bulkImported += batch.imported;
    bulkSkipped.push(...batch.skipped);
    unitCursor = batch.nextCursor;
  } while (unitCursor !== null);
  assert.equal(bulkImported, bulkUnits.length);
  assert.deepEqual(bulkSkipped.map(({ row }) => row), [37]);

  const { body: { documentId: adminDocId, versionId: adminVerId } } = await send('documents', {
    method: 'POST', cookie: admin,
    body: { unit_id: freshUnitId, category_id: 'cat-spo', metode: 'TEMPLATE' },
  });
  await send('versions/' + adminVerId, {
    method: 'PATCH', cookie: admin,
    body: { ...draftMetadata, nomor: 'SA/' + suffix, judul: 'Dokumen Super Admin ' + suffix },
  });
  await send('versions/' + adminVerId + '/submit', { method: 'POST', cookie: admin, key: randomUUID() });
  const adminQueue = await send('reviews', { cookie: admin });
  assert(adminQueue.body.items.some((v) => v.id === adminVerId));
  await send('versions/' + adminVerId + '/review', { method: 'POST', cookie: admin, body: { aksi: 'SETUJUI' } });
  const adminPublished = await send('documents?q=' + encodeURIComponent('SA/' + suffix), { cookie: staff });
  assert.equal(adminPublished.body.total, 1);
  assert.equal(adminPublished.body.items[0].id, adminDocId);

  // Non-superadmin tetap tidak boleh menyetujui dokumen buatannya sendiri (walau kemudian dijadikan manajer unit)
  const dualNik = randNik();
  const { body: { id: dualId, temporaryPassword: dualTmp } } = await send('admin/users', {
    method: 'POST', cookie: admin, body: { nik: dualNik, nama: 'Dual ' + suffix },
  });
  await send('admin/assignments', { method: 'POST', cookie: admin, body: { user_id: dualId, unit_id: 'u-21', peran: 'KOORDINATOR' } });
  const { cookie: dualInit } = await send('auth/login', { method: 'POST', body: { nik: dualNik, password: dualTmp } });
  const { cookie: dualCookie } = await send('auth/password', { method: 'POST', cookie: dualInit, body: { password: 'PasswordUAT1' } });
  const { body: { versionId: dualVerId } } = await send('documents', {
    method: 'POST', cookie: dualCookie, body: { unit_id: 'u-21', category_id: 'cat-spo', metode: 'TEMPLATE' },
  });
  await send('versions/' + dualVerId, {
    method: 'PATCH', cookie: dualCookie,
    body: { ...draftMetadata, nomor: 'DUAL/' + suffix, judul: 'Dokumen Dual ' + suffix },
  });
  await send('versions/' + dualVerId + '/submit', { method: 'POST', cookie: dualCookie });
  const { body: { items: dualAssigns } } = await send('admin/assignments', { cookie: admin });
  const koorAssign = dualAssigns.find((a) => a.user_id === dualId && a.unit_id === 'u-21' && a.is_active);
  await send('admin/assignments/' + koorAssign.id, { method: 'DELETE', cookie: admin });
  await send('admin/assignments', { method: 'POST', cookie: admin, body: { user_id: dualId, unit_id: 'u-21', peran: 'MANAJER' } });
  await send('versions/' + dualVerId + '/review', { method: 'POST', cookie: dualCookie, body: { aksi: 'SETUJUI' }, status: 403 });
  console.log('Lulus izin penuh Super Admin (buat, ajukan, setujui sendiri) dan proteksi non-superadmin.');

  // Verifikasi encoding Sheets terbaca manusia, tanpa hash selain password_hash, dan nama folder Drive terbaca
  const sampleState = {
    users: [
      { id: 'usr-001', nik: '1221.21.23', nama: 'M. Fadhil Pratama', unit_home: 'DTO', is_super_admin: true, is_active: true, must_change_password: false, password_hash: '$2b$12$examplebcrypthashvalue123456789012345678901234567890' },
      { id: 'usr-002', nik: '1985.11.03', nama: 'Ns. Budi Santoso', unit_home: 'IGD', is_super_admin: false, is_active: true, must_change_password: false, password_hash: '$2b$12$otherbcrypthashvalue12345678901234567890123456789012' },
    ],
    units: [{ id: 'u-21', kode: 'IGD', nama: 'IGD', drive_folder_id: 'drv-igd', is_active: true }],
    categories: [{ id: 'cat-spo', kode: 'SPO', label: 'SPO', contoh_nomor: 'RSAN/SPO/5/DTO/007', template_version: 3, urutan: 5, sections: [{ code: 'PENGERTIAN', label: 'Pengertian', type: 'textarea' }] }],
    userUnits: [{ id: 'uu-001', user_id: 'usr-002', unit_id: 'u-21', peran: 'KOORDINATOR', is_active: true }],
    documents: [{ id: 'doc-001', unit_id: 'u-21', category_id: 'cat-spo', status_aktif: 'AKTIF', alasan_tidak_aktif: '', tgl_tidak_aktif: '', created_by: 'usr-002' }],
    versions: [{
      id: 'ver-001', document_id: 'doc-001', revisi_label: '00', judul: 'SPO Triase', nomor: 'RSAN/SPO/IGD/001',
      tgl_dokumen: '2026-01-01', tgl_berlaku: '2026-01-01', kata_kunci: 'triase', ringkasan_perubahan: '',
      metode: 'UPLOAD', status: 'DISETUJUI', template_version: 3, template_sections: [], edit_version: 2,
      created_by: 'usr-002', submitted_at: '2026-01-01T00:00:00.000Z', approved_at: '2026-01-02T00:00:00.000Z',
      approved_by: 'usr-001', return_note: '', sections: { PENGERTIAN: 'Triase IGD.' },
      attachments: [{ id: 'att-001', nama: 'spo.pdf', ukuran: '10 KB', mime: 'application/pdf', kind: 'PDF' }],
    }],
    uploads: [{ id: 'att-001', versionId: 'ver-001', userId: 'usr-002', nama: 'spo.pdf', size: 10240, ukuran: '10 KB', mime: 'application/pdf', kind: 'PDF', offset: 10240, offsets: [0], chunk_hashes: { 0: 'deadbeef' }, expires: Date.now() + 60_000, ready: true, drive_id: 'drv-file-1', upload_url: 'https://example.invalid/temp' }],
    reviewLogs: [{ id: 'rlog-001', version_id: 'ver-001', user_id: 'usr-001', aksi: 'SETUJUI', catatan: '', created_at: '2026-01-02T00:00:00.000Z' }],
    documentLogs: [{ id: 'dlog-001', document_id: 'doc-001', user_id: 'usr-002', aksi: 'NONAKTIFKAN', alasan: 'Uji', created_at: '2026-01-03T00:00:00.000Z' }],
    notifications: [{ id: 'ntf-001', user_id: 'usr-002', jenis: 'DISETUJUI', target_id: 'doc-001', url: '#/dokumen/doc-001', pesan: 'OK', is_read: false, is_relevant: true, created_at: '2026-01-02T00:00:00.000Z' }],
    operations: { 'usr-001:op-1': { user_id: 'usr-001', aksi: 'POST /api/documents', fingerprint: 'POST /api/documents {"unit_id":"u-21"}', result: { documentId: 'doc-001' }, expires: Date.now() + 60_000 } },
  };
  const encoded = googleStore.encodeTables(sampleState);
  assert.equal(encoded.Documents[0].created_by, 'Ns. Budi Santoso');
  assert.equal(encoded.Documents[0].created_by_id, 'usr-002');
  assert.equal(encoded.Documents[0].nama_unit, 'IGD');
  assert.equal(encoded.Document_Versions[0].created_by, 'Ns. Budi Santoso');
  assert.equal(encoded.Document_Versions[0].approved_by, 'M. Fadhil Pratama');
  assert.equal(encoded.User_Units[0].nama_user, 'Ns. Budi Santoso');
  assert.equal(encoded.Attachments[0].nama_user, 'Ns. Budi Santoso');
  assert.equal(encoded.Attachments[0].upload_url, '');
  assert(!('chunk_hashes' in encoded.Attachments[0]));
  assert.equal(encoded.Review_Log[0].nama_user, 'M. Fadhil Pratama');
  assert.equal(encoded.Document_Log[0].nama_user, 'Ns. Budi Santoso');
  assert.equal(encoded.Notifications[0].nama_user, 'Ns. Budi Santoso');
  assert.equal(encoded.Operations[0].nama_user, 'M. Fadhil Pratama');
  for (const [tableName, rows] of Object.entries(encoded)) {
    for (const row of rows) {
      for (const [col, val] of Object.entries(row)) {
        if (tableName === 'Users' && col === 'password_hash') {
          assert(String(val).startsWith('$2'));
        } else {
          assert(!/^[a-f0-9]{64}$/i.test(String(val)), `Hash tidak diizinkan pada ${tableName}.${col}`);
        }
      }
    }
  }
  const decoded = googleStore.decodeCloudTables(encoded);
  assert.equal(decoded.documents[0].created_by, 'usr-002');
  assert.equal(decoded.versions[0].created_by, 'usr-002');
  assert.equal(decoded.versions[0].approved_by, 'usr-001');
  // Legacy fallback: created_by hanya berisi user ID tanpa created_by_id
  const legacyEncoded = structuredClone(encoded);
  legacyEncoded.Documents[0].created_by = 'usr-002';
  delete legacyEncoded.Documents[0].created_by_id;
  assert.equal(googleStore.decodeCloudTables(legacyEncoded).documents[0].created_by, 'usr-002');

  assert.equal(googleStore.documentFolderName(sampleState.documents[0], sampleState.versions[0], sampleState.categories[0]), 'RSAN - SPO - IGD - 001 - SPO Triase');
  assert.equal(googleStore.versionFolderName(sampleState.versions[0]), 'Rev 00');

  // Legacy category rows missing is_active, allow_template, layout_type should decode safely
  const legacyCatEncoded = structuredClone(encoded);
  delete legacyCatEncoded.Categories[0].is_active;
  delete legacyCatEncoded.Categories[0].allow_template;
  delete legacyCatEncoded.Categories[0].layout_type;
  const decodedLegacyCat = googleStore.decodeCloudTables(legacyCatEncoded);
  assert.equal(decodedLegacyCat.categories[0].is_active, true);
  assert.equal(decodedLegacyCat.categories[0].allow_template, true);
  assert.equal(decodedLegacyCat.categories[0].layout_type, 'SPO');
  console.log('Lulus format Google Sheets terbaca manusia, tanpa hash selain password, dan nama folder Drive.');

  // Verifikasi default password annisa123 dan impor pengguna massal
  const defaultPwNik = randNik();
  const { body: singleDefaultRes } = await send('admin/users', {
    method: 'POST', cookie: admin, body: { nik: defaultPwNik, nama: 'Default Pw ' + suffix },
  });
  assert.equal(singleDefaultRes.temporaryPassword, 'annisa123');

  const impNik1Raw = randNik().replace(/\./g, '');
  const impNik1Fmt = impNik1Raw.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3');
  const impNik2 = randNik();
  await send('admin/users/import', {
    method: 'POST', cookie: staff, body: { users: [{ nik: randNik(), nama: 'Ditolak' }] }, status: 403,
  });
  const { body: importRes } = await send('admin/users/import', {
    method: 'POST', cookie: admin,
    body: {
      users: [
        { nik: impNik1Raw, nama: 'Impor Satu ' + suffix, password: '' },
        { nik: impNik2, nama: 'Impor Dua ' + suffix, password: 'CustomPass9' },
        { nik: impNik1Fmt, nama: 'Duplikat ' + suffix },
        { nik: 'bad', nama: 'NIK Salah' },
      ],
    },
  });
  assert.equal(importRes.imported, 2);
  assert.equal(importRes.skipped.length, 2);
  importRes.ids.forEach((createdId) => assert.match(createdId, /^usr-\d{3,}$/));

  const { cookie: impInit1 } = await send('auth/login', {
    method: 'POST', body: { nik: impNik1Fmt, password: 'annisa123' },
  });
  await send('documents', { cookie: impInit1, status: 403 });
  await send('auth/login', { method: 'POST', body: { nik: impNik2, password: 'CustomPass9' } });

  // Verifikasi impor Excel/CSV dengan UNIT dan JABATAN DI UNIT -> role & penugasan unit otomatis
  const { body: stateBefore } = await send('state', { cookie: admin });
  const roleNik1 = randNik();
  const roleNik2 = randNik();
  const roleNik3 = randNik();
  const roleNik4 = randNik();
  const roleNik5 = randNik();
  const excelPaste = [
    'NIK\tNAMA\tUNIT\tJABATAN DI UNIT',
    `${roleNik1}\tNoviyanti ${suffix}\tAKUNTANSI\tKoordinator Unit`,
    `${roleNik2}\tDoni ${suffix}\tFarmasi\tManajer`,
    `${roleNik3}\tSari ${suffix}\tIGD\tPerawat Pelaksana`,
    `${roleNik4}\tSkip Koordinator ${suffix}\tUnit Tidak Ada\tKoordinator Unit`,
    `${roleNik5}\tSkip Staf ${suffix}\tUnit Tidak Ada\tPerawat Pelaksana`,
  ].join('\n');
  const parsedExcel = parseUserImportText(excelPaste, 'annisa123', stateBefore.users, stateBefore.units);
  assert.equal(parsedExcel.length, 5);
  assert.equal(parsedExcel[0].peran, 'KOORDINATOR');
  assert.deepEqual(parsedExcel[0].unit_ids, ['u-03']);
  assert.equal(parsedExcel[0].unit_home, 'Akuntansi & Keuangan');
  assert.equal(parsedExcel[1].peran, 'MANAJER');
  assert.deepEqual(parsedExcel[1].unit_ids, ['u-17']);
  assert.equal(parsedExcel[2].peran, 'STAF');
  assert.equal(parsedExcel[2].unit_home, 'IGD');
  assert.equal(parsedExcel[3].valid, false);
  assert.equal(parsedExcel[3].reason, 'Unit tidak ditemukan di daftar unit aktif');
  assert.equal(parsedExcel[4].valid, false);
  assert.equal(parsedExcel[4].reason, 'Unit tidak ditemukan di daftar unit aktif');

  const { body: roleImportRes } = await send('admin/users/import', {
    method: 'POST',
    cookie: admin,
    body: {
      users: parsedExcel.map(({ nik: n, nama: nm, unit, unit_home, unit_ids, has_unit_col, jabatan, peran: pRole, password: p }) => ({
        nik: n, nama: nm, unit, unit_home, unit_ids, require_unit: Boolean(has_unit_col), jabatan, peran: pRole, password: p,
      })),
    },
  });
  assert.equal(roleImportRes.imported, 3);
  assert.equal(roleImportRes.assigned, 2);
  assert.equal(roleImportRes.skipped.length, 2);

  const { body: stateAfter } = await send('state', { cookie: admin });
  const u1 = stateAfter.users.find((u) => u.nik === roleNik1);
  const u2 = stateAfter.users.find((u) => u.nik === roleNik2);
  const u3 = stateAfter.users.find((u) => u.nik === roleNik3);
  const u4 = stateAfter.users.find((u) => u.nik === roleNik4);
  const u5 = stateAfter.users.find((u) => u.nik === roleNik5);
  assert.equal(u1.unit_home, 'Akuntansi & Keuangan');
  assert.ok(stateAfter.userUnits.some((a) => a.is_active && a.user_id === u1.id && a.unit_id === 'u-03' && a.peran === 'KOORDINATOR'));
  assert.equal(u2.unit_home, 'Farmasi');
  assert.ok(stateAfter.userUnits.some((a) => a.is_active && a.user_id === u2.id && a.unit_id === 'u-17' && a.peran === 'MANAJER'));
  assert.equal(u3.unit_home, 'IGD');
  assert.equal(stateAfter.userUnits.some((a) => a.is_active && a.user_id === u3.id), false);
  assert.equal(u4, undefined);
  assert.equal(u5, undefined);

  // Verifikasi NIK duplikat diizinkan jika memegang 2+ unit berbeda (dalam batch & user terdaftar)
  const multiNik = randNik();
  const multiExcel = [
    'NIK\tNAMA\tUNIT\tJABATAN DI UNIT',
    `${multiNik}\tMulti Unit ${suffix}\tAKUNTANSI\tKoordinator Unit`,
    `${multiNik}\tMulti Unit ${suffix}\tPEMASARAN\tKoordinator Unit`,
    `${multiNik}\tMulti Unit ${suffix}\tAKUNTANSI\tKoordinator Unit`,
  ].join('\n');
  const parsedMulti = parseUserImportText(multiExcel, 'annisa123', stateAfter.users, stateAfter.units, stateAfter.userUnits);
  assert.equal(parsedMulti.length, 3);
  assert.equal(parsedMulti[0].valid, true);
  assert.equal(parsedMulti[1].valid, true);
  assert.equal(parsedMulti[1].reason, 'Tambah unit (NIK sama)');
  assert.equal(parsedMulti[2].valid, false);
  assert.equal(parsedMulti[2].reason, 'Penugasan unit sudah ada di daftar');

  const { body: multiImportRes } = await send('admin/users/import', {
    method: 'POST',
    cookie: admin,
    body: {
      users: parsedMulti.map(({ nik: n, nama: nm, unit, unit_home, unit_ids, jabatan, peran: pRole, password: p }) => ({
        nik: n, nama: nm, unit, unit_home, unit_ids, jabatan, peran: pRole, password: p,
      })),
    },
  });
  assert.equal(multiImportRes.imported, 1);
  assert.equal(multiImportRes.assigned, 2);
  assert.equal(multiImportRes.merged, 1);
  assert.equal(multiImportRes.skipped.length, 1);

  const { body: stateMid } = await send('state', { cookie: admin });
  const multiUsers = stateMid.users.filter((u) => u.nik === multiNik);
  assert.equal(multiUsers.length, 1);
  const multiUser = multiUsers[0];
  assert.equal(multiUser.unit_home, 'Akuntansi & Keuangan, Pemasaran');
  assert.ok(stateMid.userUnits.some((a) => a.is_active && a.user_id === multiUser.id && a.unit_id === 'u-03' && a.peran === 'KOORDINATOR'));
  assert.ok(stateMid.userUnits.some((a) => a.is_active && a.user_id === multiUser.id && a.unit_id === 'u-06' && a.peran === 'KOORDINATOR'));

  // Impor ulang user terdaftar dengan unit ke-3 (Farmasi | Manajer)
  const thirdExcel = `${multiNik}\tMulti Unit ${suffix}\tFarmasi\tManajer`;
  const parsedThird = parseUserImportText(thirdExcel, 'annisa123', stateMid.users, stateMid.units, stateMid.userUnits);
  assert.equal(parsedThird.length, 1);
  assert.equal(parsedThird[0].valid, true);
  assert.equal(parsedThird[0].reason, 'Tambah penugasan unit');

  const { body: thirdImportRes } = await send('admin/users/import', {
    method: 'POST',
    cookie: admin,
    body: {
      users: parsedThird.map(({ nik: n, nama: nm, unit, unit_home, unit_ids, jabatan, peran: pRole, password: p }) => ({
        nik: n, nama: nm, unit, unit_home, unit_ids, jabatan, peran: pRole, password: p,
      })),
    },
  });
  assert.equal(thirdImportRes.imported, 0);
  assert.equal(thirdImportRes.assigned, 1);
  assert.equal(thirdImportRes.merged, 1);

  const { body: stateFinal } = await send('state', { cookie: admin });
  const finalUser = stateFinal.users.find((u) => u.id === multiUser.id);
  assert.equal(finalUser.unit_home, 'Akuntansi & Keuangan, Pemasaran, Farmasi');
  const finalAssigns = stateFinal.userUnits.filter((a) => a.is_active && a.user_id === multiUser.id);
  assert.equal(finalAssigns.length, 3);
  assert.ok(finalAssigns.some((a) => a.unit_id === 'u-17' && a.peran === 'MANAJER'));

  console.log('Lulus impor pengguna massal, mapping unit/jabatan, multi-unit NIK sama, dan template password annisa123.');

  // Verifikasi CRUD Jenis Dokumen, Versi Template (Opsi A), dan Jenis Khusus Unggah PDF Tunggal
  await send('admin/categories', {
    method: 'POST', cookie: staff,
    body: { kode: 'NOPE', label: 'Ditolak', contoh_nomor: 'X/1', sections: [{ label: 'Isi', type: 'textarea' }] },
    status: 403,
  });

  const { body: { id: customCatId, category: customCat } } = await send('admin/categories', {
    method: 'POST',
    cookie: admin,
    body: {
      kode: 'PPK_' + suffix.slice(0, 4).toUpperCase(),
      label: 'Panduan Praktik Klinis ' + suffix,
      contoh_nomor: 'RSAN/PPK/6/IGD/001',
      urutan: 6,
      allow_template: true,
      layout_type: 'STANDARD',
      template_version: 1,
      sections: [
        { label: 'Pengertian Medis', type: 'textarea' },
        { label: 'Anamnesis', type: 'list' },
      ],
    },
  });
  assert.match(customCatId, /^cat-\d{3,}$/);
  assert.equal(customCat.template_version, 1);
  assert.equal(customCat.sections[0].code, 'PENGERTIAN_MEDIS');
  assert.equal(customCat.sections[1].code, 'ANAMNESIS');

  const { body: { versionId: ppkVer1 } } = await send('documents', {
    method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: customCatId, metode: 'TEMPLATE' },
  });
  await send('versions/' + ppkVer1, {
    method: 'PATCH', cookie: coord,
    body: {
      judul: 'PPK Demam Berdarah ' + suffix,
      nomor: 'PPK1/' + suffix,
      tgl_dokumen: '2026-02-01',
      tgl_berlaku: '2026-02-01',
      edit_version: 1,
      sections: { PENGERTIAN_MEDIS: 'Infeksi dengue.', ANAMNESIS: ['Demam mendadak', 'Nyeri otot'] },
    },
  });
  await send('versions/' + ppkVer1 + '/submit', { method: 'POST', cookie: coord });
  await send('versions/' + ppkVer1 + '/review', { method: 'POST', cookie: manager, body: { aksi: 'SETUJUI' } });
  const ppkPdf = await send('versions/' + ppkVer1 + '/files/pdf', { cookie: staff, raw: true });
  assert.equal(ppkPdf.toString('ascii', 0, 5), '%PDF-');

  // Bump template version & update sections -> existing v1 snapshot stays untouched while new doc uses v2
  await send('admin/categories/' + customCatId, {
    method: 'PATCH',
    cookie: admin,
    body: {
      template_version: 2,
      sections: [
        { code: 'PENGERTIAN_MEDIS', label: 'Pengertian Medis', type: 'textarea' },
        { code: 'ANAMNESIS', label: 'Anamnesis', type: 'list' },
        { label: 'Pemeriksaan Penunjang', type: 'textarea' },
      ],
    },
  });
  const { body: { versionId: ppkVer2 } } = await send('documents', {
    method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: customCatId, metode: 'TEMPLATE' },
  });
  const ver1Snap = (await send('versions/' + ppkVer1, { cookie: staff })).body;
  const ver2Snap = (await send('versions/' + ppkVer2, { cookie: coord })).body;
  assert.equal(ver1Snap.template_version, 1);
  assert.equal(ver1Snap.template_sections.length, 2);
  assert.equal(ver2Snap.template_version, 2);
  assert.equal(ver2Snap.template_sections.length, 3);
  assert.equal(ver2Snap.template_sections[2].code, 'PEMERIKSAAN_PENUNJANG');

  // Upload-only category (data lama / scan TTD basah)
  const { body: { id: scanOnlyCatId, category: scanOnlyCat } } = await send('admin/categories', {
    method: 'POST',
    cookie: admin,
    body: {
      kode: 'ARSIP_' + suffix.slice(0, 4).toUpperCase(),
      label: 'Arsip Scan TTD Basah ' + suffix,
      contoh_nomor: 'RSAN/ARSIP/7/IGD/001',
      allow_template: false,
      sections: [],
    },
  });
  assert.equal(scanOnlyCat.allow_template, false);
  await send('documents', {
    method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: scanOnlyCatId, metode: 'TEMPLATE' },
    status: 422,
  });
  const { body: { versionId: scanOnlyVer } } = await send('documents', {
    method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: scanOnlyCatId, metode: 'UPLOAD' },
  });
  assert.match(scanOnlyVer, /^ver-\d{3,}$/);

  // Category with documents cannot be deleted (409), can be deactivated and blocks new document creation (422)
  await send('admin/categories/' + customCatId, { method: 'DELETE', cookie: admin, status: 409 });
  await send('admin/categories/' + customCatId, { method: 'PATCH', cookie: admin, body: { is_active: false } });
  await send('documents', {
    method: 'POST', cookie: coord,
    body: { unit_id: 'u-21', category_id: customCatId, metode: 'TEMPLATE' },
    status: 422,
  });

  // Unused category can be permanently deleted
  const { body: { id: tempCatId } } = await send('admin/categories', {
    method: 'POST',
    cookie: admin,
    body: {
      kode: 'TMP_' + suffix.slice(0, 4).toUpperCase(),
      label: 'Sementara ' + suffix,
      contoh_nomor: 'RSAN/TMP/001',
      allow_template: false,
      sections: [],
    },
  });
  await send('admin/categories/' + tempCatId, { method: 'DELETE', cookie: admin });
  const { body: finalCats } = await send('admin/categories', { cookie: admin });
  assert(!finalCats.items.some((c) => c.id === tempCatId));
  console.log('Lulus CRUD jenis dokumen, versi template snapshot, mode unggah PDF tunggal, nonaktif, dan hapus.');
}

try {
  await run();
} finally {
  if (root && path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('jdih-test-')) {
    await rm(root, { recursive: true, force: true });
  }
}
