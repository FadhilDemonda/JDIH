import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { checkFile, fileStream, loadSeed, loadState, saveChunk, saveState, serialize } from './store.mjs';
import { backupSpreadsheet, beginCloudUpload, cloudEnabled, ensureUnitFolder, removeEmptyUnitFolder, renameUnitFolder, syncDocumentDriveFolders, trashCloudFile } from './google-store.mjs';
import { renderDocumentPdf } from './pdf.mjs';

const MINUTE = 60_000;
const MAX_FILE = 20 * 1024 * 1024;
const CHUNK = 3 * 1024 * 1024;
const JSON_LIMIT = 2 * 1024 * 1024;
const EDITABLE = ['DRAF', 'DIKEMBALIKAN'];
const PENDING = 'MENUNGGU_VERIFIKASI';
const APPROVED = 'DISETUJUI';
const NIK = /^\d{4}\.\d{2}\.\d{2}$/;
const DEFAULT_USER_PASSWORD = 'annisa123';
const COOKIE = 'jdih_session';
const DUMMY_HASH = '$2b$10$fu/qFj7vaqU2YPPHjE3uz.sUNWHsY3JzI4eDgsl4Yf2.bVuKcDVDG';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireThat(condition, status, message) {
  if (!condition) throw new ApiError(status, message);
}

