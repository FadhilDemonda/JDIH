import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'mockup/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'mockup/styles.css'), 'utf8');
const dataJs = fs.readFileSync(path.join(root, 'mockup/data.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'mockup/app.js'), 'utf8');
const graph = JSON.parse(fs.readFileSync(path.join(root, 'graphify-out/graph.json'), 'utf8'));

const issues = [];

// 1. Graphify integrity
const ids = new Set(graph.nodes.map((n) => n.id));
const dangling = graph.links.filter((e) => !ids.has(e.source) || !ids.has(e.target)).length;
const selfLoops = graph.links.filter((e) => e.source === e.target).length;
if (dangling > 0 || selfLoops > 0) issues.push(`Graphify integrity failed: dangling=${dangling}, selfLoops=${selfLoops}`);

// 2. CSS token hygiene
const cssWithoutTokenBlocks = css
  .replace(/:root\s*\{[\s\S]*?\n\}/, '')
  .replace(/\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/, '');
const hardCodedHex = cssWithoutTokenBlocks.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
const hardCodedRgb = cssWithoutTokenBlocks.match(/\brgba?\s*\(/g) || [];
if (hardCodedHex.length || hardCodedRgb.length) {
  issues.push(`Hard-coded colors outside theme blocks: hex=${hardCodedHex.join(',')}, rgb=${hardCodedRgb.length}`);
}
if (/transition\s*:\s*all\b/i.test(css)) {
  issues.push('Found forbidden transition: all in styles.css');
}
if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css)) {
  issues.push('Missing prefers-reduced-motion rule');
}
if (/0\.01ms/.test(css)) {
  issues.push('Found 0.01ms motion kill');
}

// 3. Copy & clutter checks
const emDashes = (html.match(/\u2014/g) || []).length + (appJs.match(/\u2014/g) || []).length;
if (emDashes > 0) issues.push(`Found ${emDashes} em-dashes in mockup HTML/JS`);
if (/eyebrow|kicker/i.test(html + css + appJs)) issues.push('Found eyebrow/kicker class or token');

import vm from 'node:vm';

// 4. Seed parity & asset check
const logoPath = path.join(root, 'mockup/assets/logo-rs-annisa.png');
if (!fs.existsSync(logoPath)) issues.push('Missing mockup/assets/logo-rs-annisa.png');
const ctx = { window: {} };
vm.runInNewContext(dataJs, ctx);
const seedObj = ctx.window.JDIH_SEED;
if (seedObj.UNITS.length !== 34) issues.push(`Expected 34 seed units, got ${seedObj.UNITS.length}`);
if (seedObj.CATEGORIES.length !== 5) issues.push(`Expected 5 categories, got ${seedObj.CATEGORIES.length}`);

// 5. WCAG contrast checker on extracted tokens
function parseTokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}
function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(h1, h2) {
  const l1 = lum(h1);
  const l2 = lum(h2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const lightTokens = parseTokens(css.match(/:root\s*\{([\s\S]*?)\n\}/)[1]);
const darkTokens = parseTokens(css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)[1]);

const pairs = [
  ['text-primary', 'bg-page'],
  ['text-primary', 'bg-surface'],
  ['text-secondary', 'bg-page'],
  ['text-secondary', 'bg-surface'],
  ['text-secondary', 'bg-subtle'],
  ['primary-fg', 'primary'],
  ['primary-text', 'bg-surface'],
  ['sidebar-text', 'sidebar-bg'],
  ['sidebar-muted', 'sidebar-bg'],
  ['sidebar-active-text', 'sidebar-active'],
  ['primary-fg', 'danger-accent'],
  ['primary-fg', 'danger-hover'],
  ['primary-fg', 'primary-hover'],
  ['edit-action-text', 'edit-action-bg'],
  ['accent-orange-ink', 'accent-orange'],
  ['success-text', 'success-bg'],
  ['warning-text', 'warning-bg'],
  ['danger-text', 'danger-bg'],
  ['info-text', 'info-bg'],
  ['neutral-text', 'neutral-bg'],
];

const contrastReport = [];
for (const [mode, tok] of [['light', lightTokens], ['dark', darkTokens]]) {
  for (const [fg, bg] of pairs) {
    const ratio = contrast(tok[fg], tok[bg]);
    contrastReport.push({ mode, pair: `${fg}/${bg}`, ratio: Number(ratio.toFixed(2)) });
    if (ratio < 4.5) issues.push(`WCAG AA fail (${mode}) ${fg}/${bg}: ${ratio.toFixed(2)}:1`);
  }
}

console.log(JSON.stringify({
  ok: issues.length === 0,
  issues,
  graph: { nodes: graph.nodes.length, edges: graph.links.length, hyperedges: graph.hyperedges.length, dangling, selfLoops },
  seed: { units: seedObj.UNITS.length, categories: seedObj.CATEGORIES.length, documents: seedObj.DOCUMENTS.length, versions: seedObj.VERSIONS.length },
  minContrastLight: Math.min(...contrastReport.filter((r) => r.mode === 'light').map((r) => r.ratio)),
  minContrastDark: Math.min(...contrastReport.filter((r) => r.mode === 'dark').map((r) => r.ratio)),
  contrastReport,
}, null, 2));
if (issues.length) process.exit(1);
