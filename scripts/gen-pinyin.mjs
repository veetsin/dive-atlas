#!/usr/bin/env node
// Fill the `pinyin` field of every site from name.zh so search can match pinyin
// without shipping a pinyin library to the browser. Run after editing data/sites.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pinyin } from 'pinyin-pro';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sites.json');
const sites = JSON.parse(readFileSync(file, 'utf8'));

let changed = 0;
for (const s of sites) {
  const full = pinyin(s.name.zh, { toneType: 'none', type: 'array' }).join('');
  const initials = pinyin(s.name.zh, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
  const value = `${full} ${initials}`.toLowerCase();
  if (s.pinyin !== value) {
    s.pinyin = value;
    changed++;
  }
}
writeFileSync(file, JSON.stringify(sites, null, 2) + '\n');
console.log(`pinyin updated for ${changed} site(s)`);
