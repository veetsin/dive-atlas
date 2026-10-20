import { geoNaturalEarth1, geoNaturalEarth1Raw, geoPath, geoTransform } from 'd3-geo';
import type { GeoPath, GeoProjection } from 'd3-geo';

/**
 * Map projection for the atlas.
 *
 * - Natural Earth I, rotated so the central meridian is 150°E (Pacific-centred:
 *   Asia in the middle, the Americas on the right, Europe/Africa on the left).
 * - Latitude is clamped to LAT_RANGE so Antarctica is cropped out.
 * - With the cut at 30°W, Greenland would be split in two. Features listed in
 *   UNWRAP_LIST are drawn through `unwrappedPath`, which bypasses d3's
 *   antimeridian clipping and lets them spill a few degrees past the right edge.
 *   The ocean background is a full-bleed rectangle, so the overflow is invisible.
 */

export const CENTRAL_MERIDIAN = 150;
export const LAT_RANGE: [number, number] = [-60, 85];
/** ADM0_A3 codes drawn with the unwrapped projection. */
export const UNWRAP_LIST: ReadonlySet<string> = new Set(['GRL']);

const RAD = Math.PI / 180;

/** Longitudes (relative to the central meridian) below this are wrapped to the right. */
const WRAP_THRESHOLD = -150;

export interface MapProjection {
  projection: GeoProjection;
  path: GeoPath;
  unwrappedPath: GeoPath;
  width: number;
  height: number;
}

/**
 * Scale and translate `projection` so that longitudes ±180° fit the width and
 * latitudes LAT_RANGE fit the height, whichever is tighter. Works on the raw
 * projection, so it does not depend on d3's sphere clipping.
 */
export function fitWorld(
  projection: GeoProjection,
  width: number,
  height: number,
  padding = 8,
): void {
  const [latMin, latMax] = LAT_RANGE;
  const xMax = geoNaturalEarth1Raw(Math.PI, 0)[0];
  const yTop = geoNaturalEarth1Raw(0, latMax * RAD)[1];
  const yBottom = geoNaturalEarth1Raw(0, latMin * RAD)[1];

  const kx = (width - padding * 2) / (xMax * 2);
  const ky = (height - padding * 2) / (yTop - yBottom);
  const k = Math.min(kx, ky);
  const yMid = (yTop + yBottom) / 2;

  projection.scale(k).translate([width / 2, height / 2 + k * yMid]);
}

export function createMapProjection(width: number, height: number, padding = 8): MapProjection {
  const projection = geoNaturalEarth1().rotate([-CENTRAL_MERIDIAN, 0]);
  fitWorld(projection, width, height, padding);

  const k = projection.scale();
  const [tx, ty] = projection.translate();

  // Manual projection for "unwrapped" features: rotate by hand, keep the
  // longitude continuous across the cut, then apply the raw projection and the
  // same scale/translate d3 uses internally.
  const unwrapped = geoTransform({
    point(lon: number, lat: number) {
      let l = lon - CENTRAL_MERIDIAN;
      if (l < WRAP_THRESHOLD) l += 360;
      const [x, y] = geoNaturalEarth1Raw(l * RAD, lat * RAD);
      this.stream.point(tx + k * x, ty - k * y);
    },
  });

  return {
    projection,
    path: geoPath(projection),
    unwrappedPath: geoPath(unwrapped),
    width,
    height,
  };
}

/** Project a [lon, lat] pair to screen coordinates (null if not projectable). */
export function project(p: MapProjection, lonLat: [number, number]): [number, number] | null {
  return p.projection(lonLat);
}
