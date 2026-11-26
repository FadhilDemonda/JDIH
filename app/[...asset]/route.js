import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GET as shell } from '../route.js';

const assets = {
  'app.js': 'text/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'assets/logo-rs-annisa.png': 'image/png',
  'assets/logo-jdih-opt4-layers.svg': 'image/svg+xml',
};

export async function GET(request, context) {
  const { asset } = await context.params;
  const name = asset.join('/');
  if (Object.hasOwn(assets, name)) {
    const source = path.join(process.cwd(), 'mockup', name);
    return new Response(await readFile(source), { headers: { 'Content-Type': assets[name], 'X-Content-Type-Options': 'nosniff' } });
  }
  if (/^(login|ganti-password|profil|dokumen-unit|dokumen(?:\/[^/]+)?|pengajuan(?:\/[^/]+)?|verifikasi(?:\/[^/]+)?|notifikasi|admin\/(unit|pengguna|koordinator|manajer|jenis-dokumen)|403)$/.test(name)) {
    return shell();
  }
  return new Response('Halaman tidak ditemukan.', { status: 404 });
}
