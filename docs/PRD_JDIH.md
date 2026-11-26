# PRD Jaringan Dokumentasi dan Informasi Hukum (JDIH) RS AN-NISA


| Meta Data | Keterangan |
| --- | --- |


| Status Dokumen | Draft — untuk validasi internal |
| --- | --- |
| Product Owner | TIM DTO |
| Tech Lead | TIM DTO |
| Target Sprint | Sprint 1–4 |
| Dokumen Terkait | PRD Sistem OPPE Tenaga Medis v1.1 (acuan format & konvensi login) |

#### Riwayat Versi


| Versi | Tanggal | Penulis | Perubahan |
| --- | --- | --- | --- |
| 1.0 | 26/11/2026 | TIM DTO | Rancangan awal: alur pengajuan–verifikasi–publikasi, penomoran & revisi, Google Sheets + Shared Drive. |
| 1.1 | 26/11/2026 | TIM DTO | Peran Super Admin; login NIK; nomor dokumen manual; status Aktif/Tidak Aktif; tarik pengajuan & hapus draf; notifikasi web; 34 unit awal; keberlakuan dihitung dari tanggal; deploy Vercel. |

#### Catatan Keputusan (Decision Log)


| Tanggal | Keputusan | Alasan | Diputuskan Oleh |
| --- | --- | --- | --- |
| 26/11/2026 | Lima jenis dokumen: SK, Kebijakan, Pedoman Kerja, Pedoman Pelayanan, SPO. | Sesuai jenis regulasi internal RS. | @ProductOwner |
| 26/11/2026 | Pembuat dokumen hanya Koordinator/SPV; Manajer hanya memverifikasi. | Pemisahan penyusun dan pemeriksa. | @ProductOwner |
| 26/11/2026 | Satu Manajer dapat membawahi lebih dari satu unit; satu Koordinator/SPV dapat ditugaskan ke lebih dari satu unit. | Sesuai struktur organisasi RS. | @ProductOwner |
| 26/11/2026 | Persetujuan Manajer langsung memublikasikan dokumen (tanpa tahap Direktur di sistem). | Menyederhanakan alur; pengesahan Direktur tercantum di berkas dokumen. | @ProductOwner |
| 26/11/2026 | Nomor dokumen diisi manual dan bebas; formulir menampilkan contoh nomor per jenis (contoh SPO: RSAN/SPO/5/DTO/007). | Pola resmi bervariasi dan dokumen lama memakai nomor asli. | @ProductOwner |
| 26/11/2026 | Nomor dokumen wajib unik di seluruh RS (setelah normalisasi spasi & huruf kapital). | Nomor sudah memuat kode jenis dan unit. | @ProductOwner |
| 26/11/2026 | Status Berlaku / Berlaku mulai / Versi Sebelumnya dihitung dari tanggal mulai berlaku, bukan disimpan. | Revisi bertanggal masa depan tidak menggeser versi yang masih berlaku. | @ProductOwner |
| 26/11/2026 | Dokumen dapat diubah Aktif/Tidak Aktif oleh Koordinator/SPV unit pemilik dengan alasan wajib, tanpa verifikasi Manajer. | Menangani dokumen yang dicabut tanpa pengganti. | @ProductOwner |
| 26/11/2026 | Koordinator/SPV dapat menarik pengajuan dan menghapus draf yang belum pernah terbit; keduanya hilang dari tampilan Manajer. | Memperbaiki salah input tanpa melibatkan Manajer. | @ProductOwner |
| 26/11/2026 | Notifikasi hanya di web (ikon lonceng), tanpa email/WhatsApp. | Cukup untuk kebutuhan internal. | @ProductOwner |
| 26/11/2026 | Login memakai NIK (format 0000.00.00, contoh 1221.21.23) dan password. | NIK sudah menjadi identitas pegawai dan dipakai aplikasi OPPE. | @ProductOwner |
| 26/11/2026 | Super Admin memiliki seluruh fitur, termasuk CRUD unit, pengguna, penugasan Koordinator/SPV dan Manajer. | Kebutuhan pengelolaan sistem. | @ProductOwner |
| 26/11/2026 | Pencarian cukup pada judul, nomor, dan kata kunci (tanpa isi PDF). | Cukup untuk rilis awal. | @ProductOwner |
| 26/11/2026 | Frontend & backend Next.js; data di Google Sheets; berkas di Shared Drive; deploy di Vercel. | Satu codebase, tanpa server database, selaras dengan aplikasi OPPE. | @TechLead |
| 26/11/2026 | Kunci penulisan, cache, dan pembatas login memakai Redis (Upstash). | Fungsi serverless Vercel tidak berbagi memori; mencegah nomor ganda dan keputusan ganda. | @TechLead |
| 26/11/2026 | Unggahan dipecah per potongan < 4 MB; pratinjau/unduhan dialirkan (streaming). | Batas body request fungsi Vercel 4,5 MB. | @TechLead |

## 1. Konteks Strategis (The Why)

### 1.1 Pernyataan Masalah & Latar Belakang

Rumah sakit wajib memiliki regulasi internal (SK, Kebijakan, Pedoman, dan SPO) yang terdokumentasi, terkendali versinya, dan mudah diakses staf. Proses yang terjadi saat ini:

- Dokumen regulasi tersebar di masing-masing unit (folder lokal, cetakan, grup chat) → staf sulit menemukan dokumen unit lain.
- Tidak jelas versi mana yang berlaku → staf berisiko memakai SPO lama yang sudah direvisi.
- Pengajuan dan pemeriksaan dokumen dilakukan manual → status pengajuan sulit dipantau dan catatan perbaikan tercecer.
- Nomor dokumen dapat ganda karena tidak ada pemeriksaan terpusat.
- Riwayat revisi tidak terarsip → sulit menunjukkan dokumen yang berlaku pada tanggal tertentu saat survei akreditasi.
- Format penulisan tiap unit tidak seragam.
### 1.2 Tujuan Bisnis & Metrik Sukses

- Objective: RS memiliki satu repositori internal untuk seluruh regulasi unit, dengan alur penyusunan, verifikasi Manajer, publikasi, dan riwayat versi yang tertelusur.
- Key Result (Metrics):
- 100% dokumen regulasi yang berlaku di 34 unit tersedia di JDIH pada akhir masa migrasi.
- Staf menemukan dokumen lintas unit melalui pencarian judul/nomor/kata kunci dalam ≤ 1 menit (uji UAT).
- 0 nomor dokumen ganda di antara dokumen terbit.
- 100% versi terdahulu dapat dibuka kembali melalui riwayat versi.
- Median waktu pengajuan sampai publikasi ≤ 5 hari kerja.
- 100% akses dibatasi sesuai peran dan unit; setiap keputusan verifikasi tercatat.
## 2. Definisi Lingkup (Scope)


| In-Scope (Fase 1) | Out-of-Scope (Fase 2+) |
| --- | --- |
| Login NIK + password, peran berbasis unit (RBAC) | Tanda tangan elektronik (TTE) / tersertifikasi |
| Manajemen Unit (CRUD) + folder Drive otomatis | Notifikasi email / WhatsApp |
| Manajemen Pengguna, Koordinator/SPV, dan Manajer | Penomoran otomatis |
| Pengaturan jenis dokumen (contoh nomor, versi template) | Pencarian isi (full-text) PDF |
| Buat dokumen dari template (5 jenis) + generate PDF | Integrasi SIMRS / SDM untuk sinkronisasi pegawai |
| Upload dokumen (PDF, DOCX sumber, lampiran) | Alur persetujuan berjenjang (mis. Direktur) di sistem |
| Simpan draf, ajukan, tarik pengajuan, hapus draf | Akses publik / di luar pengguna internal |
| Verifikasi Manajer: setujui / kembalikan dengan catatan | Aplikasi mobile native |
| Daftar & pencarian dokumen, detail, pratinjau, unduh | Distribusi & bukti baca dokumen (read receipt) |
| Riwayat versi & Buat Revisi | Kedaluwarsa / pengingat review berkala dokumen |
| Status dokumen Aktif / Tidak Aktif | Dashboard statistik |
| Notifikasi web |  |

