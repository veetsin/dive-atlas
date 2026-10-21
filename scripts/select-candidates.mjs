#!/usr/bin/env node
// Turn an enumeration-workflow output into research batches, no human curation step:
// drop candidates we already have, merge cross-area duplicates, drop impossible coords, auto-select by tier/kind,
// assign ids, and write <input>.selected.json (batches of 8 per region) + <input>.review.md next to the input.
//   node scripts/select-candidates.mjs <candidates.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, DUP_KM, NAME_KM, kmBetween, nameKeys, slug, checkCoords } from './check-sites-geo.mjs';

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/select-candidates.mjs <candidates.json>');
  process.exit(2);
}
const { result } = JSON.parse(readFileSync(input, 'utf8'));
const sites = JSON.parse(readFileSync(join(root, 'data/sites.json'), 'utf8'));
const DRAWS = new Set(['coldwater', 'wreck', 'cave', 'bigfish', 'freshwater']);
const BATCH = 8;

const keysOf = (en, aliases = []) => new Set([en, ...aliases].flatMap(nameKeys));
// Why `a` is the same place as `b`, or null.
const sameAs = (a, b) => {
  const km = kmBetween(a.coords, b.coords);
  if (km < DUP_KM) return `${km.toFixed(1)} km from`;
  const k = [...a.keys].find((x) => b.keys.has(x));
  if (k && km < NAME_KM) return `same name "${k}" as`;
  if (a.zh && a.zh === b.zh) return `same zh name as`;
  return null;
};

const existing = sites.map((s) => ({ id: s.id, coords: s.coords, zh: s.name?.zh, keys: keysOf(s.name?.en) }));
const dropped = [];
const drop = (c, reason) => dropped.push({ en: c.en, zh: c.zh, area: c.area, reason });

// 1. already in sites.json  2. merge duplicates across areas
const kept = [];
for (const area of result ?? []) {
  for (const raw of area.candidates ?? []) {
    const { source, ...rest } = raw;
    const c = { ...rest, area: area.key, sources: [source].flat().filter(Boolean), keys: keysOf(raw.en, raw.aliases) };
    let why;
    const hit = existing.find((s) => (why = sameAs(c, s)));
    if (hit) {
      drop(c, `already in sites.json: ${why} ${hit.id}`);
      continue;
    }
    const twin = kept.find((k) => (why = sameAs(c, k)));
    if (twin) {
      twin.tier = Math.min(twin.tier, c.tier);
      twin.sources = [...new Set([...twin.sources, ...c.sources])];
      twin.aliases = [...new Set([...(twin.aliases ?? []), ...(c.aliases ?? []), ...(c.en !== twin.en ? [c.en] : [])])];
      c.keys.forEach((k) => twin.keys.add(k));
      drop(c, `merged into "${twin.en}" (${twin.area}): ${why} it`);
      continue;
    }
    kept.push(c);
  }
}

// 3. geo check  4. tier / kind selection  5. ids
const taken = new Set(sites.map((s) => s.id));
const selected = [];
for (const c of kept) {
  const issues = checkCoords(c.coords, c.country?.en, [c.en, c.kind, c.why].join(' '));
  const err = issues.find(([lv]) => lv === 'error');
  if (err) {
    drop(c, `coords: ${err[1]}`);
    continue;
  }
  if (!(c.tier === 1 || c.tier === 2 || (c.tier === 3 && DRAWS.has(c.kind)))) {
    drop(c, `tier ${c.tier}, kind "${c.kind}" is not a draw`);
    continue;
  }
  const base = slug(c.en) || 'site';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  const { keys, ...out } = c;
  const flags = issues.filter(([lv]) => lv === 'warn').map(([, m]) => m);
  selected.push({ id, ...out, ...(flags.length ? { flags } : {}) });
}

const byRegion = Map.groupBy(selected, (c) => c.region);
const batches = [...byRegion].flatMap(([region, list]) =>
  Array.from({ length: Math.ceil(list.length / BATCH) }, (_, i) => ({ key: `${region}-${i + 1}`, region, sites: list.slice(i * BATCH, (i + 1) * BATCH) })),
);

const base = input.replace(/\.json$/i, '');
writeFileSync(`${base}.selected.json`, JSON.stringify({ from: input, count: selected.length, batches }, null, 2) + '\n');

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const link = (u) => {
  try {
    return `[${new URL(u).hostname.replace(/^www\./, '')}](${u})`;
  } catch {
    return cell(u);
  }
};
const md = [
  `# Candidate selection — ${input}`,
  '',
  `${selected.length} selected in ${batches.length} batches · ${dropped.length} dropped`,
  '',
  '| id | zh | en | country | tier | kind | why | source |',
  '|---|---|---|---|---|---|---|---|',
  ...selected.map((c) => `| ${[c.id, c.zh, c.en, c.country?.en, c.tier, c.kind, c.why].map(cell).join(' | ')} | ${c.sources.map(link).join(' ')} |`),
  '',
  ...(selected.some((c) => c.flags) ? ['## Flags (kept)', '', ...selected.filter((c) => c.flags).map((c) => `- \`${c.id}\`: ${c.flags.join('; ')}`), ''] : []),
  '## Dropped',
  '',
  ...dropped.map((d) => `- ${d.en} / ${d.zh ?? ''} (${d.area}): ${d.reason}`),
  '',
];
writeFileSync(`${base}.review.md`, md.join('\n'));

const n = (re) => dropped.filter((d) => re.test(d.reason)).length;
const total = (result ?? []).reduce((a, r) => a + (r.candidates?.length ?? 0), 0);
console.log(
  `candidates ${total} · already have ${n(/^already/)} · merged ${n(/^merged/)} · bad coords ${n(/^coords/)} · ` +
    `tier 3 non-draw ${n(/^tier/)} · selected ${selected.length} in ${batches.length} batches`,
);
console.log(`→ ${base}.selected.json\n→ ${base}.review.md`);
