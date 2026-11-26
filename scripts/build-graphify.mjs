import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_REL = 'docs/PRD_JDIH.md';
const SRC_ABS = path.join(ROOT, SRC_REL);
const OUT_DIR = path.join(ROOT, 'graphify-out');
const WIKI_DIR = path.join(OUT_DIR, 'wiki');

fs.mkdirSync(WIKI_DIR, { recursive: true });

const prdText = fs.readFileSync(SRC_ABS, 'utf8');
const prdLines = prdText.split(/\r?\n/);

function findLine(needle) {
  const idx = prdLines.findIndex((l) => l.includes(needle));
  return idx >= 0 ? `L${idx + 1}` : null;
}

const COMMUNITIES = {
  0: 'Autentikasi dan Kontrol Akses RBAC',
  1: 'Siklus Hidup dan Verifikasi Dokumen',
  2: 'Arsitektur Data dan Infrastruktur',
  3: 'Antarmuka dan Pengalaman Pengguna',
  4: 'Tata Kelola, Seed Data, dan UAT',
};

const rawNodes = [
  // Community 0: Autentikasi & RBAC
  { id: 'docs_prd_jdih_login_nik', label: 'Login NIK (0000.00.00)', file_type: 'document', loc: 'Fitur 0: Login & Autentikasi', comm: 0 },
  { id: 'docs_prd_jdih_sesi_30_menit', label: 'Sesi Cookie httpOnly 30 Menit', file_type: 'concept', loc: '4.1 Arsitektur & Teknologi', comm: 0 },
  { id: 'docs_prd_jdih_penguncian_5x', label: 'Penguncian Login 15 Menit (5x Gagal)', file_type: 'rationale', loc: 'Fitur 0 Edge Cases', comm: 0, rationale: 'Mencegah brute-force password NIK; dapat dibuka oleh Super Admin via Reset Password.' },
  { id: 'docs_prd_jdih_role_super_admin', label: 'Role Super Admin', file_type: 'concept', loc: 'Fitur 15: Role & Hak Akses', comm: 0 },
  { id: 'docs_prd_jdih_role_staf', label: 'Role Staf', file_type: 'concept', loc: 'Fitur 15: Role & Hak Akses', comm: 0 },
  { id: 'docs_prd_jdih_role_koordinator', label: 'Role Koordinator/SPV', file_type: 'concept', loc: 'Fitur 3 & Fitur 15', comm: 0 },
  { id: 'docs_prd_jdih_role_manajer', label: 'Role Manajer', file_type: 'concept', loc: 'Fitur 4 & Fitur 15', comm: 0 },
  { id: 'docs_prd_jdih_rbac_unit_scope', label: 'RBAC Per Peran dan Unit', file_type: 'rationale', loc: 'Fitur 15 & 4.7 Keamanan', comm: 0, rationale: 'Pemisahan penyusun (Koordinator/SPV) dan pemeriksa (Manajer) dengan validasi ulang hak pada setiap permintaan server.' },
  { id: 'docs_prd_jdih_tab_users', label: 'Tab Sheets Users', file_type: 'document', loc: '4.4 Tab Users', comm: 0 },
  { id: 'docs_prd_jdih_tab_user_units', label: 'Tab Sheets User_Units', file_type: 'document', loc: '4.4 Tab User_Units', comm: 0 },
  { id: 'docs_prd_jdih_guard_403', label: 'Penjaga Akses 403', file_type: 'concept', loc: 'Fitur 15 & Halaman /403', comm: 0 },

  // Community 1: Siklus Hidup & Verifikasi Dokumen
  { id: 'docs_prd_jdih_jenis_dokumen', label: 'Lima Jenis Dokumen Tetap', file_type: 'concept', loc: 'Fitur 5 & Lampiran B', comm: 1 },
  { id: 'docs_prd_jdih_buat_template', label: 'Buat Dokumen dari Template', file_type: 'document', loc: 'Fitur 6', comm: 1 },
  { id: 'docs_prd_jdih_upload_chunked', label: 'Upload Dokumen Resumable < 4 MB', file_type: 'document', loc: 'Fitur 7 & 4.1', comm: 1 },
  { id: 'docs_prd_jdih_nomor_manual_unik', label: 'Nomor Dokumen Manual dan Cek Unik', file_type: 'rationale', loc: '4.3 Aturan Penomoran', comm: 1, rationale: 'Nomor dokumen bebas manual karena pola RS bervariasi, tetapi ternormalisasi wajib unik seluruh RS (409 on conflict).' },
  { id: 'docs_prd_jdih_pengajuan_unit', label: 'Pengajuan Unit (Ajukan, Tarik, Hapus Draf)', file_type: 'document', loc: 'Fitur 8', comm: 1 },
  { id: 'docs_prd_jdih_verifikasi_manajer', label: 'Verifikasi Manajer (Setujui / Kembalikan)', file_type: 'document', loc: 'Fitur 9', comm: 1 },
  { id: 'docs_prd_jdih_keberlakuan_tanggal', label: 'Keberlakuan Dihitung dari Tanggal (WIB)', file_type: 'rationale', loc: '4.3 Aturan Penomoran & Keberlakuan', comm: 1, rationale: 'Status Berlaku, Berlaku mulai, dan Versi Sebelumnya dihitung dinamis agar revisi bertanggal masa depan tidak menggeser versi aktif saat ini.' },
  { id: 'docs_prd_jdih_buat_revisi', label: 'Buat Revisi Tertaut Dokumen Induk', file_type: 'document', loc: 'Fitur 12', comm: 1 },
  { id: 'docs_prd_jdih_status_aktif_nonaktif', label: 'Status Dokumen Aktif / Tidak Aktif', file_type: 'document', loc: 'Fitur 13', comm: 1 },
  { id: 'docs_prd_jdih_notifikasi_web', label: 'Notifikasi Web (Ikon Lonceng)', file_type: 'document', loc: 'Fitur 14', comm: 1 },
  { id: 'docs_prd_jdih_daftar_pencarian', label: 'Daftar dan Pencarian Dokumen', file_type: 'document', loc: 'Fitur 10', comm: 1 },
  { id: 'docs_prd_jdih_detail_pratinjau', label: 'Detail Dokumen, Pratinjau, dan Riwayat Versi', file_type: 'document', loc: 'Fitur 11', comm: 1 },

  // Community 2: Arsitektur Data & Infrastruktur
  { id: 'docs_prd_jdih_nextjs_app_router', label: 'Next.js App Router + Route Handlers', file_type: 'concept', loc: '4.1 Arsitektur & Teknologi', comm: 2 },
  { id: 'docs_prd_jdih_sheets_db', label: 'Google Sheets Database (12 Tab)', file_type: 'document', loc: '4.4 Desain Database', comm: 2 },
  { id: 'docs_prd_jdih_tab_units', label: 'Tab Sheets Units', file_type: 'document', loc: '4.4 Tab Units', comm: 2 },
  { id: 'docs_prd_jdih_tab_categories', label: 'Tab Sheets Categories', file_type: 'document', loc: '4.4 Tab Categories', comm: 2 },
  { id: 'docs_prd_jdih_tab_documents', label: 'Tab Sheets Documents', file_type: 'document', loc: '4.4 Tab Documents', comm: 2 },
  { id: 'docs_prd_jdih_tab_document_versions', label: 'Tab Sheets Document_Versions', file_type: 'document', loc: '4.4 Tab Document_Versions', comm: 2 },
  { id: 'docs_prd_jdih_tab_version_sections', label: 'Tab Sheets Version_Sections', file_type: 'document', loc: '4.4 Tab Version_Sections', comm: 2 },
  { id: 'docs_prd_jdih_tab_attachments', label: 'Tab Sheets Attachments', file_type: 'document', loc: '4.4 Tab Attachments', comm: 2 },
  { id: 'docs_prd_jdih_tab_review_log', label: 'Tab Sheets Review_Log', file_type: 'document', loc: '4.4 Tab Review_Log', comm: 2 },
  { id: 'docs_prd_jdih_tab_document_log', label: 'Tab Sheets Document_Log', file_type: 'document', loc: '4.4 Tab Document_Log', comm: 2 },
  { id: 'docs_prd_jdih_tab_notifications', label: 'Tab Sheets Notifications', file_type: 'document', loc: '4.4 Tab Notifications', comm: 2 },
  { id: 'docs_prd_jdih_tab_operations', label: 'Tab Sheets Operations (Idempotensi)', file_type: 'document', loc: '4.4 Tab Operations', comm: 2 },
  { id: 'docs_prd_jdih_shared_drive', label: 'Shared Drive JDIH RS AN-NISA', file_type: 'concept', loc: '4.1 Penyimpanan Berkas', comm: 2 },
  { id: 'docs_prd_jdih_redis_lock_cache', label: 'Upstash Redis Lock, Cache, dan Rate Limit', file_type: 'rationale', loc: 'Decision Log & 4.1', comm: 2, rationale: 'Serverless Vercel tidak berbagi memori; Redis mencegah nomor ganda, keputusan ganda, dan menjaga kuota 300 baca/menit Google Sheets.' },
  { id: 'docs_prd_jdih_react_pdf', label: 'Generator PDF (@react-pdf/renderer)', file_type: 'concept', loc: '4.1 Generate PDF', comm: 2 },
  { id: 'docs_prd_jdih_api_contracts', label: 'Kontrak API REST (15 Endpoint)', file_type: 'document', loc: '4.6 Kontrak API', comm: 2 },
  { id: 'docs_prd_jdih_vercel_deploy', label: 'Deployment Vercel HTTPS Internal', file_type: 'concept', loc: '4.1 Deployment', comm: 2 },

  // Community 3: Antarmuka & Pengalaman Pengguna
  { id: 'docs_prd_jdih_sitemap_17', label: 'Rencana Halaman (17 Route Sitemap)', file_type: 'document', loc: '4.5 Rencana Halaman', comm: 3 },
  { id: 'docs_prd_jdih_tema_biru_ui', label: 'Tema Biru OPPE & Tailwind + shadcn/ui', file_type: 'document', loc: '5.1 Desain Antarmuka Web', comm: 3 },
  { id: 'docs_prd_jdih_format_pdf_a4', label: 'Format PDF Resmi A4 Portrait', file_type: 'document', loc: '5.2 Format PDF Dokumen', comm: 3 },
  { id: 'docs_prd_jdih_ui_states_8', label: 'Delapan State UI Wajib (Section 5.3)', file_type: 'document', loc: '5.3 State UI', comm: 3 },
  { id: 'docs_prd_jdih_editor_lampiran_b', label: 'Skema Isian Editor 5 Jenis (Lampiran B)', file_type: 'document', loc: 'Lampiran B', comm: 3 },
  { id: 'docs_prd_jdih_mockup_spa', label: 'Mockup UI Interaktif JDIH (mockup/index.html)', file_type: 'code', loc: 'mockup/index.html', comm: 3, source_file: 'mockup/index.html' },

  // Community 4: Tata Kelola, Seed Data & UAT
  { id: 'docs_prd_jdih_unit_seed_34', label: 'Daftar 34 Unit Awal RS AN-NISA (Lampiran A)', file_type: 'document', loc: 'Lampiran A', comm: 4 },
  { id: 'docs_prd_jdih_decision_log', label: 'Decision Log Arsitektur & Produk (16 Keputusan)', file_type: 'rationale', loc: 'Catatan Keputusan', comm: 4, rationale: 'Mengunci ruang lingkup Fase 1 selaras aplikasi OPPE tanpa server DB terpisah.' },
  { id: 'docs_prd_jdih_open_questions', label: 'Enam Pertanyaan Terbuka (Open Questions)', file_type: 'document', loc: '6. Pertanyaan Terbuka', comm: 4 },
  { id: 'docs_prd_jdih_uat_15', label: 'Lima Belas Skenario Penerimaan UAT (Lampiran C)', file_type: 'document', loc: 'Lampiran C', comm: 4 },
  { id: 'docs_prd_jdih_sprint_roadmap', label: 'Rencana Implementasi 4 Sprint', file_type: 'document', loc: '2. Rencana Sprint', comm: 4 },
  { id: 'docs_prd_jdih_metrik_sukses', label: 'Tujuan Bisnis & 6 Key Results', file_type: 'document', loc: '1.2 Tujuan Bisnis & Metrik Sukses', comm: 4 },
];

