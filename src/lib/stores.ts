import { writable, derived, get } from 'svelte/store';
import { siteById, speciesById, footprintIndex } from './data';
import type { Lang } from './types';

/**
 * Global UI state + URL synchronisation.
 *
 * URL contract (shareable): ?lang=zh|en&m=1..12&site=<id>&sp=<speciesId>&view=globe
 * Priority on load: URL > localStorage (lang, view) > browser language.
 */

const LANG_KEY = 'dive-atlas:lang';

function initialLang(): Lang {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl === 'zh' || fromUrl === 'en') return fromUrl;
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    /* private mode etc. */
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function initialMonth(): number {
  const m = Number(new URLSearchParams(location.search).get('m'));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : 0;
}

function initialParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}

export const lang = writable<Lang>(initialLang());
/** 0 = all year, 1–12 = month. */
export const month = writable<number>(initialMonth());
const initialSite = initialParam('site');
export const selectedSiteId = writable<string | null>(
  initialSite && siteById.has(initialSite) ? initialSite : null,
);
const initialSpecies = initialParam('sp');
export const speciesFilter = writable<string | null>(
  initialSpecies && speciesById.has(initialSpecies) ? initialSpecies : null,
);

export function toggleLang(): void {
  lang.update((l) => (l === 'zh' ? 'en' : 'zh'));
}

// ---- day / night theme (SPEC §5): CSS tokens only, not part of the URL ----

export type Theme = 'day' | 'night';
const THEME_KEY = 'dive-atlas:theme';
const THEME_COLOR: Record<Theme, string> = { day: '#19858f', night: '#0e2a47' };

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'day' || stored === 'night') return stored;
  } catch {
    /* ignore */
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

export const theme = writable<Theme>(initialTheme());

/** Explicit choice wins over the system preference from then on. */
export function toggleTheme(): void {
  theme.update((th) => {
    const next: Theme = th === 'day' ? 'night' : 'day';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    return next;
  });
}

theme.subscribe((th) => {
  const root = document.documentElement;
  if (th === 'night') root.dataset.theme = 'night';
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[th]);
});

// ---- flat atlas / globe (SPEC §3.4): `view=globe` in the URL, else the last explicit toggle ----

export type MapView = 'atlas' | 'globe';
const VIEW_KEY = 'dive-atlas:view';

function initialMapView(): MapView {
  if (initialParam('view') === 'globe') return 'globe';
  try {
    if (localStorage.getItem(VIEW_KEY) === 'globe') return 'globe';
  } catch {
    /* ignore */
  }
  return 'atlas';
}

export const mapView = writable<MapView>(initialMapView());

/** Only the toolbar toggle is remembered; arriving through a link is not. */
export function toggleMapView(): void {
  mapView.update((v) => {
    const next: MapView = v === 'globe' ? 'atlas' : 'globe';
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
    return next;
  });
}

// ---- side effects: persist lang, mirror state into the URL ----

lang.subscribe((l) => {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
});

/** Ask the map to fly to a site (search result, deep link). MapView consumes and clears it. */
export const flyTo = writable<string | null>(null);
export function openSite(id: string): void {
  selectedSiteId.set(id);
  flyTo.set(id);
}

// ---- footprint: 潜过 / 想去 per site (SPEC §3.4, §6.1 #10–12) ----

export type Mark = 'dived' | 'wish';
export interface Footprint {
  v: 1;
  dived: string[];
  wish: string[];
}
const FP_KEY = 'dive-atlas:footprint';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** ids → base64url bitmask over data/footprint-index.json, 6 bits per char, MSB first, trailing 'A's trimmed. */
export function encodeMask(ids: string[]): string {
  const set = new Set(ids);
  let out = '';
  for (let i = 0; i < footprintIndex.length; i += 6) {
    let v = 0;
    for (let j = 0; j < 6; j++) {
      const id = footprintIndex[i + j];
      v = (v << 1) | (id && set.has(id) ? 1 : 0);
    }
    out += B64URL[v];
  }
  return out.replace(/A+$/, '');
}

