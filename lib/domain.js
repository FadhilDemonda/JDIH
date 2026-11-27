import { formatDateID, normalizeDocNumber } from './format';

export const SPO_SECTION_LABELS = {
  PENGERTIAN: 'PENGERTIAN',
  TUJUAN: 'TUJUAN',
  KEBIJAKAN_REFERENSI: 'KEBIJAKAN',
  LANGKAH: 'PROSEDUR',
  UNIT_TERKAIT: 'UNIT TERKAIT',
  FORMULIR_PENDUKUNG: 'DOKUMEN PENDUKUNG',
};

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getUser(state, id) {
  return state.users.find((u) => u.id === id) || null;
}

export function getUnit(state, id) {
  return state.units.find((u) => u.id === id) || null;
}

export function getCategory(state, id) {
  return state.categories.find((c) => c.id === id) || null;
}

export function isCategoryActive(cat) {
  return Boolean(cat) && cat.is_active !== false;
}

export function categoryAllowsTemplate(cat) {
  return Boolean(cat) && cat.allow_template !== false;
}

export function isSpoCategoryLayout(cat, doc) {
  if (cat?.layout_type === 'SPO' || cat?.layout_type === 'STANDARD') {
    return cat.layout_type === 'SPO';
  }
  return cat?.kode === 'SPO' || doc?.category_id === 'cat-spo';
}

export function getSortedCategories(categories = []) {
  return [...categories].sort((a, b) => {
    const orderDiff = (Number(a?.urutan) || 999) - (Number(b?.urutan) || 999);
    if (orderDiff !== 0) return orderDiff;
    return (a?.label || '').localeCompare(b?.label || '', 'id', { sensitivity: 'base' });
  });
}

export function getCurrentUser(state) {
  return getUser(state, state.currentUserId);
}

export function getUserUnitsFor(state, userId, peran) {
  return state.userUnits
    .filter((uu) => uu.user_id === userId && uu.is_active && (!peran || uu.peran === peran))
    .map((uu) => uu.unit_id);
}

export function getMyUnitIds(state, user) {
  if (!user) return [];
  const assigned = Array.from(new Set(getUserUnitsFor(state, user.id)));
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

export function getMyUnitPublishedCount(state, user) {
  const myUnitIds = getMyUnitIds(state, user);
  if (!myUnitIds.length) return 0;
  return state.documents.filter(
    (doc) => doc.status_aktif === 'AKTIF' && myUnitIds.includes(doc.unit_id) && Boolean(getPrimaryPublishedVersion(state, doc.id))
  ).length;
}

export function getRolesSummary(state, user) {
  if (!user) return [];
  const roles = ['Staf'];
  if (user.is_super_admin) roles.unshift('Super Admin');
  const ko = getUserUnitsFor(state, user.id, 'KOORDINATOR');
  const mg = getUserUnitsFor(state, user.id, 'MANAJER');
  if (ko.length) roles.push(`Koordinator (${ko.map((id) => getUnit(state, id)?.nama).filter(Boolean).join(', ')})`);
  if (mg.length) roles.push(`Manajer (${mg.map((id) => getUnit(state, id)?.nama).filter(Boolean).join(', ')})`);
  return roles;
}

export function canEditUnit(state, user, unitId) {
  if (!user || !user.is_active) return false;
  if (user.is_super_admin) return true;
  return getUserUnitsFor(state, user.id, 'KOORDINATOR').includes(unitId);
}

export function canVerifyUnit(state, user, unitId) {
  if (!user || !user.is_active) return false;
  if (user.is_super_admin) return true;
  return getUserUnitsFor(state, user.id, 'MANAJER').includes(unitId);
}

export function isAnyKoordinator(state, user) {
  return Boolean(user && (user.is_super_admin || getUserUnitsFor(state, user.id, 'KOORDINATOR').length > 0));
}

export function isAnyManajer(state, user) {
  return Boolean(user && (user.is_super_admin || getUserUnitsFor(state, user.id, 'MANAJER').length > 0));
}

export function getDocVersions(state, docId) {
  return state.versions.filter((v) => v.document_id === docId && v.status !== 'DIHAPUS');
}

export function computeEffectiveStatuses(state, docId) {
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
      map.set(v.id, { code: 'BERLAKU', label: 'Berlaku saat ini', tone: 'success' });
    } else if (v.tgl_berlaku && v.tgl_berlaku > state.today) {
      map.set(v.id, { code: 'BERLAKU_MULAI', label: `Berlaku mulai ${formatDateID(v.tgl_berlaku)}`, tone: 'warning' });
    } else {
      map.set(v.id, { code: 'VERSI_SEBELUMNYA', label: 'Versi Sebelumnya', tone: 'neutral' });
    }
  }
  return { map, currentBerlakuId };
}

export function getPrimaryPublishedVersion(state, docId) {
  const approved = state.versions.filter((v) => v.document_id === docId && v.status === 'DISETUJUI');
  if (!approved.length) return null;
  const { map, currentBerlakuId } = computeEffectiveStatuses(state, docId);
  if (currentBerlakuId) {
    return { version: approved.find((v) => v.id === currentBerlakuId), eff: map.get(currentBerlakuId) };
  }
  const upcoming = approved
    .slice()
    .sort((a, b) => a.tgl_berlaku.localeCompare(b.tgl_berlaku))[0];
  return { version: upcoming, eff: map.get(upcoming.id) };
}

export function checkNumberConflict(state, rawNum, currentDocId) {
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

export function getOpenRevision(state, docId) {
  return state.versions.find(
    (v) => v.document_id === docId && ['DRAF', 'MENUNGGU_VERIFIKASI', 'DIKEMBALIKAN'].includes(v.status)
  ) || null;
}

export function getPendingVerificationCountFor(state, user) {
  if (!isAnyManajer(state, user)) return 0;
  return state.versions.filter((v) => {
    if (v.status !== 'MENUNGGU_VERIFIKASI') return false;
    const doc = state.documents.find((d) => d.id === v.document_id);
    return doc && canVerifyUnit(state, user, doc.unit_id);
  }).length;
}

export function getUnreadNotifications(state, user) {
  if (!user) return [];
  return state.notifications
    .filter((n) => (user.is_super_admin || n.user_id === user.id) && n.is_relevant && !n.is_read)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getScanPdfAttachment(version) {
  return (version?.attachments || []).find((file) => file.kind === 'PDF') || null;
}

export function returnedAnnotations(state, version) {
  if (!version || version.status !== 'DIKEMBALIKAN') return [];
  return state.reviewLogs.findLast((log) => log.version_id === version.id && log.aksi === 'KEMBALIKAN')?.annotations || [];
}

export function draftInput(version) {
  const {
    edit_version,
    judul,
    nomor,
    revisi_label,
    tgl_dokumen,
    tgl_berlaku,
    kata_kunci,
    ringkasan_perubahan,
    sections,
  } = version;
  return {
    edit_version,
    judul,
    nomor,
    revisi_label,
    tgl_dokumen,
    tgl_berlaku,
    kata_kunci,
    ringkasan_perubahan,
    sections,
  };
}
