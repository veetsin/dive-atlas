import { generate, correction } from 'lean-qr';
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import { CENTRAL_MERIDIAN, LAT_RANGE, fitWorld } from './projection';
import { sites, siteById, speciesById, spriteUrl } from './data';
import { translate, type I18nKey } from './i18n';
import { footprintStats, rankTitle } from './ranks';
import type { Footprint } from './stores';
import type { DiveSite, Lang, Species } from './types';

/**
 * 1080×1920 share poster v3, "潜水星图" (SPEC §6.1 #11): a dark editorial star chart, no landmasses.
 * Lat/lon grid fitted to the marked sites, dived = gold glow dots on a spline, wish = gold rings,
 * up to 8 unmarked sites in grey as context; title from the ladder in ranks.ts; stats; 标本录 of
 * sighted species; QR to the plain site. Colours are poster literals, independent of the app theme.
 * Fixed size on purpose: multiplying by devicePixelRatio would blow WebKit's canvas area cap on iOS.
 * Loaded lazily by FootprintPanel. Returns a JPEG data URL (WeChat 长按保存 needs <img src=data:>).
 */

const W = 1080;
const H = 1920;
const M = 72; // side margin
const QR_PX = 8; // image px per module: survives re-encoding by chat apps
const IMG_TIMEOUT = 2000;
const CONTEXT_MAX = 8;
const LOG_ROWS = 3; // × 2 columns
const ROW_H = 74;

const C = {
  bg: '#101113',
  gold: '#d4a74a',
  white: '#f3f1ec',
  grey: '#8b8e94', // secondary text, wish labels
  dim: '#5c5f66', // context sites, tick labels
  grid: '#222428',
  rule: '#2e3035',
};

type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
const RARITY: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** `rarity` is being added to Species by another task; until then everything is common. */
const rarityOf = (sp: Species) => RARITY[(sp as Species & { rarity?: Rarity }).rarity ?? 'common'] ?? 0;

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** Longitude relative to the central meridian, in [-180, 180): left-to-right order on the app's map. */
const rel = (lon: number) => ((((lon - CENTRAL_MERIDIAN) % 360) + 540) % 360) - 180;
/** "马拉帕斯夸（妈妈岛）" → "马拉帕斯夸": chart labels need the short form. */
const shortName = (s: string) => s.replace(/\s*[（(][^）)]*[）)]/g, '').trim() || s;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

