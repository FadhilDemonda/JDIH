import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { cloudEnabled, cloudFileStream, loadCloudState, saveCloudState, withCloudLock, writeCloudChunk, checkCloudFile } from './google-store.mjs';

const root = path.resolve(process.env.JDIH_DATA_DIR || '.jdih');
const stateFile = path.join(root, 'state.json');
const seedFile = path.join(process.cwd(), 'mockup', 'data.js');
let queue = Promise.resolve();

export function serialize(work) {
  const next = queue.then(() => cloudEnabled ? withCloudLock(work) : work());
  queue = next.catch(() => {});
  return next;
}

export async function loadSeed() {
  const context = { window: {} };
  vm.runInNewContext(await readFile(seedFile, 'utf8'), context);
  return context.window.JDIH_SEED;
}

export async function loadState() {
  if (cloudEnabled) return loadCloudState();
  if (process.env.VERCEL === '1') throw Object.assign(new Error('Atur penyimpanan Google untuk deployment Vercel.'), { unavailable: true });
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

export async function saveState(data) {
  if (cloudEnabled) return saveCloudState(data);
  await mkdir(root, { recursive: true });
  const temp = path.join(root, randomUUID() + '.tmp');
  await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
  await rename(temp, stateFile);
}

export function filePath(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid file identifier');
  return path.join(root, 'files', id);
}

export async function saveChunk(file, offset, bytes) {
  if (cloudEnabled) return writeCloudChunk(file, offset, bytes);
  const { id } = file;
  const directory = filePath(id);
  await mkdir(directory, { recursive: true });
  const chunk = path.join(directory, String(offset));
  const temp = path.join(directory, randomUUID());
  await writeFile(temp, bytes, { mode: 0o600 });
  await rename(temp, chunk);
}

export async function readChunk(id, offset) {
  return readFile(path.join(filePath(id), String(offset)));
}

export function fileStream(file) {
  if (cloudEnabled) return cloudFileStream(file);
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index === file.offsets.length) {
        controller.close();
        return;
      }
      controller.enqueue(await readChunk(file.id, file.offsets[index++]));
    },
  });
}

export async function checkFile(file) {
  if (cloudEnabled) return checkCloudFile(file);
  await Promise.all(file.offsets.map((offset) => readChunk(file.id, offset)));
}
