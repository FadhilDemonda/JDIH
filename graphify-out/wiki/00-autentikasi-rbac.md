# Community 0: Autentikasi dan Kontrol Akses RBAC

[Kembali ke Wiki Index](index.md) | [Kembali ke Root Index](../../index.md) | [PRD Lengkap](../../docs/PRD_JDIH.md)

## Ringkasan
Mengatur login berbasis NIK format `0000.00.00`, sesi cookie `httpOnly` 30 menit, penguncian akun 15 menit setelah 5 kali gagal login, serta RBAC berbasis 4 peran (`Super Admin`, `Staf`, `Koordinator/SPV`, `Manajer`) dan penugasan unit pada tab `User_Units`.

## Entitas (11 Node)

| Node ID | Label | Tipe | Lokasi PRD | Rasional / Catatan |
|---|---|---|---|---|
| `docs_prd_jdih_login_nik` | Login NIK (0000.00.00) | `document` | L109 | - |
| `docs_prd_jdih_sesi_30_menit` | Sesi Cookie httpOnly 30 Menit | `concept` | L572 | - |
| `docs_prd_jdih_penguncian_5x` | Penguncian Login 15 Menit (5x Gagal) | `rationale` | Fitur 0 Edge Cases | Mencegah brute-force password NIK; dapat dibuka oleh Super Admin via Reset Password. |
| `docs_prd_jdih_role_super_admin` | Role Super Admin | `concept` | L530 | - |
| `docs_prd_jdih_role_staf` | Role Staf | `concept` | L530 | - |
| `docs_prd_jdih_role_koordinator` | Role Koordinator/SPV | `concept` | Fitur 3 & Fitur 15 | - |
| `docs_prd_jdih_role_manajer` | Role Manajer | `concept` | Fitur 4 & Fitur 15 | - |
| `docs_prd_jdih_rbac_unit_scope` | RBAC Per Peran dan Unit | `rationale` | Fitur 15 & 4.7 Keamanan | Pemisahan penyusun (Koordinator/SPV) dan pemeriksa (Manajer) dengan validasi ulang hak pada setiap permintaan server. |
| `docs_prd_jdih_tab_users` | Tab Sheets Users | `document` | 4.4 Tab Users | - |
| `docs_prd_jdih_tab_user_units` | Tab Sheets User_Units | `document` | 4.4 Tab User_Units | - |
| `docs_prd_jdih_guard_403` | Penjaga Akses 403 | `concept` | Fitur 15 & Halaman /403 | - |

## Relasi Internal (12)

- `Login NIK (0000.00.00)` **references** `Tab Sheets Users` (EXTRACTED 1)
- `Login NIK (0000.00.00)` **implements** `Sesi Cookie httpOnly 30 Menit` (EXTRACTED 1)
- `Login NIK (0000.00.00)` **implements** `Penguncian Login 15 Menit (5x Gagal)` (EXTRACTED 1)
- `RBAC Per Peran dan Unit` **references** `Role Super Admin` (EXTRACTED 1)
- `RBAC Per Peran dan Unit` **references** `Role Staf` (EXTRACTED 1)
- `RBAC Per Peran dan Unit` **references** `Role Koordinator/SPV` (EXTRACTED 1)
- `RBAC Per Peran dan Unit` **references** `Role Manajer` (EXTRACTED 1)
- `RBAC Per Peran dan Unit` **shares_data_with** `Tab Sheets User_Units` (EXTRACTED 1)
- `Tab Sheets User_Units` **references** `Tab Sheets Users` (EXTRACTED 1)
- `RBAC Per Peran dan Unit` **implements** `Penjaga Akses 403` (EXTRACTED 1)
- `Role Koordinator/SPV` **conceptually_related_to** `Role Manajer` (EXTRACTED 1)
- `Role Super Admin` **shares_data_with** `Tab Sheets Users` (EXTRACTED 1)

## Jembatan Lintas Komunitas (10)

- `Role Koordinator/SPV` (C0) **conceptually_related_to** `Pengajuan Unit (Ajukan, Tarik, Hapus Draf)` (C1) [EXTRACTED 1]
- `Role Koordinator/SPV` (C0) **conceptually_related_to** `Buat Revisi Tertaut Dokumen Induk` (C1) [EXTRACTED 1]
- `Role Koordinator/SPV` (C0) **conceptually_related_to** `Status Dokumen Aktif / Tidak Aktif` (C1) [EXTRACTED 1]
- `Role Manajer` (C0) **conceptually_related_to** `Verifikasi Manajer (Setujui / Kembalikan)` (C1) [EXTRACTED 1]
- `Role Staf` (C0) **conceptually_related_to** `Daftar dan Pencarian Dokumen` (C1) [EXTRACTED 1]
- `Role Super Admin` (C0) **shares_data_with** `Tab Sheets Units` (C2) [EXTRACTED 1]
- `RBAC Per Peran dan Unit` (C0) **implements** `Kontrak API REST (15 Endpoint)` (C2) [EXTRACTED 1]
- `Penguncian Login 15 Menit (5x Gagal)` (C0) **shares_data_with** `Upstash Redis Lock, Cache, dan Rate Limit` (C2) [EXTRACTED 1]
- `Lima Belas Skenario Penerimaan UAT (Lampiran C)` (C4) **references** `RBAC Per Peran dan Unit` (C0) [EXTRACTED 1]
- `Mockup UI Interaktif JDIH (mockup/index.html)` (C3) **implements** `RBAC Per Peran dan Unit` (C0) [EXTRACTED 1]