Asumsi & Ketergantungan:


| Asumsi / Dependency | PIC | Target Date | Status |
| --- | --- | --- | --- |
| Google Workspace dengan Shared Drive "JDIH RS AN-NISA"; Service Account sebagai Content Manager | @TechLead | Sprint 1 | ⏳ TBD |
| Proyek Google Cloud (Sheets API & Drive API) dan kunci Service Account | @TechLead | Sprint 1 | ⏳ TBD |
| Akun Vercel dan database Upstash Redis | @TechLead | Sprint 1 | ⏳ TBD |
| NIK & nama Super Admin pertama; daftar Koordinator/SPV dan Manajer per unit | @ProductOwner | Sprint 1 | ⏳ TBD |
| Template resmi tiap jenis dokumen dan bukti pengesahan yang diwajibkan | @ProductOwner | Sprint 3 | ⏳ TBD |
| Berkas dokumen lama (PDF) per unit untuk migrasi melalui Upload | @ProductOwner | Sprint 4 | ⏳ TBD |

Rencana Sprint:


| Sprint | Cakupan |
| --- | --- |
| Sprint 1 | Setup proyek Next.js, koneksi Sheets/Drive/Redis, skrip setup tab & seed, login NIK & sesi, Manajemen Unit, Pengguna, Koordinator/SPV, Manajer, Jenis Dokumen |
| Sprint 2 | Upload dokumen (unggah berpotongan), simpan draf, nomor manual & cek unik, ajukan/tarik/hapus, antrean & verifikasi Manajer, notifikasi web |
| Sprint 3 | Daftar & pencarian, detail, pratinjau/unduh, riwayat versi & keberlakuan, Buat Revisi, Aktif/Tidak Aktif, editor template 5 jenis + generate PDF |
| Sprint 4 | Pengerasan keamanan & idempotensi, migrasi dokumen lama, UAT & perbaikan |

## 3. Spesifikasi Fungsional (User Stories & AC)

### Fitur 0: Login & Autentikasi

Prioritas: 🔴 Must Have

User Story:

"Sebagai pengguna sistem (Super Admin, Staf, Koordinator/SPV, Manajer), saya ingin login dengan NIK dan password, agar saya hanya dapat mengakses menu dan data sesuai peran dan unit saya."

Acceptance Criteria:

1. Happy Path:

- Given: Pengguna aktif telah didaftarkan Super Admin
- When: Pengguna memasukkan NIK (format 0000.00.00, contoh 1221.21.23) dan password yang benar lalu menekan Masuk
- Then: Sistem mengarahkan pengguna ke Daftar Dokumen dan menampilkan menu sesuai gabungan seluruh peran dan unit yang dimiliki.
2. Ketentuan tambahan:

- Titik pada NIK disisipkan otomatis saat mengetik (ketik 12212123 → 1221.21.23); NIK tanpa titik juga diterima server.
- Password disimpan sebagai hash bcrypt. Password awal dan hasil reset ditetapkan Super Admin; pengguna wajib menggantinya saat login pertama (lihat Pertanyaan Terbuka no. 4).
- Pengguna dapat mengganti password sendiri melalui menu Profil (minimal 8 karakter, kombinasi huruf & angka).
- Sesi berakhir otomatis setelah 30 menit tanpa aktivitas.
- Status akun diperiksa pada setiap permintaan; akun yang dinonaktifkan langsung kehilangan akses.
- Setelah login, pengguna hanya diarahkan ke halaman internal (parameter "next" ke situs luar diabaikan).
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| NIK atau password salah | Login ditolak: "NIK atau password salah". Isian NIK tetap terisi. |
| Format NIK tidak sesuai 0000.00.00 | Login ditolak: "Format NIK harus 0000.00.00 (contoh 1221.21.23)". |
| Akun nonaktif | Login ditolak: "Akun Anda tidak aktif, hubungi admin". |
| Gagal login 5 kali berturut-turut | Akun dikunci sementara 15 menit (dapat dibuka Super Admin dengan Reset Password). |
| Mengakses URL di luar peran/unit | Halaman 403 (Akses ditolak); API mengembalikan 403. |
| Sesi kedaluwarsa saat mengisi formulir | API mengembalikan 401; isian formulir dipertahankan di browser dan pengguna diminta login ulang. |

### Fitur 1: Manajemen Unit

Prioritas: 🔴 Must Have

User Story:

"Sebagai Super Admin, saya ingin menambah, mengubah, dan menonaktifkan unit, agar dokumen dan penugasan selalu mengacu pada struktur unit yang benar."

Acceptance Criteria:

1. Happy Path:

- Given: Super Admin membuka menu Admin > Unit
- When: Super Admin mengisi Kode Unit dan Nama Unit lalu menekan Simpan
- Then: Sistem menyimpan unit, membuat folder Drive "[Kode] - [Nama]" di Shared Drive, dan menampilkannya pada daftar unit.
2. Ketentuan tambahan:

- Daftar unit menampilkan kolom: No, Kode, Nama Unit, Jumlah Dokumen, Jumlah Koordinator/SPV, Manajer, Status, Aksi (Edit, Nonaktifkan, Hapus).
- Data awal 34 unit di-seed sesuai Lampiran A.
- Perubahan kode atau nama tidak memindahkan berkas; keterkaitan memakai ID folder Drive.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Kode atau nama unit sudah ada | Sistem menolak: "Kode/Nama unit sudah terdaftar". |
| Unit yang masih memiliki dokumen akan dihapus | Sistem tidak menghapus; unit hanya dapat dinonaktifkan agar riwayat tetap utuh. |
| Unit tanpa dokumen dihapus | Unit dan penugasannya dihapus; folder Drive kosong ikut dihapus. |
| Pembuatan folder Drive gagal | Unit tidak disimpan; pesan "Gagal membuat folder Drive, coba lagi". |

### Fitur 2: Manajemen Pengguna

Prioritas: 🔴 Must Have

User Story:

"Sebagai Super Admin, saya ingin membuat akun pengguna dan mengatur statusnya, agar seluruh pegawai dapat login dan membaca dokumen JDIH."

Acceptance Criteria:

1. Happy Path:

- Given: Super Admin membuka menu Admin > Pengguna
- When: Super Admin mengisi Nama Lengkap, NIK, dan password awal, menandai Super Admin bila perlu, lalu menekan Simpan
- Then: Sistem menyimpan akun; pengguna dapat langsung login sebagai Staf.
2. Ketentuan tambahan:

