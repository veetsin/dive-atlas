import { generate, correction } from 'lean-qr';
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import { CENTRAL_MERIDIAN, LAT_RANGE, fitWorld, unwrappedPathFor } from './projection';
import { loadCoast } from './geo';
import { sites, siteById, speciesById, spriteUrl } from './data';
import { translate } from './i18n';
import type { Footprint } from './stores';
import type { DiveSite, Lang } from './types';

/**
 * 1080×1920 share poster (SPEC §6.1 #11), drawn straight to Canvas2D with the live map's projection
 * and coastline. It keeps the night-dive poster look on purpose, a deliberate contrast to the
 * day-only app, so the colours are literals copied from app.css's night tokens. (Reading CSS
 * variables here followed the app theme and once painted the place names navy on navy.)
 * Fixed size on purpose: multiplying by devicePixelRatio would blow WebKit's canvas area cap on iOS.
 * Returns a JPEG data URL (WeChat 长按保存 needs <img src=data:>).
 */

const W = 1080;
const H = 1920;
const M = 64; // side margin
const GAP = 36; // between blocks
const QR_PX = 8; // image px per module: survives 朋友圈 / 小红书 re-encoding
const STICKER_H = 120;
const IMG_TIMEOUT = 2000;

const C = {
  deep: '#0e2a47',
  abyss: '#0b1f35', // night --ocean-mid
  ocean: '#123a5c',
  ringFar: '#2a6a85',
  ringMid: '#397c97',
  ringNear: '#4a8fa6',
  landHi: '#3d5b77',
  landLo: '#33506a',
  line: '#9ed9c9', // night --map-line (seafoam): secondary text, graticule, frame
  coral: '#f2795b',
  sun: '#f6c453',
  shell: '#f9a68b',
  paper: '#fbf8f1',
};

// i18n.ts is locked by another task (2026-10-22), so the strings only this poster (and the
// footprint panel's privacy line) need live here for now; move them into i18n.ts later.
const LOCAL = {
  zh: {
    countries: '国家/地区',
    species: '物种',
    speciesCaption: '见过的明星物种',
    scan: '扫码打开潜图',
    empty: '在地图上标记你的第一个潜点',
    more: (n: number) => `还有 ${n} 个`,
    privacy: '分享图会显示你标记的潜点',
  },
  en: {
    countries: 'Countries',
    species: 'Species',
    speciesCaption: "Species I've met",
    scan: 'Scan to open Dive Atlas',
    empty: 'Mark your first dive on the map',
    more: (n: number) => `+${n} more`,
    privacy: 'The share image shows the sites you mark',
  },
};
export const shareStrings = (l: Lang) => LOCAL[l];

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** Longitude relative to the central meridian, in [-180, 180): left-to-right order on the map. */
const rel = (lon: number) => ((((lon - CENTRAL_MERIDIAN) % 360) + 540) % 360) - 180;
/** "马拉帕斯夸（妈妈岛）" → "马拉帕斯夸": map labels and chips need the short form. */
const shortName = (s: string) => s.replace(/\s*[（(][^）)]*[）)]/g, '').trim() || s;

