import { geoArea } from 'd3-geo';
import { merge } from 'topojson-client';
import type {
  Topology,
  GeometryCollection,
  Polygon as TopoPolygon,
  MultiPolygon as TopoMultiPolygon,
} from 'topojson-specification';
import type { MultiPolygon, Polygon } from 'geojson';
import { UNWRAP_LIST } from './projection';

/**
 * The base-map geometry, loaded once and shared by the live map and the share-image
 * renderer. Countries are dissolved into one coastline (SPEC §4.5); Greenland stays
 * separate because it is drawn through the unwrapped projection (§4.4).
 */
export interface Coast {
  /** Every country except the unwrapped ones, merged. */
  land: MultiPolygon;
  /** `land` with every 3rd vertex of rings ≥ 16 points: drawn while the globe turns (SPEC §9). */
  landLo: MultiPolygon;
  /** Only polygons ≥ ~4 000 km²: the wide shelf bands skip specks so atolls do not become targets. */
  big: MultiPolygon;
  greenland: MultiPolygon | null;
}

type Props = { ADM0_A3: string };
type Country = (TopoPolygon<Props> | TopoMultiPolygon<Props>) & { properties: Props };
const SMALL_SR = 1e-4;

const pending = new Map<boolean, Promise<Coast>>();

/**
 * `detail`: the 15 % build (`npm run geo -- --detail`, ~140 KB gzip) for deep zoom; the map fetches it
 * lazily, never on the first load. Each file is fetched once; a failed fetch is retried on the next call.
 */
export function loadCoast(detail = false): Promise<Coast> {
  let p = pending.get(detail);
  if (!p) {
    p = fetchCoast(detail ? 'countries-detail' : 'countries').catch((e) => {
      pending.delete(detail);
      throw e;
    });
    pending.set(detail, p);
  }
  return p;
}

async function fetchCoast(file: string): Promise<Coast> {
  const res = await fetch(`${import.meta.env.BASE_URL}geo/${file}.topo.json`);
  if (!res.ok) throw new Error(String(res.status));
  const topo = (await res.json()) as Topology;
  const key = Object.keys(topo.objects)[0];
  if (!key) throw new Error('empty topology');
  const obj = topo.objects[key] as GeometryCollection<Props>;
  const countries = obj.geometries.filter(
    (g): g is Country => (g.type === 'Polygon' || g.type === 'MultiPolygon') && !!g.properties,
  );
  const main = countries.filter((g) => !UNWRAP_LIST.has(g.properties.ADM0_A3));
  const unwrapped = countries.filter((g) => UNWRAP_LIST.has(g.properties.ADM0_A3));
  const land = merge(topo, main) as MultiPolygon;
  const big: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: land.coordinates.filter((c) => {
      const a = geoArea({ type: 'Polygon', coordinates: c } as Polygon);
      return Math.min(a, 4 * Math.PI - a) >= SMALL_SR;
    }),
  };
  const landLo: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: land.coordinates.map((poly) => {
      const lo = poly.map((ring) => (ring.length < 16 ? ring : ring.filter((_, i) => i % 3 === 0 || i === ring.length - 1)));
      // thinning can flip a ring's winding, and d3 would then fill the rest of the sphere
      return geoArea({ type: 'Polygon', coordinates: lo }) >= 2 * Math.PI ? poly : lo;
    }),
  };
  return { land, landLo, big, greenland: unwrapped.length ? (merge(topo, unwrapped) as MultiPolygon) : null };
}