- Setiap pengguna terdaftar otomatis berperan Staf (baca semua dokumen terbit). Peran Koordinator/SPV dan Manajer diberikan melalui Fitur 3 dan 4.
- Aksi pada daftar: Edit, Reset Password (sekaligus membuka kunci login), Aktifkan/Nonaktifkan.
- Daftar dapat dicari berdasarkan nama atau NIK, dengan pagination 10/25/50 baris.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| NIK sudah digunakan | Sistem menolak: "NIK sudah terdaftar". |
| Format NIK salah | Sistem menolak dengan pesan format NIK. |
| Super Admin menonaktifkan akunnya sendiri / Super Admin terakhir | Sistem menolak aksi tersebut. |
| Pengguna yang sudah membuat/memverifikasi dokumen akan dihapus | Sistem tidak menghapus; hanya dapat dinonaktifkan. |

### Fitur 3: Manajemen Koordinator/SPV

Prioritas: 🔴 Must Have

User Story:

"Sebagai Super Admin, saya ingin menugaskan Koordinator/SPV ke satu atau beberapa unit, agar mereka dapat menyusun dan mengajukan dokumen unit tersebut."

Acceptance Criteria:

1. Happy Path:

- Given: Super Admin membuka menu Admin > Koordinator/SPV
- When: Super Admin memilih pengguna dan satu atau lebih unit lalu menekan Simpan
- Then: Sistem menyimpan penugasan; menu Pengajuan Unit muncul bagi pengguna tersebut untuk unit yang ditugaskan.
2. Ketentuan tambahan:

- Satu unit boleh memiliki lebih dari satu Koordinator/SPV.
- Mencabut penugasan tidak menghapus draf; draf tetap dapat dilanjutkan oleh Koordinator/SPV lain di unit yang sama.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Pengguna nonaktif dipilih | Sistem menolak: "Pengguna tidak aktif". |
| Unit nonaktif dipilih | Unit nonaktif tidak tampil di pilihan. |

### Fitur 4: Manajemen Manajer

Prioritas: 🔴 Must Have

User Story:

"Sebagai Super Admin, saya ingin menetapkan unit-unit yang dibawahi setiap Manajer, agar pengajuan dari unit tersebut masuk ke antrean Manajer yang tepat."

Acceptance Criteria:

1. Happy Path:

- Given: Super Admin membuka menu Admin > Manajer
- When: Super Admin memilih pengguna dan satu atau lebih unit yang dibawahi lalu menekan Simpan
- Then: Sistem menyimpan penugasan; antrean Verifikasi Manajer memuat pengajuan dari seluruh unit tersebut.
2. Ketentuan tambahan:

- Satu Manajer dapat membawahi banyak unit; satu unit dapat memiliki lebih dari satu Manajer (siapa pun dapat memutuskan, keputusan pertama yang berlaku).
- Jika penugasan diubah, pengajuan yang sedang menunggu otomatis pindah ke antrean Manajer baru.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Unit tanpa Manajer aktif | Koordinator/SPV tidak dapat mengajukan; pesan "Manajer unit belum diseting, harap hubungi tim DTO." |
| Manajer juga Koordinator/SPV di unit yang sama | Sistem menolak penugasan agar pembuat tidak memverifikasi pengajuannya sendiri. |

### Fitur 5: Pengaturan Jenis Dokumen

Prioritas: 🟡 Should Have

User Story:

"Sebagai Super Admin, saya ingin mengatur contoh nomor dan versi template tiap jenis dokumen, agar Koordinator/SPV mendapat panduan saat mengisi nomor dan format dokumen tetap terkendali."

Acceptance Criteria:

1. Happy Path:

- Given: Super Admin membuka menu Admin > Jenis Dokumen
- When: Super Admin mengubah contoh nomor (mis. SPO: RSAN/SPO/5/DTO/007) lalu menekan Simpan
- Then: Contoh nomor tampil sebagai placeholder dan teks bantuan di formulir dokumen.
2. Ketentuan tambahan:

- Lima jenis tetap: SK, Kebijakan, Pedoman Kerja, Pedoman Pelayanan, SPO (tidak dapat ditambah/dihapus pada Fase 1).
- Versi template dicatat pada setiap draf; perubahan template tidak mengubah dokumen yang sudah dibuat.
### Fitur 6: Buat Dokumen dari Template

Prioritas: 🔴 Must Have

User Story:

"Sebagai Koordinator/SPV, saya ingin menyusun dokumen baru melalui editor sesuai jenisnya, agar format dokumen seragam dan PDF dihasilkan otomatis."

Acceptance Criteria:

1. Happy Path:

- Given: Koordinator/SPV membuka Pengajuan Unit > Buat Dokumen, memilih unit, jenis, dan metode Buat dari Template
- When: Koordinator/SPV mengisi metadata dan isian editor sesuai jenis (Lampiran B) lalu menekan Simpan Draf
- Then: Sistem menyimpan draf berstatus Draf, menghasilkan pratinjau PDF, dan menampilkannya di Pengajuan Unit.
2. Ketentuan tambahan:

- Metadata wajib saat pengajuan: judul, unit, jenis, nomor, label revisi, tanggal dokumen, tanggal mulai berlaku. Kata kunci dan lampiran opsional.
- Diktum (SK) dan langkah prosedur (SPO) dapat ditambah, dihapus, dan diurutkan.
- Isian panjang disimpan terpotong per sel (batas 50.000 karakter per sel Sheets).
- Tidak ada autosave; tombol Simpan Draf tersedia. Peringatan muncul bila meninggalkan halaman dengan perubahan belum disimpan.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Unit tidak termasuk penugasan pengguna | Unit tidak tampil di pilihan; API menolak (403). |
| Draf diubah dari dua tab/pengguna bersamaan | Penyimpanan kedua ditolak (409) dengan pesan "Draf telah diubah pengguna lain, muat ulang". |
| Pembuatan PDF gagal | Toast "Gagal membuat PDF, coba lagi"; isian tetap tersimpan. |

### Fitur 7: Upload Dokumen

Prioritas: 🔴 Must Have

User Story:

"Sebagai Koordinator/SPV, saya ingin mengunggah dokumen yang sudah ada beserta metadatanya, agar dokumen lama dan dokumen yang disusun di luar sistem dapat dipublikasikan di JDIH."

Acceptance Criteria:

1. Happy Path:

- Given: Koordinator/SPV memilih metode Upload Dokumen
- When: Koordinator/SPV mengisi metadata, mengunggah PDF (opsional DOCX sumber dan lampiran), lalu menekan Simpan Draf
- Then: Sistem menyimpan berkas di folder Drive versi tersebut dan menampilkan pratinjau PDF.
2. Ketentuan tambahan:

- PDF menjadi berkas yang diperiksa dan dipublikasikan; DOCX hanya disimpan sebagai sumber.
- Dokumen lama memakai nomor dan label revisi sesuai berkas aslinya.
- Berkas diunggah per potongan < 4 MB dengan indikator progres; unggahan dapat diulang tanpa menggandakan berkas.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Berkas utama bukan PDF | Sistem menolak: "Berkas utama harus PDF". |
| Ukuran melebihi batas (usulan 20 MB) | Sistem menolak dan menampilkan batas ukuran. |
| Koneksi terputus saat unggah | Unggahan dapat dilanjutkan/diulang; tidak ada berkas ganda tercatat. |

### Fitur 8: Pengajuan Unit: Ajukan, Tarik, Hapus Draf

Prioritas: 🔴 Must Have

User Story:

"Sebagai Koordinator/SPV, saya ingin mengelola draf dan pengajuan unit saya, agar dokumen dapat diperiksa Manajer dan diperbaiki bila dikembalikan."

Acceptance Criteria:

1. Happy Path:

- Given: Koordinator/SPV membuka draf yang lengkap
- When: Koordinator/SPV menekan Ajukan dan mengonfirmasi "Isi pengajuan terkunci selama verifikasi. Lanjutkan?"
- Then: Status menjadi Menunggu Verifikasi, isi terkunci, pengajuan masuk antrean Manajer unit, dan Manajer menerima notifikasi web.
2. Ketentuan tambahan:

- Halaman Pengajuan Unit menampilkan daftar draf & pengajuan per unit dengan filter status, pengurutan daftar, catatan pengembalian terakhir, serta aksi Lanjutkan Edit, Ajukan, Tarik, Hapus.
- Tarik Pengajuan (status Menunggu Verifikasi): versi kembali ke Draf dan hilang dari antrean Manajer.
- Hapus Draf (status Draf/Dikembalikan yang belum pernah terbit): soft delete, tidak tampil bagi siapa pun, tetap tercatat di log. Menghapus draf pertama dokumen baru ikut menghapus dokumen induknya.
- Pengajuan ulang setelah dikembalikan memakai versi yang sama (tidak membuat versi baru).
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Metadata wajib belum lengkap | Sistem menolak (422) dan menandai isian yang kosong. |
| Nomor sudah dipakai dokumen lain | Sistem menolak (409): "Nomor sudah dipakai oleh [judul dokumen]". |
| Nomor sudah dipakai dokumen yang sama | Sistem mengarahkan ke dokumen induk untuk Buat Revisi. |
| Berkas PDF belum ada / gagal diverifikasi di Drive | Sistem menolak: "Berkas PDF belum tersedia". |
| Dua pengajuan dengan nomor sama dikirim bersamaan | Hanya satu diterima; yang lain mendapat 409. |
| Menarik pengajuan yang baru saja diputuskan Manajer | Sistem menolak (409) dan menampilkan status terbaru. |

### Fitur 9: Verifikasi Manajer

Prioritas: 🔴 Must Have

User Story:

"Sebagai Manajer, saya ingin memeriksa pengajuan dari unit yang saya bawahi lalu menyetujui atau mengembalikannya, agar hanya dokumen yang layak yang dipublikasikan."

Acceptance Criteria:

1. Happy Path:

- Given: Manajer membuka menu Verifikasi dan memilih pengajuan berstatus Menunggu Verifikasi
- When: Manajer memeriksa metadata, nomor, pratinjau PDF, lampiran, dan riwayat pengajuan, lalu menekan Setujui dan mengonfirmasi
- Then: Status menjadi Disetujui, dokumen terbit saat itu juga, dan Koordinator/SPV menerima notifikasi web.
2. Ketentuan tambahan:

- Antrean memiliki tab "Menunggu Verifikasi" dan "Riwayat" serta pengurutan daftar, dengan kolom: Judul, Nomor, Unit, Jenis, Revisi, Diajukan oleh, Tanggal Ajuan, Aksi.
- Kembalikan mewajibkan catatan; status menjadi Dikembalikan dan Koordinator/SPV menerima notifikasi.
- Setiap keputusan tercatat di Review_Log (pemeriksa, tindakan, catatan, waktu).
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Manajer membuka pengajuan unit yang tidak dibawahinya | 403 (Akses ditolak); API menolak perubahan. |
| Kembalikan tanpa catatan | Sistem menolak: "Catatan wajib diisi". |
| Dua Manajer memutuskan pengajuan yang sama bersamaan | Hanya keputusan pertama berlaku; yang kedua mendapat 409. |
| Pengajuan sudah ditarik Koordinator/SPV | Pengajuan tidak lagi tampil; akses langsung menampilkan status terbaru. |
| Klik Setujui berulang / koneksi putus | Tidak terjadi persetujuan ganda (idempotensi). |

### Fitur 10: Daftar & Pencarian Dokumen

Prioritas: 🔴 Must Have

User Story:

"Sebagai Staf, saya ingin mencari dokumen dari seluruh unit, agar saya dapat menemukan regulasi yang berlaku dengan cepat."

Acceptance Criteria:

1. Happy Path:

- Given: Pengguna membuka Daftar Dokumen
- When: Pengguna mengetik judul, nomor, atau kata kunci, memilih filter unit atau jenis, serta mengatur urutan daftar (berlaku terbaru/terlama, judul, nomor, atau unit)
- Then: Sistem menampilkan satu hasil per dokumen induk yang mengutamakan versi berlaku, dengan tautan ke detail.
2. Ketentuan tambahan:

- Kolom: Judul, Nomor, Unit, Jenis, Revisi, Tanggal Berlaku, Status Keberlakuan.
- Menu sidebar **Dokumen Unit Saya** menyediakan akses cepat ke dokumen terbit milik unit pengguna tanpa perlu memilih filter unit secara manual.
- Dokumen Tidak Aktif disembunyikan kecuali filter "Tampilkan tidak aktif" dipilih.
- Pagination 10/25/50 baris; filter tersimpan di URL.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Tidak ada hasil | Empty state "Dokumen tidak ditemukan" dengan saran mengubah kata kunci/filter. |
| Dokumen hanya memiliki versi "Berlaku mulai" (belum berlaku) | Tetap tampil dengan label "Berlaku mulai [tanggal]". |

### Fitur 11: Detail Dokumen, Pratinjau & Riwayat Versi

Prioritas: 🔴 Must Have

User Story:

"Sebagai Staf, saya ingin membuka detail, pratinjau, dan riwayat versi dokumen, agar saya dapat membaca versi berlaku maupun versi yang pernah terbit."

Acceptance Criteria:

1. Happy Path:

- Given: Pengguna membuka detail dokumen dari daftar
- When: Pengguna memilih versi pada riwayat lalu menekan Pratinjau atau Unduh
- Then: Sistem menampilkan PDF di browser atau mengunduhnya setelah memeriksa hak akses.
2. Ketentuan tambahan:

- Detail menampilkan judul, unit, jenis, nomor, label revisi, tanggal dokumen & berlaku, kata kunci, status keberlakuan, status Aktif/Tidak Aktif, lampiran, dan riwayat versi beserta ringkasan perubahan.
- Tombol Buat Revisi dan Nonaktifkan/Aktifkan tampil sesuai akses.
- Nama berkas unduhan: "[Nomor]_[Judul]_Rev[Label].pdf" (karakter tidak valid diganti tanda hubung).
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Staf membuka draf/pengajuan melalui tautan langsung | API menolak akses ke metadata dan berkas (403). |
| Berkas tidak ditemukan di Drive | Pesan "Berkas tidak tersedia, hubungi tim DTO"; kejadian dicatat. |

### Fitur 12: Buat Revisi

Prioritas: 🔴 Must Have

User Story:

"Sebagai Koordinator/SPV, saya ingin membuat revisi dari dokumen yang sudah terbit, agar perubahan regulasi tetap tertaut ke dokumen yang sama dan versi lama tetap terarsip."

Acceptance Criteria:

1. Happy Path:

- Given: Koordinator/SPV membuka detail dokumen terbit unit yang ditugaskan
- When: Koordinator/SPV menekan Buat Revisi
- Then: Sistem membuat draf versi baru yang menyalin metadata (dan isian editor bila dokumen dari template); versi berlaku tetap tersedia sampai revisi disetujui dan tanggal berlakunya tiba.
2. Ketentuan tambahan:

- Ringkasan perubahan wajib diisi saat mengajukan revisi.
- Nomor boleh tetap atau berubah sesuai aturan RS; revisi tetap tertaut melalui ID dokumen induk.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Sudah ada revisi terbuka (Draf/Menunggu/Dikembalikan) | Sistem menolak dan mengarahkan ke revisi yang terbuka. |
| Dokumen berstatus Tidak Aktif | Tombol tidak tampil; aktifkan kembali terlebih dahulu. |