const invalid = (condition, message) => requireThat(condition, 422, message);
const allowed = (condition) => requireThat(condition, 403, 'Akses ditolak.');
const conflict = (condition, message) => requireThat(condition, 409, message);
const now = () => Date.now();
const clock = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => (value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const json = (value, status = 200, extra = {}) => Response.json(value, { status, headers: { ...headers, ...extra } });

function nextId(list, prefix, pad = 3) {
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  let max = 0;
  for (const item of list) {
    const match = String(item?.id || '').match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return prefix + '-' + String(max + 1).padStart(pad, '0');
}

function makeOperationFingerprint(method, pathname, body) {
  if (method === 'PUT') return `${method} ${pathname} (${body.length} bytes)`;
  let summary = '';
  if (body?.length) {
    try {
      const parsed = JSON.parse(body.toString('utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const clean = { ...parsed };
        if ('password' in clean) clean.password = '[REDACTED]';
        if ('current' in clean) clean.current = '[REDACTED]';
        if ('default_password' in clean) clean.default_password = '[REDACTED]';
        if (Array.isArray(clean.users)) {
          clean.users = clean.users.map((entry) =>
            entry && typeof entry === 'object' && 'password' in entry
              ? { ...entry, password: entry.password ? '[REDACTED]' : '' }
              : entry);
        }
        summary = JSON.stringify(clean);
      } else {
        summary = body.toString('utf8');
      }
    } catch {
      summary = `raw:${body.length}`;
    }
  }
  return `${method} ${pathname}${summary ? ' ' + summary : ''}`.slice(0, 10000);
}

function textField(value, label, max, required = true) {
  invalid(typeof value === 'string' && value.length <= max && (!required || value.trim()), label + ' tidak valid.');
  return value.trim();
}

function validPassword(password) {
  invalid(typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password) <= 72
    && /[A-Za-z]/.test(password) && /\d/.test(password), 'Password minimal 8 karakter kombinasi huruf dan angka.');
}

function validDate(value) {
  const date = new Date(value);
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeNik(raw) {
  const text = String(raw ?? '').trim();
  if (NIK.test(text)) return text;
  const digits = text.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  return text;
}

async function initialize() {
  const seed = await loadSeed();
  const demo = process.env.JDIH_DEMO === '1';
  const password = process.env.JDIH_ADMIN_PASSWORD;
  const nik = process.env.JDIH_ADMIN_NIK;
  if (!demo) {
    requireThat(NIK.test(nik || '') && password, 503, 'Atur akun admin awal untuk memulai JDIH.');
    validPassword(password);
  }
  const data = {
    units: seed.UNITS.map(({ drive_folder_id, ...unit }) => unit),
    categories: seed.CATEGORIES, users: [], userUnits: [], documents: [], versions: [],
    reviewLogs: [], documentLogs: [], notifications: [], sessions: {}, attempts: {},
    uploads: [], operations: {},
  };
  if (demo) {
    const demoHash = await bcrypt.hash('AnnisaDemo2026', 10);
    data.users = seed.USERS.map(({ demo_key, ...user }) => ({ ...user, password_hash: demoHash }));
    data.userUnits = seed.USER_UNITS;
    data.documents = seed.DOCUMENTS.filter((doc) => seed.VERSIONS.some((version) =>
      version.document_id === doc.id && version.metode === 'TEMPLATE' && version.status !== 'DIHAPUS'));
    data.versions = seed.VERSIONS.filter((version) => version.metode === 'TEMPLATE' &&
      data.documents.some((doc) => doc.id === version.document_id)).map((version) => ({
      ...version, attachments: [], template_sections: seed.CATEGORIES.find((category) =>
        category.id === data.documents.find((doc) => doc.id === version.document_id).category_id).sections,
    }));
  } else {
    data.users = [{ id: 'usr-001', nik, nama: process.env.JDIH_ADMIN_NAME || 'Super Admin',
      unit_home: 'DTO', is_super_admin: true, is_active: true, must_change_password: true,
      password_hash: await bcrypt.hash(password, 12) }];
  }
  await saveState(data);
  return data;
}

function cookie(request, token = '') {
  const secure = new URL(request.url).protocol === 'https:' || process.env.VERCEL === '1';
  return COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (token ? 1800 : 0) + (secure ? '; Secure' : '');
}

function sessionKey(request) {
  const value = request.headers.get('cookie')?.match(/(?:^|;\s*)jdih_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  return value ? tokenHash(value) : '';
}

function newSession(data, user) {
  const token = randomBytes(32).toString('hex');
  for (const [id, session] of Object.entries(data.sessions)) {
    if (session.expires <= now()) delete data.sessions[id];
  }
  data.sessions[tokenHash(token)] = { userId: user.id, credential: tokenHash(user.password_hash), expires: now() + 30 * MINUTE };
  data.authDirty = true;
  return token;
}

function hasRole(data, user, role, unitId) {
  return user.is_super_admin || data.userUnits.some((entry) =>
    entry.user_id === user.id && entry.is_active && entry.peran === role
    && (!unitId || entry.unit_id === unitId) && data.units.some((unit) => unit.id === entry.unit_id && unit.is_active));
}

function canReview(data, user, version, doc) {
  return hasRole(data, user, 'MANAJER', doc.unit_id) && Boolean(version.submitted_at);
}

function canRead(data, user, version, doc) {
  return version.status !== 'DIHAPUS' && (version.status === APPROVED
    || hasRole(data, user, 'KOORDINATOR', doc.unit_id) || canReview(data, user, version, doc));
}

function safeUser(user) {
  const { password_hash, ...profile } = user;
  return profile;
}

function safeVersion(version) {
  return {
    ...version,
    attachments: (version.attachments || []).map(({ id, nama, ukuran, mime, kind }) => ({ id, nama, ukuran, mime, kind })),
  };
}

function snapshot(data, user) {
  const base = { currentUserId: user.id, today: today(), users: [safeUser(user)], units: [], categories: [],
    userUnits: [], documents: [], versions: [], reviewLogs: [], documentLogs: [], notifications: [] };
  if (user.must_change_password) return base;
  const documentById = new Map(data.documents.map((doc) => [doc.id, doc]));
  const versions = data.versions.filter((version) => {
    const doc = documentById.get(version.document_id);
    return doc && canRead(data, user, version, doc);
  });
  const versionIds = new Set(versions.map((v) => v.id));
  const documentIds = new Set(versions.map((v) => v.document_id));
  const reviewLogs = data.reviewLogs.filter((log) => {
    if (!versionIds.has(log.version_id)) return false;
    const version = versions.find((v) => v.id === log.version_id);
    const doc = documentById.get(version.document_id);
    return hasRole(data, user, 'KOORDINATOR', doc.unit_id) || canReview(data, user, version, doc);
  });
  const references = new Set(versions.flatMap((v) => [v.created_by, v.approved_by]).concat(reviewLogs.map((log) => log.user_id)));
  return {
    ...base,
    users: data.users.filter((u) => user.is_super_admin || u.id === user.id || references.has(u.id))
      .map((u) => user.is_super_admin || u.id === user.id ? safeUser(u) : { id: u.id, nama: u.nama }),
    userUnits: data.userUnits.filter((entry) => user.is_super_admin || (entry.user_id === user.id
      && data.units.some((unit) => unit.id === entry.unit_id && unit.is_active))),
    units: data.units.map(({ drive_folder_id, ...unit }) => ({ ...unit, has_manager: user.is_super_admin || managers(data, unit.id).some((entry) => entry.user_id !== user.id) })),
    categories: data.categories,
    documents: data.documents.filter((doc) => documentIds.has(doc.id)),
    versions: versions.map(safeVersion),
    reviewLogs,
    notifications: data.notifications.filter((n) => n.user_id === user.id && n.is_relevant),
  };
}

function find(list, id, label) {
  const value = list.find((entry) => entry.id === id);
  requireThat(value, 404, label + ' tidak ditemukan.');
  return value;
}

function lookupVersion(data, user, id) {
  const version = find(data.versions, id, 'Versi');
  const doc = find(data.documents, version.document_id, 'Dokumen');
  allowed(canRead(data, user, version, doc));
  return { version, doc };
}

function authorizeReplay(data, user, route, parts, input) {
  const [id, action] = parts;
  if (route === 'admin') allowed(user.is_super_admin);
  if (route === 'documents') {
    const unitId = id ? find(data.documents, id, 'Dokumen').unit_id : input.unit_id;
    allowed(hasRole(data, user, 'KOORDINATOR', unitId));
  }
  if (route === 'versions') {
    const version = find(data.versions, id, 'Versi');
    const doc = find(data.documents, version.document_id, 'Dokumen');
    if (action === 'review') allowed(canReview(data, user, version, doc) && (user.is_super_admin || version.created_by !== user.id));
    else allowed(hasRole(data, user, 'KOORDINATOR', doc.unit_id));
  }
}

function draft(data, doc, user, method, from) {
  const category = find(data.categories, doc.category_id, 'Jenis dokumen');
  const numbers = data.versions.filter((v) => v.document_id === doc.id).map((v) => Number(v.revisi_label) || 0);
  const template = structuredClone(from?.template_sections || category.sections);
  const sections = method === 'TEMPLATE'
    ? structuredClone(from?.sections || Object.fromEntries(template.map(({ code, type }) => [code, type === 'list' ? [''] : ''])))
    : {};
  const version = {
    id: nextId(data.versions, 'ver'), document_id: doc.id, revisi_label: from ? String(Math.max(...numbers) + 1).padStart(2, '0') : '00',
    judul: from?.judul || '', nomor: from?.nomor || '', kata_kunci: from?.kata_kunci || '',
    tgl_dokumen: today(), tgl_berlaku: today(), ringkasan_perubahan: '', metode: method,
    status: 'DRAF', edit_version: 1, created_by: user.id, submitted_at: null, approved_at: null,
    approved_by: null, template_version: from?.template_version || category.template_version,
    template_sections: template, sections, attachments: [],
  };
  data.versions.push(version);
  return version;
}

function updateDraft(version, input) {
  conflict(version.edit_version === input.edit_version, 'Draf sudah berubah. Muat ulang sebelum menyimpan.');
  for (const [field, label, limit] of [
    ['judul', 'Judul', 300], ['nomor', 'Nomor', 180], ['kata_kunci', 'Kata kunci', 500],
    ['ringkasan_perubahan', 'Ringkasan perubahan', 4000], ['revisi_label', 'Label revisi', 30],
  ]) {
    if (field in input) version[field] = textField(input[field], label, limit, false);
  }
  for (const field of ['tgl_dokumen', 'tgl_berlaku']) {
    if (!(field in input)) continue;
    invalid(validDate(input[field]), 'Tanggal dokumen atau tanggal berlaku tidak valid.');
    version[field] = input[field];
  }
  if ('sections' in input && version.metode === 'TEMPLATE') {
    invalid(input.sections && typeof input.sections === 'object' && !Array.isArray(input.sections), 'Isian template tidak valid.');
    for (const { code, label, type } of version.template_sections) {
      if (!(code in input.sections)) continue;
      const value = input.sections[code];
      if (type === 'list') {
        invalid(Array.isArray(value) && value.length <= 100, label + ' tidak valid.');
        version.sections[code] = value.map((line) => textField(line, label, 8000, false));
      } else {
        invalid(type !== 'date' || value === '' || validDate(value), label + ' tidak valid.');
        version.sections[code] = textField(value, label, 30000, false);
      }
    }
  }
  version.edit_version += 1;
}

function reviewLog(data, version, user, action, note = '', annotations = []) {
  data.reviewLogs.push({ id: nextId(data.reviewLogs, 'rlog'), version_id: version.id, user_id: user.id, aksi: action, catatan: note,
    ...(annotations.length ? { annotations } : {}), created_at: clock() });
}

function validateAnnotations(version, value) {
  if (value === undefined) return [];
  invalid(Array.isArray(value) && value.length <= 20, 'Maksimal 20 catatan sorotan.');
  invalid(!value.length || version.metode === 'TEMPLATE', 'Sorotan tersedia untuk dokumen dari template.');
  return value.map((item) => {
    invalid(item && typeof item === 'object', 'Catatan sorotan tidak valid.');
    const { field, index, start, end, quote, note } = item;
    const source = ['judul', 'nomor', 'revisi_label'].includes(field)
      ? version[field]
      : (version.template_sections || []).some((section) => section.code === field) && version.sections[field];
    const text = Array.isArray(source) && Number.isSafeInteger(index) ? source[index] : index === null ? source : null;
    invalid(typeof text === 'string' && Number.isSafeInteger(start) && Number.isSafeInteger(end)
      && start >= 0 && end <= text.length && end > start && end - start <= 350,
      'Pilih teks dalam satu bagian, maksimal 350 karakter.');
    conflict(typeof quote === 'string' && quote.trim() && text.slice(start, end) === quote,
      'Teks yang disorot sudah berubah. Muat ulang pengajuan.');
    return { field, index, start, end, quote, note: textField(note, 'Catatan sorotan', 500) };
  });
}

function documentLog(data, doc, user, action, reason = '') {
  data.documentLogs.push({ id: nextId(data.documentLogs, 'dlog'), document_id: doc.id, user_id: user.id, aksi: action, alasan: reason, created_at: clock() });
}

function notify(data, userId, type, target, url, message) {
  data.notifications.push({ id: nextId(data.notifications, 'ntf'), user_id: userId, jenis: type, target_id: target, url,
    pesan: message, is_read: false, is_relevant: true, created_at: clock() });
}

function closeNotices(data, id) {
  for (const note of data.notifications) {
    if (note.target_id === id && note.jenis === 'PENGAJUAN') note.is_relevant = false;
  }
}

function approvedVersions(data, doc) {
  return data.versions.filter((v) => v.document_id === doc.id && v.status === APPROVED)
    .sort((a, b) => b.tgl_berlaku.localeCompare(a.tgl_berlaku) || b.approved_at.localeCompare(a.approved_at));
}

function currentVersion(versions) {
  return versions.find((v) => v.tgl_berlaku <= today()) || versions.at(-1);
}

function checkNumber(data, version, committedOnly = false) {
  const number = normalize(version.nomor);
  return data.versions.some((v) => v.document_id !== version.document_id &&
    (committedOnly ? v.status === PENDING || v.status === APPROVED : v.status !== 'DIHAPUS') &&
    normalize(v.nomor) === number);
}

function hasOpenVersion(data, doc) {
  return data.versions.some((v) => v.document_id === doc.id && [...EDITABLE, PENDING].includes(v.status));
}

async function admin(data, user, method, parts, input) {
  allowed(user.is_super_admin);
  const [collection, id] = parts;
  const list = { units: data.units, users: data.users, assignments: data.userUnits, categories: data.categories }[collection];
  requireThat(Array.isArray(list), 404, 'Rute tidak ditemukan.');
  if (method === 'GET') return { items: collection === 'users' ? list.map(safeUser) : list };
  if (collection === 'units') {
    if (method === 'DELETE') {
      const unit = find(list, id, 'Unit');
      conflict(!data.documents.some((doc) => doc.unit_id === id), 'Unit masih memiliki dokumen.');
      conflict(await removeEmptyUnitFolder(unit), 'Folder Drive masih memiliki berkas.');
      data.units = list.filter((u) => u.id !== id);
      data.userUnits = data.userUnits.filter((entry) => entry.unit_id !== id);
      return {};
    }
    if (method === 'POST' || method === 'PATCH') {
      const unit = method === 'POST' ? { id: nextId(list, 'u', 2), is_active: true } : find(list, id, 'Unit');
      const kode = input.kode === undefined ? unit.kode : textField(input.kode, 'Kode unit', 20).toUpperCase();
      const nama = input.nama === undefined ? unit.nama : textField(input.nama, 'Nama unit', 160);
      invalid(kode && nama, 'Kode dan nama unit wajib diisi.');
      conflict(!list.some((u) => u.id !== unit.id && (u.kode === kode || u.nama.toLowerCase() === nama.toLowerCase())), 'Kode atau nama unit sudah terdaftar.');
      if (unit.drive_folder_id && (unit.kode !== kode || unit.nama !== nama)) {
        await renameUnitFolder(unit.drive_folder_id, kode, nama);
      }
      Object.assign(unit, { kode, nama });
      if (typeof input.is_active === 'boolean') unit.is_active = input.is_active;
      if (method === 'POST') {
        unit.drive_folder_id = await ensureUnitFolder(unit);
        list.push(unit);
      }
      return { id: unit.id };
    }
  }
  if (collection === 'users') {
    if (method === 'POST' && id === 'import') {
      const defaultPassword = (typeof input.default_password === 'string' && input.default_password.trim())
        ? input.default_password.trim()
        : DEFAULT_USER_PASSWORD;
      validPassword(defaultPassword);
      invalid(Array.isArray(input.users) && input.users.length >= 1 && input.users.length <= 500,
        'Daftar pengguna impor wajib berisi 1 hingga 500 baris.');
      const existingNiks = new Set(list.map((u) => u.nik));
      const validRows = [];
      const skipped = [];
      for (let index = 0; index < input.users.length; index += 1) {
        const item = input.users[index];
        const row = index + 1;
        const nik = normalizeNik(item?.nik);
        const nama = typeof item?.nama === 'string' ? item.nama.trim() : '';
        const password = (typeof item?.password === 'string' && item.password.trim())
          ? item.password.trim()
          : defaultPassword;
        if (!NIK.test(nik)) {
          skipped.push({ row, nik, nama, reason: 'Format NIK wajib 0000.00.00' });
          continue;
        }
        if (!nama || nama.length > 180) {
          skipped.push({ row, nik, nama, reason: 'Nama pengguna wajib diisi (maks 180 karakter)' });
          continue;
        }
        if (existingNiks.has(nik)) {
          skipped.push({ row, nik, nama, reason: 'NIK sudah terdaftar atau duplikat' });
          continue;
        }
        if (password.length < 8 || Buffer.byteLength(password) > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
          skipped.push({ row, nik, nama, reason: 'Password minimal 8 karakter kombinasi huruf dan angka' });
          continue;
        }
        existingNiks.add(nik);
        validRows.push({ nik, nama, password });
      }
      invalid(validRows.length > 0, skipped[0]
        ? 'Tidak ada data valid untuk diimpor (' + skipped[0].reason + ').'
        : 'Tidak ada data valid untuk diimpor.');
      const hashByPassword = new Map();
      for (const row of validRows) {
        if (!hashByPassword.has(row.password)) {
          hashByPassword.set(row.password, await bcrypt.hash(row.password, 12));
        }
      }
      const createdIds = [];
      for (const row of validRows) {
        const profile = {
          id: nextId(list, 'usr'),
          nik: row.nik,
          nama: row.nama,
          unit_home: 'Staf RS',
          is_active: true,
          is_super_admin: false,
          must_change_password: true,
          password_hash: hashByPassword.get(row.password),
        };
        list.push(profile);
        createdIds.push(profile.id);
      }
      return { imported: createdIds.length, skipped, ids: createdIds };
    }
    if (method === 'POST' && !id) {
      invalid(typeof input.nik === 'string' && NIK.test(input.nik), 'Format NIK wajib 0000.00.00.');
      conflict(!list.some((u) => u.nik === input.nik), 'NIK sudah terdaftar.');
      const nama = textField(input.nama, 'Nama pengguna', 180);
      const password = (typeof input.password === 'string' && input.password.trim())
        ? input.password.trim()
        : DEFAULT_USER_PASSWORD;
      validPassword(password);
      const peran = input.peran;
      if (peran !== undefined) {
        invalid(['STAF', 'KOORDINATOR', 'MANAJER', 'SUPER_ADMIN'].includes(peran), 'Peran pengguna tidak valid.');
      }
      const isSuperAdmin = input.is_super_admin === true || peran === 'SUPER_ADMIN';
      const needsUnits = peran === 'KOORDINATOR' || peran === 'MANAJER';
      let assignedUnits = [];
      if (needsUnits) {
        invalid(Array.isArray(input.unit_ids) && input.unit_ids.length >= 1 && input.unit_ids.length <= 50,
          'Pilih minimal satu unit kerja untuk peran ' + (peran === 'KOORDINATOR' ? 'Koordinator/SPV' : 'Manajer') + '.');
        const uniqueIds = Array.from(new Set(input.unit_ids));
        assignedUnits = uniqueIds.map((unitId) => {
          const unit = find(data.units, unitId, 'Unit');
          invalid(unit.is_active, 'Unit tidak aktif.');
          return unit;
        });
      }
      const unitHome = typeof input.unit_home === 'string' && input.unit_home.trim()
        ? textField(input.unit_home, 'Unit utama', 160)
        : (assignedUnits.length ? assignedUnits.map((unit) => unit.nama).join(', ').slice(0, 160) : 'Staf RS');
      const profile = { id: nextId(list, 'usr'), nik: input.nik, nama, unit_home: unitHome,
        is_active: true, is_super_admin: isSuperAdmin,
        must_change_password: true, password_hash: await bcrypt.hash(password, 12) };
      list.push(profile);
      for (const unit of assignedUnits) {
        data.userUnits.push({ id: nextId(data.userUnits, 'uu'), user_id: profile.id, unit_id: unit.id, peran, is_active: true });
      }
      return { id: profile.id, temporaryPassword: password };
    }
    if (method === 'POST' && parts[2] === 'reset') {
      const profile = find(list, id, 'Pengguna');
      conflict(profile.id !== user.id, 'Gunakan menu profil untuk mengubah password sendiri.');
      const password = 'Aa1-' + randomBytes(12).toString('base64url');
      profile.password_hash = await bcrypt.hash(password, 12);
      profile.must_change_password = true;
      delete data.attempts[profile.nik];
      for (const [key, session] of Object.entries(data.sessions)) if (session.userId === id) delete data.sessions[key];
      data.authDirty = true;
      return { temporaryPassword: password };
    }
    if (method === 'PATCH') {
      const profile = find(list, id, 'Pengguna');
      if (input.nama !== undefined) profile.nama = textField(input.nama, 'Nama pengguna', 180);
      if (input.unit_home !== undefined) profile.unit_home = textField(input.unit_home, 'Unit utama', 160);
      if (input.nik !== undefined) {
        invalid(typeof input.nik === 'string' && NIK.test(input.nik), 'Format NIK wajib 0000.00.00.');
        conflict(!list.some((u) => u.id !== profile.id && u.nik === input.nik), 'NIK sudah terdaftar.');
        profile.nik = input.nik;
      }
      if (typeof input.is_active === 'boolean') {
        conflict(profile.id !== user.id || input.is_active, 'Akun sendiri tidak dapat dinonaktifkan.');
        profile.is_active = input.is_active;
        if (!profile.is_active) {
          for (const [key, session] of Object.entries(data.sessions)) if (session.userId === id) delete data.sessions[key];
          data.authDirty = true;
        }
      }
      return {};
    }
  }
  if (collection === 'assignments') {
    if (method === 'POST') {
      const target = find(data.users, input.user_id, 'Pengguna');
      const unit = find(data.units, input.unit_id, 'Unit');
      invalid(target.is_active && unit.is_active && ['KOORDINATOR', 'MANAJER'].includes(input.peran), 'Penugasan tidak valid.');
      conflict(!list.some((entry) => entry.is_active && entry.user_id === target.id && entry.unit_id === unit.id),
        'Pengguna sudah memiliki peran di unit tersebut.');
      list.push({ id: nextId(list, 'uu'), user_id: target.id, unit_id: unit.id, peran: input.peran, is_active: true });
      return {};
    }
    if (method === 'DELETE') {
      find(list, id, 'Penugasan').is_active = false;
      return {};
    }
    if (method === 'PATCH' && id === 'revoke') {
      invalid(Array.isArray(input.ids) && input.ids.length <= 100, 'Penugasan tidak valid.');
      for (const entry of list) if (input.ids.includes(entry.id)) entry.is_active = false;
      return {};
    }
  }
  if (collection === 'categories' && method === 'PATCH') {
    const category = find(list, id, 'Jenis dokumen');
    category.contoh_nomor = textField(input.contoh_nomor, 'Contoh nomor', 180);
    invalid(Number.isSafeInteger(input.template_version) && input.template_version >= 1, 'Versi template tidak valid.');
    category.template_version = input.template_version;
    return {};
  }
  throw new ApiError(404, 'Rute tidak ditemukan.');
}

async function documents(data, user, method, parts, input, url) {
  const [id, action] = parts;
  if (method === 'GET') {
    if (id) {
      const doc = find(data.documents, id, 'Dokumen');
      const versions = data.versions.filter((v) => v.document_id === id && canRead(data, user, v, doc));
      allowed(versions.length);
      return { ...doc, versions: versions.map(safeVersion) };
    }
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const unit = url.searchParams.get('unitId');
    const category = url.searchParams.get('categoryId');
    const inactive = url.searchParams.get('showInactive') === 'true';
    const all = data.documents.filter((doc) => (inactive || doc.status_aktif === 'AKTIF')
      && (!unit || doc.unit_id === unit) && (!category || doc.category_id === category))
      .map((doc) => ({ ...doc, version: currentVersion(approvedVersions(data, doc)) }))
      .filter(({ version }) => version && [version.judul, version.nomor, version.kata_kunci].join(' ').toLowerCase().includes(query))
      .sort((a, b) => b.version.approved_at.localeCompare(a.version.approved_at));
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit'), 10) || 10));
    return { items: all.slice((page - 1) * limit, page * limit).map(({ version, ...doc }) => ({ ...doc, version: safeVersion(version) })),
      total: all.length, page, limit };
  }
  if (method === 'POST' && !id) {
    const unit = find(data.units, input.unit_id, 'Unit');
    find(data.categories, input.category_id, 'Jenis dokumen');
    allowed(hasRole(data, user, 'KOORDINATOR', unit.id));
    invalid(unit.is_active && ['TEMPLATE', 'UPLOAD'].includes(input.metode), 'Unit atau metode tidak valid.');
    const doc = { id: nextId(data.documents, 'doc'), unit_id: unit.id, category_id: input.category_id, status_aktif: 'AKTIF',
      alasan_tidak_aktif: '', tgl_tidak_aktif: '', created_by: user.id };
    data.documents.push(doc);
    return { documentId: doc.id, versionId: draft(data, doc, user, input.metode).id };
  }
  const doc = find(data.documents, id, 'Dokumen');
  allowed(hasRole(data, user, 'KOORDINATOR', doc.unit_id));
  const published = approvedVersions(data, doc);
  conflict(published.length && !hasOpenVersion(data, doc), 'Selesaikan revisi terbuka atau terbitkan dokumen terlebih dahulu.');
  if (method === 'POST' && action === 'revisions') {
    conflict(doc.status_aktif === 'AKTIF', 'Aktifkan kembali dokumen sebelum membuat revisi.');
    const from = currentVersion(published);
    return { versionId: draft(data, doc, user, from.metode, from).id };
  }
  if (method === 'POST' && action === 'status') {
    const reason = textField(input.alasan, 'Alasan', 4000);
    invalid(['AKTIF', 'TIDAK_AKTIF'].includes(input.status_aktif), 'Status dokumen tidak valid.');
    conflict(doc.status_aktif !== input.status_aktif, 'Status dokumen sudah berubah.');
    const active = input.status_aktif === 'AKTIF';
    Object.assign(doc, { status_aktif: input.status_aktif, alasan_tidak_aktif: active ? '' : reason, tgl_tidak_aktif: active ? '' : today() });
    documentLog(data, doc, user, active ? 'AKTIFKAN' : 'NONAKTIFKAN', reason);
    return {};
  }
  throw new ApiError(404, 'Rute tidak ditemukan.');
}

function managers(data, unitId) {
  return data.userUnits.filter((entry) => entry.unit_id === unitId && entry.peran === 'MANAJER' && entry.is_active
    && data.users.some((user) => user.id === entry.user_id && user.is_active));
}

const FILE_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

async function startUpload(data, user, version, doc, input) {
  const name = textField(input.name, 'Nama berkas', 240);
  const extension = name.split('.').at(-1).toLowerCase();
  const kind = input.kind || 'PDF';
  invalid(Object.hasOwn(FILE_TYPES, extension) && ['PDF', 'SUMBER', 'LAMPIRAN'].includes(kind)
    && (kind !== 'PDF' || extension === 'pdf')
    && (kind !== 'SUMBER' || extension === 'docx'), 'Jenis berkas tidak valid.');
  invalid(Number.isSafeInteger(input.size) && input.size > 0 && input.size <= MAX_FILE, 'Ukuran berkas maksimal 20 MB.');
  data.uploads = data.uploads.filter((file) => file.versionId !== version.id || file.expires > now() || file.ready);
  const existing = data.uploads.filter((file) => file.versionId === version.id && !file.ready);
  conflict(existing.length < 20, 'Terlalu banyak unggahan tertunda.');
  const file = { id: nextId(data.uploads, 'att'), versionId: version.id, userId: user.id, nama: name, size: input.size,
    ukuran: Math.max(1, Math.round(input.size / 1024)) + ' KB', mime: FILE_TYPES[extension], kind,
    offset: 0, offsets: [], chunk_hashes: {}, expires: now() + 60 * MINUTE, ready: false };
  if (cloudEnabled) await beginCloudUpload(file, doc, data);
  data.uploads.push(file);
  return { uploadId: file.id, chunkSize: CHUNK };
}

function fileHeaders(mime, name, download, size) {
  return {
    ...headers, 'Content-Type': mime,
    'Content-Disposition': (download ? 'attachment' : 'inline') + "; filename*=UTF-8''" +
      encodeURIComponent(name.toWellFormed()).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16)),
    ...(size ? { 'Content-Length': String(size) } : {}),
  };
}

async function versionFiles(data, user, version, doc, method, id, input, request, url) {
  if (method === 'GET') {
    const download = url.searchParams.get('download') === '1';
    if (id === 'pdf' && version.metode === 'TEMPLATE') {
      const name = (version.nomor || 'Dokumen') + ' - Rev ' + version.revisi_label + '.pdf';
      const stream = await renderDocumentPdf(
        version,
        doc,
        data.units.find((u) => u.id === doc.unit_id),
        data.categories.find((c) => c.id === doc.category_id),
      );
      return new Response(stream, { headers: fileHeaders('application/pdf', name, download) });
    }
    const selected = (id === 'pdf' || id === 'scan') ? version.attachments.find((file) => file.kind === 'PDF')?.id : id;
    const file = data.uploads.find((entry) => entry.id === selected && entry.versionId === version.id && entry.ready
      && version.attachments.some((attachment) => attachment.id === entry.id));
    requireThat(file, 404, id === 'scan' ? 'Berkas PDF hasil scan belum tersedia.' : 'Berkas tidak ditemukan.');
    return new Response(await fileStream(file), { headers: fileHeaders(file.mime, file.nama, download, file.size) });
  }

  allowed(hasRole(data, user, 'KOORDINATOR', doc.unit_id));
  const isEditableDraft = EDITABLE.includes(version.status);
  const isApprovedTemplate = version.status === APPROVED && version.metode === 'TEMPLATE';
  if (method === 'POST' && !id) {
    const requestedKind = input.kind || 'PDF';
    conflict(isEditableDraft || (isApprovedTemplate && requestedKind === 'PDF'), 'Versi terkunci.');
    return startUpload(data, user, version, doc, input);
  }
  if (method === 'PUT' && id) {
    const file = find(data.uploads, id, 'Unggahan');
    allowed(file.versionId === version.id && (user.is_super_admin || file.userId === user.id));
    conflict(isEditableDraft || (isApprovedTemplate && file.kind === 'PDF'), 'Versi terkunci.');
    conflict(file.expires > now() || file.ready, 'Sesi unggah kedaluwarsa.');
    const rawOffset = request.headers.get('upload-offset') || '';
    const offset = Number(rawOffset);
    invalid(/^\d+$/.test(rawOffset) && Number.isSafeInteger(offset), 'Offset unggahan tidak valid.');
    const bytes = input;
    invalid(bytes.length > 0 && offset + bytes.length <= file.size &&
      (offset + bytes.length === file.size || bytes.length % (256 * 1024) === 0), 'Potongan unggahan tidak valid.');
    const digest = tokenHash(bytes);
    if (offset < file.offset && file.offsets.includes(offset)) {
      if (file.chunk_hashes && Object.hasOwn(file.chunk_hashes, offset)) {
        conflict(file.chunk_hashes[offset] === digest, 'Isi potongan berbeda dari unggahan sebelumnya.');
      }
      return { offset: file.offset, ready: file.ready };
    }
    conflict(offset === file.offset && !file.ready, 'Posisi unggahan berubah.');
    if (offset === 0) {
      const signature = file.kind === 'SUMBER' || file.mime.endsWith('document') ? '504b0304'
        : { 'application/pdf': '255044462d', 'image/png': '89504e470d0a1a0a', 'image/jpeg': 'ffd8ff' }[file.mime];
      invalid(signature && bytes.toString('hex', 0, signature.length / 2) === signature, 'Isi berkas tidak sesuai jenisnya.');
    }
    await saveChunk(file, offset, bytes);
    file.offsets.push(offset);
    file.chunk_hashes ||= {};
    file.chunk_hashes[offset] = digest;
    file.offset += bytes.length;
    if (file.offset === file.size) {
      file.ready = true;
      file.upload_url = '';
      if (file.kind !== 'LAMPIRAN') version.attachments = version.attachments.filter((g) => g.kind !== file.kind);
      version.attachments.push({ id: file.id, nama: file.nama, ukuran: file.ukuran, mime: file.mime, kind: file.kind });
      if (isApprovedTemplate) documentLog(data, doc, user, 'UNGGAH_SCAN', file.nama);
    }
    return { offset: file.offset, ready: file.ready };
  }
  if (method === 'DELETE' && id) {
    const attachment = (id === 'scan' || id === 'pdf')
      ? version.attachments.find((file) => file.kind === 'PDF')
      : version.attachments.find((file) => file.id === id);
    requireThat(attachment, 404, 'Berkas tidak ditemukan.');
    conflict(isEditableDraft || (isApprovedTemplate && attachment.kind === 'PDF'), 'Versi terkunci.');
    const uploadEntry = data.uploads.find((entry) => entry.id === attachment.id && entry.versionId === version.id);
    if (cloudEnabled && uploadEntry?.drive_id) {
      await trashCloudFile(uploadEntry.drive_id);
    }
    version.attachments = version.attachments.filter((file) => file.id !== attachment.id);
    data.uploads = data.uploads.filter((entry) => entry.id !== attachment.id);
    if (isApprovedTemplate) documentLog(data, doc, user, 'HAPUS_SCAN', attachment.nama);
    return { version: safeVersion(version) };
  }
  throw new ApiError(404, 'Rute tidak ditemukan.');
}

async function verifyPrimaryFile(data, version) {
  if (version.metode !== 'UPLOAD') return;
  const primary = version.attachments.find((attachment) => attachment.kind === 'PDF');
  const file = data.uploads.find((upload) => upload.id === primary?.id && upload.ready);
  conflict(file, 'Berkas PDF utama belum tersedia.');
  await checkFile(file);
}

async function versions(data, user, method, parts, input, request, url) {
  const [id, action, fileId] = parts;
  const { version, doc } = lookupVersion(data, user, id);
  if (action === 'files') return versionFiles(data, user, version, doc, method, fileId, input, request, url);
  if (method === 'GET' && !action) return safeVersion(version);

  if (method === 'POST' && action === 'review') {
    allowed(canReview(data, user, version, doc) && (user.is_super_admin || version.created_by !== user.id));
    conflict(version.status === PENDING, 'Pengajuan sudah diproses atau ditarik.');
    invalid(['SETUJUI', 'KEMBALIKAN'].includes(input.aksi), 'Keputusan tidak valid.');
    const approved = input.aksi === 'SETUJUI';
    if ('submitted_at' in input || input.annotations?.length) {
      conflict(input.submitted_at === version.submitted_at, 'Pengajuan sudah berubah. Muat ulang sebelum mengambil keputusan.');
    }
    const annotations = approved ? [] : validateAnnotations(version, input.annotations);
    const note = approved ? '' : textField(input.catatan ?? '', 'Catatan', 4000, annotations.length === 0)
      || 'Perbaiki bagian yang ditandai pada pratinjau dokumen.';
    if (approved) {
      conflict(!checkNumber(data, version, true), 'Nomor sudah dipakai dokumen lain.');
      await verifyPrimaryFile(data, version);
      if (version.metode === 'TEMPLATE') {
        const rendered = await renderDocumentPdf(
          version,
          doc,
          data.units.find((unit) => unit.id === doc.unit_id),
          data.categories.find((category) => category.id === doc.category_id),
        );
        await rendered.pipeTo(new WritableStream());
      }
    }
    version.status = approved ? APPROVED : 'DIKEMBALIKAN';
    if (approved) Object.assign(version, { approved_at: clock(), approved_by: user.id, return_note: '' });
    else version.return_note = note;
    reviewLog(data, version, user, input.aksi, note, annotations);
    closeNotices(data, version.id);
    if (approved && cloudEnabled) await syncDocumentDriveFolders(doc, version, data);
    const recipientIds = new Set([version.created_by, ...data.userUnits.filter((entry) => entry.is_active
      && entry.unit_id === doc.unit_id && entry.peran === 'KOORDINATOR').map((entry) => entry.user_id)]);
    for (const recipientId of recipientIds) {
      notify(data, recipientId, version.status, approved ? doc.id : version.id,
        approved ? '#/dokumen/' + doc.id : '#/pengajuan/' + version.id,
        approved ? 'Disetujui: ' + version.judul : 'Dikembalikan: ' + version.judul + '. ' + note);
    }
    return {};
  }
  allowed(hasRole(data, user, 'KOORDINATOR', doc.unit_id));
  if (method === 'POST' && action === 'withdraw') {
    conflict(version.status === PENDING, 'Pengajuan sudah diproses atau ditarik.');
    Object.assign(version, { status: 'DRAF', submitted_at: null, edit_version: version.edit_version + 1 });
    closeNotices(data, version.id);
    reviewLog(data, version, user, 'TARIK');
    return {};
  }
  conflict(EDITABLE.includes(version.status), 'Versi terkunci.');
  if (method === 'DELETE' && !action) {
    version.status = 'DIHAPUS';
    closeNotices(data, version.id);
    documentLog(data, doc, user, 'HAPUS_DRAF', version.id);
    return {};
  }
  if (method === 'PATCH' && !action) {
    updateDraft(version, input);
    if (cloudEnabled) await syncDocumentDriveFolders(doc, version, data);
    return { version: safeVersion(version), numberConflict: Boolean(version.nomor && checkNumber(data, version)) };
  }
  if (method === 'POST' && action === 'submit') {
    if ('edit_version' in input) updateDraft(version, input);
    invalid(version.judul.trim() && version.nomor.trim() && version.revisi_label.trim() &&
      validDate(version.tgl_dokumen) && validDate(version.tgl_berlaku), 'Judul, nomor, label revisi, dan tanggal wajib diisi.');
    invalid(!approvedVersions(data, doc).length || version.ringkasan_perubahan.trim(), 'Ringkasan perubahan wajib diisi.');
    const reviewers = managers(data, doc.unit_id).filter((entry) => entry.user_id !== user.id);
    invalid(user.is_super_admin || reviewers.length, 'Manajer unit belum disetting, hubungi tim DTO.');
    conflict(!checkNumber(data, version, true), 'Nomor sudah dipakai dokumen lain.');
    await verifyPrimaryFile(data, version);
    version.status = PENDING;
    version.submitted_at = clock();
    version.return_note = '';
    reviewLog(data, version, user, 'AJUKAN');
    if (cloudEnabled) await syncDocumentDriveFolders(doc, version, data);
    const reviewerIds = new Set(reviewers.map((entry) => entry.user_id));
    if (user.is_super_admin && reviewerIds.size === 0) reviewerIds.add(user.id);
    for (const reviewerId of reviewerIds) notify(data, reviewerId, 'PENGAJUAN', version.id,
      '#/verifikasi/' + version.id, 'Pengajuan: ' + version.judul + ' oleh ' + user.nama + '.');
    return {};
  }
  throw new ApiError(404, 'Rute tidak ditemukan.');
}

async function readBody(request, limit) {
  const stream = request.body;
  if (!stream) return Buffer.alloc(0);
  requireThat(Number(request.headers.get('content-length') || 0) <= limit, 413, 'Ukuran permintaan melebihi batas.');
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, 'Ukuran permintaan melebihi batas.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseJson(bytes) {
  if (!bytes.length) return {};
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  throw new ApiError(422, 'Isian permintaan tidak valid.');
}

function isSameOrigin(request, url) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const actual = new URL(origin);
    const authority = request.headers.get('host') || url.host;
    const scheme = process.env.VERCEL === '1' ? 'https:' : url.protocol;
    return actual.host === authority && actual.protocol === scheme;
  } catch {
    return false;
  }
}

