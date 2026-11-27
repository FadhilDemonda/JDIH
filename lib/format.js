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

export function parseUserImportText(rawText, defaultPassword, existingUsers = []) {
  const lines = String(rawText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const fallbackPw = String(defaultPassword || '').trim() || 'annisa123';
  const existingNiks = new Set(existingUsers.map((u) => u.nik));
  const seenNiks = new Set();

  const firstCells = parseCsvRow(lines[0], detectImportDelimiter(lines[0])).map((c) => c.toLowerCase());
  let startIdx = 0;
  let headerMap = null;
  const findCol = (names) => firstCells.findIndex((c) => names.includes(c));
  const nikCol = findCol(['nik', 'no nik', 'nomor nik']);
  const namaCol = findCol(['nama', 'nama pengguna', 'nama lengkap', 'name']);
  const pwCol = findCol(['password', 'kata sandi', 'sandi', 'pass']);
  if (nikCol !== -1 && namaCol !== -1) {
    headerMap = { nikCol, namaCol, pwCol };
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
    let rawPw = '';
    if (headerMap) {
      rawNik = cells[headerMap.nikCol] || '';
      nama = cells[headerMap.namaCol] || '';
      rawPw = headerMap.pwCol !== -1 ? (cells[headerMap.pwCol] || '') : '';
    } else if (looksLikeNik(cells[0])) {
      rawNik = cells[0] || '';
      nama = cells[1] || '';
      rawPw = cells[2] || '';
    } else if (looksLikeNik(cells[1])) {
      nama = cells[0] || '';
      rawNik = cells[1] || '';
      rawPw = cells[2] || '';
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
    const password = rawPw.trim() || fallbackPw;

    let reason = '';
    if (!isValidNik(nik)) reason = 'Format NIK wajib 0000.00.00';
    else if (!cleanNama || cleanNama.length > 180) reason = 'Nama wajib diisi';
    else if (existingNiks.has(nik)) reason = 'NIK sudah terdaftar';
    else if (seenNiks.has(nik)) reason = 'NIK duplikat di daftar';
    else if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      reason = 'Password minimal 8 karakter huruf & angka';
    }

    const valid = !reason;
    if (valid) seenNiks.add(nik);
    rows.push({ row: i + 1, nik, nama: cleanNama, password, valid, reason: reason || 'Siap diimpor' });
  }
  return rows;
}

export function downloadUserImportTemplate() {
  const csv = [
    'nik,nama,password',
    '1995.03.11,"Ns. Sari Indah, S.Kep",annisa123',
    '1996.04.12,"Apt. Doni Pratama, S.Farm",annisa123',
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