### Fitur 13: Status Dokumen Aktif / Tidak Aktif

Prioritas: 🔴 Must Have

User Story:

"Sebagai Koordinator/SPV, saya ingin menonaktifkan dokumen yang dicabut atau tidak dipakai lagi, agar staf tidak menggunakan regulasi yang sudah tidak berlaku."

Acceptance Criteria:

1. Happy Path:

- Given: Koordinator/SPV membuka detail dokumen unit yang ditugaskan
- When: Koordinator/SPV menekan Nonaktifkan, mengisi alasan dan tanggal tidak aktif, lalu mengonfirmasi
- Then: Status dokumen menjadi Tidak Aktif, dokumen hilang dari pencarian bawaan, dan perubahan tercatat di log.
2. Ketentuan tambahan:

- Dokumen Tidak Aktif tetap dapat dibuka beserta riwayatnya dengan label Tidak Aktif.
- Dokumen dapat diaktifkan kembali dengan alasan; tidak memerlukan verifikasi Manajer.
Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Alasan kosong | Sistem menolak: "Alasan wajib diisi". |
| Dokumen memiliki revisi terbuka | Sistem menolak: "Selesaikan atau hapus revisi terbuka terlebih dahulu". |

### Fitur 14: Notifikasi Web

Prioritas: 🟡 Should Have

User Story:

"Sebagai Manajer atau Koordinator/SPV, saya ingin menerima notifikasi di aplikasi, agar saya tahu ada pengajuan yang perlu diperiksa atau keputusan atas pengajuan saya."

Acceptance Criteria:

1. Happy Path:

- Given: Terjadi pengajuan, pengajuan ulang, persetujuan, atau pengembalian
- When: Sistem membuat notifikasi untuk penerima terkait
- Then: Ikon lonceng menampilkan jumlah belum dibaca; klik notifikasi membuka halaman terkait dan menandainya sudah dibaca.
2. Pemicu:

- Pengajuan baru / ulang → seluruh Manajer unit tersebut.
- Disetujui / Dikembalikan → Koordinator/SPV yang mengajukan.
- Pengajuan ditarik → notifikasi Manajer untuk pengajuan itu ditandai tidak relevan.
### Fitur 15: Role & Hak Akses

Prioritas: 🔴 Must Have

User Story:

"Sebagai Super Admin, saya ingin hak akses ditentukan oleh peran dan unit, agar setiap pengguna hanya dapat mengakses data sesuai wewenangnya."

Role minimum:


| Role | Hak Akses |
| --- | --- |
| Super Admin | Akses penuh ke seluruh menu dan data: manajemen unit, pengguna, Koordinator/SPV, Manajer, jenis dokumen; seluruh fitur Koordinator/SPV dan Manajer di semua unit. |
| Staf | Mencari, membuka, dan mengunduh dokumen terbit beserta riwayat versi dari seluruh unit. Semua pengguna terdaftar memiliki peran ini. |
| Koordinator/SPV | Seluruh hak Staf + membuat, mengunggah, mengedit, mengajukan, menarik, dan menghapus draf; membuat revisi; mengubah Aktif/Tidak Aktif — terbatas pada unit yang ditugaskan. |
| Manajer | Seluruh hak Staf + melihat antrean dan pengajuan, menyetujui atau mengembalikan dengan catatan — terbatas pada unit yang dibawahi. Tidak membuat dokumen. |

Matriks akses ringkas (✔ = boleh, U = hanya unit penugasan, R = hanya lihat, – = tidak):


| Menu / Aksi | Super Admin | Staf | Koord./SPV | Manajer |
| --- | --- | --- | --- | --- |
| Manajemen Unit, Pengguna, Penugasan, Jenis Dokumen | ✔ | – | – | – |
| Cari, pratinjau, unduh dokumen terbit & riwayat | ✔ | ✔ | ✔ | ✔ |
| Buat / upload / edit / ajukan / tarik / hapus draf | ✔ | – | U | – |
| Buat Revisi | ✔ | – | U | – |
| Ubah Aktif / Tidak Aktif | ✔ | – | U | – |
| Lihat draf & catatan internal | ✔ | – | U | U (yang diajukan) |
| Setujui / Kembalikan pengajuan | ✔ | – | – | U |
| Notifikasi web | ✔ | – | ✔ | ✔ |

Edge Cases / Skenario Negatif:


| Kondisi | Expected Behavior |
| --- | --- |
| Pengguna memanggil API di luar hak peran/unitnya | Server menolak dengan HTTP 403; percobaan dicatat. |
| Penugasan dicabut saat pengguna sedang login | Permintaan berikutnya ditolak sesuai hak terbaru (hak dibaca ulang setiap permintaan). |

## 4. Spesifikasi Teknis (Arsitektur, Database & Rencana Halaman)

### 4.1 Arsitektur & Teknologi


| Komponen | Teknologi / Keputusan |
| --- | --- |
| Framework | Next.js (App Router), full-stack: UI + Route Handlers sebagai backend; proteksi login di middleware/proxy |
| Bahasa | TypeScript |
| Database | Google Sheets — satu spreadsheet "JDIH-DB RS AN-NISA" berisi 12 tab (lihat 4.4), diakses melalui Google Sheets API v4 |
| Penyimpanan berkas | Shared Drive "JDIH RS AN-NISA" melalui Drive API v3; struktur folder [Kode Unit - Nama Unit] / [Jenis] / [ID Dokumen] / [ID Versi]; keterkaitan memakai ID folder & file |
| Kredensial Google | Google Service Account; kredensial dari environment variable GOOGLE_SERVICE_ACCOUNT_JSON; hanya tersedia di server |
| Kunci, cache, rate limit | Upstash Redis: kunci penulis berurutan, cache data tab Sheets, penghitung gagal login, sesi unggah |
| Autentikasi | Sesi terenkripsi di cookie httpOnly (iron-session/jose), sliding 30 menit; password bcrypt; penguncian 15 menit setelah 5 kali gagal |
| Validasi | Zod di server (respons 422) dan di client untuk UX |
| UI | Tailwind CSS + shadcn/ui (tema biru, selaras aplikasi OPPE) |
| Generate PDF | @react-pdf/renderer (tanpa Chromium) untuk dokumen dari template |
| Unggah / unduh | Unggah resumable ke Drive per potongan < 4 MB melalui API; pratinjau & unduhan di-stream melalui API setelah cek akses |
| Deployment | Vercel (production & preview); domain internal RS dengan HTTPS |

### 4.2 Alur Status Versi Dokumen


| Status | Pemilik Aksi | Aksi yang Dilakukan | Status Berikutnya |
| --- | --- | --- | --- |
| DRAF | Koordinator/SPV | Edit, Ajukan | MENUNGGU_VERIFIKASI |
| DRAF | Koordinator/SPV | Hapus | DIHAPUS |
| MENUNGGU_VERIFIKASI | Manajer | Setujui | DISETUJUI |
| MENUNGGU_VERIFIKASI | Manajer | Kembalikan (catatan wajib) | DIKEMBALIKAN |
| MENUNGGU_VERIFIKASI | Koordinator/SPV | Tarik Pengajuan | DRAF |
| DIKEMBALIKAN | Koordinator/SPV | Edit, Ajukan ulang (versi sama) | MENUNGGU_VERIFIKASI |
| DIKEMBALIKAN | Koordinator/SPV | Hapus | DIHAPUS |
| DISETUJUI | – | Read-only; keberlakuan dihitung dari tanggal (4.3) | – |

