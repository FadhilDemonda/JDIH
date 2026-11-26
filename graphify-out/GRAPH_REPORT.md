# Graphify Knowledge Graph Report: JDIH RS AN-NISA

## Corpus Summary
- **Sumber utama:** `PRD_JDIH.docx` -> [`docs/PRD_JDIH.md`](../docs/PRD_JDIH.md) (978 baris)
- **Target UI:** [`mockup/index.html`](../mockup/index.html)
- **Total Node:** 52
- **Total Edge:** 95 (91 EXTRACTED, 4 INFERRED)
- **Hyperedges:** 3
- **Komunitas:** 5
- **Graph Health Check:** OK (0 dangling endpoints, 0 self-loops)

## God Nodes (Top 10 Architectural Hubs)

| Rank | Node ID | Label | Komunitas | Degree |
|---|---|---|---|---|
| 1 | `docs_prd_jdih_sheets_db` | Google Sheets Database (12 Tab) | Arsitektur Data dan Infrastruktur | 10 |
| 2 | `docs_prd_jdih_mockup_spa` | Mockup UI Interaktif JDIH (mockup/index.html) | Antarmuka dan Pengalaman Pengguna | 10 |
| 3 | `docs_prd_jdih_rbac_unit_scope` | RBAC Per Peran dan Unit | Autentikasi dan Kontrol Akses RBAC | 9 |
| 4 | `docs_prd_jdih_pengajuan_unit` | Pengajuan Unit (Ajukan, Tarik, Hapus Draf) | Siklus Hidup dan Verifikasi Dokumen | 8 |
| 5 | `docs_prd_jdih_verifikasi_manajer` | Verifikasi Manajer (Setujui / Kembalikan) | Siklus Hidup dan Verifikasi Dokumen | 8 |
| 6 | `docs_prd_jdih_tab_document_versions` | Tab Sheets Document_Versions | Arsitektur Data dan Infrastruktur | 7 |
| 7 | `docs_prd_jdih_role_koordinator` | Role Koordinator/SPV | Autentikasi dan Kontrol Akses RBAC | 5 |
| 8 | `docs_prd_jdih_buat_template` | Buat Dokumen dari Template | Siklus Hidup dan Verifikasi Dokumen | 5 |
| 9 | `docs_prd_jdih_tab_units` | Tab Sheets Units | Arsitektur Data dan Infrastruktur | 5 |
| 10 | `docs_prd_jdih_tab_documents` | Tab Sheets Documents | Arsitektur Data dan Infrastruktur | 5 |

## Communities Breakdown

### Community 0: Autentikasi dan Kontrol Akses RBAC
- **Jumlah node:** 11 | **Edge internal:** 12 | **Jembatan lintas komunitas:** 10
- **Artikel wiki:** [`wiki/00-autentikasi-rbac.md`](wiki/00-autentikasi-rbac.md)
- **Node kunci:** `Login NIK (0000.00.00)`, `Sesi Cookie httpOnly 30 Menit`, `Penguncian Login 15 Menit (5x Gagal)`, `Role Super Admin`, `Role Staf`, `Role Koordinator/SPV`

### Community 1: Siklus Hidup dan Verifikasi Dokumen
- **Jumlah node:** 12 | **Edge internal:** 16 | **Jembatan lintas komunitas:** 23
- **Artikel wiki:** [`wiki/01-siklus-dokumen.md`](wiki/01-siklus-dokumen.md)
- **Node kunci:** `Lima Jenis Dokumen Tetap`, `Buat Dokumen dari Template`, `Upload Dokumen Resumable < 4 MB`, `Nomor Dokumen Manual dan Cek Unik`, `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)`, `Verifikasi Manajer (Setujui / Kembalikan)`

