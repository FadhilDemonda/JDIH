import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export async function GET() {
  const template = await readFile(path.join(process.cwd(), 'mockup', 'index.html'), 'utf8');
  const html = template.replace('<html lang="id"', '<html data-jdih-live lang="id"')
    .replace('id="app-shell" class="app-shell"', 'id="app-shell" class="app-shell auth-only"')
    .replace(/      <div class="sidebar-footer">[\s\S]*?      <\/div>/, '')
    .replace('<head>', '<head><base href="/">')
    .replace('  <script src="data.js"></script>', '');
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY' } });
}
