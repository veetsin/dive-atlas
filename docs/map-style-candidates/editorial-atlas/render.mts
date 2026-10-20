#!/usr/bin/env -S node --experimental-strip-types
/**
 * "Editorial atlas" design proof for Dive Atlas. Standalone: reads the real
 * topology / sites / projection, writes map-1280.{svg,png} (world, desktop) and
 * map-375.{svg,png} (phone, 1.9x on Southeast Asia). Nothing under the project
 * directory is touched.
 *
 *   node --experimental-strip-types render.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoGraticule10, geoContains, geoArea } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { createMapProjection, UNWRAP_LIST } from '/Users/veetsin/Documents/coding/dive-atlas/src/lib/projection.ts';

const PROJECT = '/Users/veetsin/Documents/coding/dive-atlas';
const OUT = dirname(fileURLToPath(import.meta.url));

// ---- palette: hex now, and the src/app.css token each one maps to ----
const C = {
  oceanDeep: '#0E2A47', // --ocean-deep (unchanged)
  oceanMid: '#124A6C', // --ocean-mid (NEW)
  ocean: '#19858F', // --ocean (was #1A9E9A)
  lagoon: '#6FCBBE', // --ocean-shallow (was #7FD4C8; a touch less neon against indigo)
  land: '#F3E6CB', // --land (was #F3E3C3)
  landEdge: '#D8C49A', // --land-edge (NEW)
  coral: '#F2795B', // --coral
  paper: '#FBF8F1', // --paper
  ink: '#13293D', // --ink
};
const SERIF = `'Songti SC','Noto Serif CJK SC',Georgia,'Times New Roman',serif`;
const SANS = `-apple-system,'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Helvetica Neue',Arial,sans-serif`;

// ---- ocean / sea names: this array is what data/labels.json would hold ----
// tier 1 = oceans, 2 = major seas, 3 = minor seas (minZoom gates them)
type Label = { zh: string; en: string; at: [number, number]; tier: 1 | 2 | 3; along?: [[number, number], [number, number]] };
const LABELS: Label[] = [
  { zh: '北太平洋', en: 'North Pacific Ocean', at: [-170, 33], tier: 1 },
  { zh: '南太平洋', en: 'South Pacific Ocean', at: [-128, -29], tier: 1 },
  { zh: '印度洋', en: 'Indian Ocean', at: [81, -27], tier: 1 },
  { zh: '南大西洋', en: 'South Atlantic Ocean', at: [-12, -27], tier: 1 },
  { zh: '北大西洋', en: 'North Atlantic Ocean', at: [-50, 33], tier: 2 },
  { zh: '北冰洋', en: 'Arctic Ocean', at: [140, 80], tier: 2 },
  { zh: '南大洋', en: 'Southern Ocean', at: [40, -56], tier: 2 },
  { zh: '南海', en: 'South China Sea', at: [113.5, 15.5], tier: 2 },
  { zh: '菲律宾海', en: 'Philippine Sea', at: [134, 20.5], tier: 2 },
  { zh: '珊瑚海', en: 'Coral Sea', at: [159.5, -19.5], tier: 2 },
  { zh: '阿拉伯海', en: 'Arabian Sea', at: [63.5, 11.5], tier: 2 },
  { zh: '孟加拉湾', en: 'Bay of Bengal', at: [88, 10], tier: 3 },
  { zh: '白令海', en: 'Bering Sea', at: [-177, 56.5], tier: 2 },
  { zh: '塔斯曼海', en: 'Tasman Sea', at: [161, -39.5], tier: 2 },
  { zh: '加勒比海', en: 'Caribbean Sea', at: [-76, 15], tier: 3 },
  { zh: '地中海', en: 'Mediterranean Sea', at: [18.5, 34.5], tier: 3 },
  { zh: '鄂霍次克海', en: 'Sea of Okhotsk', at: [149, 52.5], tier: 3 },
  { zh: '红海', en: 'Red Sea', at: [38, 20], tier: 3, along: [[33, 28], [42, 13.5]] },
  { zh: '安达曼海', en: 'Andaman Sea', at: [95.5, 11], tier: 3 },
  { zh: '爪哇海', en: 'Java Sea', at: [111, -5], tier: 3 },
  { zh: '班达海', en: 'Banda Sea', at: [127.5, -5.5], tier: 3 },
  { zh: '帝汶海', en: 'Timor Sea', at: [127.5, -11.5], tier: 3 },
  { zh: '东海', en: 'East China Sea', at: [125.5, 28.5], tier: 3 },
  { zh: '苏禄海', en: 'Sulu Sea', at: [120.3, 8.3], tier: 3 },
  { zh: '墨西哥湾', en: 'Gulf of Mexico', at: [-90.5, 25], tier: 3 },
];
const TIER = {
  1: { size: 18, spacing: 0.5, opacity: 0.5, minZoom: 1 },
  2: { size: 11.5, spacing: 0.3, opacity: 0.55, minZoom: 1 },
  3: { size: 9.5, spacing: 0.2, opacity: 0.55, minZoom: 1.8 },
};

// ---- data ----
type Props = { ADM0_A3: string };
const topo = JSON.parse(readFileSync(join(PROJECT, 'public/geo/countries.topo.json'), 'utf8')) as Topology;
const obj = topo.objects[Object.keys(topo.objects)[0]!] as GeometryCollection<Props>;
const fc = feature(topo, obj) as FeatureCollection<Geometry, Props>;
// Coastlines only: dissolve every non-unwrapped country into one MultiPolygon.
const mainland = merge(topo, obj.geometries.filter((g) => !UNWRAP_LIST.has(g.properties!.ADM0_A3)));
const unwrapped = fc.features.filter((f) => UNWRAP_LIST.has(f.properties.ADM0_A3));
const landFeature: Feature = { type: 'Feature', properties: {}, geometry: mainland };
// Wide shelf bands only around polygons bigger than ~4000 km²; specks get the narrow bands
// only, otherwise every atoll turns into a concentric target.
const SMALL_SR = 1e-4;
const polyArea = (c: number[][][]) => { const a = geoArea({ type: 'Polygon', coordinates: c } as Geometry); return Math.min(a, 4 * Math.PI - a); };
const bigLand: Geometry = { type: 'MultiPolygon', coordinates: mainland.coordinates.filter((c) => polyArea(c) >= SMALL_SR) };
console.log(`land polygons: ${mainland.coordinates.length}, of which ${bigLand.coordinates.length} get the wide shelf`);
const sites = JSON.parse(readFileSync(join(PROJECT, 'data/sites.json'), 'utf8')) as {
  id: string;
  coords: [number, number];
  name: { zh: string; en: string };
}[];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (n: number) => n.toFixed(1);
type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---- one render ----
function render(width: number, height: number, k: number, centre: [number, number] | null) {
  const p = createMapProjection(width, height);
  const phone = width < 600;

  // zoom transform, exactly as MapView's narrow-screen start
  let zoom = '';
  let tx = 0, ty = 0;
  if (centre) {
    const c = p.projection(centre)!;
    tx = width / 2 - k * c[0];
    ty = height / 2 - k * c[1];
    zoom = `translate(${f1(width / 2)},${f1(height / 2)}) scale(${k}) translate(${f1(-c[0])},${f1(-c[1])})`;
  }
  const toScreen = (pt: [number, number]): [number, number] => [tx + k * pt[0], ty + k * pt[1]];
  const fromScreen = (s: [number, number]): [number, number] => [(s[0] - tx) / k, (s[1] - ty) / k];
  const onLand = (s: [number, number]) => {
    const ll = p.projection.invert?.(fromScreen(s));
    return !!ll && (geoContains(landFeature, ll) || unwrapped.some((f) => geoContains(f, ll)));
  };

  const landDefs = [
    `<path id="land-main" d="${p.path(mainland)}"/>`,
    `<path id="land-big" d="${p.path(bigLand)}"/>`,
    ...unwrapped.map((f, i) => `<path id="land-u${i}" d="${p.unwrappedPath(f)}"/>`),
  ].join('\n');
  const landUse = ['<use href="#land-main"/>', ...unwrapped.map((_, i) => `<use href="#land-u${i}"/>`)].join('');
  const bigUse = ['<use href="#land-big"/>', ...unwrapped.map((_, i) => `<use href="#land-u${i}"/>`)].join('');
  const graticule = p.path(geoGraticule10()) ?? '';

  // continental shelf: 4 strokes, constant px width, widest first
  const shelf = ([
    [28, 0.05, bigUse],
    [16, 0.1, bigUse],
    [8, 0.2, landUse],
    [3, 0.34, landUse],
  ] as const)
    .map(([w, o, use]) => `<g stroke-width="${f1(w / k)}" stroke-opacity="${o}">${use}</g>`)
    .join('\n');

  // markers with greedy label placement (screen px). Placed first: content beats decoration.
  const FS = 10.5;
  const placed: Box[] = [];
  const pts = sites
    .map((s) => ({ s, pt: p.projection(s.coords) }))
    .filter((m): m is { s: (typeof sites)[0]; pt: [number, number] } => !!m.pt)
    .map((m) => ({ ...m, sc: toScreen(m.pt) }))
    .filter((m) => m.sc[0] > -20 && m.sc[0] < width + 20 && m.sc[1] > -20 && m.sc[1] < height + 20);
  for (const m of pts) placed.push({ x: m.sc[0] - 7, y: m.sc[1] - 7, w: 14, h: 14 });
  const hit = (b: Box) => placed.some((o) => overlaps(b, o)) || b.x < 4 || b.y < 4 || b.x + b.w > width - 4 || b.y + b.h > height - 4;
  const markers = pts
    .map((m) => {
      const name = m.s.name.zh;
      const w = name.length * FS + 6;
      const h = FS + 4;
      const cands: [string, number, number, Box][] = [
        ['middle', 0, 20, { x: m.sc[0] - w / 2, y: m.sc[1] + 10, w, h }],
        ['start', 10, 4, { x: m.sc[0] + 8, y: m.sc[1] - h / 2, w, h }],
        ['end', -10, 4, { x: m.sc[0] - 8 - w, y: m.sc[1] - h / 2, w, h }],
        ['middle', 0, -12, { x: m.sc[0] - w / 2, y: m.sc[1] - 10 - h, w, h }],
        ['start', 7, -9, { x: m.sc[0] + 6, y: m.sc[1] - 9 - h, w, h }],
        ['end', -7, -9, { x: m.sc[0] - 6 - w, y: m.sc[1] - 9 - h, w, h }],
        ['start', 7, 17, { x: m.sc[0] + 6, y: m.sc[1] + 8, w, h }],
        ['end', -7, 17, { x: m.sc[0] - 6 - w, y: m.sc[1] + 8, w, h }],
      ];
      const c = cands.find(([, , , b]) => !hit(b));
      if (c) placed.push(c[3]);
      const label = c
        ? `<text font-family="${SANS}" font-size="${FS}" font-weight="500" fill="${C.ink}" text-anchor="${c[0]}" x="${c[1]}" y="${c[2]}" paint-order="stroke" stroke="${C.paper}" stroke-width="2.5" stroke-linejoin="round" stroke-opacity="0.9">${esc(name)}</text>`
        : '';
      return `<g transform="translate(${f1(m.pt[0])},${f1(m.pt[1])}) scale(${(1 / k).toFixed(3)})">
  <circle r="6.5" cy="1.2" fill="${C.oceanDeep}" fill-opacity="0.35"/>
  <circle r="5.5" fill="${C.paper}"/>
  <circle r="4" fill="${C.coral}"/>
  ${label}
</g>`;
    })
    .join('\n');

  // ocean names: px size ∝ k^0.25 (grow a little with zoom, never balloon)
  const labelScale = Math.pow(k, -0.75);
  const oceanLabels = LABELS.filter((l) => k >= TIER[l.tier].minZoom)
    .map((l) => {
      const pt = p.projection(l.at);
      if (!pt) return '';
      const t = TIER[l.tier];
      const px = t.size * k * labelScale; // on-screen font size
      const w = l.zh.length * px * (1 + t.spacing);
      const s = toScreen(pt);
      let rot = 0;
      if (l.along) {
        const a = toScreen(p.projection(l.along[0])!), b = toScreen(p.projection(l.along[1])!);
        rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      }
      const box: Box = { x: s[0] - w / 2, y: s[1] - px * 0.6, w, h: px * 1.2 };
      if (box.x < 6 || box.y < 6 || box.x + box.w > width - 6 || box.y + box.h > height - 6) return '';
      if (placed.some((o) => overlaps(box, o))) return ''; // never under a marker or its label
      // sample along the baseline; any sample on land → hide and warn
      const n = Math.max(3, Math.round(w / 12));
      for (let i = 0; i <= n; i++) {
        const u = -w / 2 + (w * i) / n;
        const rad = (rot * Math.PI) / 180;
        for (const v of [-px * 0.4, 0, px * 0.4]) {
          if (onLand([s[0] + u * Math.cos(rad) - v * Math.sin(rad), s[1] + u * Math.sin(rad) + v * Math.cos(rad)])) {
            console.warn(`  ${width}: "${l.zh}" touches land, hidden`);
            return '';
          }
        }
      }
      placed.push(box);
      return `<g transform="translate(${f1(pt[0])},${f1(pt[1])}) scale(${labelScale.toFixed(3)}) rotate(${f1(rot)})"><text font-size="${t.size}" letter-spacing="${t.spacing}em" fill-opacity="${t.opacity}" dx="${t.spacing / 2}em">${esc(l.zh)}</text></g>`;
    })
    .join('\n');

  // static furniture: frame + ticks (desktop), compass, title, grain, vignette
  let frame = '';
  if (!phone) {
    const o1 = 14, o2 = 18;
    const lines: string[] = [];
    const texts: string[] = [];
    for (let lon = -180; lon < 180; lon += 30) {
      const xv = p.projection([lon + 0.001, 0])![0];
      if (xv < o2 + 24 || xv > width - o2 - 24) continue;
      const x = f1(xv);
      const txt = lon === 0 || lon === -180 ? `${Math.abs(lon)}°` : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
      lines.push(`<line x1="${x}" y1="${o2}" x2="${x}" y2="${o2 + 4}"/><line x1="${x}" y1="${height - o2}" x2="${x}" y2="${height - o2 - 4}"/>`);
      texts.push(`<text x="${x}" y="${o2 + 13}" text-anchor="middle">${txt}</text>`);
    }
    for (let lat = -60; lat <= 80; lat += 30) {
      const y = p.projection([150, lat])![1];
      const txt = lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
      lines.push(`<line x1="${o2}" y1="${f1(y)}" x2="${o2 + 4}" y2="${f1(y)}"/><line x1="${width - o2}" y1="${f1(y)}" x2="${width - o2 - 4}" y2="${f1(y)}"/>`);
      texts.push(`<text x="${o2 + 7}" y="${f1(y + 3)}">${txt}</text>`);
    }
    frame = `<g fill="none" stroke="${C.paper}" stroke-opacity="0.38">
  <rect x="${o1}" y="${o1}" width="${width - 2 * o1}" height="${height - 2 * o1}" stroke-width="0.6"/>
  <rect x="${o2}" y="${o2}" width="${width - 2 * o2}" height="${height - 2 * o2}" stroke-width="1.1"/>
  <g stroke-opacity="0.45" stroke-width="0.8">${lines.join('')}</g>
</g>
<g fill="${C.paper}" fill-opacity="0.5" font-family="${SERIF}" font-size="8.5" letter-spacing="0.06em">${texts.join('')}</g>`;
  }

  const cr = phone ? 16 : 26;
  const cx = width - (phone ? 30 : 56), cy = phone ? 34 : height - 64;
  const compass = `<g transform="translate(${cx},${cy})" fill="${C.paper}" stroke="${C.paper}" opacity="0.72">
  <circle r="${cr}" fill="none" stroke-width="0.7" stroke-opacity="0.8"/>
  <circle r="${cr * 0.78}" fill="none" stroke-width="0.4" stroke-opacity="0.5"/>
  <g stroke="none">
    <path d="M0,${-cr * 1.08} L${cr * 0.17},0 L0,${cr * 0.5} L${-cr * 0.17},0 Z" fill-opacity="0.95"/>
    <path d="M0,${cr * 1.0} L${cr * 0.14},0 L0,${-cr * 0.4} L${-cr * 0.14},0 Z" fill-opacity="0.45"/>
    <path d="M${-cr * 1.0},0 L0,${cr * 0.14} L${cr * 0.4},0 L0,${-cr * 0.14} Z" fill-opacity="0.45"/>
    <path d="M${cr * 1.0},0 L0,${cr * 0.14} L${-cr * 0.4},0 L0,${-cr * 0.14} Z" fill-opacity="0.45"/>
    <circle r="${cr * 0.09}" fill="${C.coral}"/>
  </g>
  <text y="${-cr * 1.22}" text-anchor="middle" font-family="${SERIF}" font-size="${phone ? 8 : 11}" stroke="none" fill-opacity="0.9">N</text>
</g>`;

  const title = phone
    ? ''
    : `<g font-family="${SERIF}" fill="${C.paper}">
  <text x="40" y="${height - 58}" font-size="19" letter-spacing="0.38em" fill-opacity="0.9">潜 图</text>
  <text x="40" y="${height - 41}" font-size="8.5" letter-spacing="0.22em" fill-opacity="0.55">WORLD DIVE ATLAS · 世界潜点图</text>
  <text x="40" y="${height - 28}" font-size="7.5" letter-spacing="0.08em" fill-opacity="0.45">NATURAL EARTH I · 150°E</text>
</g>`;

  // the light band follows the *on-screen* equator at the start zoom
  const eqY = Math.min(0.85, Math.max(0.15, toScreen(p.projection([150, 0])!)[1] / height));
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  ${landDefs}
  <linearGradient id="sea-v" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.oceanDeep}"/>
    <stop offset="${pct(eqY * 0.45)}" stop-color="${C.oceanMid}"/>
    <stop offset="${pct(eqY)}" stop-color="${C.ocean}"/>
    <stop offset="${pct(eqY + (1 - eqY) * 0.55)}" stop-color="${C.oceanMid}"/>
    <stop offset="1" stop-color="${C.oceanDeep}"/>
  </linearGradient>
  <radialGradient id="sea-r" cx="0.5" cy="${eqY.toFixed(2)}" r="0.7">
    <stop offset="0" stop-color="${C.lagoon}" stop-opacity="0.14"/>
    <stop offset="0.55" stop-color="${C.lagoon}" stop-opacity="0"/>
    <stop offset="1" stop-color="${C.oceanDeep}" stop-opacity="0.35"/>
  </radialGradient>
  <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
    <stop offset="0.6" stop-color="${C.oceanDeep}" stop-opacity="0"/>
    <stop offset="1" stop-color="${C.oceanDeep}" stop-opacity="0.38"/>
  </radialGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 -0.5"/>
  </filter>
</defs>

<!-- 1. ocean (static, full frame) -->
<rect width="${width}" height="${height}" fill="url(#sea-v)"/>
<rect width="${width}" height="${height}" fill="url(#sea-r)"/>

<!-- 2. zoom group -->
<g transform="${zoom}">
  <path d="${graticule}" fill="none" stroke="${C.paper}" stroke-opacity="0.12" stroke-width="${f1(0.35 / k)}" stroke-dasharray="${f1(3 / k)} ${f1(3 / k)}"/>
  <g fill="none" stroke="${C.lagoon}" stroke-linejoin="round" stroke-linecap="round">
    ${shelf}
  </g>
  <g fill="${C.land}" stroke="${C.landEdge}" stroke-width="${f1(1 / k)}" stroke-opacity="0.8" stroke-linejoin="round">${landUse}</g>
  <g font-family="${SERIF}" fill="${C.paper}" text-anchor="middle" dominant-baseline="central">
    ${oceanLabels}
  </g>
  <g>
    ${markers}
  </g>
</g>

<!-- 3. static overlays -->
<rect width="${width}" height="${height}" fill="url(#vignette)"/>
<rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.16"/>
${frame}
${title}
${compass}
</svg>`;
}

async function main() {
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    await new Promise((r) => setTimeout(r, 30_000));
    sharp = (await import('sharp')).default;
  }
  const jobs: [number, number, number, [number, number] | null][] = [
    [1280, 720, 1, null],
    [375, 640, 1.9, [118, 8]],
  ];
  for (const [w, h, k, c] of jobs) {
    const svg = render(w, h, k, c);
    const svgFile = join(OUT, `map-${w}.svg`);
    writeFileSync(svgFile, svg);
    await sharp(Buffer.from(svg), { density: 192 }).png().toFile(svgFile.replace(/\.svg$/, '.png'));
    console.log(`wrote map-${w}.svg/.png (${(svg.length / 1024).toFixed(0)} KB svg)`);
  }
}
main();