async function login(request, data, input) {
  const { nik, password } = input;
  invalid(typeof nik === 'string' && NIK.test(nik), 'Format NIK wajib 0000.00.00.');
  invalid(typeof password === 'string' && Buffer.byteLength(password) <= 72, 'Password tidak valid.');
  data.authDirty = true;
  for (const [key, entry] of Object.entries(data.attempts)) {
    if (entry.expires <= now()) delete data.attempts[key];
  }
  const previous = data.attempts[nik];
  requireThat(!previous || previous.count < 5, 429, 'Akun dikunci selama 15 menit.');
  const user = data.users.find((entry) => entry.nik === nik);
  const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user?.is_active || !valid) {
    const count = (previous?.count || 0) + 1;
    data.attempts[nik] = { count, expires: now() + 15 * MINUTE };
    await saveState(data);
    return json({ error: count >= 5 ? 'Akun dikunci selama 15 menit.' : 'NIK atau password salah.' }, count >= 5 ? 429 : 401);
  }
  delete data.attempts[nik];
  const token = newSession(data, user);
  await saveState(data);
  return json({ state: snapshot(data, user) }, 200, { 'Set-Cookie': cookie(request, token) });
}

async function dispatch(data, user, method, route, parts, input, request, url) {
  if (route === 'state' && method === 'GET') return snapshot(data, user);
  if (route === 'documents') return documents(data, user, method, parts, input, url);
  if (route === 'versions') return versions(data, user, method, parts, input, request, url);
  if (route === 'admin') return admin(data, user, method, parts, input);
  if (route === 'notifications') {
    if (method === 'GET') return { items: data.notifications.filter((n) => n.user_id === user.id && n.is_relevant) };
    if (parts[0] === 'read' && method === 'POST') {
      for (const note of data.notifications) {
        if (note.user_id === user.id && (input.all === true || note.id === input.id)) note.is_read = true;
      }
      return {};
    }
  }
  if (route === 'reviews' && method === 'GET') {
    allowed(hasRole(data, user, 'MANAJER'));
    const view = snapshot(data, user);
    return { items: view.versions.filter((v) => v.submitted_at && canReview(data, user, v,
      data.documents.find((doc) => doc.id === v.document_id))) };
  }
  throw new ApiError(404, 'Rute tidak ditemukan.');
}

