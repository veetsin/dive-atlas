#!/usr/bin/env -S node --experimental-strip-types
/**
 * Render the base map + site markers to an SVG (and PNG when a rasteriser is available)
 * without a browser, using the very same projection code as the app and the same layer
 * structure as src/components/MapView.svelte (SPEC §5).
 *
 *   node --experimental-strip-types scripts/preview-map.mts                 # 1280x720, day
 *   node --experimental-strip-types scripts/preview-map.mts 375 640         # phone start view (1.9x on SE Asia)
 *   node --experimental-strip-types scripts/preview-map.mts 1280 720 night  # night theme
 *   node --experimental-strip-types scripts/preview-map.mts 375 700 night globe  # globe mode at zoom 1
 *
 * Globe mode also self-checks: every drawn marker must be inside the disc and on the near side
 * (d3 does not clip points, so a far-side site would otherwise be mirrored onto the near side); exit 1 if not.
 *
 * Output: preview/map-<width>[-night][-globe].svg (+ .png via rsvg-convert, ImageMagick or `npm i -D sharp`).
 * CSS variables are replaced by the token values from src/app.css; keep the two in step.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { geoGraticule, geoArea, geoCircle, geoDistance } from 'd3-geo';
import { merge } from 'topojson-client';
import type { Topology, GeometryCollection, Polygon as TopoPolygon, MultiPolygon as TopoMultiPolygon } from 'topojson-specification';
import type { MultiPolygon, MultiLineString, Polygon, Position } from 'geojson';
import { createMapProjection, createGlobeProjection, globeRadius, UNWRAP_LIST, LAT_RANGE } from '../src/lib/projection.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const width = Number(process.argv[2] ?? 1280);
const height = Number(process.argv[3] ?? 720);
const flags = process.argv.slice(4);
const theme = flags.includes('night') ? 'night' : 'day';
const globe = flags.includes('globe');
const narrow = width < 600;

// ---- tokens (src/app.css) ----
const DAY = {
  oceanDeep: '#0e2a47', oceanMid: '#124a6c', ocean: '#19858f', shallow: '#6fcbbe',
  ringFar: '#6fcbbe', ringMid: '#6fcbbe', ringNear: '#6fcbbe',
  landHi: '#f6ead2', landLo: '#eedcbb', landEdge: '#d8c49a',
  mapLine: '#fbf8f1', coral: '#f2795b', shell: '#f2b5a7', ink: '#13293d', paper: '#fbf8f1',
};
const NIGHT = {
  ...DAY, oceanMid: '#0b1f35', ocean: '#123a5c', shallow: '#2a6a85',
  ringFar: '#2a6a85', ringMid: '#397c97', ringNear: '#4a8fa6',
  landHi: '#3d5b77', landLo: '#33506a', landEdge: 'none',
  mapLine: '#9ed9c9', shell: '#f9a68b', ink: '#fbf8f1', paper: '#13293d',
};
const C = theme === 'night' ? NIGHT : DAY;
const SERIF = `'Songti SC','STSong','Noto Serif CJK SC',Georgia,'Times New Roman',serif`;
const SANS = `-apple-system,'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Helvetica Neue',Arial,sans-serif`;

// ---- data ----
const topoPath = join(root, 'public/geo/countries.topo.json');
if (!existsSync(topoPath)) {
  console.error('No base map yet — run `npm run geo` first.');
  process.exit(1);
}
type Props = { ADM0_A3: string };
type Country = (TopoPolygon<Props> | TopoMultiPolygon<Props>) & { properties: Props };
const topo = JSON.parse(readFileSync(topoPath, 'utf8')) as Topology;
const obj = topo.objects[Object.keys(topo.objects)[0]!] as GeometryCollection<Props>;
const countries = obj.geometries.filter((g): g is Country => (g.type === 'Polygon' || g.type === 'MultiPolygon') && !!g.properties);
const landGeom = merge(topo, countries.filter((g) => !UNWRAP_LIST.has(g.properties.ADM0_A3))) as MultiPolygon;
const grl = countries.filter((g) => UNWRAP_LIST.has(g.properties.ADM0_A3));
const grlGeom = grl.length ? (merge(topo, grl) as MultiPolygon) : null;
const bigGeom: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: landGeom.coordinates.filter((c) => {
    const a = geoArea({ type: 'Polygon', coordinates: c } as Polygon);
    return Math.min(a, 4 * Math.PI - a) >= 1e-4;
  }),
};
const sites = JSON.parse(readFileSync(join(root, 'data/sites.json'), 'utf8')) as { id: string; coords: [number, number]; name: { zh: string } }[];
const labels = JSON.parse(readFileSync(join(root, 'data/labels.json'), 'utf8')) as {
  id: string; tier: 1 | 2 | 3; name: { zh: string; en: string }; at: [number, number]; along?: [[number, number], [number, number]];
}[];

// ---- projection + the app's start view (globe: what the default flat view would hand over, zoom 1) ----
const flat = createMapProjection(width, height);
const centre: [number, number] = narrow ? [118, 8] : flat.projection.invert!([width / 2, height / 2])!;
const p = globe ? createGlobeProjection(width, height, centre) : flat;
const R = globeRadius(width, height);
const k = narrow && !globe ? 1.9 : 1;
let tx = 0, ty = 0;
if (narrow && !globe) {
  const c = p.projection([118, 8])!;
  tx = width / 2 - k * c[0];
  ty = height / 2 - k * c[1];
}
const toScreen = ([x, y]: [number, number]): [number, number] => [tx + k * x, ty + k * y];
const f1 = (n: number) => n.toFixed(1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sw = (px: number) => f1(px / k); // emulates vector-effect: non-scaling-stroke

const landD = p.path(landGeom) ?? '';
const bigD = p.path(bigGeom) ?? '';
const grlD = grlGeom ? (p.unwrappedPath(grlGeom) ?? '') : '';
const graticuleD = p.path((globe ? geoGraticule() : geoGraticule().extent([[-180, LAT_RANGE[0]], [180, LAT_RANGE[1]]])).step([30, 30])()) ?? '';
const capD = globe ? (p.path(geoCircle().center([0, -90]).radius(90 + LAT_RANGE[0])()) ?? '') : '';
const tropics: MultiLineString = {
  type: 'MultiLineString',
  coordinates: [23.436, -23.436].map((lat) => Array.from({ length: 181 }, (_, i): Position => [-180 + i * 2, lat])),
};
const tropicsD = p.path(tropics) ?? '';
const eqY = Math.min(0.85, Math.max(0.15, toScreen(p.projection([150, 0])!)[1] / height));
const pxPerDeg = globe ? (k * 2 * R) / 180 : (k * p.projection.scale() * 0.8707 * Math.PI) / 180;
const TIER_PX = [0, 0, 2.2, 4.5];
const TIER_STYLE = { 1: [18, 0.5, 0.5], 2: [11.5, 0.3, 0.55], 3: [9.5, 0.2, 0.55] } as const;
const seaScale = Math.pow(k, -0.75);

const shelf = theme === 'night'
  ? [[20, 0.18, C.ringFar, '#coast-big'], [10, 0.45, C.ringMid, '#coast'], [4, 0.9, C.ringNear, '#coast']] as const
  : [[28, 0.05, C.ringFar, '#coast-big'], [16, 0.1, C.ringFar, '#coast-big'], [8, 0.2, C.ringMid, '#coast'], [3, 0.34, C.ringNear, '#coast']] as const;

const seas = labels
  .filter((l) => pxPerDeg >= TIER_PX[l.tier]!)
  .map((l) => {
    const pt = p.point(l.at, 70);
    if (!pt) return '';
    let rot = 0;
    if (l.along) {
      const a = p.point(l.along[0]), b = p.point(l.along[1]);
      if (a && b) rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    }
    const [size, sp, op] = TIER_STYLE[l.tier];
    const en = l.tier === 1 ? `<text y="15" dy=".35em" dx=".15em" font-size="8" letter-spacing=".3em" fill-opacity=".4">${esc(l.name.en.toUpperCase())}</text>` : '';
    return `<g transform="translate(${f1(pt[0])},${f1(pt[1])}) scale(${seaScale.toFixed(3)}) rotate(${f1(rot)})"><text dy=".35em" dx="${sp / 2}em" font-size="${size}" letter-spacing="${sp}em" fill-opacity="${op}">${esc(l.name.zh)}</text>${en}</g>`;
  })
  .join('');

const markers = sites
  .map((s) => {
    const pt = p.point(s.coords);
    if (!pt) return '';
    const glow = theme === 'night' ? `<circle r="10" fill="none" stroke="${C.coral}" stroke-width="6" stroke-opacity=".25"/>` : `<circle r="6.5" cy="1.2" fill="${C.oceanDeep}" fill-opacity=".35"/>`;
    const ring = theme === 'night' ? C.shell : C.paper;
    const label = k >= (narrow ? 4 : 2.5)
      ? `<text x="11" y="4" font-family="${SANS}" font-size="11" font-weight="600" fill="${C.ink}" paint-order="stroke" stroke="${C.paper}" stroke-width="3" stroke-opacity=".9" stroke-linejoin="round">${esc(s.name.zh)}</text>`
      : '';
    return `<g transform="translate(${f1(pt[0])},${f1(pt[1])}) scale(${(1 / k).toFixed(3)})">${glow}<circle r="5.5" fill="${ring}"/><circle r="4" fill="${C.coral}"/>${label}</g>`;
  })
  .join('');

// static furniture
let frame = '';
if (!narrow) {
  const o = 18;
  const lines: string[] = [], texts: string[] = [];
  for (let L = -180; L < 180 && !globe; L += 30) {
    const x = toScreen(p.projection([L + 0.001, 0])!)[0];
    if (x < o + 24 || x > width - o - 24) continue;
    const label = L === 0 || L === -180 ? `${Math.abs(L)}°` : `${Math.abs(L)}°${L > 0 ? 'E' : 'W'}`;
    lines.push(`<line x1="${f1(x)}" y1="${o}" x2="${f1(x)}" y2="${o + 4}"/><line x1="${f1(x)}" y1="${height - o}" x2="${f1(x)}" y2="${height - o - 4}"/>`);
    texts.push(`<text x="${f1(x)}" y="${o + 13}" text-anchor="middle">${label}</text>`);
  }
  for (let B = -60; B <= 80 && !globe; B += 30) {
    const y = toScreen(p.projection([150, B])!)[1];
    if (y < o + 24 || y > height - o - 24) continue;
    const label = B === 0 ? '0°' : `${Math.abs(B)}°${B > 0 ? 'N' : 'S'}`;
    lines.push(`<line x1="${o}" y1="${f1(y)}" x2="${o + 4}" y2="${f1(y)}"/><line x1="${width - o}" y1="${f1(y)}" x2="${width - o - 4}" y2="${f1(y)}"/>`);
    texts.push(`<text x="${o + 7}" y="${f1(y + 3)}">${label}</text>`);
  }
  frame = `<g fill="none" stroke="${C.mapLine}" stroke-opacity=".38"><rect x="14" y="14" width="${width - 28}" height="${height - 28}" stroke-width=".6"/><rect x="${o}" y="${o}" width="${width - 2 * o}" height="${height - 2 * o}" stroke-width="1.1"/><g stroke-opacity=".45" stroke-width=".8">${lines.join('')}</g></g>
<g fill="${C.mapLine}" fill-opacity=".5" font-family="${SERIF}" font-size="8.5" letter-spacing=".06em">${texts.join('')}</g>`;
}
const cr = narrow ? 16 : 26, cx = narrow ? width - 30 : width - 56, cy = narrow ? height - 44 : height - 64;
const compass = `<g transform="translate(${cx},${cy})" opacity=".72">
  <circle r="${cr}" fill="none" stroke="${C.mapLine}" stroke-width=".7" stroke-opacity=".8"/><circle r="${cr * 0.78}" fill="none" stroke="${C.mapLine}" stroke-width=".4" stroke-opacity=".5"/>
  <path d="M0,${-cr * 1.08} L${cr * 0.17},0 L0,${cr * 0.5} L${-cr * 0.17},0 Z" fill="${C.mapLine}" fill-opacity=".95"/>
  <path d="M0,${cr} L${cr * 0.14},0 L0,${-cr * 0.4} L${-cr * 0.14},0 Z" fill="${C.mapLine}" fill-opacity=".45"/>
  <path d="M${-cr},0 L0,${cr * 0.14} L${cr * 0.4},0 L0,${-cr * 0.14} Z" fill="${C.mapLine}" fill-opacity=".45"/>
  <path d="M${cr},0 L0,${cr * 0.14} L${-cr * 0.4},0 L0,${-cr * 0.14} Z" fill="${C.mapLine}" fill-opacity=".45"/>
  <circle r="${cr * 0.09}" fill="${C.coral}"/>
  <text y="${-cr * 1.22}" text-anchor="middle" font-family="${SERIF}" font-size="${narrow ? 8 : 11}" fill="${C.mapLine}" fill-opacity=".9">北</text>
</g>`;
let speckle = '';
if (theme === 'night') {
  let seed = 2026;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 120; i++) speckle += `<circle cx="${f1(rnd() * width)}" cy="${f1(rnd() * height)}" r="${rnd() < 0.15 ? 1.3 : 0.8}"/>`;
}
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const disc = (r: number, attrs: string) => `<circle cx="${width / 2}" cy="${height / 2}" r="${f1(r)}" ${attrs}/>`;
const ocean = globe
  ? `<rect width="${width}" height="${height}" fill="${C.oceanDeep}"/>${disc(R * 1.08, 'fill="url(#globe-atmo)"')}${disc(R, 'fill="url(#sea-night)"')}`
  : theme === 'night'
    ? `<rect width="${width}" height="${height}" fill="url(#sea-night)"/>`
    : `<rect width="${width}" height="${height}" fill="url(#sea-v)"/><rect width="${width}" height="${height}" fill="url(#sea-r)"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <g id="coast"><path d="${landD}"/><path d="${grlD}"/></g>
  <g id="coast-big"><path d="${bigD}"/><path d="${grlD}"/></g>
  <linearGradient id="sea-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.oceanDeep}"/><stop offset="${pct(eqY * 0.45)}" stop-color="${C.oceanMid}"/><stop offset="${pct(eqY)}" stop-color="${C.ocean}"/><stop offset="${pct(eqY + (1 - eqY) * 0.55)}" stop-color="${C.oceanMid}"/><stop offset="1" stop-color="${C.oceanDeep}"/></linearGradient>
  <radialGradient id="sea-r" cx=".5" cy="${eqY.toFixed(2)}" r=".7"><stop offset="0" stop-color="${C.shallow}" stop-opacity=".14"/><stop offset=".55" stop-color="${C.shallow}" stop-opacity="0"/><stop offset="1" stop-color="${C.oceanDeep}" stop-opacity=".35"/></radialGradient>
  <radialGradient id="sea-night" cx=".46" cy=".44" r=".72"><stop offset="0" stop-color="${C.ocean}"/><stop offset="1" stop-color="${C.oceanDeep}"/></radialGradient>
  <linearGradient id="land-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="${height}"><stop offset="0" stop-color="${C.landHi}"/><stop offset="1" stop-color="${C.landLo}"/></linearGradient>
  <radialGradient id="vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="${C.oceanDeep}" stop-opacity="0"/><stop offset="1" stop-color="${C.oceanDeep}" stop-opacity=".38"/></radialGradient>
  <radialGradient id="globe-atmo" cx=".5" cy=".5" r=".5"><stop offset=".86" stop-color="${C.shallow}" stop-opacity="0"/><stop offset=".94" stop-color="${C.shallow}" stop-opacity=".35"/><stop offset="1" stop-color="${C.shallow}" stop-opacity="0"/></radialGradient>
  <radialGradient id="globe-shade" cx=".38" cy=".34" r=".8"><stop offset="0" stop-color="${C.oceanDeep}" stop-opacity="0"/><stop offset="1" stop-color="${C.oceanDeep}" stop-opacity=".45"/></radialGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .6 .6 .6 0 -.5"/></filter>
</defs>
${ocean}
<g transform="translate(${f1(tx)},${f1(ty)}) scale(${k})">
  <path d="${graticuleD}" fill="none" stroke="${C.mapLine}" stroke-opacity=".1" stroke-width="${sw(0.75)}"/>
  <path d="${tropicsD}" fill="none" stroke="${C.mapLine}" stroke-opacity=".2" stroke-width="${sw(0.75)}" stroke-dasharray="${sw(3)} ${sw(5)}"/>
  ${globe ? `<path d="${capD}" fill="${C.oceanDeep}" fill-opacity=".5"/>` : ''}
  <g fill="none" stroke-linejoin="round" stroke-linecap="round">${shelf.map(([w, o, col, ref]) => `<use href="${ref}" stroke="${col}" stroke-width="${sw(w)}" stroke-opacity="${o}"/>`).join('')}</g>
  <use href="#coast" fill="url(#land-grad)" stroke="${C.landEdge}" stroke-width="${sw(1)}" stroke-opacity=".8" stroke-linejoin="round"/>
  <g font-family="${SERIF}" fill="${C.mapLine}" text-anchor="middle">${seas}</g>
  ${globe ? disc(R, 'fill="url(#globe-shade)"') + disc(R, `fill="none" stroke="${C.mapLine}" stroke-opacity=".35"`) : ''}
  <g>${markers}</g>
</g>
${theme === 'night' ? `<g fill="${C.mapLine}" fill-opacity=".25">${speckle}</g>` : `<rect width="${width}" height="${height}" fill="url(#vignette)"/>`}
<rect width="${width}" height="${height}" filter="url(#grain)" opacity="${theme === 'night' ? 0.06 : 0.16}"/>
${frame}
${compass}
</svg>`;

const outDir = join(root, 'preview');
mkdirSync(outDir, { recursive: true });
const svgFile = join(outDir, `map-${width}${theme === 'night' ? '-night' : ''}${globe ? '-globe' : ''}.svg`);
writeFileSync(svgFile, svg);
console.log(`wrote ${svgFile} (${(svg.length / 1024).toFixed(0)} KB)`);
// Rasterise if a converter is around: rsvg-convert, ImageMagick (with the rsvg delegate), or sharp.
const png = svgFile.replace(/\.svg$/, '.png');
const attempts = [
  `rsvg-convert -o "${png}" "${svgFile}"`,
  `convert -density 96 "${svgFile}" "${png}"`,
  `node -e "require('sharp')(process.argv[1],{density:144}).png().toFile(process.argv[2])" "${svgFile}" "${png}"`,
];
let done = false;
for (const cmd of attempts) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    done = true;
    break;
  } catch {
    /* try next */
  }
}
console.log(done ? `wrote ${png}` : '(no SVG rasteriser found: install rsvg-convert, or `npm i -D sharp` — the SVG opens in any browser)');

// ---- globe self-check: nothing outside the disc, nothing from the far side ----
if (globe) {
  const bad: string[] = [];
  let near = 0;
  for (const s of sites) {
    const pt = p.point(s.coords);
    if (!pt) continue;
    near++;
    if (Math.hypot(pt[0] - width / 2, pt[1] - height / 2) > R + 0.5 || geoDistance(s.coords, centre) > Math.PI / 2) bad.push(s.id);
  }
  console.log(`centre [${centre.map((v) => v.toFixed(1)).join(', ')}]: ${near}/${sites.length} sites on the near side`);
  const gal = sites.find((s) => s.id === 'galapagos');
  if (gal) console.log(`galapagos ${(geoDistance(gal.coords, centre) * 180 / Math.PI).toFixed(0)}° from the centre: ${p.point(gal.coords) ? 'drawn' : 'hidden'}`);
  if (bad.length) {
    console.error(`FAIL: markers outside the disc or from the far side: ${bad.join(', ')}`);
    process.exit(1);
  }
  console.log('globe self-check OK');
}
