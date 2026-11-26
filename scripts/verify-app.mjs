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
  await send('auth/login', { method: 'POST', headers: { Origin: 'https://example.invalid' }, status: 403 });
  const [{ cookie: staff }, { cookie: coord }, { cookie: manager }, { cookie: admin }] =
    await Promise.all(['1989.04.12', '1985.11.03', '1978.02.19', '1221.21.23'].map(actor));
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
  console.log('Lulus PDF non-SPO, unggah & pratinjau PDF hasil scan pada template draf/terbit, dan proteksi versi upload terbit.');

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
}

try {
  await run();
} finally {
  if (root && path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('jdih-test-')) {
    await rm(root, { recursive: true, force: true });
  }
}
