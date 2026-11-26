import { createSign, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

const env = process.env;
export const cloudEnabled = env.JDIH_STORAGE === 'google';
const drive = 'https://www.googleapis.com/drive/v3/files';
const upload = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
let identity;
let access;
let leaseUntil = 0;
let original;
let sheetProperties;
let originalHeaders = null;
let originalColumnCounts = null;
let localTableCache = null;
let localAuthCache = null;

const getSpreadsheet = () => process.env.GOOGLE_SHEETS_ID?.trim() || '';
const getRootFolder = () => process.env.GOOGLE_DRIVE_ROOT_ID?.trim() || '';
const getKey = () => 'jdih:' + getSpreadsheet();
const getSheetsUrl = () => 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(getSpreadsheet());
const redisEnabled = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const sheetsAuthMode = () => !redisEnabled() && process.env.VERCEL === '1';
const authFile = () => path.join(path.resolve(process.env.JDIH_DATA_DIR || '.jdih'), 'cloud-auth.json');

const tables = {
  Users: 'users', Units: 'units', User_Units: 'userUnits', Categories: 'categories', Documents: 'documents',
  Document_Versions: 'versions', Version_Sections: 'sections', Attachments: 'uploads',
  Review_Log: 'reviewLogs', Document_Log: 'documentLogs', Notifications: 'notifications', Operations: 'operations',
};

const columns = {
  Users: 'id nik nama unit_home is_super_admin is_active must_change_password password_hash',
  Units: 'id kode nama drive_folder_id is_active',
  User_Units: 'id user_id nama_user unit_id nama_unit peran is_active',
  Categories: 'id kode label contoh_nomor template_version urutan sections',
  Documents: 'id unit_id nama_unit category_id jenis_dokumen status_aktif alasan_tidak_aktif tgl_tidak_aktif created_by created_by_id',
  Document_Versions: 'id document_id revisi_label judul nomor tgl_dokumen tgl_berlaku kata_kunci ringkasan_perubahan metode status template_version template_sections edit_version created_by created_by_id submitted_at approved_at approved_by approved_by_id return_note attachment_ids',
  Version_Sections: 'id version_id section_code urut isi',
  Attachments: 'id versionId userId nama_user nama size ukuran mime kind offset offsets expires ready drive_id upload_url',
  Review_Log: 'id version_id user_id nama_user aksi catatan created_at annotations',
  Document_Log: 'id document_id user_id nama_user aksi alasan created_at',
  Notifications: 'id user_id nama_user jenis target_id url pesan is_read is_relevant created_at',
  Operations: 'id user_id nama_user aksi fingerprint result expires',
};
const jsonFields = new Set(['sections', 'template_sections', 'attachment_ids', 'offsets', 'result', 'annotations']);

const unavailable = (message) => Object.assign(new Error(message), { unavailable: true });

async function redis(...command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(4500),
    headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw unavailable('Redis gagal diakses.');
  const { result, error } = await response.json();
  if (error) throw unavailable('Perintah Redis gagal.');
  return result;
}

function loadIdentity() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!raw && !file) {
    throw unavailable('Isi GOOGLE_SERVICE_ACCOUNT_JSON atau GOOGLE_SERVICE_ACCOUNT_FILE untuk mode Google.');
  }
  let parsed;
  try {
    const jsonText = raw
      ? (raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
      : readFileSync(path.resolve(process.cwd(), file), 'utf8');
    parsed = JSON.parse(jsonText);
  } catch {
    throw unavailable('Kredensial Service Account Google tidak dapat dibaca atau bukan JSON valid.');
  }
  if (!parsed?.client_email || !parsed?.private_key) {
    throw unavailable('Format kredensial Service Account Google tidak valid.');
  }
  parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
  return parsed;
}

async function getTableCache() {
  if (sheetsAuthMode()) return null;
  if (redisEnabled()) {
    const cached = await redis('GET', getKey() + ':tables');
    return cached ? JSON.parse(cached) : null;
  }
  if (localTableCache && localTableCache.expires > Date.now()) {
    return localTableCache.data;
  }
  localTableCache = null;
  return null;
}

async function setTableCache(data) {
  if (sheetsAuthMode()) return;
  if (redisEnabled()) {
    await redis('SET', getKey() + ':tables', JSON.stringify(data), 'EX', 30);
    return;
  }
  localTableCache = { data: structuredClone(data), expires: Date.now() + 30_000 };
}

