import { writable, derived } from 'svelte/store';
import { siteById } from './data';
import type { Lang } from './types';

/**
 * Global UI state + URL synchronisation.
 *
 * URL contract (shareable): ?lang=zh|en&m=1..12&site=<id>&sp=<speciesId>
 * Priority on load: URL > localStorage (lang only) > browser language.
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
export const speciesFilter = writable<string | null>(initialParam('sp'));

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

// ---- side effects: persist lang, mirror state into the URL ----

lang.subscribe((l) => {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
});

/** One subscription for all URL-bearing state: builds the query once per change, never pushes history. */
derived([lang, month, selectedSiteId, speciesFilter], ([$lang, $month, $site, $sp]) => {
  const params = new URLSearchParams();
  params.set('lang', $lang);
  if ($month) params.set('m', String($month));
  if ($site) params.set('site', $site);
  if ($sp) params.set('sp', $sp);
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

export function shareUrl(): string {
  return location.href;
}
