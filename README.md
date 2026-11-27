# JDIH RS AN-NISA

Aplikasi internal berbasis Next.js App Router + React. Alurnya mencakup login NIK, pengelolaan akun dan penugasan unit, editor lima template, unggah PDF, verifikasi, publikasi, riwayat revisi, dan notifikasi web.

## Struktur Proyek

- `app/` — Next.js App Router: halaman autentikasi `(auth)`, halaman aplikasi `(app)`, serta backend API `api/[...parts]/route.js`.
- `components/` — Komponen React modular (`providers/`, `layout/`, `ui/`, `preview/`, `views/`).
- `lib/` — Utilitas murni (`api.js`, `domain.js`, `format.js`).
- `server/` — Logika backend, penyimpanan lokal/Google Workspace, dan generator PDF `@react-pdf/renderer`.
- `public/assets/` — Aset logo statis untuk aplikasi Next.js.
- `mockup/` — Stylesheet bersama (`styles.css`), data seed awal (`data.js`), aset sumber PDF, serta demo statis (`node scripts/serve.mjs`).

## Jalankan demo lokal

Gunakan Node.js 22 dan npm. Dari folder proyek, jalankan di PowerShell.

```powershell
npm ci
$env:JDIH_DEMO = '1'
$env:JDIH_DATA_DIR = '.jdih/demo'
npm run dev
```

Buka [JDIH lokal](http://127.0.0.1:3000). Password semua akun demo adalah `AnnisaDemo2026`.

| Peran | NIK |
| --- | --- |
| Staf | `1989.04.12` |
| Koordinator IGD dan ICU | `1985.11.03` |
| Manajer IGD, ICU, Farmasi, dan Ruang Operasi | `1978.02.19` |
| Super Admin | `1221.21.23` |

Demo menyimpan perubahan di direktori yang dipilih. Untuk memulai dengan data baru, gunakan direktori data lain. Mockup statis tetap dapat dibuka dengan `node scripts/serve.mjs`.

## Siapkan data rumah sakit

1. Salin `.env.example` menjadi `.env.local` (atau edit `.env.local` yang sudah tersedia). Untuk mode lokal tanpa Google Workspace, biarkan `JDIH_STORAGE=local` dan set `JDIH_DEMO=0` dengan NIK, nama, dan password awal Super Admin. Admin pertama wajib mengganti password saat masuk.
2. Untuk menyambungkan ke **Google Sheets + Google Shared Drive secara lokal** (tanpa wajib Upstash Redis):
   - Set `JDIH_STORAGE=google` dan `JDIH_DEMO=0` di `.env.local`.
   - Isi `JDIH_ADMIN_NIK`, `JDIH_ADMIN_NAME`, dan `JDIH_ADMIN_PASSWORD`.
   - Isi `GOOGLE_SHEETS_ID`, `GOOGLE_DRIVE_ROOT_ID`, dan `GOOGLE_SERVICE_ACCOUNT_FILE` (path ke file `.json` Service Account) atau `GOOGLE_SERVICE_ACCOUNT_JSON`.
   - Bagikan Spreadsheet dan Folder Shared Drive ke email Service Account dengan akses tulis, lalu uji koneksi dengan `npm run check:google`.
   - Saat dijalankan lokal tanpa `UPSTASH_REDIS_REST_URL`, aplikasi otomatis memakai kunci penulisan & cache memori lokal serta menyimpan sesi login di `JDIH_DATA_DIR/cloud-auth.json`.
3. Untuk Vercel, siapkan spreadsheet kosong, folder akar di Shared Drive, Service Account dengan akses tulis, dan database Upstash Redis. Atur variabel lingkungan pada proyek Vercel dan pilih `JDIH_STORAGE=google`. Aplikasi membuat 12 tab, 34 unit, dan lima jenis dokumen saat inisialisasi. Folder unit baru dibuat saat ditambah. Folder unit seed dibuat saat ada unggahan pertama.
4. Kelola akun serta penugasan Koordinator/SPV dan Manajer melalui menu Admin. Gunakan akun Manajer yang berbeda dari penyusun pengajuan.
5. Isi `CRON_SECRET` pada Vercel Production untuk salinan spreadsheet harian pukul 07.00 WIB di folder `Backup JDIH`. Aplikasi menyimpan salinan selama minimal 30 hari.
6. Gunakan dokumen resmi untuk UAT di lingkungan Google Workspace sebelum migrasi. Layout PDF template jenis SPO mengikuti format tabel resmi RS AN-NISA.

Penyimpanan lokal ditujukan untuk satu proses Next.js. Data lokal disimpan di disk. Pada mode Google, metadata tersimpan di Sheets, unggahan asli tersimpan di Shared Drive, dan Redis menangani sesi, pembatasan login, cache, serta kunci penulisan. PDF dari template dibuat dari snapshot versi saat diminta.

## Pemeriksaan

```powershell
npm run verify:mockup
npm run verify:app
npm run build
```

`verify:app` membuat data demo sementara dan menguji API login, akses per unit, transisi pengajuan, PDF, unggah ulang, revisi terjadwal, dan penguncian akun. Untuk menguji lewat HTTP, arahkan `JDIH_TEST_URL` hanya ke instance demo terpisah karena skrip membuat dan menerbitkan dokumen uji.
