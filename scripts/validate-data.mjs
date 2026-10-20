#!/usr/bin/env node
// Validate data/*.json against the rules in docs/SPEC.md §7.4. Exit 1 on any error.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));

const sites = read('sites.json');
const species = read('species.json');
const regions = read('regions.json');
const labels = read('labels.json');

const errors = [];
const warnings = [];
const err = (ctx, msg) => errors.push(`${ctx}: ${msg}`);
const warn = (ctx, msg) => warnings.push(`${ctx}: ${msg}`);

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LEVELS = new Set(['OW', 'AOW', 'Tech']);
const TYPES = new Set(['reef', 'wall', 'drift', 'wreck', 'cave', 'muck', 'pelagic', 'coldwater', 'kelp']);
const ACCESS = new Set(['shore', 'boat', 'liveaboard']);
const SIZES = new Set(['xl', 'l', 'm', 's']);

const hasText = (o) => o && typeof o.zh === 'string' && o.zh.trim() && typeof o.en === 'string' && o.en.trim();
const cjkLen = (s) => [...s].length;
const wordLen = (s) => s.trim().split(/\s+/).length;

// ---- species ----
const speciesIds = new Set();
for (const s of species) {
  const ctx = `species/${s.id}`;
  if (!KEBAB.test(s.id ?? '')) err(ctx, 'id must be kebab-case');
  if (speciesIds.has(s.id)) err(ctx, 'duplicate id');
  speciesIds.add(s.id);
  if (!hasText(s.name)) err(ctx, 'name needs zh and en');
  if (typeof s.sprite !== 'string' || !s.sprite) err(ctx, 'sprite missing');
  if (!SIZES.has(s.sizeClass)) err(ctx, `sizeClass must be one of ${[...SIZES].join('|')}`);
}

// ---- regions ----
const regionIds = new Set();
for (const r of regions) {
  const ctx = `regions/${r.id}`;
  if (!KEBAB.test(r.id ?? '')) err(ctx, 'id must be kebab-case');
  if (regionIds.has(r.id)) err(ctx, 'duplicate id');
  regionIds.add(r.id);
  if (!hasText(r.name)) err(ctx, 'name needs zh and en');
  if (!Array.isArray(r.center) || r.center.length !== 2) err(ctx, 'center must be [lon, lat]');
  if (!/^#[0-9a-fA-F]{6}$/.test(r.color ?? '')) err(ctx, 'color must be #RRGGBB');
}

// ---- sea labels (base-map ocean / sea names) ----
const labelIds = new Set();
for (const l of labels) {
  const ctx = `labels/${l.id}`;
  if (!KEBAB.test(l.id ?? '')) err(ctx, 'id must be kebab-case');
  if (labelIds.has(l.id)) err(ctx, 'duplicate id');
  labelIds.add(l.id);
  if (![1, 2, 3].includes(l.tier)) err(ctx, 'tier must be 1, 2 or 3');
  if (!hasText(l.name)) err(ctx, 'name needs zh and en');
  const [lon, lat] = Array.isArray(l.at) ? l.at : [NaN, NaN];
  if (!(lon >= -180 && lon <= 180 && lat >= -60 && lat <= 85)) err(ctx, 'at must be [lon, lat] inside the drawn range');
  if (l.along !== undefined && !(Array.isArray(l.along) && l.along.length === 2)) err(ctx, 'along must be two [lon, lat] points');
}

// ---- sites ----
const siteIds = new Set();
const usedSpecies = new Set();
for (const s of sites) {
  const ctx = `sites/${s.id}`;
  if (!KEBAB.test(s.id ?? '')) err(ctx, 'id must be kebab-case');
  if (siteIds.has(s.id)) err(ctx, 'duplicate id');
  siteIds.add(s.id);

  if (!hasText(s.name)) err(ctx, 'name needs zh and en');
  if (!hasText(s.country)) err(ctx, 'country needs zh and en');
  if (!hasText(s.summary)) err(ctx, 'summary needs zh and en');
  else {
    if (cjkLen(s.summary.zh) > 120) warn(ctx, `summary.zh is ${cjkLen(s.summary.zh)} chars (limit 120)`);
    if (wordLen(s.summary.en) > 90) warn(ctx, `summary.en is ${wordLen(s.summary.en)} words (limit 90)`);
  }
  for (const h of s.highlights ?? []) if (!hasText(h)) err(ctx, 'highlight needs zh and en');

  if (!regionIds.has(s.region)) err(ctx, `unknown region "${s.region}"`);

  const [lon, lat] = Array.isArray(s.coords) ? s.coords : [NaN, NaN];
  if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) err(ctx, 'coords must be [lon, lat] in range');

  if (!Array.isArray(s.bestMonths) || s.bestMonths.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
    err(ctx, 'bestMonths must be integers 1–12');
  }
  if (!Array.isArray(s.species)) err(ctx, 'species must be an array');
  else {
    for (const id of s.species) {
      if (!speciesIds.has(id)) err(ctx, `unknown species "${id}"`);
      usedSpecies.add(id);
    }
  }
  if (!LEVELS.has(s.level)) err(ctx, `level must be ${[...LEVELS].join('|')}`);
  if (!Array.isArray(s.types) || !s.types.length || s.types.some((t) => !TYPES.has(t))) err(ctx, 'types invalid');
  if (!Array.isArray(s.access) || !s.access.length || s.access.some((a) => !ACCESS.has(a))) err(ctx, 'access invalid');
  for (const [k, lo, hi] of [['waterTempC', -2, 35], ['visibilityM', 0, 200]]) {
    const v = s[k];
    if (!Array.isArray(v) || v.length !== 2 || !(v[0] >= lo && v[1] <= hi && v[0] <= v[1])) err(ctx, `${k} must be [min, max]`);
  }

  if (!Array.isArray(s.sources)) err(ctx, 'sources must be an array');
  else {
    for (const u of s.sources) {
      try {
        const url = new URL(u);
        if (url.protocol !== 'https:') warn(ctx, `source not https: ${u}`);
      } catch {
        err(ctx, `invalid source URL: ${u}`);
      }
    }
    if (s.verified === true && s.sources.length === 0) err(ctx, 'verified:true requires at least one source');
    if (s.verified !== true) warn(ctx, 'unverified');
  }
  if (typeof s.verified !== 'boolean') err(ctx, 'verified must be boolean');
}

for (const id of speciesIds) if (!usedSpecies.has(id)) warn(`species/${id}`, 'not referenced by any site');

const verifiedCount = sites.filter((s) => s.verified).length;
console.log(`sites: ${sites.length} (verified ${verifiedCount}) · species: ${species.length} · regions: ${regions.length} · labels: ${labels.length}`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log('data OK');
