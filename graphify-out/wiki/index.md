# Graphify Wiki Index: JDIH RS AN-NISA

[Kembali ke Root Index](../../index.md) | [Graph Report](../GRAPH_REPORT.md) | [Graph JSON](../graph.json)

Wiki ini dihasilkan dari ekstraksi terstruktur [`docs/PRD_JDIH.md`](../../docs/PRD_JDIH.md) dan ditautkan dengan implementasi mockup [`mockup/index.html`](../../mockup/index.html).

## Daftar Komunitas Pengetahuan

| ID | Komunitas | Node | Artikel Wiki |
|---|---|---|---|
| C0 | Autentikasi dan Kontrol Akses RBAC | 11 | [`00-autentikasi-rbac.md`](00-autentikasi-rbac.md) |
| C1 | Siklus Hidup dan Verifikasi Dokumen | 12 | [`01-siklus-dokumen.md`](01-siklus-dokumen.md) |
| C2 | Arsitektur Data dan Infrastruktur | 17 | [`02-arsitektur-data.md`](02-arsitektur-data.md) |
| C3 | Antarmuka dan Pengalaman Pengguna | 6 | [`03-antarmuka-ui.md`](03-antarmuka-ui.md) |
| C4 | Tata Kelola, Seed Data, dan UAT | 6 | [`04-seed-uat-tata-kelola.md`](04-seed-uat-tata-kelola.md) |

## God Nodes (Titik Hub Arsitektur)

- **Google Sheets Database (12 Tab)** (`docs_prd_jdih_sheets_db`, degree 10) -> [C2](02-arsitektur-data.md)
- **Mockup UI Interaktif JDIH (mockup/index.html)** (`docs_prd_jdih_mockup_spa`, degree 10) -> [C3](03-antarmuka-ui.md)
- **RBAC Per Peran dan Unit** (`docs_prd_jdih_rbac_unit_scope`, degree 9) -> [C0](00-autentikasi-rbac.md)
- **Pengajuan Unit (Ajukan, Tarik, Hapus Draf)** (`docs_prd_jdih_pengajuan_unit`, degree 8) -> [C1](01-siklus-dokumen.md)
- **Verifikasi Manajer (Setujui / Kembalikan)** (`docs_prd_jdih_verifikasi_manajer`, degree 8) -> [C1](01-siklus-dokumen.md)
- **Tab Sheets Document_Versions** (`docs_prd_jdih_tab_document_versions`, degree 7) -> [C2](02-arsitektur-data.md)
