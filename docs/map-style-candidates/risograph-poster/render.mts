#!/usr/bin/env -S node --experimental-strip-types
/**
 * "Risograph poster" direction for Dive Atlas — standalone render, no browser.
 *
 *   node --experimental-strip-types render.mts
 *
 * Writes map-1280.svg/.png (world, desktop, title block) and map-375.svg/.png
 * (phone, 1.9x on Southeast Asia, exactly MapView's narrow-screen start) next to
 * this file. Same projection code as the app; CSS tokens replaced by fixed hex.
 *
 * Two-ink print model: teal ink = ocean, coral ink = markers + slipped land copy,
 * paper = land. Everything light (shallow band, ocean names) is a tint or a knock-out.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature, merge } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry, LineString, MultiPolygon, Polygon } from 'geojson';
import { createMapProjection, UNWRAP_LIST } from '/Users/veetsin/Documents/coding/dive-atlas/src/lib/projection.ts';

const here = dirname(fileURLToPath(import.meta.url));
const project = '/Users/veetsin/Documents/coding/dive-atlas';

// ---- tokens: hex here; SPEC.md maps each to its src/app.css variable ----
const C = {
  ocean: '#1A9E9A', // --ocean          teal ink, flat
  oceanDeep: '#0E2A47', // --ocean-deep  halftone dot ink
  seafoam: '#9ED9C9', // --seafoam       shallow band (teal at ~40% tint)
  land: '#F3E3C3', // --land             paper
  coral: '#F2795B', // --coral           second ink: markers, misregistration
  paper: '#FBF8F1', // --paper           chips, knocked-out type
  ink: '#13293D', // --ink               chip text
};
const ZH = `"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif`;
const LATIN = `"Helvetica Neue","Avenir Next",-apple-system,"Segoe UI",Roboto,sans-serif`;

type Props = { ADM0_A3: string; CONTINENT?: string };
type Site = { id: string; coords: [number, number]; name: { zh: string; en: string }; bestMonths: number[] };
type Label = { id: string; tier: 1 | 2; name: { zh: string; en: string }; anchor: [number, number]; vertical?: boolean; minZoom?: number };

const topo = JSON.parse(readFileSync(join(project, 'public/geo/countries.topo.json'), 'utf8')) as Topology;
const obj = topo.objects[Object.keys(topo.objects)[0]!] as GeometryCollection<Props>;
// One seam-free land polygon (shared arcs cancel), Greenland kept apart for the unwrap.
const mainGeoms = obj.geometries.filter((g) => !UNWRAP_LIST.has(g.properties!.ADM0_A3));
const landMerged = merge(topo, mainGeoms);
// Classify islands once at 1x: tiny specks (< 5 px² on the 1280 world view) get a thin band, not a donut.
const SPECK_PX2 = 5;
const polys = landMerged.coordinates.map((c): Polygon => ({ type: 'Polygon', coordinates: c }));
const area1x = createMapProjection(1280, 720).path.area;
const bigLand: MultiPolygon = { type: 'MultiPolygon', coordinates: polys.filter((g) => area1x(g) >= SPECK_PX2).map((g) => g.coordinates) };
const speckLand: MultiPolygon = { type: 'MultiPolygon', coordinates: polys.filter((g) => area1x(g) < SPECK_PX2).map((g) => g.coordinates) };
const unwrapped = (feature(topo, obj) as FeatureCollection<Geometry, Props>).features.filter((f) =>
  UNWRAP_LIST.has(f.properties.ADM0_A3),
);
const sites = JSON.parse(readFileSync(join(project, 'data/sites.json'), 'utf8')) as Site[];
const labels = JSON.parse(readFileSync(join(here, 'labels.json'), 'utf8')) as Label[];
const MONTH = 10; // the month this preview pretends to be

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

// ---- screen-space rectangles for label placement ----
type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (b: Box, v: Box) => b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w && b.y + b.h <= v.y + v.h;

/** `n` positions around the disc with the chip's near edge ≈ `g` px away; ring 1 touches, rings 2–3 get a leader. */
function candidates(w: number, h: number, g: number, n: number): [number, number][] {
  const order = [0.25, 0, 0.5, 0.75]; // below, right, left, above first, then the in-betweens
  const turns = Array.from({ length: n }, (_, i) => i / n).sort((a, b) => {
    const ra = order.indexOf(a), rb = order.indexOf(b);
    return (ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb) || a - b;
  });
  return turns.map((t) => {
    const a = t * 2 * Math.PI;
    const cx = Math.cos(a), cy = Math.sin(a);
    const r = g + 0.5 * (w * Math.abs(cx) + h * Math.abs(cy));
    return [cx * r - w / 2, cy * r - h / 2];
  });
}

