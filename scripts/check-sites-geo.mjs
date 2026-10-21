#!/usr/bin/env node
// Token-free sanity checks for dive-site records: coastal coordinates, country, duplicates, fields,
// and (opt-in, needs network) source URLs. Exit 1 only on errors.
//   node scripts/check-sites-geo.mjs [path/to/sites.json] [--urls]
// The helpers are exported for scripts/select-candidates.mjs.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { geoBounds, geoContains, geoDistance } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COAST_KM = 30;
export const DUP_KM = 15;
// Same normalised name only counts as a duplicate this close: "Cocos Island" (Costa Rica) is not "Cocos (Keeling)".
export const NAME_KM = 1000;
const R = 6371;
const RAD = Math.PI / 180;
const STEP_KM = 5;

// Caves, cenotes, lakes and springs may sit far inland.
const EXEMPT = /cenote|cave|cavern|fresh ?water|lake|spring|silfra|baikal|天坑|洞穴|淡水|湖|泉/i;
// Shown on the site card as the citation host, so no third-party brand may appear there (CLAUDE.md).
const BRANDS = ['padi', 'xiaohongshu', 'xhslink', 'awesomemaps'];

// country.en → Natural Earth NAME_EN values it may fall in. Taiwan / Hong Kong / Macau are China in the CHN POV data.
const AU = ['Australia', 'Australian Indian Ocean Territories', 'Coral Sea Islands', 'Ashmore and Cartier Islands', 'Norfolk Island', 'Heard Island and McDonald Islands'];
const US = ['United States of America', 'United States Minor Outlying Islands', 'United States Virgin Islands', 'Guam', 'Northern Mariana Islands', 'American Samoa', 'Puerto Rico'];
const ALIASES = {
  China: ["People's Republic of China", 'Hong Kong', 'Macau'],
  Taiwan: ["People's Republic of China"],
  'Hong Kong': ["People's Republic of China"],
  Australia: AU,
  'United States': US,
  USA: US,
  Micronesia: ['Federated States of Micronesia'],
  Bahamas: ['The Bahamas'],
  'Caribbean Netherlands': ['Netherlands'],
  Bonaire: ['Netherlands'],
  'Timor-Leste': ['East Timor'],
  Burma: ['Myanmar'],
  Türkiye: ['Turkey'],
};

export const kmBetween = (a, b) => geoDistance(a, b) * R;

const STOP = /\b(the|islands?|reefs?|atolls?|pulau|koh|islas?|ilhas?)\b/g;
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '');
export const normName = (s) => fold(s ?? '').replace(/[^a-z0-9]+/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
// Full name plus the part before "(", "," or a dash: "Koh Lanta – Hin Daeng" also answers to "lanta".
export const nameKeys = (en) => [en, (en ?? '').split(/[(,–—]|\s-\s/)[0]].map(normName).filter(Boolean);
export const slug = (en) => (nameKeys(en).at(-1) ?? 'site').replace(/ /g, '-');

const toXYZ = ([lon, lat]) => {
  const c = Math.cos(lat * RAD);
  return [c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)];
};
const inBox = ([[w, s], [e, n]], lon, lat) => lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

const SHP = join(root, 'scripts/.cache/ne_10m_admin_0_countries_chn.shp');
const DETAIL = join(root, 'scripts/.cache/coast-check.topo.json');

// The shipped 3 % map drops small islands (Ryukyu, most atolls, Azores), so prefer the unsimplified 10m
// shapefile that `npm run geo` caches, converted once with the installed mapshaper.
function loadTopo() {
  if (!existsSync(SHP)) return { topo: readJson(join(root, 'public/geo/countries.topo.json')), detailed: false };
  if (!existsSync(DETAIL) || statSync(DETAIL).mtimeMs < statSync(SHP).mtimeMs) {
    execFileSync(join(root, 'node_modules/.bin/mapshaper'), [SHP, '-filter', "CONTINENT != 'Antarctica'", '-filter-fields', 'NAME_EN', '-clean', '-o', 'format=topojson', 'quantization=1e5', DETAIL], { stdio: 'ignore' });
  }
  return { topo: readJson(DETAIL), detailed: true };
}

let G;
export function geo() {
  if (G) return G;
  const { topo, detailed } = loadTopo();
  const obj = Object.values(topo.objects)[0];
  const countries = obj.geometries.map((g) => {
    const f = feature(topo, g);
    return { name: g.properties?.NAME_EN, f, box: geoBounds(f) };
  });
  // Coastline = arcs used by one country only (a === b). Densified to ≤ 5 km so "nearest sample" ≈ "nearest segment".
  const xyz = [];
  const owner = [];
  obj.geometries.forEach((g, i) => {
    for (const line of mesh(topo, obj, (a, b) => a === b && a === g).coordinates) {
      let prev;
      for (const pt of line) {
        const p = toXYZ(pt);
        if (prev) {
          const n = Math.ceil((Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) * R) / STEP_KM);
          for (let k = 1; k < n; k++) {
            const q = p.map((v, j) => prev[j] + ((v - prev[j]) * k) / n);
            const len = Math.hypot(...q);
            xyz.push(q[0] / len, q[1] / len, q[2] / len);
            owner.push(i);
          }
        }
        xyz.push(...p);
        owner.push(i);
        prev = p;
      }
    }
  });
  return (G = { countries, detailed, xyz: Float64Array.from(xyz), owner: Uint16Array.from(owner) });
}