type Ctx = CanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function ellipsis(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** ctx.roundRect is missing on older WeChat / X5 kernels. */
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Each image resolves to null on error or once the shared deadline passes: the poster never waits longer. */
function loadImages(urls: string[]): Promise<(HTMLImageElement | null)[]> {
  const late = new Promise<null>((r) => setTimeout(() => r(null), IMG_TIMEOUT));
  return Promise.all(
    urls.map((src) =>
      Promise.race([
        new Promise<HTMLImageElement | null>((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => res(null);
          im.src = src;
        }),
        late,
      ]),
    ),
  );
}

/**
 * Projection for a map box: cropped to the marked sites (padded, at least 28° × 16°), or the whole
 * world when there are none or they span more than 140° of longitude.
 */
function fitMap(marked: DiveSite[], bw: number, bh: number): { p: GeoProjection; world: boolean } {
  const p = geoNaturalEarth1().rotate([-CENTRAL_MERIDIAN, 0]);
  const ls = marked.map((s) => rel(s.coords[0]));
  const bs = marked.map((s) => s.coords[1]);
  let l0 = Math.min(...ls);
  let l1 = Math.max(...ls);
  if (!marked.length || l1 - l0 > 140) {
    fitWorld(p, bw, bh, 24);
    return { p, world: true };
  }
  let b0 = Math.min(...bs);
  let b1 = Math.max(...bs);
  const padL = Math.max((l1 - l0) * 0.18, 5);
  const padB = Math.max((b1 - b0) * 0.18, 4);
  const grow = (a: number, b: number, min: number) => Math.max(0, min - (b - a)) / 2;
  const gl = grow(l0 - padL, l1 + padL, 28);
  const gb = grow(b0 - padB, b1 + padB, 16);
  l0 = Math.max(-179.9, l0 - padL - gl);
  l1 = Math.min(179.9, l1 + padL + gl);
  b0 = Math.max(LAT_RANGE[0], b0 - padB - gb);
  b1 = Math.min(LAT_RANGE[1], b1 + padB + gb);
  // sample the box edges: Natural Earth meridians curve, so the corners alone would underfit
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const l = l0 + ((l1 - l0) * i) / 8 + CENTRAL_MERIDIAN;
    const b = b0 + ((b1 - b0) * i) / 8;
    pts.push([l, b0], [l, b1], [l0 + CENTRAL_MERIDIAN, b], [l1 + CENTRAL_MERIDIAN, b]);
  }
  p.fitExtent(
    [
      [16, 16],
      [bw - 16, bh - 16],
    ],
    { type: 'MultiPoint', coordinates: pts },
  );
  return { p, world: false };
}

type Chip = { x: number; y: number; w: number; name: string; country: string; more?: boolean };
const CHIP_H = 48;
const CHIP_STEP = 60;
const CAPTION_H = 44;

/** Flow layout of "name · country" chips in at most maxLines lines; whatever does not fit becomes a "+N" chip. */
function layoutChips(ctx: Ctx, list: DiveSite[], lang: Lang, maxLines: number, sans: string): { chips: Chip[]; h: number } {
  const inner = W - 2 * M;
  const measure = (c: Omit<Chip, 'x' | 'y' | 'w'>) => {
    ctx.font = `600 26px ${sans}`;
    let w = ctx.measureText(c.name).width + (c.more ? 40 : 64);
    if (c.country) {
      ctx.font = `400 22px ${sans}`;
      w += ctx.measureText(` · ${c.country}`).width;
    }
    return Math.ceil(w);
  };
  const chips: Chip[] = [];
  let x = 0;
  let line = 0;
  const place = (c: Omit<Chip, 'x' | 'y' | 'w'>): boolean => {
    const w = measure(c);
    if (x > 0 && x + w > inner) {
      if (line + 1 >= maxLines) return false;
      line++;
      x = 0;
    }
    chips.push({ ...c, w, x: M + x, y: line * CHIP_STEP });
    x += w + 12;
    return true;
  };
  ctx.font = `600 26px ${sans}`;
  const items = list.map((s) => ({ name: ellipsis(ctx, shortName(s.name[lang]), 400), country: s.country[lang] }));
  let shown = 0;
  while (shown < items.length && place(items[shown]!)) shown++;
  // make room for the "+N" chip on the last line
  while (shown < items.length) {
    if (place({ name: LOCAL[lang].more(items.length - shown), country: '', more: true })) break;
    const last = chips.pop();
    if (!last) break;
    shown--;
    x = last.x - M;
    line = last.y / CHIP_STEP;
  }
  return { chips, h: list.length ? CAPTION_H + (line + 1) * CHIP_STEP - (CHIP_STEP - CHIP_H) : 0 };
}

