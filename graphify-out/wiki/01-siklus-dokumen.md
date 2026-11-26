# Community 1: Siklus Hidup dan Verifikasi Dokumen

[Kembali ke Wiki Index](index.md) | [Kembali ke Root Index](../../index.md) | [PRD Lengkap](../../docs/PRD_JDIH.md)

## Ringkasan
Mengatur siklus hidup dokumen regulasi internal RS AN-NISA: 5 jenis tetap, penyusunan via Template atau Upload resumable (< 4 MB per chunk), validasi nomor manual unik (HTTP 409), alur `DRAF -> MENUNGGU_VERIFIKASI -> DISETUJUI/DIKEMBALIKAN`, penarikan/hapus draf, keberlakuan dinamis zona Asia/Jakarta, revisi tertaut, status Aktif/Tidak Aktif, dan notifikasi lonceng web.

## Entitas (12 Node)

| Node ID | Label | Tipe | Lokasi PRD | Rasional / Catatan |
|---|---|---|---|---|
| `docs_prd_jdih_jenis_dokumen` | Lima Jenis Dokumen Tetap | `concept` | Fitur 5 & Lampiran B | - |
| `docs_prd_jdih_buat_template` | Buat Dokumen dari Template | `document` | L277 | - |
| `docs_prd_jdih_upload_chunked` | Upload Dokumen Resumable < 4 MB | `document` | Fitur 7 & 4.1 | - |
| `docs_prd_jdih_nomor_manual_unik` | Nomor Dokumen Manual dan Cek Unik | `rationale` | L606 | Nomor dokumen bebas manual karena pola RS bervariasi, tetapi ternormalisasi wajib unik seluruh RS (409 on conflict). |
| `docs_prd_jdih_pengajuan_unit` | Pengajuan Unit (Ajukan, Tarik, Hapus Draf) | `document` | L336 | - |
| `docs_prd_jdih_verifikasi_manajer` | Verifikasi Manajer (Setujui / Kembalikan) | `document` | L369 | - |
| `docs_prd_jdih_keberlakuan_tanggal` | Keberlakuan Dihitung dari Tanggal (WIB) | `rationale` | L606 | Status Berlaku, Berlaku mulai, dan Versi Sebelumnya dihitung dinamis agar revisi bertanggal masa depan tidak menggeser versi aktif saat ini. |
| `docs_prd_jdih_buat_revisi` | Buat Revisi Tertaut Dokumen Induk | `document` | L456 | - |
| `docs_prd_jdih_status_aktif_nonaktif` | Status Dokumen Aktif / Tidak Aktif | `document` | L483 | - |
| `docs_prd_jdih_notifikasi_web` | Notifikasi Web (Ikon Lonceng) | `document` | L510 | - |
| `docs_prd_jdih_daftar_pencarian` | Daftar dan Pencarian Dokumen | `document` | L400 | - |
| `docs_prd_jdih_detail_pratinjau` | Detail Dokumen, Pratinjau, dan Riwayat Versi | `document` | L428 | - |

## Relasi Internal (16)

- `Buat Dokumen dari Template` **references** `Lima Jenis Dokumen Tetap` (EXTRACTED 1)
- `Upload Dokumen Resumable < 4 MB` **references** `Lima Jenis Dokumen Tetap` (EXTRACTED 1)
- `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` **conceptually_related_to** `Buat Dokumen dari Template` (EXTRACTED 1)
- `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` **conceptually_related_to** `Upload Dokumen Resumable < 4 MB` (EXTRACTED 1)
- `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` **implements** `Nomor Dokumen Manual dan Cek Unik` (EXTRACTED 1)
- `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` **conceptually_related_to** `Verifikasi Manajer (Setujui / Kembalikan)` (EXTRACTED 1)
- `Verifikasi Manajer (Setujui / Kembalikan)` **implements** `Keberlakuan Dihitung dari Tanggal (WIB)` (EXTRACTED 1)
- `Buat Revisi Tertaut Dokumen Induk` **references** `Keberlakuan Dihitung dari Tanggal (WIB)` (EXTRACTED 1)
- `Buat Revisi Tertaut Dokumen Induk` **conceptually_related_to** `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` (EXTRACTED 1)
- `Status Dokumen Aktif / Tidak Aktif` **conceptually_related_to** `Daftar dan Pencarian Dokumen` (EXTRACTED 1)
- `Detail Dokumen, Pratinjau, dan Riwayat Versi` **references** `Keberlakuan Dihitung dari Tanggal (WIB)` (EXTRACTED 1)
- `Detail Dokumen, Pratinjau, dan Riwayat Versi` **conceptually_related_to** `Buat Revisi Tertaut Dokumen Induk` (EXTRACTED 1)
- `Detail Dokumen, Pratinjau, dan Riwayat Versi` **conceptually_related_to** `Status Dokumen Aktif / Tidak Aktif` (EXTRACTED 1)
- `Daftar dan Pencarian Dokumen` **references** `Detail Dokumen, Pratinjau, dan Riwayat Versi` (EXTRACTED 1)
- `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` **implements** `Notifikasi Web (Ikon Lonceng)` (EXTRACTED 1)
- `Verifikasi Manajer (Setujui / Kembalikan)` **implements** `Notifikasi Web (Ikon Lonceng)` (EXTRACTED 1)

