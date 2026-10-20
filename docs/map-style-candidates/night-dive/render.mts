#!/usr/bin/env -S node --experimental-strip-types
/**
 * "Night dive" direction — standalone render of the Dive Atlas base map.
 * Modelled on scripts/preview-map.mts; uses the app's own projection code.
 *
 *   node --experimental-strip-types render.mts
 *   → map-1280.svg/.png      world view, night palette, zh labels
 *     map-375.svg/.png       phone start view (1.9x on [118, 8]), night palette
 *     map-1280-day.svg/.png  world view, day palette, same layer structure
 *
 * SVG structure mirrors what MapView.svelte would emit: static full-bleed ocean,
 * ONE zoom <g> (graticule, tropics, 3 coast rings, merged land, sea names, sites)
 * and static overlays (speckle, grain) on top. Strokes inside the zoom group are
 * divided by k to emulate `vector-effect: non-scaling-stroke`; text/marker groups
 * use `translate(x,y) scale(1/k)` exactly like MapView's markers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoContains, geoGraticule } from 'd3-geo';
import { merge } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, MultiLineString } from 'geojson';
import {
  createMapProjection,
  UNWRAP_LIST,
  LAT_RANGE,
  type MapProjection,
} from '/Users/veetsin/Documents/coding/dive-atlas/src/lib/projection.ts';

const ROOT = '/Users/veetsin/Documents/coding/dive-atlas';
const OUT = dirname(fileURLToPath(import.meta.url));

type Props = { ADM0_A3: string };
type Site = { id: string; coords: [number, number]; name: { zh: string; en: string } };
type SeaLabel = { id: string; tier: 1 | 2; name: { zh: string; en: string }; anchor: [number, number] };

const topo = JSON.parse(readFileSync(join(ROOT, 'public/geo/countries.topo.json'), 'utf8')) as Topology;
const obj = topo.objects[Object.keys(topo.objects)[0]!] as GeometryCollection<Props>;
// One merged land polygon (internal borders vanish) + Greenland on its own for the unwrap.
const landGeom = merge(topo, obj.geometries.filter((g) => !UNWRAP_LIST.has(g.properties!.ADM0_A3))) as MultiPolygon;
const grlGeom = merge(topo, obj.geometries.filter((g) => UNWRAP_LIST.has(g.properties!.ADM0_A3))) as MultiPolygon;
const landFeature: Feature<MultiPolygon> = { type: 'Feature', geometry: landGeom, properties: {} };
const sites = JSON.parse(readFileSync(join(ROOT, 'data/sites.json'), 'utf8')) as Site[];
const seaLabels = JSON.parse(readFileSync(join(OUT, 'labels.json'), 'utf8')) as SeaLabel[];

// ---- palettes (token names = src/app.css :root / :root[data-theme='night']) ----
type Theme = {
  oceanCentre: string; // --ocean
  oceanEdge: string; // --ocean-edge (new; night = --ocean-deep)
  land: [string, string]; // --land-hi / --land (top-left light → bottom-right); continent tint dropped
  ring: [string, string, string]; // --ring-near / --ring-mid / --ring-far (new)
  graticule: string; // --map-line (new)
  graticuleOpacity: number;
  seaText: string; // --map-sea-text (new)
  seaTextOpacity: number;
  label: string; // --ink
  labelHalo: string; // --paper
  speckle: string; // --map-line
  speckleOpacity: number;
  grain: string;
  coral: string; // --coral
  coralLight: string; // --shell
};
const NIGHT: Theme = {
  oceanCentre: '#123A5C',
  oceanEdge: '#0E2A47',
  land: ['#3D5B77', '#33506A'],
  ring: ['#4A8FA6', '#397C97', '#2A6A85'],
  graticule: '#9ED9C9',
  graticuleOpacity: 0.08,
  seaText: '#9ED9C9',
  seaTextOpacity: 0.45,
  label: '#FBF8F1',
  labelHalo: '#13293D',
  speckle: '#9ED9C9',
  speckleOpacity: 0.25,
  grain: '#FBF8F1',
  coral: '#F2795B',
  coralLight: '#F9A68B',
};
const DAY: Theme = {
  oceanCentre: '#1A9E9A',
  oceanEdge: '#15807F',
  land: ['#F7EAD0', '#EEDCB9'],
  ring: ['#9ED9C9', '#7FD4C8', '#5FBFB6'],
  graticule: '#FBF8F1',
  graticuleOpacity: 0.12,
  seaText: '#FBF8F1',
  seaTextOpacity: 0.62,
  label: '#13293D',
  labelHalo: '#FBF8F1',
  speckle: '#FBF8F1',
  speckleOpacity: 0.18,
  grain: '#13293D',
  coral: '#F2795B',
  coralLight: '#F9A68B',
};

const SANS = `-apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif`;
const SERIF = `'Songti SC', 'STSong', 'Noto Serif CJK SC', Georgia, 'Times New Roman', serif`;

// ---- helpers ---------------------------------------------------------------
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (n: number) => n.toFixed(1);
/** Rough advance width: CJK = 1 em, Latin caps ≈ 0.66 em, lower ≈ 0.55 em. */
const textWidth = (s: string, px: number, tracking = 0) =>
  [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? px : /[A-Z]/.test(ch) ? px * 0.66 : px * 0.55) + tracking, 0);