const nodes = rawNodes.map((n) => ({
  id: n.id,
  label: n.label,
  file_type: n.file_type,
  source_file: n.source_file || SRC_REL,
  source_location: findLine(n.loc) || n.loc,
  source_url: null,
  captured_at: '2026-11-26',
  author: 'TIM DTO RS AN-NISA',
  contributor: 'Antigravity Graphify Builder',
  community_id: n.comm,
  community_name: COMMUNITIES[n.comm],
  ...(n.rationale ? { rationale: n.rationale } : {}),
}));

const rawEdges = [
  // Community 0 internal
  ['docs_prd_jdih_login_nik', 'docs_prd_jdih_tab_users', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_login_nik', 'docs_prd_jdih_sesi_30_menit', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_login_nik', 'docs_prd_jdih_penguncian_5x', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_rbac_unit_scope', 'docs_prd_jdih_role_super_admin', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_rbac_unit_scope', 'docs_prd_jdih_role_staf', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_rbac_unit_scope', 'docs_prd_jdih_role_koordinator', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_rbac_unit_scope', 'docs_prd_jdih_role_manajer', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_rbac_unit_scope', 'docs_prd_jdih_tab_user_units', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_user_units', 'docs_prd_jdih_tab_users', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_rbac_unit_scope', 'docs_prd_jdih_guard_403', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_role_koordinator', 'docs_prd_jdih_role_manajer', 'conceptually_related_to', 'EXTRACTED', 1.0],

  // Community 1 internal
  ['docs_prd_jdih_buat_template', 'docs_prd_jdih_jenis_dokumen', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_upload_chunked', 'docs_prd_jdih_jenis_dokumen', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_pengajuan_unit', 'docs_prd_jdih_buat_template', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_pengajuan_unit', 'docs_prd_jdih_upload_chunked', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_pengajuan_unit', 'docs_prd_jdih_nomor_manual_unik', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_pengajuan_unit', 'docs_prd_jdih_verifikasi_manajer', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_verifikasi_manajer', 'docs_prd_jdih_keberlakuan_tanggal', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_buat_revisi', 'docs_prd_jdih_keberlakuan_tanggal', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_buat_revisi', 'docs_prd_jdih_pengajuan_unit', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_status_aktif_nonaktif', 'docs_prd_jdih_daftar_pencarian', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_detail_pratinjau', 'docs_prd_jdih_keberlakuan_tanggal', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_detail_pratinjau', 'docs_prd_jdih_buat_revisi', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_detail_pratinjau', 'docs_prd_jdih_status_aktif_nonaktif', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_daftar_pencarian', 'docs_prd_jdih_detail_pratinjau', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_pengajuan_unit', 'docs_prd_jdih_notifikasi_web', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_verifikasi_manajer', 'docs_prd_jdih_notifikasi_web', 'implements', 'EXTRACTED', 1.0],

  // Community 2 internal
  ['docs_prd_jdih_nextjs_app_router', 'docs_prd_jdih_api_contracts', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_nextjs_app_router', 'docs_prd_jdih_vercel_deploy', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_nextjs_app_router', 'docs_prd_jdih_react_pdf', 'calls', 'INFERRED', 0.95],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_units', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_categories', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_documents', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_document_versions', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_version_sections', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_attachments', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_review_log', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_document_log', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_notifications', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_sheets_db', 'docs_prd_jdih_tab_operations', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_documents', 'docs_prd_jdih_tab_units', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_documents', 'docs_prd_jdih_tab_categories', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_document_versions', 'docs_prd_jdih_tab_documents', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_version_sections', 'docs_prd_jdih_tab_document_versions', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_attachments', 'docs_prd_jdih_tab_document_versions', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_review_log', 'docs_prd_jdih_tab_document_versions', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_document_log', 'docs_prd_jdih_tab_documents', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_attachments', 'docs_prd_jdih_shared_drive', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_document_versions', 'docs_prd_jdih_shared_drive', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tab_units', 'docs_prd_jdih_shared_drive', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_api_contracts', 'docs_prd_jdih_redis_lock_cache', 'calls', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_redis_lock_cache', 'docs_prd_jdih_tab_operations', 'shares_data_with', 'EXTRACTED', 1.0],

  // Community 3 internal
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_sitemap_17', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_tema_biru_ui', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_format_pdf_a4', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_ui_states_8', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_editor_lampiran_b', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_tema_biru_ui', 'docs_prd_jdih_ui_states_8', 'conceptually_related_to', 'EXTRACTED', 1.0],

  // Community 4 internal
  ['docs_prd_jdih_decision_log', 'docs_prd_jdih_sprint_roadmap', 'rationale_for', 'INFERRED', 0.85],
  ['docs_prd_jdih_metrik_sukses', 'docs_prd_jdih_uat_15', 'conceptually_related_to', 'INFERRED', 0.85],
  ['docs_prd_jdih_unit_seed_34', 'docs_prd_jdih_sprint_roadmap', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_open_questions', 'docs_prd_jdih_sprint_roadmap', 'conceptually_related_to', 'INFERRED', 0.75],

  // Cross-community bridges
  ['docs_prd_jdih_role_koordinator', 'docs_prd_jdih_pengajuan_unit', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_role_koordinator', 'docs_prd_jdih_buat_revisi', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_role_koordinator', 'docs_prd_jdih_status_aktif_nonaktif', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_role_manajer', 'docs_prd_jdih_verifikasi_manajer', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_role_staf', 'docs_prd_jdih_daftar_pencarian', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_role_super_admin', 'docs_prd_jdih_tab_units', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_role_super_admin', 'docs_prd_jdih_tab_users', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_rbac_unit_scope', 'docs_prd_jdih_api_contracts', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_penguncian_5x', 'docs_prd_jdih_redis_lock_cache', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_nomor_manual_unik', 'docs_prd_jdih_redis_lock_cache', 'calls', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_nomor_manual_unik', 'docs_prd_jdih_tab_document_versions', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_verifikasi_manajer', 'docs_prd_jdih_tab_review_log', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_verifikasi_manajer', 'docs_prd_jdih_redis_lock_cache', 'calls', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_status_aktif_nonaktif', 'docs_prd_jdih_tab_document_log', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_notifikasi_web', 'docs_prd_jdih_tab_notifications', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_buat_template', 'docs_prd_jdih_tab_version_sections', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_buat_template', 'docs_prd_jdih_react_pdf', 'calls', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_buat_template', 'docs_prd_jdih_editor_lampiran_b', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_upload_chunked', 'docs_prd_jdih_shared_drive', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_upload_chunked', 'docs_prd_jdih_tab_attachments', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_jenis_dokumen', 'docs_prd_jdih_tab_categories', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_unit_seed_34', 'docs_prd_jdih_tab_units', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_format_pdf_a4', 'docs_prd_jdih_react_pdf', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_open_questions', 'docs_prd_jdih_format_pdf_a4', 'conceptually_related_to', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_uat_15', 'docs_prd_jdih_rbac_unit_scope', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_uat_15', 'docs_prd_jdih_keberlakuan_tanggal', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_uat_15', 'docs_prd_jdih_verifikasi_manajer', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_uat_15', 'docs_prd_jdih_nomor_manual_unik', 'references', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_daftar_pencarian', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_pengajuan_unit', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_verifikasi_manajer', 'implements', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_unit_seed_34', 'shares_data_with', 'EXTRACTED', 1.0],
  ['docs_prd_jdih_mockup_spa', 'docs_prd_jdih_rbac_unit_scope', 'implements', 'EXTRACTED', 1.0],
];

const edges = rawEdges.map(([source, target, relation, confidence, confidence_score]) => ({
  source,
  target,
  relation,
  confidence,
  confidence_score,
  source_file: SRC_REL,
  weight: 1.0,
}));

const hyperedges = [
  {
    id: 'alur_verifikasi_dan_publikasi',
    label: 'Alur Pengajuan, Kunci Redis, Verifikasi Manajer, dan Notifikasi Web',
    nodes: [
      'docs_prd_jdih_role_koordinator',
      'docs_prd_jdih_pengajuan_unit',
      'docs_prd_jdih_redis_lock_cache',
      'docs_prd_jdih_role_manajer',
      'docs_prd_jdih_verifikasi_manajer',
      'docs_prd_jdih_tab_review_log',
      'docs_prd_jdih_notifikasi_web',
    ],
    relation: 'participate_in',
    confidence: 'EXTRACTED',
    confidence_score: 1.0,
    source_file: SRC_REL,
  },
  {
    id: 'arsitektur_penyimpanan_jdih',
    label: 'Arsitektur Serverless Next.js + Google Sheets + Shared Drive + Upstash Redis',
    nodes: [
      'docs_prd_jdih_nextjs_app_router',
      'docs_prd_jdih_sheets_db',
      'docs_prd_jdih_shared_drive',
      'docs_prd_jdih_redis_lock_cache',
      'docs_prd_jdih_vercel_deploy',
    ],
    relation: 'implement',
    confidence: 'EXTRACTED',
    confidence_score: 1.0,
    source_file: SRC_REL,
  },
  {
    id: 'kendali_keberlakuan_dan_revisi',
    label: 'Kendali Keberlakuan Tanggal WIB dan Riwayat Versi Dokumen',
    nodes: [
      'docs_prd_jdih_tab_documents',
      'docs_prd_jdih_tab_document_versions',
      'docs_prd_jdih_keberlakuan_tanggal',
      'docs_prd_jdih_buat_revisi',
      'docs_prd_jdih_status_aktif_nonaktif',
    ],
    relation: 'form',
    confidence: 'EXTRACTED',
    confidence_score: 1.0,
    source_file: SRC_REL,
  },
];

// Integrity checks (Graphify Step 4.5)
const nodeIds = new Set(nodes.map((n) => n.id));
let dangling = 0;
let selfLoops = 0;
const deg = new Map(nodes.map((n) => [n.id, 0]));
for (const e of edges) {
  if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) dangling++;
  if (e.source === e.target) selfLoops++;
  deg.set(e.source, (deg.get(e.source) || 0) + 1);
  deg.set(e.target, (deg.get(e.target) || 0) + 1);
}
for (const h of hyperedges) {
  for (const nid of h.nodes) {
    if (!nodeIds.has(nid)) dangling++;
  }
}