/** km to the nearest coast, whose coast that is, and km to the coast of any country matching `match`. */
export function locate(lonLat) {
  const { countries, xyz, owner } = geo();
  const [x, y, z] = toXYZ(lonLat);
  const best = new Float64Array(countries.length).fill(-2);
  let top = 0;
  for (let i = 0, j = 0; i < owner.length; i++, j += 3) {
    const d = x * xyz[j] + y * xyz[j + 1] + z * xyz[j + 2];
    if (d > best[owner[i]]) {
      best[owner[i]] = d;
      if (d > best[top]) top = owner[i];
    }
  }
  const km = (d) => Math.acos(Math.min(1, d)) * R;
  return {
    coastKm: km(best[top]),
    nearest: countries[top].name,
    kmTo: (match) => Math.min(...countries.map((c, i) => (match(c.name) ? km(best[i]) : Infinity))),
  };
}

const landAt = ([lon, lat]) => geo().countries.find((c) => inBox(c.box, lon, lat) && geoContains(c.f, [lon, lat]))?.name ?? null;
const validLonLat = (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

/** Geo + country checks for one point. `text` is searched for cave / freshwater words. Returns [level, msg][]. */
export function checkCoords(coords, countryEn, text = '') {
  if (!validLonLat(coords)) return [['error', `coords ${JSON.stringify(coords)} are not [lon, lat] in range`]];
  const out = [];
  const { coastKm, nearest, kmTo } = locate(coords);
  const km = Math.round(coastKm);
  const ok = (n) => n === countryEn || ALIASES[countryEn]?.includes(n);
  const own = countryEn ? kmTo(ok) : 0;
  if (own === Infinity) out.push(['warn', `country "${countryEn}" not in the base map — add an alias in check-sites-geo.mjs`]);

  if (coastKm <= COAST_KM) {
    // Borders are fuzzy near the shore: accept the claimed country if its coast is within 25 km of the nearest one.
    if (own !== Infinity && own > coastKm + 25) out.push(['warn', `nearest coast is ${nearest} (${km} km); ${countryEn} is ${Math.round(own)} km away`]);
  } else {
    const land = landAt(coords);
    if (land) {
      const exempt = EXEMPT.test(text);
      out.push([exempt ? 'info' : 'error', `inland in ${land}, ${km} km from the coast${exempt ? ' — cave/freshwater site, exempt' : ''}`]);
      if (countryEn && !ok(land)) out.push(['warn', `on land in ${land}, not ${countryEn}`]);
    } else {
      // An offshore reef, an island the map lacks, or a sign slip; only worth a warning with the detailed map.
      out.push([geo().detailed ? 'warn' : 'info', `open sea, ${km} km from the nearest mapped coast (${nearest})`]);
    }
  }
  // Something is off: would a flipped sign or swapped pair (a real move, ≥ 300 km) land near the claimed country's coast?
  if (out.length && own !== Infinity && countryEn) {
    const [lon, lat] = coords;
    const near = (c) => validLonLat(c) && kmBetween(c, coords) >= 300 && locate(c).kmTo(ok) <= 2 * COAST_KM;
    const fix = [[-lon, lat], [lon, -lat], [-lon, -lat], [lat, lon]].find(near);
    if (fix) out.push(['warn', `coords look flipped: [${fix}] is near the ${countryEn} coast`]);
  }
  return out;
}

export const exemptText = (s) =>
  [s.id, s.summary?.en, s.summary?.zh, s.notes, ...(s.highlights ?? []).flatMap((h) => [h.en, h.zh])].join(' ');

/** Field checks that matter for research output (validate-data.mjs does the full schema). */
function checkFields(s, speciesIds) {
  const out = [];
  if (!Array.isArray(s.bestMonths) || s.bestMonths.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) out.push(['error', 'bestMonths must be integers 1–12']);
  for (const id of s.species ?? []) if (!speciesIds.has(id)) out.push(['error', `unknown species "${id}"`]);
  if (!s.sources?.length) out.push(['warn', 'no sources']);
  const flagged = new Set();
  for (const u of s.sources ?? []) {
    let url;
    try {
      url = new URL(u);
    } catch {}
    if (!url || !/^https?:$/.test(url.protocol)) out.push(['error', `source is not an http(s) URL: ${u}`]);
    else if (!flagged.has(url.hostname) && BRANDS.some((b) => url.hostname.replace(/[^a-z]/g, '').includes(b))) {
      flagged.add(url.hostname);
      out.push(['warn', `source host shows a third-party brand on the card: ${url.hostname}`]);
    }
  }
  return out;
}

async function checkUrls(sites, report) {
  const byUrl = new Map();
  for (const s of sites) for (const u of s.sources ?? []) byUrl.set(u, [...(byUrl.get(u) ?? []), s.id]);
  const urls = [...byUrl.keys()];
  const status = async (u, method) => {
    const res = await fetch(u, { method, redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (dive-atlas link check)' } });
    await res.body?.cancel();
    return res.status;
  };
  const probe = async (u) => {
    try {
      const st = await status(u, 'HEAD');
      return st >= 400 ? await status(u, 'GET') : st; // many servers refuse HEAD
    } catch (e) {
      return e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code ?? e.message);
    }
  };
  const pool = async (list) => {
    const bad = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < list.length) {
          const u = list[next++];
          const st = await probe(u);
          if (!(st >= 200 && st < 400)) bad.push([u, st]);
        }
      }),
    );
    return bad;
  };
  // Long runs hit transient timeouts; give every failure one more try before reporting it.
  const bad = await pool((await pool(urls)).map(([u]) => u));
  for (const [u, st] of bad) for (const id of byUrl.get(u)) report(id, 'warn', `source ${st}: ${u}`);
  return urls.length;
}