async function clearTableCache() {
  if (sheetsAuthMode()) return;
  if (redisEnabled()) {
    await redis('DEL', getKey() + ':tables');
    return;
  }
  localTableCache = null;
}

async function loadCloudAuth() {
  if (redisEnabled()) {
    const auth = await redis('GET', getKey() + ':auth');
    return auth ? JSON.parse(auth) : { sessions: {}, attempts: {} };
  }
  if (!localAuthCache) {
    try {
      localAuthCache = JSON.parse(await readFile(authFile(), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      localAuthCache = { sessions: {}, attempts: {} };
    }
  }
  return structuredClone(localAuthCache);
}

async function saveCloudAuth(sessions, attempts) {
  const payload = { sessions, attempts };
  if (redisEnabled()) {
    await redis('SET', getKey() + ':auth', JSON.stringify(payload), 'EX', 1800);
    return;
  }
  const target = authFile();
  await mkdir(path.dirname(target), { recursive: true });
  const temp = target + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(payload), { mode: 0o600 });
  await rename(temp, target);
  localAuthCache = structuredClone(payload);
}

export async function withCloudLock(work) {
  const spreadsheet = getSpreadsheet();
  const rootFolder = getRootFolder();
  if (!spreadsheet || !rootFolder || process.env.JDIH_DEMO === '1') {
    throw unavailable('Konfigurasi Google Sheets dan Drive belum lengkap.');
  }
  identity ||= loadIdentity();
  if (!redisEnabled()) {
    leaseUntil = Date.now() + 50_000;
    try {
      return await work();
    } finally {
      leaseUntil = 0;
    }
  }
  const lockKey = getKey() + ':lock';
  const token = randomUUID();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const start = Date.now();
    if (await redis('SET', lockKey, token, 'NX', 'PX', 50_000) === 'OK') {
      leaseUntil = start + 50_000;
      try {
        return await work();
      } finally {
        leaseUntil = 0;
        await redis('EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
          1, lockKey, token).catch(() => {});
      }
    }
    await setTimeout(100);
  }
  throw unavailable('Penyimpanan sedang sibuk. Coba lagi.');
}

function canWrite() {
  if (Date.now() + 10_000 > leaseUntil) throw unavailable('Waktu penulisan habis. Coba lagi.');
}