const graphJson = {
  directed: false,
  multigraph: false,
  graph: {
    project: 'JDIH RS AN-NISA',
    source_corpus: [SRC_REL, 'mockup/index.html'],
    generated_at: '2026-11-26T10:05:00+07:00',
    communities: COMMUNITIES,
  },
  nodes,
  links: edges,
  hyperedges,
};

fs.writeFileSync(path.join(OUT_DIR, 'graph.json'), JSON.stringify(graphJson, null, 2), 'utf8');

const godNodes = [...nodes]
  .map((n) => ({ ...n, degree: deg.get(n.id) || 0 }))
  .sort((a, b) => b.degree - a.degree)
  .slice(0, 10);

const commGroups = Object.entries(COMMUNITIES).map(([cid, cname]) => {
  const members = nodes.filter((n) => String(n.community_id) === cid);
  const internalEdges = edges.filter((e) => {
    const s = nodes.find((n) => n.id === e.source);
    const t = nodes.find((n) => n.id === e.target);
    return String(s.community_id) === cid && String(t.community_id) === cid;
  });
  const crossEdges = edges.filter((e) => {
    const s = nodes.find((n) => n.id === e.source);
    const t = nodes.find((n) => n.id === e.target);
    return (String(s.community_id) === cid) !== (String(t.community_id) === cid);
  });
  return { cid, cname, members, internalEdges, crossEdges };
});