type Ctx = CanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function ellipsis(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Set ctx.font at `size`, shrunk until `text` fits `maxW`. */
function fitFont(ctx: Ctx, text: string, font: (px: number) => string, size: number, maxW: number): void {
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = font(Math.floor((size * maxW) / w));
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
function loadImages(urls: (string | undefined)[]): Promise<(HTMLImageElement | null)[]> {
  const late = new Promise<null>((r) => setTimeout(() => r(null), IMG_TIMEOUT));
  return Promise.all(
    urls.map((src) =>
      src
        ? Promise.race([
            new Promise<HTMLImageElement | null>((res) => {
              const im = new Image();
              im.onload = () => res(im.naturalWidth > 0 ? im : null);
              im.onerror = () => res(null);
              im.src = src;
            }),
            late,
          ])
        : null,
    ),
  );
}

/** Stable 4-digit "edition number" from the name and the dived sites (FNV-1a). */
function edition(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return String((h >>> 0) % 10000).padStart(4, '0');
}

function roman(n: number): string {
  let out = '';
  for (const [v, s] of [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ] as const)
    for (; n >= v; n -= v) out += s;
  return out;
}

/**
 * Natural Earth I for a chart box up to bw × bh. World window (no marks, or > 140° of longitude):
 * the app's exact 150°E projection, box cut to the world's height plus 44 px of tick labels below.
 * Regional window: the marks' box padded (≥ 30° × 16°), NE I re-centred on the window's own meridian
 * so it never straddles the app's 30°W cut; the box's aspect fills the rest. h = box height used.
 */
function fitChart(marked: DiveSite[], bw: number, bh: number): { p: GeoProjection; world: boolean; c: number; h: number } {
  const ls = marked.map((s) => rel(s.coords[0]));
  let l0 = Math.min(...ls);
  let l1 = Math.max(...ls);
  if (!marked.length || l1 - l0 > 140) {
    const p = geoNaturalEarth1().rotate([-CENTRAL_MERIDIAN, 0]);
    fitWorld(p, bw, bh - 44, 12);
    const lens = (p([CENTRAL_MERIDIAN, LAT_RANGE[0]])?.[1] ?? 0) - (p([CENTRAL_MERIDIAN, LAT_RANGE[1]])?.[1] ?? 0);
    const h = Math.min(bh, Math.ceil(lens) + 24 + 44);
    fitWorld(p, bw, h - 44, 12);
    return { p, world: true, c: CENTRAL_MERIDIAN, h };
  }
  const bs = marked.map((s) => s.coords[1]);
  let b0 = Math.min(...bs);
  let b1 = Math.max(...bs);
  const padL = Math.max((l1 - l0) * 0.18, 4);
  const padB = Math.max((b1 - b0) * 0.18, 3);
  const grow = (a: number, b: number, min: number) => Math.max(0, min - (b - a)) / 2;
  const gl = grow(l0 - padL, l1 + padL, 30);
  const gb = grow(b0 - padB, b1 + padB, 16);
  l0 -= padL + gl;
  l1 += padL + gl;
  b0 = Math.max(LAT_RANGE[0], b0 - padB - gb);
  b1 = Math.min(LAT_RANGE[1], b1 + padB + gb);
  const c = CENTRAL_MERIDIAN + (l0 + l1) / 2;
  const hw = (l1 - l0) / 2;
  const p = geoNaturalEarth1().rotate([-c, 0]);
  // sample the box edges: NE I meridians curve, so the corners alone would underfit
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const l = c - hw + (hw * i) / 4;
    const b = b0 + ((b1 - b0) * i) / 8;
    pts.push([l, b0], [l, b1], [c - hw, b], [c + hw, b]);
  }
  p.fitExtent([[0, 0], [bw, bh]], { type: 'MultiPoint', coordinates: pts });
  return { p, world: false, c, h: bh };
}

/** Voyage order: start at the westernmost point, then always hop to the nearest unvisited one. */
function voyage(pts: [number, number][]): [number, number][] {
  const left = [...pts].sort((a, b) => a[0] - b[0]);
  const out = left.splice(0, 1);
  while (left.length) {
    const [x, y] = out[out.length - 1]!;
    let best = 0;
    left.forEach((q, i) => {
      if (Math.hypot(q[0] - x, q[1] - y) < Math.hypot(left[best]![0] - x, left[best]![1] - y)) best = i;
    });
    out.push(left.splice(best, 1)[0]!);
  }
  return out;
}

/** Catmull-Rom through the points as Béziers; two points get a gentle arc through a raised midpoint. */
function spline(ctx: Ctx, pts: [number, number][]): void {
  if (pts.length === 2) {
    const [a, b] = pts as [[number, number], [number, number]];
    let nx = (b[1] - a[1]) * 0.14;
    let ny = (a[0] - b[0]) * 0.14;
    if (ny > 0) [nx, ny] = [-nx, -ny]; // bow upwards
    pts = [a, [(a[0] + b[0]) / 2 + nx, (a[1] + b[1]) / 2 + ny], b];
  }
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1],
    );
  }
}

/** Gold diamonds, right-aligned at x: ◆ rare, ◆◆ epic, ◆◆◆ legendary. */
function diamonds(ctx: Ctx, n: number, xRight: number, y: number): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const cx = xRight - 7 - i * 18;
    ctx.moveTo(cx, y - 7);
    ctx.lineTo(cx + 6, y);
    ctx.lineTo(cx, y + 7);
    ctx.lineTo(cx - 6, y);
    ctx.closePath();
  }
  ctx.fill();
}

