export const MONTH_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatDateID(iso) {
  if (!iso) return '-';
  const parts = String(iso).slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  if (!y || m < 0 || m > 11 || !d) return iso;
  return `${String(d).padStart(2, '0')} ${MONTH_ID[m]} ${y}`;
}

export function formatTimestamp(value) {
  if (!value) return '-';
  if (!String(value).includes('T')) return `${value} WIB`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)} WIB`;
}

export function normalizeDocNumber(num) {
  return String(num || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function formatNikInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

export function isValidNik(nik) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(nik);
}

export function sanitizeDownloadName(version) {
  const raw = `${version?.nomor || 'DOC'}_${version?.judul || 'Dokumen'}_Rev${version?.revisi_label || '00'}.pdf`;
  return raw.replace(/[\\/:*?"<>|\s]+/g, '-');
}

export function getStatusBadge(status) {
  switch (status) {
    case 'DRAF': return { label: 'Draf', tone: 'neutral' };
    case 'MENUNGGU_VERIFIKASI': return { label: 'Menunggu Verifikasi', tone: 'warning' };
    case 'DIKEMBALIKAN': return { label: 'Dikembalikan', tone: 'danger' };
    case 'DISETUJUI': return { label: 'Disetujui', tone: 'success' };
    default: return { label: status || '-', tone: 'neutral' };
  }
}

export function formatReviewActionLabel(aksi) {
  switch (aksi) {
    case 'AJUKAN': return 'Diajukan';
    case 'SETUJUI': return 'Disetujui';
    case 'KEMBALIKAN': return 'Dikembalikan';
    case 'TARIK': return 'Ditarik';
    default: return aksi || '-';
  }
}

export function formatNotifTypeLabel(jenis) {
  switch (jenis) {
    case 'PENGAJUAN': return 'Pengajuan Baru';
    case 'DISETUJUI': return 'Dokumen Disetujui';
    case 'DIKEMBALIKAN': return 'Perlu Perbaikan';
    default: return jenis || 'Notifikasi';
  }
}

export function getUserInitials(nama) {
  const withoutSuffix = String(nama || '').split(',')[0].trim();
  const clean = withoutSuffix
    .replace(/^(?:(?:prof|drg|dr|apt|ns|ir|h|hj)\.?\s+)+/i, '')
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const letters = clean.replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 2) || 'RS').toUpperCase();
}

export function normalizeAppUrl(url) {
  const clean = String(url || '').replace(/^#/, '');
  return clean.startsWith('/') ? clean : '/dokumen';
}

export function parseCsvRow(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function detectImportDelimiter(line) {
  if (line.includes('\t')) return '\t';
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi > comma ? ';' : ',';
}

export function parseUnitImportCsv(csv) {
  const lines = csv.trimStart().split(/\r\n|\n|\r/);
  const delimiter = detectImportDelimiter(lines[0]);
  const headers = parseCsvRow(lines[0], delimiter).map((cell) => cell.toLowerCase());
  const codeIndex = headers.findIndex((cell) => ['kode', 'kode unit'].includes(cell));
  const nameIndex = headers.findIndex((cell) => ['unit', 'nama', 'nama unit'].includes(cell));
  if (codeIndex < 0 || nameIndex < 0) return null;

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvRow(lines[i], delimiter);
    rows.push({
      row: i + 1,
      kode: cells[codeIndex] || '',
      nama: cells[nameIndex] || '',
      malformed: cells.length !== headers.length,
    });
  }
  return rows;
}

const JABATAN_MANAJER_RE = /\b(manajer|manager|kabid|kepala bidang|kabag|kepala bagian|kasie|kasi|wadir|direktur)\b/;
const JABATAN_KOORDINATOR_RE = /\b(koordinator|coordinator|koor|kanit|kepala unit|ka\.?\s*unit|karu|kepala ruangan|penanggung jawab|pj\s*unit)\b/;
const JABATAN_SUPER_ADMIN_RE = /\b(super[\s_-]*admin|administrator\s*sistem)\b/;

const UNIT_ALIASES = {
  simrs: 'IT',
  ti: 'IT',
  hrd: 'SDM',
  personalia: 'SDM',
  kepegawaian: 'SDM',
  k3: 'K3RS',
  'rekam medis': 'RMIK',
  rm: 'RMIK',
  hd: 'DLS',
  hemodialisa: 'DLS',
  hemodialisis: 'DLS',
  poli: 'RJ',
  poliklinik: 'RJ',
  'kamar operasi': 'OK',
  operasi: 'OK',
  bedah: 'OK',
  'kamar bersalin': 'VK',
  bersalin: 'VK',
  kebidanan: 'VK',
};

function normalizeUnitToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapJabatanToRole(rawJabatan) {
  const clean = normalizeUnitToken(rawJabatan);
  if (!clean) return 'STAF';
  if (JABATAN_SUPER_ADMIN_RE.test(clean)) return 'SUPER_ADMIN';
  if (JABATAN_MANAJER_RE.test(clean)) return 'MANAJER';
  if (JABATAN_KOORDINATOR_RE.test(clean)) return 'KOORDINATOR';
  return 'STAF';
}

function matchSingleUnit(token, units) {
  const norm = normalizeUnitToken(token);
  if (!norm || !units.length) return null;

  const aliasKode = UNIT_ALIASES[norm];
  if (aliasKode) {
    const aliased = units.find((u) => String(u.kode || '').toUpperCase() === aliasKode);
    if (aliased) return aliased;
  }

  for (const u of units) {
    if (normalizeUnitToken(u.kode) === norm || normalizeUnitToken(u.nama) === norm) {
      return u;
    }
  }

  for (const u of units) {
    const words = normalizeUnitToken(u.nama).split(' ').filter(Boolean);
    if (words.includes(norm)) return u;
  }

  if (norm.length >= 4) {
    for (const u of units) {
      const normNama = normalizeUnitToken(u.nama);
      if (normNama.includes(norm) || (normNama.length >= 4 && norm.includes(normNama))) {
        return u;
      }
    }
  }

  return null;
}

export function resolveImportUnits(rawUnit, activeUnits = []) {
  const cleanRaw = String(rawUnit || '').trim();
  const units = Array.isArray(activeUnits)
    ? activeUnits.filter((u) => u && u.is_active !== false && u.aktif !== false)
    : [];
  if (!cleanRaw) return { matchedUnits: [], unitHome: '', rawUnit: '' };

  const direct = matchSingleUnit(cleanRaw, units);
  if (direct) {
    return { matchedUnits: [direct], unitHome: direct.nama, rawUnit: cleanRaw };
  }

  const matchedUnits = [];
  const seenIds = new Set();
  const parts = cleanRaw.split(/[,;|/]+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const found = matchSingleUnit(part, units);
    if (found && !seenIds.has(found.id)) {
      seenIds.add(found.id);
      matchedUnits.push(found);
    }
  }

  return {
    matchedUnits,
    unitHome: matchedUnits.map((u) => u.nama).join(', ') || cleanRaw,
    rawUnit: cleanRaw,
  };
}

export function mergeUnitHome(currentHome, nextUnit) {
  const parts = [];
  const seen = new Set();
  for (const raw of [currentHome, nextUnit]) {
    for (const piece of String(raw || '').split(',')) {
      const clean = piece.trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (lower === 'staf rs' || seen.has(lower)) continue;
      seen.add(lower);
      parts.push(clean);
    }
  }
  return (parts.join(', ') || String(currentHome || '').trim() || 'Staf RS').slice(0, 160);
}

export function parseUserImportText(rawText, defaultPassword, existingUsers = [], activeUnits = [], existingAssignments = []) {
  const lines = String(rawText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const fallbackPw = String(defaultPassword || '').trim() || 'annisa123';
  const activeUnitMap = new Map((Array.isArray(activeUnits) ? activeUnits : []).map((u) => [u.id, u]));
  const assignmentsByUser = new Map();
  for (const a of Array.isArray(existingAssignments) ? existingAssignments : []) {
    if (!a || a.is_active === false || !a.user_id || !a.unit_id) continue;
    if (!assignmentsByUser.has(a.user_id)) assignmentsByUser.set(a.user_id, []);
    assignmentsByUser.get(a.user_id).push(a.unit_id);
  }
  const trackedByNik = new Map();
  for (const u of Array.isArray(existingUsers) ? existingUsers : []) {
    if (!u || !u.nik) continue;
    const unitNames = new Set();
    for (const part of String(u.unit_home || '').split(',')) {
      const clean = part.trim().toLowerCase();
      if (clean && clean !== 'staf rs') unitNames.add(clean);
    }
    const unitIds = new Set(assignmentsByUser.get(u.id) || []);
    for (const uid of unitIds) {
      const unitObj = activeUnitMap.get(uid);
      if (unitObj?.nama) unitNames.add(unitObj.nama.toLowerCase());
    }
    trackedByNik.set(u.nik, {
      existsInDb: true,
      isActive: u.is_active !== false,
      unitIds,
      unitNames,
    });
  }

  const firstCells = parseCsvRow(lines[0], detectImportDelimiter(lines[0])).map((c) => c.toLowerCase());
  let startIdx = 0;
  let headerMap = null;
  const findCol = (names) => firstCells.findIndex((c) => names.includes(c));
  const nikCol = findCol(['nik', 'no nik', 'nomor nik', 'no. nik']);
  const namaCol = findCol(['nama', 'nama pengguna', 'nama lengkap', 'name']);
  const unitCol = findCol(['unit', 'unit kerja', 'unit/bagian', 'bagian', 'departemen', 'ruangan']);
  const jabatanCol = findCol(['jabatan di unit', 'jabatan', 'jabatan unit', 'posisi', 'role', 'peran', 'level']);
  const pwCol = findCol(['password', 'kata sandi', 'sandi', 'pass']);
  if (nikCol !== -1 && namaCol !== -1) {
    headerMap = { nikCol, namaCol, unitCol, jabatanCol, pwCol };
    startIdx = 1;
  }

  const looksLikeNik = (val) => {
    const s = String(val || '').trim();
    return /^\d{4}\.\d{2}\.\d{2}$/.test(s) || (/^\d{8}$/.test(s.replace(/\D/g, '')) && !/[A-Za-z]/.test(s));
  };

  const rows = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    const cells = parseCsvRow(lines[i], detectImportDelimiter(lines[i]));
    let rawNik = '';
    let nama = '';
    let rawUnit = '';
    let rawJabatan = '';
    let rawPw = '';
    let hasUnitCol = false;
    if (headerMap) {
      rawNik = cells[headerMap.nikCol] || '';
      nama = cells[headerMap.namaCol] || '';
      hasUnitCol = headerMap.unitCol !== -1;
      rawUnit = hasUnitCol ? (cells[headerMap.unitCol] || '') : '';
      rawJabatan = headerMap.jabatanCol !== -1 ? (cells[headerMap.jabatanCol] || '') : '';
      rawPw = headerMap.pwCol !== -1 ? (cells[headerMap.pwCol] || '') : '';
    } else if (looksLikeNik(cells[0])) {
      rawNik = cells[0] || '';
      nama = cells[1] || '';
      if (cells.length >= 4) {
        hasUnitCol = true;
        rawUnit = cells[2] || '';
        rawJabatan = cells[3] || '';
        rawPw = cells[4] || '';
      } else {
        rawPw = cells[2] || '';
      }
    } else if (looksLikeNik(cells[1])) {
      nama = cells[0] || '';
      rawNik = cells[1] || '';
      if (cells.length >= 4) {
        hasUnitCol = true;
        rawUnit = cells[2] || '';
        rawJabatan = cells[3] || '';
        rawPw = cells[4] || '';
      } else {
        rawPw = cells[2] || '';
      }
    } else {
      rawNik = cells[0] || '';
      nama = cells[1] || '';
      rawPw = cells[2] || '';
    }

    const trimmedNik = rawNik.trim();
    const nik = /^\d{4}\.\d{2}\.\d{2}$/.test(trimmedNik)
      ? trimmedNik
      : (/^\d{8}$/.test(trimmedNik.replace(/\D/g, '')) && !/[A-Za-z]/.test(trimmedNik) ? formatNikInput(trimmedNik) : trimmedNik);
    const cleanNama = nama.trim();
    const cleanUnit = rawUnit.trim();
    const cleanJabatan = rawJabatan.trim();
    const password = rawPw.trim() || fallbackPw;

    const mappedPeran = mapJabatanToRole(cleanJabatan);
    const peran = mappedPeran;
    const unitResolution = resolveImportUnits(cleanUnit, activeUnits);
    const unitHome = unitResolution.unitHome || (peran === 'STAF' ? 'Staf RS' : '');
    const matchedUnitIds = unitResolution.matchedUnits.map((u) => u.id);
    const candidateUnitNames = unitResolution.matchedUnits.length
      ? unitResolution.matchedUnits.map((u) => u.nama)
      : (cleanUnit ? [cleanUnit] : []);

    let reason = '';
    let actionReason = 'Siap diimpor';
    let rowUnitIds = matchedUnitIds;
    const tracked = trackedByNik.get(nik);
    const isNewUser = !tracked;
    const unitRequired = cleanUnit !== '' || ((hasUnitCol || peran === 'KOORDINATOR' || peran === 'MANAJER') && peran !== 'SUPER_ADMIN');

    if (!isValidNik(nik)) {
      reason = 'Format NIK wajib 0000.00.00';
    } else if (!cleanNama || cleanNama.length > 180) {
      reason = 'Nama wajib diisi';
    } else if (unitRequired && peran !== 'SUPER_ADMIN' && matchedUnitIds.length === 0) {
      reason = cleanUnit ? 'Unit tidak ditemukan di daftar unit aktif' : 'Unit kosong / tidak ditemukan';
    } else if (isNewUser && (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      reason = 'Password minimal 8 karakter huruf & angka';
    } else if (isNewUser) {
      trackedByNik.set(nik, {
        existsInDb: false,
        isActive: true,
        unitIds: new Set((peran === 'KOORDINATOR' || peran === 'MANAJER') ? matchedUnitIds : []),
        unitNames: new Set(candidateUnitNames.map((n) => n.toLowerCase())),
      });
    } else if (tracked.existsInDb && !tracked.isActive) {
      reason = 'Akun NIK nonaktif';
    } else if ((peran === 'KOORDINATOR' || peran === 'MANAJER') && matchedUnitIds.length > 0) {
      const newUnitIds = matchedUnitIds.filter((uid) => !tracked.unitIds.has(uid));
      if (newUnitIds.length > 0) {
        newUnitIds.forEach((uid) => tracked.unitIds.add(uid));
        candidateUnitNames.forEach((n) => tracked.unitNames.add(n.toLowerCase()));
        rowUnitIds = newUnitIds;
        actionReason = tracked.existsInDb ? 'Tambah penugasan unit' : 'Tambah unit (NIK sama)';
      } else {
        reason = tracked.existsInDb ? 'NIK & penugasan unit sudah terdaftar' : 'Penugasan unit sudah ada di daftar';
      }
    } else if (peran === 'STAF') {
      const hasNewUnitName = candidateUnitNames.some((n) => !tracked.unitNames.has(n.toLowerCase()));
      if (hasNewUnitName) {
        candidateUnitNames.forEach((n) => tracked.unitNames.add(n.toLowerCase()));
        actionReason = tracked.existsInDb ? 'Gabung unit (NIK terdaftar)' : 'Gabung unit (NIK sama)';
      } else {
        reason = tracked.existsInDb ? 'NIK sudah terdaftar' : 'NIK duplikat di daftar';
      }
    } else {
      reason = tracked.existsInDb ? 'NIK sudah terdaftar' : 'NIK duplikat di daftar';
    }

    const valid = !reason;
    rows.push({
      row: i + 1,
      nik,
      nama: cleanNama,
      unit: cleanUnit,
      unit_home: unitHome,
      unit_ids: rowUnitIds,
      unit_names: unitResolution.matchedUnits.map((u) => u.nama),
      has_unit_col: hasUnitCol,
      jabatan: cleanJabatan,
      peran,
      mapped_peran: mappedPeran,
      password,
      valid,
      is_merge: valid && !isNewUser,
      warning: '',
      reason: reason || actionReason,
    });
  }
  return rows;
}

export function downloadUserImportTemplate() {
  const csv = [
    'nik,nama,unit,jabatan di unit,password',
    '1995.03.11,"Noviyanti Alawiyah",AKUNTANSI,Koordinator Unit,annisa123',
    '1996.04.12,"Apt. Doni Pratama, S.Farm",Farmasi,Manajer,annisa123',
    '1997.05.14,"Ns. Sari Indah, S.Kep",IGD,Perawat Pelaksana,annisa123',
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template-impor-pengguna.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
