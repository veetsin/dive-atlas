import { generate, correction } from 'lean-qr';
import { createMapProjection } from './projection';
import { loadCoast } from './geo';
import { sites } from './data';
import type { Footprint } from './stores';
import type { Lang } from './types';

/**
 * 1080×1920 share image (SPEC §6.1 #11), drawn straight to Canvas2D with the same
 * projection and coastline as the live map, so nothing is serialised from the SVG.
 * The canvas is fixed-size on purpose: multiplying by devicePixelRatio would blow
 * WebKit's canvas area cap on iOS. Returns a JPEG data URL (WeChat 长按保存 needs <img src=data:>).
 */
export interface ShareText {
  title: string;
  dived: string;
  wish: string;
  scan: string;
  brand: string;
}

const W = 1080;
const H = 1920;
const MARGIN = 80;
const BAND_Y = 230;
const BAND_H = 500;
const QR_PX = 8; // image px per module: survives 朋友圈 / 小红书 re-encoding

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export async function renderShareImage(fp: Footprint, lang: Lang, text: ShareText, url: string): Promise<string> {
  const coast = await loadCoast();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const c = {
    deep: cssVar('--ocean-deep'),
    mid: cssVar('--ocean-mid'),
    ocean: cssVar('--ocean'),
    shelf: cssVar('--ring-mid'),
    land: cssVar('--land-hi'),
    landEdge: cssVar('--land-edge'),
    coral: cssVar('--coral'),
    sun: cssVar('--sun'),
    paper: cssVar('--paper'),
    line: cssVar('--map-line'),
  };
  const sans = cssVar('--font-sans') || 'sans-serif';
  const font = (weight: number, px: number) => `${weight} ${px}px ${sans}`;

  // ---- background + title ----
  ctx.fillStyle = c.deep;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.line;
  ctx.font = font(700, 60);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text.title, MARGIN, 160);

  // ---- map band ----
  const proj = createMapProjection(W, BAND_H, 0);
  ctx.save();
  ctx.translate(0, BAND_Y);
  ctx.beginPath();
  ctx.rect(0, 0, W, BAND_H);
  ctx.clip();
  const eqY = (proj.projection([150, 0])?.[1] ?? BAND_H / 2) / BAND_H;
  const sea = ctx.createLinearGradient(0, 0, 0, BAND_H);
  sea.addColorStop(0, c.deep);
  sea.addColorStop(eqY * 0.45, c.mid);
  sea.addColorStop(eqY, c.ocean);
  sea.addColorStop(eqY + (1 - eqY) * 0.55, c.mid);
  sea.addColorStop(1, c.deep);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, W, BAND_H);

  const path = proj.path.context(ctx);
  const upath = proj.unwrappedPath.context(ctx);
  const trace = (geom: Parameters<typeof path>[0], withGreenland = true) => {
    ctx.beginPath();
    path(geom);
    if (withGreenland && coast.greenland) upath(coast.greenland);
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = c.shelf;
  for (const [w, alpha, geom] of [
    [22, 0.06, coast.big],
    [12, 0.12, coast.big],
    [6, 0.22, coast.land],
    [2.5, 0.36, coast.land],
  ] as const) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    trace(geom);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.land;
  trace(coast.land);
  ctx.fill();
  if (c.landEdge && c.landEdge !== 'transparent') {
    ctx.strokeStyle = c.landEdge;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // markers: dived = coral disc with paper ring, wish = sun ring, the rest faint dots
  const dot = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  };
  for (const site of sites) {
    const p = proj.projection(site.coords);
    if (!p) continue;
    const [x, y] = p;
    if (fp.dived.includes(site.id)) {
      ctx.fillStyle = c.paper;
      dot(x, y, 10);
      ctx.fill();
      ctx.fillStyle = c.coral;
      dot(x, y, 7);
      ctx.fill();
    } else if (fp.wish.includes(site.id)) {
      ctx.strokeStyle = c.sun;
      ctx.lineWidth = 3.5;
      dot(x, y, 7.5);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = c.paper;
      dot(x, y, 3.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // ---- counts ----
  const statsY = 860;
  const stat = (x: number, n: number, label: string, color: string) => {
    ctx.fillStyle = color;
    ctx.font = font(700, 96);
    ctx.fillText(String(n), x, statsY);
    const w = ctx.measureText(String(n)).width;
    ctx.fillStyle = c.line;
    ctx.font = font(500, 30);
    ctx.fillText(label, x + w + 18, statsY - 6);
  };
  stat(MARGIN, fp.dived.length, text.dived, c.coral);
  stat(W / 2 + 40, fp.wish.length, text.wish, c.sun);

  // ---- names (dived first, then wish), wrapped in the left column ----
  const nameOf = (id: string) => sites.find((s) => s.id === id)?.name[lang];
  const colW = W - MARGIN * 2 - 400; // leave room for the QR block on the right
  let y = 960;
  const list = (ids: string[], color: string) => {
    const names = ids.map(nameOf).filter((n): n is string => !!n);
    if (!names.length) return;
    ctx.font = font(500, 30);
    ctx.fillStyle = color;
    let line = '';
    let lines = 0;
    for (const n of names) {
      const next = line ? `${line} · ${n}` : n;
      if (ctx.measureText(next).width > colW && line) {
        ctx.fillText(line, MARGIN, y);
        y += 46;
        line = n;
        if (++lines >= 7) {
          line = '…';
          break;
        }
      } else line = next;
    }
    if (line) {
      ctx.fillText(line, MARGIN, y);
      y += 46;
    }
    y += 20;
  };
  list(fp.dived, c.paper);
  ctx.globalAlpha = 0.75;
  list(fp.wish, c.sun);
  ctx.globalAlpha = 1;

  // ---- QR (ECC M, integer scale, white quiet zone) ----
  const code = generate(url, { minCorrectionLevel: correction.M });
  const qc = document.createElement('canvas');
  code.toCanvas(qc, { on: [19, 41, 61, 255], off: [255, 255, 255, 255], pad: 4 });
  const qs = qc.width * QR_PX;
  const qx = W - MARGIN - qs;
  const qy = 1300;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qc, qx, qy, qs, qs);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = c.line;
  ctx.font = font(500, 26);
  ctx.textAlign = 'center';
  ctx.fillText(text.scan, qx + qs / 2, qy + qs + 44);
  ctx.textAlign = 'left';

  // ---- brand line ----
  ctx.fillStyle = c.line;
  ctx.font = font(600, 32);
  ctx.fillText(text.brand, MARGIN, H - 110);
  ctx.globalAlpha = 0.7;
  ctx.font = font(400, 24);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep the raw url */
  }
  ctx.fillText(host, MARGIN, H - 70);
  ctx.globalAlpha = 1;

  return canvas.toDataURL('image/jpeg', 0.92);
}