type Pt = { sx: number; sy: number; w: number; h: number };
/** Greedy, crowded points first. Returns chip offset + ring, or null when nothing fits (chip hidden). */
function placeChips(pts: Pt[], view: Box, blocked: Box[]) {
  const taken: Box[] = [...blocked, ...pts.map((p) => ({ x: p.sx - 8, y: p.sy - 8, w: 16, h: 16 }))];
  const crowd = (p: Pt) => pts.filter((q) => Math.hypot(q.sx - p.sx, q.sy - p.sy) < 60).length;
  const order = pts.map((p, i) => i).sort((a, b) => crowd(pts[b]!) - crowd(pts[a]!) || pts[a]!.sy - pts[b]!.sy);
  const out: ({ dx: number; dy: number; ring: 1 | 2 | 3 } | null)[] = new Array(pts.length).fill(null);
  if (process.env.PLACE_DEBUG) console.log('place order:', order.map((i) => `#${i}(${pts[i]!.sx.toFixed(0)},${pts[i]!.sy.toFixed(0)} w${pts[i]!.w})`).join(' '));
  for (const i of order) {
    const p = pts[i]!;
    search: for (const [ring, g, n] of [[1, 7, 8], [2, 24, 16], [3, 44, 16]] as const) {
      for (const [dx, dy] of candidates(p.w, p.h, g, n)) {
        const b = { x: p.sx + dx, y: p.sy + dy, w: p.w, h: p.h };
        // ring ≥ 2 draws a leader from the disc to the chip centre: it must not cross anything placed
        const leaderClear =
          ring === 1 ||
          Array.from({ length: 9 }, (_, j) => ({ x: p.sx + ((dx + p.w / 2) * j) / 9, y: p.sy + ((dy + p.h / 2) * j) / 9, w: 1, h: 1 })).every(
            (q) => !taken.some((t) => t !== taken[i + blocked.length] && hit(t, q)),
          );
        if (inside(b, view) && leaderClear && !taken.some((t) => hit(t, b))) {
          taken.push(b);
          out[i] = { dx, dy, ring };
          if (process.env.PLACE_DEBUG) console.log(`  #${i} ring ${ring} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)}`);
          break search;
        }
        if (process.env.PLACE_DEBUG === '2') {
          const blocker = taken.findIndex((t) => hit(t, b));
          console.log(`  #${i} ring ${ring} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} inside=${inside(b, view)} leader=${leaderClear} blocker=${blocker}`);
        }
      }
    }
    if (!out[i] && process.env.PLACE_DEBUG) console.log(`  #${i} HIDDEN`);
  }
  return { placed: out, taken };
}

const TROPICS: { lat: number; zh: string; en: string; lon: number }[] = [
  { lat: 23.44, zh: '北回归线', en: 'Tropic of Cancer', lon: 178 },
  { lat: 0, zh: '赤道', en: 'Equator', lon: -125 },
  { lat: -23.44, zh: '南回归线', en: 'Tropic of Capricorn', lon: -118 },
];
const parallel = (lat: number): LineString => ({
  type: 'LineString',
  coordinates: Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]),
});

