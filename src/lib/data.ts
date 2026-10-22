import sitesJson from '../../data/sites.json';
import speciesJson from '../../data/species.json';
import regionsJson from '../../data/regions.json';
import labelsJson from '../../data/labels.json';
import spriteManifest from '../../public/sprites/manifest.json';
import type { DiveSite, Species, Region, SeaLabel, SizeClass } from './types';

/**
 * Single entry point for all content data. Components import from here,
 * never from the JSON files directly, so swapping to lazy-loaded chunks
 * later is a one-file change.
 */
// JSON imports are inferred structurally (tuples become number[]), so cast via
// unknown. `npm run data:validate` is what actually guarantees the shape.
export const sites: DiveSite[] = sitesJson as unknown as DiveSite[];
/** `blurb` is stripped from this copy by the vite plugin; it comes from `loadSiteDetails()`. */
export const species: Omit<Species, 'blurb'>[] = speciesJson as unknown as Species[];
export const regions: Region[] = regionsJson as unknown as Region[];
export const labels: SeaLabel[] = labelsJson as unknown as SeaLabel[];

export const speciesById = new Map(species.map((s) => [s.id, s]));
export const regionById = new Map(regions.map((r) => [r.id, r]));
export const siteById = new Map(sites.map((s) => [s.id, s]));

type Details = typeof import('virtual:site-details').default;
let detailsPromise: Promise<Details> | null = null;
/** Site summary / highlights / sources and species blurbs, fetched as one chunk the first time a card opens. */
export function loadSiteDetails(): Promise<Details> {
  detailsPromise ??= import('virtual:site-details').then((m) => m.default);
  return detailsPromise;
}

/** True when the site is in season for the given month (0 = any). */
export function inSeason(site: DiveSite, m: number): boolean {
  if (m === 0 || site.bestMonths.length === 0) return true;
  return site.bestMonths.includes(m);
}

/** Sprites that `npm run sprites` has actually produced (public/sprites/manifest.json). */
const spritesReady = new Set(Object.keys(spriteManifest as Record<string, unknown>));

/** URL of a processed sprite, or undefined while it has not been drawn yet (no 404 storm). */
export function spriteUrl(spriteId: string, size: 192 | 512): string | undefined {
  return spritesReady.has(spriteId) ? `${import.meta.env.BASE_URL}sprites/${spriteId}-${size}.webp` : undefined;
}

/** On-map sprite size in CSS px by body-size class (fallback when a species has no lengthM). */
export const SPRITE_PX: Record<SizeClass, number> = { xl: 48, l: 40, m: 32, s: 24 };

/**
 * Sprite size from real-world size, on a log scale so a 25 m whale and a 2 cm seahorse both
 * stay legible: 2 cm → 22 px, 1 m → ~45 px, 10 m → ~58 px, 25 m → 64 px.
 */
export function spritePx(sp: Omit<Species, 'blurb'>): number {
  if (!sp.lengthM || sp.lengthM <= 0) return SPRITE_PX[sp.sizeClass];
  const px = 22 + 13.5 * Math.log10(sp.lengthM / 0.02);
  return Math.round(Math.min(64, Math.max(22, px)));
}

/** Plain-text search over zh / en names, pinyin and country; returns at most `limit` sites. */
export function searchSites(query: string, limit = 8): DiveSite[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (s: DiveSite) =>
    s.name.zh.toLowerCase().includes(q) ||
    s.name.en.toLowerCase().includes(q) ||
    (s.pinyin ?? '').includes(q) ||
    s.country.zh.includes(q) ||
    s.country.en.toLowerCase().includes(q);
  return sites.filter(hit).slice(0, limit);
}