Transisi status kritis dijalankan di dalam kunci Redis, membaca ulang data terbaru dari Sheets sebelum validasi, memakai ID operasi (idempotensi), dan dicatat pada tab Review_Log. Status dokumen induk (AKTIF / TIDAK_AKTIF) terpisah dari status versi.

### 4.3 Aturan Penomoran & Keberlakuan

- Nomor diisi manual sebagai teks bebas; contoh per jenis tampil sebagai panduan. Format tidak divalidasi.
- Normalisasi untuk cek unik: spasi di awal/akhir dipangkas, spasi ganda dirapatkan, huruf dijadikan kapital.
- Keunikan: nomor ternormalisasi unik di seluruh RS di antara versi yang tidak dihapus. Dicek saat simpan draf (peringatan) dan saat pengajuan (penolakan 409). Nomor yang sama pada dokumen induk yang sama diperbolehkan (revisi).
- Satu revisi terbuka per dokumen induk.
- Keberlakuan (zona waktu Asia/Jakarta) di antara versi DISETUJUI pada satu dokumen induk: Berlaku = tanggal mulai berlaku terbaru yang ≤ hari ini; Berlaku mulai [tanggal] = tanggal mulai berlaku di masa depan; Versi Sebelumnya = versi lain yang sudah tergantikan.
- Jika dua versi memiliki tanggal mulai berlaku sama, versi yang disetujui paling akhir yang berlaku.
### 4.4 Desain Database (Tab Google Sheets)

Relasi utama:

- units 1 — n user_units n — 1 users (peran KOORDINATOR / MANAJER per unit).
- units 1 — n documents; categories 1 — n documents.
- documents 1 — n document_versions 1 — n version_sections / attachments / review_log.
- documents 1 — n document_log; users 1 — n notifications.
Tab Users — akun login


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| nik | Teks | Unik; format 0000.00.00 |
| nama | Teks | Nama lengkap & gelar |
| password_hash | Teks | bcrypt |
| must_change_password | TRUE/FALSE | Wajib ganti saat login berikutnya |
| is_super_admin | TRUE/FALSE |  |
| is_active | TRUE/FALSE | Default TRUE |
| failed_login, locked_until | Angka, Waktu | Penguncian login (juga dicerminkan di Redis) |
| last_login_at, created_at, updated_at | Waktu ISO |  |

Tab Units — unit kerja


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| kode | Teks | Unik, mis. DTO |
| nama | Teks | Unik |
| drive_folder_id | Teks | ID folder unit di Shared Drive |
| is_active | TRUE/FALSE |  |
| created_at, updated_at | Waktu ISO |  |

Tab User_Units — penugasan peran per unit


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| user_id | Teks | FK → Users |
| unit_id | Teks | FK → Units |
| peran | Enum | KOORDINATOR / MANAJER |
| is_active | TRUE/FALSE | Penugasan dicabut = FALSE |
| created_at, created_by | Waktu, Teks |  |

Tab Categories — jenis dokumen


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks | PK |
| kode | Enum | SK / KEBIJAKAN / PEDOMAN_KERJA / PEDOMAN_PELAYANAN / SPO |
| label | Teks | Nama tampilan & nama folder |
| template_version | Angka | Versi template editor & PDF |
| contoh_nomor | Teks | Mis. RSAN/SPO/5/DTO/007 |
| urutan | Angka |  |

Tab Documents — dokumen induk


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK, permanen |
| unit_id, category_id | Teks | FK |
| status_aktif | Enum | AKTIF / TIDAK_AKTIF |
| alasan_tidak_aktif, tgl_tidak_aktif | Teks, Tanggal |  |
| drive_folder_id | Teks | Folder dokumen |
| created_by, created_at | Teks, Waktu |  |
| deleted_at | Waktu | Soft delete (draf pertama dihapus) |

Tab Document_Versions — versi dokumen


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| document_id | Teks | FK → Documents |
| revisi_label | Teks | Mis. 00, 01 |
| judul | Teks |  |
| nomor, nomor_normal | Teks | Asli & ternormalisasi (cek unik) |
| tgl_dokumen, tgl_berlaku | Tanggal | YYYY-MM-DD |
| kata_kunci | Teks | Dipisah koma |
| ringkasan_perubahan | Teks | Wajib untuk revisi |
| metode | Enum | TEMPLATE / UPLOAD |
| status | Enum | DRAF / MENUNGGU_VERIFIKASI / DIKEMBALIKAN / DISETUJUI / DIHAPUS |
| template_version | Angka | Snapshot versi template |
| pdf_file_id, source_file_id | Teks | ID berkas Drive |
| drive_folder_id | Teks | Folder versi |
| edit_version | Angka | Naik setiap simpan (cegah penimpaan) |
| created_by, submitted_at, approved_by, approved_at | Teks, Waktu |  |
| created_at, updated_at | Waktu ISO |  |

Tab Version_Sections — isian editor


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| version_id | Teks | FK |
| section_code | Teks | Mis. MENIMBANG, DIKTUM, LANGKAH |
| item_index | Angka | Urutan butir (diktum/langkah) |
| chunk_index | Angka | Potongan isi panjang |
| content | Teks | ≤ 45.000 karakter per sel |

Tab Attachments — lampiran


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| version_id | Teks | FK |
| file_id | Teks | ID berkas Drive |
| nama, mime_type, ukuran | Teks, Teks, Angka |  |
| status | Enum | UPLOADING / READY / FAILED |
| created_at | Waktu |  |

Tab Review_Log — jejak pengajuan & keputusan


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| version_id | Teks | FK |
| user_id | Teks | Pelaku |
| aksi | Enum | AJUKAN / TARIK / SETUJUI / KEMBALIKAN |
| catatan | Teks | Wajib untuk KEMBALIKAN |
| created_at | Waktu |  |

Tab Document_Log — jejak perubahan dokumen


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| document_id | Teks | FK |
| user_id | Teks |  |
| aksi | Enum | NONAKTIFKAN / AKTIFKAN / HAPUS_DRAF |
| alasan | Teks |  |
| created_at | Waktu |  |

Tab Notifications — notifikasi web


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks (UUID) | PK |
| user_id | Teks | Penerima |
| jenis | Enum | PENGAJUAN / DISETUJUI / DIKEMBALIKAN |
| target_id, url, pesan | Teks |  |
| is_read, is_relevant | TRUE/FALSE |  |
| created_at | Waktu |  |

Tab Operations — idempotensi & pemulihan


| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | Teks | Idempotency-Key dari klien |
| user_id, aksi, target_id | Teks |  |
| status | Enum | PROSES / SELESAI / GAGAL |
| langkah_terakhir | Teks | Untuk melanjutkan saat diulang |
| hasil | JSON | Respons yang dikembalikan saat diulang |
| created_at, updated_at | Waktu |  |

### 4.5 Rencana Halaman (Sitemap)