function render(width: number, height: number, opts: { k: number; center?: [number, number]; title: boolean }) {
  const p = createMapProjection(width, height);
  const dBig = p.path(bigLand) ?? '';
  const dSpeck = p.path(speckLand) ?? '';
  const dGrl = unwrapped.map((f) => p.unwrappedPath(f as Feature) ?? '').join(' ');

  // zoom transform, exactly as MapView's narrow-screen start: translate(w/2,h/2) scale(k) translate(-c)
  const { k } = opts;
  const c = opts.center ? p.projection(opts.center)! : [width / 2, height / 2];
  const tx = width / 2 - k * c[0];
  const ty = height / 2 - k * c[1];
  const zoomT = `translate(${f1(width / 2)},${f1(height / 2)}) scale(${k}) translate(${f1(-c[0])},${f1(-c[1])})`;
  const toScreen = ([x, y]: [number, number]): [number, number] => [tx + k * x, ty + k * y];
  const view: Box = { x: 6, y: 6, w: width - 12, h: height - 12 };
  const onScreen = (sx: number, sy: number, m = 0) => sx > -m && sx < width + m && sy > -m && sy < height + m;
  // counter-scale wrapper: children are authored in screen px, anchored at a map point
  const at = (x: number, y: number, body: string, extra = '') =>
    `<g transform="translate(${f1(x)},${f1(y)}) scale(${f2(1 / k)})"${extra}>${body}</g>`;

  // ---- markers + chips (screen px) ----
  const fs = 12;
  const pts = sites
    .map((s) => ({ s, pt: p.projection(s.coords) }))
    .filter((o): o is { s: Site; pt: [number, number] } => !!o.pt)
    .map(({ s, pt }) => {
      const [sx, sy] = toScreen(pt);
      return { s, pt, sx, sy, w: [...s.name.zh].length * fs + 12, h: fs + 8 };
    })
    .filter((o) => onScreen(o.sx, o.sy, 4));
  const blocked: Box[] = opts.title ? [{ x: 0, y: height - 190, w: 330, h: 190 }] : [];
  const { placed, taken } = placeChips(pts, view, blocked);
  const markers = pts
    .map((o, i) => {
      const off = o.s.bestMonths.length > 0 && !o.s.bestMonths.includes(MONTH);
      const disc = off
        ? `<circle r="4.6" fill="none" stroke="${C.coral}" stroke-width="2.6"/>`
        : `<circle r="6" fill="${C.coral}"/><circle r="2" fill="${C.paper}"/>`;
      const c = placed[i];
      let chip = '';
      if (c) {
        const cx = c.dx + o.w / 2;
        const cy = c.dy + o.h / 2;
        const len = Math.hypot(cx, cy);
        const leader =
          c.ring >= 2
            ? `<line x1="${f1((cx / len) * 7)}" y1="${f1((cy / len) * 7)}" x2="${f1(cx)}" y2="${f1(cy)}" stroke="${C.ink}" stroke-width="1" stroke-opacity="0.6"/>`
            : '';
        chip = `${leader}<rect x="${f1(c.dx)}" y="${f1(c.dy)}" width="${o.w}" height="${o.h}" rx="1.5" fill="${C.paper}" fill-opacity="0.95"/><text class="site" x="${f1(cx)}" y="${f1(cy + fs * 0.36)}">${esc(o.s.name.zh)}</text>`;
      }
      return at(o.pt[0], o.pt[1], disc + chip, off ? ' opacity="0.78"' : '');
    })
    .join('\n');

  // ---- ocean typography: tier 1 always (background), tier 2 only zoomed in and only where free ----
  const fs1 = 58 / Math.sqrt(k); // screen px: shrinks slowly while zooming in
  const fs2 = 12;
  const oceanText = labels
    .map((l) => {
      const pt = p.projection(l.anchor);
      if (!pt) return '';
      const [sx, sy] = toScreen(pt);
      if (!onScreen(sx, sy, 160)) return '';
      if (l.tier === 1) {
        const en = fs1 * 0.22 >= 8.5
          ? `<text class="lat" y="${f1(fs1 * 0.66)}" font-size="${f1(fs1 * 0.22)}" letter-spacing="${f1(fs1 * 0.1)}">${esc(l.name.en.toUpperCase())}</text>`
          : '';
        if (l.vertical) {
          const chars = [...l.name.zh];
          const step = fs1 * 1.06;
          const y0 = -((chars.length - 1) * step) / 2 + fs1 * 0.36;
          const body = chars.map((ch, i) => `<text y="${f1(y0 + i * step)}" font-size="${f1(fs1)}">${ch}</text>`).join('');
          return at(pt[0], pt[1], body, ' class="ocean-type" opacity="0.15"');
        }
        return at(pt[0], pt[1], `<text font-size="${f1(fs1)}" letter-spacing="${f1(fs1 * 0.2)}">${esc(l.name.zh)}</text>${en}`, ' class="ocean-type" opacity="0.15"');
      }
      if (k < (l.minZoom ?? 1.5)) return '';
      const chars = [...l.name.zh];
      const len = chars.length * fs2 + (chars.length - 1) * 3 + 6;
      const box = l.vertical
        ? { x: sx - fs2 * 0.65, y: sy - len / 2, w: fs2 * 1.3, h: len }
        : { x: sx - len / 2, y: sy - fs2 * 0.8, w: len, h: fs2 * 1.3 };
      if (!inside(box, view) || taken.some((t) => hit(t, box))) return '';
      const body = l.vertical
        ? chars.map((ch, i) => `<text y="${f1(-len / 2 + fs2 * 0.9 + i * (fs2 + 3))}" font-size="${fs2}">${ch}</text>`).join('')
        : `<text font-size="${fs2}" letter-spacing="3">${esc(l.name.zh)}</text>`;
      return at(pt[0], pt[1], body, ' class="ocean-type" opacity="0.3"');
    })
    .join('\n');

  // ---- tropics: three thin dashed parallels under the land, labelled in open water ----
  const dash = `${f2(5 / k)} ${f2(4 / k)}`;
  const tropicLines = TROPICS.map((t) => `<path d="${p.path(parallel(t.lat))}"/>`).join('');
  const tropicText = TROPICS.map((t) => {
    const pt = p.projection([t.lon, t.lat]);
    if (!pt) return '';
    const [sx, sy] = toScreen(pt);
    if (!onScreen(sx, sy, -80)) return '';
    return at(pt[0], pt[1], `<text y="-5"><tspan font-family='${ZH}' font-weight="600">${t.zh}</tspan><tspan class="lat" dx="7">${t.en.toUpperCase()}</tspan></text>`, ' class="tropic" opacity="0.6"');
  }).join('\n');

  // ---- title block (desktop only), bottom-left, part of the poster ----
  const title = opts.title
    ? `<g transform="translate(36,${height - 48})" fill="${C.paper}">
  <text font-family='${ZH}' font-weight="600" font-size="66" letter-spacing="4" y="-58">潜图</text>
  <rect x="3" y="-44" width="46" height="4" fill="${C.coral}"/>
  <text font-family='${ZH}' font-weight="600" font-size="15" letter-spacing="5" y="-18">世界潜点地图</text>
  <text font-family='${LATIN}' font-weight="700" font-size="10.5" letter-spacing="3.2" y="2" opacity="0.85">WORLD DIVE ATLAS</text>
  <text font-family='${LATIN}' font-weight="600" font-size="8.5" letter-spacing="1.8" y="22" opacity="0.5">NATURAL EARTH I · 150°E · <tspan font-family='${ZH}' letter-spacing="1">太平洋居中</tspan></text>
</g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <path id="land-big" d="${dBig}"/>
  <path id="land-speck" d="${dSpeck}"/>
  <path id="land-grl" d="${dGrl}"/>
  <!-- halftone screen: 7 px pitch on a 45° lattice, static (printed on the paper, not on the map) -->
  <pattern id="halftone" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <circle cx="3.5" cy="3.5" r="1.15" fill="${C.oceanDeep}"/>
  </pattern>
  <!-- paper grain: one static full-frame filter, outside the zoom group -->
  <filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <style>
    .ocean-type text { font-family: ${ZH}; font-weight: 600; fill: ${C.paper}; text-anchor: middle; }
    .ocean-type text.lat, .tropic .lat { font-family: ${LATIN}; font-weight: 700; }
    .tropic text { font-family: ${LATIN}; font-weight: 700; font-size: 9px; letter-spacing: 2px; fill: ${C.paper}; text-anchor: middle; }
    text.site { font-family: ${ZH}; font-weight: 500; font-size: ${fs}px; fill: ${C.ink}; text-anchor: middle; }
  </style>
</defs>

<!-- 1 teal ink, full bleed; 2 halftone screen — both static, outside the zoom group -->
<rect width="${width}" height="${height}" fill="${C.ocean}"/>
<rect width="${width}" height="${height}" fill="url(#halftone)" opacity="0.085"/>

<g transform="${zoomT}">
  <!-- 3 ocean typography, knocked-out, background layer -->
${oceanText}
  <!-- 4 tropics -->
  <g fill="none" stroke="${C.paper}" stroke-opacity="0.26" stroke-width="${f2(1 / k)}" stroke-dasharray="${dash}">${tropicLines}</g>
${tropicText}
  <!-- 5 shallow band: one bold seafoam stroke → cut-paper coast (app: vector-effect non-scaling-stroke) -->
  <g fill="none" stroke="${C.seafoam}" stroke-opacity="0.9" stroke-linejoin="round" stroke-linecap="round">
    <g stroke-width="${f2(6 / k)}"><use href="#land-big"/><use href="#land-grl"/></g>
    <g stroke-width="${f2(2.5 / k)}"><use href="#land-speck"/></g>
  </g>
  <!-- 6 misregistration: coral land copy slipped by (1.5,1.5) screen px — the signature -->
  <g transform="translate(${f2(1.5 / k)},${f2(1.5 / k)})" fill="${C.coral}" fill-opacity="0.28"><use href="#land-big"/><use href="#land-speck"/><use href="#land-grl"/></g>
  <!-- 7 land = paper, no outline, one merged path -->
  <g fill="${C.land}"><use href="#land-big"/><use href="#land-speck"/><use href="#land-grl"/></g>
  <!-- 8 markers + chips, counter-scaled -->
${markers}
</g>

<!-- 9 title block, screen space -->
${title}
<!-- 10 grain overlay, static -->
<rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.09" style="pointer-events:none"/>
</svg>`;
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    await new Promise((r) => setTimeout(r, 30_000));
    return (await import('sharp')).default;
  }
}