export async function renderShareImage(fp: Footprint, lang: Lang, url: string): Promise<string> {
  const dived = fp.dived.map((id) => siteById.get(id)).filter((s): s is DiveSite => !!s);
  const wish = fp.wish.map((id) => siteById.get(id)).filter((s): s is DiveSite => !!s);
  const L = LOCAL[lang];
  const tr = (k: Parameters<typeof translate>[0]) => translate(k, lang);

  const empty = !dived.length && !wish.length;
  // species seen at the dived sites, by how many of them list it (an empty log shows the atlas's most common ones)
  const count = new Map<string, number>();
  for (const s of empty ? sites : dived) for (const id of s.species) count.set(id, (count.get(id) ?? 0) + 1);
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => speciesById.get(id));
  const stickerUrls = ranked
    .map((sp) => (sp ? spriteUrl(sp.sprite, 192) : undefined))
    .filter((u): u is string => !!u)
    .slice(0, 10);
  const [coast, imgs] = await Promise.all([loadCoast(), loadImages(stickerUrls)]);
  const stickers = imgs.filter((im): im is HTMLImageElement => !!im && im.naturalWidth > 0);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const sans = cssVar('--font-sans') || 'sans-serif';
  const serif = cssVar('--font-serif') || 'serif';

  // ---- QR first: its size fixes the footer ----
  const code = generate(url, { minCorrectionLevel: correction.M });
  const qc = document.createElement('canvas');
  code.toCanvas(qc, { on: [14, 42, 71, 255], off: [255, 255, 255, 255], pad: 4 });
  const qs = qc.width * QR_PX;
  const qx = W - M - qs;
  const qy = H - 56 - qs;

  // ---- vertical layout: header, map, stats, stickers, places, footer ----
  const mapTop = 236;
  const avail = qy - 72 - mapTop;
  const statsH = 150;
  const stripH = stickers.length ? 36 + 154 : 0;
  const bw = W - 80;
  const marked = [...dived, ...wish];
  const { p: probe, world } = fitMap(marked, bw, 1000);
  const worldH = world ? Math.ceil((probe([CENTRAL_MERIDIAN, LAT_RANGE[0]])?.[1] ?? 0) - (probe([CENTRAL_MERIDIAN, LAT_RANGE[1]])?.[1] ?? 0)) + 48 : 0;
  let dChips = layoutChips(ctx, dived, lang, 4, sans);
  let wChips = layoutChips(ctx, wish, lang, 2, sans);
  const blocks = () => [statsH, stripH, dChips.h, wChips.h].filter((h) => h > 0);
  const fixed = () => blocks().reduce((a, h) => a + h + GAP, 0);
  for (const [dl, wl] of [
    [3, 2],
    [3, 1],
    [2, 1],
  ] as const) {
    if (avail - fixed() >= (world ? worldH : 520)) break;
    dChips = layoutChips(ctx, dived, lang, dl, sans);
    wChips = layoutChips(ctx, wish, lang, wl, sans);
  }
  // the world gets up to 80 px of open sea above and below; a crop takes whatever is left
  const mapH = Math.max(300, Math.min(avail - fixed(), world ? worldH + 160 : 900));
  const spread = Math.max(0, avail - fixed() - mapH) / (blocks().length + 1);

  // ---- background ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.deep);
  bg.addColorStop(1, C.abyss);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  let seed = 2026;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stars = (n: number, x: number, y: number, w: number, h: number, alpha: number) => {
    ctx.fillStyle = C.line;
    for (const [r, a] of [
      [1, alpha],
      [1.8, alpha * 0.8],
    ] as const) {
      ctx.globalAlpha = a;
      ctx.beginPath();
      for (let i = 0; i < n / 2; i++) {
        const sx = x + rnd() * w;
        const sy = y + rnd() * h;
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  stars(120, 0, 0, W, H, 0.22);

  // ---- header ----
  ctx.fillStyle = C.coral;
  ctx.fillRect(M, 62, 56, 6);
  ctx.fillStyle = C.paper;
  ctx.font = `700 76px ${serif}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(tr('footprint.shareTitle'), M, 152);
  ctx.fillStyle = C.line;
  ctx.font = `500 28px ${sans}`;
  const countries = [...new Set(dived.map((s) => s.country[lang]))];
  const sub = countries.length ? countries.join(' · ') : empty ? tr('app.subtitle') : tr('app.tagline');
  ctx.fillText(ellipsis(ctx, sub, W - 2 * M), M, 202);

  // ---- map ----
  const bx = 40;
  const by = mapTop + spread;
  const { p } = fitMap(marked, bw, mapH);
  const path = geoPath(p, ctx);
  ctx.save();
  ctx.translate(bx, by);
  ctx.beginPath();
  ctx.rect(0, 0, bw, mapH);
  ctx.clip();
  const sea = ctx.createRadialGradient(bw * 0.46, mapH * 0.44, 0, bw * 0.46, mapH * 0.44, Math.hypot(bw, mapH) * 0.62);
  sea.addColorStop(0, C.ocean);
  sea.addColorStop(1, C.deep);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, bw, mapH);
  stars(90, 0, 0, bw, mapH, 0.3);

  const step = world ? 30 : 10;
  ctx.strokeStyle = C.line;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  ctx.beginPath();
  path(geoGraticule().step([step, step]).extent([[-180, LAT_RANGE[0]], [180, LAT_RANGE[1]]])());
  ctx.stroke();
  ctx.globalAlpha = 1;

  // coastline projected once into Path2D, then the night shelf bands (MapView .s2–.s4) and the land fill
  const upath = unwrappedPathFor(p);
  const trace = (geom: Parameters<typeof path>[0]) => {
    const p2 = new Path2D();
    // d3 only calls moveTo / lineTo / closePath / arc, which Path2D has (its typing also asks for beginPath)
    const c2 = p2 as unknown as Ctx;
    path.context(c2)(geom);
    if (coast.greenland) upath.context(c2)(coast.greenland);
    return p2;
  };
  const bigP = trace(coast.big);
  const landP = trace(coast.land);
  path.context(ctx);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [geom, w, color, alpha] of [
    [bigP, 20, C.ringFar, 0.18],
    [landP, 10, C.ringMid, 0.45],
    [landP, 4, C.ringNear, 0.9],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.stroke(geom);
  }
  ctx.globalAlpha = 1;
  const land = ctx.createLinearGradient(0, 0, bw, mapH);
  land.addColorStop(0, C.landHi);
  land.addColorStop(1, C.landLo);
  ctx.fillStyle = land;
  ctx.fill(landP);

  // every other site as a faint dot, so the map shows what is still out there
  const markedIds = new Set(marked.map((s) => s.id));
  ctx.fillStyle = C.line;
  ctx.globalAlpha = empty ? 0.6 : 0.35;
  ctx.beginPath();
  for (const s of sites) {
    if (markedIds.has(s.id)) continue;
    const q = p(s.coords);
    if (!q) continue;
    ctx.moveTo(q[0] + 3, q[1]);
    ctx.arc(q[0], q[1], 3, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;

  // voyage line: great circles through the dived sites, west → east
  if (dived.length > 1) {
    ctx.beginPath();
    path({ type: 'LineString', coordinates: [...dived].sort((a, b) => rel(a.coords[0]) - rel(b.coords[0])).map((s) => s.coords) });
    ctx.strokeStyle = C.shell;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([12, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // compass, top right
  const cx = bw - 58;
  const cy = 62;
  ctx.strokeStyle = C.line;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 22);
  ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.coral;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.fill();
  const occupied: Box[] = [{ x: cx - 34, y: cy - 34, w: 68, h: 68 }];

  // markers: dived = coral disc on a pre-rendered glow, wish = sun ring
  const glow = document.createElement('canvas');
  glow.width = glow.height = 96;
  const gctx = glow.getContext('2d');
  if (gctx) {
    const rg = gctx.createRadialGradient(48, 48, 0, 48, 48, 48);
    rg.addColorStop(0, 'rgba(242,121,91,0.6)');
    rg.addColorStop(0.35, 'rgba(242,121,91,0.24)');
    rg.addColorStop(1, 'rgba(242,121,91,0)');
    gctx.fillStyle = rg;
    gctx.fillRect(0, 0, 96, 96);
  }
  const pts = marked
    .map((s) => ({ s, q: p(s.coords), dived: dived.includes(s) }))
    .filter((m): m is { s: DiveSite; q: [number, number]; dived: boolean } => !!m.q);
  for (const m of pts) occupied.push({ x: m.q[0] - 12, y: m.q[1] - 12, w: 24, h: 24 });
  for (const m of pts.filter((m) => !m.dived)) {
    const [x, y] = m.q;
    ctx.fillStyle = C.deep;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.sun;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  for (const m of pts.filter((m) => m.dived)) ctx.drawImage(glow, m.q[0] - 48, m.q[1] - 48);
  for (const m of pts.filter((m) => m.dived)) {
    const [x, y] = m.q;
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.arc(x, y, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // labels: greedy, dived first; a label that fits nowhere is dropped, its dot stays
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'middle';
  for (const m of pts) {
    ctx.font = m.dived ? `700 26px ${sans}` : `600 24px ${sans}`;
    const text = ellipsis(ctx, shortName(m.s.name[lang]), 320);
    const tw = ctx.measureText(text).width;
    const th = 30;
    const [x, y] = m.q;
    const own = (b: Box) => b.x === x - 12 && b.y === y - 12;
    const spots: Box[] = [
      { x: x + 17, y: y - th / 2, w: tw, h: th },
      { x: x - 17 - tw, y: y - th / 2, w: tw, h: th },
      { x: x - tw / 2, y: y - 18 - th, w: tw, h: th },
      { x: x - tw / 2, y: y + 18, w: tw, h: th },
    ];
    const spot = spots.find(
      (b) => b.x > 8 && b.y > 8 && b.x + b.w < bw - 8 && b.y + b.h < mapH - 8 && !occupied.some((o) => !own(o) && hit(o, b)),
    );
    if (!spot) continue;
    occupied.push({ x: spot.x - 4, y: spot.y, w: spot.w + 8, h: spot.h });
    ctx.strokeStyle = 'rgba(11,31,53,0.85)';
    ctx.lineWidth = 7;
    ctx.strokeText(text, spot.x, spot.y + th / 2);
    ctx.fillStyle = m.dived ? C.paper : C.sun;
    ctx.fillText(text, spot.x, spot.y + th / 2);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  // frame: a hairline pair around the map
  ctx.strokeStyle = C.line;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, mapH);
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 8, by - 8, bw + 16, mapH + 16);
  ctx.globalAlpha = 1;

  let y = by + mapH + GAP + spread;

  // ---- stats (or the empty-state invitation) ----
  if (empty) {
    ctx.textAlign = 'center';
    ctx.fillStyle = C.paper;
    ctx.font = `700 48px ${serif}`;
    ctx.fillText(L.empty, W / 2, y + 70);
    ctx.fillStyle = C.line;
    ctx.font = `500 28px ${sans}`;
    ctx.fillText(tr('app.tagline'), W / 2, y + 124);
    ctx.textAlign = 'left';
  } else {
    const species = new Set(dived.flatMap((s) => s.species)).size;
    const stats: [number, string, string][] = [
      [dived.length, tr('footprint.dived'), C.coral],
      [wish.length, tr('footprint.wish'), C.sun],
      [new Set(dived.map((s) => s.country.en)).size, L.countries, C.paper],
      [species, L.species, C.line],
    ];
    const colW = (W - 2 * M) / 4;
    stats.forEach(([n, label, color], i) => {
      const x = M + i * colW;
      if (i) {
        ctx.fillStyle = C.line;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x - 20, y + 20, 1.5, 110);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.font = `700 96px ${serif}`;
      ctx.fillText(String(n), x, y + 96);
      ctx.fillStyle = C.line;
      ctx.font = `500 26px ${sans}`;
      ctx.fillText(ellipsis(ctx, label, colW - 28), x, y + 140);
    });
  }
  y += statsH + GAP + spread;

  // ---- sticker strip: the most-listed species at the dived sites, overlapping like a sticker sheet ----
  if (stickers.length) {
    ctx.fillStyle = C.line;
    ctx.font = `600 24px ${sans}`;
    ctx.fillText(empty ? tr('card.species') : L.speciesCaption, M, y + 24);
    const py = y + 36;
    rr(ctx, M, py, W - 2 * M, 154, 22);
    ctx.fillStyle = 'rgba(158,217,201,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(158,217,201,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const sized = stickers.map((im) => {
      const aspect = im.naturalWidth / im.naturalHeight;
      const w = Math.min(aspect * STICKER_H, 230);
      return { im, w, h: w / aspect };
    });
    const inner = W - 2 * M - 48;
    const width = () => sized.reduce((a, s) => a + s.w, 0) + 16 * (sized.length - 1);
    // a slight overlap reads as a sticker sheet, a heavy one as a pile: keep the top species that fit
    while (sized.length > 1 && width() > inner * 1.2) sized.pop();
    const total = width();
    const first = sized[0]!;
    const last = sized[sized.length - 1]!;
    const centres =
      total <= inner
        ? sized.reduce<number[]>((acc, s, i) => {
            const prev = i ? acc[i - 1]! + sized[i - 1]!.w / 2 + 16 : M + 24 + (inner - total) / 2;
            acc.push(prev + s.w / 2);
            return acc;
          }, [])
        : sized.map((_, i) => {
            const a = M + 24 + first.w / 2;
            const b = W - M - 24 - last.w / 2;
            return sized.length > 1 ? a + ((b - a) * i) / (sized.length - 1) : (a + b) / 2;
          });
    // the most-listed species is drawn last, so it sits on top
    for (let i = sized.length - 1; i >= 0; i--) {
      const s = sized[i]!;
      ctx.save();
      ctx.translate(centres[i]!, py + 77 + (i % 2 ? 6 : -6));
      ctx.rotate(((i % 2 ? 1 : -1) * 4 * Math.PI) / 180);
      ctx.drawImage(s.im, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
    y += stripH + GAP + spread;
  }

  // ---- places ----
  const drawChips = (chips: Chip[], top: number, caption: string, n: number, color: string, tint: string, ring: boolean) => {
    ctx.fillStyle = color;
    ctx.font = `700 24px ${sans}`;
    ctx.fillText(`${caption} · ${n}`, M, top + 24);
    for (const c of chips) {
      const cy0 = top + CAPTION_H + c.y;
      rr(ctx, c.x, cy0, c.w, CHIP_H, CHIP_H / 2);
      ctx.fillStyle = c.more ? 'rgba(251,248,241,0.08)' : tint;
      ctx.fill();
      let tx = c.x + 20;
      if (!c.more) {
        ctx.beginPath();
        ctx.arc(tx + 6, cy0 + CHIP_H / 2, 6, 0, Math.PI * 2);
        if (ring) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fill();
        }
        tx += 24;
      }
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.more ? C.line : ring ? C.sun : C.paper;
      ctx.font = `600 26px ${sans}`;
      ctx.fillText(c.name, tx, cy0 + CHIP_H / 2 + 1);
      if (c.country) {
        tx += ctx.measureText(c.name).width;
        ctx.fillStyle = C.line;
        ctx.font = `400 22px ${sans}`;
        ctx.fillText(` · ${c.country}`, tx, cy0 + CHIP_H / 2 + 1);
      }
      ctx.textBaseline = 'alphabetic';
    }
  };
  if (dChips.h) {
    drawChips(dChips.chips, y, tr('footprint.dived'), dived.length, C.coral, 'rgba(242,121,91,0.2)', false);
    y += dChips.h + GAP + spread;
  }
  if (wChips.h) drawChips(wChips.chips, y, tr('footprint.wish'), wish.length, C.sun, 'rgba(246,196,83,0.13)', true);

  // ---- footer: QR (ECC M, integer scale, white quiet zone) + brand ----
  ctx.fillStyle = C.line;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(M, qy - 36, W - 2 * M, 1.5);
  ctx.globalAlpha = 1;
  ctx.save();
  rr(ctx, qx, qy, qs, qs, 18);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qc, qx, qy, qs, qs);
  ctx.restore();
  ctx.fillStyle = C.paper;
  ctx.font = `700 40px ${serif}`;
  ctx.fillText(L.scan, M, qy + 84);
  ctx.fillStyle = C.coral;
  ctx.fillRect(M, qy + 112, 40, 4);
  ctx.fillStyle = C.line;
  ctx.font = `600 28px ${sans}`;
  ctx.fillText(`${tr('app.title')} · ${tr('app.subtitle')}`, M, qy + 176);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep the raw url */
  }
  ctx.globalAlpha = 0.75;
  ctx.font = `500 26px ${sans}`;
  ctx.fillText(host, M, qy + 222);
  ctx.globalAlpha = 1;

  return canvas.toDataURL('image/jpeg', 0.9);
}