async function token() {
  if (access?.expires > Date.now()) return access.value;
  const iat = Math.floor(Date.now() / 1000);
  const base64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claim = base64({ alg: 'RS256', typ: 'JWT' }) + '.' + base64({
    iss: identity.client_email, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
  });
  const assertion = claim + '.' + createSign('RSA-SHA256').update(claim).sign(identity.private_key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(7000),
    body: new URLSearchParams({ assertion, grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer' }),
  });
  if (!response.ok) throw unavailable('Service Account Google gagal diautentikasi.');
  const result = await response.json();
  access = { value: result.access_token, expires: Date.now() + (result.expires_in - 60) * 1000 };
  return access.value;
}

async function google(url, options = {}, statuses = []) {
  const authorization = 'Bearer ' + await token();
  if (options.method) canWrite();
  const response = await fetch(url, {
    ...options, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(options.stream ? 60_000 : 7000),
    headers: { ...options.headers, Authorization: authorization },
  });
  if (!response.ok && !statuses.includes(response.status)) {
    console.error('JDIH Google API', response.status, url.split('?')[0]);
    if (response.status === 403) {
      throw unavailable('Akses Google ditolak (403). Pastikan Spreadsheet dan Folder Drive sudah dibagikan ke Service Account.');
    }
    if (response.status === 404) {
      throw unavailable('Spreadsheet atau Folder Drive tidak ditemukan (404).');
    }
    throw unavailable('Layanan Google gagal (' + response.status + ').');
  }
  return response;
}

function post(url, value) {
  return google(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
}

async function ensureTables() {
  const sheetsUrl = getSheetsUrl();
  const result = await (await google(sheetsUrl + '?fields=sheets(properties)')).json();
  sheetProperties = Object.fromEntries(result.sheets.map(({ properties }) => [properties.title, properties]));
  const missing = Object.keys(tables).filter((name) => !sheetProperties[name]);
  if (!missing.length) return;
  const created = await (await post(sheetsUrl + ':batchUpdate', {
    requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
  })).json();
  for (const { addSheet: { properties } } of created.replies) sheetProperties[properties.title] = properties;
}

async function readTables() {
  await ensureTables();
  const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
  for (const name of Object.keys(tables)) query.append('ranges', name);
  const { valueRanges } = await (await google(getSheetsUrl() + '/values:batchGet?' + query)).json();
  originalHeaders = {};
  originalColumnCounts = {};
  return Object.fromEntries(Object.keys(tables).map((name, index) => {
    const [header = [], ...rows] = valueRanges[index]?.values || [];
    if (header.length && header[0] !== 'id') throw unavailable('Header tab ' + name + ' tidak valid.');
    originalHeaders[name] = header.join(' ');
    originalColumnCounts[name] = header.length;
    const records = rows.filter((row) => row[0]).map((row) => Object.fromEntries(header.flatMap((field, i) =>
      !field || row[i] === undefined ? [] : [[field, jsonFields.has(field) && row[i] ? JSON.parse(row[i]) : row[i]]])));
    return [name, records];
  }));
}

function resolveUserRef(idVal, nameVal, usersById, userIdByName) {
  if (idVal && usersById.has(idVal)) return idVal;
  if (nameVal && usersById.has(nameVal)) return nameVal;
  if (nameVal && userIdByName.has(nameVal)) return userIdByName.get(nameVal);
  return idVal || nameVal || null;
}

function parseExpiry(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value) return Date.parse(value) || 0;
  return 0;
}

export function decodeCloudTables(rawTables) {
  const state = Object.fromEntries(Object.entries(tables).map(([table, field]) => [field, structuredClone(rawTables[table] || [])]));
  const usersById = new Map(state.users.map((user) => [user.id, user]));
  const userIdByName = new Map(state.users.map((user) => [user.nama, user.id]));

  state.userUnits = state.userUnits.map(({ nama_user, nama_unit, ...entry }) => entry);
  state.documents = state.documents.map(({ nama_unit, jenis_dokumen, created_by_id, ...doc }) => ({
    ...doc,
    created_by: resolveUserRef(created_by_id, doc.created_by, usersById, userIdByName),
  }));
  state.uploads = state.uploads.map(({ nama_user, chunk_hashes, ...file }) => ({
    ...file,
    offsets: file.offsets || [],
    chunk_hashes: {},
    expires: parseExpiry(file.expires),
  }));
  const files = new Map(state.uploads.map((file) => [file.id, file]));
  const sections = new Map();
  for (const { version_id, section_code, urut, isi } of state.sections) {
    if (!sections.has(version_id)) sections.set(version_id, {});
    const group = sections.get(version_id);
    if (urut) {
      group[section_code] ||= [];
      group[section_code][urut - 1] = isi || '';
    } else {
      group[section_code] = isi || '';
    }
  }
  state.versions = state.versions.map(({ attachment_ids, created_by_id, approved_by_id, ...version }) => ({
    ...version,
    created_by: resolveUserRef(created_by_id, version.created_by, usersById, userIdByName),
    approved_by: (approved_by_id || version.approved_by)
      ? resolveUserRef(approved_by_id, version.approved_by, usersById, userIdByName)
      : null,
    judul: version.judul || '',
    nomor: version.nomor || '',
    kata_kunci: version.kata_kunci || '',
    revisi_label: version.revisi_label || '',
    ringkasan_perubahan: version.ringkasan_perubahan || '',
    sections: sections.get(version.id) || {},
    attachments: (attachment_ids || []).map((id) => files.get(id)).filter(Boolean)
      .map(({ id, nama, ukuran, mime, kind }) => ({ id, nama, ukuran, mime, kind })),
  }));
  delete state.sections;
  state.reviewLogs = state.reviewLogs.map(({ nama_user, ...entry }) => entry);
  state.documentLogs = state.documentLogs.map(({ nama_user, ...entry }) => entry);
  state.notifications = state.notifications.map(({ nama_user, ...entry }) => entry);
  state.operations = Object.fromEntries(
    state.operations
      .filter((operation) => operation.id !== '__auth__')
      .map(({ id, nama_user, ...operation }) => [id, { ...operation, expires: parseExpiry(operation.expires) }]),
  );
  return state;
}

export async function loadCloudState() {
  const cached = await getTableCache();
  original = cached || await readTables();
  if (!original.Users.length) return null;
  if (!cached) await setTableCache(original);
  const state = decodeCloudTables(original);
  const authRow = original.Operations.find((operation) => operation.id === '__auth__');
  const auth = sheetsAuthMode() ? (authRow?.result || { sessions: {}, attempts: {} }) : await loadCloudAuth();
  return { ...state, ...auth };
}

export function encodeTables(state) {
  const userNameById = new Map((state.users || []).map((user) => [user.id, user.nama]));
  const unitNameById = new Map((state.units || []).map((unit) => [unit.id, unit.nama]));
  const categoryLabelById = new Map((state.categories || []).map((category) => [category.id, category.label]));

  const data = Object.fromEntries(Object.entries(tables).map(([table, field]) => [table, state[field] || []]));
  data.User_Units = (state.userUnits || []).map((entry) => ({
    ...entry,
    nama_user: userNameById.get(entry.user_id) || '',
    nama_unit: unitNameById.get(entry.unit_id) || '',
  }));
  data.Documents = (state.documents || []).map((doc) => ({
    ...doc,
    nama_unit: unitNameById.get(doc.unit_id) || '',
    jenis_dokumen: categoryLabelById.get(doc.category_id) || '',
    created_by_id: doc.created_by || '',
    created_by: userNameById.get(doc.created_by) || doc.created_by || '',
  }));
  data.Document_Versions = (state.versions || []).map(({ sections, attachments, ...version }) => ({
    ...version,
    created_by_id: version.created_by || '',
    created_by: userNameById.get(version.created_by) || version.created_by || '',
    ...(version.approved_by
      ? {
          approved_by_id: version.approved_by,
          approved_by: userNameById.get(version.approved_by) || version.approved_by,
        }
      : {}),
    attachment_ids: (attachments || []).map(({ id }) => id),
  }));
  data.Version_Sections = (state.versions || []).flatMap((version) => Object.entries(version.sections || {}).flatMap(([code, entry]) =>
    (Array.isArray(entry) ? entry : [entry]).map((isi, i) => ({ id: version.id + ':' + code + ':' + i,
      version_id: version.id, section_code: code, urut: Array.isArray(entry) ? i + 1 : 0, isi }))));
  data.Attachments = (state.uploads || []).map(({ chunk_hashes, ...file }) => ({
    ...file,
    nama_user: userNameById.get(file.userId) || '',
    expires: file.expires ? new Date(file.expires).toISOString() : '',
    upload_url: file.ready ? '' : (file.upload_url || ''),
  }));
  data.Review_Log = (state.reviewLogs || []).map((entry) => ({
    ...entry,
    nama_user: userNameById.get(entry.user_id) || '',
  }));
  data.Document_Log = (state.documentLogs || []).map((entry) => ({
    ...entry,
    nama_user: userNameById.get(entry.user_id) || '',
  }));
  data.Notifications = (state.notifications || []).map((entry) => ({
    ...entry,
    nama_user: userNameById.get(entry.user_id) || '',
  }));
  const nowMs = Date.now();
  data.Operations = Object.entries(state.operations || {})
    .filter(([, record]) => record && (!record.expires || record.expires > nowMs))
    .map(([id, record]) => ({
      id,
      ...record,
      nama_user: userNameById.get(record.user_id) || '',
      expires: record.expires ? new Date(record.expires).toISOString() : '',
    }));
  if (sheetsAuthMode()) {
    const activeSessions = Object.fromEntries(
      Object.entries(state.sessions || {}).filter(([, entry]) => entry && entry.expires > nowMs),
    );
    const activeAttempts = Object.fromEntries(
      Object.entries(state.attempts || {}).filter(([, entry]) => entry && entry.expires > nowMs),
    );
    data.Operations.push({
      id: '__auth__',
      user_id: '',
      nama_user: 'Sistem',
      aksi: 'AUTH_STATE',
      fingerprint: 'auth',
      result: { sessions: activeSessions, attempts: activeAttempts },
      expires: '',
    });
  }
  return Object.fromEntries(Object.entries(data).map(([table, records]) => [table, records.map((record) =>
    Object.fromEntries(columns[table].split(' ').flatMap((field) => record[field] == null ? [] : [[field, record[field]]])))]));
}

function cell(value) {
  if (value == null) return {};
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  return { userEnteredValue: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) } };
}