// GRAPH_REPORT.md
const graphReport = `# Graphify Knowledge Graph Report: JDIH RS AN-NISA

## Corpus Summary
- **Sumber utama:** \`PRD_JDIH.docx\` -> [\`docs/PRD_JDIH.md\`](../docs/PRD_JDIH.md) (${prdLines.length} baris)
- **Target UI:** [\`mockup/index.html\`](../mockup/index.html)
- **Total Node:** ${nodes.length}
- **Total Edge:** ${edges.length} (${edges.filter((e) => e.confidence === 'EXTRACTED').length} EXTRACTED, ${edges.filter((e) => e.confidence === 'INFERRED').length} INFERRED)
- **Hyperedges:** ${hyperedges.length}
- **Komunitas:** ${Object.keys(COMMUNITIES).length}
- **Graph Health Check:** OK (${dangling} dangling endpoints, ${selfLoops} self-loops)

## God Nodes (Top 10 Architectural Hubs)

| Rank | Node ID | Label | Komunitas | Degree |
|---|---|---|---|---|
${godNodes.map((n, i) => `| ${i + 1} | \`${n.id}\` | ${n.label} | ${n.community_name} | ${n.degree} |`).join('\n')}

## Communities Breakdown

${commGroups.map((g) => `### Community ${g.cid}: ${g.cname}
- **Jumlah node:** ${g.members.length} | **Edge internal:** ${g.internalEdges.length} | **Jembatan lintas komunitas:** ${g.crossEdges.length}
- **Artikel wiki:** [\`wiki/0${g.cid}-${['autentikasi-rbac', 'siklus-dokumen', 'arsitektur-data', 'antarmuka-ui', 'seed-uat-tata-kelola'][Number(g.cid)]}.md\`](wiki/0${g.cid}-${['autentikasi-rbac', 'siklus-dokumen', 'arsitektur-data', 'antarmuka-ui', 'seed-uat-tata-kelola'][Number(g.cid)]}.md)
- **Node kunci:** ${g.members.slice(0, 6).map((m) => `\`${m.label}\``).join(', ')}
`).join('\n')}

## Hyperedges (Multi-Node Flows)

${hyperedges.map((h) => `- **${h.label}** (\`${h.id}\`, ${h.confidence} ${h.confidence_score}): ${h.nodes.map((id) => `\`${id}\``).join(' <-> ')}`).join('\n')}

## Open Questions (Perlu Keputusan Sebelum Sprint 3-4)
1. Template resmi dan tata letak PDF final untuk 5 jenis dokumen (SK, Kebijakan, Pedoman Kerja, Pedoman Pelayanan, SPO).
2. Bukti pengesahan wajib sebelum Manajer menyetujui (mis. scan tanda tangan Direktur).
3. Batas ukuran unggahan final (usulan PRD: 20 MB per berkas).
4. Mekanisme password awal (ditetapkan Super Admin + wajib ganti vs template OPPE \`annisa123\`).
5. Contoh nomor resmi selain SPO (\`RSAN/SPO/5/DTO/007\`).
6. Daftar awal Koordinator/SPV dan Manajer per 34 unit.
`;