| No | Halaman | Route | Role | Keterangan |
| --- | --- | --- | --- | --- |
| 1 | Login | /login | Semua | Form NIK & password |
| 2 | Ganti Password | /ganti-password | Semua | Wajib bila must_change_password |
| 3 | Profil | /profil | Semua | Data diri & ganti password |
| 4 | Daftar Dokumen | /dokumen | Semua | Pencarian, filter, satu hasil per dokumen induk |
| 4a | Dokumen Unit Saya | /dokumen-unit | Semua | Akses cepat dokumen terbit milik unit pengguna |
| 5 | Detail Dokumen | /dokumen/[id] | Semua | Metadata, pratinjau, unduh, riwayat versi, Buat Revisi, Aktif/Tidak Aktif |
| 6 | Pengajuan Unit | /pengajuan | Koord./SPV | Daftar draf & pengajuan, filter status |
| 7 | Buat Dokumen | /pengajuan/baru | Koord./SPV | Pilih unit, jenis, metode |
| 8 | Edit Draf | /pengajuan/[versionId] | Koord./SPV | Metadata + editor/unggah, pratinjau, Simpan, Ajukan, Tarik, Hapus |
| 9 | Antrean Verifikasi | /verifikasi | Manajer | Tab Menunggu & Riwayat |
| 10 | Detail Verifikasi | /verifikasi/[versionId] | Manajer | PDF, lampiran, riwayat, Setujui, Kembalikan |
| 11 | Notifikasi | /notifikasi | Koord./SPV, Manajer | Daftar & tandai dibaca |
| 12 | Admin Unit | /admin/unit | Super Admin | CRUD unit |
| 13 | Admin Pengguna | /admin/pengguna | Super Admin | CRUD pengguna, reset password |
| 14 | Admin Koordinator/SPV | /admin/koordinator | Super Admin | Penugasan unit |
| 15 | Admin Manajer | /admin/manajer | Super Admin | Unit yang dibawahi |
| 16 | Admin Jenis Dokumen | /admin/jenis-dokumen | Super Admin | Contoh nomor, versi template |
| 17 | Akses Ditolak | /403 | Semua | Tombol kembali ke Daftar Dokumen |

### 4.6 Kontrak API


| Endpoint | Fungsi |
| --- | --- |
| POST /api/auth/login · /logout | Masuk dengan NIK & password; keluar |
| POST /api/auth/password | Ganti password sendiri |
| GET /api/documents | Daftar publikasi: pencarian, filter, paginasi |
| GET /api/documents/{id} | Detail dan versi yang dapat diakses |
| POST /api/documents | Buat dokumen induk + draf pertama |
| POST /api/documents/{id}/revisions | Buat draf revisi |
| POST /api/documents/{id}/status | Ubah Aktif/Tidak Aktif dengan alasan |
| PATCH /api/versions/{id} | Ubah draf (cek edit_version) |
| DELETE /api/versions/{id} | Hapus draf (soft delete) |
| POST /api/versions/{id}/files · PUT …/files/{uploadId} | Mulai sesi unggah; kirim potongan |
| GET /api/versions/{id}/files/{fileId} | Pratinjau / unduh (streaming) |
| POST /api/versions/{id}/submit · /withdraw | Ajukan; tarik pengajuan |
| GET /api/reviews · POST /api/versions/{id}/review | Antrean Manajer; setujui/kembalikan |
| GET /api/notifications · POST /api/notifications/read | Notifikasi |
| /api/admin/units · users · assignments · categories | Pengelolaan (Super Admin) |

Kode respons: 401 sesi tidak sah, 403 akses ditolak, 409 konflik nomor/status/edit, 422 isian tidak valid. Aksi tulis menerima header Idempotency-Key.

### 4.7 Kebutuhan Non-Fungsional


| Aspek | Kebutuhan |
| --- | --- |
| Keamanan | RBAC per peran & unit divalidasi di server pada setiap halaman, API, dan unduhan; password bcrypt; cookie httpOnly + Secure; penguncian login 15 menit setelah 5 kali gagal; redirect hanya ke halaman internal; kredensial Google hanya di server; spreadsheet hanya dibagikan ke Service Account & admin IT. |
| Integritas Data | Isi pengajuan terkunci selama verifikasi; transisi status dalam kunci Redis + idempotensi; berkas diverifikasi ada sebelum status DISETUJUI; versi terbit tidak dapat diubah; snapshot versi template per draf. |
| Kinerja | Daftar dokumen tampil < 2 detik (data dari cache Redis); generate PDF ≤ 10 detik; unduhan di-stream. |
| Kuota | Pembacaan Sheets melalui cache per tab untuk menjaga kuota (± 300 baca/menit per proyek). |
| Kompatibilitas | Chrome & Edge versi terbaru; desktop (utama) dan tablet ≥ 768px. |
| Format | Bahasa Indonesia; tanggal DD MMMM YYYY; waktu WIB (Asia/Jakarta); NIK 0000.00.00. |
| Backup | Riwayat versi bawaan Google Sheets & Drive; salinan spreadsheet harian otomatis ke folder backup di Shared Drive, retensi minimal 30 hari. |
| Audit | Seluruh pengajuan, keputusan, penghapusan draf, dan perubahan status tercatat (Review_Log, Document_Log). |

## 5. Desain & Aset (UI/UX)

- Prinsip: tampilan web memakai tema biru yang bersih dan user friendly, selaras dengan aplikasi OPPE. Format PDF dokumen mengikuti template resmi RS (5.2).
### 5.1 Desain Antarmuka Web

Palet warna:


| Token | Warna | Penggunaan |
| --- | --- | --- |
| Primary | Biru #2563EB | Tombol utama (Simpan, Ajukan, Setujui), link aktif, fokus input |
| Primary Dark | Biru tua #1E3A8A | Sidebar, header halaman |
| Primary Light | Biru muda #EFF6FF / #DBEAFE | Latar kartu, baris terpilih |
| Netral | Putih #FFFFFF, abu-abu #F8FAFC / #64748B | Latar halaman, teks sekunder, kolom read-only |
| Success | Hijau #16A34A | Status Berlaku / Disetujui, toast berhasil |
| Warning | Oranye #F59E0B | Menunggu Verifikasi, Berlaku mulai, peringatan |
| Danger | Merah #DC2626 | Dikembalikan, Tidak Aktif, error, aksi hapus |

Pedoman user friendly:

- Layout: sidebar biru tua (menu sesuai peran + badge jumlah antrean), header berisi nama pengguna, ikon notifikasi, dan logout.
- Tipografi sans-serif (mis. Inter) 14–16px, kontras WCAG AA.
- Status ditampilkan sebagai badge berwarna; detail dokumen menampilkan riwayat versi sebagai timeline.
- Formulir Buat Dokumen bertahap: (1) pilih unit, jenis, metode; (2) metadata + editor/unggah + pratinjau.
- Isian nomor menampilkan contoh nomor jenis terpilih sebagai placeholder dan teks bantuan.
- Dialog konfirmasi sebelum Ajukan, Setujui, Kembalikan, Tarik, Hapus, dan Nonaktifkan.
- Toast error tampil 8 detik, sukses 4,5 detik; pesan dalam Bahasa Indonesia singkat.
### 5.2 Format PDF Dokumen dari Template

Tata letak final menunggu template resmi RS (Pertanyaan Terbuka no. 1). Usulan awal:


| Elemen | Spesifikasi |
| --- | --- |
| Kertas | A4 portrait, margin 2,5 cm |
| Kop/Header | Tabel berisi logo RS AN-NISA, judul dokumen, No. Dokumen, No. Revisi, Halaman (x/y), Tanggal Terbit |
| Isi | Bagian sesuai jenis (Lampiran B) dengan penomoran otomatis; diktum (SK) dan langkah (SPO) bernomor |
| Pengesahan | Tempat & tanggal penetapan, jabatan dan nama pejabat penetap; ruang tanda tangan basah/scan sesuai ketentuan RS |
| Footer | Nama unit pemilik dan label "Dokumen terkendali — JDIH RS AN-NISA" |

