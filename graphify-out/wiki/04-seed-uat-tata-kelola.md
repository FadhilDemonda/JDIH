# Community 4: Tata Kelola, Seed Data, dan UAT

[Kembali ke Wiki Index](index.md) | [Kembali ke Root Index](../../index.md) | [PRD Lengkap](../../docs/PRD_JDIH.md)

## Ringkasan
Mengatur 34 unit awal RS AN-NISA (Lampiran A), 16 Decision Log arsitektur & produk, 6 Open Questions, 15 skenario penerimaan UAT (Lampiran C), 6 Key Results bisnis, dan peta jalan Sprint 1-4.

## Entitas (6 Node)

| Node ID | Label | Tipe | Lokasi PRD | Rasional / Catatan |
|---|---|---|---|---|
| `docs_prd_jdih_unit_seed_34` | Daftar 34 Unit Awal RS AN-NISA (Lampiran A) | `document` | L162 | - |
| `docs_prd_jdih_decision_log` | Decision Log Arsitektur & Produk (16 Keputusan) | `rationale` | L23 | Mengunci ruang lingkup Fase 1 selaras aplikasi OPPE tanpa server DB terpisah. |
| `docs_prd_jdih_open_questions` | Enam Pertanyaan Terbuka (Open Questions) | `document` | L893 | - |
| `docs_prd_jdih_uat_15` | Lima Belas Skenario Penerimaan UAT (Lampiran C) | `document` | L958 | - |
| `docs_prd_jdih_sprint_roadmap` | Rencana Implementasi 4 Sprint | `document` | 2. Rencana Sprint | - |
| `docs_prd_jdih_metrik_sukses` | Tujuan Bisnis & 6 Key Results | `document` | L57 | - |

## Relasi Internal (4)

- `Decision Log Arsitektur & Produk (16 Keputusan)` **rationale_for** `Rencana Implementasi 4 Sprint` (INFERRED 0.85)
- `Tujuan Bisnis & 6 Key Results` **conceptually_related_to** `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (INFERRED 0.85)
- `Daftar 34 Unit Awal RS AN-NISA (Lampiran A)` **references** `Rencana Implementasi 4 Sprint` (EXTRACTED 1)
- `Enam Pertanyaan Terbuka (Open Questions)` **conceptually_related_to** `Rencana Implementasi 4 Sprint` (INFERRED 0.75)

## Jembatan Lintas Komunitas (7)

- `Daftar 34 Unit Awal RS AN-NISA (Lampiran A)` (C4) **shares_data_with** `Tab Sheets Units` (C2) [EXTRACTED 1]
- `Enam Pertanyaan Terbuka (Open Questions)` (C4) **conceptually_related_to** `Format PDF Resmi A4 Portrait` (C3) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `RBAC Per Peran dan Unit` (C0) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `Keberlakuan Dihitung dari Tanggal (WIB)` (C1) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `Verifikasi Manajer (Setujui / Kembalikan)` (C1) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `Nomor Dokumen Manual dan Cek Unik` (C1) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **shares_data_with** `Daftar 34 Unit Awal RS AN-NISA (Lampiran A)` (C4) [EXTRACTED 1]
