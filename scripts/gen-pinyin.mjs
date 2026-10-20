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
  // Brackets hold aliases (马拉帕斯夸（妈妈岛）): index them as separate words, drop the punctuation.
  const zh = s.name.zh.replace(/[（）()]/g, ' ').trim();
  const full = pinyin(zh, { toneType: 'none', type: 'array' }).join('');
  const initials = pinyin(zh, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
  const value = `${full} ${initials}`.replace(/\s+/g, ' ').toLowerCase();
  if (s.pinyin !== value) {
    s.pinyin = value;
    changed++;
  }
}
writeFileSync(file, JSON.stringify(sites, null, 2) + '\n');
console.log(`pinyin updated for ${changed} site(s)`);