export async function renderShareImage(fp: Footprint, lang: Lang, url: string, name = ''): Promise<string> {
  const tr = (k: I18nKey) => translate(k, lang);
  const dived = fp.dived.map((id) => siteById.get(id)).filter((s): s is DiveSite => !!s);
  const wish = fp.wish.map((id) => siteById.get(id)).filter((s): s is DiveSite => !!s);
  const marked = [...dived, ...wish];
  const st = footprintStats(dived);
  const title = rankTitle(st, lang);

  // ---- 标本录: sighted species, or (greyed) what the marked sites offer ----
  const byRarity = (a: Species, b: Species) =>
    rarityOf(b) - rarityOf(a) || a.name[lang].localeCompare(b.name[lang], lang === 'zh' ? 'zh-CN' : 'en');
  const toSpecies = (ids: Iterable<string>) => [...new Set(ids)].map((id) => speciesById.get(id)).filter((s): s is Species => !!s);
  const seen = toSpecies(fp.seen);
  const available = new Set((dived.length ? dived : wish).flatMap((s) => s.species));
  const greyed = !seen.length;
  const logRows = (greyed ? toSpecies(available) : seen).sort(byRarity).slice(0, LOG_ROWS * 2);
  const logTotal = new Set([...dived.flatMap((s) => s.species), ...fp.seen]).size;
  const rarePlus = seen.filter((sp) => rarityOf(sp) > 0).length;
  const imgs = await loadImages(logRows.map((sp) => spriteUrl(sp.sprite, 192)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const sans = cssVar('--font-sans') || 'sans-serif';
  const serif = cssVar('--font-serif') || 'serif';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const rule = (y: number) => {
    ctx.fillStyle = C.rule;
    ctx.fillRect(M, y, W - 2 * M, 1.5);
  };

  // ---- QR first: its size fixes the footer, and the footer fixes everything above the chart ----
  const code = generate(url, { minCorrectionLevel: correction.M });
  const qc = document.createElement('canvas');
  code.toCanvas(qc, { on: [16, 17, 19, 255], off: [255, 255, 255, 255], pad: 4 });
  const qs = qc.width * QR_PX;
  const qx = W - M - qs;
  const qy = H - 72 - qs;
  const footRule = qy - 36;
  const rowsTop = footRule - 24 - LOG_ROWS * ROW_H;
  const logHead = rowsTop - 34;
  const statLabel = logHead - 82;
  const statNum = statLabel - 40;
  const chartBottom = statNum - 116;

  // ---- header ----
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 24px ${sans}`;
  ctx.letterSpacing = '3px';
  ctx.fillStyle = C.white;
  ctx.fillText(ellipsis(ctx, (name ? `${tr('app.title')} · ${name}` : tr('app.title')).toUpperCase(), 560), M, 100);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.grey;
  ctx.fillText(fill(tr('poster.edition'), { n: edition(`${name}|${fp.dived.join(',')}`), year: roman(new Date().getFullYear()) }), W - M, 100);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
  rule(132);

  // ---- title + chart: the chart takes what is left above the stats; a world chart is only as
  // tall as the world, and the spare height goes above the title ----
  const titleH = (name ? 66 : 0) + (title.prefix ? 88 : 0) + 104;
  const bx = M;
  const bw = W - 2 * M;
  const { p, world, c, h: bh } = fitChart(marked, bw, chartBottom - 140 - titleH - 48);
  const by = chartBottom - bh;
  let y = by - 48 - titleH;
  if (name) {
    ctx.fillStyle = C.grey;
    ctx.font = `500 28px ${sans}`;
    ctx.fillText(ellipsis(ctx, fill(tr('poster.byline'), { name }), W - 2 * M), M, (y += 66));
  }
  if (title.prefix) {
    ctx.fillStyle = C.white;
    fitFont(ctx, title.prefix, (px) => `600 ${px}px ${serif}`, 64, W - 2 * M);
    ctx.fillText(title.prefix, M, (y += 88));
  }
  ctx.fillStyle = C.gold;
  fitFont(ctx, title.noun, (px) => `700 ${px}px ${serif}`, 92, W - 2 * M);
  ctx.fillText(title.noun, M, (y += 104));

  // ---- chart ----
  const path = geoPath(p, ctx);
  ctx.save();
  ctx.translate(bx, by);
  ctx.beginPath();
  ctx.rect(0, 0, bw, bh);
  ctx.clip();

  const step = world ? 30 : 5;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  path(geoGraticule().step([step, step]).extent(world ? [[-180, LAT_RANGE[0]], [180, LAT_RANGE[1]]] : [[-180, -85], [180, 88]])());
  ctx.stroke();
  const at = (lon: number, lat: number) => p([lon, lat]) ?? [NaN, NaN];
  const lensLeft = (lat: number) => at(c - 179.99, lat)[0];
  if (world) {
    // the cropped world's outline: the 85°N and 60°S parallels joined by the edge meridians
    ctx.strokeStyle = C.rule;
    ctx.beginPath();
    for (let b = LAT_RANGE[1]; b >= LAT_RANGE[0]; b -= 5) ctx.lineTo(lensLeft(b), at(c, b)[1]);
    for (let b = LAT_RANGE[0]; b <= LAT_RANGE[1]; b += 5) ctx.lineTo(at(c + 179.99, b)[0], at(c, b)[1]);
    ctx.closePath();
    ctx.stroke();
  }

  // tick labels inside the frame: latitudes on the left, longitudes along the bottom
  const occupied: Box[] = [];
  const tickLabel = (text: string, x: number, ty: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    const w = ctx.measureText(text).width;
    ctx.fillText(text, x, ty);
    occupied.push({ x: align === 'right' ? x - w - 4 : x - 4, y: ty - 18, w: w + 8, h: 24 });
  };
  ctx.font = `500 19px ${sans}`;
  ctx.fillStyle = C.dim;
  // nautical letters in both languages: chart ticks read like a chart
  const hemi = (k: 'tick.n' | 'tick.s' | 'tick.e' | 'tick.w') => translate(k, 'en');
  const lonText = (l: number) => {
    const L = Math.round(((((l + 180) % 360) + 360) % 360) - 180);
    return L === 0 || L === -180 ? `${Math.abs(L)}°` : `${Math.abs(L)}°${hemi(L > 0 ? 'tick.e' : 'tick.w')}`;
  };
  const latText = (b: number) => (b === 0 ? '0°' : `${Math.abs(b)}°${hemi(b > 0 ? 'tick.n' : 'tick.s')}`);
  const pxPerDeg = Math.abs(at(c + 1, 0)[0] - at(c, 0)[0]);
  const yAt = (b: number) => at(c, b)[1];
  const lonStep = world ? 30 : ([5, 10, 15, 30, 45].find((s) => s * pxPerDeg >= 130) ?? 60);
  const latStep = world ? 30 : ([5, 10, 15, 30].find((s) => Math.abs(yAt(0) - yAt(s)) >= 64) ?? 45);
  const bottomLat = world ? LAT_RANGE[0] : Math.max(-89, p.invert?.([bw / 2, bh])?.[1] ?? LAT_RANGE[0]);
  const lonY = world ? yAt(LAT_RANGE[0]) + 30 : bh - 12;
  for (let l = Math.ceil((c - 180) / lonStep) * lonStep; l <= c + 180; l += lonStep) {
    const x = at(l, bottomLat)[0];
    if (!(x > 12 && x < bw - 90) || (world && Math.abs(rel(l)) > 170)) continue;
    tickLabel(lonText(l), world ? x : x + 7, lonY, world ? 'center' : 'left');
  }
  for (let b = Math.ceil(-85 / latStep) * latStep; b <= 85; b += latStep) {
    const ty = yAt(b) - 8;
    if (!(ty > 26 && ty < bh - 44) || (world && (b < LAT_RANGE[0] || b > LAT_RANGE[1]))) continue;
    tickLabel(latText(b), world ? lensLeft(b) + 10 : 10, ty, 'left');
  }
  const eqY = yAt(0);
  if (eqY > 30 && eqY < bh - 30) {
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    path({ type: 'LineString', coordinates: [[c - 179.99, 0], [c, 0], [c + 179.99, 0]] });
    ctx.stroke();
    ctx.fillStyle = C.grey;
    tickLabel(tr('poster.equator'), world ? at(c + 179.99, 0)[0] - 12 : bw - 12, eqY - 9, 'right');
  }
  ctx.textAlign = 'left';

  // ---- sites ----
  type Pt = { s: DiveSite; x: number; y: number; dot: Box };
  const proj = (s: DiveSite): Pt | null => {
    const q = p(s.coords);
    return q ? { s, x: q[0], y: q[1], dot: { x: q[0] - 12, y: q[1] - 12, w: 24, h: 24 } } : null;
  };
  const dPts = dived.map(proj).filter((m): m is Pt => !!m);
  const wPts = wish.map(proj).filter((m): m is Pt => !!m);
  for (const m of [...dPts, ...wPts]) occupied.push(m.dot);

  /** Greedy: right, left, above, below; null when every spot collides or leaves the frame. */
  const placeLabel = (m: Pt, text: string, gap: number): Box | null => {
    const tw = ctx.measureText(text).width;
    const th = 30;
    const spots: Box[] = [
      { x: m.x + gap, y: m.y - th / 2, w: tw, h: th },
      { x: m.x - gap - tw, y: m.y - th / 2, w: tw, h: th },
      { x: m.x - tw / 2, y: m.y - gap - th + 4, w: tw, h: th },
      { x: m.x - tw / 2, y: m.y + gap - 4, w: tw, h: th },
    ];
    const spot = spots.find(
      (b) => b.x > 8 && b.y > 8 && b.x + b.w < bw - 8 && b.y + b.h < bh - 8 && !occupied.some((o) => o !== m.dot && hit(o, b)),
    );
    if (spot) occupied.push({ x: spot.x - 4, y: spot.y, w: spot.w + 8, h: spot.h });
    return spot ?? null;
  };
  const labelFont = { dived: `600 26px ${sans}`, wish: `500 23px ${sans}`, context: `400 19px ${sans}` };
  const labels: { text: string; box: Box; color: string; font: string }[] = [];
  const label = (m: Pt, kind: keyof typeof labelFont, gap: number, color: string): boolean => {
    ctx.font = labelFont[kind];
    const text = ellipsis(ctx, shortName(m.s.name[lang]), kind === 'context' ? 220 : 320);
    const box = placeLabel(m, text, gap);
    if (box) labels.push({ text, box, color, font: labelFont[kind] });
    return !!box;
  };
  for (const m of dPts) label(m, 'dived', 18, C.white);
  for (const m of wPts) label(m, 'wish', 17, C.grey);

  // context: farthest-point picks among unmarked sites in the frame, verified first; a site whose
  // dot or name would touch anything already placed is skipped, so dived labels always win
  const markedIds = new Set(marked.map((s) => s.id));
  const taken: [number, number][] = [...dPts, ...wPts].map((m) => [m.x, m.y]);
  if (!taken.length) taken.push([bw / 2, bh / 2]);
  const cPts: Pt[] = [];
  for (const verified of [true, false]) {
    const pool = sites
      .filter((s) => s.verified === verified && !markedIds.has(s.id))
      .map(proj)
      .filter((m): m is Pt => !!m && m.x > 24 && m.x < bw - 24 && m.y > 24 && m.y < bh - 24);
    while (cPts.length < CONTEXT_MAX && pool.length) {
      let best = 0;
      let bestD = -1;
      pool.forEach((m, i) => {
        const d = Math.min(...taken.map(([x, y]) => (x - m.x) ** 2 + (y - m.y) ** 2));
        if (d > bestD) [best, bestD] = [i, d];
      });
      const m = pool.splice(best, 1)[0]!;
      m.dot = { x: m.x - 6, y: m.y - 6, w: 12, h: 12 };
      if (occupied.some((o) => hit(o, m.dot))) continue;
      occupied.push(m.dot);
      if (!label(m, 'context', 11, C.dim)) {
        occupied.pop();
        continue;
      }
      cPts.push(m);
      taken.push([m.x, m.y]);
    }
  }

  // voyage: a spline through the dived sites from the westernmost, nearest-next
  if (dPts.length > 1) {
    ctx.strokeStyle = C.gold;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    spline(ctx, voyage(dPts.map((m) => [m.x, m.y])));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = C.dim;
  ctx.beginPath();
  for (const m of cPts) {
    ctx.moveTo(m.x + 4, m.y);
    ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
  }
  ctx.fill();
  for (const m of wPts) {
    ctx.fillStyle = C.bg;
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // glow rendered once, stamped per dot (no shadowBlur)
  const glow = document.createElement('canvas');
  glow.width = glow.height = 120;
  const g = glow.getContext('2d');
  if (g) {
    const rg = g.createRadialGradient(60, 60, 0, 60, 60, 60);
    rg.addColorStop(0, 'rgba(212,167,74,0.55)');
    rg.addColorStop(0.3, 'rgba(212,167,74,0.2)');
    rg.addColorStop(1, 'rgba(212,167,74,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 120, 120);
  }
  for (const m of dPts) ctx.drawImage(glow, m.x - 60, m.y - 60);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  for (const m of dPts) {
    ctx.moveTo(m.x + 8, m.y);
    ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.textBaseline = 'middle';
  for (const l of labels) {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, l.box.x, l.box.y + l.box.h / 2 + 1);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, bh);

  // ---- stats ----
  const stats: [number, I18nKey][] = [
    [st.sites, 'poster.sites'],
    [st.countries, 'poster.countries'],
    [st.species, 'poster.species'],
    [st.km, 'poster.km'],
  ];
  const colW = bw / 4;
  const nums = stats.map(([n]) => n.toLocaleString('en-US'));
  ctx.font = `600 84px ${sans}`;
  const widest = Math.max(...nums.map((n) => ctx.measureText(n).width));
  const numPx = Math.min(84, Math.floor((84 * (colW - 28)) / widest));
  stats.forEach(([, key], i) => {
    const x = M + i * colW + (i ? 24 : 0);
    if (i) {
      ctx.fillStyle = C.rule;
      ctx.fillRect(x - 24, statNum - 70, 1.5, statLabel - statNum + 80);
    }
    ctx.fillStyle = C.white;
    ctx.font = `600 ${numPx}px ${sans}`;
    ctx.fillText(nums[i]!, x, statNum);
    ctx.fillStyle = C.grey;
    ctx.font = `500 24px ${sans}`;
    ctx.fillText(ellipsis(ctx, tr(key), colW - 32), x, statLabel);
  });
  rule(statLabel + 36);

  // ---- 标本录 ----
  if (logRows.length) {
    ctx.fillStyle = C.gold;
    ctx.font = `700 28px ${serif}`;
    ctx.letterSpacing = '4px';
    ctx.fillText(tr('poster.log'), M, logHead);
    ctx.letterSpacing = '0px';
    const headW = ctx.measureText(tr('poster.log')).width + 32;
    ctx.textAlign = 'right';
    ctx.fillStyle = C.grey;
    ctx.font = `500 23px ${sans}`;
    const meta = greyed ? tr('poster.logEmpty') : fill(tr('poster.logCount'), { n: seen.length, m: logTotal, k: rarePlus });
    ctx.fillText(ellipsis(ctx, meta, bw - headW), W - M, logHead);
    ctx.textAlign = 'left';
    const cellW = (bw - 40) / 2;
    logRows.forEach((sp, i) => {
      const x = M + (i % 2) * (cellW + 40);
      // fewer rows sit in the middle of the log's space
      const ry = rowsTop + ((LOG_ROWS - Math.ceil(logRows.length / 2)) * ROW_H) / 2 + Math.floor(i / 2) * ROW_H;
      const im = imgs[i];
      ctx.globalAlpha = greyed ? 0.3 : 1;
      if (im) {
        const k = Math.min(60 / im.naturalWidth, 60 / im.naturalHeight);
        ctx.drawImage(im, x + 30 - (im.naturalWidth * k) / 2, ry + 37 - (im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      } else {
        ctx.strokeStyle = C.dim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 30, ry + 37, 20, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const r = rarityOf(sp);
      const textW = cellW - 76 - (r ? r * 18 + 10 : 0);
      ctx.fillStyle = greyed ? C.dim : C.white;
      ctx.font = `600 26px ${sans}`;
      ctx.fillText(ellipsis(ctx, sp.name[lang], textW), x + 76, ry + 32);
      if (sp.sci) {
        ctx.fillStyle = greyed ? C.dim : C.grey;
        ctx.font = `italic 400 21px ${serif}`;
        ctx.fillText(ellipsis(ctx, sp.sci, cellW - 76), x + 76, ry + 62);
      }
      ctx.fillStyle = greyed ? C.dim : C.gold;
      diamonds(ctx, r, x + cellW, ry + 23);
    });
  } else {
    // nothing marked, nothing sighted: the invitation takes the log's place
    ctx.textAlign = 'center';
    ctx.fillStyle = C.white;
    fitFont(ctx, tr('poster.invite'), (px) => `600 ${px}px ${serif}`, 44, bw);
    ctx.fillText(tr('poster.invite'), W / 2, rowsTop + 70);
    ctx.fillStyle = C.grey;
    ctx.font = `500 26px ${sans}`;
    ctx.fillText(ellipsis(ctx, tr('app.tagline'), bw), W / 2, rowsTop + 128);
    ctx.textAlign = 'left';
  }

  // ---- footer: the question, the brand, the QR (ECC M, integer scale, white quiet zone) ----
  rule(footRule);
  const textW = qx - M - 40;
  ctx.fillStyle = C.white;
  fitFont(ctx, tr('poster.ask'), (px) => `700 ${px}px ${serif}`, 60, textW);
  ctx.fillText(tr('poster.ask'), M, qy + 72);
  ctx.fillStyle = C.grey;
  ctx.font = `500 27px ${sans}`;
  ctx.fillText(ellipsis(ctx, tr('poster.scan'), textW), M, qy + 126);
  ctx.fillStyle = C.gold;
  ctx.fillRect(M, qy + 168, 40, 3);
  ctx.font = `600 25px ${sans}`;
  ctx.fillText(ellipsis(ctx, `${tr('app.title')} · ${tr('app.subtitle')}`, textW), M, qy + qs - 52);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep the raw url */
  }
  ctx.fillStyle = C.grey;
  ctx.font = `500 23px ${sans}`;
  ctx.fillText(ellipsis(ctx, host, textW), M, qy + qs - 14);
  ctx.save();
  rr(ctx, qx, qy, qs, qs, 16);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qc, qx, qy, qs, qs);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.9);
}