export async function saveCloudState(state, { forceAll = false } = {}) {
  const data = encodeTables(state);
  const changed = Object.keys(tables).filter((table) =>
    forceAll || !original?.Users.length || (originalHeaders && originalHeaders[table] !== columns[table])
    || JSON.stringify(original[table]) !== JSON.stringify(data[table]));
  if (changed.length) {
    await ensureTables();
    const requests = changed.flatMap((table) => {
      const { sheetId, gridProperties } = sheetProperties[table];
      const header = columns[table].split(' ');
      const endColumnIndex = Math.max(header.length, originalColumnCounts?.[table] || 0);
      const padRow = (row) => Array.from({ length: endColumnIndex }, (_, i) => row[i]);
      const rows = [padRow(header), ...data[table].map((record) => padRow(header.map((field) => record[field])))];
      const endRowIndex = Math.max(rows.length, (original?.[table]?.length || 0) + 1);
      const batch = [];
      if (endRowIndex > gridProperties.rowCount) {
        const delta = endRowIndex - gridProperties.rowCount + 100;
        batch.push({ appendDimension: { sheetId, dimension: 'ROWS', length: delta } });
        gridProperties.rowCount += delta;
      }
      if (endColumnIndex > gridProperties.columnCount) {
        const delta = endColumnIndex - gridProperties.columnCount;
        batch.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: delta } });
        gridProperties.columnCount += delta;
      }
      batch.push({ updateCells: {
        range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endRowIndex, endColumnIndex },
        rows: rows.map((row) => ({ values: row.map(cell) })), fields: 'userEnteredValue',
      } });
      return batch;
    });
    await clearTableCache();
    await post(getSheetsUrl() + ':batchUpdate', { requests });
    original = data;
    originalHeaders ||= {};
    originalColumnCounts ||= {};
    for (const table of changed) {
      originalHeaders[table] = columns[table];
      originalColumnCounts[table] = columns[table].split(' ').length;
    }
    await setTableCache(data).catch(() => {});
  }
  if (state.authDirty && !sheetsAuthMode()) {
    canWrite();
    await saveCloudAuth(state.sessions, state.attempts);
  }
}

function driveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function sanitizeDriveName(value, fallback = 'Tanpa Nama') {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*-\s*){2,}/g, ' - ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

export function unitFolderName(unit) {
  const kode = String(unit?.kode || '').trim();
  const nama = String(unit?.nama || '').trim();
  if (!kode) return sanitizeDriveName(nama, 'Unit');
  if (!nama || kode.toUpperCase() === nama.toUpperCase()) return sanitizeDriveName(nama || kode, 'Unit');
  return sanitizeDriveName(kode + ' - ' + nama, 'Unit');
}

export function documentFolderName(doc, ver, category) {
  const nomor = String(ver?.nomor || '').trim();
  const judul = String(ver?.judul || '').trim();
  const raw = (nomor && judul) ? (nomor + ' - ' + judul)
    : (judul || nomor || ((category?.label || 'Dokumen') + ' Baru'));
  return sanitizeDriveName(raw, 'Dokumen');
}

export function versionFolderName(ver) {
  const label = String(ver?.revisi_label || '00').trim() || '00';
  return sanitizeDriveName('Rev ' + label, 'Rev 00');
}

async function folder(parent, marker, name) {
  const query = new URLSearchParams({
    q: "'" + driveQuery(parent) + "' in parents and trashed = false and mimeType = '" + FOLDER +
      "' and appProperties has { key='jdih' and value='" + driveQuery(marker) + "' }",
    fields: 'files(id,name)', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true',
  });
  const { files } = await (await google(drive + '?' + query)).json();
  if (files.length) {
    if (files[0].name !== name) {
      await google(drive + '/' + encodeURIComponent(files[0].id) + '?supportsAllDrives=true', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    }
    return files[0].id;
  }
  const result = await (await post(drive + '?supportsAllDrives=true&fields=id',
    { name, mimeType: FOLDER, parents: [parent], appProperties: { jdih: marker } })).json();
  return result.id;
}

async function renameFolderByMarker(parent, marker, name) {
  const query = new URLSearchParams({
    q: "'" + driveQuery(parent) + "' in parents and trashed = false and mimeType = '" + FOLDER +
      "' and appProperties has { key='jdih' and value='" + driveQuery(marker) + "' }",
    fields: 'files(id,name)', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true',
  });
  const { files } = await (await google(drive + '?' + query)).json();
  if (!files.length) return null;
  if (files[0].name !== name) {
    await google(drive + '/' + encodeURIComponent(files[0].id) + '?supportsAllDrives=true', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  return files[0].id;
}

export async function ensureUnitFolder(unit) {
  if (!cloudEnabled) return undefined;
  return unit.drive_folder_id || folder(getRootFolder(), 'unit-' + unit.kode, unitFolderName(unit));
}

export async function renameUnitFolder(id, kode, nama) {
  if (!cloudEnabled) return;
  await google(drive + '/' + encodeURIComponent(id) + '?supportsAllDrives=true', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: unitFolderName({ kode, nama }), appProperties: { jdih: 'unit-' + kode } }),
  });
}

