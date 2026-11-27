import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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
  console.log('Lulus impor pengguna massal dan template password annisa123.');
}

try {
  await run();
} finally {
  if (root && path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('jdih-test-')) {
    await rm(root, { recursive: true, force: true });
  }
}