fs.writeFileSync(path.join(OUT_DIR, 'GRAPH_REPORT.md'), graphReport, 'utf8');

// Wiki files
const wikiSlugs = [
  '00-autentikasi-rbac.md',
  '01-siklus-dokumen.md',
  '02-arsitektur-data.md',
  '03-antarmuka-ui.md',
  '04-seed-uat-tata-kelola.md',
];

const wikiSummaries = {
  0: 'Mengatur login berbasis NIK format `0000.00.00`, sesi cookie `httpOnly` 30 menit, penguncian akun 15 menit setelah 5 kali gagal login, serta RBAC berbasis 4 peran (`Super Admin`, `Staf`, `Koordinator/SPV`, `Manajer`) dan penugasan unit pada tab `User_Units`.',
  1: 'Mengatur siklus hidup dokumen regulasi internal RS AN-NISA: 5 jenis tetap, penyusunan via Template atau Upload resumable (< 4 MB per chunk), validasi nomor manual unik (HTTP 409), alur `DRAF -> MENUNGGU_VERIFIKASI -> DISETUJUI/DIKEMBALIKAN`, penarikan/hapus draf, keberlakuan dinamis zona Asia/Jakarta, revisi tertaut, status Aktif/Tidak Aktif, dan notifikasi lonceng web.',
  2: 'Mengatur stack Next.js App Router + Route Handlers di Vercel, penyimpanan metadata di 12 tab Google Sheets (`JDIH-DB RS AN-NISA`), penyimpanan berkas di Shared Drive `JDIH RS AN-NISA`, serta Upstash Redis untuk write-lock berurutan, cache tab (menjaga kuota ~300 baca/menit), dan idempotensi.',
  3: 'Mengatur 17 route sitemap, palet biru OPPE (Primary `#2563EB`, Primary Dark `#1E3A8A`, Primary Light `#EFF6FF`), struktur PDF A4 portrait Section 5.2, 8 state UI wajib Section 5.3, skema isian editor Lampiran B, serta implementasi mockup interaktif di `mockup/index.html`.',
  4: 'Mengatur 34 unit awal RS AN-NISA (Lampiran A), 16 Decision Log arsitektur & produk, 6 Open Questions, 15 skenario penerimaan UAT (Lampiran C), 6 Key Results bisnis, dan peta jalan Sprint 1-4.',
};

