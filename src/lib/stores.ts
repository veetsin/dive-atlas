import { writable, readable, derived } from 'svelte/store';
import { siteById, speciesById } from './data';
import type { Lang } from './types';

/**
 * Global UI state + URL synchronisation.
 *
 * URL contract (shareable): ?lang=zh|en&m=1..12&site=<id>&sp=<speciesId>&view=globe (anything else is dropped)
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

// ---- theme (SPEC §5): night parked 2026-10-22, the app runs day-only; a stored 'night' is ignored ----

export type Theme = 'day' | 'night';
export const theme = readable<Theme>('day');

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

// ---- footprint: 潜过 / 想去 per site (SPEC §3.4, §6.1 #10–11), local only ----

export type Mark = 'dived' | 'wish';
export interface Footprint {
  v: 1;
  dived: string[];
  wish: string[];
}
const FP_KEY = 'dive-atlas:footprint';
function loadFootprint(): Footprint {
  try {
    const raw = localStorage.getItem(FP_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Footprint>;
      if (p && p.v === 1 && Array.isArray(p.dived) && Array.isArray(p.wish)) {
        // drop ids of sites that have since left sites.json
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

/** The link behind the share image's QR and "copy link": the plain site in the viewer's language. */
export function siteUrl(l: Lang): string {
  return `${location.origin}${import.meta.env.BASE_URL}?lang=${l}`;
}

// ---- URL sync ----

/** One subscription for all URL-bearing state: builds the query once per change, never pushes history. */
derived([lang, month, selectedSiteId, speciesFilter, mapView], ([$lang, $month, $site, $sp, $mapView]) => {
  const params = new URLSearchParams();
  params.set('lang', $lang);
  if ($month) params.set('m', String($month));
  if ($site) params.set('site', $site);
  if ($sp) params.set('sp', $sp);
  if ($mapView === 'globe') params.set('view', 'globe');
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

/** Link for the current view (site / month / language); the URL sync above has already dropped unknown params such as old `d` / `w`. */
export function shareUrl(): string {
  return `${location.origin}${location.pathname}${location.search}`;
}
