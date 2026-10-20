#!/usr/bin/env node
// Gate on the two hard constraints the build can prove: no runtime request to another origin
// (CLAUDE.md #1) and first-load gzip within budget (#7). Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const BUDGET = 800 * 1024;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dist);

// Patterns that would make the browser fetch from another origin. Plain https:// strings
// (data sources, svelte error docs) are text, not requests, and are deliberately not matched.
const RULES = {
  '.html': [/(?:src|href)=["']https?:\/\//i, /rel=["']?(?:preconnect|dns-prefetch|preload)["']?[^>]+https?:\/\//i],
  '.css': [/url\(\s*["']?https?:\/\//i, /@import\s+(?:url\()?["']?https?:\/\//i],
  '.js': [
    /\bfetch\(\s*["'`]https?:\/\//,
    /\bimport\(\s*["'`]https?:\/\//,
    /new\s+(?:Image|XMLHttpRequest|WebSocket|EventSource)\([^)]*["'`]https?:\/\//,
    /\.src\s*=\s*["'`]https?:\/\//,
  ],
};

// The budget is for the FIRST load: html + bundled js/css + the base map. Sprites and the
// optional detail map are lazy-loaded and must not count against it.
const firstLoad = (p) => /^(index\.html|assets\/[^/]+\.(?:js|css)|geo\/countries\.topo\.json)$/.test(relative(dist, p));

let problems = 0;
let gzipTotal = 0;
for (const f of files) {
  const buf = readFileSync(f);
  if (firstLoad(f)) gzipTotal += gzipSync(buf).length;
  const rules = RULES[extname(f)];
  if (!rules) continue;
  const text = buf.toString('utf8');
  for (const re of rules) {
    const m = text.match(re);
    if (m) {
      console.log(`EXTERNAL  ${relative(dist, f)}: ${m[0].slice(0, 80)}`);
      problems++;
    }
  }
}
console.log(`dist: ${files.length} files, first load ${(gzipTotal / 1024).toFixed(0)} KB gzip (budget ${BUDGET / 1024} KB)`);
if (gzipTotal > BUDGET) {
  console.log('OVER BUDGET');
  problems++;
}
if (problems) {
  console.log(`\n${problems} problem(s)`);
  process.exit(1);
}
console.log('dist OK');