export async function syncDocumentDriveFolders(doc, ver, state) {
  if (!cloudEnabled || !doc) return;
  const docVersionIds = new Set((state.versions || []).filter((v) => v.document_id === doc.id).map((v) => v.id));
  const hasCloudUpload = (state.uploads || []).some((f) => f.drive_id && docVersionIds.has(f.versionId));
  if (!hasCloudUpload) return;
  const unit = (state.units || []).find((entry) => entry.id === doc.unit_id);
  const category = (state.categories || []).find((entry) => entry.id === doc.category_id);
  if (!unit?.drive_folder_id || !category) return;
  const catFolderId = await renameFolderByMarker(unit.drive_folder_id, category.id, category.label);
  if (!catFolderId) return;
  const docFolderId = await renameFolderByMarker(catFolderId, doc.id, documentFolderName(doc, ver, category));
  if (docFolderId && ver) {
    await renameFolderByMarker(docFolderId, ver.id, versionFolderName(ver));
  }
}

export async function removeEmptyUnitFolder(unit) {
  if (!cloudEnabled || !unit.drive_folder_id) return true;
  const id = encodeURIComponent(unit.drive_folder_id);
  const query = new URLSearchParams({ q: "'" + driveQuery(unit.drive_folder_id) + "' in parents and trashed = false",
    pageSize: '1', fields: 'files(id)', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true' });
  const { files } = await (await google(drive + '?' + query)).json();
  if (files.length) return false;
  await google(drive + '/' + id + '?supportsAllDrives=true', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
  }, [404]);
  return true;
}

export async function beginCloudUpload(file, doc, state) {
  const unit = state.units.find((entry) => entry.id === doc.unit_id);
  const category = state.categories.find((entry) => entry.id === doc.category_id);
  const ver = state.versions.find((entry) => entry.id === file.versionId);
  unit.drive_folder_id = await ensureUnitFolder(unit);
  const type = await folder(unit.drive_folder_id, category.id, category.label);
  const documentFolder = await folder(type, doc.id, documentFolderName(doc, ver, category));
  const version = await folder(documentFolder, file.versionId, versionFolderName(ver));
  const { ids } = await (await google(drive + '/generateIds?count=1&space=drive')).json();
  file.drive_id = ids[0];
  const response = await google(upload + '?uploadType=resumable&supportsAllDrives=true', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': file.mime,
      'X-Upload-Content-Length': String(file.size) },
    body: JSON.stringify({ id: file.drive_id, name: file.nama, mimeType: file.mime, parents: [version] }),
  });
  file.upload_url = response.headers.get('location');
  if (new URL(file.upload_url).origin !== 'https://www.googleapis.com') throw unavailable('URL unggahan Google tidak valid.');
}