type Box = { x: number; y: number; w: number; h: number };
const hits = (a: Box, b: Box, pad = 0) =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

/** Parallels at ±lat as one MultiLineString (d3 clips it at the 30°W cut). */
function parallels(lat: number): MultiLineString {
  const line = (l: number) => Array.from({ length: 181 }, (_, i) => [-180 + i * 2, l] as [number, number]);
  return { type: 'MultiLineString', coordinates: [line(lat), line(-lat)] };
}

// ---- one frame -------------------------------------------------------------
type View = { width: number; height: number; k: number; centre?: [number, number] };

function render(view: View, T: Theme): string {
  const { width, height, k } = view;
  const p: MapProjection = createMapProjection(width, height);

  // Zoom transform exactly like MapView.svelte's narrow-screen start:
  // zoomIdentity.translate(w/2, h/2).scale(k).translate(-c.x, -c.y)
  let tx = 0;
  let ty = 0;
  if (k !== 1 && view.centre) {
    const c = p.projection(view.centre)!;
    tx = width / 2 - k * c[0];
    ty = height / 2 - k * c[1];
  }
  const toScreen = ([x, y]: [number, number]): [number, number] => [tx + k * x, ty + k * y];
  if (view.centre) {
    // self-check: the start-view centre must land in the middle of the frame (guards the zoom maths)
    const [cx, cy] = toScreen(p.projection(view.centre)!);
    if (Math.abs(cx - width / 2) > 0.01 || Math.abs(cy - height / 2) > 0.01) throw new Error(`zoom maths off: ${cx},${cy}`);
  }
  const fromScreen = (sx: number, sy: number) => p.projection.invert?.([(sx - tx) / k, (sy - ty) / k]) ?? null;
  const pxPerDeg = (k * p.projection.scale() * 0.8707 * Math.PI) / 180;
  const sw = (px: number) => (px / k).toFixed(3); // non-scaling-stroke emulation
  const inView = (b: Box, m = 4) => b.x >= m && b.x + b.w <= width - m && b.y >= m && b.y + b.h <= height - m;
  const onLand = (sx: number, sy: number) => {
    const ll = fromScreen(sx, sy);
    return !!ll && Math.abs(ll[0]) <= 180 && ll[1] >= LAT_RANGE[0] && ll[1] <= LAT_RANGE[1] && geoContains(landFeature, ll as [number, number]);
  };
  /** Text box touches land? (corners, edge midpoints, centre) */
  const boxOnLand = (b: Box) =>
    [0, 0.5, 1].some((fx) => [0, 0.5, 1].some((fy) => onLand(b.x + b.w * fx, b.y + b.h * fy)));

  const landD = p.path(landGeom) ?? '';
  const grlD = p.unwrappedPath(grlGeom) ?? '';
  const coast = `<use href="#coast"/>`;
  const graticuleD =
    p.path(
      geoGraticule()
        .extent([
          [-180, LAT_RANGE[0]],
          [180, LAT_RANGE[1]],
        ])
        .step([30, 30])(),
    ) ?? '';
  const tropicsD = p.path(parallels(23.436)) ?? '';

  const placed: Box[] = [];
  const screenText = (x: number, y: number, inner: string) =>
    `<g transform="translate(${f1(x)},${f1(y)}) scale(${(1 / k).toFixed(4)})">${inner}</g>`;

  // ---- sea names: tier 1 first (they anchor the composition), tier 2 only when there is room ----
  const seaText = (l: SeaLabel, [sx, sy]: [number, number]) => {
    const zhPx = l.tier === 1 ? 16 : 11.5;
    const track = l.tier === 1 ? 0.5 : 0.38; // em
    const enPx = 8;
    const enTrack = 0.3;
    const zhW = textWidth(l.name.zh, zhPx, zhPx * track);
    const en = l.name.en.toUpperCase();
    const enW = l.tier === 1 ? textWidth(en, enPx, enPx * enTrack) : 0;
    const w = Math.max(zhW, enW);
    const box: Box = { x: sx - w / 2, y: sy - zhPx, w, h: zhPx + (l.tier === 1 ? enPx + 9 : 3) };
    // dx compensates trailing letter-spacing so the word stays optically centred.
    const zh = `<text font-family="${SERIF}" font-size="${zhPx}" letter-spacing="${(zhPx * track).toFixed(2)}" dx="${(zhPx * track) / 2}" text-anchor="middle" fill="${T.seaText}" fill-opacity="${T.seaTextOpacity}">${esc(l.name.zh)}</text>`;
    const enEl =
      l.tier === 1
        ? `<text y="${enPx + 8}" font-family="${SERIF}" font-size="${enPx}" letter-spacing="${(enPx * enTrack).toFixed(2)}" dx="${(enPx * enTrack) / 2}" text-anchor="middle" fill="${T.seaText}" fill-opacity="${(T.seaTextOpacity * 0.8).toFixed(2)}">${esc(en)}</text>`
        : '';
    return { box, el: zh + enEl };
  };
  const seaOut: string[] = [];
  const deferredSeas: { l: SeaLabel; s: [number, number] }[] = [];
  for (const l of seaLabels) {
    const pt = p.projection(l.anchor);
    if (!pt) continue;
    const s = toScreen(pt);
    if (l.tier === 1) {
      const { box, el } = seaText(l, s);
      if (!inView(box) || boxOnLand(box)) {
        console.log(`  ${width}px: sea label ${l.id} dropped (${inView(box) ? 'on land' : 'off screen'})`);
        continue;
      }
      placed.push(box);
      seaOut.push(screenText(pt[0], pt[1], el));
    } else if (pxPerDeg >= 3) deferredSeas.push({ l, s });
  }

  // ---- markers (fixed) then greedy label placement, both in screen space ----
  const markerPts = sites
    .map((s) => {
      const pt = p.projection(s.coords);
      return pt ? { s, pt, xy: toScreen(pt) } : null;
    })
    .filter((m): m is NonNullable<typeof m> => !!m)
    .filter(({ xy: [x, y] }) => x > -14 && x < width + 14 && y > -14 && y < height + 14);
  for (const m of markerPts) placed.push({ x: m.xy[0] - 9, y: m.xy[1] - 9, w: 18, h: 18 });

  const LPX = 12;
  let dropped = 0;
  const glows = markerPts
    .map(({ pt }) => screenText(pt[0], pt[1], `<circle r="10" fill="none" stroke="${T.coral}" stroke-width="6" stroke-opacity="0.25"/>`))
    .join('');
  const markers = markerPts
    .map(({ s, pt, xy: [sx, sy] }) => {
      const w = textWidth(s.name.zh, LPX) + 4;
      const h = LPX + 4;
      const cands: { box: Box; x: number; y: number; anchor: string }[] = [
        { box: { x: sx + 11, y: sy - h / 2, w, h }, x: 11, y: 4.2, anchor: 'start' },
        { box: { x: sx - 11 - w, y: sy - h / 2, w, h }, x: -11, y: 4.2, anchor: 'end' },
        { box: { x: sx - w / 2, y: sy + 11, w, h }, x: 0, y: 11 + LPX, anchor: 'middle' },
        { box: { x: sx - w / 2, y: sy - 11 - h, w, h }, x: 0, y: -13, anchor: 'middle' },
      ];
      const markerVisible = sx >= 8 && sx <= width - 8 && sy >= 8 && sy <= height - 8;
      const c = markerVisible ? cands.find((c) => inView(c.box, 2) && !placed.some((b) => hits(b, c.box))) : undefined;
      let label = '';
      if (c) {
        placed.push(c.box);
        const common = `x="${c.x}" y="${c.y}" font-family="${SANS}" font-size="${LPX}" font-weight="600" text-anchor="${c.anchor}"`;
        label = `<text ${common} fill="${T.label}" paint-order="stroke" stroke="${T.labelHalo}" stroke-width="3" stroke-linejoin="round" stroke-opacity="0.92">${esc(s.name.zh)}</text>`;
      } else dropped++;
      return screenText(
        pt[0],
        pt[1],
        `<circle r="5.5" fill="${T.coral}" stroke="${T.coralLight}" stroke-width="2"/>${label}`,
      );
    })
    .join('\n');
  if (dropped) console.log(`  ${width}px: ${dropped} site label(s) dropped for overlap`);

  for (const { l, s } of deferredSeas) {
    const { box, el } = seaText(l, s);
    if (!inView(box) || boxOnLand(box) || placed.some((b) => hits(b, box, 6))) continue;
    placed.push(box);
    const pt = p.projection(l.anchor)!;
    seaOut.push(screenText(pt[0], pt[1], el));
  }

  // ---- static overlays (outside zoom group): speckle + grain ----
  const rnd = mulberry32(2026);
  let speckle = '';
  for (let n = 0, tries = 0; n < 120 && tries < 6000; tries++) {
    const sx = rnd() * width;
    const sy = rnd() * height;
    // No land test on purpose: in the app this layer is static screen space, so after any pan the
    // dots sit wherever they sit; a 0.8 px dot at 0.25 opacity is unobtrusive on the slate land.
    if (markerPts.some((m) => Math.hypot(m.xy[0] - sx, m.xy[1] - sy) < 20)) continue;
    speckle += `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="${rnd() < 0.15 ? 1.3 : 0.8}"/>`;
    n++;
  }
  const grnd = mulberry32(7);
  let grain = '';
  for (let i = 0; i < 260; i++) grain += `<rect x="${f1(grnd() * 96)}" y="${f1(grnd() * 96)}" width="1" height="1"/>`;

  const zoom = k === 1 ? '' : ` transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${k})"`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <radialGradient id="ocean" cx="46%" cy="44%" r="72%">
    <stop offset="0" stop-color="${T.oceanCentre}"/>
    <stop offset="1" stop-color="${T.oceanEdge}"/>
  </radialGradient>
  <linearGradient id="land" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="${height}">
    <stop offset="0" stop-color="${T.land[0]}"/>
    <stop offset="1" stop-color="${T.land[1]}"/>
  </linearGradient>
  <pattern id="grain" width="96" height="96" patternUnits="userSpaceOnUse"><g fill="${T.grain}">${grain}</g></pattern>
  <!-- merged coastline (all countries unioned) + Greenland through the unwrapped projection; referenced 4x -->
  <g id="coast"><path d="${landD}"/><path d="${grlD}"/></g>
</defs>
<!-- L0 ocean: static, full-bleed, outside the zoom group -->
<rect width="${width}" height="${height}" fill="url(#ocean)"/>
<!-- zoom group: d3-zoom transform goes here -->
<g${zoom}>
  <!-- L1 graticule 30° + dashed tropics -->
  <path d="${graticuleD}" fill="none" stroke="${T.graticule}" stroke-opacity="${T.graticuleOpacity}" stroke-width="${sw(0.75)}"/>
  <path d="${tropicsD}" fill="none" stroke="${T.graticule}" stroke-opacity="${(T.graticuleOpacity * 2).toFixed(2)}" stroke-width="${sw(0.75)}" stroke-dasharray="${sw(3)} ${sw(5)}"/>
  <!-- L2 shallow-water rings on the merged coastline, widest first, under the land -->
  <g fill="none" stroke-linejoin="round" stroke-linecap="round">
    <g stroke="${T.ring[2]}" stroke-width="${sw(20)}" stroke-opacity="0.18">${coast}</g>
    <g stroke="${T.ring[1]}" stroke-width="${sw(10)}" stroke-opacity="0.45">${coast}</g>
    <g stroke="${T.ring[0]}" stroke-width="${sw(4)}" stroke-opacity="0.9">${coast}</g>
  </g>
  <!-- L3 land: one merged path + Greenland (unwrapped), no stroke, no borders -->
  <g fill="url(#land)">${coast}</g>
  <!-- L4 sea names (screen-constant via translate+scale(1/k)) -->
  <g pointer-events="none">${seaOut.join('')}</g>
  <!-- L5 site glow rings (all under), then discs + labels (screen-constant via translate+scale(1/k)) -->
  <g pointer-events="none">${glows}</g>
  <g>
${markers}
  </g>
</g>
<!-- L6 static overlays: speckle + grain, outside the zoom group -->
<g fill="${T.speckle}" fill-opacity="${T.speckleOpacity}" pointer-events="none">${speckle}</g>
<rect width="${width}" height="${height}" fill="url(#grain)" fill-opacity="0.04" pointer-events="none"/>
</svg>`;
}

// ---- write -----------------------------------------------------------------
async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    console.log('sharp not importable yet, retrying in 30 s…');
    await new Promise((r) => setTimeout(r, 30_000));
    return (await import('sharp')).default;
  }
}

const jobs: { name: string; view: View; theme: Theme }[] = [
  { name: 'map-1280', view: { width: 1280, height: 720, k: 1 }, theme: NIGHT },
  { name: 'map-375', view: { width: 375, height: 640, k: 1.9, centre: [118, 8] }, theme: NIGHT },
  { name: 'map-1280-day', view: { width: 1280, height: 720, k: 1 }, theme: DAY },
];
const sharp = await loadSharp();
for (const j of jobs) {
  const svg = render(j.view, j.theme);
  const svgFile = join(OUT, `${j.name}.svg`);
  writeFileSync(svgFile, svg);
  await sharp(Buffer.from(svg), { density: 192 }).png().toFile(svgFile.replace(/\.svg$/, '.png'));
  console.log(`wrote ${j.name}.svg/.png (${(svg.length / 1024).toFixed(0)} KB svg)`);
}