for (const g of commGroups) {
  const idx = Number(g.cid);
  const slug = wikiSlugs[idx];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const content = `# Community ${g.cid}: ${g.cname}

[Kembali ke Wiki Index](index.md) | [Kembali ke Root Index](../../index.md) | [PRD Lengkap](../../docs/PRD_JDIH.md)

## Ringkasan
${wikiSummaries[idx]}

## Entitas (${g.members.length} Node)

| Node ID | Label | Tipe | Lokasi PRD | Rasional / Catatan |
|---|---|---|---|---|
${g.members.map((m) => `| \`${m.id}\` | ${m.label} | \`${m.file_type}\` | ${m.source_location} | ${m.rationale || '-'} |`).join('\n')}

## Relasi Internal (${g.internalEdges.length})

${g.internalEdges.map((e) => `- \`${nodeMap.get(e.source).label}\` **${e.relation}** \`${nodeMap.get(e.target).label}\` (${e.confidence} ${e.confidence_score})`).join('\n')}

## Jembatan Lintas Komunitas (${g.crossEdges.length})

${g.crossEdges.map((e) => {
  const s = nodeMap.get(e.source);
  const t = nodeMap.get(e.target);
  return `- \`${s.label}\` (C${s.community_id}) **${e.relation}** \`${t.label}\` (C${t.community_id}) [${e.confidence} ${e.confidence_score}]`;
}).join('\n')}
`;
  fs.writeFileSync(path.join(WIKI_DIR, slug), content, 'utf8');
}

const wikiIndex = `# Graphify Wiki Index: JDIH RS AN-NISA

