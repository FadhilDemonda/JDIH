# Impeccable Audit Report: Frontend JDIH RS AN-NISA

- **Target:** [`mockup/index.html`](mockup/index.html), [`mockup/styles.css`](mockup/styles.css), [`mockup/app.js`](mockup/app.js), [`app/[...asset]/route.js`](app/[...asset]/route.js)
- **Acuan Spesifikasi:** [`docs/PRD_JDIH.md`](docs/PRD_JDIH.md) & [`index.md`](index.md)
- **Tanggal Audit:** 27 November 2026
- **Catatan Lingkungan:** `Context loading did not run; I'll read the existing project context directly.` Pemeriksaan dijalankan melalui `node --check`, `node scripts/verify-mockup.mjs`, `node scripts/verify-app.mjs`, dan `next build --webpack`.

---

## Ringkasan Perbaikan (27 November 2026)

Perbaikan diterapkan pada frontend live Next.js (yang disajikan dari `mockup/index.html`, `mockup/styles.css`, dan `mockup/app.js`) serta route aset `app/[...asset]/route.js`:

1. **Integritas Mode Produksi & Copy:**
   - Menghilangkan tombol demo `"Simulasi Muat Data"` pada mode `live` di `viewDaftarDokumen` ([`mockup/app.js`](mockup/app.js)).
   - Mengubah label sidebar statis `"Unit Kerja (34)"` menjadi `"Unit Kerja"` dengan badge jumlah unit dinamis `state.units.length` ([`mockup/app.js`](mockup/app.js)).
   - Mengganti istilah teknis & enum mentah (`(Review_Log)`, `(Fase 1)`, `AJUKAN`/`SETUJUI`/`KEMBALIKAN`/`TARIK`, `PENGAJUAN`/`DISETUJUI`/`DIKEMBALIKAN`) ke bahasa pengguna akhir, serta memperbaiki logika inisial avatar agar melewati prefiks gelar depan (`dr.`, `Apt.`, `Ns.`, dll.).
2. **Theming & Kontras WCAG AA:**
   - Memperbaiki kontras tombol dark mode: menambahkan token `--danger-hover` (`#B91C1C`), menurunkan `--danger-accent` dark mode ke `#DC2626` (`4.83:1`), mengganti `.btn-danger:hover` dari `var(--danger-text)` (sebelumnya `1.90:1`) ke `var(--danger-hover)` (`6.47:1`), dan menyesuaikan `--primary-hover` dark mode ke `#237B4B` (`5.24:1`).
   - Menghapus 4 token CSS mati (`--success-accent`, `--warning-accent`, `--stage-card-bg`, `--stage-card-active-bg`) dan menambah skrip inisialisasi tema sinkron di `<head>` [`mockup/index.html`](mockup/index.html) untuk mencegah kilatan tema terang saat memuat mode gelap.
   - Memperluas [`scripts/verify-mockup.mjs`](scripts/verify-mockup.mjs) untuk memverifikasi `40` pasangan token Light/Dark (rasio minimum terukur **`4.83:1`**).
3. **Performa & Caching:**
   - Memisahkan render hasil pencarian pada `Daftar Dokumen`, `Manajemen Unit Kerja`, dan `Manajemen Pengguna` agar mengetik tidak membangun ulang seluruh `main.innerHTML` maupun memutus posisi kursor.
   - Menambahkan debounce `120ms` pada pratinjau langsung A4 editor, mengganti animasi `max-width` pada `storyQuery` menjadi `clip-path`, dan menambahkan header `ETag`, `304 Not Modified`, serta `Cache-Control` di [`app/[...asset]/route.js`](app/[...asset]/route.js).
4. **Aksesibilitas & Responsivitas:**
   - Menambahkan tampilan kartu responsif (`.responsive-table-region` / `.responsive-cards`) untuk tabel `Daftar Dokumen`, `Pengajuan Unit`, `Admin Unit`, `Admin Pengguna`, `Admin Penugasan`, dan `Admin Jenis Dokumen`, serta pembungkus scroll `.a4-sheet-scroll` untuk tabel SPO di layar sempit.
   - Menaikkan target sentuh kontrol compact menjadi `44px` di viewport `<= 960px` dan perangkat sentuh (`pointer: coarse`).
   - Melengkapi `aria-label` butir sortable editor, `aria-pressed` filter pengajuan, navigasi keyboard `Enter`/`Space` notifikasi, fokus & `Escape` pada row-menu dan mobile sidebar drawer, navigasi panah pada `radiogroup` dan tab modal tambah pengguna, `role="alert"` + `aria-invalid`/`aria-describedby` validasi form, serta urutan heading `<h1>` -> `<h2>` pada portal login.

---

## Hasil Verifikasi Terakhir

- `node --check mockup/app.js` & `node --check app/[...asset]/route.js`: lolos (`exit 0`).
- `node scripts/verify-mockup.mjs`: lolos (`"ok": true`, `issues: []`, `minContrastLight: 4.83`, `minContrastDark: 4.83`, `34` unit seed, `5` kategori, `52` node & `95` edge Graphify).
- `node scripts/verify-app.mjs`: seluruh skenario integrasi API, akses unit, review, PDF, revisi, dan impor pengguna lolos (`exit 0`).
- `next build --webpack`: build produksi Next.js 16.4.6 sukses (`exit 0`).