### Community 2: Arsitektur Data dan Infrastruktur
- **Jumlah node:** 17 | **Edge internal:** 25 | **Jembatan lintas komunitas:** 16
- **Artikel wiki:** [`wiki/02-arsitektur-data.md`](wiki/02-arsitektur-data.md)
- **Node kunci:** `Next.js App Router + Route Handlers`, `Google Sheets Database (12 Tab)`, `Tab Sheets Units`, `Tab Sheets Categories`, `Tab Sheets Documents`, `Tab Sheets Document_Versions`

### Community 3: Antarmuka dan Pengalaman Pengguna
- **Jumlah node:** 6 | **Edge internal:** 6 | **Jembatan lintas komunitas:** 8
- **Artikel wiki:** [`wiki/03-antarmuka-ui.md`](wiki/03-antarmuka-ui.md)
- **Node kunci:** `Rencana Halaman (17 Route Sitemap)`, `Tema Biru OPPE & Tailwind + shadcn/ui`, `Format PDF Resmi A4 Portrait`, `Delapan State UI Wajib (Section 5.3)`, `Skema Isian Editor 5 Jenis (Lampiran B)`, `Mockup UI Interaktif JDIH (mockup/index.html)`

### Community 4: Tata Kelola, Seed Data, dan UAT
- **Jumlah node:** 6 | **Edge internal:** 4 | **Jembatan lintas komunitas:** 7
- **Artikel wiki:** [`wiki/04-seed-uat-tata-kelola.md`](wiki/04-seed-uat-tata-kelola.md)
- **Node kunci:** `Daftar 34 Unit Awal RS AN-NISA (Lampiran A)`, `Decision Log Arsitektur & Produk (16 Keputusan)`, `Enam Pertanyaan Terbuka (Open Questions)`, `Lima Belas Skenario Penerimaan UAT (Lampiran C)`, `Rencana Implementasi 4 Sprint`, `Tujuan Bisnis & 6 Key Results`


## Hyperedges (Multi-Node Flows)

- **Alur Pengajuan, Kunci Redis, Verifikasi Manajer, dan Notifikasi Web** (`alur_verifikasi_dan_publikasi`, EXTRACTED 1): `docs_prd_jdih_role_koordinator` <-> `docs_prd_jdih_pengajuan_unit` <-> `docs_prd_jdih_redis_lock_cache` <-> `docs_prd_jdih_role_manajer` <-> `docs_prd_jdih_verifikasi_manajer` <-> `docs_prd_jdih_tab_review_log` <-> `docs_prd_jdih_notifikasi_web`
- **Arsitektur Serverless Next.js + Google Sheets + Shared Drive + Upstash Redis** (`arsitektur_penyimpanan_jdih`, EXTRACTED 1): `docs_prd_jdih_nextjs_app_router` <-> `docs_prd_jdih_sheets_db` <-> `docs_prd_jdih_shared_drive` <-> `docs_prd_jdih_redis_lock_cache` <-> `docs_prd_jdih_vercel_deploy`
- **Kendali Keberlakuan Tanggal WIB dan Riwayat Versi Dokumen** (`kendali_keberlakuan_dan_revisi`, EXTRACTED 1): `docs_prd_jdih_tab_documents` <-> `docs_prd_jdih_tab_document_versions` <-> `docs_prd_jdih_keberlakuan_tanggal` <-> `docs_prd_jdih_buat_revisi` <-> `docs_prd_jdih_status_aktif_nonaktif`

## Open Questions (Perlu Keputusan Sebelum Sprint 3-4)
1. Template resmi dan tata letak PDF final untuk 5 jenis dokumen (SK, Kebijakan, Pedoman Kerja, Pedoman Pelayanan, SPO).
2. Bukti pengesahan wajib sebelum Manajer menyetujui (mis. scan tanda tangan Direktur).
3. Batas ukuran unggahan final (usulan PRD: 20 MB per berkas).
4. Mekanisme password awal (ditetapkan Super Admin + wajib ganti vs template OPPE `annisa123`).
5. Contoh nomor resmi selain SPO (`RSAN/SPO/5/DTO/007`).
6. Daftar awal Koordinator/SPV dan Manajer per 34 unit.