async function main() {
  const t0 = performance.now();
  const args = process.argv.slice(2);
  const file = resolve(args.find((a) => !a.startsWith('--')) ?? join(root, 'data/sites.json'));
  const sites = readJson(file);
  const speciesIds = new Set(readJson(join(root, 'data/species.json')).map((s) => s.id));

  const lines = [];
  const count = { error: 0, warn: 0, info: 0 };
  const report = (id, level, msg) => {
    count[level]++;
    lines.push(`  ${level === 'error' ? 'ERROR' : level.padEnd(5)} ${id}: ${msg}`);
  };

  for (const s of sites) {
    for (const [lv, msg] of checkCoords(s.coords, s.country?.en, exemptText(s))) report(s.id, lv, msg);
    for (const [lv, msg] of checkFields(s, speciesIds)) report(s.id, lv, msg);
  }
  // ponytail: O(n²) pair scan, fine to a few thousand sites.
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const [a, b] = [sites[i], sites[j]];
      const km = validLonLat(a.coords) && validLonLat(b.coords) ? kmBetween(a.coords, b.coords) : Infinity;
      if (km < DUP_KM) report(a.id, 'warn', `${km.toFixed(1)} km from ${b.id} — duplicate?`);
      const same = km < NAME_KM && nameKeys(a.name?.en).find((k) => nameKeys(b.name?.en).includes(k));
      if (same) report(a.id, 'warn', `same normalised name "${same}" as ${b.id}`);
    }
  }
  const urlCount = args.includes('--urls') ? await checkUrls(sites, report) : 0;

  const yearRound = sites.filter((s) => Array.isArray(s.bestMonths) && !s.bestMonths.length).length;
  const map = geo().detailed ? 'full 10m' : 'shipped 3 % (small islands missing, so open-sea distances are info only; `npm run geo` caches the 10m source)';
  if (lines.length) console.log(lines.join('\n'));
  console.log(
    `geo: base map ${map}\ngeo: ${sites.length} sites · ${count.error} error(s) · ${count.warn} warning(s) · ${count.info} info · ` +
      `${yearRound} year-round (empty bestMonths)${urlCount ? ` · ${urlCount} URLs checked` : ''} · ${((performance.now() - t0) / 1000).toFixed(2)} s`,
  );
  if (count.error) process.exit(1);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) await main();