export async function writeCloudChunk(file, offset, bytes) {
  if (new URL(file.upload_url).origin !== 'https://www.googleapis.com') throw unavailable('Sesi unggahan Google tidak valid.');
  const end = offset + bytes.length;
  const status = await google(file.upload_url, { method: 'PUT', headers: { 'Content-Range': 'bytes */' + file.size } }, [308, 404]);
  if (status.ok || status.status === 404) {
    if (end !== file.size) throw unavailable('Sesi unggahan Drive harus dimulai ulang.');
    await checkCloudFile(file);
    return;
  }
  const match = status.headers.get('range')?.match(/^bytes=0-(\d+)$/);
  const stored = match ? Number(match[1]) + 1 : 0;
  if (stored === end) return;
  if (stored < offset || stored > end) throw unavailable('Posisi unggahan Drive berbeda.');
  const response = await google(file.upload_url, { method: 'PUT',
    headers: { 'Content-Range': 'bytes ' + stored + '-' + (end - 1) + '/' + file.size },
    body: bytes.subarray(stored - offset) }, [308]);
  if (end === file.size) {
    if (!response.ok) throw unavailable('Unggahan Drive belum lengkap.');
    await checkCloudFile(file);
  } else if (response.status !== 308 || response.headers.get('range') !== 'bytes=0-' + (end - 1)) {
    throw unavailable('Potongan Drive belum lengkap.');
  }
}

export async function checkCloudFile(file) {
  const info = await (await google(drive + '/' + encodeURIComponent(file.drive_id) + '?supportsAllDrives=true&fields=size,trashed')).json();
  if (info.trashed || Number(info.size) !== file.size) throw unavailable('Berkas Drive tidak lengkap.');
}

export async function cloudFileStream(file) {
  return (await google(drive + '/' + encodeURIComponent(file.drive_id) + '?alt=media&supportsAllDrives=true',
    { stream: true })).body;
}

export async function trashCloudFile(driveId) {
  if (!cloudEnabled || !driveId) return;
  await google(drive + '/' + encodeURIComponent(driveId) + '?supportsAllDrives=true', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  }, [404]);
}

export async function backupSpreadsheet(date) {
  const parent = await folder(getRootFolder(), 'backup', 'Backup JDIH');
  const marker = 'backup-' + date;
  const location = "'" + driveQuery(parent) + "' in parents and trashed = false";
  const query = new URLSearchParams({ q: location + " and appProperties has { key='jdih' and value='" + marker + "' }",
    pageSize: '1', fields: 'files(id)', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true' });
  const { files } = await (await google(drive + '?' + query)).json();
  if (!files.length) {
    await post(drive + '/' + encodeURIComponent(getSpreadsheet()) + '/copy?supportsAllDrives=true&fields=id',
      { name: 'JDIH Backup ' + date, parents: [parent], appProperties: { jdih: marker } });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  query.set('q', location + " and createdTime < '" + cutoff + "'");
  query.set('fields', 'files(id,appProperties)');
  query.set('pageSize', '10');
  const old = await (await google(drive + '?' + query)).json();
  for (const file of old.files) {
    if (!/^backup-\d{4}-\d{2}-\d{2}$/.test(file.appProperties?.jdih || '')) continue;
    await google(drive + '/' + encodeURIComponent(file.id) + '?supportsAllDrives=true', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
    });
  }
}

export async function verifyGoogleConnection() {
  const spreadsheet = getSpreadsheet();
  const rootFolder = getRootFolder();
  if (!spreadsheet || !rootFolder) {
    throw unavailable('GOOGLE_SHEETS_ID dan GOOGLE_DRIVE_ROOT_ID wajib diisi.');
  }
  identity = loadIdentity();
  access = null;
  await token();
  const sheetInfo = await (await google(getSheetsUrl() + '?fields=properties.title,sheets.properties.title')).json();
  const folderInfo = await (await google(drive + '/' + encodeURIComponent(rootFolder) +
    '?supportsAllDrives=true&fields=id,name,mimeType,driveId,capabilities(canAddChildren)')).json();
  let redisStatus = 'Fallback lokal tanpa Redis';
  if (redisEnabled()) {
    await redis('PING');
    redisStatus = 'Upstash Redis terhubung';
  }
  return {
    clientEmail: identity.client_email,
    spreadsheetTitle: sheetInfo.properties?.title || '',
    sheets: (sheetInfo.sheets || []).map((entry) => entry.properties?.title).filter(Boolean),
    folder: {
      id: folderInfo.id,
      name: folderInfo.name,
      mimeType: folderInfo.mimeType,
      isSharedDrive: Boolean(folderInfo.driveId),
      canAddChildren: Boolean(folderInfo.capabilities?.canAddChildren),
    },
    redisMode: redisStatus,
  };
}