const sharp = await loadSharp();
const views = [
  { w: 1280, h: 720, k: 1, title: true },
  { w: 375, h: 640, k: 1.9, center: [118, 8] as [number, number], title: false },
  // supplementary: the same phone zoomed to 4x, to exercise tier-2 sea names (not a deliverable)
  { w: 375, h: 640, k: 4, center: [121, 6] as [number, number], title: false, suffix: '-zoom4' },
];
for (const v of views) {
  const svg = render(v.w, v.h, { k: v.k, center: v.center, title: v.title });
  const base = join(here, `map-${v.w}${'suffix' in v ? v.suffix : ''}`);
  writeFileSync(`${base}.svg`, svg);
  await sharp(Buffer.from(svg), { density: 192 }).png().toFile(`${base}.png`);
  console.log(`wrote ${base}.svg/.png (${(svg.length / 1024).toFixed(0)} KB svg)`);
}

// self-check: placed chips never overlap each other or a disc, and never leave the view
for (const v of views) {
  const p = createMapProjection(v.w, v.h);
  const c = v.center ? p.projection(v.center)! : [v.w / 2, v.h / 2];
  const pts = sites
    .map((s) => ({ s, pt: p.projection(s.coords)! }))
    .map(({ s, pt }) => ({ sx: v.w / 2 - v.k * c[0] + v.k * pt[0], sy: v.h / 2 - v.k * c[1] + v.k * pt[1], w: [...s.name.zh].length * 12 + 12, h: 20 }))
    .filter((o) => o.sx > -4 && o.sx < v.w + 4 && o.sy > -4 && o.sy < v.h + 4);
  const view = { x: 6, y: 6, w: v.w - 12, h: v.h - 12 };
  const { placed } = placeChips(pts, view, v.title ? [{ x: 0, y: v.h - 190, w: 330, h: 190 }] : []);
  const boxes = pts.flatMap((p, i) => (placed[i] ? [{ x: p.sx + placed[i]!.dx, y: p.sy + placed[i]!.dy, w: p.w, h: p.h }] : []));
  const discs = pts.map((p) => ({ x: p.sx - 8, y: p.sy - 8, w: 16, h: 16 }));
  const bad = boxes.filter((a, i) => boxes.some((b, j) => j !== i && hit(a, b)) || discs.some((d) => hit(a, d)) || !inside(a, view));
  console.assert(bad.length === 0, `${v.w}: ${bad.length} bad chips`);
  console.log(`self-check ${v.w}: ${pts.length} markers on screen, ${boxes.length} chips placed, ${pts.length - boxes.length} hidden, ${bad.length} bad`);
}
