import { writable, readable, derived } from 'svelte/store';
import { siteById, speciesById } from './data';
import type { Lang } from './types';

/**
 * Global UI state + URL synchronisation.
 *
 * URL contract (shareable): ?lang=zh|en&m=1..12&site=<id>&sp=<speciesId>&view=atlas (anything else is dropped;
 * the globe is the default view and writes nothing, an incoming view=globe is still honoured)
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

// ---- flat atlas / globe (SPEC §3.4): URL `view`, else the last explicit toggle, else the globe ----

export type MapView = 'atlas' | 'globe';
const VIEW_KEY = 'dive-atlas:view';

/** Globe by default (2026-10-22, owner: "默认用地球模式，不然没人会切换"). */
function initialMapView(): MapView {
  const fromUrl = initialParam('view');
  if (fromUrl === 'atlas' || fromUrl === 'globe') return fromUrl;
  try {
    if (localStorage.getItem(VIEW_KEY) === 'atlas') return 'atlas';
  } catch {
    /* ignore */
  }
  return 'globe';
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

// ---- footprint: 潜过 / 想去 per site, 目击 per species (SPEC §3.4, §6.1 #10–11), local only ----

export type Mark = 'dived' | 'wish';
export interface Footprint {
  v: 1;
  dived: string[];
  wish: string[];
  /** Species ids the diver has sighted (目击过); added 2026-10-22, missing in older storage → []. */
  seen: string[];
}
const FP_KEY = 'dive-atlas:footprint';
function loadFootprint(): Footprint {
  try {
    const raw = localStorage.getItem(FP_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Footprint>;
      if (p && p.v === 1 && Array.isArray(p.dived) && Array.isArray(p.wish)) {
        // drop ids of sites / species that have since left the data
        const ok = (x: unknown): x is string => typeof x === 'string' && siteById.has(x);
        const okSp = (x: unknown): x is string => typeof x === 'string' && speciesById.has(x);
        return { v: 1, dived: p.dived.filter(ok), wish: p.wish.filter(ok), seen: Array.isArray(p.seen) ? p.seen.filter(okSp) : [] };
      }
    }
  } catch {
    /* ignore */
  }
  return { v: 1, dived: [], wish: [], seen: [] };
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
    return { ...fp, dived, wish };
  });
}

/**
 * Sightings (目击过), for the species panel's toggle: `isSeen($footprint, sp.id)` is reactive in a
 * component, `toggleSeen(sp.id)` flips it. Independent of the site marks; feeds the poster's 标本录.
 */
export function isSeen(fp: Footprint, speciesId: string): boolean {
  return fp.seen.includes(speciesId);
}
export function toggleSeen(speciesId: string): void {
  footprint.update((fp) => ({
    ...fp,
    seen: fp.seen.includes(speciesId) ? fp.seen.filter((x) => x !== speciesId) : [...fp.seen, speciesId],
  }));
}

// ---- name on the share poster: trimmed, at most 12 characters, local only ----

const NAME_KEY = 'dive-atlas:name';
export const NAME_MAX = 12;
/** Trim and cut to NAME_MAX characters (code points, so an emoji is never split). */
const cleanName = (s: string) => [...s.trim()].slice(0, NAME_MAX).join('').trim();
function loadName(): string {
  try {
    return cleanName(localStorage.getItem(NAME_KEY) ?? '');
  } catch {
    return '';
  }
}
/** '' = no name yet. Set it through setDisplayName so it is always clean. */
export const displayName = writable<string>(loadName());
export function setDisplayName(s: string): void {
  displayName.set(cleanName(s));
}
displayName.subscribe((n) => {
  try {
    if (n) localStorage.setItem(NAME_KEY, n);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
});

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
  if ($mapView === 'atlas') params.set('view', 'atlas');
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