## Jembatan Lintas Komunitas (23)

- `Role Koordinator/SPV` (C0) **conceptually_related_to** `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` (C1) [EXTRACTED 1]
- `Role Koordinator/SPV` (C0) **conceptually_related_to** `Buat Revisi Tertaut Dokumen Induk` (C1) [EXTRACTED 1]
- `Role Koordinator/SPV` (C0) **conceptually_related_to** `Status Dokumen Aktif / Tidak Aktif` (C1) [EXTRACTED 1]
- `Role Manajer` (C0) **conceptually_related_to** `Verifikasi Manajer (Setujui / Kembalikan)` (C1) [EXTRACTED 1]
- `Role Staf` (C0) **conceptually_related_to** `Daftar dan Pencarian Dokumen` (C1) [EXTRACTED 1]
- `Nomor Dokumen Manual dan Cek Unik` (C1) **calls** `Upstash Redis Lock, Cache, dan Rate Limit` (C2) [EXTRACTED 1]
- `Nomor Dokumen Manual dan Cek Unik` (C1) **shares_data_with** `Tab Sheets Document_Versions` (C2) [EXTRACTED 1]
- `Verifikasi Manajer (Setujui / Kembalikan)` (C1) **shares_data_with** `Tab Sheets Review_Log` (C2) [EXTRACTED 1]
- `Verifikasi Manajer (Setujui / Kembalikan)` (C1) **calls** `Upstash Redis Lock, Cache, dan Rate Limit` (C2) [EXTRACTED 1]
- `Status Dokumen Aktif / Tidak Aktif` (C1) **shares_data_with** `Tab Sheets Document_Log` (C2) [EXTRACTED 1]
- `Notifikasi Web (Ikon Lonceng)` (C1) **shares_data_with** `Tab Sheets Notifications` (C2) [EXTRACTED 1]
- `Buat Dokumen dari Template` (C1) **shares_data_with** `Tab Sheets Version_Sections` (C2) [EXTRACTED 1]
- `Buat Dokumen dari Template` (C1) **calls** `Generator PDF (@react-pdf/renderer)` (C2) [EXTRACTED 1]
- `Buat Dokumen dari Template` (C1) **references** `Skema Isian Editor 5 Jenis (Lampiran B)` (C3) [EXTRACTED 1]
- `Upload Dokumen Resumable < 4 MB` (C1) **shares_data_with** `Shared Drive JDIH RS AN-NISA` (C2) [EXTRACTED 1]
- `Upload Dokumen Resumable < 4 MB` (C1) **shares_data_with** `Tab Sheets Attachments` (C2) [EXTRACTED 1]
- `Lima Jenis Dokumen Tetap` (C1) **shares_data_with** `Tab Sheets Categories` (C2) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `Keberlakuan Dihitung dari Tanggal (WIB)` (C1) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `Verifikasi Manajer (Setujui / Kembalikan)` (C1) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `Nomor Dokumen Manual dan Cek Unik` (C1) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `Daftar dan Pencarian Dokumen` (C1) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` (C1) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `Verifikasi Manajer (Setujui / Kembalikan)` (C1) [EXTRACTED 1]
