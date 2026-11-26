# Index Pengetahuan & Artefak: JDIH RS AN-NISA

> **Entry point Graphify** untuk PRD Sistem Jaringan Dokumentasi dan Informasi Hukum (JDIH) RS AN-NISA, Knowledge Graph, Mockup UI Interaktif, dan Laporan Audit Impeccable.

## Peta Artefak Proyek

| Artefak | Lokasi | Fungsi |
|---|---|---|
| Dokumen PRD Asli | [`PRD_JDIH.docx`](PRD_JDIH.docx) | Sumber primer spesifikasi JDIH RS AN-NISA (v1.1, TIM DTO) |
| Ekstraksi Markdown PRD | [`docs/PRD_JDIH.md`](docs/PRD_JDIH.md) | Representasi Markdown penuh (978 baris: 16 fitur, 12 tab DB, 17 rute, 34 unit, 15 UAT) |
| Knowledge Graph JSON | [`graphify-out/graph.json`](graphify-out/graph.json) | Graf pengetahuan Graphify (52 node, 95 edge, 3 hyperedge, 0 error integritas) |
| Laporan Graphify | [`graphify-out/GRAPH_REPORT.md`](graphify-out/GRAPH_REPORT.md) | Ringkasan komunitas, god nodes, jembatan lintas modul, dan open questions |
| Wiki Agent-Crawlable | [`graphify-out/wiki/index.md`](graphify-out/wiki/index.md) | Indeks wiki 5 artikel komunitas untuk navigasi cepat per domain |
| Mockup UI Interaktif | [`mockup/index.html`](mockup/index.html) | Aplikasi web mockup JDIH RS AN-NISA (17 rute, 4 peran, 34 unit, editor 5 template, preview PDF A4, dark mode) |
| Laporan Audit Impeccable | [`AUDIT_REPORT.md`](AUDIT_REPORT.md) | Audit teknis 5 dimensi (A11y, Performance, Theming, Responsive, Implementation Integrity) |

## Peta Komunitas Graphify (5 Klaster Utama)

| Komunitas | Cakupan PRD | Artikel Wiki |
|---|---|---|
| **C0: Autentikasi & RBAC** | Login NIK `0000.00.00`, sesi 30m, lockout 5x/15m, 4 peran, penugasan unit, guard 403 | [`graphify-out/wiki/00-autentikasi-rbac.md`](graphify-out/wiki/00-autentikasi-rbac.md) |
| **C1: Siklus Hidup & Verifikasi Dokumen** | Template vs Upload < 4MB, nomor unik 409, ajukan/tarik/hapus, verifikasi Manajer, keberlakuan WIB, revisi, Aktif/Nonaktif, notifikasi | [`graphify-out/wiki/01-siklus-dokumen.md`](graphify-out/wiki/01-siklus-dokumen.md) |
| **C2: Arsitektur Data & Infrastruktur** | Next.js App Router, 12 tab Google Sheets, Shared Drive, Upstash Redis locks/cache, `@react-pdf/renderer`, 15 endpoint API | [`graphify-out/wiki/02-arsitektur-data.md`](graphify-out/wiki/02-arsitektur-data.md) |
| **C3: Antarmuka & Pengalaman Pengguna** | 17 rute sitemap, tema biru OPPE, format PDF A4, 8 UI states, isian editor Lampiran B, kode mockup | [`graphify-out/wiki/03-antarmuka-ui.md`](graphify-out/wiki/03-antarmuka-ui.md) |
| **C4: Tata Kelola, Seed Data & UAT** | 34 unit awal RS AN-NISA, 16 decision log, 6 open questions, 15 skenario UAT, 4 sprint | [`graphify-out/wiki/04-seed-uat-tata-kelola.md`](graphify-out/wiki/04-seed-uat-tata-kelola.md) |

## God Nodes (Simpul Arsitektur Berderajat Tertinggi)

1. **Google Sheets Database (12 Tab)** (`degree=10`, C2) — `docs_prd_jdih_sheets_db`
2. **Mockup UI Interaktif JDIH (mockup/index.html)** (`degree=10`, C3) — `docs_prd_jdih_mockup_spa`
3. **RBAC Per Peran dan Unit** (`degree=9`, C0) — `docs_prd_jdih_rbac_unit_scope`
4. **Pengajuan Unit (Ajukan, Tarik, Hapus Draf)** (`degree=8`, C1) — `docs_prd_jdih_pengajuan_unit`
5. **Verifikasi Manajer (Setujui / Kembalikan)** (`degree=8`, C1) — `docs_prd_jdih_verifikasi_manajer`
6. **Tab Sheets Document_Versions** (`degree=7`, C2) — `docs_prd_jdih_tab_document_versions`
7. **Role Koordinator/SPV** (`degree=5`, C0) — `docs_prd_jdih_role_koordinator`
8. **Buat Dokumen dari Template** (`degree=5`, C1) — `docs_prd_jdih_buat_template`

## Cakupan 17 Halaman Sitemap di Mockup UI

| No | Halaman | Hash Route Mockup | Peran |
|---|---|---|---|
| 1 | Login | `#/login` | Semua |
| 2 | Ganti Password | `#/ganti-password` | Semua |
| 3 | Profil | `#/profil` | Semua |
| 4 | Daftar Dokumen | `#/dokumen` | Semua |
| 5 | Detail Dokumen | `#/dokumen/:id` | Semua |
| 6 | Pengajuan Unit | `#/pengajuan` | Koordinator/SPV, Super Admin |
| 7 | Buat Dokumen (Step 1) | `#/pengajuan/baru` | Koordinator/SPV, Super Admin |
| 8 | Edit Draf (Step 2) | `#/pengajuan/:versionId` | Koordinator/SPV, Super Admin |
| 9 | Antrean Verifikasi | `#/verifikasi` | Manajer, Super Admin |
| 10 | Detail Verifikasi | `#/verifikasi/:versionId` | Manajer, Super Admin |
| 11 | Notifikasi | `#/notifikasi` | Koordinator/SPV, Manajer, Super Admin |
| 12 | Admin Unit (34 Unit) | `#/admin/unit` | Super Admin |
| 13 | Admin Pengguna | `#/admin/pengguna` | Super Admin |
| 14 | Admin Koordinator/SPV | `#/admin/koordinator` | Super Admin |
| 15 | Admin Manajer | `#/admin/manajer` | Super Admin |
| 16 | Admin Jenis Dokumen | `#/admin/jenis-dokumen` | Super Admin |
| 17 | Akses Ditolak | `#/403` | Semua |