export function decodeMask(mask: string): string[] {
  const ids: string[] = [];
  for (let c = 0; c < mask.length; c++) {
    const v = B64URL.indexOf(mask[c]!);
    if (v < 0) continue;
    for (let j = 0; j < 6; j++) {
      if ((v >> (5 - j)) & 1) {
        const id = footprintIndex[c * 6 + j];
        if (id && siteById.has(id)) ids.push(id);
      }
    }
  }
  return ids;
}

function loadFootprint(): Footprint {
  try {
    const raw = localStorage.getItem(FP_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Footprint>;
      if (p && p.v === 1 && Array.isArray(p.dived) && Array.isArray(p.wish)) {
        // drop ids of sites that have since left sites.json (the index keeps their tombstone)
        const ok = (x: unknown): x is string => typeof x === 'string' && siteById.has(x);
        return { v: 1, dived: p.dived.filter(ok), wish: p.wish.filter(ok) };
      }
    }
  } catch {
    /* ignore */
  }
  return { v: 1, dived: [], wish: [] };
}

export const footprint = writable<Footprint>(loadFootprint());
footprint.subscribe((fp) => {
  try {
    localStorage.setItem(FP_KEY, JSON.stringify(fp));
  } catch {
    /* ignore */
  }
});

export function markOf(fp: Footprint, id: string): Mark | null {
  return fp.dived.includes(id) ? 'dived' : fp.wish.includes(id) ? 'wish' : null;
}

/** A site is in at most one list; null clears it. */
export function setMark(id: string, mark: Mark | null): void {
  footprint.update((fp) => {
    const dived = fp.dived.filter((x) => x !== id);
    const wish = fp.wish.filter((x) => x !== id);
    if (mark === 'dived') dived.push(id);
    else if (mark === 'wish') wish.push(id);
    return { v: 1, dived, wish };
  });
}

/**
 * A friend's footprint opened from a link / QR (?d=&w=). Read-only and never written to
 * localStorage unless the viewer explicitly adopts it. The raw masks are re-emitted into
 * the URL while viewing so the link survives month / site changes.
 */
const rawD = initialParam('d');
const rawW = initialParam('w');
export const viewing = writable<Footprint | null>(
  rawD || rawW ? { v: 1, dived: decodeMask(rawD ?? ''), wish: decodeMask(rawW ?? '') } : null,
);

export function adoptViewing(): void {
  const v = get(viewing);
  if (!v) return;
  footprint.set({ v: 1, dived: [...v.dived], wish: [...v.wish] });
  viewing.set(null);
}

/** The link that goes into the share image / QR: language + footprint only. */
export function footprintShareUrl(fp: Footprint, l: Lang = get(lang)): string {
  const params = new URLSearchParams();
  params.set('lang', l);
  const d = encodeMask(fp.dived);
  const w = encodeMask(fp.wish);
  if (d) params.set('d', d);
  if (w) params.set('w', w);
  return `${location.origin}${import.meta.env.BASE_URL}?${params.toString()}`;
}

// ---- URL sync ----

/** One subscription for all URL-bearing state: builds the query once per change, never pushes history. */
derived([lang, month, selectedSiteId, speciesFilter, viewing, mapView], ([$lang, $month, $site, $sp, $view, $mapView]) => {
  const params = new URLSearchParams();
  params.set('lang', $lang);
  if ($month) params.set('m', String($month));
  if ($site) params.set('site', $site);
  if ($sp) params.set('sp', $sp);
  if ($mapView === 'globe') params.set('view', 'globe');
  if ($view) {
    if (rawD) params.set('d', rawD);
    if (rawW) params.set('w', rawW);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}).subscribe((search) => {
  if (search === location.search) return;
  try {
    history.replaceState(null, '', `${location.pathname}${search}${location.hash}`);
  } catch {
    /* Safari throttles replaceState (100 per 30 s); the next change catches up */
  }
});

/** Link for the current view (site / month / language) — never carries anyone's footprint. */
export function shareUrl(): string {
  const params = new URLSearchParams(location.search);
  params.delete('d');
  params.delete('w');
  const qs = params.toString();
  return `${location.origin}${location.pathname}${qs ? '?' + qs : ''}`;
}
