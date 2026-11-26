import fs from 'node:fs';
import path from 'node:path';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return false;
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    return true;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = val;
  }
  return true;
}

loadEnvLocal();

if (process.env.JDIH_STORAGE !== 'google') {
  console.log('JDIH_STORAGE bukan "google"; sinkronisasi Google dilewati.');
  process.exit(0);
}

const {
  loadCloudState,
  saveCloudState,
  syncDocumentDriveFolders,
  withCloudLock,
} = await import('../server/google-store.mjs');

await withCloudLock(async () => {
  const state = await loadCloudState();
  if (!state) {
    console.log('Spreadsheet belum memiliki data pengguna; tidak ada yang perlu disinkronkan.');
    return;
  }
  state.operations = {};

  const docById = new Map((state.documents || []).map((doc) => [doc.id, doc]));
  let syncedFolders = 0;
  for (const version of state.versions || []) {
    const hasCloudFile = (state.uploads || []).some((file) => file.drive_id && file.versionId === version.id);
    if (!hasCloudFile) continue;
    const doc = docById.get(version.document_id);
    if (!doc) continue;
    await syncDocumentDriveFolders(doc, version, state);
    syncedFolders += 1;
  }

  await saveCloudState(state, { forceAll: true });
  console.log(`Sinkronisasi Google selesai: 12 tab Sheets diperbarui (${state.documents.length} dokumen, ${state.versions.length} versi), ${syncedFolders} folder Drive versi diperiksa/dirapikan.`);
});