export async function handleApi(request, [route, ...parts]) {
  const { method } = request;
  const url = new URL(request.url);
  const read = method === 'GET';
  try {
    if (route === 'cron' && parts[0] === 'backup' && read) {
      const secret = process.env.CRON_SECRET;
      requireThat(secret && cloudEnabled, 404, 'Rute tidak ditemukan.');
      const hash = (value) => Buffer.from(tokenHash(value), 'hex');
      requireThat(timingSafeEqual(hash(request.headers.get('authorization') || ''), hash('Bearer ' + secret)),
        401, 'Akses ditolak.');
      await serialize(() => backupSpreadsheet(today()));
      return json({ ok: true });
    }
    if (!read) allowed(isSameOrigin(request, url));
    const body = read ? null : await readBody(request, method === 'PUT' ? CHUNK : JSON_LIMIT);
    const input = read ? {} : method === 'PUT' ? body : parseJson(body);
    return await serialize(async () => {
      const data = await loadState() || await initialize();
      if (route === 'auth' && parts[0] === 'login' && method === 'POST') return login(request, data, input);
      const key = sessionKey(request);
      const session = Object.hasOwn(data.sessions, key) ? data.sessions[key] : null;
      if (route === 'auth' && parts[0] === 'logout' && method === 'POST') {
        if (session) {
          delete data.sessions[key];
          data.authDirty = true;
          await saveState(data);
        }
        return json({}, 200, { 'Set-Cookie': cookie(request) });
      }
      const user = session && session.expires > now() && data.users.find((u) => u.id === session.userId &&
        u.is_active && session.credential === tokenHash(u.password_hash));
      requireThat(user, 401, 'Sesi berakhir. Silakan masuk kembali.');
      if (route === 'auth' && parts[0] === 'password' && method === 'POST') {
        validPassword(input.password);
        if (!user.must_change_password) {
          invalid(typeof input.current === 'string' && Buffer.byteLength(input.current) <= 72
            && await bcrypt.compare(input.current, user.password_hash), 'Password saat ini salah.');
        }
        invalid(!await bcrypt.compare(input.password, user.password_hash), 'Gunakan password baru yang berbeda.');
        user.password_hash = await bcrypt.hash(input.password, 12);
        user.must_change_password = false;
        for (const [id, entry] of Object.entries(data.sessions)) if (entry.userId === user.id) delete data.sessions[id];
        const token = newSession(data, user);
        await saveState(data);
        return json({ state: snapshot(data, user) }, 200, { 'Set-Cookie': cookie(request, token) });
      }
      allowed(route === 'state' || !user.must_change_password);

      const idempotency = request.headers.get('idempotency-key');
      if (idempotency) invalid(/^[\w-]{1,128}$/.test(idempotency), 'Idempotency-Key tidak valid.');
      const operationId = !read && idempotency && (user.id + ':' + idempotency);
      const fingerprint = operationId && makeOperationFingerprint(method, url.pathname, body);
      const existing = operationId && data.operations[operationId];
      if (existing && existing.expires > now()) {
        conflict(existing.fingerprint === fingerprint, 'Idempotency-Key sudah dipakai untuk permintaan lain.');
        authorizeReplay(data, user, route, parts, input);
        return json(request.headers.get("x-jdih-state") === "1" ? { ...existing.result, state: snapshot(data, user) } : existing.result);
      }

      const result = await dispatch(data, user, method, route, parts, input, request, url);
      if (result instanceof Response) return result;
      const output = !read && request.headers.get('x-jdih-state') === '1' ? { ...result, state: snapshot(data, user) } : result;
      if (operationId) {
        for (const [id, entry] of Object.entries(data.operations)) if (entry.expires <= now()) delete data.operations[id];
        const { temporaryPassword, ...replay } = result;
        data.operations[operationId] = { user_id: user.id, aksi: method + ' ' + url.pathname, fingerprint, result: replay, expires: now() + 24 * 60 * MINUTE };
      }
      const refresh = session.expires - now() < 29 * MINUTE;
      if (refresh) {
        session.expires = now() + 30 * MINUTE;
        data.authDirty = true;
      }
      if (!read || refresh) await saveState(data);
      const rawToken = request.headers.get('cookie')?.match(/(?:^|;\s*)jdih_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      return json(output, 200, refresh ? { 'Set-Cookie': cookie(request, rawToken) } : {});
    });
  } catch (error) {
    if (error.unavailable) return json({ error: error.message }, 503);
    if (error instanceof ApiError) {
      if (error.status === 403) console.warn('Akses API ditolak', method, route);
      return json({ error: error.message }, error.status);
    }
    console.error('JDIH', error.code || error.name, error.message);
    return json({ error: 'Permintaan gagal diproses. Coba lagi.' }, 500);
  }
}