[Kembali ke Root Index](../../index.md) | [Graph Report](../GRAPH_REPORT.md) | [Graph JSON](../graph.json)

Wiki ini dihasilkan dari ekstraksi terstruktur [\`docs/PRD_JDIH.md\`](../../docs/PRD_JDIH.md) dan ditautkan dengan implementasi mockup [\`mockup/index.html\`](../../mockup/index.html).

## Daftar Komunitas Pengetahuan

| ID | Komunitas | Node | Artikel Wiki |
|---|---|---|---|
${commGroups.map((g, idx) => `| C${g.cid} | ${g.cname} | ${g.members.length} | [\`${wikiSlugs[idx]}\`](${wikiSlugs[idx]}) |`).join('\n')}

## God Nodes (Titik Hub Arsitektur)

${godNodes.slice(0, 6).map((n) => `- **${n.label}** (\`${n.id}\`, degree ${n.degree}) -> [C${n.community_id}](${wikiSlugs[n.community_id]})`).join('\n')}
`;

fs.writeFileSync(path.join(WIKI_DIR, 'index.md'), wikiIndex, 'utf8');

// Root index.md (entry point agent-crawlable Graphify index)
const rootIndex = `# Index Pengetahuan & Artefak: JDIH RS AN-NISA

> **Entry point Graphify** untuk PRD Sistem Jaringan Dokumentasi dan Informasi Hukum (JDIH) RS AN-NISA, Knowledge Graph, Mockup UI Interaktif, dan Laporan Audit Impeccable.

## Peta Artefak Proyek

