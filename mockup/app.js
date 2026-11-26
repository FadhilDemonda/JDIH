(function () {
  'use strict';

  const live = document.documentElement.hasAttribute('data-jdih-live');
  const SEED = live ? {} : window.JDIH_SEED;
  let saving = false;
  let stateRevision = 0;
  let reviewSelectionEvents = null;
  let reviewDraft = null;
  const localScanUrls = new Map();

  const state = {
    today: SEED.TODAY || '',
    theme: localStorage.getItem('jdih_theme') || 'light',
    loggedIn: !live,
    currentUserId: live ? null : 'usr-staf',
    units: structuredClone(SEED.UNITS || []),
    categories: structuredClone(SEED.CATEGORIES || []),
    users: structuredClone(SEED.USERS || []),
    userUnits: structuredClone(SEED.USER_UNITS || []),
    documents: structuredClone(SEED.DOCUMENTS || []),
    versions: structuredClone(SEED.VERSIONS || []),
    reviewLogs: structuredClone(SEED.REVIEW_LOGS || []),
    documentLogs: structuredClone(SEED.DOCUMENT_LOGS || []),
    notifications: structuredClone(SEED.NOTIFICATIONS || []),

    // UI view state
    docFilters: { q: '', unitId: '', categoryId: '', sortBy: 'TERBARU', showInactive: false, pageSize: 10, page: 1, loading: false },
    myUnitDocFilters: { q: '', unitId: '', categoryId: '', sortBy: 'TERBARU', showInactive: false, pageSize: 10, page: 1, loading: false },
    lastListRoute: '/dokumen',
    pengajuanFilter: 'SEMUA',
    pengajuanSort: 'TERBARU',
    verifikasiTab: 'MENUNGGU',
    verifikasiSort: 'TERBARU',
    selectedDetailVersionId: null,
    previewModeByVersion: {},
    adminUserSearch: '',
    adminUserPage: 1,
    adminUserPageSize: 10,
    adminUnitSearch: '',
    draftStep1: { unitId: '', categoryId: 'cat-spo', metode: 'TEMPLATE' },
    dirtyDraft: false,
    loginAttempts: 0,
    loginLockedUntil: 0,
    uploadSim: { progress: 0, fileName: '', sizeLabel: '', status: 'IDLE' },
    prevNavPill: null,
    lastRoutePath: null,
    flowStep: 0,
    flowTimer: null,
  };

  // ---------- Helpers ----------
  function receive(snapshot) {
    Object.assign(state, snapshot);
    state.loggedIn = Boolean(snapshot.currentUserId);
    if (!state.loggedIn) state.dirtyDraft = false;
    stateRevision += 1;
  }

  async function refreshView(path) {
    if (saving || state.dirtyDraft || !state.loggedIn) return;
    const revision = stateRevision;
    try {
      const snapshot = await api('state');
      if (saving || state.dirtyDraft || stateRevision !== revision || parseRoute().path !== path) return;
      receive(snapshot);
      renderRoute();
    } catch (error) {
      if (error.status === 401 && !saving && stateRevision === revision) {
        receive({ currentUserId: null, users: [], units: [], categories: [], userUnits: [],
          documents: [], versions: [], reviewLogs: [], documentLogs: [], notifications: [] });
        navigate('#/login');
      }
    }
  }

  async function api(url, method = 'GET', body, options = {}) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') {
      headers['X-JDIH-State'] = options.snapshot === false ? '0' : '1';
      if (method !== 'PUT') {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        headers['Idempotency-Key'] = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      }
    }
    if (body instanceof Blob) {
      headers['Upload-Offset'] = String(options.offset);
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch('/api/' + url, { method, body, headers, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error || 'Permintaan gagal diproses.');
      error.status = response.status;
      throw error;
    }
    if (payload.state && options.apply !== false) receive(payload.state);
    return payload;
  }

  async function writeAction(url, method, body, success, done) {
    if (saving) return;
    saving = true;
    const button = document.activeElement;
    if (button instanceof HTMLButtonElement) button.disabled = true;
    try {
      const result = await api(url, method, body);
      if (success) showToast(success, 'success');
      if (done) await done(result);
    } catch (error) {
      if (error.status === 401) {
        state.loggedIn = false;
        state.currentUserId = null;
        navigate('#/login');
      }
      showToast(error.message, 'error');
    } finally {
      if (button instanceof HTMLButtonElement) button.disabled = false;
      saving = false;
    }
  }

  function versionPath(id, tail = '') {
    return 'versions/' + encodeURIComponent(id) + tail;
  }

  function draftInput(version) {
    const { edit_version, judul, nomor, revisi_label, tgl_dokumen, tgl_berlaku, kata_kunci, ringkasan_perubahan, sections } = version;
    return { edit_version, judul, nomor, revisi_label, tgl_dokumen, tgl_berlaku, kata_kunci, ringkasan_perubahan, sections };
  }

  function fileUrl(version, fileId = 'pdf', download = false) {
    return '/api/' + versionPath(version.id, '/files/' + encodeURIComponent(fileId)) + (download ? '?download=1' : '');
  }

  function attachmentLink(version, attachment) {
    return live && attachment.id
      ? `<a href="${fileUrl(version, attachment.id, true)}">${esc(attachment.nama)}</a>`
      : esc(attachment.nama);
  }

  function supportingFiles(version, locked, source = false) {
    if (!live) return '';
    const files = version.attachments.filter((file) => file.kind !== 'PDF');
    return `
      ${!locked ? `<div class="file-pickers">
        ${source ? '<label class="btn btn-secondary">Pilih DOCX sumber<input type="file" data-upload-kind="SUMBER" accept=".docx" class="file-picker"></label>' : ''}
        <label class="btn btn-secondary">Pilih lampiran<input type="file" data-upload-kind="LAMPIRAN" accept=".pdf,.docx,.png,.jpg,.jpeg" class="file-picker"></label>
      </div>` : ''}
      ${files.length ? `<ul>${files.map((file) => `<li>${attachmentLink(version, file)} (${esc(file.ukuran)})</li>`).join('')}</ul>` : ''}
    `;
  }

  function getScanPdfAttachment(version) {
    return (version?.attachments || []).find((file) =>
      file.kind === 'PDF' || (!live && version.metode === 'UPLOAD' && /\.pdf$/i.test(file.nama || ''))
    ) || null;
  }

  function setLocalScanPreview(versionId, file) {
    const prev = localScanUrls.get(versionId);
    if (prev?.url) URL.revokeObjectURL(prev.url);
    localScanUrls.set(versionId, {
      url: URL.createObjectURL(file),
      name: file.name,
      sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
    });
  }

  function clearLocalScanPreview(versionId) {
    const prev = localScanUrls.get(versionId);
    if (prev?.url) URL.revokeObjectURL(prev.url);
    localScanUrls.delete(versionId);
  }

  function getScanPdfUrl(version) {
    const att = getScanPdfAttachment(version);
    if (live && att?.id) return fileUrl(version, 'scan') + '?v=' + encodeURIComponent(att.id);
    return localScanUrls.get(version?.id)?.url || null;
  }

  function getActivePreviewMode(version) {
    const chosen = state.previewModeByVersion[version.id];
    if (chosen === 'CURRENT' || chosen === 'SCAN') return chosen;
    if (version.metode === 'UPLOAD' && (getScanPdfUrl(version) || getScanPdfAttachment(version))) return 'SCAN';
    return 'CURRENT';
  }

  function renderPreviewModeToggle(version) {
    const mode = getActivePreviewMode(version);
    const hasScan = Boolean(getScanPdfUrl(version) || getScanPdfAttachment(version));
    return `
      <div class="segmented preview-mode-toggle" role="group" aria-label="Pilih mode pratinjau dokumen">
        <button type="button" class="${mode === 'CURRENT' ? 'active' : ''}" data-preview-mode="CURRENT" aria-pressed="${mode === 'CURRENT'}">Pratinjau Dokumen</button>
        <button type="button" class="${mode === 'SCAN' ? 'active' : ''}" data-preview-mode="SCAN" aria-pressed="${mode === 'SCAN'}">PDF Hasil Scan${hasScan ? ' (Ada)' : ''}</button>
      </div>
    `;
  }

  function renderDocumentPreview(version, doc, annotations = [], options = {}) {
    const mode = getActivePreviewMode(version);
    if (mode === 'CURRENT') return renderA4Sheet(version, doc, annotations);
    const scanUrl = getScanPdfUrl(version);
    const att = getScanPdfAttachment(version);
    if (scanUrl) {
      return `
        <div class="scan-preview-actions">
          <span class="tabular">${esc(att?.nama || localScanUrls.get(version.id)?.name || 'Dokumen_Scan.pdf')}</span>
          <a href="${esc(scanUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-compact">Buka Tab Baru</a>
        </div>
        <iframe class="pdf-frame" title="Pratinjau PDF Hasil Scan" src="${esc(scanUrl)}"></iframe>
      `;
    }
    if (!live && att) {
      return `
        <div class="empty-state scan-empty-state">
          ${iconSvg('doc')}
          <h3>Berkas PDF Hasil Scan Terlampir</h3>
          <p><strong>${esc(att.nama)}</strong> (${esc(att.ukuran || '-')}) tersedia pada data contoh statis. Pilih berkas PDF lokal jika ingin melihat pratinjau langsung.</p>
          ${options.canUploadScan ? `<label class="btn btn-primary">${iconSvg('upload')}<span>Pilih PDF untuk Pratinjau</span><input type="file" accept=".pdf,application/pdf" data-scan-upload-input class="file-picker"></label>` : ''}
        </div>
      `;
    }
    return `
      <div class="empty-state scan-empty-state">
        ${iconSvg('doc')}
        <h3>Belum ada PDF hasil scan</h3>
        <p>${options.canUploadScan
          ? 'Unggah berkas PDF hasil scan bertanda tangan agar dapat dipratinjau di sini.'
          : 'Dokumen ini belum memiliki berkas PDF hasil scan yang diunggah.'}</p>
        ${options.canUploadScan ? `<label class="btn btn-primary">${iconSvg('upload')}<span>Unggah PDF Hasil Scan</span><input type="file" accept=".pdf,application/pdf" data-scan-upload-input class="file-picker"></label>` : ''}
      </div>
    `;
  }

  function renderPdfPreview(version, doc, annotations = [], options = {}) {
    return renderDocumentPreview(version, doc, annotations, options);
  }

  async function uploadFile(version, file, kind, options = {}) {
    if (saving || !file) return;
    if (kind === 'PDF') {
      if (!/\.pdf$/i.test(file.name)) {
        showToast('Berkas utama harus PDF', 'error');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        showToast('Ukuran berkas maksimal 20 MB.', 'error');
        return;
      }
      setLocalScanPreview(version.id, file);
      state.previewModeByVersion[version.id] = 'SCAN';
    }
    const refresh = () => {
      if (options.onRefresh) options.onRefresh();
      else if (parseRoute().param === version.id) viewEditDraf(version.id);
    };
    if (!live) {
      const sizeLabel = `${Math.max(1, Math.round(file.size / 1024))} KB`;
      state.uploadSim = { fileName: file.name, sizeLabel, progress: 100, status: 'READY' };
      if (kind !== 'LAMPIRAN') {
        version.attachments = (version.attachments || []).filter((item) => item.kind !== kind);
      }
      version.attachments = version.attachments || [];
      version.attachments.push({ nama: file.name, ukuran: sizeLabel, mime: 'application/pdf', kind });
      showToast('Berkas PDF siap dipratinjau.', 'success');
      refresh();
      return;
    }
    saving = true;
    const base = versionPath(version.id, '/files');
    const draft = draftInput(version);
    state.uploadSim = { fileName: file.name, progress: 0, status: 'UPLOADING' };
    refresh();
    try {
      const { uploadId, chunkSize } = await api(base, 'POST', { name: file.name, size: file.size, kind }, { snapshot: false });
      let offset = 0;
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        let result;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            result = await api(base + '/' + uploadId, 'PUT', chunk, { offset, snapshot: false });
            break;
          } catch (error) {
            if (attempt || (error.status && error.status < 500)) throw error;
          }
        }
        if (result.offset <= offset) throw new Error('Kemajuan unggahan tidak valid.');
        offset = result.offset;
        state.uploadSim.progress = Math.round(offset / file.size * 100);
        const fill = document.querySelector('.upload-zone .progress-fill');
        if (fill) fill.style.width = state.uploadSim.progress + '%';
      }
      const fresh = await api(versionPath(version.id));
      if (fresh.edit_version !== draft.edit_version) {
        throw new Error('Berkas tersimpan. Salin perubahan yang belum disimpan, lalu muat ulang draf yang sudah berubah.');
      }
      Object.assign(fresh, draft);
      const index = state.versions.findIndex((item) => item.id === version.id);
      if (index !== -1) state.versions[index] = fresh;
      showToast('Berkas tersimpan.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      state.uploadSim.status = 'IDLE';
      saving = false;
      refresh();
    }
  }

  async function deleteScanPdf(version, options = {}) {
    if (saving || !version) return;
    const att = getScanPdfAttachment(version);
    const localInfo = localScanUrls.get(version.id);
    if (!att && !localInfo) return;
    const fileName = att?.nama || localInfo?.name || 'berkas PDF';
    const res = await openDialog({
      title: 'Hapus Berkas PDF',
      bodyHtml: `<p>Berkas <strong>${esc(fileName)}</strong> akan dihapus dari versi dokumen ini. Lanjutkan?</p>`,
      confirmLabel: 'Ya, Hapus PDF',
      confirmTone: 'danger',
    });
    if (!res) return;
    if (!live) {
      version.attachments = (version.attachments || []).filter((item) =>
        item.kind !== 'PDF' && !(version.metode === 'UPLOAD' && /\.pdf$/i.test(item.nama || '')));
      clearLocalScanPreview(version.id);
      state.previewModeByVersion[version.id] = 'CURRENT';
      showToast('Berkas PDF dihapus.', 'success');
      options.onRefresh?.();
      return;
    }
    if (!att?.id) {
      clearLocalScanPreview(version.id);
      state.previewModeByVersion[version.id] = 'CURRENT';
      showToast('Pratinjau PDF lokal dihapus.', 'success');
      options.onRefresh?.();
      return;
    }
    if (options.preserveDraft) {
      saving = true;
      try {
        const draft = draftInput(version);
        const result = await api(versionPath(version.id, '/files/scan'), 'DELETE', undefined, { snapshot: false });
        const fresh = result.version || await api(versionPath(version.id));
        Object.assign(fresh, draft);
        const index = state.versions.findIndex((item) => item.id === version.id);
        if (index !== -1) state.versions[index] = fresh;
        clearLocalScanPreview(version.id);
        state.previewModeByVersion[version.id] = 'CURRENT';
        showToast('Berkas PDF dihapus.', 'success');
        options.onRefresh?.();
      } catch (error) {
        if (error.status === 401) {
          state.loggedIn = false;
          state.currentUserId = null;
          navigate('#/login');
        }
        showToast(error.message, 'error');
      } finally {
        saving = false;
      }
      return;
    }
    return writeAction(versionPath(version.id, '/files/scan'), 'DELETE', undefined, 'Berkas PDF dihapus.', () => {
      clearLocalScanPreview(version.id);
      state.previewModeByVersion[version.id] = 'CURRENT';
      options.onRefresh?.();
    });
  }

  const MONTH_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateID(iso) {
    if (!iso) return '-';
    const parts = iso.slice(0, 10).split('-');
    if (parts.length !== 3) return iso;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    if (!y || m < 0 || m > 11 || !d) return iso;
    return `${String(d).padStart(2, '0')} ${MONTH_ID[m]} ${y}`;
  }

  function formatTimestamp(value) {
    if (!value) return '-';
    if (!live || !value.includes('T')) return value + ' WIB';
    const date = new Date(value);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short',
    }).format(date) + ' WIB';
  }

  function normalizeDocNumber(num) {
    return String(num || '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  function formatNikInput(raw) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  }

  function isValidNik(nik) {
    return /^\d{4}\.\d{2}\.\d{2}$/.test(nik);
  }

  function getUser(id) {
    return state.users.find((u) => u.id === id) || null;
  }

  function getUnit(id) {
    return state.units.find((u) => u.id === id) || null;
  }

  function getCategory(id) {
    return state.categories.find((c) => c.id === id) || null;
  }

  function getCurrentUser() {
    return getUser(state.currentUserId);
  }

  function getUserUnitsFor(userId, peran) {
    return state.userUnits
      .filter((uu) => uu.user_id === userId && uu.is_active && (!peran || uu.peran === peran))
      .map((uu) => uu.unit_id);
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getMyUnitIds(user) {
    if (!user) return [];
    const assigned = Array.from(new Set(getUserUnitsFor(user.id)));
    if (assigned.length > 0) return assigned;

    const home = String(user.unit_home || '').trim().toLowerCase();
    if (!home) return [];

    const activeUnits = state.units.filter((u) => u.is_active);
    const exact = activeUnits.filter((u) => u.nama.toLowerCase() === home || u.kode.toLowerCase() === home);
    if (exact.length > 0) return exact.map((u) => u.id);

    const matched = activeUnits.filter((u) => {
      const tokens = [u.kode, u.nama].filter(Boolean);
      return tokens.some((tok) => {
        const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(tok.toLowerCase())}([^a-z0-9]|$)`, 'i');
        return re.test(home);
      });
    });
    return Array.from(new Set(matched.map((u) => u.id)));
  }

  function getMyUnitPublishedCount(user) {
    const myUnitIds = getMyUnitIds(user);
    if (!myUnitIds.length) return 0;
    return state.documents.filter(
      (doc) => doc.status_aktif === 'AKTIF' && myUnitIds.includes(doc.unit_id) && Boolean(getPrimaryPublishedVersion(doc.id))
    ).length;
  }

  function getRolesSummary(user) {
    if (!user) return [];
    const roles = ['Staf'];
    if (user.is_super_admin) roles.unshift('Super Admin');
    const ko = getUserUnitsFor(user.id, 'KOORDINATOR');
    const mg = getUserUnitsFor(user.id, 'MANAJER');
    if (ko.length) roles.push(`Koordinator (${ko.map((id) => getUnit(id)?.nama).filter(Boolean).join(', ')})`);
    if (mg.length) roles.push(`Manajer (${mg.map((id) => getUnit(id)?.nama).filter(Boolean).join(', ')})`);
    return roles;
  }

  function canEditUnit(user, unitId) {
    if (!user || !user.is_active) return false;
    if (user.is_super_admin) return true;
    return getUserUnitsFor(user.id, 'KOORDINATOR').includes(unitId);
  }

  function canVerifyUnit(user, unitId) {
    if (!user || !user.is_active) return false;
    if (user.is_super_admin) return true;
    return getUserUnitsFor(user.id, 'MANAJER').includes(unitId);
  }

  function isAnyKoordinator(user) {
    return Boolean(user && (user.is_super_admin || getUserUnitsFor(user.id, 'KOORDINATOR').length > 0));
  }

  function isAnyManajer(user) {
    return Boolean(user && (user.is_super_admin || getUserUnitsFor(user.id, 'MANAJER').length > 0));
  }

  function getDocVersions(docId) {
    return state.versions.filter((v) => v.document_id === docId && v.status !== 'DIHAPUS');
  }

  // Keberlakuan dihitung dinamis dari tanggal mulai berlaku (PRD Section 4.3)
  function computeEffectiveStatuses(docId) {
    const approved = state.versions
      .filter((v) => v.document_id === docId && v.status === 'DISETUJUI')
      .slice();

    const activeEligible = approved
      .filter((v) => v.tgl_berlaku && v.tgl_berlaku <= state.today)
      .sort((a, b) => {
        if (b.tgl_berlaku !== a.tgl_berlaku) return b.tgl_berlaku.localeCompare(a.tgl_berlaku);
        return (b.approved_at || '').localeCompare(a.approved_at || '');
      });

    const currentBerlakuId = activeEligible[0] ? activeEligible[0].id : null;
    const map = new Map();

    for (const v of approved) {
      if (v.id === currentBerlakuId) {
        map.set(v.id, { code: 'BERLAKU', label: 'Berlaku', tone: 'success' });
      } else if (v.tgl_berlaku && v.tgl_berlaku > state.today) {
        map.set(v.id, { code: 'BERLAKU_MULAI', label: `Berlaku mulai ${formatDateID(v.tgl_berlaku)}`, tone: 'warning' });
      } else {
        map.set(v.id, { code: 'VERSI_SEBELUMNYA', label: 'Versi Sebelumnya', tone: 'neutral' });
      }
    }
    return { map, currentBerlakuId };
  }

  function getPrimaryPublishedVersion(docId) {
    const approved = state.versions.filter((v) => v.document_id === docId && v.status === 'DISETUJUI');
    if (!approved.length) return null;
    const { map, currentBerlakuId } = computeEffectiveStatuses(docId);
    if (currentBerlakuId) {
      return { version: approved.find((v) => v.id === currentBerlakuId), eff: map.get(currentBerlakuId) };
    }
    const upcoming = approved
      .slice()
      .sort((a, b) => a.tgl_berlaku.localeCompare(b.tgl_berlaku))[0];
    return { version: upcoming, eff: map.get(upcoming.id) };
  }

  function checkNumberConflict(rawNum, currentDocId) {
    const norm = normalizeDocNumber(rawNum);
    if (!norm) return null;
    const conflict = state.versions.find(
      (v) => v.status !== 'DIHAPUS' && normalizeDocNumber(v.nomor) === norm && v.document_id !== currentDocId
    );
    if (conflict) {
      return { sameDoc: false, conflict };
    }
    const sameDocConflict = state.versions.find(
      (v) => v.status !== 'DIHAPUS' && v.status === 'DISETUJUI' && normalizeDocNumber(v.nomor) === norm && v.document_id === currentDocId
    );
    return sameDocConflict ? { sameDoc: true, conflict: sameDocConflict } : null;
  }

  function getOpenRevision(docId) {
    return state.versions.find(
      (v) => v.document_id === docId && ['DRAF', 'MENUNGGU_VERIFIKASI', 'DIKEMBALIKAN'].includes(v.status)
    ) || null;
  }

  function sanitizeDownloadName(v) {
    const raw = `${v.nomor || 'DOC'}_${v.judul || 'Dokumen'}_Rev${v.revisi_label || '00'}.pdf`;
    return raw.replace(/[\\/:*?"<>|\s]+/g, '-');
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'DRAF': return { label: 'Draf', tone: 'neutral' };
      case 'MENUNGGU_VERIFIKASI': return { label: 'Menunggu Verifikasi', tone: 'warning' };
      case 'DIKEMBALIKAN': return { label: 'Dikembalikan', tone: 'danger' };
      case 'DISETUJUI': return { label: 'Disetujui', tone: 'success' };
      default: return { label: status, tone: 'neutral' };
    }
  }

  function iconSvg(name) {
    const paths = {
      doc: '<path d="M6 2.5h6l4 4V17a1.5 1.5 0 01-1.5 1.5h-8.5A1.5 1.5 0 014.5 17V4A1.5 1.5 0 016 2.5z"/><path d="M12 2.5v4h4M7.5 10.5h5M7.5 13.5h3.5"/>',
      folder: '<path d="M3 5.5A1.5 1.5 0 014.5 4h3.4l1.6 1.8h6A1.5 1.5 0 0117 7.3v7.2a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5v-9z"/>',
      edit: '<path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z"/>',
      check: '<path d="M16.5 5.5l-8 8-4-4"/>',
      bell: '<path d="M15 7a5 5 0 10-10 0c0 4.5-2 6-2 6h14s-2-1.5-2-6z"/><path d="M8.5 16a1.7 1.7 0 003 0"/>',
      building: '<path d="M4 17.5h12M5.5 17.5V4a1 1 0 011-1h7a1 1 0 011 1v13.5M8.5 6.5h1M11.5 6.5h1M8.5 9.5h1M11.5 9.5h1M9.5 17.5v-4h1v4"/>',
      users: '<circle cx="8" cy="7" r="2.5"/><path d="M3.5 16.5a4.5 4.5 0 019 0"/><circle cx="14.5" cy="7.5" r="2"/><path d="M14 12.5a3.5 3.5 0 013.5 4"/>',
      shield: '<path d="M10 2.5l6 2.5v4.5c0 4-2.5 6.8-6 8-3.5-1.2-6-4-6-8V5l6-2.5z"/>',
      tag: '<path d="M3.5 10V4.5a1 1 0 011-1H10l6.5 6.5-5.5 5.5L3.5 10z"/><circle cx="7" cy="7" r="1"/>',
      user: '<circle cx="10" cy="7" r="3"/><path d="M4 17a6 6 0 0112 0"/>',
      plus: '<path d="M10 4v12M4 10h12"/>',
      download: '<path d="M10 3.5v9M6.5 9.5L10 13l3.5-3.5M4 16.5h12"/>',
      arrowLeft: '<path d="M15 10H5M9.5 5.5L5 10l4.5 4.5"/>',
      upload: '<path d="M10 13V4.5M6.5 8L10 4.5 13.5 8M4 15.5h12"/>',
      up: '<path d="M10 14V6M6.5 9.5L10 6l3.5 3.5"/>',
      down: '<path d="M10 6v8M6.5 10.5L10 14l3.5-3.5"/>',
      trash: '<path d="M4.5 6h11M8 6V4h4v2M6 6v10.5a1 1 0 001 1h6a1 1 0 001-1V6"/>',
      dots: '<circle cx="10" cy="4.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>',
      undo: '<path d="M5 8.5h7a4 4 0 110 8H9M5 8.5L8 5.5M5 8.5L8 11.5"/>',
    };
    return `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }

  // ---------- Toast & Modal Dialogs ----------
  function showToast(message, type = 'success') {
    const region = document.getElementById('toast-region');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${esc(message)}</span><button type="button" class="icon-btn" style="min-width:28px;min-height:28px;padding:2px;" aria-label="Tutup notifikasi">×</button>`;
    const duration = type === 'error' ? 8000 : 4500;
    const timer = setTimeout(() => el.remove(), duration);
    el.querySelector('button').addEventListener('click', () => {
      clearTimeout(timer);
      el.remove();
    });
    region.appendChild(el);
  }

  function openDialog({ title, bodyHtml, confirmLabel = 'Ya, Lanjutkan', confirmTone = 'primary',
    requireNote = false, noteOptional = false, noteMaxLength = 4000, noteLabel = 'Catatan', notePlaceholder = '', noteValue = '',
    onOpen = null, validate = null, wide = false }) {
    const dialog = document.getElementById('confirm-dialog');
    const titleEl = document.getElementById('confirm-dialog-title');
    const bodyEl = document.getElementById('confirm-dialog-body');
    const footerEl = document.getElementById('confirm-dialog-footer');

    dialog.classList.toggle('dialog-wide', Boolean(wide));
    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml + (requireNote ? `
      <div class="field" style="margin-top:14px;">
        <label for="dialog-note-input">${esc(noteLabel)} ${noteOptional ? '(opsional)' : '<span class="req-mark">*</span>'}</label>
        <textarea id="dialog-note-input" class="textarea" maxlength="${noteMaxLength}" placeholder="${esc(notePlaceholder)}"${noteValue ? ' autofocus' : ''}>${esc(noteValue)}</textarea>
        <p id="dialog-note-error" class="field-error" hidden></p>
      </div>
    ` : '');

    footerEl.innerHTML = `
      <button type="button" class="btn btn-secondary" id="dialog-cancel-btn">Batal</button>
      <button type="button" class="btn btn-${confirmTone === 'danger' ? 'danger' : 'primary'}" id="dialog-ok-btn">${esc(confirmLabel)}</button>
    `;

    return new Promise((resolve) => {
      function cleanup(val) {
        dialog.classList.remove('dialog-wide');
        dialog.close();
        resolve(val);
      }

      document.getElementById('confirm-dialog-close').onclick = () => cleanup(null);
      document.getElementById('dialog-cancel-btn').onclick = () => cleanup(null);
      dialog.oncancel = (e) => {
        e.preventDefault();
        cleanup(null);
      };

      document.getElementById('dialog-ok-btn').onclick = () => {
        if (requireNote) {
          const input = document.getElementById('dialog-note-input');
          const err = document.getElementById('dialog-note-error');
          const val = input.value.trim();
          if (!val && !noteOptional) {
            input.classList.add('is-invalid');
            err.textContent = noteLabel.toLowerCase().includes('alasan') ? 'Alasan wajib diisi' : 'Catatan wajib diisi';
            err.hidden = false;
            input.focus();
            return;
          }
          cleanup({ confirmed: true, note: val });
          return;
        }
        if (typeof validate === 'function') {
          const extra = validate(dialog);
          if (!extra) return;
          cleanup(typeof extra === 'object' ? { confirmed: true, ...extra } : { confirmed: true });
          return;
        }
        cleanup({ confirmed: true });
      };

      dialog.showModal();
      if (typeof onOpen === 'function') onOpen(dialog);
    });
  }

  // ---------- Theme, Motion & Custom Dropdowns ----------
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('jdih_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    ['theme-toggle-btn', 'login-theme-btn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.setAttribute('aria-pressed', String(theme === 'dark'));
    });
  }

  function toggleThemeWithMotion(ev) {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    const btn = (ev && ev.currentTarget) || document.getElementById('theme-toggle-btn') || document.getElementById('login-theme-btn');

    if (prefersReducedMotion()) {
      applyTheme(nextTheme);
      return;
    }

    if (typeof document.startViewTransition === 'function' && btn) {
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

      const vt = document.startViewTransition(() => {
        applyTheme(nextTheme);
      });
      vt.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxR}px at ${x}px ${y}px)`],
            },
            {
              duration: 420,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          );
        })
        .catch(() => {});
      return;
    }

    document.documentElement.classList.add('theme-transitioning');
    applyTheme(nextTheme);
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 300);
  }

  function updateNavPill(nav) {
    const activeEl = nav.querySelector('.nav-item.active');
    if (!activeEl) {
      state.prevNavPill = null;
      nav.classList.remove('nav-has-pill');
      return;
    }
    const pill = document.createElement('div');
    pill.className = 'nav-active-pill';
    pill.setAttribute('aria-hidden', 'true');
    nav.prepend(pill);
    nav.classList.add('nav-has-pill');

    const navRect = nav.getBoundingClientRect();
    const actRect = activeEl.getBoundingClientRect();
    const nextTop = Math.round(actRect.top - navRect.top + nav.scrollTop);
    const pillBaseH = pill.offsetHeight || 36;
    const nextScale = Number((actRect.height / pillBaseH).toFixed(4)) || 1;
    const prev = state.prevNavPill;

    if (prev && !prefersReducedMotion() && (prev.top !== nextTop || prev.scale !== nextScale)) {
      pill.style.transition = 'none';
      pill.style.transform = `translateY(${prev.top}px) scaleY(${prev.scale})`;
      void pill.offsetHeight;
      pill.style.transition = '';
      requestAnimationFrame(() => {
        pill.style.transform = `translateY(${nextTop}px) scaleY(${nextScale})`;
      });
    } else {
      pill.style.transition = 'none';
      pill.style.transform = `translateY(${nextTop}px) scaleY(${nextScale})`;
    }

    state.prevNavPill = { top: nextTop, scale: nextScale };
  }

  function closeAllCustomSelects(except) {
    document.querySelectorAll('.cselect.open').forEach((wrap) => {
      if (wrap !== except) {
        wrap.classList.remove('open');
        const trig = wrap.querySelector('.cselect-trigger');
        if (trig) trig.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function syncCustomSelect(select) {
    const wrap = select && select._cselect;
    if (!wrap) return;
    const valSpan = wrap.querySelector('.cselect-value');
    const selectedOpt = select.options[select.selectedIndex];
    if (valSpan) valSpan.textContent = selectedOpt ? selectedOpt.textContent : '';
    wrap.querySelectorAll('.cselect-option').forEach((btn) => {
      const isSel = btn.getAttribute('data-value') === select.value;
      btn.setAttribute('aria-selected', String(isSel));
      const chk = btn.querySelector('.cselect-check');
      if (chk) chk.style.opacity = isSel ? '1' : '0';
    });
  }

  function enhanceSelects(rootEl) {
    if (!rootEl) return;
    const selects = rootEl.querySelectorAll('select.select, select.role-switch-select');
    selects.forEach((select) => {
      if (select.dataset.enhanced === '1') {
        syncCustomSelect(select);
        return;
      }
      select.dataset.enhanced = '1';
      select.classList.add('sr-only-select');
      select.tabIndex = -1;

      const wrap = document.createElement('div');
      const isCompact = select.id === 'doc-pagesize' || select.style.width === 'auto';
      const isDropup = Boolean(select.closest('.sidebar-footer'));
      wrap.className = `cselect${isCompact ? ' is-compact' : ''}${isDropup ? ' dropup' : ''}`;
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
      select._cselect = wrap;

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'cselect-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      if (select.disabled) trigger.disabled = true;

      const labelEl = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;
      if (labelEl) {
        if (!labelEl.id) labelEl.id = `lbl-${select.id}`;
        trigger.setAttribute('aria-labelledby', labelEl.id);
        labelEl.onclick = () => trigger.focus();
      } else if (select.getAttribute('aria-label')) {
        trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
      }

      const selectedOpt = select.options[select.selectedIndex];
      trigger.innerHTML = `
        <span class="cselect-value">${esc(selectedOpt ? selectedOpt.textContent : '')}</span>
        <svg class="cselect-chevron" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5.5 7.5L10 12l4.5-4.5"/>
        </svg>
      `;

      const menu = document.createElement('div');
      menu.className = 'cselect-menu';
      const hasSearch = select.options.length > 8;
      if (hasSearch) {
        const sw = document.createElement('div');
        sw.className = 'cselect-search-wrap';
        sw.innerHTML = `<input type="search" class="cselect-search" placeholder="Cari opsi..." aria-label="Cari opsi dropdown">`;
        menu.appendChild(sw);
      }

      const list = document.createElement('div');
      list.className = 'cselect-list';
      list.setAttribute('role', 'listbox');

      function renderOptions(filterText = '') {
        const q = filterText.trim().toLowerCase();
        const opts = Array.from(select.options).filter((o) => !q || o.textContent.toLowerCase().includes(q));
        if (!opts.length) {
          list.innerHTML = `<div class="cselect-empty">Opsi tidak ditemukan</div>`;
          return;
        }
        list.innerHTML = opts
          .map((o) => {
            const isSel = o.value === select.value;
            return `
              <button type="button" role="option" class="cselect-option" data-value="${esc(o.value)}" aria-selected="${isSel}">
                <span>${esc(o.textContent)}</span>
                <svg class="cselect-check" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:${isSel ? '1' : '0'};" aria-hidden="true">
                  <path d="M16 6l-7.5 8L4.5 10"/>
                </svg>
              </button>
            `;
          })
          .join('');

        list.querySelectorAll('.cselect-option').forEach((btn) => {
          btn.onclick = () => {
            const newVal = btn.getAttribute('data-value');
            const changed = select.value !== newVal;
            select.value = newVal;
            syncCustomSelect(select);
            wrap.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
            if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
          };
        });
      }

      renderOptions();
      menu.appendChild(list);
      wrap.appendChild(trigger);
      wrap.appendChild(menu);

      const searchEl = menu.querySelector('.cselect-search');
      if (searchEl) {
        searchEl.oninput = (e) => renderOptions(e.target.value);
        searchEl.onclick = (e) => e.stopPropagation();
      }

      trigger.onclick = (e) => {
        e.stopPropagation();
        const willOpen = !wrap.classList.contains('open');
        closeAllCustomSelects(wrap);
        if (willOpen) {
          if (!isDropup) {
            const rect = trigger.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            wrap.classList.toggle('dropup', spaceBelow < 240 && rect.top > 240);
          }
          if (searchEl) {
            searchEl.value = '';
            renderOptions('');
          }
          wrap.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          const activeOpt = list.querySelector('[aria-selected="true"]');
          if (activeOpt) activeOpt.scrollIntoView({ block: 'nearest' });
          if (searchEl) setTimeout(() => searchEl.focus(), 20);
        } else {
          wrap.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      };

      wrap.onkeydown = (e) => {
        if (e.key === 'Escape' && wrap.classList.contains('open')) {
          e.preventDefault();
          wrap.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && wrap.classList.contains('open')) {
          e.preventDefault();
          const opts = Array.from(list.querySelectorAll('.cselect-option'));
          if (!opts.length) return;
          const idx = opts.indexOf(document.activeElement);
          const next = e.key === 'ArrowDown' ? (idx + 1) % opts.length : (idx - 1 + opts.length) % opts.length;
          opts[next].focus();
        }
      };
    });
  }

  let activeRowMenuTrigger = null;

  function closeRowMenu() {
    const existing = document.getElementById('row-menu-popover');
    if (existing) existing.remove();
    if (activeRowMenuTrigger) {
      activeRowMenuTrigger.setAttribute('aria-expanded', 'false');
      activeRowMenuTrigger = null;
    }
  }

  function openRowMenu(triggerBtn, items) {
    const wasSame = activeRowMenuTrigger === triggerBtn;
    closeRowMenu();
    if (wasSame) return;

    closeAllCustomSelects();
    activeRowMenuTrigger = triggerBtn;
    triggerBtn.setAttribute('aria-expanded', 'true');

    const pop = document.createElement('div');
    pop.id = 'row-menu-popover';
    pop.className = 'row-menu-popover';
    pop.setAttribute('role', 'menu');

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `row-menu-item${item.danger ? ' danger' : ''}`;
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `${item.icon ? iconSvg(item.icon) : ''}<span>${esc(item.label)}</span>`;
      btn.onclick = (e) => {
        e.stopPropagation();
        closeRowMenu();
        item.onClick();
      };
      pop.appendChild(btn);
    });

    document.body.appendChild(pop);

    const rect = triggerBtn.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < popRect.height + 12 && rect.top > popRect.height + 12
      ? rect.top - popRect.height - 6
      : rect.bottom + 6;
    const left = Math.max(12, Math.min(window.innerWidth - popRect.width - 12, rect.right - popRect.width));
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;

    requestAnimationFrame(() => pop.classList.add('open'));

    pop.onkeydown = (e) => {
      const menuItems = Array.from(pop.querySelectorAll('.row-menu-item'));
      if (e.key === 'Escape') {
        e.preventDefault();
        const t = activeRowMenuTrigger;
        closeRowMenu();
        if (t) t.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = menuItems.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % menuItems.length : (idx - 1 + menuItems.length) % menuItems.length;
        menuItems[next].focus();
      }
    };
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').hidden = true;
    document.getElementById('menu-toggle-btn').setAttribute('aria-expanded', 'false');
  }

  function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').hidden = false;
    document.getElementById('menu-toggle-btn').setAttribute('aria-expanded', 'true');
  }

  // ---------- Navigation & Shell Chrome ----------
  function getPendingVerificationCountFor(user) {
    if (!isAnyManajer(user)) return 0;
    return state.versions.filter((v) => {
      if (v.status !== 'MENUNGGU_VERIFIKASI') return false;
      const doc = state.documents.find((d) => d.id === v.document_id);
      return doc && canVerifyUnit(user, doc.unit_id);
    }).length;
  }

  function getUnreadNotifications(user) {
    if (!user) return [];
    return state.notifications
      .filter((n) => (user.is_super_admin || n.user_id === user.id) && n.is_relevant && !n.is_read)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  function renderChrome(route) {
    const shell = document.getElementById('app-shell');
    const user = getCurrentUser();
    const isAuthRoute = route.path === '/login' || route.path === '/ganti-password';
    shell.classList.toggle('auth-only', isAuthRoute || !state.loggedIn);

    if (isAuthRoute || !state.loggedIn) return;

    const nav = document.getElementById('sidebar-nav');
    const pendingCount = getPendingVerificationCountFor(user);
    const draftCount = isAnyKoordinator(user)
      ? state.versions.filter((v) => {
          if (!['DRAF', 'DIKEMBALIKAN', 'MENUNGGU_VERIFIKASI'].includes(v.status)) return false;
          const doc = state.documents.find((d) => d.id === v.document_id);
          return doc && canEditUnit(user, doc.unit_id);
        }).length
      : 0;

    const myUnitDocCount = getMyUnitPublishedCount(user);
    const isMainDocActive = route.path === '/dokumen' || (route.path.startsWith('/dokumen/') && state.lastListRoute !== '/dokumen-unit');
    const isMyUnitDocActive = route.path === '/dokumen-unit' || (route.path.startsWith('/dokumen/') && state.lastListRoute === '/dokumen-unit');

    const groups = [
      {
        title: 'Regulasi Internal',
        items: [
          { href: '#/dokumen', label: 'Daftar Dokumen', icon: 'doc', active: isMainDocActive },
          { href: '#/dokumen-unit', label: 'Dokumen Unit Saya', icon: 'folder', count: myUnitDocCount, active: isMyUnitDocActive },
        ],
      },
    ];

    if (isAnyKoordinator(user)) {
      groups[0].items.push({
        href: '#/pengajuan',
        label: 'Pengajuan Unit',
        icon: 'edit',
        count: draftCount,
        active: route.path.startsWith('/pengajuan'),
      });
    }

    if (isAnyManajer(user)) {
      groups[0].items.push({
        href: '#/verifikasi',
        label: 'Verifikasi Manajer',
        icon: 'check',
        count: pendingCount,
        active: route.path.startsWith('/verifikasi'),
      });
    }

    if (isAnyKoordinator(user) || isAnyManajer(user)) {
      groups[0].items.push({
        href: '#/notifikasi',
        label: 'Notifikasi',
        icon: 'bell',
        count: getUnreadNotifications(user).length,
        active: route.path === '/notifikasi',
      });
    }

    if (user.is_super_admin) {
      groups.push({
        title: 'Administrasi Sistem',
        items: [
          { href: '#/admin/unit', label: 'Unit Kerja (34)', icon: 'building', active: route.path === '/admin/unit' },
          { href: '#/admin/pengguna', label: 'Pengguna', icon: 'users', active: route.path === '/admin/pengguna' },
          { href: '#/admin/koordinator', label: 'Penugasan Koordinator', icon: 'shield', active: route.path === '/admin/koordinator' },
          { href: '#/admin/manajer', label: 'Penugasan Manajer', icon: 'shield', active: route.path === '/admin/manajer' },
          { href: '#/admin/jenis-dokumen', label: 'Jenis Dokumen', icon: 'tag', active: route.path === '/admin/jenis-dokumen' },
        ],
      });
    }

    groups.push({
      title: 'Akun',
      items: [
        { href: '#/profil', label: 'Profil & Keamanan', icon: 'user', active: route.path === '/profil' },
      ],
    });

    nav.innerHTML = groups
      .map((g) => `
        <div class="nav-group">
          <div class="nav-group-title">${esc(g.title)}</div>
          ${g.items
            .map((it) => `
              <a href="${it.href}" class="nav-item ${it.active ? 'active' : ''}" ${it.active ? 'aria-current="page"' : ''}>
                <span class="nav-item-left">${iconSvg(it.icon)}<span>${esc(it.label)}</span></span>
                ${it.count > 0 ? `<span class="nav-count">${it.count}</span>` : ''}
              </a>
            `)
            .join('')}
        </div>
      `)
      .join('');

    updateNavPill(nav);

    // Topbar info
    const initials = user.nama.replace(/[^A-Z]/g, '').slice(0, 2) || 'RS';
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name-label').textContent = user.nama;
    const roles = getRolesSummary(user);
    const nonStaf = roles.filter((r) => r !== 'Staf');
    document.getElementById('user-role-label').textContent = nonStaf.length ? nonStaf[0] : 'Staf';

    const ctx = document.getElementById('topbar-context');
    ctx.innerHTML = `<span>RS AN-NISA</span><span>/</span><strong>${esc(route.title)}</strong>`;

    // Role switcher sync
    const roleSelect = document.getElementById('demo-role-select');
    if (roleSelect && user.demo_key) {
      roleSelect.value = user.demo_key;
      syncCustomSelect(roleSelect);
    }

    // Notification badge
    const unread = getUnreadNotifications(user);
    const badge = document.getElementById('notif-badge');
    badge.textContent = String(unread.length);
    badge.hidden = unread.length === 0;
  }

  function renderNotifPopover() {
    const user = getCurrentUser();
    const pop = document.getElementById('notif-popover');
    const list = state.notifications
      .filter((n) => (user.is_super_admin || n.user_id === user.id) && n.is_relevant)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6);

    pop.innerHTML = `
      <div class="notif-popover-header">
        <span>Notifikasi Terbaru</span>
        <button type="button" class="btn btn-ghost btn-compact" id="pop-mark-all">Tandai dibaca</button>
      </div>
      <div class="notif-popover-list">
        ${list.length
          ? list
              .map((n) => `
                <button type="button" class="notif-item ${n.is_read ? '' : 'unread'}" data-notif-id="${n.id}" data-url="${n.url}">
                  <div>${esc(n.pesan)}</div>
                  <span class="notif-item-time">${esc(formatTimestamp(n.created_at))}</span>
                </button>
              `)
              .join('')
          : '<div style="padding:18px;text-align:center;color:var(--text-secondary);font-size:var(--text-sm);">Belum ada notifikasi baru.</div>'}
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--border-subtle);text-align:right;">
        <a href="#/notifikasi" style="font-size:var(--text-sm);font-weight:600;color:var(--primary-text);text-decoration:none;">Lihat semua notifikasi</a>
      </div>
    `;

    pop.querySelectorAll('.notif-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nid = btn.getAttribute('data-notif-id');
        const url = btn.getAttribute('data-url');
        if (live) return writeAction('notifications/read', 'POST', { id: nid }, '', () => {
          pop.hidden = true;
          document.getElementById('notif-bell-btn').setAttribute('aria-expanded', 'false');
          navigate(url);
        });
        const item = state.notifications.find((n) => n.id === nid);
        if (item) item.is_read = true;
        pop.hidden = true;
        document.getElementById('notif-bell-btn').setAttribute('aria-expanded', 'false');
        navigate(url);
      });
    });

    const markAll = document.getElementById('pop-mark-all');
    if (markAll) {
      markAll.onclick = () => {
        if (live) return writeAction('notifications/read', 'POST', { all: true }, '', () => {
          renderNotifPopover();
          renderChrome(parseRoute());
        });
        state.notifications.forEach((n) => {
          if (user.is_super_admin || n.user_id === user.id) n.is_read = true;
        });
        renderNotifPopover();
        renderChrome(parseRoute());
      };
    }
  }

  // ---------- A4 PDF Sheet Renderer (PRD Section 5.2) ----------
  function renderAnnotatedText(text, field, index, annotations) {
    if (!live || !text) return esc(text);
    const spans = annotations.flatMap((annotation, number) => {
      if (annotation.field !== field || annotation.index !== index) return [];
      const { start, end, quote } = annotation;
      if (text.slice(start, end) === quote) return [{ start, end, number }];
      const found = text.indexOf(quote);
      return found !== -1 && text.indexOf(quote, found + 1) === -1
        ? [{ start: found, end: found + quote.length, number }] : [];
    });
    const breaks = [...new Set([0, text.length, ...spans.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);
    const content = breaks.slice(0, -1).map((start, i) => {
      const value = esc(text.slice(start, breaks[i + 1]));
      const active = spans.filter((span) => span.start <= start && span.end > start);
      return active.length
        ? `<mark class="review-marker" data-review-marks="${active.map(({ number }) => number).join(' ')}"
            title="${esc(active.map(({ number }) => annotations[number].note).join('\n'))}">${value}</mark>`
        : value;
    }).join('');
    return `<span class="review-text" data-review-field="${esc(field)}" data-review-index="${index ?? ''}">${content}</span>`;
  }

  const SPO_SECTION_LABELS = {
    PENGERTIAN: 'PENGERTIAN',
    TUJUAN: 'TUJUAN',
    KEBIJAKAN_REFERENSI: 'KEBIJAKAN',
    LANGKAH: 'PROSEDUR',
    UNIT_TERKAIT: 'UNIT TERKAIT',
    FORMULIR_PENDUKUNG: 'DOKUMEN PENDUKUNG',
  };

  function renderSpoSheet(version, doc, annotations = []) {
    const cat = getCategory(doc.category_id);
    const sections = version.sections || {};
    const secEntries = (version.template_sections || cat?.sections || []);
    const approver = sections.PEJABAT_PENETAP?.trim() || 'Dr. dr. Ediansyah, MARS';
    const issuedDate = formatDateID(version.tgl_berlaku || version.tgl_dokumen);
    const marked = (text, field, index = null) => renderAnnotatedText(text, field, index, annotations);

    const rowsHtml = secEntries
      .map((s) => {
        const spoLabel = SPO_SECTION_LABELS[s.code] || s.label.replace(/\s*\((?:dapat diurutkan|bila ada)\)\s*$/i, '').toUpperCase();
        const val = sections[s.code];
        if (s.code === 'FORMULIR_PENDUKUNG') {
          const hasText = Array.isArray(val) ? val.some((x) => x?.trim()) : Boolean(String(val || '').trim());
          if (!hasText) return '';
        }
        if (s.type === 'list') {
          const items = Array.isArray(val) && val.length ? val : ['Belum ada butir diisi.'];
          return `
            <tr data-section-label="${esc(spoLabel)}">
              <td class="a4-spo-sec-label">${esc(spoLabel)}</td>
              <td class="a4-spo-sec-body">
                <ol class="a4-spo-list">${items.map((item, i) => `<li>${Array.isArray(val) ? marked(item, s.code, i) : esc(item)}</li>`).join('')}</ol>
              </td>
            </tr>
          `;
        }
        return `
          <tr data-section-label="${esc(spoLabel)}">
            <td class="a4-spo-sec-label">${esc(spoLabel)}</td>
            <td class="a4-spo-sec-body"><p>${val ? marked(val, s.code) : 'Belum diisi.'}</p></td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="a4-sheet a4-sheet-spo" aria-label="Pratinjau dokumen SPO A4">
        <table class="a4-spo-table">
          <colgroup>
            <col style="width:24%;">
            <col style="width:35%;">
            <col style="width:17%;">
            <col style="width:24%;">
          </colgroup>
          <tr>
            <td rowspan="2" class="a4-spo-brand">
              <div>RS AN-NISA<br>TANGERANG</div>
              <img src="assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="44" height="58" class="a4-spo-logo" decoding="async">
            </td>
            <td colspan="3" class="a4-spo-title">${version.judul ? marked(version.judul, 'judul') : 'JUDUL DOKUMEN'}</td>
          </tr>
          <tr>
            <td class="a4-spo-meta-cell">
              <div>No.Dokumen</div>
              <div class="tabular">${version.nomor ? marked(version.nomor, 'nomor') : '-'}</div>
            </td>
            <td class="a4-spo-meta-cell">
              <div>No.Revisi</div>
              <div class="tabular">${version.revisi_label ? marked(version.revisi_label, 'revisi_label') : '00'}</div>
            </td>
            <td class="a4-spo-meta-cell">
              <div>Halaman</div>
              <div class="tabular">1/1</div>
            </td>
          </tr>
          <tr>
            <td class="a4-spo-type">STANDAR<br>PROSEDUR<br>OPERASIONAL</td>
            <td class="a4-spo-meta-cell">
              <div>Tanggal Terbit</div>
              <div class="tabular">${esc(issuedDate)}</div>
            </td>
            <td colspan="2" class="a4-spo-sign">
              <div>Ditetapkan,<br>Direktur RS</div>
              <div class="a4-spo-sign-space"></div>
              <div>${esc(approver)}</div>
            </td>
          </tr>
          ${rowsHtml}
        </table>
      </div>
    `;
  }

  function renderA4Sheet(version, doc, annotations = []) {
    const unit = getUnit(doc.unit_id);
    const cat = getCategory(doc.category_id);
    if (cat?.kode === 'SPO' || doc?.category_id === 'cat-spo') {
      return renderSpoSheet(version, doc, annotations);
    }
    const sections = version.sections || {};
    const secEntries = (version.template_sections || cat?.sections || []).filter(({ code }) =>
      !live || (code !== 'TEMPAT_TGL_PENETAPAN' && code !== 'PEJABAT_PENETAP'));
    const approver = live ? sections.PEJABAT_PENETAP : 'dr. Ahmad Fauzi, MARS';
    const approvalPlace = live ? sections.TEMPAT_TGL_PENETAPAN : 'Ditetapkan di Tangerang, ' + formatDateID(version.tgl_dokumen);
    const marked = (text, field, index = null) => renderAnnotatedText(text, field, index, annotations);

    return `
      <div class="a4-sheet" aria-label="Pratinjau dokumen PDF A4">
        <table class="a4-kop">
          <tr>
            <td rowspan="2" class="a4-kop-brand" style="width:28%;">
              <div class="a4-kop-brand-inner">
                <img src="assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="38" height="50" class="a4-logo" decoding="async">
                <div>RS AN-NISA</div>
                <div style="font-weight:500;color:var(--paper-muted);">Tangerang</div>
              </div>
            </td>
            <td rowspan="2" class="a4-doc-title" style="width:42%;">${version.judul ? marked(version.judul, 'judul') : 'Judul Dokumen'}</td>
            <td style="width:30%;"><strong>No. Dokumen:</strong> <span class="tabular">${version.nomor ? marked(version.nomor, 'nomor') : '-'}</span></td>
          </tr>
          <tr>
            <td><strong>No. Revisi:</strong> <span class="tabular">${version.revisi_label ? marked(version.revisi_label, 'revisi_label') : '00'}</span>${live ? '' : ' &middot; <strong>Hal:</strong> 1/1'}</td>
          </tr>
          <tr>
            <td><strong>Jenis:</strong> ${esc(cat ? cat.label : '-')}</td>
            <td><strong>Unit Pemilik:</strong> ${esc(unit ? unit.nama : '-')}</td>
            <td><strong>${live ? 'Mulai Berlaku' : 'Tanggal Terbit'}:</strong> <span class="tabular">${esc(formatDateID(version.tgl_berlaku))}</span></td>
          </tr>
        </table>

        ${secEntries
          .map((s) => {
            const pdfLabel = s.label.replace(/\s*\((?:dapat diurutkan|bila ada)\)\s*$/i, '');
            const val = sections[s.code];
            if (s.type === 'list') {
              const items = Array.isArray(val) && val.length ? val : ['Belum ada butir diisi.'];
              return `
                <div class="a4-section">
                  <h4>${esc(pdfLabel)}</h4>
                  <ol>${items.map((item, i) => `<li>${Array.isArray(val) ? marked(item, s.code, i) : esc(item)}</li>`).join('')}</ol>
                </div>
              `;
            }
            return `
              <div class="a4-section">
                <h4>${esc(pdfLabel)}</h4>
                <p>${val ? marked(val, s.code) : 'Belum diisi.'}</p>
              </div>
            `;
          })
          .join('')}

        ${approvalPlace || approver ? `<div class="a4-sign">
          <div class="a4-sign-box">
            <div class="tabular">${marked(approvalPlace, 'TEMPAT_TGL_PENETAPAN')}</div>
            ${live ? '' : '<div>Direktur RS AN-NISA</div>'}
            <div class="a4-sign-space"></div>
            <div><strong>${marked(approver, 'PEJABAT_PENETAP')}</strong></div>
          </div>
        </div>` : ''}

        <div class="a4-footer">
          <span>Unit: ${esc(unit ? unit.nama : '-')}</span>
          <span>Dokumen terkendali - JDIH RS AN-NISA</span>
        </div>
      </div>
    `;
  }

  function returnedAnnotations(version) {
    if (version.status !== 'DIKEMBALIKAN') return [];
    return state.reviewLogs.findLast((log) => log.version_id === version.id && log.aksi === 'KEMBALIKAN')?.annotations || [];
  }

  function renderAnnotationList(annotations, { jump = false, editable = false } = {}) {
    if (!annotations.length) return '';
    return `<ol class="review-notes">${annotations.map(({ quote, note }, index) => `
      <li>
        <blockquote>${esc(quote)}</blockquote>
        <p>${esc(note)}</p>
        ${jump || editable ? `<div class="review-note-actions">
          ${jump ? `<button type="button" class="btn btn-ghost btn-compact" data-jump-note="${index}">Lihat sorotan</button>` : ''}
          ${editable ? `
            <button type="button" class="btn btn-ghost btn-compact" data-edit-note="${index}">Edit catatan</button>
            <button type="button" class="btn btn-ghost btn-compact" data-remove-note="${index}">Hapus catatan</button>
          ` : ''}
        </div>` : ''}
      </li>`).join('')}</ol>`;
  }

  function bindAnnotationJumps(stage) {
    stage.addEventListener('click', (event) => {
      const index = event.target.closest('[data-jump-note]')?.dataset.jumpNote;
      if (index === undefined) return;
      const mark = stage.querySelector(`[data-review-marks~="${index}"]`);
      if (!mark) {
        showToast('Kutipan ini sudah berubah. Catatan aslinya tetap tersedia.', 'error');
        return;
      }
      mark.tabIndex = -1;
      mark.focus({ preventScroll: true });
      mark.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
    });
  }

  function annotationTarget(element) {
    return {
      field: element.dataset.reviewField,
      index: element.dataset.reviewIndex === '' ? null : Number(element.dataset.reviewIndex),
    };
  }

  function readAnnotationSelection(preview) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const findSpan = (node) => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('[data-review-field]');
    const element = findSpan(range.startContainer);
    if (!element || !preview.contains(element) || findSpan(range.endContainer) !== element) return null;
    const before = document.createRange();
    before.selectNodeContents(element);
    before.setEnd(range.startContainer, range.startOffset);
    const quote = range.toString();
    const start = before.toString().length;
    return quote.trim() ? { ...annotationTarget(element), start, end: start + quote.length, quote } : null;
  }

  function initReviewAnnotations(stage, version, doc, annotations) {
    const preview = stage.querySelector('#review-annotation-preview');
    const list = stage.querySelector('#review-annotation-list');
    const pencil = stage.querySelector('#add-review-annotation');
    const choosePart = stage.querySelector('#choose-review-part');
    const help = stage.querySelector('#review-annotation-help');
    const { signal } = reviewSelectionEvents = new AbortController();
    const defaultHelp = help.textContent;
    let armed = false;
    let dragging = false;
    let selectionTimer;
    let recentSelection = null;
    const setArmed = (value) => {
      armed = value;
      clearTimeout(selectionTimer);
      pencil.setAttribute('aria-pressed', String(value));
      choosePart.hidden = !value;
      help.textContent = value ? 'Blok teks di pratinjau untuk membuka form catatan.' : defaultHelp;
    };
    signal.addEventListener('abort', () => clearTimeout(selectionTimer), { once: true });
    const render = () => {
      preview.innerHTML = renderPdfPreview(version, doc, annotations);
      list.innerHTML = renderAnnotationList(annotations, { jump: true, editable: true });
    };
    const openNote = async (selection, editIndex = null) => {
      const editing = editIndex !== null;
      if (!editing && annotations.length >= 20) return showToast('Maksimal 20 catatan sorotan.', 'error');
      if (selection?.quote.length > 350) return showToast('Pilih teks maksimal 350 karakter.', 'error');
      setArmed(false);
      recentSelection = null;
      window.getSelection()?.removeAllRanges();
      const parts = [...preview.querySelectorAll('[data-review-field]')].filter((node) => node.textContent.trim());
      const res = await openDialog({
        title: editing ? 'Edit Catatan' : 'Catatan pada Pratinjau',
        bodyHtml: selection ? `<blockquote class="review-quote">${esc(selection.quote)}</blockquote>`
          : `<div class="field"><label for="annotation-part">Bagian yang ditandai</label>
             <select class="input" id="annotation-part">${parts.map((node, i) => {
              const heading = node.closest('.a4-section')?.querySelector('h4')?.textContent
                || node.closest('[data-section-label]')?.dataset.sectionLabel;
              const text = node.textContent.trim();
              return `<option value="${i}">${esc((heading ? heading + ' · ' : '') + text.slice(0, 80))}${text.length > 80 ? '…' : ''}</option>`;
            }).join('')}</select></div>`,
        confirmLabel: editing ? 'Simpan Catatan' : 'Tambah Catatan',
        requireNote: true,
        noteMaxLength: 500,
        noteValue: editing ? selection.note : '',
      });
      if (signal.aborted) return;
      if (editing) {
        if (res) {
          annotations[editIndex].note = res.note;
          render();
          showToast('Catatan diperbarui.');
        }
        list.querySelector(`[data-edit-note="${editIndex}"]`)?.focus({ preventScroll: true });
        return;
      }
      pencil.focus({ preventScroll: true });
      if (!res) return;
      const chosen = parts[Number(document.getElementById('annotation-part')?.value)];
      const target = selection || (chosen && { ...annotationTarget(chosen), start: 0,
        end: Math.min(chosen.textContent.length, 350), quote: chosen.textContent.slice(0, 350) });
      if (!target?.quote.trim()) return showToast('Pilih bagian yang ingin diberi catatan.', 'error');
      annotations.push({ ...target, note: res.note });
      render();
      showToast('Catatan ditambahkan.');
    };
    pencil.onclick = () => {
      if (armed) return setArmed(false);
      if (annotations.length >= 20) return showToast('Maksimal 20 catatan sorotan.', 'error');
      const selection = readAnnotationSelection(preview) || recentSelection;
      if (selection && selection.quote.length <= 350) return openNote(selection);
      setArmed(true);
      if (selection) showToast('Pilih teks maksimal 350 karakter.', 'error');
    };
    choosePart.onclick = () => openNote(null);

    const finishSelection = () => {
      clearTimeout(selectionTimer);
      if (!armed || dragging || document.getElementById('confirm-dialog').open) return;
      const selection = readAnnotationSelection(preview);
      if (selection) openNote(selection);
    };
    document.addEventListener('pointerdown', (event) => {
      clearTimeout(selectionTimer);
      dragging = event.pointerType !== 'touch' && preview.contains(event.target);
      if (event.target !== pencil && !pencil.contains(event.target)) recentSelection = null;
    }, { signal });
    document.addEventListener('pointerup', (event) => {
      if (!dragging) return;
      dragging = false;
      if (event.button === 0) finishSelection();
    }, { signal });
    document.addEventListener('pointercancel', () => { dragging = false; }, { signal });
    document.addEventListener('selectionchange', () => {
      const selection = readAnnotationSelection(preview);
      clearTimeout(selectionTimer);
      if (!selection) return;
      recentSelection = selection;
      if (armed && !dragging) selectionTimer = setTimeout(finishSelection, 300);
    }, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && armed) setArmed(false);
    }, { signal });
    stage.addEventListener('click', (event) => {
      const editIndex = event.target.closest('[data-edit-note]')?.dataset.editNote;
      if (editIndex !== undefined) return openNote(annotations[editIndex], Number(editIndex));
      const index = event.target.closest('[data-remove-note]')?.dataset.removeNote;
      if (index !== undefined) {
        annotations.splice(Number(index), 1);
        render();
        stage.querySelector('#add-review-annotation').focus();
      }
    });
    bindAnnotationJumps(stage);
  }

  // ---------- Views ----------
  function viewDaftarDokumen(options = {}) {
    const { myUnitsOnly = false } = options;
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    state.lastListRoute = myUnitsOnly ? '/dokumen-unit' : '/dokumen';
    const f = myUnitsOnly ? state.myUnitDocFilters : state.docFilters;

    const myUnitIds = myUnitsOnly ? getMyUnitIds(user) : [];
    const myUnits = myUnitsOnly ? myUnitIds.map((id) => getUnit(id)).filter(Boolean) : [];
    const availableUnits = myUnitsOnly ? myUnits : state.units.filter((u) => u.is_active);
    if (myUnitsOnly && f.unitId && !myUnitIds.includes(f.unitId)) {
      f.unitId = '';
    }
    const showUnitFilter = !myUnitsOnly || myUnits.length > 1;

    const publishedDocs = state.documents
      .map((doc) => {
        if (myUnitsOnly && !myUnitIds.includes(doc.unit_id)) return null;
        const pub = getPrimaryPublishedVersion(doc.id);
        if (!pub) return null;
        return { doc, version: pub.version, eff: pub.eff };
      })
      .filter(Boolean);

    const filtered = publishedDocs
      .filter(({ doc, version }) => {
        if (!f.showInactive && doc.status_aktif !== 'AKTIF') return false;
        if (f.unitId && doc.unit_id !== f.unitId) return false;
        if (f.categoryId && doc.category_id !== f.categoryId) return false;
        if (f.q.trim()) {
          const q = f.q.trim().toLowerCase();
          const hay = `${version.judul} ${version.nomor} ${version.kata_kunci || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmpJudul = () => (a.version.judul || '').localeCompare(b.version.judul || '', 'id', { sensitivity: 'base' });
        switch (f.sortBy) {
          case 'TERLAMA': {
            const d = (a.version.tgl_berlaku || '').localeCompare(b.version.tgl_berlaku || '');
            return d !== 0 ? d : cmpJudul();
          }
          case 'JUDUL_ASC':
            return cmpJudul();
          case 'NOMOR_ASC': {
            const n = (a.version.nomor || '').localeCompare(b.version.nomor || '', 'id', { numeric: true, sensitivity: 'base' });
            return n !== 0 ? n : cmpJudul();
          }
          case 'UNIT_ASC': {
            const ua = getUnit(a.doc.unit_id)?.nama || '';
            const ub = getUnit(b.doc.unit_id)?.nama || '';
            const u = ua.localeCompare(ub, 'id', { sensitivity: 'base' });
            return u !== 0 ? u : cmpJudul();
          }
          case 'TERBARU':
          default: {
            const d = (b.version.tgl_berlaku || '').localeCompare(a.version.tgl_berlaku || '');
            return d !== 0 ? d : cmpJudul();
          }
        }
      });

    const totalPages = Math.max(1, Math.ceil(filtered.length / f.pageSize));
    if (f.page > totalPages) f.page = totalPages;
    const start = (f.page - 1) * f.pageSize;
    const rows = filtered.slice(start, start + f.pageSize);

    const pageTitle = myUnitsOnly ? 'Dokumen Unit Saya' : 'Daftar Dokumen Regulasi';
    const pageSubtitle = myUnitsOnly
      ? (myUnits.length ? myUnits.map((u) => u.nama).join(' · ') : 'Belum ada unit kerja yang terhubung ke akun Anda.')
      : 'Regulasi terbit dari seluruh unit RS AN-NISA.';
    const hasActiveFilters = Boolean(f.q.trim() || f.unitId || f.categoryId || f.showInactive);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${esc(pageTitle)}</h1>
          <p class="page-subtitle">${esc(pageSubtitle)}</p>
        </div>
        <div class="page-actions">
          ${myUnitsOnly ? `<a href="#/dokumen" class="btn btn-secondary">Lihat semua unit</a>` : ''}
          ${isAnyKoordinator(user) ? `<a href="#/pengajuan/baru" class="btn btn-primary">${iconSvg('plus')}<span>Buat Dokumen</span></a>` : ''}
        </div>
      </div>

      <section class="surface-panel" aria-labelledby="document-filters-title">
        <h2 class="section-heading" id="document-filters-title">Pencarian dan filter</h2>
        <div class="filter-bar${showUnitFilter ? '' : ' filter-bar-3'}">
          <div class="field">
            <label for="doc-search-input">Cari judul, nomor, atau kata kunci</label>
            <input id="doc-search-input" class="input" type="search" value="${esc(f.q)}" placeholder="Contoh: triase, RSAN/SPO/5/DTO/007, high alert">
          </div>
          ${showUnitFilter ? `
            <div class="field">
              <label for="doc-unit-filter">Unit kerja</label>
              <select id="doc-unit-filter" class="select">
                <option value="">${myUnitsOnly ? 'Semua unit saya' : 'Semua unit'} (${availableUnits.length})</option>
                ${availableUnits.map((u) => `<option value="${u.id}" ${f.unitId === u.id ? 'selected' : ''}>${esc(u.nama)}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          <div class="field">
            <label for="doc-cat-filter">Jenis dokumen</label>
            <select id="doc-cat-filter" class="select">
              <option value="">Semua jenis</option>
              ${state.categories.map((c) => `<option value="${c.id}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="doc-sort-filter">Urutkan</label>
            <select id="doc-sort-filter" class="select">
              <option value="TERBARU" ${f.sortBy === 'TERBARU' ? 'selected' : ''}>Berlaku terbaru</option>
              <option value="TERLAMA" ${f.sortBy === 'TERLAMA' ? 'selected' : ''}>Berlaku terlama</option>
              <option value="JUDUL_ASC" ${f.sortBy === 'JUDUL_ASC' ? 'selected' : ''}>Judul (A-Z)</option>
              <option value="NOMOR_ASC" ${f.sortBy === 'NOMOR_ASC' ? 'selected' : ''}>Nomor dokumen</option>
              <option value="UNIT_ASC" ${f.sortBy === 'UNIT_ASC' ? 'selected' : ''}>Unit kerja (A-Z)</option>
            </select>
          </div>
          <div class="field">
            <button type="button" class="btn btn-secondary" id="doc-reset-filter">Atur Ulang</button>
          </div>
        </div>

        <div class="filter-subrow">
          <label class="checkbox-row">
            <input type="checkbox" id="doc-show-inactive" ${f.showInactive ? 'checked' : ''}>
            <span>Tampilkan tidak aktif</span>
          </label>
        </div>
      </section>

      <section class="surface-panel" aria-labelledby="document-results-title">
        <div class="document-results-header">
          <h2 class="section-heading" id="document-results-title">${hasActiveFilters ? 'Hasil filter' : myUnitsOnly ? 'Regulasi unit saya' : 'Regulasi seluruh unit'}</h2>
          <span class="tabular"><strong>${filtered.length}</strong> dokumen</span>
        </div>

        ${f.loading ? `
          <div aria-busy="true" aria-label="Memuat daftar dokumen">
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
            <div class="skeleton-row"></div>
          </div>
        ` : myUnitsOnly && myUnits.length === 0 ? `
          <div class="empty-state">
            ${iconSvg('folder')}
            <h3>Unit kerja belum terhubung</h3>
            <p>Akun Anda belum memiliki unit kerja yang terdaftar. Anda tetap dapat melihat seluruh regulasi di Daftar Dokumen.</p>
            <a href="#/dokumen" class="btn btn-secondary">Buka Daftar Dokumen</a>
          </div>
        ` : rows.length === 0 ? `
          <div class="empty-state">
            ${iconSvg('doc')}
            <h3>Dokumen tidak ditemukan</h3>
            <p>${myUnitsOnly && !hasActiveFilters
              ? 'Belum ada dokumen terbit untuk unit Anda. Anda dapat menelusuri regulasi unit lain di Daftar Dokumen.'
              : 'Coba ubah kata kunci pencarian atau hapus sebagian filter unit dan jenis.'}</p>
            ${myUnitsOnly && !hasActiveFilters
              ? '<a href="#/dokumen" class="btn btn-secondary">Buka Daftar Dokumen</a>'
              : '<button type="button" class="btn btn-secondary" id="empty-reset-btn">Tampilkan Semua Dokumen</button>'}
          </div>
        ` : `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Nomor</th>
                  <th>Unit</th>
                  <th>Jenis</th>
                  <th>Revisi</th>
                  <th>Tanggal Berlaku</th>
                  <th>Status Keberlakuan</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(({ doc, version, eff }) => {
                    const unit = getUnit(doc.unit_id);
                    const cat = getCategory(doc.category_id);
                    return `
                      <tr>
                        <td>
                          <a href="#/dokumen/${doc.id}" class="table-title-link">${esc(version.judul)}</a>
                          <div class="table-sub">Kata kunci: ${esc(version.kata_kunci || '-')}</div>
                        </td>
                        <td class="tabular">${esc(version.nomor)}</td>
                        <td>${esc(unit ? unit.nama : '-')}</td>
                        <td>${esc(cat ? cat.label : '-')}</td>
                        <td class="tabular">Rev ${esc(version.revisi_label)}</td>
                        <td class="tabular">${esc(formatDateID(version.tgl_berlaku))}</td>
                        <td>
                          ${doc.status_aktif === 'TIDAK_AKTIF'
                            ? '<span class="status-pill status-danger">Tidak Aktif</span>'
                            : `<span class="status-pill status-${eff.tone}">${esc(eff.label)}</span>`}
                        </td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="pagination-bar">
            <div class="pagination-controls">
              <label for="doc-pagesize">Baris per halaman</label>
              <select id="doc-pagesize" class="select" style="width:auto;min-height:36px;">
                ${[10, 25, 50].map((n) => `<option value="${n}" ${f.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
            <div class="pagination-controls">
              <button type="button" class="btn btn-secondary btn-compact" id="doc-prev-page" ${f.page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
              <span class="tabular">Halaman ${f.page} dari ${totalPages}</span>
              <button type="button" class="btn btn-secondary btn-compact" id="doc-next-page" ${f.page >= totalPages ? 'disabled' : ''}>Berikutnya</button>
            </div>
          </div>
        `}
      </section>

      <div class="bottom-action-bar">
        <button type="button" class="btn btn-secondary" id="sim-skeleton-btn">Simulasi Muat Data</button>
      </div>
    `;

    const searchInput = document.getElementById('doc-search-input');
    searchInput.addEventListener('input', (e) => {
      f.q = e.target.value;
      f.page = 1;
      viewDaftarDokumen({ myUnitsOnly });
      const restored = document.getElementById('doc-search-input');
      restored.focus();
      restored.setSelectionRange(restored.value.length, restored.value.length);
    });
    const unitFilterEl = document.getElementById('doc-unit-filter');
    if (unitFilterEl) unitFilterEl.onchange = (e) => { f.unitId = e.target.value; f.page = 1; viewDaftarDokumen({ myUnitsOnly }); };
    document.getElementById('doc-cat-filter').onchange = (e) => { f.categoryId = e.target.value; f.page = 1; viewDaftarDokumen({ myUnitsOnly }); };
    document.getElementById('doc-sort-filter').onchange = (e) => { f.sortBy = e.target.value; f.page = 1; viewDaftarDokumen({ myUnitsOnly }); };
    document.getElementById('doc-show-inactive').onchange = (e) => { f.showInactive = e.target.checked; f.page = 1; viewDaftarDokumen({ myUnitsOnly }); };
    document.getElementById('doc-reset-filter').onclick = () => {
      const fresh = { q: '', unitId: '', categoryId: '', sortBy: 'TERBARU', showInactive: false, pageSize: f.pageSize, page: 1, loading: false };
      if (myUnitsOnly) state.myUnitDocFilters = fresh;
      else state.docFilters = fresh;
      viewDaftarDokumen({ myUnitsOnly });
    };
    const emptyReset = document.getElementById('empty-reset-btn');
    if (emptyReset) emptyReset.onclick = () => document.getElementById('doc-reset-filter').click();

    document.getElementById('sim-skeleton-btn').onclick = () => {
      f.loading = true;
      viewDaftarDokumen({ myUnitsOnly });
      setTimeout(() => { f.loading = false; viewDaftarDokumen({ myUnitsOnly }); }, 650);
    };

    const ps = document.getElementById('doc-pagesize');
    if (ps) ps.onchange = (e) => { f.pageSize = Number(e.target.value); f.page = 1; viewDaftarDokumen({ myUnitsOnly }); };
    const prev = document.getElementById('doc-prev-page');
    if (prev) prev.onclick = () => { if (f.page > 1) { f.page--; viewDaftarDokumen({ myUnitsOnly }); } };
    const next = document.getElementById('doc-next-page');
    if (next) next.onclick = () => { if (f.page < totalPages) { f.page++; viewDaftarDokumen({ myUnitsOnly }); } };

    enhanceSelects(main);
  }

  function viewDetailDokumen(docId) {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    const doc = state.documents.find((d) => d.id === docId);
    if (!doc) {
      navigate('#/dokumen');
      return;
    }

    const published = state.versions
      .filter((v) => v.document_id === docId && v.status === 'DISETUJUI')
      .sort((a, b) => b.tgl_berlaku.localeCompare(a.tgl_berlaku));

    if (!published.length) {
      // Staf cannot view unpublished draft via direct URL (PRD UAT-02)
      if (!canEditUnit(user, doc.unit_id) && !canVerifyUnit(user, doc.unit_id)) {
        navigate('#/403');
        return;
      }
      const openVer = getOpenRevision(docId);
      if (openVer) {
        navigate(`#/pengajuan/${openVer.id}`);
        return;
      }
    }

    const { map, currentBerlakuId } = computeEffectiveStatuses(docId);
    const activeVersion =
      published.find((v) => v.id === state.selectedDetailVersionId) ||
      published.find((v) => v.id === currentBerlakuId) ||
      published[0];
    state.selectedDetailVersionId = activeVersion.id;

    const unit = getUnit(doc.unit_id);
    const cat = getCategory(doc.category_id);
    const canManage = canEditUnit(user, doc.unit_id);
    const openRev = getOpenRevision(docId);
    const eff = map.get(activeVersion.id);
    const canUploadScanOnDetail = canManage && activeVersion.metode === 'TEMPLATE';
    const detailScanAtt = getScanPdfAttachment(activeVersion);
    const detailScanUrl = getScanPdfUrl(activeVersion);
    const detailPreviewMode = getActivePreviewMode(activeVersion);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <a href="#${esc(state.lastListRoute || '/dokumen')}" class="btn btn-ghost btn-compact" style="margin-bottom:8px;">${iconSvg('arrowLeft')}<span>${state.lastListRoute === '/dokumen-unit' ? 'Kembali ke Dokumen Unit Saya' : 'Kembali ke Daftar Dokumen'}</span></a>
          <h1 class="page-title">${esc(activeVersion.judul)}</h1>
          <p class="page-subtitle tabular">${esc(activeVersion.nomor)} · Revisi ${esc(activeVersion.revisi_label)} · ${esc(unit ? unit.nama : '-')}</p>
        </div>
      </div>

      ${doc.status_aktif === 'TIDAK_AKTIF' ? `
        <div class="notice-banner danger" role="status">
          <div>
            <strong>Dokumen berstatus Tidak Aktif sejak ${esc(formatDateID(doc.tgl_tidak_aktif))}</strong>
            <p>Alasan penonaktifan: ${esc(doc.alasan_tidak_aktif)}</p>
          </div>
        </div>
      ` : ''}

      ${openRev && canManage ? `
        <div class="notice-banner warning" role="status">
          <div>
            <strong>Terdapat revisi terbuka (Rev ${esc(openRev.revisi_label)} - ${esc(getStatusBadge(openRev.status).label)})</strong>
            <p>Satu dokumen induk hanya mengizinkan satu revisi terbuka pada satu waktu.</p>
          </div>
          <a href="#/pengajuan/${openRev.id}" class="btn btn-secondary btn-compact">Buka Draf Revisi</a>
        </div>
      ` : ''}

      <div class="workbench-grid">
        <div>
          <section class="surface-panel">
            <h2 class="section-heading">Metadata Versi Terpilih</h2>
            <dl class="meta-dl">
              <div><dt>Nomor Dokumen</dt><dd class="tabular">${esc(activeVersion.nomor)}</dd></div>
              <div><dt>Unit Pemilik</dt><dd>${esc(unit ? unit.nama : '-')}</dd></div>
              <div><dt>Jenis Dokumen</dt><dd>${esc(cat ? cat.label : '-')}</dd></div>
              <div><dt>Label Revisi</dt><dd class="tabular">Rev ${esc(activeVersion.revisi_label)}</dd></div>
              <div><dt>Tanggal Dokumen</dt><dd class="tabular">${esc(formatDateID(activeVersion.tgl_dokumen))}</dd></div>
              <div><dt>Tanggal Mulai Berlaku</dt><dd class="tabular">${esc(formatDateID(activeVersion.tgl_berlaku))}</dd></div>
              <div><dt>Status Keberlakuan</dt><dd><span class="status-pill status-${eff.tone}">${esc(eff.label)}</span></dd></div>
              <div><dt>Status Dokumen Induk</dt><dd><span class="status-pill status-${doc.status_aktif === 'AKTIF' ? 'success' : 'danger'}">${doc.status_aktif === 'AKTIF' ? 'Aktif' : 'Tidak Aktif'}</span></dd></div>
              <div><dt>Kata Kunci</dt><dd>${esc(activeVersion.kata_kunci || '-')}</dd></div>
              <div><dt>Disetujui Oleh</dt><dd>${esc(getUser(activeVersion.approved_by)?.nama || '-')}</dd></div>
            </dl>
            <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle);">
              <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:4px;">Ringkasan Perubahan</div>
              <div>${esc(activeVersion.ringkasan_perubahan || '-')}</div>
            </div>
            ${(activeVersion.attachments?.length || canUploadScanOnDetail) ? `
              <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle);">
                <div class="scan-upload-head" style="margin-bottom:8px;">
                  <div style="font-size:var(--text-sm);color:var(--text-secondary);">Lampiran &amp; Berkas PDF Hasil Scan</div>
                  ${canUploadScanOnDetail ? `
                    <label class="btn btn-secondary btn-compact">${iconSvg('upload')}<span>${detailScanAtt || detailScanUrl ? 'Ganti PDF Hasil Scan' : 'Unggah PDF Hasil Scan'}</span><input type="file" accept=".pdf,application/pdf" id="detail-scan-upload-input" class="file-picker"></label>
                  ` : ''}
                </div>
                ${state.uploadSim.status === 'UPLOADING' ? `
                  <div class="upload-zone" role="status" style="margin-bottom:10px;">
                    <p style="margin:0;">Mengunggah ${esc(state.uploadSim.fileName)} (${state.uploadSim.progress}%)</p>
                    <div class="progress-track"><div class="progress-fill" style="width:${state.uploadSim.progress}%"></div></div>
                  </div>
                ` : ''}
                ${(activeVersion.attachments || []).map((att) => {
                  const isScanPdf = att.kind === 'PDF' || (!live && activeVersion.metode === 'UPLOAD' && /\.pdf$/i.test(att.nama || ''));
                  return `
                    <div class="upload-file-row">
                      <span>${attachmentLink(activeVersion, att)} <span class="tabular" style="color:var(--text-secondary);">(${esc(att.ukuran)})</span></span>
                      ${isScanPdf ? `<div class="upload-file-actions">
                        <button type="button" class="btn btn-secondary btn-compact" data-open-scan-preview>Pratinjau</button>
                        ${canUploadScanOnDetail ? `<button type="button" class="btn btn-danger btn-compact" data-delete-scan-pdf>${iconSvg('trash')}<span>Hapus</span></button>` : ''}
                      </div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}
          </section>

          <section class="surface-panel">
            <h2 class="section-heading">Riwayat Versi (${published.length})</h2>
            <ul class="timeline">
              ${published
                .map((v) => {
                  const ve = map.get(v.id);
                  const selected = v.id === activeVersion.id;
                  return `
                    <li class="timeline-item ${selected ? 'selected' : ''}" data-ver-id="${v.id}" tabindex="0" role="button" aria-pressed="${selected}">
                      <div class="timeline-top">
                        <strong class="tabular">Revisi ${esc(v.revisi_label)} - ${esc(v.nomor)}</strong>
                        <span class="status-pill status-${ve.tone}">${esc(ve.label)}</span>
                      </div>
                      <div class="timeline-meta tabular">Berlaku: ${esc(formatDateID(v.tgl_berlaku))} · Disetujui: ${esc(formatTimestamp(v.approved_at))}</div>
                      <div style="margin-top:4px;font-size:var(--text-sm);">${esc(v.ringkasan_perubahan)}</div>
                    </li>
                  `;
                })
                .join('')}
            </ul>
          </section>
        </div>

        <section class="pdf-stage" id="detail-preview-stage" aria-label="Pratinjau berkas PDF">
          <div class="pdf-stage-bar">
            <span>${detailPreviewMode === 'SCAN' ? 'Pratinjau PDF Hasil Scan' : 'Pratinjau Dokumen'}</span>
            ${renderPreviewModeToggle(activeVersion)}
          </div>
          ${renderDocumentPreview(activeVersion, doc, [], { canUploadScan: canUploadScanOnDetail })}
        </section>
      </div>

      <div class="bottom-action-bar">
        <button type="button" class="btn btn-secondary" id="detail-download-btn">${iconSvg('download')}<span>${detailPreviewMode === 'SCAN' && detailScanAtt ? 'Unduh PDF Hasil Scan' : 'Unduh PDF'}</span></button>
        ${canManage && doc.status_aktif === 'AKTIF' ? `<button type="button" class="btn btn-primary" id="detail-revisi-btn">Buat Revisi</button>` : ''}
        ${canManage ? `<button type="button" class="btn ${doc.status_aktif === 'AKTIF' ? 'btn-danger' : 'btn-secondary'}" id="detail-toggle-aktif-btn">${doc.status_aktif === 'AKTIF' ? 'Nonaktifkan Dokumen' : 'Aktifkan Kembali'}</button>` : ''}
      </div>
    `;

    main.querySelectorAll('[data-preview-mode]').forEach((btn) => {
      btn.onclick = () => {
        state.previewModeByVersion[activeVersion.id] = btn.getAttribute('data-preview-mode');
        viewDetailDokumen(docId);
      };
    });

    main.querySelectorAll('[data-open-scan-preview]').forEach((btn) => {
      btn.onclick = () => {
        state.previewModeByVersion[activeVersion.id] = 'SCAN';
        viewDetailDokumen(docId);
        document.getElementById('detail-preview-stage')?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
      };
    });
    main.querySelectorAll('[data-delete-scan-pdf]').forEach((btn) => {
      btn.onclick = () => deleteScanPdf(activeVersion, {
        preserveDraft: false,
        onRefresh: () => viewDetailDokumen(docId),
      });
    });

    const detailScanInput = document.getElementById('detail-scan-upload-input');
    if (detailScanInput) {
      detailScanInput.onchange = () => uploadFile(activeVersion, detailScanInput.files[0], 'PDF', {
        onRefresh: () => viewDetailDokumen(docId),
      });
    }
    const stageScanInput = main.querySelector('[data-scan-upload-input]');
    if (stageScanInput) {
      stageScanInput.onchange = () => uploadFile(activeVersion, stageScanInput.files[0], 'PDF', {
        onRefresh: () => viewDetailDokumen(docId),
      });
    }

    main.querySelectorAll('.timeline-item').forEach((el) => {
      const pick = () => {
        state.selectedDetailVersionId = el.getAttribute('data-ver-id');
        viewDetailDokumen(docId);
      };
      el.onclick = pick;
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      };
    });

    document.getElementById('detail-download-btn').onclick = () => {
      if (live) {
        const useScan = getActivePreviewMode(activeVersion) === 'SCAN' && Boolean(getScanPdfAttachment(activeVersion));
        window.location.assign(fileUrl(activeVersion, useScan ? 'scan' : 'pdf', true));
        return;
      }
      showToast(`Mengunduh ${sanitizeDownloadName(activeVersion)}`, 'success');
    };

    const revBtn = document.getElementById('detail-revisi-btn');
    if (revBtn) {
      revBtn.onclick = () => {
        if (openRev) {
          showToast('Sudah ada revisi terbuka. Mengarahkan ke draf revisi.', 'error');
          navigate(`#/pengajuan/${openRev.id}`);
          return;
        }
        const nextNum = String(Number(published[0].revisi_label || 0) + 1).padStart(2, '0');
        if (live) return writeAction('documents/' + doc.id + '/revisions', 'POST', {}, 'Draf revisi dibuat.',
          ({ versionId }) => navigate('#/pengajuan/' + versionId));
        const newVerId = `ver-${Date.now()}`;
        state.versions.push({
          id: newVerId,
          document_id: doc.id,
          revisi_label: nextNum,
          judul: published[0].judul,
          nomor: published[0].nomor,
          tgl_dokumen: state.today,
          tgl_berlaku: state.today,
          kata_kunci: published[0].kata_kunci,
          ringkasan_perubahan: '',
          metode: published[0].metode,
          status: 'DRAF',
          template_version: getCategory(doc.category_id)?.template_version || 1,
          edit_version: 1,
          created_by: user.id,
          submitted_at: null,
          approved_by: null,
          approved_at: null,
          sections: structuredClone(published[0].sections),
          attachments: [],
        });
        showToast(`Draf revisi ${nextNum} dibuat dari versi berlaku.`, 'success');
        navigate(`#/pengajuan/${newVerId}`);
      };
    }

    const toggleBtn = document.getElementById('detail-toggle-aktif-btn');
    if (toggleBtn) {
      toggleBtn.onclick = async () => {
        if (openRev) {
          showToast('Selesaikan atau hapus revisi terbuka terlebih dahulu.', 'error');
          return;
        }
        const activating = doc.status_aktif !== 'AKTIF';
        const res = await openDialog({
          title: activating ? 'Aktifkan Kembali Dokumen' : 'Nonaktifkan Dokumen',
          bodyHtml: activating
            ? `<p>Dokumen <strong>${esc(activeVersion.judul)}</strong> akan tampil kembali di pencarian bawaan staf.</p>`
            : `<p>Dokumen <strong>${esc(activeVersion.judul)}</strong> akan disembunyikan dari pencarian bawaan tanpa persetujuan Manajer.</p>`,
          confirmLabel: activating ? 'Aktifkan Dokumen' : 'Nonaktifkan Dokumen',
          confirmTone: activating ? 'primary' : 'danger',
          requireNote: true,
          noteLabel: activating ? 'Alasan pengaktifan kembali' : 'Alasan penonaktifan',
          notePlaceholder: activating ? 'Contoh: Regulasi kembali diberlakukan.' : 'Contoh: Dicabut dan tidak digunakan lagi.',
        });
        if (!res) return;
        if (live) return writeAction('documents/' + doc.id + '/status', 'POST',
          { status_aktif: activating ? 'AKTIF' : 'TIDAK_AKTIF', alasan: res.note },
          'Status dokumen diperbarui.', () => renderRoute());
        doc.status_aktif = activating ? 'AKTIF' : 'TIDAK_AKTIF';
        doc.alasan_tidak_aktif = activating ? '' : res.note;
        doc.tgl_tidak_aktif = activating ? '' : state.today;
        state.documentLogs.push({
          id: `dl-${Date.now()}`,
          document_id: doc.id,
          user_id: user.id,
          aksi: activating ? 'AKTIFKAN' : 'NONAKTIFKAN',
          alasan: res.note,
          created_at: `${state.today} 10:15`,
        });
        showToast(activating ? 'Dokumen diaktifkan kembali.' : 'Dokumen dinonaktifkan.', 'success');
        viewDetailDokumen(docId);
      };
    }
  }

  function viewPengajuanUnit() {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    if (!isAnyKoordinator(user)) {
      navigate('#/403');
      return;
    }

    const items = state.versions
      .filter((v) => {
        if (v.status === 'DIHAPUS' || v.status === 'DISETUJUI') return false;
        const doc = state.documents.find((d) => d.id === v.document_id);
        return doc && canEditUnit(user, doc.unit_id);
      })
      .filter((v) => state.pengajuanFilter === 'SEMUA' || v.status === state.pengajuanFilter)
      .sort((a, b) => {
        const cmpJudul = () => (a.judul || '').localeCompare(b.judul || '', 'id', { sensitivity: 'base' });
        const cmpTerbaru = () => (b.submitted_at || b.tgl_dokumen || '').localeCompare(a.submitted_at || a.tgl_dokumen || '');
        switch (state.pengajuanSort) {
          case 'TERLAMA': {
            const d = (a.submitted_at || a.tgl_dokumen || '').localeCompare(b.submitted_at || b.tgl_dokumen || '');
            return d !== 0 ? d : cmpJudul();
          }
          case 'STATUS': {
            const rank = { DIKEMBALIKAN: 0, DRAF: 1, MENUNGGU_VERIFIKASI: 2 };
            const s = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
            if (s !== 0) return s;
            const d = cmpTerbaru();
            return d !== 0 ? d : cmpJudul();
          }
          case 'JUDUL_ASC':
            return cmpJudul();
          case 'UNIT_ASC': {
            const docA = state.documents.find((d) => d.id === a.document_id);
            const docB = state.documents.find((d) => d.id === b.document_id);
            const ua = docA ? (getUnit(docA.unit_id)?.nama || '') : '';
            const ub = docB ? (getUnit(docB.unit_id)?.nama || '') : '';
            const u = ua.localeCompare(ub, 'id', { sensitivity: 'base' });
            return u !== 0 ? u : cmpJudul();
          }
          case 'TERBARU':
          default: {
            const d = cmpTerbaru();
            return d !== 0 ? d : cmpJudul();
          }
        }
      });

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Pengajuan Unit</h1>
          <p class="page-subtitle">Kelola draf, pengajuan menunggu verifikasi Manajer, dan dokumen yang dikembalikan untuk perbaikan.</p>
        </div>
        <div class="page-actions">
          <a href="#/pengajuan/baru" class="btn btn-primary">${iconSvg('plus')}<span>Buat Dokumen</span></a>
        </div>
      </div>

      <section class="surface-panel">
        <div class="filter-subrow">
          <div class="segmented" role="group" aria-label="Filter status pengajuan">
            ${[
              ['SEMUA', 'Semua'],
              ['DRAF', 'Draf'],
              ['MENUNGGU_VERIFIKASI', 'Menunggu Verifikasi'],
              ['DIKEMBALIKAN', 'Dikembalikan'],
            ].map(([val, lbl]) => `<button type="button" class="${state.pengajuanFilter === val ? 'active' : ''}" data-status-filter="${val}">${esc(lbl)}</button>`).join('')}
          </div>
          <div class="filter-subrow-right">
            <div class="sort-inline">
              <label for="pengajuan-sort">Urutkan</label>
              <select id="pengajuan-sort" class="select" style="width:auto;">
                <option value="TERBARU" ${state.pengajuanSort === 'TERBARU' ? 'selected' : ''}>Terbaru</option>
                <option value="TERLAMA" ${state.pengajuanSort === 'TERLAMA' ? 'selected' : ''}>Terlama</option>
                <option value="STATUS" ${state.pengajuanSort === 'STATUS' ? 'selected' : ''}>Status (Dikembalikan dulu)</option>
                <option value="JUDUL_ASC" ${state.pengajuanSort === 'JUDUL_ASC' ? 'selected' : ''}>Judul (A-Z)</option>
                <option value="UNIT_ASC" ${state.pengajuanSort === 'UNIT_ASC' ? 'selected' : ''}>Unit kerja (A-Z)</option>
              </select>
            </div>
            <span class="tabular" style="font-size:var(--text-sm);color:var(--text-secondary);">Total <strong>${items.length}</strong> draf dan pengajuan</span>
          </div>
        </div>

        ${items.length === 0 ? `
          <div class="empty-state">
            ${iconSvg('edit')}
            <h3>Belum ada draf atau pengajuan</h3>
            <p>Mulai buat dokumen baru dari template resmi atau unggah berkas PDF yang sudah tersedia.</p>
            <a href="#/pengajuan/baru" class="btn btn-primary">Buat Dokumen</a>
          </div>
        ` : `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Nomor</th>
                  <th>Unit</th>
                  <th>Jenis</th>
                  <th>Metode</th>
                  <th>Status</th>
                  <th class="col-actions">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map((v) => {
                    const doc = state.documents.find((d) => d.id === v.document_id);
                    const unit = getUnit(doc.unit_id);
                    const cat = getCategory(doc.category_id);
                    const badge = getStatusBadge(v.status);
                    return `
                      <tr>
                        <td>
                          <a href="#/pengajuan/${v.id}" class="table-title-link">${esc(v.judul || '(Tanpa Judul)')}</a>
                          <div class="table-sub tabular">Rev ${esc(v.revisi_label)} · Berlaku ${esc(formatDateID(v.tgl_berlaku))}</div>
                          ${v.status === 'DIKEMBALIKAN' && v.return_note ? `<div class="table-sub" style="color:var(--danger-text);">Catatan Manajer: ${esc(v.return_note)}</div>` : ''}
                        </td>
                        <td class="tabular">${esc(v.nomor || '-')}</td>
                        <td>${esc(unit ? unit.nama : '-')}</td>
                        <td>${esc(cat ? cat.label : '-')}</td>
                        <td>${v.metode === 'TEMPLATE' ? 'Template' : 'Upload'}</td>
                        <td><span class="status-pill status-${badge.tone}">${esc(badge.label)}</span></td>
                        <td class="col-actions">
                          <div class="table-actions">
                            <a href="#/pengajuan/${v.id}" class="btn btn-secondary btn-compact">${v.status === 'MENUNGGU_VERIFIKASI' ? 'Lihat' : 'Edit'}</a>
                            <button type="button" class="row-menu-btn" data-pengajuan-menu="${v.id}" aria-label="Aksi lainnya untuk ${esc(v.judul || 'draf')}" aria-haspopup="menu" aria-expanded="false">${iconSvg('dots')}</button>
                          </div>
                        </td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `}
      </section>
    `;

    main.querySelectorAll('[data-status-filter]').forEach((btn) => {
      btn.onclick = () => {
        state.pengajuanFilter = btn.getAttribute('data-status-filter');
        viewPengajuanUnit();
      };
    });

    const pSort = document.getElementById('pengajuan-sort');
    if (pSort) pSort.onchange = (e) => { state.pengajuanSort = e.target.value; viewPengajuanUnit(); };

    main.querySelectorAll('[data-pengajuan-menu]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const ver = state.versions.find((x) => x.id === btn.getAttribute('data-pengajuan-menu'));
        if (!ver) return;
        const menuItems = [];
        if (ver.status === 'MENUNGGU_VERIFIKASI') {
          menuItems.push({
            label: 'Tarik Pengajuan',
            icon: 'undo',
            onClick: async () => {
              const res = await openDialog({
                title: 'Tarik Pengajuan',
                bodyHtml: `<p>Pengajuan <strong>${esc(ver.judul)}</strong> akan dikembalikan ke status Draf dan dihapus dari antrean Manajer.</p>`,
                confirmLabel: 'Tarik Pengajuan',
              });
              if (!res) return;
              if (live) return writeAction(versionPath(ver.id, '/withdraw'), 'POST', {}, 'Pengajuan ditarik.', renderRoute);
              withdrawVersion(ver);
              viewPengajuanUnit();
            },
          });
        }
        if (['DRAF', 'DIKEMBALIKAN'].includes(ver.status)) {
          menuItems.push({
            label: 'Hapus Draf',
            icon: 'trash',
            danger: true,
            onClick: async () => {
              const res = await openDialog({
                title: 'Hapus Draf',
                bodyHtml: `<p>Draf <strong>${esc(ver.judul || ver.nomor)}</strong> akan dihapus permanen dari tampilan dan dicatat di log audit.</p>`,
                confirmLabel: 'Hapus Draf',
                confirmTone: 'danger',
              });
              if (!res) return;
              if (live) return writeAction(versionPath(ver.id), 'DELETE', undefined, 'Draf dihapus.', renderRoute);
              softDeleteVersion(ver);
              viewPengajuanUnit();
            },
          });
        }
        openRowMenu(btn, menuItems);
      };
    });

    enhanceSelects(main);
  }

  function withdrawVersion(ver) {
    const user = getCurrentUser();
    ver.status = 'DRAF';
    ver.submitted_at = null;
    state.reviewLogs.push({
      id: `rl-${Date.now()}`,
      version_id: ver.id,
      user_id: user.id,
      aksi: 'TARIK',
      catatan: 'Pengajuan ditarik kembali oleh Koordinator/SPV.',
      created_at: `${state.today} 10:25`,
    });
    state.notifications.forEach((n) => {
      if (n.target_id === ver.id && n.jenis === 'PENGAJUAN') n.is_relevant = false;
    });
    showToast('Pengajuan ditarik kembali ke status Draf.', 'success');
  }

  function softDeleteVersion(ver) {
    const user = getCurrentUser();
    ver.status = 'DIHAPUS';
    state.documentLogs.push({
      id: `dl-${Date.now()}`,
      document_id: ver.document_id,
      user_id: user.id,
      aksi: 'HAPUS_DRAF',
      alasan: `Menghapus draf versi ${ver.revisi_label} (${ver.nomor || 'tanpa nomor'}).`,
      created_at: `${state.today} 10:30`,
    });
    showToast('Draf dihapus dan dicatat pada log audit.', 'success');
  }

  function viewBuatDokumenStep1() {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    if (!isAnyKoordinator(user)) {
      navigate('#/403');
      return;
    }

    const allowedUnits = user.is_super_admin
      ? state.units.filter((u) => u.is_active)
      : state.units.filter((u) => u.is_active && getUserUnitsFor(user.id, 'KOORDINATOR').includes(u.id));

    if (!state.draftStep1.unitId || !allowedUnits.some((u) => u.id === state.draftStep1.unitId)) {
      state.draftStep1.unitId = allowedUnits[0]?.id || '';
    }

    main.innerHTML = `
      <div class="page-header">
        <div>
          <a href="#/pengajuan" class="btn btn-ghost btn-compact" style="margin-bottom:8px;">${iconSvg('arrowLeft')}<span>Kembali ke Pengajuan Unit</span></a>
          <h1 class="page-title">Buat Dokumen Baru</h1>
          <p class="page-subtitle">Langkah 1 dari 2: pilih unit pemilik, jenis regulasi, dan metode penyusunan.</p>
        </div>
      </div>

      <section class="surface-panel" style="max-width:860px;">
        <div class="field-grid">
          <div class="field col-12">
            <label for="step1-unit">Unit pemilik dokumen <span class="req-mark">*</span></label>
            <select id="step1-unit" class="select">
              ${allowedUnits.map((u) => `<option value="${u.id}" ${state.draftStep1.unitId === u.id ? 'selected' : ''}>${esc(u.nama)}</option>`).join('')}
            </select>
            <p class="field-help">Hanya menampilkan unit sesuai penugasan Koordinator/SPV Anda.</p>
          </div>

          <div class="field col-12">
            <label>Jenis dokumen (5 jenis tetap RS AN-NISA) <span class="req-mark">*</span></label>
            <div class="choice-grid" role="radiogroup" aria-label="Pilih jenis dokumen">
              ${state.categories
                .map((c) => `
                  <button type="button" class="choice-option" role="radio" aria-checked="${state.draftStep1.categoryId === c.id}" data-cat-pick="${c.id}">
                    <strong>${esc(c.label)}</strong>
                    <span class="tabular" style="font-size:var(--text-sm);color:var(--text-secondary);">Contoh: ${esc(c.contoh_nomor)}</span>
                  </button>
                `)
                .join('')}
            </div>
          </div>

          <div class="field col-12">
            <label>Metode penyusunan <span class="req-mark">*</span></label>
            <div class="choice-grid" role="radiogroup" aria-label="Pilih metode penyusunan">
              <button type="button" class="choice-option" role="radio" aria-checked="${state.draftStep1.metode === 'TEMPLATE'}" data-method-pick="TEMPLATE">
                <strong>Buat dari Template</strong>
                <span style="font-size:var(--text-sm);color:var(--text-secondary);">Isi bagian editor terstruktur sesuai Lampiran B dan generate PDF otomatis.</span>
              </button>
              <button type="button" class="choice-option" role="radio" aria-checked="${state.draftStep1.metode === 'UPLOAD'}" data-method-pick="UPLOAD">
                <strong>Upload Dokumen</strong>
                <span style="font-size:var(--text-sm);color:var(--text-secondary);">Unggah PDF bertanda tangan / dokumen lama (unggah berpotongan &lt; 4 MB).</span>
              </button>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;padding-top:16px;border-top:1px solid var(--border-subtle);">
          <a href="#/pengajuan" class="btn btn-secondary">Batal</a>
          <button type="button" class="btn btn-primary" id="step1-continue-btn">Lanjut ke Editor & Metadata</button>
        </div>
      </section>
    `;

    document.getElementById('step1-unit').onchange = (e) => {
      state.draftStep1.unitId = e.target.value;
    };
    main.querySelectorAll('[data-cat-pick]').forEach((btn) => {
      btn.onclick = () => {
        state.draftStep1.categoryId = btn.getAttribute('data-cat-pick');
        viewBuatDokumenStep1();
      };
    });
    main.querySelectorAll('[data-method-pick]').forEach((btn) => {
      btn.onclick = () => {
        state.draftStep1.metode = btn.getAttribute('data-method-pick');
        viewBuatDokumenStep1();
      };
    });

    document.getElementById('step1-continue-btn').onclick = () => {
      if (live) {
        const { unitId, categoryId, metode } = state.draftStep1;
        return writeAction('documents', 'POST', { unit_id: unitId, category_id: categoryId, metode }, '',
          ({ versionId }) => navigate('#/pengajuan/' + versionId));
      }
      const cat = getCategory(state.draftStep1.categoryId);
      const newDocId = `doc-${Date.now()}`;
      const newVerId = `ver-${Date.now()}`;
      const initSections = {};
      cat.sections.forEach((s) => {
        initSections[s.code] = s.type === 'list' ? [''] : '';
      });

      state.documents.push({
        id: newDocId,
        unit_id: state.draftStep1.unitId,
        category_id: cat.id,
        status_aktif: 'AKTIF',
        alasan_tidak_aktif: '',
        tgl_tidak_aktif: '',
        created_by: user.id,
      });

      state.versions.push({
        id: newVerId,
        document_id: newDocId,
        revisi_label: '00',
        judul: '',
        nomor: '',
        tgl_dokumen: state.today,
        tgl_berlaku: state.today,
        kata_kunci: '',
        ringkasan_perubahan: '',
        metode: state.draftStep1.metode,
        status: 'DRAF',
        template_version: cat.template_version,
        edit_version: 1,
        created_by: user.id,
        submitted_at: null,
        approved_by: null,
        approved_at: null,
        sections: initSections,
        attachments: [],
      });

      state.uploadSim = { progress: 0, fileName: '', sizeLabel: '', status: 'IDLE' };
      navigate(`#/pengajuan/${newVerId}`);
    };

    enhanceSelects(main);
  }

  function viewEditDraf(versionId) {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    const ver = state.versions.find((v) => v.id === versionId && v.status !== 'DIHAPUS');
    if (!ver || (live && ver.status === 'DISETUJUI')) {
      navigate(live ? '#/403' : '#/pengajuan');
      return;
    }
    const doc = state.documents.find((d) => d.id === ver.document_id);
    if (!doc || !canEditUnit(user, doc.unit_id)) {
      navigate('#/403');
      return;
    }

    const unit = getUnit(doc.unit_id);
    const cat = getCategory(doc.category_id);
    const isLocked = !['DRAF', 'DIKEMBALIKAN'].includes(ver.status);
    const isRevision = state.versions.some((v) => v.document_id === doc.id && v.status === 'DISETUJUI');
    const submitter = getUser(ver.created_by);
    const conflictInfo = checkNumberConflict(ver.nomor, doc.id);
    const annotations = returnedAnnotations(ver);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <a href="#/pengajuan" class="btn btn-ghost btn-compact" style="margin-bottom:8px;">${iconSvg('arrowLeft')}<span>Kembali ke Pengajuan Unit</span></a>
          <h1 class="page-title">${esc(ver.judul || 'Draf Dokumen Baru')}</h1>
          <p class="page-subtitle">${esc(unit ? unit.nama : '-')} · ${esc(cat ? cat.label : '-')} · Metode ${ver.metode === 'TEMPLATE' ? 'Template' : 'Upload'}</p>
        </div>
      </div>

      ${isLocked ? `
        <div class="notice-banner" role="status">
          <div>
            <strong>Diajukan pada ${esc(formatTimestamp(ver.submitted_at))} oleh ${esc(submitter?.nama || '-')}</strong>
            <p>Isi pengajuan terkunci selama proses verifikasi Manajer.</p>
          </div>
        </div>
      ` : ''}

      ${ver.status === 'DIKEMBALIKAN' && ver.return_note ? `
        <div class="notice-banner danger" role="status">
          <div>
            <strong>Dikembalikan oleh Manajer untuk perbaikan</strong>
            <p>${esc(ver.return_note)}</p>
          </div>
        </div>
      ` : ''}

      <div class="workbench-grid">
        <div>
          <section class="surface-panel">
            <h2 class="section-heading">Metadata Dokumen</h2>
            <div class="field-grid">
              <div class="field col-12">
                <label for="meta-judul">Judul Dokumen <span class="req-mark">*</span></label>
                <input id="meta-judul" class="input" value="${esc(ver.judul)}" ${isLocked ? 'disabled' : ''} placeholder="Masukkan judul resmi regulasi">
                <p id="err-judul" class="field-error" hidden></p>
              </div>

              <div class="field col-8">
                <label for="meta-nomor">Nomor Dokumen (Manual) <span class="req-mark">*</span></label>
                <input id="meta-nomor" class="input tabular" value="${esc(ver.nomor)}" ${isLocked ? 'disabled' : ''} placeholder="${esc(cat.contoh_nomor)}">
                <p class="field-help">Contoh nomor ${esc(cat.label)}: <strong class="tabular">${esc(cat.contoh_nomor)}</strong></p>
                <p id="err-nomor" class="field-error" ${conflictInfo ? '' : 'hidden'}>
                  ${conflictInfo ? (conflictInfo.sameDoc
                    ? `Nomor sudah dipakai versi terbit dokumen ini.`
                    : `Nomor sudah dipakai oleh ${esc(conflictInfo.conflict.judul)}`) : ''}
                </p>
              </div>

              <div class="field col-4">
                <label for="meta-revisi">Label Revisi <span class="req-mark">*</span></label>
                <input id="meta-revisi" class="input tabular" value="${esc(ver.revisi_label)}" ${isLocked ? 'disabled' : ''} placeholder="00">
              </div>

              <div class="field col-6">
                <label for="meta-tgl-dok">Tanggal Dokumen <span class="req-mark">*</span></label>
                <input id="meta-tgl-dok" class="input tabular" type="date" value="${esc(ver.tgl_dokumen)}" ${isLocked ? 'disabled' : ''}>
              </div>

              <div class="field col-6">
                <label for="meta-tgl-berlaku">Tanggal Mulai Berlaku <span class="req-mark">*</span></label>
                <input id="meta-tgl-berlaku" class="input tabular" type="date" value="${esc(ver.tgl_berlaku)}" ${isLocked ? 'disabled' : ''}>
              </div>

              <div class="field col-12">
                <label for="meta-keywords">Kata Kunci Pencarian (opsional, pisah koma)</label>
                <input id="meta-keywords" class="input" value="${esc(ver.kata_kunci)}" ${isLocked ? 'disabled' : ''} placeholder="triase, gawat darurat, igd">
              </div>

              <div class="field col-12">
                <label for="meta-ringkasan">Ringkasan Perubahan ${isRevision ? '<span class="req-mark">*</span>' : '(opsional)'}</label>
                <textarea id="meta-ringkasan" class="textarea" ${isLocked ? 'disabled' : ''} placeholder="Jelaskan ringkas perubahan dari versi sebelumnya">${esc(ver.ringkasan_perubahan)}</textarea>
                <p id="err-ringkasan" class="field-error" hidden></p>
              </div>
            </div>
          </section>

          <section class="surface-panel">
            ${ver.metode === 'TEMPLATE' ? renderTemplateEditor(cat, ver, isLocked) : renderUploadEditor(ver, isLocked)}
            ${ver.metode === 'TEMPLATE' ? renderTemplateScanBox(ver, isLocked) : ''}
            ${supportingFiles(ver, isLocked, ver.metode === 'UPLOAD')}
            ${live && state.uploadSim.status === 'UPLOADING' && ver.metode === 'TEMPLATE' ? `
              <div class="upload-zone" role="status">
                <p>Mengunggah ${esc(state.uploadSim.fileName)}</p>
                <div class="progress-track"><div class="progress-fill"></div></div>
              </div>` : ''}
          </section>
        </div>

        <section class="pdf-stage" id="edit-preview-stage" aria-label="Pratinjau langsung dokumen PDF A4">
          <div class="pdf-stage-bar">
            <span id="edit-preview-label">${getActivePreviewMode(ver) === 'SCAN' ? 'Pratinjau PDF Hasil Scan' : (ver.metode === 'TEMPLATE' ? `Pratinjau Dokumen (Template v${esc(ver.template_version)})` : 'Pratinjau Ringkasan Dokumen')}</span>
            <div id="edit-preview-toggle-wrap">${renderPreviewModeToggle(ver)}</div>
          </div>
          ${annotations.length ? `<details class="review-annotation-panel" open>
            <summary>${annotations.length} catatan pada pratinjau</summary>
            ${renderAnnotationList(annotations, { jump: true })}
          </details>` : ''}
          <div id="live-a4-container">${renderDocumentPreview(ver, doc, annotations, { canUploadScan: !isLocked })}</div>
        </section>
      </div>

      <div class="bottom-action-bar">
        ${isLocked ? `
          <button type="button" class="btn btn-secondary" id="edit-withdraw-btn">Tarik Pengajuan</button>
        ` : `
          <button type="button" class="btn btn-secondary" id="edit-save-btn">Simpan Draf</button>
          <button type="button" class="btn btn-primary" id="edit-submit-btn">Ajukan ke Manajer</button>
        `}
      </div>
    `;

    function refreshLivePreview() {
      const box = document.getElementById('live-a4-container');
      if (box && getActivePreviewMode(ver) === 'CURRENT') box.innerHTML = renderA4Sheet(ver, doc, annotations);
    }

    function refreshPreviewPane() {
      const toggleWrap = document.getElementById('edit-preview-toggle-wrap');
      const labelEl = document.getElementById('edit-preview-label');
      const box = document.getElementById('live-a4-container');
      if (toggleWrap) toggleWrap.innerHTML = renderPreviewModeToggle(ver);
      if (labelEl) {
        labelEl.textContent = getActivePreviewMode(ver) === 'SCAN'
          ? 'Pratinjau PDF Hasil Scan'
          : (ver.metode === 'TEMPLATE' ? `Pratinjau Dokumen (Template v${ver.template_version})` : 'Pratinjau Ringkasan Dokumen');
      }
      if (box) box.innerHTML = renderDocumentPreview(ver, doc, annotations, { canUploadScan: !isLocked });
      bindEditPreviewEvents();
    }

    function bindEditPreviewEvents() {
      const stage = document.getElementById('edit-preview-stage');
      if (!stage) return;
      stage.querySelectorAll('[data-preview-mode]').forEach((btn) => {
        btn.onclick = () => {
          state.previewModeByVersion[ver.id] = btn.getAttribute('data-preview-mode');
          refreshPreviewPane();
        };
      });
      const inlineScanInput = stage.querySelector('[data-scan-upload-input]');
      if (inlineScanInput) {
        inlineScanInput.onchange = () => uploadFile(ver, inlineScanInput.files[0], 'PDF');
      }
    }

    bindEditPreviewEvents();
    main.querySelectorAll('[data-open-scan-preview]').forEach((btn) => {
      btn.onclick = () => {
        state.previewModeByVersion[ver.id] = 'SCAN';
        refreshPreviewPane();
        document.getElementById('edit-preview-stage')?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
      };
    });
    main.querySelectorAll('[data-delete-scan-pdf]').forEach((btn) => {
      btn.onclick = () => deleteScanPdf(ver, {
        preserveDraft: true,
        onRefresh: () => viewEditDraf(versionId),
      });
    });
    if (annotations.length) bindAnnotationJumps(document.getElementById('edit-preview-stage'));

    if (!isLocked) {
      const bindMeta = (elId, key, extra) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.addEventListener('input', (e) => {
          ver[key] = e.target.value;
          state.dirtyDraft = true;
          if (extra) extra(e.target.value);
          refreshLivePreview();
        });
      };

      bindMeta('meta-judul', 'judul', () => {
        document.getElementById('err-judul').hidden = true;
        document.getElementById('meta-judul').classList.remove('is-invalid');
      });
      bindMeta('meta-nomor', 'nomor', (val) => {
        const err = document.getElementById('err-nomor');
        const c = checkNumberConflict(val, doc.id);
        if (c && !c.sameDoc) {
          err.textContent = `Nomor sudah dipakai oleh ${c.conflict.judul}`;
          err.hidden = false;
          document.getElementById('meta-nomor').classList.add('is-invalid');
        } else {
          err.hidden = true;
          document.getElementById('meta-nomor').classList.remove('is-invalid');
        }
      });
      bindMeta('meta-revisi', 'revisi_label');
      bindMeta('meta-tgl-dok', 'tgl_dokumen');
      bindMeta('meta-tgl-berlaku', 'tgl_berlaku');
      bindMeta('meta-keywords', 'kata_kunci');
      bindMeta('meta-ringkasan', 'ringkasan_perubahan', () => {
        document.getElementById('err-ringkasan').hidden = true;
      });

      // Bind template section fields
      main.querySelectorAll('[data-sec-code]').forEach((el) => {
        el.addEventListener('input', (e) => {
          const code = el.getAttribute('data-sec-code');
          ver.sections[code] = e.target.value;
          state.dirtyDraft = true;
          refreshLivePreview();
        });
      });

      // Bind sortable list items (Diktum SK / Langkah SPO)
      main.querySelectorAll('[data-list-code]').forEach((el) => {
        el.addEventListener('input', (e) => {
          const code = el.getAttribute('data-list-code');
          const idx = Number(el.getAttribute('data-list-idx'));
          ver.sections[code][idx] = e.target.value;
          state.dirtyDraft = true;
          refreshLivePreview();
        });
      });

      main.querySelectorAll('[data-list-act]').forEach((btn) => {
        btn.onclick = () => {
          const act = btn.getAttribute('data-list-act');
          const code = btn.getAttribute('data-code');
          const idx = Number(btn.getAttribute('data-idx'));
          const arr = ver.sections[code] || (ver.sections[code] = []);
          if (act === 'add') arr.push('');
          if (act === 'del' && arr.length > 1) arr.splice(idx, 1);
          if (act === 'up' && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
          if (act === 'down' && idx < arr.length - 1) [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
          state.dirtyDraft = true;
          viewEditDraf(versionId);
        };
      });

      // Upload mode file input
      const fileInput = document.getElementById('pdf-upload-input');
      for (const input of main.querySelectorAll('[data-upload-kind]')) {
        input.onchange = () => uploadFile(ver, input.files[0], input.dataset.uploadKind);
      }
      if (fileInput) {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          const err = document.getElementById('err-upload');
          if (!file) return;
          if (!file.name.toLowerCase().endsWith('.pdf')) {
            err.textContent = 'Berkas utama harus PDF';
            err.hidden = false;
            return;
          }
          if (file.size > 20 * 1024 * 1024) {
            err.textContent = 'Ukuran melebihi batas 20 MB';
            err.hidden = false;
            return;
          }
          err.hidden = true;
          uploadFile(ver, file, 'PDF');
        };
      }

      const simBtn = document.getElementById('sim-upload-sample');
      if (simBtn) {
        simBtn.onclick = () => {
          state.uploadSim = { progress: 100, fileName: `${normalizeDocNumber(ver.nomor || 'DOC')}.pdf`, sizeLabel: '2.4 MB', status: 'READY' };
          ver.attachments = [{ nama: state.uploadSim.fileName, ukuran: '2.4 MB' }];
          showToast('Simulasi unggah berpotongan (< 4 MB per chunk) berhasil.', 'success');
          viewEditDraf(versionId);
        };
      }

      document.getElementById('edit-save-btn').onclick = () => {
        if (live) return writeAction(versionPath(ver.id), 'PATCH', draftInput(ver), 'Draf tersimpan', ({ numberConflict }) => {
          state.dirtyDraft = false;
          renderRoute();
          if (numberConflict) showToast('Nomor sudah dipakai dokumen lain.', 'error');
        });
        ver.edit_version += 1;
        state.dirtyDraft = false;
        showToast('Draf tersimpan', 'success');
        viewEditDraf(versionId);
      };

      document.getElementById('edit-submit-btn').onclick = async () => {
        let valid = true;
        if (!ver.judul.trim()) {
          document.getElementById('err-judul').textContent = 'Judul wajib diisi';
          document.getElementById('err-judul').hidden = false;
          document.getElementById('meta-judul').classList.add('is-invalid');
          valid = false;
        }
        const c = checkNumberConflict(ver.nomor, doc.id);
        if (!ver.nomor.trim()) {
          document.getElementById('err-nomor').textContent = 'Nomor wajib diisi';
          document.getElementById('err-nomor').hidden = false;
          document.getElementById('meta-nomor').classList.add('is-invalid');
          valid = false;
        } else if (c && !c.sameDoc && (!live || ['MENUNGGU_VERIFIKASI', 'DISETUJUI'].includes(c.conflict.status))) {
          document.getElementById('err-nomor').textContent = `Nomor sudah dipakai oleh ${c.conflict.judul}`;
          document.getElementById('err-nomor').hidden = false;
          document.getElementById('meta-nomor').classList.add('is-invalid');
          valid = false;
        }
        if (isRevision && !ver.ringkasan_perubahan.trim()) {
          document.getElementById('err-ringkasan').textContent = 'Ringkasan perubahan wajib diisi untuk revisi';
          document.getElementById('err-ringkasan').hidden = false;
          valid = false;
        }

        const unitManagers = state.userUnits.filter((uu) => uu.unit_id === doc.unit_id && uu.peran === 'MANAJER' && uu.is_active);
        if (live ? !unit?.has_manager : !unitManagers.length) {
          showToast('Manajer unit belum diseting, harap hubungi tim DTO.', 'error');
          return;
        }
        if (ver.metode === 'UPLOAD' && !ver.attachments?.some((file) => !live || file.kind === 'PDF')) {
          showToast('Berkas PDF belum tersedia', 'error');
          return;
        }
        if (!valid) {
          showToast('Periksa kembali isian yang ditandai merah.', 'error');
          return;
        }

        const res = await openDialog({
          title: 'Ajukan Dokumen untuk Verifikasi',
          bodyHtml: `<p>Isi pengajuan terkunci selama verifikasi. Lanjutkan?</p>`,
          confirmLabel: 'Ya, Ajukan',
        });
        if (!res) return;

        if (live) return writeAction(versionPath(ver.id, '/submit'), 'POST', draftInput(ver), 'Pengajuan dikirim ke Manajer', () => {
          state.dirtyDraft = false;
          renderRoute();
        });
        ver.status = 'MENUNGGU_VERIFIKASI';
        ver.submitted_at = `${state.today} 10:40`;
        state.dirtyDraft = false;
        state.reviewLogs.push({
          id: `rl-${Date.now()}`,
          version_id: ver.id,
          user_id: user.id,
          aksi: 'AJUKAN',
          catatan: ver.ringkasan_perubahan || 'Pengajuan verifikasi dokumen.',
          created_at: ver.submitted_at,
        });
        unitManagers.forEach((m) => {
          state.notifications.push({
            id: `ntf-${Date.now()}-${m.user_id}`,
            user_id: m.user_id,
            jenis: 'PENGAJUAN',
            target_id: ver.id,
            url: `#/verifikasi/${ver.id}`,
            pesan: `Pengajuan ${unit.nama}: ${ver.judul} oleh ${user.nama}.`,
            is_read: false,
            is_relevant: true,
            created_at: ver.submitted_at,
          });
        });
        showToast('Pengajuan dikirim ke Manajer', 'success');
        viewEditDraf(versionId);
      };
    } else {
      document.getElementById('edit-withdraw-btn').onclick = async () => {
        const res = await openDialog({
          title: 'Tarik Pengajuan',
          bodyHtml: `<p>Pengajuan <strong>${esc(ver.judul)}</strong> akan kembali ke status Draf dan dapat diedit ulang.</p>`,
          confirmLabel: 'Tarik Pengajuan',
        });
        if (!res) return;
        if (live) return writeAction(versionPath(ver.id, '/withdraw'), 'POST', {}, 'Pengajuan ditarik.', renderRoute);
        withdrawVersion(ver);
        viewEditDraf(versionId);
      };
    }
  }

  function renderTemplateEditor(cat, ver, isLocked) {
    return `
      <h2 class="section-heading">Isian Editor Template (${esc(cat.label)})</h2>
      <div class="field-grid">
        ${(ver.template_sections || cat.sections)
          .map((s) => {
            if (s.type === 'list') {
              const arr = Array.isArray(ver.sections[s.code]) && ver.sections[s.code].length ? ver.sections[s.code] : [''];
              ver.sections[s.code] = arr;
              return `
                <div class="field col-12">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <label>${esc(s.label)}</label>
                    ${!isLocked ? `<button type="button" class="btn btn-secondary btn-compact" data-list-act="add" data-code="${s.code}" data-idx="0">${iconSvg('plus')}<span>Tambah Butir</span></button>` : ''}
                  </div>
                  <div class="sortable-list">
                    ${arr
                      .map((item, idx) => `
                        <div class="sortable-row">
                          <span class="sortable-num">${idx + 1}.</span>
                          <textarea class="textarea" data-list-code="${s.code}" data-list-idx="${idx}" ${isLocked ? 'disabled' : ''}>${esc(item)}</textarea>
                          ${!isLocked ? `
                            <div class="sortable-actions">
                              <button type="button" class="icon-btn" data-list-act="up" data-code="${s.code}" data-idx="${idx}" aria-label="Pindah ke atas" ${idx === 0 ? 'disabled' : ''}>${iconSvg('up')}</button>
                              <button type="button" class="icon-btn" data-list-act="down" data-code="${s.code}" data-idx="${idx}" aria-label="Pindah ke bawah" ${idx === arr.length - 1 ? 'disabled' : ''}>${iconSvg('down')}</button>
                              <button type="button" class="icon-btn" data-list-act="del" data-code="${s.code}" data-idx="${idx}" aria-label="Hapus butir" ${arr.length <= 1 ? 'disabled' : ''}>${iconSvg('trash')}</button>
                            </div>
                          ` : ''}
                        </div>
                      `)
                      .join('')}
                  </div>
                </div>
              `;
            }
            if (s.type === 'text') {
              return `
                <div class="field col-12">
                  <label for="sec-${s.code}">${esc(s.label)}</label>
                  <input id="sec-${s.code}" class="input" data-sec-code="${s.code}" value="${esc(ver.sections[s.code] || '')}" ${isLocked ? 'disabled' : ''}>
                </div>
              `;
            }
            return `
              <div class="field col-12">
                <label for="sec-${s.code}">${esc(s.label)}</label>
                <textarea id="sec-${s.code}" class="textarea" data-sec-code="${s.code}" ${isLocked ? 'disabled' : ''}>${esc(ver.sections[s.code] || '')}</textarea>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderTemplateScanBox(ver, isLocked) {
    const scanAtt = getScanPdfAttachment(ver);
    const scanUrl = getScanPdfUrl(ver);
    if (isLocked && !scanAtt && !scanUrl) return '';
    return `
      <div class="scan-upload-box">
        <div class="scan-upload-head">
          <div>
            <strong>PDF Hasil Scan (Opsional)</strong>
            <p class="field-help">Unggah PDF hasil scan bertanda tangan untuk opsi pratinjau PDF Hasil Scan.</p>
          </div>
          ${!isLocked ? `<label class="btn btn-secondary btn-compact">${iconSvg('upload')}<span>${scanAtt || scanUrl ? 'Ganti PDF Scan' : 'Unggah PDF Scan'}</span><input type="file" accept=".pdf,application/pdf" data-upload-kind="PDF" class="file-picker"></label>` : ''}
        </div>
        ${scanAtt || scanUrl ? `
          <div class="upload-file-row">
            <span>${scanAtt ? attachmentLink(ver, scanAtt) : esc(localScanUrls.get(ver.id)?.name || 'PDF Scan')} ${scanAtt?.ukuran ? `<span class="tabular" style="color:var(--text-secondary);">(${esc(scanAtt.ukuran)})</span>` : ''}</span>
            <div class="upload-file-actions">
              <button type="button" class="btn btn-secondary btn-compact" data-open-scan-preview>Pratinjau PDF</button>
              ${scanUrl ? `<a href="${esc(scanUrl)}" target="_blank" rel="noopener" class="btn btn-ghost btn-compact">Buka Tab Baru</a>` : ''}
              ${!isLocked ? `<button type="button" class="btn btn-danger btn-compact" data-delete-scan-pdf>${iconSvg('trash')}<span>Hapus</span></button>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderUploadEditor(ver, isLocked) {
    const attachments = (ver.attachments || []).filter((file) => !live || file.kind === 'PDF');
    const scanUrl = getScanPdfUrl(ver);
    return `
      <h2 class="section-heading">Unggah Berkas Dokumen (Resumable &lt; 4 MB per Potongan)</h2>
      <div class="upload-zone ${state.uploadSim.status === 'UPLOADING' ? 'active' : ''}">
        <p style="margin:0 0 10px;">Berkas utama wajib berformat <strong>PDF</strong> (maksimal 20 MB). Berkas sumber DOCX dan lampiran opsional.</p>
        ${!isLocked ? `
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;">
            <label class="btn btn-secondary">${iconSvg('upload')}<span>Pilih Berkas PDF</span><input id="pdf-upload-input" type="file" accept=".pdf,application/pdf" class="file-picker"></label>
            ${live ? '' : '<button type="button" class="btn btn-secondary" id="sim-upload-sample">Simulasi Unggah PDF Resmi</button>'}
          </div>
        ` : ''}
        <p id="err-upload" class="field-error" hidden style="margin-top:8px;"></p>
        ${state.uploadSim.status === 'UPLOADING' ? `
          <div class="progress-track"><div class="progress-fill" style="width:${state.uploadSim.progress}%"></div></div>
          <p class="field-help tabular" style="margin-top:6px;">Mengunggah ${esc(state.uploadSim.fileName)} (${state.uploadSim.progress}%)</p>
        ` : ''}
        ${attachments.map((att) => `
          <div class="upload-file-row">
            <span style="font-weight:600;">${attachmentLink(ver, att)} <span class="tabular" style="font-weight:400;color:var(--text-secondary);">(${esc(att.ukuran)})</span></span>
            <div class="upload-file-actions">
              <button type="button" class="btn btn-secondary btn-compact" data-open-scan-preview>Pratinjau PDF</button>
              ${scanUrl ? `<a href="${esc(scanUrl)}" target="_blank" rel="noopener" class="btn btn-ghost btn-compact">Buka Tab Baru</a>` : ''}
              ${!isLocked ? `<button type="button" class="btn btn-danger btn-compact" data-delete-scan-pdf>${iconSvg('trash')}<span>Hapus</span></button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function viewAntreanVerifikasi() {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    if (!isAnyManajer(user)) {
      navigate('#/403');
      return;
    }

    const pending = state.versions.filter((v) => {
      if (v.status !== 'MENUNGGU_VERIFIKASI') return false;
      const doc = state.documents.find((d) => d.id === v.document_id);
      return doc && canVerifyUnit(user, doc.unit_id);
    });

    const history = state.versions.filter((v) => {
      if (!['DISETUJUI', 'DIKEMBALIKAN'].includes(v.status)) return false;
      const doc = state.documents.find((d) => d.id === v.document_id);
      return doc && canVerifyUnit(user, doc.unit_id);
    });

    const rawRows = state.verifikasiTab === 'MENUNGGU' ? pending : history;
    const rows = rawRows.slice().sort((a, b) => {
      const cmpJudul = () => (a.judul || '').localeCompare(b.judul || '', 'id', { sensitivity: 'base' });
      switch (state.verifikasiSort) {
        case 'TERLAMA': {
          const d = (a.submitted_at || a.approved_at || a.tgl_dokumen || '').localeCompare(b.submitted_at || b.approved_at || b.tgl_dokumen || '');
          return d !== 0 ? d : cmpJudul();
        }
        case 'JUDUL_ASC':
          return cmpJudul();
        case 'UNIT_ASC': {
          const docA = state.documents.find((d) => d.id === a.document_id);
          const docB = state.documents.find((d) => d.id === b.document_id);
          const ua = docA ? (getUnit(docA.unit_id)?.nama || '') : '';
          const ub = docB ? (getUnit(docB.unit_id)?.nama || '') : '';
          const u = ua.localeCompare(ub, 'id', { sensitivity: 'base' });
          return u !== 0 ? u : cmpJudul();
        }
        case 'NOMOR_ASC': {
          const n = (a.nomor || '').localeCompare(b.nomor || '', 'id', { numeric: true, sensitivity: 'base' });
          return n !== 0 ? n : cmpJudul();
        }
        case 'TERBARU':
        default: {
          const d = (b.submitted_at || b.approved_at || b.tgl_dokumen || '').localeCompare(a.submitted_at || a.approved_at || a.tgl_dokumen || '');
          return d !== 0 ? d : cmpJudul();
        }
      }
    });

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Antrean Verifikasi Manajer</h1>
          <p class="page-subtitle">Periksa kelengkapan metadata, isi PDF, serta riwayat pengajuan dari unit yang Anda bawahi.</p>
        </div>
      </div>

      <section class="surface-panel">
        <div class="filter-subrow">
          <div class="tablist" role="tablist" aria-label="Kategori antrean verifikasi">
            <button type="button" role="tab" id="tab-menunggu" aria-selected="${state.verifikasiTab === 'MENUNGGU'}" data-vtab="MENUNGGU">Menunggu Verifikasi (${pending.length})</button>
            <button type="button" role="tab" id="tab-riwayat" aria-selected="${state.verifikasiTab === 'RIWAYAT'}" data-vtab="RIWAYAT">Riwayat Keputusan (${history.length})</button>
          </div>
          <div class="filter-subrow-right">
            <div class="sort-inline">
              <label for="verifikasi-sort">Urutkan</label>
              <select id="verifikasi-sort" class="select" style="width:auto;">
                <option value="TERBARU" ${state.verifikasiSort === 'TERBARU' ? 'selected' : ''}>Ajuan terbaru</option>
                <option value="TERLAMA" ${state.verifikasiSort === 'TERLAMA' ? 'selected' : ''}>Ajuan terlama</option>
                <option value="JUDUL_ASC" ${state.verifikasiSort === 'JUDUL_ASC' ? 'selected' : ''}>Judul (A-Z)</option>
                <option value="UNIT_ASC" ${state.verifikasiSort === 'UNIT_ASC' ? 'selected' : ''}>Unit kerja (A-Z)</option>
                <option value="NOMOR_ASC" ${state.verifikasiSort === 'NOMOR_ASC' ? 'selected' : ''}>Nomor dokumen</option>
              </select>
            </div>
          </div>
        </div>

        ${rows.length === 0 ? `
          <div class="empty-state">
            ${iconSvg('check')}
            <h3>Tidak ada pengajuan menunggu verifikasi</h3>
            <p>Semua pengajuan dari unit di bawah koordinasi Anda telah diputuskan.</p>
          </div>
        ` : `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Nomor</th>
                  <th>Unit</th>
                  <th>Jenis</th>
                  <th>Revisi</th>
                  <th>Diajukan oleh</th>
                  <th>Tanggal Ajuan</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map((v) => {
                    const doc = state.documents.find((d) => d.id === v.document_id);
                    const unit = getUnit(doc.unit_id);
                    const cat = getCategory(doc.category_id);
                    const creator = getUser(v.created_by);
                    const badge = getStatusBadge(v.status);
                    return `
                      <tr>
                        <td>
                          <a href="#/verifikasi/${v.id}" class="table-title-link">${esc(v.judul)}</a>
                          <div class="table-sub"><span class="status-pill status-${badge.tone}">${esc(badge.label)}</span></div>
                        </td>
                        <td class="tabular">${esc(v.nomor)}</td>
                        <td>${esc(unit ? unit.nama : '-')}</td>
                        <td>${esc(cat ? cat.label : '-')}</td>
                        <td class="tabular">Rev ${esc(v.revisi_label)}</td>
                        <td>${esc(creator ? creator.nama : '-')}</td>
                        <td class="tabular">${esc(formatTimestamp(v.submitted_at))}</td>
                        <td>
                          <a href="#/verifikasi/${v.id}" class="btn ${v.status === 'MENUNGGU_VERIFIKASI' ? 'btn-primary' : 'btn-secondary'} btn-compact">${v.status === 'MENUNGGU_VERIFIKASI' ? 'Periksa' : 'Detail'}</a>
                        </td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `}
      </section>
    `;

    const tabs = Array.from(main.querySelectorAll('[role="tab"]'));
    tabs.forEach((t, idx) => {
      t.onclick = () => {
        state.verifikasiTab = t.getAttribute('data-vtab');
        viewAntreanVerifikasi();
      };
      t.onkeydown = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const nextIdx = (idx + 1) % tabs.length;
          state.verifikasiTab = tabs[nextIdx].getAttribute('data-vtab');
          viewAntreanVerifikasi();
          document.querySelectorAll('[role="tab"]')[nextIdx].focus();
        }
      };
    });

    const vSort = document.getElementById('verifikasi-sort');
    if (vSort) vSort.onchange = (e) => { state.verifikasiSort = e.target.value; viewAntreanVerifikasi(); };

    enhanceSelects(main);
  }

  function viewDetailVerifikasi(versionId) {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    const ver = state.versions.find((v) => v.id === versionId && v.status !== 'DIHAPUS');
    if (!ver || (live && !ver.submitted_at)) {
      navigate(live ? '#/403' : '#/verifikasi');
      return;
    }
    const doc = state.documents.find((d) => d.id === ver.document_id);
    if (!doc || !canVerifyUnit(user, doc.unit_id)) {
      navigate('#/403');
      return;
    }

    const unit = getUnit(doc.unit_id);
    const cat = getCategory(doc.category_id);
    const submitter = getUser(ver.created_by);
    const logs = state.reviewLogs.filter((l) => l.version_id === ver.id);
    const canDecide = ver.status === 'MENUNGGU_VERIFIKASI' && (!live || ver.created_by !== user.id);
    const canAnnotate = live && canDecide && ver.metode === 'TEMPLATE';
    if (canAnnotate && (reviewDraft?.versionId !== ver.id || reviewDraft?.submittedAt !== ver.submitted_at || reviewDraft?.userId !== user.id)) {
      reviewDraft = { versionId: ver.id, submittedAt: ver.submitted_at, userId: user.id, annotations: [] };
    }
    const annotations = canAnnotate ? reviewDraft.annotations : returnedAnnotations(ver);

    const verifPreviewMode = getActivePreviewMode(ver);
    const showAnnotationPanel = canAnnotate && verifPreviewMode === 'CURRENT';

    main.innerHTML = `
      <div class="page-header">
        <div>
          <a href="#/verifikasi" class="btn btn-ghost btn-compact" style="margin-bottom:8px;">${iconSvg('arrowLeft')}<span>Kembali ke Antrean Verifikasi</span></a>
          <h1 class="page-title">${esc(ver.judul)}</h1>
          <p class="page-subtitle tabular">${esc(ver.nomor)} · ${esc(unit ? unit.nama : '-')} · Diajukan ${esc(formatTimestamp(ver.submitted_at))} oleh ${esc(submitter?.nama || '-')}</p>
        </div>
      </div>

      <div class="workbench-grid">
        <div>
          <section class="surface-panel">
            <h2 class="section-heading">Ringkasan Pengajuan</h2>
            <dl class="meta-dl">
              <div><dt>Status Saat Ini</dt><dd><span class="status-pill status-${getStatusBadge(ver.status).tone}">${esc(getStatusBadge(ver.status).label)}</span></dd></div>
              <div><dt>Jenis Dokumen</dt><dd>${esc(cat ? cat.label : '-')}</dd></div>
              <div><dt>Label Revisi</dt><dd class="tabular">Rev ${esc(ver.revisi_label)}</dd></div>
              <div><dt>Tanggal Mulai Berlaku</dt><dd class="tabular">${esc(formatDateID(ver.tgl_berlaku))}</dd></div>
              <div><dt>Metode Penyusunan</dt><dd>${ver.metode === 'TEMPLATE' ? 'Template Sistem' : 'Upload PDF'}</dd></div>
              <div><dt>Kata Kunci</dt><dd>${esc(ver.kata_kunci || '-')}</dd></div>
            </dl>
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle);">
              <div style="font-size:var(--text-sm);color:var(--text-secondary);">Ringkasan Perubahan</div>
              <div style="margin-top:4px;">${esc(ver.ringkasan_perubahan || '-')}</div>
            </div>
          </section>

          <section class="surface-panel">
            <h2 class="section-heading">Jejak Pengajuan & Keputusan (Review_Log)</h2>
            <ul class="timeline">
              ${logs.length ? logs.map((l) => `
                <li class="timeline-item" style="cursor:default;">
                  <div class="timeline-top">
                    <strong>${esc(l.aksi)} - ${esc(getUser(l.user_id)?.nama || '-')}</strong>
                    <span class="timeline-meta tabular">${esc(formatTimestamp(l.created_at))}</span>
                  </div>
                  <div style="font-size:var(--text-sm);">${esc(l.catatan)}</div>
                  ${renderAnnotationList(l.annotations || [])}
                </li>
              `).join('') : '<li class="timeline-item" style="cursor:default;">Belum ada riwayat keputusan.</li>'}
            </ul>
          </section>
        </div>

        <section class="pdf-stage" id="review-preview-stage">
          <div class="pdf-stage-bar">
            <span>${verifPreviewMode === 'SCAN' ? 'Pemeriksaan PDF Hasil Scan' : 'Pemeriksaan Berkas Dokumen'}</span>
            ${renderPreviewModeToggle(ver)}
          </div>
          ${showAnnotationPanel ? `<div class="review-annotation-panel">
            <div class="review-annotation-toolbar">
              <p class="field-help" id="review-annotation-help" role="status">Klik pensil, lalu blok teks di pratinjau.</p>
              <button type="button" class="icon-btn" id="add-review-annotation" aria-label="Tambah catatan pada teks"
                aria-pressed="false" title="Tambah catatan pada teks" aria-describedby="review-annotation-help">${iconSvg('edit')}</button>
            </div>
            <button type="button" class="btn btn-ghost btn-compact" id="choose-review-part" hidden>Pilih bagian</button>
            <div id="review-annotation-list">${renderAnnotationList(annotations, { jump: true, editable: true })}</div>
          </div>` : (canAnnotate && annotations.length ? `<div class="review-annotation-panel"><p class="field-help">${annotations.length} catatan sorotan tersimpan pada tab Pratinjau Dokumen.</p></div>` : '')}
          <div id="review-annotation-preview">${renderDocumentPreview(ver, doc, annotations)}</div>
          ${live && ver.attachments.length ? `<ul class="file-pickers">${ver.attachments.map((file) =>
            `<li>${attachmentLink(ver, file)}</li>`).join('')}</ul>` : ''}
        </section>
      </div>

      ${canDecide ? `
        <div class="bottom-action-bar">
          <button type="button" class="btn btn-danger" id="verif-return-btn">Kembalikan dengan Catatan</button>
          <button type="button" class="btn btn-primary" id="verif-approve-btn">Setujui & Terbitkan</button>
        </div>
      ` : ''}
    `;

    main.querySelectorAll('#review-preview-stage [data-preview-mode]').forEach((btn) => {
      btn.onclick = () => {
        reviewSelectionEvents?.abort();
        state.previewModeByVersion[ver.id] = btn.getAttribute('data-preview-mode');
        viewDetailVerifikasi(versionId);
      };
    });
    if (showAnnotationPanel) initReviewAnnotations(document.getElementById('review-preview-stage'), ver, doc, annotations);
    if (canDecide) {
      document.getElementById('verif-approve-btn').onclick = async () => {
        const res = await openDialog({
          title: 'Setujui dan Terbitkan Dokumen',
          bodyHtml: `<p>Dokumen <strong>${esc(ver.judul)}</strong> (${esc(ver.nomor)}) akan langsung diterbitkan dan dapat dibaca seluruh staf.</p>`,
          confirmLabel: 'Ya, Setujui & Terbitkan',
        });
        if (!res) return;
        if (live) return writeAction(versionPath(ver.id, '/review'), 'POST', { aksi: 'SETUJUI', submitted_at: ver.submitted_at },
          'Dokumen diterbitkan', () => {
            reviewDraft = null;
            navigate('#/dokumen/' + doc.id);
          });
        ver.status = 'DISETUJUI';
        ver.approved_by = user.id;
        ver.approved_at = `${state.today} 11:00`;
        state.reviewLogs.push({
          id: `rl-${Date.now()}`,
          version_id: ver.id,
          user_id: user.id,
          aksi: 'SETUJUI',
          catatan: 'Disetujui dan diterbitkan oleh Manajer.',
          created_at: ver.approved_at,
        });
        state.notifications.push({
          id: `ntf-${Date.now()}`,
          user_id: ver.created_by,
          jenis: 'DISETUJUI',
          target_id: doc.id,
          url: `#/dokumen/${doc.id}`,
          pesan: `Disetujui: ${ver.judul} oleh ${user.nama}.`,
          is_read: false,
          is_relevant: true,
          created_at: ver.approved_at,
        });
        showToast('Dokumen diterbitkan', 'success');
        navigate(`#/dokumen/${doc.id}`);
      };

      document.getElementById('verif-return-btn').onclick = async () => {
        const res = await openDialog({
          title: 'Kembalikan Pengajuan',
          bodyHtml: `<p>Pengajuan akan dikembalikan ke <strong>${esc(submitter?.nama || 'Koordinator/SPV')}</strong> untuk diperbaiki tanpa membuat versi baru.</p>`,
          confirmLabel: 'Kembalikan Pengajuan',
          confirmTone: 'danger',
          requireNote: true,
          noteOptional: annotations.length > 0,
          noteLabel: 'Catatan perbaikan untuk Koordinator/SPV',
          notePlaceholder: 'Tuliskan bagian yang harus dilengkapi atau diperbaiki...',
        });
        if (!res) return;
        if (live) return writeAction(versionPath(ver.id, '/review'), 'POST', {
          aksi: 'KEMBALIKAN', catatan: res.note, annotations, submitted_at: ver.submitted_at,
        }, 'Pengajuan dikembalikan ke Koordinator/SPV.', () => {
          reviewDraft = null;
          navigate('#/verifikasi');
        });
        ver.status = 'DIKEMBALIKAN';
        ver.return_note = res.note;
        state.reviewLogs.push({
          id: `rl-${Date.now()}`,
          version_id: ver.id,
          user_id: user.id,
          aksi: 'KEMBALIKAN',
          catatan: res.note,
          created_at: `${state.today} 11:02`,
        });
        state.notifications.push({
          id: `ntf-${Date.now()}`,
          user_id: ver.created_by,
          jenis: 'DIKEMBALIKAN',
          target_id: ver.id,
          url: `#/pengajuan/${ver.id}`,
          pesan: `Dikembalikan Manajer: ${ver.judul}. Catatan: ${res.note}`,
          is_read: false,
          is_relevant: true,
          created_at: `${state.today} 11:02`,
        });
        showToast('Pengajuan dikembalikan ke Koordinator/SPV.', 'success');
        navigate('#/verifikasi');
      };
    }
  }

  function viewNotifikasi() {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    if (!isAnyKoordinator(user) && !isAnyManajer(user)) {
      navigate('#/403');
      return;
    }

    const items = state.notifications
      .filter((n) => (user.is_super_admin || n.user_id === user.id) && n.is_relevant)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Notifikasi Aplikasi</h1>
          <p class="page-subtitle">Pemberitahuan pengajuan baru, persetujuan, dan pengembalian dokumen unit Anda.</p>
        </div>
      </div>

      <section class="surface-panel">
        ${items.length === 0 ? `
          <div class="empty-state">
            ${iconSvg('bell')}
            <h3>Belum ada notifikasi</h3>
            <p>Notifikasi muncul otomatis saat terjadi pengajuan atau keputusan verifikasi.</p>
          </div>
        ` : `
          <ul class="timeline">
            ${items
              .map((n) => `
                <li class="timeline-item ${n.is_read ? '' : 'selected'}" data-nid="${n.id}" data-url="${n.url}" tabindex="0" role="button">
                  <div class="timeline-top">
                    <strong>${esc(n.jenis)}</strong>
                    <span class="status-pill status-${n.is_read ? 'neutral' : 'info'}">${n.is_read ? 'Dibaca' : 'Baru'}</span>
                  </div>
                  <div>${esc(n.pesan)}</div>
                  <div class="timeline-meta tabular" style="margin-top:4px;">${esc(formatTimestamp(n.created_at))}</div>
                </li>
              `)
              .join('')}
          </ul>
        `}
      </section>

      <div class="bottom-action-bar">
        <button type="button" class="btn btn-secondary" id="notif-mark-all-page">Tandai Semua Dibaca</button>
      </div>
    `;

    main.querySelectorAll('.timeline-item').forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute('data-nid');
        if (live) return writeAction('notifications/read', 'POST', { id }, '', () => navigate(el.getAttribute('data-url')));
        const item = state.notifications.find((n) => n.id === id);
        if (item) item.is_read = true;
        navigate(el.getAttribute('data-url'));
      };
    });

    document.getElementById('notif-mark-all-page').onclick = () => {
      if (live) return writeAction('notifications/read', 'POST', { all: true }, '', renderRoute);
      state.notifications.forEach((n) => {
        if (user.is_super_admin || n.user_id === user.id) n.is_read = true;
      });
      viewNotifikasi();
      renderChrome(parseRoute());
    };
  }

  // ---------- Admin Pages (Super Admin only) ----------
  async function showTemporaryPassword({ temporaryPassword }) {
    renderRoute();
    if (!temporaryPassword) return;
    await openDialog({
      title: 'Password Awal Pengguna',
      bodyHtml: `<p>Salin password ini untuk pengguna. Pengguna wajib menggantinya saat pertama masuk.</p>
        <input class="input tabular" aria-label="Password awal" value="${esc(temporaryPassword)}" readonly>`,
      confirmLabel: 'Tutup',
    });
  }

  function requireSuperAdmin() {
    const user = getCurrentUser();
    if (!user || !user.is_super_admin) {
      navigate('#/403');
      return false;
    }
    return true;
  }

  function viewAdminUnit() {
    if (!requireSuperAdmin()) return;
    const main = document.getElementById('main-content');
    const q = state.adminUnitSearch.trim().toLowerCase();
    const list = state.units.filter((u) => !q || `${u.kode} ${u.nama}`.toLowerCase().includes(q));

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Manajemen Unit Kerja</h1>
          <p class="page-subtitle">Mengelola ${state.units.length} unit RS AN-NISA dan keterkaitan folder Shared Drive otomatis.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" id="add-unit-btn">${iconSvg('plus')}<span>Tambah Unit</span></button>
        </div>
      </div>

      <section class="surface-panel">
        <div class="filter-subrow">
          <div class="field" style="min-width:280px;">
            <label for="unit-search">Cari kode atau nama unit</label>
            <input id="unit-search" class="input" value="${esc(state.adminUnitSearch)}" placeholder="Contoh: DTO, IGD, Farmasi">
          </div>
          <span class="tabular" style="font-size:var(--text-sm);color:var(--text-secondary);">Menampilkan ${list.length} dari ${state.units.length} unit</span>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Kode</th>
                <th>Nama Unit</th>
                <th>Folder Shared Drive</th>
                <th>Dokumen</th>
                <th>Koord./SPV</th>
                <th>Manajer</th>
                <th>Status</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map((u, idx) => {
                  const docCount = state.documents.filter((d) => d.unit_id === u.id).length;
                  const koCount = state.userUnits.filter((uu) => uu.unit_id === u.id && uu.peran === 'KOORDINATOR' && uu.is_active).length;
                  const mgrNames = state.userUnits
                    .filter((uu) => uu.unit_id === u.id && uu.peran === 'MANAJER' && uu.is_active)
                    .map((uu) => getUser(uu.user_id)?.nama)
                    .filter(Boolean);
                  return `
                    <tr>
                      <td class="tabular">${idx + 1}</td>
                      <td class="tabular"><strong>${esc(u.kode)}</strong></td>
                      <td>${esc(u.nama)}</td>
                      <td class="tabular" style="color:var(--text-secondary);">[${esc(u.kode)} - ${esc(u.nama)}]</td>
                      <td class="tabular">${docCount}</td>
                      <td class="tabular">${koCount}</td>
                      <td>${esc(mgrNames.join(', ') || 'Belum disetel')}</td>
                      <td><span class="status-pill status-${u.is_active ? 'success' : 'danger'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                      <td class="col-actions">
                        <div class="table-actions">
                          <button type="button" class="btn btn-secondary btn-compact" data-unit-toggle="${u.id}">${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                          <button type="button" class="row-menu-btn" data-unit-menu="${u.id}" aria-label="Aksi lainnya unit ${esc(u.nama)}" aria-haspopup="menu" aria-expanded="false">${iconSvg('dots')}</button>
                        </div>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </section>

    `;

    document.getElementById('unit-search').oninput = (e) => {
      state.adminUnitSearch = e.target.value;
      viewAdminUnit();
      const inp = document.getElementById('unit-search');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    };

    document.getElementById('add-unit-btn').onclick = async () => {
      const res = await openDialog({
        title: 'Tambah Unit Kerja Baru',
        bodyHtml: `
          <div class="field-grid">
            <div class="field col-4"><label for="new-u-kode">Kode Unit</label><input id="new-u-kode" class="input" placeholder="PPI"></div>
            <div class="field col-8"><label for="new-u-nama">Nama Unit</label><input id="new-u-nama" class="input" placeholder="Komite PPI"></div>
          </div>
        `,
        confirmLabel: 'Simpan & Buat Folder Drive',
      });
      if (!res) return;
      const kode = (document.getElementById('new-u-kode')?.value || '').trim().toUpperCase();
      const nama = (document.getElementById('new-u-nama')?.value || '').trim();
      if (!kode || !nama) {
        showToast('Kode dan nama unit wajib diisi.', 'error');
        return;
      }
      if (state.units.some((u) => u.kode.toUpperCase() === kode || u.nama.toLowerCase() === nama.toLowerCase())) {
        showToast('Kode/Nama unit sudah terdaftar', 'error');
        return;
      }
      if (live) return writeAction('admin/units', 'POST', { kode, nama }, 'Unit ditambahkan.', renderRoute);
      state.units.push({ id: `u-${Date.now()}`, kode, nama, drive_folder_id: `drv-${kode.toLowerCase()}`, is_active: true });
      showToast(`Unit ${kode} dan folder Drive "[${kode} - ${nama}]" berhasil dibuat.`, 'success');
      viewAdminUnit();
    };

    main.querySelectorAll('[data-unit-toggle]').forEach((btn) => {
      btn.onclick = () => {
        const u = getUnit(btn.getAttribute('data-unit-toggle'));
        if (live && u) return writeAction('admin/units/' + u.id, 'PATCH', { is_active: !u.is_active }, 'Status unit diperbarui.', renderRoute);
        if (u) u.is_active = !u.is_active;
        showToast(`Status unit ${u.nama} diperbarui.`, 'success');
        viewAdminUnit();
      };
    });

    main.querySelectorAll('[data-unit-menu]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const uid = btn.getAttribute('data-unit-menu');
        const unit = getUnit(uid);
        openRowMenu(btn, [
          ...(live ? [{
            label: 'Edit Unit',
            onClick: async () => {
              const res = await openDialog({
                title: 'Edit Unit',
                bodyHtml: `<div class="field-grid">
                  <div class="field col-4"><label for="edit-unit-code">Kode Unit</label><input id="edit-unit-code" class="input" value="${esc(unit.kode)}"></div>
                  <div class="field col-8"><label for="edit-unit-name">Nama Unit</label><input id="edit-unit-name" class="input" value="${esc(unit.nama)}"></div>
                </div>`,
                confirmLabel: 'Simpan Unit',
              });
              if (!res) return;
              return writeAction('admin/units/' + uid, 'PATCH', {
                kode: document.getElementById('edit-unit-code').value, nama: document.getElementById('edit-unit-name').value,
              }, 'Unit diperbarui.', renderRoute);
            },
          }] : []),
          {
            label: 'Hapus Unit',
            icon: 'trash',
            danger: true,
            onClick: () => {
              const hasDocs = state.documents.some((d) => d.unit_id === uid);
              if (hasDocs) {
                showToast('Unit masih memiliki dokumen; hanya dapat dinonaktifkan.', 'error');
                return;
              }
              if (live) return writeAction('admin/units/' + uid, 'DELETE', undefined, 'Unit dihapus.', renderRoute);
              state.units = state.units.filter((u) => u.id !== uid);
              showToast('Unit tanpa dokumen dan folder Drive kosong dihapus.', 'success');
              viewAdminUnit();
            },
          },
        ]);
      };
    });
  }

  function viewAdminPengguna() {
    if (!requireSuperAdmin()) return;
    const main = document.getElementById('main-content');
    const q = state.adminUserSearch.trim().toLowerCase();
    const filtered = state.users.filter((u) => !q || `${u.nama} ${u.nik}`.toLowerCase().includes(q));
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.adminUserPageSize));
    if (state.adminUserPage > totalPages) state.adminUserPage = totalPages;
    const rows = filtered.slice((state.adminUserPage - 1) * state.adminUserPageSize, state.adminUserPage * state.adminUserPageSize);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Manajemen Pengguna</h1>
          <p class="page-subtitle">Daftar akun pegawai berbasis NIK format 0000.00.00.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" id="add-user-btn">${iconSvg('plus')}<span>Tambah Pengguna</span></button>
        </div>
      </div>

      <section class="surface-panel">
        <div class="filter-subrow">
          <div class="field" style="min-width:280px;">
            <label for="user-search">Cari nama atau NIK</label>
            <input id="user-search" class="input" value="${esc(state.adminUserSearch)}" placeholder="Contoh: 1221.21.23 atau Budi">
          </div>
          <span class="tabular" style="font-size:var(--text-sm);color:var(--text-secondary);">Total ${filtered.length} pengguna</span>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>NIK</th>
                <th>Nama Lengkap</th>
                <th>Peran Aktif</th>
                <th>Status</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((u) => `
                  <tr>
                    <td class="tabular"><strong>${esc(u.nik)}</strong></td>
                    <td>${esc(u.nama)}</td>
                    <td>${esc(getRolesSummary(u).join(' · '))}</td>
                    <td><span class="status-pill status-${u.is_active ? 'success' : 'danger'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td class="col-actions">
                      <div class="table-actions">
                        <button type="button" class="btn btn-secondary btn-compact" data-user-reset="${u.id}">Reset Password</button>
                        <button type="button" class="row-menu-btn" data-user-menu="${u.id}" aria-label="Aksi lainnya untuk ${esc(u.nama)}" aria-haspopup="menu" aria-expanded="false">${iconSvg('dots')}</button>
                      </div>
                    </td>
                  </tr>
                `)
                .join('')}
            </tbody>
          </table>
        </div>
      </section>

    `;

    document.getElementById('user-search').oninput = (e) => {
      state.adminUserSearch = e.target.value;
      viewAdminPengguna();
      const inp = document.getElementById('user-search');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    };

    document.getElementById('add-user-btn').onclick = async () => {
      const activeUnits = state.units.filter((u) => u.is_active);
      const res = await openDialog({
        title: 'Tambah Pengguna Baru',
        wide: true,
        bodyHtml: `
          <div class="field-grid">
            <div class="field col-5"><label for="nu-nik">NIK (0000.00.00) <span class="req-mark">*</span></label><input id="nu-nik" class="input tabular" placeholder="1995.03.11"></div>
            <div class="field col-7"><label for="nu-nama">Nama Lengkap &amp; Gelar <span class="req-mark">*</span></label><input id="nu-nama" class="input" placeholder="Ns. Sari Indah, S.Kep"></div>
            ${live ? '<div class="field col-12"><label for="nu-password">Password awal (kosongkan untuk dibuat otomatis)</label><input id="nu-password" type="password" class="input" autocomplete="new-password"></div>' : ''}
            <div class="field col-12">
              <label for="nu-role">Peran Pengguna <span class="req-mark">*</span></label>
              <select id="nu-role" class="select">
                <option value="STAF">Staf (baca seluruh dokumen terbit)</option>
                <option value="KOORDINATOR">Koordinator / SPV (susun &amp; ajukan dokumen unit)</option>
                <option value="MANAJER">Manajer (verifikasi &amp; terbitkan dokumen unit)</option>
                <option value="SUPER_ADMIN">Super Admin (akses penuh sistem)</option>
              </select>
            </div>
            <div class="field col-12" id="nu-home-wrap">
              <label for="nu-home-unit">Unit Utama (opsional)</label>
              <select id="nu-home-unit" class="select">
                <option value="">Staf RS (Umum)</option>
                ${activeUnits.map((u) => `<option value="${esc(u.nama)}">${esc(u.kode)} - ${esc(u.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="field col-12" id="nu-units-wrap" hidden>
              <label for="nu-unit-filter">Penugasan Unit Kerja <span class="req-mark">*</span></label>
              <input id="nu-unit-filter" type="search" class="input" placeholder="Cari nama atau kode unit...">
              <div class="unit-checklist" role="group" aria-label="Pilih unit kerja">
                ${activeUnits.map((u) => `
                  <label class="unit-check-item" data-unit-label="${esc((u.kode + ' ' + u.nama).toLowerCase())}">
                    <input type="checkbox" name="nu-unit" value="${esc(u.id)}">
                    <span><strong>${esc(u.kode)}</strong> - ${esc(u.nama)}</span>
                  </label>
                `).join('')}
              </div>
              <p class="field-help">Pilih satu atau lebih unit yang dikelola oleh pengguna ini.</p>
            </div>
            <p id="nu-form-error" class="field-error col-12" hidden></p>
          </div>
        `,
        confirmLabel: 'Simpan Pengguna',
        onOpen: (dialog) => {
          enhanceSelects(dialog);
          const nikEl = dialog.querySelector('#nu-nik');
          const roleEl = dialog.querySelector('#nu-role');
          const homeWrap = dialog.querySelector('#nu-home-wrap');
          const unitsWrap = dialog.querySelector('#nu-units-wrap');
          const unitFilter = dialog.querySelector('#nu-unit-filter');
          const errEl = dialog.querySelector('#nu-form-error');
          nikEl.oninput = (e) => {
            e.target.value = formatNikInput(e.target.value);
            errEl.hidden = true;
          };
          roleEl.onchange = () => {
            const isUnitRole = ['KOORDINATOR', 'MANAJER'].includes(roleEl.value);
            unitsWrap.hidden = !isUnitRole;
            homeWrap.hidden = isUnitRole;
            errEl.hidden = true;
          };
          unitFilter.oninput = () => {
            const q = unitFilter.value.trim().toLowerCase();
            dialog.querySelectorAll('.unit-check-item').forEach((row) => {
              row.hidden = Boolean(q && !row.dataset.unitLabel.includes(q));
            });
          };
        },
        validate: (dialog) => {
          const errEl = dialog.querySelector('#nu-form-error');
          const showErr = (msg) => {
            errEl.textContent = msg;
            errEl.hidden = false;
            return null;
          };
          const nik = formatNikInput(dialog.querySelector('#nu-nik')?.value || '');
          const nama = (dialog.querySelector('#nu-nama')?.value || '').trim();
          const password = dialog.querySelector('#nu-password')?.value || '';
          const peran = dialog.querySelector('#nu-role')?.value || 'STAF';
          const unitIds = Array.from(dialog.querySelectorAll('input[name="nu-unit"]:checked')).map((el) => el.value);
          const unitHome = dialog.querySelector('#nu-home-unit')?.value || '';
          if (!isValidNik(nik) || !nama) return showErr('Format NIK harus 0000.00.00 dan nama wajib diisi.');
          if (state.users.some((u) => u.nik === nik)) return showErr('NIK sudah terdaftar.');
          if (live && password && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
            return showErr('Password minimal 8 karakter kombinasi huruf dan angka.');
          }
          if (['KOORDINATOR', 'MANAJER'].includes(peran) && unitIds.length === 0) {
            return showErr('Pilih minimal satu unit kerja untuk peran ' + (peran === 'KOORDINATOR' ? 'Koordinator/SPV' : 'Manajer') + '.');
          }
          errEl.hidden = true;
          return { nik, nama, password, peran, unitIds, unitHome };
        },
      });
      if (!res) return;
      if (live) {
        return writeAction('admin/users', 'POST', {
          nik: res.nik,
          nama: res.nama,
          password: res.password,
          peran: res.peran,
          is_super_admin: res.peran === 'SUPER_ADMIN',
          unit_ids: res.unitIds,
          unit_home: res.unitHome,
        }, 'Pengguna tersimpan.', showTemporaryPassword);
      }
      const userId = `usr-${Date.now()}`;
      const assignedNames = res.unitIds.map((uid) => getUnit(uid)?.nama).filter(Boolean);
      state.users.push({
        id: userId,
        nik: res.nik,
        nama: res.nama,
        unit_home: res.unitHome || (assignedNames.length ? assignedNames.join(', ') : 'Staf RS'),
        is_super_admin: res.peran === 'SUPER_ADMIN',
        is_active: true,
        must_change_password: true,
        failed_login: 0,
        locked_until: null,
      });
      if (['KOORDINATOR', 'MANAJER'].includes(res.peran)) {
        res.unitIds.forEach((unitId, idx) => {
          state.userUnits.push({ id: `uu-${Date.now()}-${idx}`, user_id: userId, unit_id: unitId, peran: res.peran, is_active: true });
        });
      }
      showToast(`Pengguna ${res.nama} (${res.nik}) tersimpan.`, 'success');
      viewAdminPengguna();
    };

    main.querySelectorAll('[data-user-reset]').forEach((btn) => {
      btn.onclick = () => {
        const u = getUser(btn.getAttribute('data-user-reset'));
        if (live && u) return writeAction('admin/users/' + u.id + '/reset', 'POST', {}, 'Password direset.', showTemporaryPassword);
        if (u) {
          u.failed_login = 0;
          u.locked_until = null;
          u.must_change_password = true;
        }
        showToast(`Password ${u.nama} direset dan penguncian login dibuka.`, 'success');
      };
    });

    main.querySelectorAll('[data-user-menu]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const u = getUser(btn.getAttribute('data-user-menu'));
        if (!u) return;
        openRowMenu(btn, [
          ...(live ? [{
            label: 'Edit Pengguna',
            onClick: async () => {
              const res = await openDialog({
                title: 'Edit Pengguna',
                bodyHtml: `<div class="field-grid">
                  <div class="field col-5"><label for="edit-user-nik">NIK</label><input id="edit-user-nik" class="input tabular" value="${esc(u.nik)}"></div>
                  <div class="field col-7"><label for="edit-user-name">Nama</label><input id="edit-user-name" class="input" value="${esc(u.nama)}"></div>
                  <div class="field col-12"><label for="edit-user-unit">Unit Utama</label><input id="edit-user-unit" class="input" value="${esc(u.unit_home)}"></div>
                </div>`,
                confirmLabel: 'Simpan Pengguna',
              });
              if (!res) return;
              return writeAction('admin/users/' + u.id, 'PATCH', {
                nik: formatNikInput(document.getElementById('edit-user-nik').value),
                nama: document.getElementById('edit-user-name').value,
                unit_home: document.getElementById('edit-user-unit').value,
              }, 'Pengguna diperbarui.', renderRoute);
            },
          }] : []),
          {
            label: u.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun',
            danger: u.is_active,
            onClick: () => {
              if (u.id === state.currentUserId) {
                showToast('Tidak dapat menonaktifkan akun Super Admin yang sedang aktif.', 'error');
                return;
              }
              if (live) return writeAction('admin/users/' + u.id, 'PATCH', { is_active: !u.is_active }, 'Status akun diperbarui.', renderRoute);
              u.is_active = !u.is_active;
              showToast(`Status akun ${u.nama} diubah.`, 'success');
              viewAdminPengguna();
            },
          },
        ]);
      };
    });
  }

  function viewAdminPenugasan(peran) {
    if (!requireSuperAdmin()) return;
    const main = document.getElementById('main-content');
    const isKoor = peran === 'KOORDINATOR';
    const oppositePeran = isKoor ? 'MANAJER' : 'KOORDINATOR';
    const assignments = state.userUnits.filter((uu) => uu.peran === peran && uu.is_active);
    const activeUsers = state.users.filter((u) => u.is_active);
    const activeUnits = state.units.filter((u) => u.is_active);

    const groupedMap = new Map();
    assignments.forEach((a) => {
      const u = getUser(a.user_id);
      const un = getUnit(a.unit_id);
      if (!groupedMap.has(a.user_id)) {
        groupedMap.set(a.user_id, { userId: a.user_id, user: u, entries: [] });
      }
      groupedMap.get(a.user_id).entries.push({ id: a.id, unitName: un ? un.nama : '-' });
    });
    const grouped = Array.from(groupedMap.values());

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${isKoor ? 'Manajemen Koordinator/SPV' : 'Manajemen Manajer'}</h1>
          <p class="page-subtitle">${isKoor ? 'Tetapkan Koordinator/SPV penyusun dokumen per unit kerja.' : 'Tetapkan Manajer verifikator untuk satu atau beberapa unit.'}</p>
        </div>
      </div>

      <section class="surface-panel">
        <h2 class="section-heading">Tambah Penugasan ${isKoor ? 'Koordinator/SPV' : 'Manajer'}</h2>
        <div class="field-grid" style="align-items:end;">
          <div class="field col-5">
            <label for="assign-user">Pengguna aktif</label>
            <select id="assign-user" class="select">
              ${activeUsers.map((u) => `<option value="${u.id}">${esc(u.nama)} (${esc(u.nik)})</option>`).join('')}
            </select>
          </div>
          <div class="field col-5">
            <label for="assign-unit">Unit kerja aktif</label>
            <select id="assign-unit" class="select">
              ${activeUnits.map((u) => `<option value="${u.id}">${esc(u.nama)}</option>`).join('')}
            </select>
          </div>
          <div class="field col-2">
            <button type="button" class="btn btn-primary" id="assign-save-btn">Simpan</button>
          </div>
        </div>
      </section>

      <section class="surface-panel">
        <h2 class="section-heading">Daftar Penugasan Aktif (${grouped.length} ${isKoor ? 'Koordinator/SPV' : 'Manajer'} · ${assignments.length} Unit)</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Pengguna</th>
                <th>NIK</th>
                <th>Unit Penugasan</th>
                <th class="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${grouped
                .map((g) => `
                  <tr>
                    <td>${esc(g.user?.nama || '-')}</td>
                    <td class="tabular">${esc(g.user?.nik || '-')}</td>
                    <td>${esc(g.entries.map((e) => e.unitName).join(', '))}</td>
                    <td class="col-actions">
                      <div class="table-actions">
                        <button type="button" class="row-menu-btn" data-assign-menu="${g.userId}" aria-label="Kelola penugasan ${esc(g.user?.nama || 'pengguna')}" aria-haspopup="menu" aria-expanded="false">${iconSvg('dots')}</button>
                      </div>
                    </td>
                  </tr>
                `)
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    document.getElementById('assign-save-btn').onclick = () => {
      const uid = document.getElementById('assign-user').value;
      const unitId = document.getElementById('assign-unit').value;
      const conflict = state.userUnits.some((uu) => uu.user_id === uid && uu.unit_id === unitId && uu.peran === oppositePeran && uu.is_active);
      if (conflict) {
        showToast('Ditolak: pengguna tidak boleh menjadi Koordinator/SPV dan Manajer di unit yang sama.', 'error');
        return;
      }
      if (state.userUnits.some((uu) => uu.user_id === uid && uu.unit_id === unitId && uu.peran === peran && uu.is_active)) {
        showToast('Penugasan sudah terdaftar aktif.', 'error');
        return;
      }
      if (live) return writeAction('admin/assignments', 'POST', { user_id: uid, unit_id: unitId, peran }, 'Penugasan tersimpan.', renderRoute);
      state.userUnits.push({ id: `uu-${Date.now()}`, user_id: uid, unit_id: unitId, peran, is_active: true });
      showToast('Penugasan unit tersimpan.', 'success');
      viewAdminPenugasan(peran);
    };

    main.querySelectorAll('[data-assign-menu]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const uid = btn.getAttribute('data-assign-menu');
        const group = grouped.find((g) => g.userId === uid);
        if (!group) return;
        const menuItems = group.entries.map((entry) => ({
          label: `Cabut ${entry.unitName}`,
          icon: 'trash',
          danger: true,
          onClick: () => {
            const item = state.userUnits.find((uu) => uu.id === entry.id);
            if (live) return writeAction('admin/assignments/' + entry.id, 'DELETE', undefined, 'Penugasan dicabut.', renderRoute);
            if (item) item.is_active = false;
            showToast(`Penugasan ${entry.unitName} dicabut. Draf unit tetap utuh untuk koordinator lain.`, 'success');
            viewAdminPenugasan(peran);
          },
        }));
        if (group.entries.length > 1) {
          menuItems.push({
            label: 'Cabut Semua Unit',
            icon: 'trash',
            danger: true,
            onClick: () => {
              const ids = new Set(group.entries.map((entry) => entry.id));
              if (live) return writeAction('admin/assignments/revoke', 'PATCH', { ids: [...ids] }, 'Penugasan dicabut.', renderRoute);
              state.userUnits.forEach((uu) => {
                if (ids.has(uu.id)) uu.is_active = false;
              });
              showToast(`Semua penugasan ${group.user?.nama || ''} dicabut.`, 'success');
              viewAdminPenugasan(peran);
            },
          });
        }
        openRowMenu(btn, menuItems);
      };
    });

    enhanceSelects(main);
  }

  function viewAdminJenisDokumen() {
    if (!requireSuperAdmin()) return;
    const main = document.getElementById('main-content');

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Pengaturan Jenis Dokumen</h1>
          <p class="page-subtitle">Atur contoh format nomor (placeholder formulir) dan versi template untuk 5 jenis dokumen tetap.</p>
        </div>
      </div>

      <section class="surface-panel">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Label Jenis</th>
                <th>Contoh Nomor (Panduan Formulir)</th>
                <th>Versi Template</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${state.categories
                .map((c) => `
                  <tr>
                    <td class="tabular"><strong>${esc(c.kode)}</strong></td>
                    <td>${esc(c.label)}</td>
                    <td><input class="input tabular" data-cat-ex="${c.id}" value="${esc(c.contoh_nomor)}" aria-label="Contoh nomor ${esc(c.label)}"></td>
                    <td style="width:120px;"><input class="input tabular" type="number" min="1" data-cat-ver="${c.id}" value="${c.template_version}" aria-label="Versi template ${esc(c.label)}"></td>
                    <td><button type="button" class="btn btn-primary btn-compact" data-cat-save="${c.id}">Simpan</button></td>
                  </tr>
                `)
                .join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    main.querySelectorAll('[data-cat-save]').forEach((btn) => {
      btn.onclick = () => {
        const cid = btn.getAttribute('data-cat-save');
        const c = getCategory(cid);
        const ex = main.querySelector(`[data-cat-ex="${cid}"]`).value.trim();
        const ver = Number(main.querySelector(`[data-cat-ver="${cid}"]`).value) || 1;
        if (!ex) {
          showToast('Contoh nomor wajib diisi.', 'error');
          return;
        }
        if (live) return writeAction('admin/categories/' + cid, 'PATCH', { contoh_nomor: ex, template_version: ver },
          'Pengaturan jenis dokumen disimpan.', renderRoute);
        c.contoh_nomor = ex;
        c.template_version = ver;
        showToast(`Pengaturan ${c.label} disimpan dan tampil di formulir dokumen.`, 'success');
      };
    });
  }

  // ---------- Auth, Profile, 403 ----------
  function clearLoginFlow() {
    if (state.flowTimer) {
      clearInterval(state.flowTimer);
      state.flowTimer = null;
    }
  }

  function viewLogin(forcePasswordMode = false) {
    clearLoginFlow();
    const main = document.getElementById('main-content');
    const user = getCurrentUser();

    if (forcePasswordMode) {
      main.innerHTML = `
        <section class="auth-card" aria-label="Ganti Password Wajib">
          <div class="auth-header">
            <div class="auth-crest"><img src="assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="42" height="56" class="auth-logo" decoding="async"></div>
            <div>
              <h1 class="page-title">Ganti Password Awal</h1>
              <p class="page-subtitle">Demi keamanan akun ${esc(user?.nik || '')}, tetapkan password baru minimal 8 karakter.</p>
            </div>
          </div>
          <div class="field-grid">
            <div class="field col-12"><label for="gp-pass1">Password baru (huruf dan angka)</label><input id="gp-pass1" type="password" class="input" placeholder="Minimal 8 karakter"></div>
            <div class="field col-12"><label for="gp-pass2">Ulangi password baru</label><input id="gp-pass2" type="password" class="input" placeholder="Ketik ulang password"></div>
            <div class="col-12"><p id="gp-err" class="field-error" hidden></p></div>
            <div class="col-12"><button type="button" class="btn btn-primary" style="width:100%;" id="gp-submit-btn">Simpan Password & Masuk</button></div>
          </div>
        </section>
      `;
      document.getElementById('gp-submit-btn').onclick = () => {
        const p1 = document.getElementById('gp-pass1').value;
        const p2 = document.getElementById('gp-pass2').value;
        const err = document.getElementById('gp-err');
        if (p1.length < 8 || !/[a-zA-Z]/.test(p1) || !/\d/.test(p1)) {
          err.textContent = 'Password minimal 8 karakter kombinasi huruf dan angka.';
          err.hidden = false;
          return;
        }
        if (p1 !== p2) {
          err.textContent = 'Konfirmasi password tidak cocok.';
          err.hidden = false;
          return;
        }
        if (live) return writeAction('auth/password', 'POST', { password: p1 }, 'Password diperbarui.',
          () => navigate('#/dokumen'));
        if (user) user.must_change_password = false;
        state.loggedIn = true;
        showToast('Password diperbarui. Selamat datang di JDIH RS AN-NISA.', 'success');
        navigate('#/dokumen');
      };
      return;
    }

    const FLOW_STEPS = [
      {
        actor: 'Koordinator / SPV',
        title: 'Susun Draf',
        desc: 'Buat dari 5 template resmi atau unggah PDF bertanda tangan (< 4 MB per potongan).',
        pill: 'DRAF',
        docLabel: 'RSAN/SPO/5/IGD/011 · Rev 00',
      },
      {
        actor: 'Sistem Redis Lock',
        title: 'Ajukan & Kunci',
        desc: 'Cek nomor unik seluruh RS (409) dan kunci isi dokumen selama proses pemeriksaan.',
        pill: 'MENUNGGU VERIFIKASI',
        docLabel: 'Terkunci untuk antrean Manajer',
      },
      {
        actor: 'Manajer Unit',
        title: 'Verifikasi Manajer',
        desc: 'Tinjau pratinjau A4 dan riwayat, lalu setujui langsung atau kembalikan dengan catatan.',
        pill: 'DISETUJUI',
        docLabel: 'Dicatat di Review_Log & notifikasi',
      },
      {
        actor: '34 Unit RS AN-NISA',
        title: 'Terbit & Berlaku',
        desc: 'Keberlakuan dihitung otomatis dari tanggal WIB dengan arsip lengkap riwayat versi.',
        pill: 'BERLAKU',
        docLabel: 'Tersedia di pencarian seluruh staf',
      },
    ];

    main.innerHTML = `
      <section class="login-portal" aria-label="Portal Masuk JDIH RS AN-NISA">
        <div class="login-brand-stage">
          <div class="login-brand-top">
            <span class="brand-mark">
              <img src="assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="32" height="42" class="brand-logo" decoding="async">
            </span>
            <span class="brand-copy">
              <strong class="brand-title">JDIH RS AN-NISA</strong>
              <span class="brand-sub">Jaringan Dokumentasi dan Informasi Hukum</span>
            </span>
          </div>

          <div class="login-hero-copy">
            <h1 class="login-hero-title">Satu pintu regulasi terkendali RS AN-NISA</h1>
            <p class="login-hero-sub">Dari penyusunan SK, Kebijakan, Pedoman, dan SPO unit hingga verifikasi Manajer dan arsip versi resmi.</p>
          </div>

          <div class="flow-3d-viewport" id="flow-3d-viewport">
            <div class="flow-3d-scene" id="flow-3d-scene">
              <svg class="flow-connector-svg" viewBox="0 0 600 280" preserveAspectRatio="none" aria-hidden="true">
                <path class="flow-connector-line" d="M 150 68 L 450 68 L 150 205 L 450 205" />
              </svg>

              ${FLOW_STEPS.map((st, idx) => `
                <button type="button" class="flow-card ${state.flowStep === idx ? 'active' : ''}" data-flow-step="${idx}" aria-pressed="${state.flowStep === idx}">
                  <div class="flow-card-head">
                    <span class="flow-card-actor">${esc(st.actor)}</span>
                    <span class="flow-card-dot" aria-hidden="true"></span>
                  </div>
                  <h2 class="flow-card-title">${esc(st.title)}</h2>
                  <p class="flow-card-desc">${esc(st.desc)}</p>
                </button>
              `).join('')}

              <div class="flow-doc-token" id="flow-doc-token" aria-live="polite">
                <span class="flow-token-pill" id="flow-token-pill">${esc(FLOW_STEPS[state.flowStep].pill)}</span>
                <span id="flow-token-label">${esc(FLOW_STEPS[state.flowStep].docLabel)}</span>
              </div>
            </div>
          </div>

          <div class="flow-step-tabs" role="group" aria-label="Pilih tahapan alur aplikasi">
            ${FLOW_STEPS.map((st, idx) => `
              <button type="button" class="flow-step-btn ${state.flowStep === idx ? 'active' : ''}" data-flow-tab="${idx}">${esc(st.title)}</button>
            `).join('')}
          </div>
        </div>

        <div class="login-form-stage">
          <div class="login-form-top">
            <span style="font-size:var(--text-sm);color:var(--text-secondary);font-weight:500;">Akses Internal Pegawai</span>
            <button id="login-theme-btn" class="icon-btn topbar-action-btn" type="button" aria-label="Ubah tema tampilan" aria-pressed="${state.theme === 'dark'}">
              <span class="theme-icon-stage" aria-hidden="true">
                <svg class="theme-svg theme-svg-sun" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="10" cy="10" r="3.5"/>
                  <path d="M10 2.2v1.6M10 16.2v1.6M2.2 10h1.6M16.2 10h1.6M4.5 4.5l1.1 1.1M14.4 14.4l1.1 1.1M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1"/>
                </svg>
                <svg class="theme-svg theme-svg-moon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16.8 11.9A6.8 6.8 0 018.1 3.2a7 7 0 108.7 8.7z"/>
                </svg>
              </span>
            </button>
          </div>

          <div class="login-form-box">
            <div class="auth-header">
              <div class="auth-crest"><img src="assets/logo-rs-annisa.png" alt="Logo RS An-Nisa Tangerang" width="42" height="56" class="auth-logo" decoding="async"></div>
              <div>
                <h2 class="page-title">Masuk JDIH RS AN-NISA</h2>
                <p class="page-subtitle">Gunakan NIK pegawai format 0000.00.00 dan password akun Anda.</p>
              </div>
            </div>

            <form id="login-form" novalidate>
              <div class="field-grid">
                <div class="field col-12">
                  <label for="login-nik">NIK Pegawai</label>
                  <input id="login-nik" class="input tabular" inputmode="numeric" placeholder="1221.21.23" maxlength="10" autocomplete="username">
                  <p class="field-help">Titik disisipkan otomatis saat mengetik 8 digit angka.</p>
                </div>
                <div class="field col-12">
                  <label for="login-pass">Password</label>
                  <div class="pass-input-wrap">
                    <input id="login-pass" type="password" class="input" placeholder="Masukkan password" autocomplete="current-password">
                    <button type="button" id="login-pass-toggle" class="icon-btn pass-toggle-btn" aria-label="Tampilkan password" aria-pressed="false">
                      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z"/>
                        <circle cx="10" cy="10" r="2.2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="col-12">
                  <p id="login-error" class="field-error" hidden></p>
                </div>
                <div class="col-12">
                  <button type="submit" class="btn btn-primary" style="width:100%;">Masuk ke Sistem</button>
                </div>
              </div>
            </form>

            ${live ? '' : `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle);">
              <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-secondary);">Akses Cepat Simulasi Peran</div>
              <div class="demo-login-grid">
                <button type="button" class="btn btn-secondary btn-compact" data-demo-login="usr-staf">Staf (1989.04.12)</button>
                <button type="button" class="btn btn-secondary btn-compact" data-demo-login="usr-koor">Koord. (1985.11.03)</button>
                <button type="button" class="btn btn-secondary btn-compact" data-demo-login="usr-mgr">Manajer (1978.02.19)</button>
                <button type="button" class="btn btn-secondary btn-compact" data-demo-login="usr-admin">Admin (1221.21.23)</button>
              </div>
            </div>`}
          </div>

          <div style="font-size:var(--text-sm);color:var(--text-secondary);text-align:center;">
            RS AN-NISA Tangerang · Repositori Regulasi Internal (Fase 1)
          </div>
        </div>
      </section>
    `;

    function setFlowStep(stepIdx) {
      state.flowStep = (stepIdx + FLOW_STEPS.length) % FLOW_STEPS.length;
      main.querySelectorAll('[data-flow-step]').forEach((el) => {
        const active = Number(el.getAttribute('data-flow-step')) === state.flowStep;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
      });
      main.querySelectorAll('[data-flow-tab]').forEach((el) => {
        const active = Number(el.getAttribute('data-flow-tab')) === state.flowStep;
        el.classList.toggle('active', active);
      });
      const st = FLOW_STEPS[state.flowStep];
      const pill = document.getElementById('flow-token-pill');
      const lbl = document.getElementById('flow-token-label');
      if (pill) pill.textContent = st.pill;
      if (lbl) lbl.textContent = st.docLabel;
    }

    function startFlowCycle() {
      clearLoginFlow();
      if (prefersReducedMotion()) return;
      state.flowTimer = setInterval(() => {
        if (!document.getElementById('flow-3d-scene')) {
          clearLoginFlow();
          return;
        }
        setFlowStep(state.flowStep + 1);
      }, 3200);
    }

    main.querySelectorAll('[data-flow-step], [data-flow-tab]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute('data-flow-step') ?? btn.getAttribute('data-flow-tab'));
        setFlowStep(idx);
        startFlowCycle();
      };
    });

    const viewport3d = document.getElementById('flow-3d-viewport');
    const scene3d = document.getElementById('flow-3d-scene');
    if (viewport3d && scene3d) {
      viewport3d.addEventListener('pointermove', (e) => {
        if (prefersReducedMotion()) return;
        const r = viewport3d.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        scene3d.style.setProperty('--tilt-y', `${(-10 + nx * 12).toFixed(2)}deg`);
        scene3d.style.setProperty('--tilt-x', `${(8 - ny * 10).toFixed(2)}deg`);
      });
      viewport3d.addEventListener('pointerenter', clearLoginFlow);
      viewport3d.addEventListener('pointerleave', () => {
        scene3d.style.setProperty('--tilt-y', '-10deg');
        scene3d.style.setProperty('--tilt-x', '8deg');
        startFlowCycle();
      });
    }

    startFlowCycle();

    const loginThemeBtn = document.getElementById('login-theme-btn');
    if (loginThemeBtn) loginThemeBtn.onclick = toggleThemeWithMotion;

    const passToggle = document.getElementById('login-pass-toggle');
    const passInput = document.getElementById('login-pass');
    if (passToggle && passInput) {
      passToggle.onclick = () => {
        const showing = passInput.type === 'text';
        passInput.type = showing ? 'password' : 'text';
        passToggle.setAttribute('aria-pressed', String(!showing));
        passToggle.setAttribute('aria-label', showing ? 'Tampilkan password' : 'Sembunyikan password');
      };
    }

    const nikInput = document.getElementById('login-nik');
    nikInput.addEventListener('input', (e) => {
      e.target.value = formatNikInput(e.target.value);
    });

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      const nik = formatNikInput(nikInput.value);
      const pass = document.getElementById('login-pass').value;

      if (live) {
        if (saving) return;
        saving = true;
        const button = e.currentTarget.querySelector('[type="submit"]');
        button.disabled = true;
        errEl.hidden = true;
        try {
          await api('auth/login', 'POST', { nik, password: pass });
          navigate(getCurrentUser().must_change_password ? '#/ganti-password' : '#/dokumen');
        } catch (error) {
          errEl.textContent = error.message;
          errEl.hidden = false;
        } finally {
          button.disabled = false;
          saving = false;
        }
        return;
      }

      if (state.loginLockedUntil > Date.now()) {
        errEl.textContent = 'Akun dikunci sementara 15 menit setelah 5 kali gagal login.';
        errEl.hidden = false;
        return;
      }
      if (!isValidNik(nik)) {
        errEl.textContent = 'Format NIK harus 0000.00.00 (contoh 1221.21.23)';
        errEl.hidden = false;
        return;
      }
      const found = state.users.find((u) => u.nik === nik);
      if (!found || pass.length < 4) {
        state.loginAttempts += 1;
        if (state.loginAttempts >= 5) {
          state.loginLockedUntil = Date.now() + 15 * 60 * 1000;
          errEl.textContent = 'Akun dikunci sementara 15 menit setelah 5 kali gagal login.';
        } else {
          errEl.textContent = `NIK atau password salah (percobaan ${state.loginAttempts} dari 5)`;
        }
        errEl.hidden = false;
        return;
      }
      if (!found.is_active) {
        errEl.textContent = 'Akun Anda tidak aktif, hubungi admin';
        errEl.hidden = false;
        return;
      }
      state.loginAttempts = 0;
      state.currentUserId = found.id;
      state.loggedIn = true;
      if (found.must_change_password) {
        navigate('#/ganti-password');
        return;
      }
      showToast(`Masuk sebagai ${found.nama}`, 'success');
      navigate('#/dokumen');
    };

    main.querySelectorAll('[data-demo-login]').forEach((btn) => {
      btn.onclick = () => {
        state.currentUserId = btn.getAttribute('data-demo-login');
        state.loggedIn = true;
        state.loginAttempts = 0;
        const u = getCurrentUser();
        showToast(`Masuk sebagai ${u.nama}`, 'success');
        navigate('#/dokumen');
      };
    });
  }

  function viewProfil() {
    const main = document.getElementById('main-content');
    const user = getCurrentUser();
    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Profil & Keamanan Akun</h1>
          <p class="page-subtitle">Informasi identitas pegawai dan pengaturan password sesi Anda.</p>
        </div>
      </div>

      <div class="workbench-grid">
        <section class="surface-panel">
          <h2 class="section-heading">Identitas Pengguna</h2>
          <dl class="meta-dl">
            <div><dt>Nama Lengkap</dt><dd>${esc(user.nama)}</dd></div>
            <div><dt>NIK</dt><dd class="tabular">${esc(user.nik)}</dd></div>
            <div><dt>Unit Utama</dt><dd>${esc(user.unit_home)}</dd></div>
            <div><dt>Gabungan Hak Akses</dt><dd>${esc(getRolesSummary(user).join(', '))}</dd></div>
          </dl>
        </section>

        <section class="surface-panel">
          <h2 class="section-heading">Ganti Password Sendiri</h2>
          <div class="field-grid">
            <div class="field col-12"><label for="prof-old">Password saat ini</label><input id="prof-old" type="password" class="input"></div>
            <div class="field col-12"><label for="prof-new">Password baru (minimal 8 karakter, huruf & angka)</label><input id="prof-new" type="password" class="input"></div>
            <div class="col-12"><button type="button" class="btn btn-primary" id="prof-save-pass">Simpan Password Baru</button></div>
          </div>
        </section>
      </div>
    `;
    document.getElementById('prof-save-pass').onclick = () => {
      const p = document.getElementById('prof-new').value;
      if (p.length < 8 || !/[a-zA-Z]/.test(p) || !/\d/.test(p)) {
        showToast('Password baru minimal 8 karakter kombinasi huruf dan angka.', 'error');
        return;
      }
      if (live) return writeAction('auth/password', 'POST',
        { current: document.getElementById('prof-old').value, password: p }, 'Password akun diperbarui.', renderRoute);
      showToast('Password akun Anda berhasil diperbarui.', 'success');
      document.getElementById('prof-old').value = '';
      document.getElementById('prof-new').value = '';
    };
  }

  function view403() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <section class="surface-panel" style="max-width:560px;margin:40px auto;text-align:center;">
        <h1 class="page-title">403 - Akses Ditolak</h1>
        <p class="page-subtitle" style="margin:10px auto 20px;">Peran atau penugasan unit Anda tidak memiliki izin untuk membuka halaman atau berkas ini.</p>
        <a href="#/dokumen" class="btn btn-primary">Kembali ke Daftar Dokumen</a>
      </section>
    `;
  }

  // ---------- Router ----------
  function parseRoute() {
    const hash = window.location.hash.startsWith('#/') ? window.location.hash : live ? window.location.pathname : '#/dokumen';
    const clean = hash.startsWith('#') ? hash.slice(1) : hash;
    const path = clean.startsWith('/') ? clean : `/${clean}`;

    if (path === '/login') return { path, title: 'Login' };
    if (path === '/ganti-password') return { path, title: 'Ganti Password' };
    if (path === '/profil') return { path, title: 'Profil Pengguna' };
    if (path === '/dokumen' || path === '/') return { path: '/dokumen', title: 'Daftar Dokumen' };
    if (path === '/dokumen-unit') return { path, title: 'Dokumen Unit Saya' };
    if (path.startsWith('/dokumen/')) return { path, param: path.slice('/dokumen/'.length), title: 'Detail Dokumen' };
    if (path === '/pengajuan') return { path, title: 'Pengajuan Unit' };
    if (path === '/pengajuan/baru') return { path, title: 'Buat Dokumen Baru' };
    if (path.startsWith('/pengajuan/')) return { path, param: path.slice('/pengajuan/'.length), title: 'Edit Draf Dokumen' };
    if (path === '/verifikasi') return { path, title: 'Antrean Verifikasi' };
    if (path.startsWith('/verifikasi/')) return { path, param: path.slice('/verifikasi/'.length), title: 'Detail Verifikasi' };
    if (path === '/notifikasi') return { path, title: 'Notifikasi' };
    if (path === '/admin/unit') return { path, title: 'Admin Unit' };
    if (path === '/admin/pengguna') return { path, title: 'Admin Pengguna' };
    if (path === '/admin/koordinator') return { path, title: 'Admin Koordinator/SPV' };
    if (path === '/admin/manajer') return { path, title: 'Admin Manajer' };
    if (path === '/admin/jenis-dokumen') return { path, title: 'Admin Jenis Dokumen' };
    if (path === '/403') return { path, title: 'Akses Ditolak' };
    return { path: '/dokumen', title: 'Daftar Dokumen' };
  }

  function navigate(hashUrl) {
    if (!live) {
      window.location.hash = hashUrl;
      return;
    }
    const path = hashUrl.replace(/^#/, '');
    if (!/^\/(?!\/)/.test(path)) return;
    if (window.location.pathname !== path || window.location.hash) history.pushState(null, '', path);
    renderRoute();
    if (['/dokumen', '/dokumen-unit', '/pengajuan', '/verifikasi', '/notifikasi'].includes(path)) refreshView(path);
  }

  function renderRoute() {
    reviewSelectionEvents?.abort();
    reviewSelectionEvents = null;
    const route = parseRoute();
    if (!state.loggedIn && route.path !== '/login') {
      navigate('#/login');
      return;
    }
    if (live && state.loggedIn) {
      const needsPassword = getCurrentUser()?.must_change_password;
      if (needsPassword && route.path !== '/ganti-password') return navigate('#/ganti-password');
      if (!needsPassword && ['/login', '/ganti-password'].includes(route.path)) return navigate('#/dokumen');
    }
    closeMobileSidebar();
    closeAllCustomSelects();
    closeRowMenu();
    clearLoginFlow();
    renderChrome(route);

    if (route.path === '/login') viewLogin(false);
    else if (route.path === '/ganti-password') viewLogin(true);
    else if (route.path === '/profil') viewProfil();
    else if (route.path === '/dokumen') viewDaftarDokumen();
    else if (route.path === '/dokumen-unit') viewDaftarDokumen({ myUnitsOnly: true });
    else if (route.path.startsWith('/dokumen/')) viewDetailDokumen(route.param);
    else if (route.path === '/pengajuan') viewPengajuanUnit();
    else if (route.path === '/pengajuan/baru') viewBuatDokumenStep1();
    else if (route.path.startsWith('/pengajuan/')) viewEditDraf(route.param);
    else if (route.path === '/verifikasi') viewAntreanVerifikasi();
    else if (route.path.startsWith('/verifikasi/')) viewDetailVerifikasi(route.param);
    else if (route.path === '/notifikasi') viewNotifikasi();
    else if (route.path === '/admin/unit') viewAdminUnit();
    else if (route.path === '/admin/pengguna') viewAdminPengguna();
    else if (route.path === '/admin/koordinator') viewAdminPenugasan('KOORDINATOR');
    else if (route.path === '/admin/manajer') viewAdminPenugasan('MANAJER');
    else if (route.path === '/admin/jenis-dokumen') viewAdminJenisDokumen();
    else if (route.path === '/403') view403();

    const main = document.getElementById('main-content');
    enhanceSelects(main);

    if (state.lastRoutePath !== route.path && !prefersReducedMotion()) {
      main.classList.remove('page-enter');
      void main.offsetWidth;
      main.classList.add('page-enter');
    }
    state.lastRoutePath = route.path;
  }

  // ---------- Boot ----------
  async function init() {
    applyTheme(state.theme);
    const roleSwitcher = document.querySelector('.sidebar-footer');
    if (roleSwitcher) enhanceSelects(roleSwitcher);

    document.getElementById('theme-toggle-btn').onclick = toggleThemeWithMotion;

    document.getElementById('menu-toggle-btn').onclick = openMobileSidebar;
    document.getElementById('sidebar-close-btn').onclick = closeMobileSidebar;
    document.getElementById('sidebar-backdrop').onclick = closeMobileSidebar;

    const demoRole = document.getElementById('demo-role-select');
    if (demoRole) demoRole.onchange = (e) => {
      const target = state.users.find((u) => u.demo_key === e.target.value);
      if (!target) return;
      state.currentUserId = target.id;
      state.loggedIn = true;
      state.myUnitDocFilters.unitId = '';
      state.myUnitDocFilters.page = 1;
      showToast(`Simulasi peran beralih ke ${target.nama}`, 'success');
      renderRoute();
    };

    document.getElementById('logout-btn').onclick = () => {
      if (live) return writeAction('auth/logout', 'POST', undefined, '', () => {
        receive({ currentUserId: null, documents: [], versions: [], users: [], userUnits: [], units: [],
          categories: [], reviewLogs: [], documentLogs: [], notifications: [] });
        navigate('#/login');
      });
      state.loggedIn = false;
      navigate('#/login');
    };

    const bellBtn = document.getElementById('notif-bell-btn');
    const pop = document.getElementById('notif-popover');
    bellBtn.onclick = async (e) => {
      e.stopPropagation();
      const willOpen = pop.hidden;
      if (willOpen) renderNotifPopover();
      pop.hidden = !willOpen;
      bellBtn.setAttribute('aria-expanded', String(willOpen));
      if (live && willOpen) {
        try {
          const { items } = await api('notifications');
          state.notifications = items;
          if (!pop.hidden) renderNotifPopover();
          renderChrome(parseRoute());
        } catch (error) {
          showToast(error.message, 'error');
        }
      }
    };

    document.addEventListener('click', (e) => {
      closeAllCustomSelects();
      closeRowMenu();
      if (!pop.hidden && !pop.contains(e.target) && !bellBtn.contains(e.target)) {
        pop.hidden = true;
        bellBtn.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('scroll', closeRowMenu, { passive: true });

    (live ? document : document.getElementById('main-content')).addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#/"]');
      if (link && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        navigate(link.getAttribute('href'));
      }
    });

    window.addEventListener(live ? 'popstate' : 'hashchange', renderRoute);
    if (live) window.addEventListener('beforeunload', (event) => {
      if (state.dirtyDraft || state.uploadSim.status === 'UPLOADING') event.preventDefault();
    });
    if (live) {
      const main = document.getElementById('main-content');
      main.innerHTML = '<p class="empty-state" role="status">Memuat JDIH…</p>';
      try {
        receive(await api('state'));
      } catch (error) {
        if (error.status !== 401) showToast(error.message, 'error');
      }
    }
    renderRoute();
  }

  init();
})();
