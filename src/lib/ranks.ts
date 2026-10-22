import { geoDistance } from 'd3-geo';
import { regionById } from './data';
import { RANK_KEYS, translate } from './i18n';
import type { DiveSite, Lang } from './types';

/**
 * Title ladder for the footprint panel and the share poster (SPEC §6.1 #11).
 * score = sites + 3·countries + 2·regions + km span / 800; LEVELS[i] is the lowest score of level i.
 * Calibration: 1 site → 1; 5 sites / 3 countries / 2,400 km → 5; 30 / 8 / 15,000 km → 12;
 * the top also needs ≥ 60 sites spanning ≥ 15,000 km, so a long log in one ocean stops at 14.
 */
const LEVELS = [0, 1, 8, 12, 16, 19, 23, 28, 34, 41, 50, 62, 78, 98, 125, 160];
export const TOP_LEVEL = LEVELS.length - 1; // = RANK_KEYS.length - 1
const EARTH_KM = 6371;

export interface FootprintStats {
  sites: number;
  countries: number;
  /** Distinct species listed at the dived sites. */
  species: number;
  /** Largest great-circle distance between two dived sites, km. */
  km: number;
  regions: number;
  /** Region holding ≥ 60 % of the dived sites, if any. */
  region: string | null;
  level: number;
}

export function footprintStats(dived: DiveSite[]): FootprintStats {
  const countries = new Set(dived.map((s) => s.country.en)).size;
  const species = new Set(dived.flatMap((s) => s.species)).size;
  const byRegion = new Map<string, number>();
  for (const s of dived) byRegion.set(s.region, (byRegion.get(s.region) ?? 0) + 1);
  let rad = 0;
  for (let i = 0; i < dived.length; i++)
    for (let j = i + 1; j < dived.length; j++) rad = Math.max(rad, geoDistance(dived[i]!.coords, dived[j]!.coords));
  const km = Math.round(rad * EARTH_KM);
  const regions = byRegion.size;
  const score = dived.length ? dived.length + 3 * countries + 2 * regions + km / 800 : 0;
  let level = 0;
  while (level < TOP_LEVEL && score >= LEVELS[level + 1]!) level++;
  if (level === TOP_LEVEL && (dived.length < 60 || km < 15000)) level--;
  const [top, n] = [...byRegion].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return { sites: dived.length, countries, species, km, regions, region: n >= 0.6 * dived.length ? top : null, level };
}

/**
 * Two-line title: prefix = the dominant region's name, else 跨洋 for 2–3 regions, else 环球;
 * nothing dived → no prefix. noun = the rank name.
 */
export function rankTitle(st: FootprintStats, lang: Lang): { prefix: string; noun: string } {
  const prefix = !st.sites
    ? ''
    : st.region
      ? (regionById.get(st.region)?.name[lang] ?? '')
      : translate(st.regions <= 3 ? 'rank.scopeOcean' : 'rank.scopeGlobal', lang);
  return { prefix, noun: translate(RANK_KEYS[st.level] ?? 'rank.0', lang) };
}
