import sitesJson from '../../data/sites.json';
import speciesJson from '../../data/species.json';
import regionsJson from '../../data/regions.json';
import labelsJson from '../../data/labels.json';
import type { DiveSite, Species, Region, SeaLabel } from './types';

/**
 * Single entry point for all content data. Components import from here,
 * never from the JSON files directly, so swapping to lazy-loaded chunks
 * later is a one-file change.
 */
// JSON imports are inferred structurally (tuples become number[]), so cast via
// unknown. `npm run data:validate` is what actually guarantees the shape.
export const sites: DiveSite[] = sitesJson as unknown as DiveSite[];
export const species: Species[] = speciesJson as unknown as Species[];
export const regions: Region[] = regionsJson as unknown as Region[];
export const labels: SeaLabel[] = labelsJson as unknown as SeaLabel[];

export const speciesById = new Map(species.map((s) => [s.id, s]));
export const regionById = new Map(regions.map((r) => [r.id, r]));
export const siteById = new Map(sites.map((s) => [s.id, s]));

/** True when the site is in season for the given month (0 = any). */
export function inSeason(site: DiveSite, m: number): boolean {
  if (m === 0 || site.bestMonths.length === 0) return true;
  return site.bestMonths.includes(m);
}

export function spriteUrl(spriteId: string, size: 192 | 512): string {
  return `${import.meta.env.BASE_URL}sprites/${spriteId}-${size}.webp`;
}
