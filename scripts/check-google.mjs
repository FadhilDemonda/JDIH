import fs from 'node:fs';
import path from 'node:path';
import { verifyGoogleConnection } from '../server/google-store.mjs';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return false;
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    return true;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = val;
  }
  return true;
}

const hasEnvLocal = loadEnvLocal();
const missing = [];
if (!process.env.GOOGLE_SHEETS_ID?.trim()) missing.push('GOOGLE_SHEETS_ID');
if (!process.env.GOOGLE_DRIVE_ROOT_ID?.trim()) missing.push('GOOGLE_DRIVE_ROOT_ID');
if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && !process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim()) {
  missing.push('GOOGLE_SERVICE_ACCOUNT_FILE atau GOOGLE_SERVICE_ACCOUNT_JSON');
}

if (missing.length) {
  console.log('Konfigurasi Google Workspace belum lengkap' + (hasEnvLocal ? ' di .env.local' : '') + ':');
  for (const item of missing) console.log('- Belum diisi: ' + item);
  console.log('');
  console.log('Langkah cepat:');
  console.log('1. Isi GOOGLE_SHEETS_ID, GOOGLE_DRIVE_ROOT_ID, dan GOOGLE_SERVICE_ACCOUNT_FILE (atau GOOGLE_SERVICE_ACCOUNT_JSON) di .env.local');
  console.log('2. Bagikan Spreadsheet dan Folder Shared Drive ke email Service Account (akses Editor / Content Manager)');
  console.log('3. Ubah JDIH_STORAGE=google dan JDIH_DEMO=0, lalu isi JDIH_ADMIN_NIK, JDIH_ADMIN_NAME, dan JDIH_ADMIN_PASSWORD');
  console.log('4. Jalankan ulang: npm run check:google');
  process.exit(1);
}

try {
  const report = await verifyGoogleConnection();
  console.log('Koneksi Google Sheets & Drive berhasil:');
  console.log('- Service Account : ' + report.clientEmail);
  console.log('- Spreadsheet     : ' + report.spreadsheetTitle + ' (' + report.sheets.length + ' tab: ' + report.sheets.join(', ') + ')');
  console.log('- Folder Drive    : ' + report.folder.name + ' (' + report.folder.id + ')');
  console.log('- Mode Kunci/Auth : ' + report.redisMode);
  if (!report.folder.isSharedDrive) {
    console.warn('PERINGATAN: Folder Drive bukan bagian dari Shared Drive. Service Account umumnya wajib memakai Shared Drive agar unggahan berkas PDF berhasil.');
  }
  if (!report.folder.canAddChildren) {
    console.warn('PERINGATAN: Service Account tidak memiliki izin tambah berkas (canAddChildren=false) di folder akar.');
  }
} catch (error) {
  console.error('Pemeriksaan Google gagal: ' + (error?.message || error));
  process.exit(1);
}
