#!/usr/bin/env -S node --experimental-strip-types
/**
 * "Lagoon depth" direction — standalone render of the Dive Atlas base map.
 *
 *   node --experimental-strip-types render.mts
 *
 * Writes map-1280.{svg,png} (world) and map-375.{svg,png} (phone start view, 1.9x on SE Asia)
 * next to this file. Same projection code as the app; CSS tokens replaced by fixed hex.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoArea, geoContains, geoDistance } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry, Polygon } from 'geojson';
import { createMapProjection, UNWRAP_LIST } from '/Users/veetsin/Documents/coding/dive-atlas/src/lib/projection.ts';

const PROJECT = '/Users/veetsin/Documents/coding/dive-atlas';
const OUT = dirname(fileURLToPath(import.meta.url));

type Props = { ADM0_A3: string; CONTINENT?: string };
const topo = JSON.parse(readFileSync(join(PROJECT, 'public/geo/countries.topo.json'), 'utf8')) as Topology;
const obj = topo.objects[Object.keys(topo.objects)[0]!] as GeometryCollection<Props>;
const fc = feature(topo, obj) as FeatureCollection<Geometry, Props>;

type Site = { id: string; coords: [number, number]; name: { zh: string; en: string } };
const sites = JSON.parse(readFileSync(join(PROJECT, 'data/sites.json'), 'utf8')) as Site[];

// ---- tokens: hex here, CSS custom property they map to in src/app.css (see SPEC.md) ----
const T = {
  oceanBase: '#15807F', //  --ocean-base   (new)  centre of the depth gradient
  oceanAbyss: '#0F5F6B', // --ocean-abyss  (new)  frame edge of the depth gradient
  shelf4: '#1B8C8A', //     --shelf-4      (new)  30 px, soft step above the base
  ocean: '#1A9E9A', //      --ocean               18 px
  shelf2: '#3FB4AC', //     --shelf-2      (new)  10 px
  shelf1: '#62C7BC', //     --shelf-1      (new)  5 px
  shallow: '#7FD4C8', //    --ocean-shallow       2 px
  seafoam: '#9ED9C9', //    --seafoam             labels, wave glyphs
  land: '#F3E3C3', //       --land
  landShade: '#D9C193', //  --land-shade   (new)  1 px drop under the south edges
  landLight: '#FFF7E6', //  --land-light   (new)  0.8 px inner highlight NW edges
  coral: '#F2795B', //      --coral
  coralDeep: '#B9472E', //  --coral-deep   (new)  marker outline + shadow
  paper: '#FBF8F1', //      --paper
  ink: '#13293D', //        --ink
};
const SANS = `'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Helvetica Neue',Arial,sans-serif`;

// Pseudo-bathymetry: [screen px at the 1280 world scale, colour]. Widest first, each fully
// opaque, so they stack like contour fills under the land. The two outer steps are soft
// (≈5 % L each), the inner three crisp — depth without a bullseye around every atoll.
const BANDS: [number, string][] = [
  [30, T.shelf4],
  [18, T.ocean],
  [10, T.shelf2],
  [5, T.shelf1],
  [2, T.shallow],
];
const SMALL_SR = 5e-4; // ≈ 20 000 km²: polygons below this get only the inner three bands

// Split every country into polygons so islands can be classed by size.
type Poly = { g: Polygon; small: boolean; unwrapped: boolean };
const polys: Poly[] = [];
for (const f of fc.features) {
  if (!f.geometry) continue;
  const unwrapped = UNWRAP_LIST.has(f.properties.ADM0_A3);
  const rings =
    f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  for (const coordinates of rings) {
    const g: Polygon = { type: 'Polygon', coordinates };
    const a = geoArea(g);
    polys.push({ g, small: Math.min(a, 4 * Math.PI - a) < SMALL_SR, unwrapped });
  }
}

// Ocean / sea names. Would live in data/labels.json ({zh,en,at:[lon,lat],rank}).
// rank 1: oceans (zh + en small caps) · rank 2: major seas · rank 3: small seas, zoom ≥ 2.5 only.
const LABELS: { zh: string; en: string; at: [number, number]; rank: 1 | 2 | 3 }[] = [
  { zh: '北太平洋', en: 'North Pacific Ocean', at: [-168, 32], rank: 1 },
  { zh: '南太平洋', en: 'South Pacific Ocean', at: [-138, -28], rank: 1 },
  { zh: '印度洋', en: 'Indian Ocean', at: [80, -28], rank: 1 },
  { zh: '大西洋', en: 'Atlantic Ocean', at: [-18, -28], rank: 1 },
  { zh: '北冰洋', en: 'Arctic Ocean', at: [-150, 82.5], rank: 1 },
  { zh: '南大洋', en: 'Southern Ocean', at: [-120, -55], rank: 1 },
  { zh: '菲律宾海', en: 'Philippine Sea', at: [135, 21], rank: 2 },
  { zh: '珊瑚海', en: 'Coral Sea', at: [156, -17], rank: 2 },
  { zh: '塔斯曼海', en: 'Tasman Sea', at: [161, -39], rank: 2 },
  { zh: '南海', en: 'South China Sea', at: [114, 15], rank: 3 },
  { zh: '阿拉伯海', en: 'Arabian Sea', at: [63, 13], rank: 3 },
  { zh: '孟加拉湾', en: 'Bay of Bengal', at: [88, 12], rank: 3 },
  { zh: '白令海', en: 'Bering Sea', at: [-178, 58], rank: 3 },
  { zh: '加勒比海', en: 'Caribbean Sea', at: [-75, 15], rank: 3 },
];

// Decorative wave glyph anchors on the globe: open water, ≥ 8° from any coastline (asserted below).
const WAVES: [number, number][] = [
  // North Pacific
  [-170, 40], [-146, 36], [-134, 20], [-176, 12], [172, 28], [154, 24], [-158, 44], [156, 18], [-122, -2], [-126, 10],
  // South Pacific
  [-156, -12], [-116, -12], [-164, -34], [-120, -42], [-95, -30], [-146, -44], [-162, -50], [-100, -20], [-138, -8],
  [174, -7],
  // Indian Ocean
  [80, -38], [96, -32], [70, -32], [84, -14], [104, -26], [90, -24], [52, -42],
  // Atlantic (split by the 30°W cut: east half far left, west half far right)
  [-20, -12], [-18, -40], [-26, 30], [-24, 46], [-42, 32], [-26, -28], [-40, -40], [-48, 38],
  // Southern Ocean
  [-92, -58], [20, -54], [140, -55], [100, -52],
  // Arctic
  [-178, 82],
  // Philippine Sea (visible in the phone start view)
  [138, 25],
];
const WAVE_SIZES = [0.85, 1.1, 0.95, 1.2]; // a little size variety so the scatter does not read as a stamp

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---- self-checks: nothing decorative sits on land or inside the shelf bands ----
const coastVerts: [number, number][] = [];
const walk = (c: unknown): void => {
  if (typeof (c as number[])[0] === 'number') coastVerts.push(c as [number, number]);
  else for (const x of c as unknown[]) walk(x);
};
for (const f of fc.features) if (f.geometry) walk((f.geometry as { coordinates: unknown }).coordinates);
const coastDeg = (p: [number, number]) => {
  let m = Infinity;
  for (const v of coastVerts) m = Math.min(m, geoDistance(p, v));
  return (m * 180) / Math.PI;
};
const bad = WAVES.map((w) => [w, geoContains(fc, w) ? 0 : coastDeg(w)] as const).filter(([, d]) => d < 8);
if (bad.length) throw new Error('waves too close to land (min 8°):\n' + bad.map(([w, d]) => `  [${w}] ${d.toFixed(1)}°`).join('\n'));
for (const l of LABELS) if (geoContains(fc, l.at)) throw new Error(`label on land: ${l.zh}`);

type View = { width: number; height: number; k: number; center: [number, number] | null };
type Box = { x0: number; y0: number; x1: number; y1: number };

function render({ width, height, k, center }: View): string {
  const p = createMapProjection(width, height);
  const pathOf = (q: Poly) => (q.unwrapped ? p.unwrappedPath(q.g) : p.path(q.g)) ?? '';
  const coastLg = polys.filter((q) => !q.small).map(pathOf).join('');
  const coastSm = polys.filter((q) => q.small).map(pathOf).join('');

  // Zoom transform exactly like MapView.svelte's narrow-screen start.
  const c0 = center ? p.projection(center)! : [0, 0];
  const zoom = center
    ? `translate(${width / 2},${height / 2}) scale(${k}) translate(${-c0[0]},${-c0[1]})`
    : '';
  const screen = (pt: [number, number]): [number, number] =>
    center ? [width / 2 + k * (pt[0] - c0[0]), height / 2 + k * (pt[1] - c0[1])] : pt;
  const inFrame = ([x, y]: [number, number]) => x > -40 && x < width + 40 && y > -40 && y < height + 40;
  // Visible map-space rectangle.
  const vx0 = center ? c0[0] - width / (2 * k) : 0, vx1 = center ? c0[0] + width / (2 * k) : width;
  const vy0 = center ? c0[1] - height / (2 * k) : 0, vy1 = center ? c0[1] + height / (2 * k) : height;

  // Pixel-constant things (offsets, glyphs, labels) are divided by k.
  const px = (v: number) => (v / k).toFixed(3);
  // Shelf bands are geographic (they scale with the map) but clamped so they never
  // vanish on a phone or swallow the screen at 8x. s = this view's scale vs the 1280 world view.
  const s = Math.min(1.6, Math.max(0.6, (p.projection.scale() * k) / createMapProjection(1280, 720).projection.scale()));
  const bandPx = (w: number) => ((w * s) / k).toFixed(3);

  const bands = BANDS.map(
    ([w, c], i) =>
      `<use href="${i < 2 ? '#coast-lg' : '#coast'}" fill="none" stroke="${c}" stroke-width="${bandPx(w)}" stroke-linejoin="round" stroke-linecap="round"/>`,
  ).join('\n');

  // Collision boxes in screen px. Markers first, then marker labels, then sea names (lowest priority).
  const placed: Box[] = [];
  const hit = (b: Box) => placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);

  // Markers: counter-scaled like the app. Greedy label placement below / above / right / left, else dropped.
  const FONT = 11;
  const markerPts = sites
    .map((s) => ({ s, pt: p.projection(s.coords) as [number, number] | null }))
    .filter((m): m is { s: Site; pt: [number, number] } => !!m.pt && inFrame(screen(m.pt)));
  for (const { pt } of markerPts) {
    const [sx, sy] = screen(pt);
    placed.push({ x0: sx - 8, y0: sy - 8, x1: sx + 8, y1: sy + 8 });
  }
  const markers = markerPts
    .map(({ s: site, pt }) => {
      const [sx, sy] = screen(pt);
      const tw = site.name.zh.length * FONT + 4;
      const tries: [number, number, string][] = [
        [0, 21, 'middle'],
        [0, -13, 'middle'],
        [12, 4, 'start'],
        [-12, 4, 'end'],
      ];
      let label = '';
      for (const [dx, dy, anchor] of tries) {
        const x0 = anchor === 'middle' ? sx + dx - tw / 2 : anchor === 'start' ? sx + dx : sx + dx - tw;
        const box = { x0, y0: sy + dy - FONT, x1: x0 + tw, y1: sy + dy + 3 };
        if (!hit(box)) {
          placed.push(box);
          label = `<text class="lbl" x="${dx}" y="${dy}" text-anchor="${anchor}">${esc(site.name.zh)}</text>`;
          break;
        }
      }
      return `<g transform="translate(${pt[0].toFixed(2)},${pt[1].toFixed(2)}) scale(${px(1)})">
<circle r="7.5" cy="1.2" fill="${T.coralDeep}" fill-opacity="0.35"/>
<circle r="7.5" fill="${T.paper}" stroke="${T.coralDeep}" stroke-width="1"/>
<circle r="4.8" fill="${T.coral}"/>
${label}</g>`;
    })
    .join('\n');

  const labels = LABELS.map((l) => {
    const pt = p.projection(l.at);
    if (!pt || !inFrame(screen(pt))) return '';
    if (l.rank === 3 && k < 2.5) return '';
    const [size, track] = l.rank === 1 ? [15, 7.5] : [11, 3.3];
    const [sx, sy] = screen(pt);
    const w = l.zh.length * (size + track);
    const box = { x0: sx - w / 2, y0: sy - size, x1: sx + w / 2, y1: sy + (l.rank === 1 ? 16 : 4) };
    if (hit(box)) return ''; // a dive-site label wins over a sea name
    placed.push(box);
    const at = `translate(${pt[0].toFixed(1)},${pt[1].toFixed(1)}) scale(${px(1)})`;
    if (l.rank === 1) {
      return `<g transform="${at}">
<text class="sea1" letter-spacing="${track}" dx="${track / 2}" font-size="${size}">${esc(l.zh)}</text>
<text class="sea1en" y="14" letter-spacing="1.8" dx="0.9">${esc(l.en.toUpperCase())}</text></g>`;
    }
    return `<g transform="${at}"><text class="sea2" letter-spacing="${track}" dx="${track / 2}" font-size="${size}">${esc(l.zh)}</text></g>`;
  }).join('\n');

  const wave = (x: number, y: number, v: number) =>
    `<use href="#wave" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${(v / k).toFixed(3)})"/>`;
  const waves = WAVES.map((w, i) => {
    const pt = p.projection(w)!;
    return inFrame(screen(pt)) ? wave(pt[0], pt[1], WAVE_SIZES[i % 4]!) : '';
  });
  // Off-globe filler: the frame beyond the projected globe is still sea (SPEC §4.3), so a sparse
  // jittered grid continues the scatter there. Anything that lands on the globe is skipped — the
  // hand-placed list above covers open water, and off-globe cannot collide with land or labels.
  const hash = (i: number, j: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const step = 120 / k;
  for (let j = Math.floor(vy0 / step); j * step < vy1; j++) {
    for (let i = Math.floor(vx0 / step); i * step < vx1; i++) {
      const x = (i + 0.2 + 0.6 * hash(i, j)) * step;
      const y = (j + 0.2 + 0.6 * hash(j, i)) * step;
      const inv = p.projection.invert?.([x, y]);
      const back = inv && p.projection(inv);
      const onGlobe = !!back && Math.hypot(back[0] - x, back[1] - y) < 0.5 && inv![1] > -60 && inv![1] < 85;
      if (!onGlobe) waves.push(wave(x, y, WAVE_SIZES[(i * 3 + j) & 3]!));
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}">
<defs>
<path id="coast-lg" d="${coastLg}"/>
<path id="coast-sm" d="${coastSm}"/>
<g id="coast"><use href="#coast-lg"/><use href="#coast-sm"/></g>
<clipPath id="landclip"><use href="#coast-lg"/><use href="#coast-sm"/></clipPath>
<radialGradient id="depth" cx="50%" cy="46%" r="75%">
<stop offset="0" stop-color="${T.oceanBase}"/><stop offset="0.55" stop-color="${T.oceanBase}"/><stop offset="1" stop-color="${T.oceanAbyss}"/>
</radialGradient>
<g id="wave" fill="none" stroke="${T.seafoam}" stroke-opacity="0.35" stroke-width="1" stroke-linecap="round">
<path d="M-5 -2.4q2.5-2.2 5 0t5 0"/><path d="M-3.5 0.2q1.75-2 3.5 0t3.5 0"/><path d="M-2 2.8q1-1.6 2 0t2 0"/>
</g>
<filter id="grain" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
<feColorMatrix type="saturate" values="0"/>
</filter>
<style>
.sea1{fill:${T.seafoam};fill-opacity:.6;text-anchor:middle;font-weight:500}
.sea1en{fill:${T.seafoam};fill-opacity:.45;text-anchor:middle;font-weight:500;font-size:8.5px}
.sea2{fill:${T.seafoam};fill-opacity:.6;text-anchor:middle;font-weight:500}
.lbl{font-size:${FONT}px;font-weight:600;fill:${T.ink};paint-order:stroke;stroke:${T.paper};stroke-opacity:.78;stroke-width:3px;stroke-linejoin:round}
</style>
</defs>

<!-- L0 base ocean (outside zoom): frame-relative depth gradient -->
<rect width="${width}" height="${height}" fill="url(#depth)"/>

<g transform="${zoom}">
<!-- L1 pseudo-bathymetry shelves: two soft outer steps on large land only, three crisp inner steps on everything -->
${bands}
<!-- L2 wave glyphs -->
${waves.join('\n')}
<!-- L3 land: shade copy (0,+1) under; light fill; main fill offset (+0.8,+0.8) clipped to land → NW inner highlight -->
<use href="#coast" fill="${T.landShade}" transform="translate(0,${px(1)})"/>
<use href="#coast" fill="${T.landLight}"/>
<use href="#coast" fill="${T.land}" transform="translate(${px(0.8)},${px(0.8)})" clip-path="url(#landclip)"/>
<!-- L4 ocean names (counter-scaled) -->
${labels}
<!-- L5 markers (counter-scaled) -->
${markers}
</g>

<!-- L6 static grain (outside zoom) -->
<rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.05"/>
</svg>`;
}

async function main() {
  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    await new Promise((r) => setTimeout(r, 30_000));
    sharp = (await import('sharp')).default;
  }
  console.log(`${polys.length} polygons, ${polys.filter((q) => q.small).length} small (< ${SMALL_SR} sr)`);
  const views: View[] = [
    { width: 1280, height: 720, k: 1, center: null },
    { width: 375, height: 640, k: 1.9, center: [118, 8] },
  ];
  for (const v of views) {
    const svg = render(v);
    const base = join(OUT, `map-${v.width}`);
    writeFileSync(`${base}.svg`, svg);
    await sharp(Buffer.from(svg), { density: 192 }).png().toFile(`${base}.png`);
    console.log(`wrote ${base}.svg/.png (${(svg.length / 1024).toFixed(0)} KB svg)`);
  }
}
main();