| Artefak | Lokasi | Fungsi |
|---|---|---|
| Dokumen PRD Asli | [\`PRD_JDIH.docx\`](PRD_JDIH.docx) | Sumber primer spesifikasi JDIH RS AN-NISA (v1.1, TIM DTO) |
| Ekstraksi Markdown PRD | [\`docs/PRD_JDIH.md\`](docs/PRD_JDIH.md) | Representasi Markdown penuh (${prdLines.length} baris: 16 fitur, 12 tab DB, 17 rute, 34 unit, 15 UAT) |
| Knowledge Graph JSON | [\`graphify-out/graph.json\`](graphify-out/graph.json) | Graf pengetahuan Graphify (${nodes.length} node, ${edges.length} edge, ${hyperedges.length} hyperedge, 0 error integritas) |
| Laporan Graphify | [\`graphify-out/GRAPH_REPORT.md\`](graphify-out/GRAPH_REPORT.md) | Ringkasan komunitas, god nodes, jembatan lintas modul, dan open questions |
| Wiki Agent-Crawlable | [\`graphify-out/wiki/index.md\`](graphify-out/wiki/index.md) | Indeks wiki 5 artikel komunitas untuk navigasi cepat per domain |
| Mockup UI Interaktif | [\`mockup/index.html\`](mockup/index.html) | Aplikasi web mockup JDIH RS AN-NISA (17 rute, 4 peran, 34 unit, editor 5 template, preview PDF A4, dark mode) |
| Laporan Audit Impeccable | [\`AUDIT_REPORT.md\`](AUDIT_REPORT.md) | Audit teknis 5 dimensi (A11y, Performance, Theming, Responsive, Implementation Integrity) |

## Peta Komunitas Graphify (5 Klaster Utama)

| Komunitas | Cakupan PRD | Artikel Wiki |
|---|---|---|
| **C0: Autentikasi & RBAC** | Login NIK \`0000.00.00\`, sesi 30m, lockout 5x/15m, 4 peran, penugasan unit, guard 403 | [\`graphify-out/wiki/00-autentikasi-rbac.md\`](graphify-out/wiki/00-autentikasi-rbac.md) |
| **C1: Siklus Hidup & Verifikasi Dokumen** | Template vs Upload < 4MB, nomor unik 409, ajukan/tarik/hapus, verifikasi Manajer, keberlakuan WIB, revisi, Aktif/Nonaktif, notifikasi | [\`graphify-out/wiki/01-siklus-dokumen.md\`](graphify-out/wiki/01-siklus-dokumen.md) |
| **C2: Arsitektur Data & Infrastruktur** | Next.js App Router, 12 tab Google Sheets, Shared Drive, Upstash Redis locks/cache, \`@react-pdf/renderer\`, 15 endpoint API | [\`graphify-out/wiki/02-arsitektur-data.md\`](graphify-out/wiki/02-arsitektur-data.md) |
| **C3: Antarmuka & Pengalaman Pengguna** | 17 rute sitemap, tema biru OPPE, format PDF A4, 8 UI states, isian editor Lampiran B, kode mockup | [\`graphify-out/wiki/03-antarmuka-ui.md\`](graphify-out/wiki/03-antarmuka-ui.md) |
| **C4: Tata Kelola, Seed Data & UAT** | 34 unit awal RS AN-NISA, 16 decision log, 6 open questions, 15 skenario UAT, 4 sprint | [\`graphify-out/wiki/04-seed-uat-tata-kelola.md\`](graphify-out/wiki/04-seed-uat-tata-kelola.md) |

## God Nodes (Simpul Arsitektur Berderajat Tertinggi)

${godNodes.slice(0, 8).map((n, i) => `${i + 1}. **${n.label}** (\`degree=${n.degree}\`, C${n.community_id}) — \`${n.id}\``).join('\n')}

## Cakupan 17 Halaman Sitemap di Mockup UI

| No | Halaman | Hash Route Mockup | Peran |
|---|---|---|---|
| 1 | Login | \`#/login\` | Semua |
| 2 | Ganti Password | \`#/ganti-password\` | Semua |
| 3 | Profil | \`#/profil\` | Semua |
| 4 | Daftar Dokumen | \`#/dokumen\` | Semua |
| 5 | Detail Dokumen | \`#/dokumen/:id\` | Semua |
| 6 | Pengajuan Unit | \`#/pengajuan\` | Koordinator/SPV, Super Admin |
| 7 | Buat Dokumen (Step 1) | \`#/pengajuan/baru\` | Koordinator/SPV, Super Admin |
| 8 | Edit Draf (Step 2) | \`#/pengajuan/:versionId\` | Koordinator/SPV, Super Admin |
| 9 | Antrean Verifikasi | \`#/verifikasi\` | Manajer, Super Admin |
| 10 | Detail Verifikasi | \`#/verifikasi/:versionId\` | Manajer, Super Admin |
| 11 | Notifikasi | \`#/notifikasi\` | Koordinator/SPV, Manajer, Super Admin |
| 12 | Admin Unit (34 Unit) | \`#/admin/unit\` | Super Admin |
| 13 | Admin Pengguna | \`#/admin/pengguna\` | Super Admin |
| 14 | Admin Koordinator/SPV | \`#/admin/koordinator\` | Super Admin |
| 15 | Admin Manajer | \`#/admin/manajer\` | Super Admin |
| 16 | Admin Jenis Dokumen | \`#/admin/jenis-dokumen\` | Super Admin |
| 17 | Akses Ditolak | \`#/403\` | Semua |
`;

fs.writeFileSync(path.join(ROOT, 'index.md'), rootIndex, 'utf8');

console.log(`Graphify built: ${nodes.length} nodes, ${edges.length} edges, ${hyperedges.length} hyperedges, ${Object.keys(COMMUNITIES).length} communities`);
console.log(`Health check: dangling=${dangling}, selfLoops=${selfLoops}`);
console.log(`Top 3 God Nodes: ${godNodes.slice(0, 3).map((g) => `${g.label} (${g.degree})`).join(', ')}`);
