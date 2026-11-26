# Community 3: Antarmuka dan Pengalaman Pengguna

[Kembali ke Wiki Index](index.md) | [Kembali ke Root Index](../../index.md) | [PRD Lengkap](../../docs/PRD_JDIH.md)

## Ringkasan
Mengatur 17 route sitemap, palet biru OPPE (Primary `#2563EB`, Primary Dark `#1E3A8A`, Primary Light `#EFF6FF`), struktur PDF A4 portrait Section 5.2, 8 state UI wajib Section 5.3, skema isian editor Lampiran B, serta implementasi mockup interaktif di `mockup/index.html`.

## Entitas (6 Node)

| Node ID | Label | Tipe | Lokasi PRD | Rasional / Catatan |
|---|---|---|---|---|
| `docs_prd_jdih_sitemap_17` | Rencana Halaman (17 Route Sitemap) | `document` | L779 | - |
| `docs_prd_jdih_tema_biru_ui` | Tema Biru OPPE & Tailwind + shadcn/ui | `document` | L842 | - |
| `docs_prd_jdih_format_pdf_a4` | Format PDF Resmi A4 Portrait | `document` | L866 | - |
| `docs_prd_jdih_ui_states_8` | Delapan State UI Wajib (Section 5.3) | `document` | L879 | - |
| `docs_prd_jdih_editor_lampiran_b` | Skema Isian Editor 5 Jenis (Lampiran B) | `document` | L290 | - |
| `docs_prd_jdih_mockup_spa` | Mockup UI Interaktif JDIH (mockup/index.html) | `code` | mockup/index.html | - |

## Relasi Internal (6)

- `Mockup UI Interaktif JDIH (mockup/index.html)` **implements** `Rencana Halaman (17 Route Sitemap)` (EXTRACTED 1)
- `Mockup UI Interaktif JDIH (mockup/index.html)` **implements** `Tema Biru OPPE & Tailwind + shadcn/ui` (EXTRACTED 1)
- `Mockup UI Interaktif JDIH (mockup/index.html)` **implements** `Format PDF Resmi A4 Portrait` (EXTRACTED 1)
- `Mockup UI Interaktif JDIH (mockup/index.html)` **implements** `Delapan State UI Wajib (Section 5.3)` (EXTRACTED 1)
- `Mockup UI Interaktif JDIH (mockup/index.html)` **implements** `Skema Isian Editor 5 Jenis (Lampiran B)` (EXTRACTED 1)
- `Tema Biru OPPE & Tailwind + shadcn/ui` **conceptually_related_to** `Delapan State UI Wajib (Section 5.3)` (EXTRACTED 1)

## Jembatan Lintas Komunitas (8)

- `Buat Dokumen dari Template` (C1) **references** `Skema Isian Editor 5 Jenis (Lampiran B)` (C3) [EXTRACTED 1]
- `Format PDF Resmi A4 Portrait` (C3) **implements** `Generator PDF (@react-pdf/renderer)` (C2) [EXTRACTED 1]
- `Enam Pertanyaan Terbuka (Open Questions)` (C4) **conceptually_related_to** `Format PDF Resmi A4 Portrait` (C3) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `Daftar dan Pencarian Dokumen` (C1) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` (C1) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `Verifikasi Manajer (Setujui / Kembalikan)` (C1) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **shares_data_with** `Daftar 34 Unit Awal RS AN-NISA (Lampiran A)` (C4) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `RBAC Per Peran dan Unit` (C0) [EXTRACTED 1]