### 5.3 State UI yang harus di-handle


| State | Deskripsi |
| --- | --- |
| Empty State | Belum ada dokumen / antrean kosong → panduan (mis. tombol "Buat Dokumen") |
| Loading | Skeleton saat memuat; progress bar saat unggah; spinner saat generate PDF |
| Success | Toast: "Draf tersimpan" / "Pengajuan dikirim ke Manajer" / "Dokumen diterbitkan" |
| Error | Toast dengan alasan kegagalan; isian dipertahankan untuk dicoba lagi |
| Validation Error | Inline error: "Judul wajib diisi", "Nomor sudah dipakai", "Catatan wajib diisi" |
| Konfirmasi | Dialog sebelum aksi yang mengunci atau tidak dapat dibatalkan |
| Read-only | Form terkunci dengan label "Diajukan pada {tanggal} oleh {nama}" |
| Akses Ditolak | Halaman 403 dengan tombol kembali |

## 6. Pertanyaan Terbuka (Open Questions)


| No | Pertanyaan | Status | Keputusan |
| --- | --- | --- | --- |
| 1 | Template resmi dan tata letak PDF untuk SK, Kebijakan, Pedoman Kerja, Pedoman Pelayanan, dan SPO. | Open |  |
| 2 | Bukti pengesahan yang wajib tersedia sebelum Manajer menyetujui (mis. scan bertanda tangan Direktur). | Open |  |
| 3 | Batas ukuran unggahan (usulan 20 MB per berkas). | Open |  |
| 4 | Password awal: ditetapkan Super Admin + wajib ganti, atau mengikuti OPPE (password template annisa123 tanpa wajib ganti)? | Open |  |
| 5 | Contoh nomor resmi untuk SK, Kebijakan, Pedoman Kerja, dan Pedoman Pelayanan. | Open |  |
| 6 | Daftar awal Koordinator/SPV dan Manajer per unit. | Open |  |

## Lampiran A: Daftar Unit Awal (Seed Data)

Kode berikut usulan untuk penamaan folder; dapat diubah Super Admin (Fitur 1).


| No | Kode | Nama Unit |
| --- | --- | --- |
| 1 | SDM | SDM |
| 2 | K3RS | K3RS |
| 3 | AKU | Akuntansi & Keuangan |
| 4 | IT | Information Technology |
| 5 | RMP | Riset & Manajemen Pengetahuan |
| 6 | PMS | Pemasaran |
| 7 | CC | Customer Care |
| 8 | PDF | Pendaftaran |
| 9 | MCU | MCU dan Pelayanan Khusus |
| 10 | DTO | DTO (Data Transformasi Officer) |
| 11 | RMIK | RMIK |
| 12 | CSSD | CSSD |
| 13 | LDR | Laundry |
| 14 | UPSPRS | UPSPRS |
| 15 | TEM | TEM |
| 16 | SAN | Sanitarian |
| 17 | FAR | Farmasi |
| 18 | GZ | Gizi |
| 19 | LAB | Laboratorium |
| 20 | RAD | Radiologi |
| 21 | IGD | IGD |
| 22 | RJ | Rawat Jalan |
| 23 | NCCTC | NCC & TC |
| 24 | RPU1 | RPU1 |
| 25 | RPU2HCU | RPU2 & HCU |
| 26 | DLS | Dialisis |
| 27 | RPB | RPB |
| 28 | PU4RPU4 | PU4 & RPU4 |
| 29 | PU3 | PU3 |
| 30 | RPAPICU | RPA & PICU |
| 31 | NEONICU | Neonatologi & NICU |
| 32 | ICU | ICU |
| 33 | OK | Ruang Operasi |
| 34 | VK | Ruang Bersalin |

## Lampiran B: Jenis Dokumen & Isian Editor


| Jenis | Isian Editor |
| --- | --- |
| SK | Perihal, Menimbang, Mengingat, Menetapkan, daftar diktum yang dapat diurutkan, tempat dan tanggal penetapan, nama serta jabatan pejabat penetap, lampiran keputusan bila ada. |
| Kebijakan | Latar belakang, tujuan, ruang lingkup, dasar kebijakan, ketentuan, penanggung jawab, pemantauan, dan evaluasi. |
| Pedoman Kerja | Pendahuluan, tujuan, ruang lingkup kerja, tugas dan tanggung jawab, tahapan kerja, sarana, pencatatan, pelaporan, dan evaluasi. |
| Pedoman Pelayanan | Tujuan, cakupan dan sasaran layanan, ketenagaan, sarana dan prasarana, alur pelayanan, keselamatan pasien sesuai layanan, indikator mutu, serta evaluasi. |
| SPO | Pengertian, tujuan, kebijakan atau referensi, langkah prosedur yang dapat diurutkan, unit terkait, serta formulir atau dokumen pendukung bila ada. Contoh nomor: RSAN/SPO/5/DTO/007. |

## Lampiran C: Skenario Penerimaan (UAT)


| ID | Skenario dan hasil yang diharapkan |
| --- | --- |
| UAT-01 | Staf Farmasi mencari SPO IGD berdasarkan judul atau nomor. Dokumen terbit muncul dan dapat dibuka. |
| UAT-02 | Staf membuka draf unit lain melalui tautan langsung. API menolak akses ke metadata dan berkas. |
| UAT-03 | Koordinator/SPV memilih masing-masing jenis. Editor memuat isian jenis tersebut dan menghasilkan PDF. |
| UAT-04 | Koordinator/SPV mengunggah dokumen lama dengan nomor asli. Dokumen dapat dilihat staf setelah disetujui. |
| UAT-05 | Dua Koordinator/SPV mengajukan nomor yang sama bersamaan. Hanya satu diterima; yang lain mendapat 409. |
| UAT-06 | Manajer mengembalikan pengajuan. Catatan wajib; Koordinator/SPV mengajukan ulang tanpa membuat versi baru. |
| UAT-07 | Manajer menyetujui revisi bertanggal berlaku bulan depan. Versi lama tetap Berlaku sampai tanggal itu; versi baru berlabel "Berlaku mulai". |
| UAT-08 | Unggahan atau pencatatan gagal di tengah proses. Dokumen tetap valid dan pengulangan tidak menggandakan versi atau persetujuan. |
| UAT-09 | Manajer memverifikasi dokumen dari unit yang tidak dibawahinya. API menolak perubahan. |
| UAT-10 | Koordinator/SPV menarik pengajuan. Pengajuan hilang dari antrean Manajer dan kembali menjadi Draf. |
| UAT-11 | Koordinator/SPV menghapus draf. Draf tidak tampil bagi siapa pun tetapi tercatat di log. |
| UAT-12 | Koordinator/SPV menonaktifkan dokumen. Dokumen hilang dari pencarian bawaan, tampil dengan filter "Tampilkan tidak aktif", dan dapat diaktifkan kembali. |
| UAT-13 | Login dengan NIK dan password. Akun nonaktif ditolak; 5 kali gagal mengunci akun 15 menit. |
| UAT-14 | Super Admin menugaskan satu Manajer ke tiga unit. Antrean Manajer memuat pengajuan dari ketiga unit tersebut saja. |
| UAT-15 | Pengajuan memunculkan notifikasi bagi Manajer unit; keputusan memunculkan notifikasi bagi Koordinator/SPV. |
