# Community 2: Arsitektur Data dan Infrastruktur

[Kembali ke Wiki Index](index.md) | [Kembali ke Root Index](../../index.md) | [PRD Lengkap](../../docs/PRD_JDIH.md)

## Ringkasan
Mengatur stack Next.js App Router + Route Handlers di Vercel, penyimpanan metadata di 12 tab Google Sheets (`JDIH-DB RS AN-NISA`), penyimpanan berkas di Shared Drive `JDIH RS AN-NISA`, serta Upstash Redis untuk write-lock berurutan, cache tab (menjaga kuota ~300 baca/menit), dan idempotensi.

## Entitas (17 Node)

| Node ID | Label | Tipe | Lokasi PRD | Rasional / Catatan |
|---|---|---|---|---|
| `docs_prd_jdih_nextjs_app_router` | Next.js App Router + Route Handlers | `concept` | L572 | - |
| `docs_prd_jdih_sheets_db` | Google Sheets Database (12 Tab) | `document` | L614 | - |
| `docs_prd_jdih_tab_units` | Tab Sheets Units | `document` | 4.4 Tab Units | - |
| `docs_prd_jdih_tab_categories` | Tab Sheets Categories | `document` | 4.4 Tab Categories | - |
| `docs_prd_jdih_tab_documents` | Tab Sheets Documents | `document` | 4.4 Tab Documents | - |
| `docs_prd_jdih_tab_document_versions` | Tab Sheets Document_Versions | `document` | 4.4 Tab Document_Versions | - |
| `docs_prd_jdih_tab_version_sections` | Tab Sheets Version_Sections | `document` | 4.4 Tab Version_Sections | - |
| `docs_prd_jdih_tab_attachments` | Tab Sheets Attachments | `document` | 4.4 Tab Attachments | - |
| `docs_prd_jdih_tab_review_log` | Tab Sheets Review_Log | `document` | 4.4 Tab Review_Log | - |
| `docs_prd_jdih_tab_document_log` | Tab Sheets Document_Log | `document` | 4.4 Tab Document_Log | - |
| `docs_prd_jdih_tab_notifications` | Tab Sheets Notifications | `document` | 4.4 Tab Notifications | - |
| `docs_prd_jdih_tab_operations` | Tab Sheets Operations (Idempotensi) | `document` | 4.4 Tab Operations | - |
| `docs_prd_jdih_shared_drive` | Shared Drive JDIH RS AN-NISA | `concept` | 4.1 Penyimpanan Berkas | - |
| `docs_prd_jdih_redis_lock_cache` | Upstash Redis Lock, Cache, dan Rate Limit | `rationale` | Decision Log & 4.1 | Serverless Vercel tidak berbagi memori; Redis mencegah nomor ganda, keputusan ganda, dan menjaga kuota 300 baca/menit Google Sheets. |
| `docs_prd_jdih_react_pdf` | Generator PDF (@react-pdf/renderer) | `concept` | 4.1 Generate PDF | - |
| `docs_prd_jdih_api_contracts` | Kontrak API REST (15 Endpoint) | `document` | L802 | - |
| `docs_prd_jdih_vercel_deploy` | Deployment Vercel HTTPS Internal | `concept` | 4.1 Deployment | - |

## Relasi Internal (25)

- `Next.js App Router + Route Handlers` **implements** `Kontrak API REST (15 Endpoint)` (EXTRACTED 1)
- `Next.js App Router + Route Handlers` **conceptually_related_to** `Deployment Vercel HTTPS Internal` (EXTRACTED 1)
- `Next.js App Router + Route Handlers` **calls** `Generator PDF (@react-pdf/renderer)` (INFERRED 0.95)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Units` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Categories` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Documents` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Document_Versions` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Version_Sections` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Attachments` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Review_Log` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Document_Log` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Notifications` (EXTRACTED 1)
- `Google Sheets Database (12 Tab)` **references** `Tab Sheets Operations (Idempotensi)` (EXTRACTED 1)
- `Tab Sheets Documents` **references** `Tab Sheets Units` (EXTRACTED 1)
- `Tab Sheets Documents` **references** `Tab Sheets Categories` (EXTRACTED 1)
- `Tab Sheets Document_Versions` **references** `Tab Sheets Documents` (EXTRACTED 1)
- `Tab Sheets Version_Sections` **references** `Tab Sheets Document_Versions` (EXTRACTED 1)
- `Tab Sheets Attachments` **references** `Tab Sheets Document_Versions` (EXTRACTED 1)
- `Tab Sheets Review_Log` **references** `Tab Sheets Document_Versions` (EXTRACTED 1)
- `Tab Sheets Document_Log` **references** `Tab Sheets Documents` (EXTRACTED 1)
- `Tab Sheets Attachments` **shares_data_with** `Shared Drive JDIH RS AN-NISA` (EXTRACTED 1)
- `Tab Sheets Document_Versions` **shares_data_with** `Shared Drive JDIH RS AN-NISA` (EXTRACTED 1)
- `Tab Sheets Units` **shares_data_with** `Shared Drive JDIH RS AN-NISA` (EXTRACTED 1)
- `Kontrak API REST (15 Endpoint)` **calls** `Upstash Redis Lock, Cache, dan Rate Limit` (EXTRACTED 1)
- `Upstash Redis Lock, Cache, dan Rate Limit` **shares_data_with** `Tab Sheets Operations (Idempotensi)` (EXTRACTED 1)

## Jembatan Lintas Komunitas (16)

- `Role Super Admin` (C0) **shares_data_with** `Tab Sheets Units` (C2) [EXTRACTED 1]
- `RBAC Per Peran dan Unit` (C0) **implements** `Kontrak API REST (15 Endpoint)` (C2) [EXTRACTED 1]
- `Penguncian Login 15 Menit (5x Gagal)` (C0) **shares_data_with** `Upstash Redis Lock, Cache, dan Rate Limit` (C2) [EXTRACTED 1]
- `Nomor Dokumen Manual dan Cek Unik` (C1) **calls** `Upstash Redis Lock, Cache, dan Rate Limit` (C2) [EXTRACTED 1]
- `Nomor Dokumen Manual dan Cek Unik` (C1) **shares_data_with** `Tab Sheets Document_Versions` (C2) [EXTRACTED 1]
- `Verifikasi Manajer (Setujui / Kembalikan)` (C1) **shares_data_with** `Tab Sheets Review_Log` (C2) [EXTRACTED 1]
- `Verifikasi Manajer (Setujui / Kembalikan)` (C1) **calls** `Upstash Redis Lock, Cache, dan Rate Limit` (C2) [EXTRACTED 1]
- `Status Dokumen Aktif / Tidak Aktif` (C1) **shares_data_with** `Tab Sheets Document_Log` (C2) [EXTRACTED 1]
- `Notifikasi Web (Ikon Lonceng)` (C1) **shares_data_with** `Tab Sheets Notifications` (C2) [EXTRACTED 1]
- `Buat Dokumen dari Template` (C1) **shares_data_with** `Tab Sheets Version_Sections` (C2) [EXTRACTED 1]
- `Buat Dokumen dari Template` (C1) **calls** `Generator PDF (@react-pdf/renderer)` (C2) [EXTRACTED 1]
- `Upload Dokumen Resumable < 4 MB` (C1) **shares_data_with** `Shared Drive JDIH RS AN-NISA` (C2) [EXTRACTED 1]
- `Upload Dokumen Resumable < 4 MB` (C1) **shares_data_with** `Tab Sheets Attachments` (C2) [EXTRACTED 1]
- `Lima Jenis Dokumen Tetap` (C1) **shares_data_with** `Tab Sheets Categories` (C2) [EXTRACTED 1]
- `Daftar 34 Unit Awal RS AN-NISA (Lampiran A)` (C4) **shares_data_with** `Tab Sheets Units` (C2) [EXTRACTED 1]
- `Format PDF Resmi A4 Portrait` (C3) **implements** `Generator PDF (@react-pdf/renderer)` (C2) [EXTRACTED 1]
