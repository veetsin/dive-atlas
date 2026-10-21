<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { select } from 'd3-selection';
  import { zoom as d3zoom, zoomIdentity, type ZoomTransform, type ZoomBehavior, type D3ZoomEvent } from 'd3-zoom';
  import { geoCircle, geoDistance, geoGraticule, geoInterpolate } from 'd3-geo';
  import type { MultiPolygon, MultiLineString, Position } from 'geojson';

  import { createMapProjection, createGlobeProjection, globeRadius, LAT_RANGE, type MapProjection } from '../lib/projection';
  import { loadCoast } from '../lib/geo';
  import { sites, siteById, labels, regionById, inSeason, speciesById, spriteUrl, spritePx, SPRITE_PX } from '../lib/data';
  import { month, selectedSiteId, speciesFilter, lang, footprint, markOf, flyTo, mapView } from '../lib/stores';
  import { t, tx } from '../lib/i18n';
  import type { DiveSite, SeaLabel } from '../lib/types';

  /**
   * Base map, one SVG structure for both themes (SPEC §5):
   *  - static full-frame ocean gradients (outside the zoom group)
   *  - zoom group: graticule + tropics, 4 shelf bands stroked on ONE merged coastline
   *    (<use> ×4), the land fill, sea names, site markers
   *  - static overlays: vignette, speckle, frame + ticks (desktop), compass; paper grain as a CSS tile
   * The day/night difference is CSS only (tokens in app.css, a few display toggles below).
   *
   * Globe mode (SPEC §4.3) reuses all of it: the projection becomes an orthographic globe about
   * `centre`, zoom stays in `zoomT` as a scale about the viewport centre, and drags rotate.
   */

  // ponytail: 12×, not 16×: only the 3 % world TopoJSON is loaded (the `--detail` build is never fetched),
  // and its coastlines turn into polygons past that. Wire countries-detail in before raising this.
  const ZOOM_EXTENT: [number, number] = [1, 12];
  /** A tap also offers every marker whose centre is this close (CSS px), not just the ones under it. */
  const NEAR_PX = 18;
  /** Site labels appear above this zoom; narrow screens need more room. */
  const LABEL_ZOOM = { wide: 2.5, narrow: 4 };
  /** A sea-name tier shows once one degree of longitude spans this many pixels. */
  const TIER_PX_PER_DEG = [0, 0, 2.2, 4.5];
  const PHONE_START: { center: [number, number]; k: number } = { center: [118, 8], k: 1.9 };
  /** Below this zoom, regions with at least CLUSTER_MIN visible sites collapse into one bubble (SPEC §6.1 #13). */
  const CLUSTER_K = { wide: 1.6, narrow: 2.6 };
  const CLUSTER_MIN = 3;

  let width = $state(0);
  let height = $state(0);
  let svgEl: SVGSVGElement | undefined = $state();
  let zoomT: ZoomTransform = $state(zoomIdentity);
  let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | undefined;
  /** On-screen y of the equator / height; drives the light band of the day ocean. */
  let eqY = $state(0.5);

  let landGeom: MultiPolygon | null = $state(null);
  let landLoGeom: MultiPolygon | null = $state(null);
  let bigGeom: MultiPolygon | null = $state(null);
  let grlGeom: MultiPolygon | null = $state(null);
  let geoStatus: 'loading' | 'ready' | 'missing' = $state('loading');
  let brokenSprites = $state(new Set<string>());

  const narrow = $derived(width > 0 && width < 600);
  const globe = $derived($mapView === 'globe');
  /** The point the globe looks at, [lon, lat]; latitude kept inside LAT_RANGE so it never flips over a pole. */
  let centre: [number, number] = $state.raw(PHONE_START.center);
  /** The globe is turning (drag or flight): cheaper frames, frozen labels. */
  let moving = $state(false);
  /** A programmatic flight is running: it also zooms every frame, so the near shelf band and sea names go too. */
  let flying = $state(false);
  const flat: MapProjection | null = $derived(
    width > 0 && height > 0 ? createMapProjection(width, height) : null,
  );
  const proj: MapProjection | null = $derived(flat && globe ? createGlobeProjection(width, height, centre) : flat);
  const R = $derived(globeRadius(width, height));
  /** Pixels per degree of longitude at the flat map's equator, zoom 1. */
  const flatPx = $derived(flat ? (flat.projection.scale() * 0.8707 * Math.PI) / 180 : 0);
  /** Globe zoom that shows as many px per degree as flat zoom 1; flat zoom thresholds × this on the globe. */
  const toGlobeK = $derived(flatPx ? flatPx / ((2 * R) / 180) : 1);
  /** Zoom in flat-map terms, so label / bubble / sea-name thresholds hold in both views. */
  const effK = $derived(globe ? zoomT.k / toGlobeK : zoomT.k);

  // ---- geometry → path strings ----
  const GRATICULE = geoGraticule()
    .extent([
      [-180, LAT_RANGE[0]],
      [180, LAT_RANGE[1]],
    ])
    .step([30, 30])();
  const GRATICULE_GLOBE = geoGraticule().step([30, 30])();
  /** The globe's version of the flat map's latitude crop: everything south of LAT_RANGE[0] is shaded. */
  const POLAR_CAP = geoCircle().center([0, -90]).radius(90 + LAT_RANGE[0])();
  const TROPICS: MultiLineString = {
    type: 'MultiLineString',
    coordinates: [23.436, -23.436].map((lat) =>
      Array.from({ length: 181 }, (_, i): Position => [-180 + i * 2, lat]),
    ),
  };
  const landD = $derived(proj && landGeom ? (proj.path((moving && landLoGeom) || landGeom) ?? '') : '');
  // Motion LOD: the wide shelf bands (hidden by svg.moving anyway) are not re-projected while the globe turns.
  const bigD = $derived(proj && bigGeom && !moving ? (proj.path(bigGeom) ?? '') : '');
  const grlD = $derived(proj && grlGeom ? (proj.unwrappedPath(grlGeom) ?? '') : '');
  const graticuleD = $derived(proj ? (proj.path(globe ? GRATICULE_GLOBE : GRATICULE) ?? '') : '');
  const tropicsD = $derived(proj ? (proj.path(TROPICS) ?? '') : '');
  const capD = $derived(proj && globe ? (proj.path(POLAR_CAP) ?? '') : '');

  // ---- sea names ----
  const pxPerDeg = $derived(effK * flatPx);
  type Sea = { l: SeaLabel; x: number; y: number; rot: number };
  const seaNames: Sea[] = $derived.by(() => {
    if (!proj) return [];
    const out: Sea[] = [];
    for (const l of labels) {
      if (pxPerDeg < (TIER_PX_PER_DEG[l.tier] ?? 0)) continue;
      const p = proj.point(l.at, 70); // on the globe, only names that face the viewer
      if (!p) continue;
      let rot = 0;
      if (l.along) {
        const a = proj.point(l.along[0]);
        const b = proj.point(l.along[1]);
        if (a && b) rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      }
      out.push({ l, x: p[0], y: p[1], rot });
    }
    return out;
  });
  /** Sea names grow a little with zoom instead of staying pixel-constant. */
  const seaScale = $derived(Math.pow(zoomT.k, -0.75));

  // ---- site markers ----
  const visibleSites = $derived(
    sites.filter((s) => !$speciesFilter || s.species.includes($speciesFilter)),
  );
  type Marker = { site: DiveSite; x: number; y: number; season: boolean; sprite?: string; size: number };
  const markers: Marker[] = $derived.by(() => {
    if (!proj) return [];
    const out: Marker[] = [];
    for (const site of visibleSites) {
      const p = proj.point(site.coords);
      if (!p) continue;
      const first = site.species[0];
      const sp = first ? speciesById.get(first) : undefined;
      const ready = sp && !brokenSprites.has(sp.sprite) ? spriteUrl(sp.sprite, 192) : undefined;
      out.push({
        site,
        x: p[0],
        y: p[1],
        season: inSeason(site, $month),
        sprite: ready,
        size: sp ? spritePx(sp) : SPRITE_PX.m,
      });
    }
    return out;
  });
  const showLabels = $derived(effK >= (narrow ? LABEL_ZOOM.narrow : LABEL_ZOOM.wide));

  // ---- region bubbles: dense regions collapse until the user zooms in ----
  type Bubble = { region: string; x: number; y: number; count: number; season: number; color: string };
  const clusterZoom = $derived(narrow ? CLUSTER_K.narrow : CLUSTER_K.wide);
  const bubbles: Bubble[] = $derived.by(() => {
    if (effK >= clusterZoom) return [];
    const groups = new Map<string, Marker[]>();
    for (const m of markers) {
      const g = groups.get(m.site.region);
      if (g) g.push(m);
      else groups.set(m.site.region, [m]);
    }
    const out: Bubble[] = [];
    for (const [region, ms] of groups) {
      if (ms.length < CLUSTER_MIN) continue;
      out.push({
        region,
        x: ms.reduce((s, m) => s + m.x, 0) / ms.length,
        y: ms.reduce((s, m) => s + m.y, 0) / ms.length,
        count: ms.length,
        season: ms.filter((m) => m.season).length,
        color: regionById.get(region)?.color ?? '#F2795B',
      });
    }
    // Neighbouring regions (东南亚 / 珊瑚三角) can share a centroid area: push overlapping
    // bubbles apart in screen space so both stay tappable.
    const radius = (b: Bubble) => (22 + Math.min(10, b.count) + 4) / zoomT.k;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i]!, b = out[j]!;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const min = radius(a) + radius(b);
          if (d >= min) continue;
          const push = (min - d) / 2;
          const ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
    return out;
  });
  const clusteredRegions = $derived(new Set(bubbles.map((b) => b.region)));
  /** Markers drawn individually: everything outside a bubble. */
  const looseMarkers = $derived(markers.filter((m) => !clusteredRegions.has(m.site.region)));

  /**
   * Sticker thinning, the second de-clutter level after bubbles: greedy in priority order (selected,
   * in season, verified, has a sprite, bigger, id), a marker whose disc would sink more than 40 % of
   * its radius into an already-placed sticker is drawn as a small dot without a label.
   * Frozen while the globe turns, like labels: markers that turn into view meanwhile stay dots until it settles.
   */
  // ponytail: O(n²) over loose markers (n ≈ 320, ~50k distance checks, rerun every zoom frame on the
  // flat map like the label pass); bucket the placed discs in a screen grid if sites grow past ~2000.
  let settledStickers = new Set<string>();
  const stickered = $derived.by(() => {
    if (moving) return settledStickers;
    const k = zoomT.k, sel = $selectedSiteId;
    const order = [...looseMarkers].sort(
      (a, b) =>
        +(b.site.id === sel) - +(a.site.id === sel) ||
        +b.season - +a.season ||
        +b.site.verified - +a.site.verified ||
        +!!b.sprite - +!!a.sprite ||
        b.size - a.size ||
        a.site.id.localeCompare(b.site.id),
    );
    const placed: { x: number; y: number; r: number }[] = [];
    const out = new Set<string>();
    for (const m of order) {
      const x = m.x * k, y = m.y * k, r = m.sprite ? m.size / 2 : 6;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 0.6 * r)) continue;
      placed.push({ x, y, r });
      out.add(m.site.id);
    }
    return (settledStickers = out);
  });
  /** Stickers first, dots after them so a dot on top of a sticker stays tappable. */
  const drawn = $derived([...looseMarkers].sort((a, b) => +!stickered.has(a.site.id) - +!stickered.has(b.site.id)));

  /**
   * Greedy label thinning: labels sit to the right of the disc, so two labels collide when
   * their anchors are within ~one label width horizontally and one line vertically (screen px).
   * Top-to-bottom order keeps the result stable while panning; the selected site always wins.
   * While the globe turns the last settled set is kept: re-thinning every frame makes labels flicker.
   */
  let settledLabels = new Set<string>();
  const labelled = $derived.by(() => {
    if (moving) return settledLabels;
    const out = new Set<string>();
    settledLabels = out;
    if (!showLabels) return out;
    const k = zoomT.k;
    const placed: { x: number; y: number }[] = [];
    const take = (m: Marker) => {
      placed.push({ x: m.x * k, y: m.y * k });
      out.add(m.site.id);
    };
    const sel = looseMarkers.find((m) => m.site.id === $selectedSiteId);
    if (sel) take(sel);
    for (const m of [...looseMarkers].filter((m) => m.season && m !== sel && stickered.has(m.site.id)).sort((a, b) => a.y - b.y)) {
      const sx = m.x * k, sy = m.y * k;
      if (placed.some((p) => Math.abs(p.x - sx) < 120 && Math.abs(p.y - sy) < 16)) continue;
      take(m);
    }
    return out;
  });

  /** Zoom so the region's sites fill ~70 % of the viewport (and markers replace the bubble). */
  function openRegion(region: string) {
    if (!svgEl || !zoomBehavior) return;
    const ms = markers.filter((m) => m.site.region === region);
    if (!ms.length) return;
    if (globe) {
      // Turn to the region and zoom until its farthest site sits ~35 % of the short side out, past the split.
      const c = regionById.get(region)?.center ?? ms[0]!.site.coords;
      const delta = Math.max(...ms.map((m) => geoDistance(c, m.site.coords)));
      const fit = (0.35 * Math.min(width, height)) / (R * Math.sin(delta));
      flyGlobe(c, Math.max((clusterZoom + 0.2) * toGlobeK, Math.min(8 * toGlobeK, fit)));
      return;
    }
    const xs = ms.map((m) => m.x), ys = ms.map((m) => m.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.max(clusterZoom + 0.2, Math.min(8, 0.7 * Math.min(width / Math.max(1, x1 - x0), height / Math.max(1, y1 - y0))));
    const extent: [[number, number], [number, number]] = [[0, 0], [width, height]];
    const t = zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    zoomBehavior.transform(select(svgEl), zoomBehavior.constrain()(t, extent, extent));
  }
  const fpView = $derived($footprint);
  const hasMarks = $derived(fpView.dived.length + fpView.wish.length > 0);

  // ---- static furniture ----
  function mulberry32(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 120 seeded "plankton" dots for the night theme; screen-space, painted once. */
  const speckle = $derived.by(() => {
    const rnd = mulberry32(2026);
    return Array.from({ length: 120 }, () => ({ x: rnd() * width, y: rnd() * height, r: rnd() < 0.15 ? 1.3 : 0.8 }));
  });
  const FRAME_INSET = 18;
  /** Frame ticks follow the current zoom so they never lie about position. */
  const ticks = $derived.by(() => {
    const lon: { x: number; text: string }[] = [];
    const lat: { y: number; text: string }[] = [];
    if (!proj || narrow || globe) return { lon, lat };
    const o = FRAME_INSET;
    for (let L = -180; L < 180; L += 30) {
      const p = proj.projection([L + 0.001, 0]);
      if (!p) continue;
      const x = zoomT.applyX(p[0]);
      if (x < o + 24 || x > width - o - 24) continue;
      lon.push({ x, text: L === 0 || L === -180 ? `${Math.abs(L)}°` : `${Math.abs(L)}°${L > 0 ? $t('tick.e') : $t('tick.w')}` });
    }
    for (let B = -60; B <= 80; B += 30) {
      const p = proj.projection([150, B]);
      if (!p) continue;
      const y = zoomT.applyY(p[1]);
      if (y < o + 24 || y > height - o - 24) continue;
      lat.push({ y, text: B === 0 ? '0°' : `${Math.abs(B)}°${B > 0 ? $t('tick.n') : $t('tick.s')}` });
    }
    return { lon, lat };
  });
  const compass = $derived(
    narrow ? { x: width - 30, y: height - 44, r: 16 } : { x: width - 56, y: height - 64, r: 26 },
  );

  // ---- data loading ----
  async function loadGeo() {
    try {
      const coast = await loadCoast();
      landGeom = coast.land;
      landLoGeom = coast.landLo;
      bigGeom = coast.big;
      grlGeom = coast.greenland;
      geoStatus = 'ready';
    } catch {
      geoStatus = 'missing';
    }
  }

  // ---- interaction ----
  function select_(id: string) {
    // Never toggle: a double-tap (which d3-zoom also treats as zoom) must not close the card again.
    selectedSiteId.set(id);
  }

  function refreshEquator() {
    if (!flat || globe) return;
    const p = flat.projection([150, 0]);
    if (p) eqY = Math.min(0.85, Math.max(0.15, zoomT.applyY(p[1]) / height));
  }

  // ---- globe: rotation and flights ----
  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** d3-zoom's own transform at the previous event: drag deltas on the globe are read from it. */
  let lastT: ZoomTransform = zoomIdentity;
  let flight = 0;

  const clampCentre = ([lon, lat]: [number, number]): [number, number] => [
    ((((lon + 180) % 360) + 360) % 360) - 180,
    Math.max(LAT_RANGE[0], Math.min(LAT_RANGE[1], lat)),
  ];
  // ponytail: the globe always zooms about the viewport centre, not the pointer / pinch midpoint;
  // zooming toward the pointer would mean rotating towards it too (≈ 10 lines in the zoom handler).
  const aboutCentre = (k: number) =>
    zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-width / 2, -height / 2);

  /** Drag by (dx, dy) screen px: the point under the pointer follows it (exact at the centre). */
  function rotateBy(dx: number, dy: number) {
    const deg = 180 / Math.PI / (R * zoomT.k);
    centre = clampCentre([centre[0] - dx * deg, centre[1] + dy * deg]);
    moving = true;
  }

  function cancelFlight() {
    cancelAnimationFrame(flight);
    flight = 0;
    moving = false;
    flying = false;
  }

  /** Turn the globe along the great circle to `to` while zooming to k; instant under reduced motion. */
  function flyGlobe(to: [number, number], k: number, instant = false) {
    const zb = zoomBehavior, el = svgEl;
    if (!zb || !el) return;
    cancelFlight();
    const target = clampCentre(to);
    const from = centre, k0 = zoomT.k;
    const ms = instant || REDUCED_MOTION ? 0 : 500 + 250 * geoDistance(from, target);
    if (!ms) {
      centre = target;
      zb.scaleTo(select(el), k);
      return;
    }
    const along = geoInterpolate(from, target);
    const t0 = performance.now();
    moving = flying = true;
    const frame = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      const e = u * u * (3 - 2 * u);
      centre = clampCentre(along(e));
      zb.scaleTo(select(el), k0 * Math.pow(k / k0, e)); // through d3 every frame, so its k is never stale
      if (u < 1) flight = requestAnimationFrame(frame);
      else {
        flight = 0;
        moving = flying = false;
      }
    };
    flight = requestAnimationFrame(frame);
  }

  /**
   * Zoom to a site. On phones the header + month bar cover the top ~100 px and the card
   * drawer the bottom 70 %, so the marker is placed in the strip between them.
   */
  function focusSite(id: string, instant = false): boolean {
    if (!flat || !svgEl || !zoomBehavior) return false;
    const site = siteById.get(id);
    if (!site) return false;
    if (globe) {
      let k = 4 * toGlobeK;
      const [lon, lat] = site.coords;
      if (width >= 600) {
        flyGlobe([lon, lat], k, instant);
        return true;
      }
      // Look at a point south of the site so the site sits dy above the middle, above the drawer.
      const dy = height / 2 - Math.max(height * 0.23, 140);
      let lift = Math.asin(Math.min(1, dy / (R * k)));
      const room = (lat - LAT_RANGE[0]) * (Math.PI / 180);
      if (lift > room) {
        // The centre cannot go below LAT_RANGE[0] (Poor Knights): zoom in until R·k·sin(room) = dy.
        lift = room;
        k = Math.min(8 * toGlobeK, dy / (R * Math.sin(room)));
      }
      flyGlobe([lon, lat - (lift * 180) / Math.PI], k, instant);
      return true;
    }
    const p = flat.projection(site.coords);
    if (!p) return false;
    const cy = width < 600 ? Math.max(height * 0.23, 140) : height / 2;
    const wanted = zoomIdentity.translate(width / 2, cy).scale(4).translate(-p[0], -p[1]);
    // zoom.transform() skips the pan limits that gestures respect; constrain by hand so an
    // edge site does not snap on the first touch.
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [width, height],
    ];
    zoomBehavior.transform(select(svgEl), zoomBehavior.constrain()(wanted, extent, extent));
    return true;
  }

  /** Pan / zoom limits of the current view. The globe pans by rotating, so d3 must not bound it. */
  function setExtents() {
    if (!zoomBehavior) return;
    if (globe) zoomBehavior.translateExtent([[-Infinity, -Infinity], [Infinity, Infinity]]).scaleExtent([1, ZOOM_EXTENT[1] * toGlobeK]);
    else
      zoomBehavior
        .translateExtent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent(ZOOM_EXTENT);
  }

  /** Which view the current zoom state belongs to (set once the first view is placed). */
  let shownGlobe: boolean | undefined;

  /** Default view for the current mode, looking at `c` when given (a mode switch keeps the centre). */
  function initialView(c?: [number, number]) {
    if (!flat || !svgEl || !zoomBehavior) return;
    shownGlobe = globe;
    setExtents();
    const id = get(selectedSiteId);
    if (id && focusSite(id, true)) return;
    const sel = select(svgEl);
    if (globe) {
      centre = clampCentre(c ?? (width < 600 ? PHONE_START.center : (flat.projection.invert?.([width / 2, height / 2]) ?? PHONE_START.center)));
      zoomBehavior.transform(sel, zoomIdentity); // k = 1; the zoom handler places it about the centre
      return;
    }
    // Narrow screens: the whole world is too small to read, so start on Southeast Asia.
    if (c || width < 600) {
      const p = flat.projection(c ?? PHONE_START.center);
      if (p) {
        const k = width < 600 ? PHONE_START.k : 1;
        const t = zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-p[0], -p[1]);
        const extent: [[number, number], [number, number]] = [[0, 0], [width, height]];
        zoomBehavior.transform(sel, c ? zoomBehavior.constrain()(t, extent, extent) : t);
      }
    }
    refreshEquator();
  }

  onMount(() => {
    loadGeo();
  });

  // Attach zoom exactly once per <svg>; everything else it reads is untracked.
  $effect(() => {
    const el = svgEl;
    if (!el) return;
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent(ZOOM_EXTENT)
      .duration(REDUCED_MOTION ? 0 : 250)
      .on('start', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        chooser = null; // its anchor would drift; a tap reopens it after the gesture's start
        if (e.sourceEvent) cancelFlight(); // a touch / click / wheel takes over from a flight
      })
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        const tr = e.transform;
        if (!globe) zoomT = tr;
        // On the globe d3's transform is only read: a user pan at constant k rotates, any zoom
        // (wheel, pinch, double-click, scaleTo / transform calls) scales about the centre.
        else if (e.sourceEvent && tr.k === lastT.k) rotateBy(tr.x - lastT.x, tr.y - lastT.y);
        else zoomT = aboutCentre(tr.k);
        lastT = tr;
      })
      .on('end', () => {
        if (!flight) moving = false;
        refreshEquator();
      });
    zoomBehavior = zb;
    select(el).call(zb);
    untrack(() => initialView());
    return () => {
      cancelFlight();
      select(el).on('.zoom', null);
      zoomBehavior = undefined;
    };
  });

  // Viewport changes only move the pan limits; they never rebuild the behaviour. A height change
  // (keyboard, WeChat toolbar, rotation) re-fits the projection vertically by Δh/2, so shift the
  // view by the same amount to keep what the user is looking at in place. The globe re-centres.
  let prevHeight = 0;
  $effect(() => {
    if (!width || !height) return;
    const zb = zoomBehavior;
    const el = svgEl;
    if (!zb || !el) return;
    untrack(() => {
      setExtents();
      const dh = prevHeight ? height - prevHeight : 0;
      prevHeight = height;
      if (globe) zoomT = aboutCentre(zoomT.k);
      else if (dh) zb.translateBy(select(el), 0, -dh / 2);
    });
  });

  // Atlas ⇄ globe: keep what is in the middle of the screen, reset the zoom to that view's default.
  $effect(() => {
    const g = globe;
    untrack(() => {
      if (shownGlobe === undefined || g === shownGlobe || !flat) return;
      cancelFlight();
      const c = g ? flat.projection.invert?.(zoomT.invert([width / 2, height / 2])) : centre;
      initialView(c ?? undefined);
    });
  });

  // Search results and other "take me there" requests.
  $effect(() => {
    const id = $flyTo;
    if (!id) return;
    untrack(() => {
      focusSite(id);
      flyTo.set(null);
    });
  });

  // ---- taps: one handler for the whole map, so near-coincident sites get a chooser instead of a guess ----
  /** Sites under a tap that could mean more than one; x / y are the tap in map px. */
  let chooser: { items: Marker[]; from: string; x: number; y: number } | null = $state(null);
  let chooserEl: HTMLDivElement | undefined = $state();

  /** Drawn markers whose disc, sprite or label is under the point, or whose centre is within NEAR_PX; nearest first. */
  function markersAt(e: MouseEvent): Marker[] {
    const hit = new Set(document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest<SVGElement>('.site')?.dataset.id));
    const r = svgEl!.getBoundingClientRect();
    return drawn
      .map((m) => {
        const [x, y] = zoomT.apply([m.x, m.y]);
        return { m, d: Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top)) };
      })
      .filter(({ m, d }) => d <= NEAR_PX || hit.has(m.site.id))
      .sort((a, b) => a.d - b.d)
      .map(({ m }) => m);
  }

  function onMapClick(e: MouseEvent) {
    const target = e.target as Element;
    if (target.closest('.bubble')) return;
    chooser = null;
    const own = target.closest<SVGElement>('.site')?.dataset.id;
    const ms = markersAt(e);
    // a screen reader's synthetic click can land off its own marker: open that one
    if (own && !ms.some((m) => m.site.id === own)) select_(own);
    else if (ms.length > 1) {
      const r = svgEl!.getBoundingClientRect();
      chooser = { items: ms, from: own ?? ms[0]!.site.id, x: e.clientX - r.left, y: e.clientY - r.top };
      tick().then(() => chooserEl?.querySelector('button')?.focus({ preventScroll: true }));
    } else if (ms[0]) select_(ms[0].site.id);
    // open water, or the space around the globe
    else if (target.classList.contains('sea') || target === svgEl) selectedSiteId.set(null);
  }

  /** Close the chooser; if it had focus, hand it to the marker of `id` (the picked or the tapped site). */
  function closeChooser(id = chooser?.from) {
    const had = !!chooserEl?.contains(document.activeElement);
    chooser = null;
    if (had && id) tick().then(() => svgEl?.querySelector<SVGElement>(`.site[data-id="${id}"]`)?.focus({ preventScroll: true }));
  }

  /** Below the tap if it fits, else above; always inside the map with an 8 px margin. Rows are 44 px, 5.5 visible. */
  const chooserBox = $derived.by(() => {
    if (!chooser) return null;
    const w = Math.min(280, width - 16);
    const h = 40 + Math.min(chooser.items.length, 5.5) * 44;
    const left = Math.max(8, Math.min(width - w - 8, chooser.x - w / 2));
    const top = chooser.y + 20 + h <= height - 8 ? chooser.y + 20 : Math.max(8, chooser.y - 20 - h);
    return { left, top, w, h };
  });

  /** Globe keyboard: arrows rotate 10° / zoom, + / - zoom. Keys from a focused marker move focus to the globe. */
  function onKey(e: KeyboardEvent) {
    if (!globe || !svgEl || !zoomBehavior) return;
    const s = 10 / zoomT.k;
    const turn: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    const d = turn[e.key];
    const zoom = e.key === '+' || e.key === '=' ? 2 : e.key === '-' ? 0.5 : 0;
    if (!d && !zoom) return;
    e.preventDefault();
    cancelFlight();
    if (d) centre = clampCentre([centre[0] + d[0], centre[1] + d[1]]);
    else zoomBehavior.scaleBy(select(svgEl), zoom);
    if (e.target !== svgEl) svgEl.focus();
  }
</script>

<div class="map" bind:clientWidth={width} bind:clientHeight={height}>
  {#if width > 0 && height > 0}
    <!-- The svg is a plain canvas (no img role, so the markers stay reachable); a tap on open water closes the card.
         On the globe it is a focusable role=application (tabindex only then): arrows rotate, + / - zoom. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex -->
    <svg
      bind:this={svgEl}
      {width}
      {height}
      class:moving
      class:flying
      role={globe ? 'application' : 'presentation'}
      tabindex={globe ? 0 : undefined}
      aria-label={globe ? $t('view.globeKeys') : undefined}
      onclick={onMapClick}
      onkeydown={onKey}
    >
      <defs>
        <!-- one merged coastline (+ Greenland through the unwrapped projection), referenced 5× -->
        <g id="coast"><path class="vs" d={landD} /><path class="vs" d={grlD} /></g>
        <g id="coast-big"><path class="vs" d={bigD} /><path class="vs" d={grlD} /></g>
        <linearGradient id="sea-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="st-deep" />
          <stop offset={eqY * 0.45} class="st-mid" />
          <stop offset={eqY} class="st-ocean" />
          <stop offset={eqY + (1 - eqY) * 0.55} class="st-mid" />
          <stop offset="1" class="st-deep" />
        </linearGradient>
        <radialGradient id="sea-r" cx="0.5" cy={eqY} r="0.7">
          <stop offset="0" class="st-shallow" stop-opacity="0.14" />
          <stop offset="0.55" class="st-shallow" stop-opacity="0" />
          <stop offset="1" class="st-deep" stop-opacity="0.35" />
        </radialGradient>
        <radialGradient id="sea-night" cx="0.46" cy="0.44" r="0.72">
          <stop offset="0" class="st-ocean" />
          <stop offset="1" class="st-deep" />
        </radialGradient>
        <linearGradient id="land-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2={height}>
          <stop offset="0" class="st-land-hi" />
          <stop offset="1" class="st-land-lo" />
        </linearGradient>
        <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.6" class="st-deep" stop-opacity="0" />
          <stop offset="1" class="st-deep" stop-opacity="0.38" />
        </radialGradient>
        {#if globe}
          <radialGradient id="globe-atmo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.86" class="st-shallow" stop-opacity="0" />
            <stop offset="0.94" class="st-shallow" stop-opacity="0.35" />
            <stop offset="1" class="st-shallow" stop-opacity="0" />
          </radialGradient>
          <!-- light from the top left -->
          <radialGradient id="globe-shade" cx="0.38" cy="0.34" r="0.8">
            <stop offset="0" class="st-deep" stop-opacity="0" />
            <stop offset="1" class="st-deep" stop-opacity="0.45" />
          </radialGradient>
        {/if}
      </defs>

      <!-- ocean: static, full frame (the globe's sea is a disc in the zoom group; around it is .map's background) -->
      {#if !globe}
        <rect class="sea sea-v" {width} {height} fill="url(#sea-v)" />
        <rect class="sea sea-r" {width} {height} fill="url(#sea-r)" />
        <rect class="sea sea-night" {width} {height} fill="url(#sea-night)" />
      {/if}

      <g transform={zoomT.toString()}>
        {#if globe}
          <circle class="atmo" cx={width / 2} cy={height / 2} r={R * 1.08} fill="url(#globe-atmo)" />
          <circle class="sea" cx={width / 2} cy={height / 2} r={R} fill="url(#sea-night)" />
        {/if}
        <path class="graticule" d={graticuleD} />
        <path class="tropics" d={tropicsD} />
        {#if globe}<path class="cap" d={capD} />{/if}

        <!-- continental shelf: four pixel-constant bands, widest first, under the land -->
        <g class="shelf">
          <use href="#coast-big" class="s1" />
          <use href="#coast-big" class="s2" />
          <use href="#coast" class="s3" />
          <use href="#coast" class="s4" />
        </g>
        <use href="#coast" class="land" />

        <g class="seas" aria-hidden="true">
          {#each seaNames as s (s.l.id)}
            <g transform={`translate(${s.x},${s.y}) scale(${seaScale}) rotate(${s.rot})`}>
              <text class={`sea-${s.l.tier}`} dy=".35em" dx={['', '.25em', '.15em', '.1em'][s.l.tier]}>
                {$tx(s.l.name)}
              </text>
              {#if s.l.tier === 1 && $lang === 'zh'}
                <text class="sea-en" y="15" dy=".35em" dx=".15em">{s.l.name.en.toUpperCase()}</text>
              {/if}
            </g>
          {/each}
        </g>

        {#if globe}
          <circle class="shade" cx={width / 2} cy={height / 2} r={R} fill="url(#globe-shade)" />
          <circle class="rim" cx={width / 2} cy={height / 2} r={R} />
        {/if}

        <g class="bubbles">
          {#each bubbles as b (b.region)}
            <g
              class="bubble"
              transform={`translate(${b.x},${b.y}) scale(${1 / zoomT.k})`}
              role="button"
              tabindex="0"
              aria-label={`${$tx(regionById.get(b.region)?.name)} · ${b.season} ${$t('map.sitesShown')}`}
              style:--region={b.color}
              onclick={() => openRegion(b.region)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openRegion(b.region);
                }
              }}
            >
              <circle class="halo" r={22 + Math.min(10, b.count)} />
              <circle class="disc" r={16 + Math.min(10, b.count)} />
              <text class="n" dy=".35em">{b.season}</text>
              <text class="name" y={30 + Math.min(10, b.count)}>{$tx(regionById.get(b.region)?.name)}</text>
            </g>
          {/each}
        </g>

        <g class="sites">
          {#each drawn as m (m.site.id)}
            {@const selected = $selectedSiteId === m.site.id}
            {@const dot = !selected && !stickered.has(m.site.id)}
            {@const mark = markOf(fpView, m.site.id)}
            <g
              class="site"
              class:selected
              class:dived={mark === 'dived'}
              class:wish={mark === 'wish'}
              class:unmarked={hasMarks && !mark}
              class:off={!m.season}
              class:demoted={dot}
              transform={`translate(${m.x},${m.y}) scale(${1 / zoomT.k})`}
              role="button"
              tabindex="0"
              aria-label={$tx(m.site.name)}
              data-id={m.site.id}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select_(m.site.id);
                }
              }}
            >
              <circle class="hit" r={dot ? 16 : 20} />
              {#if !dot}<circle class="glow" r="10" />{/if}
              {#if dot}
                <circle class="ring" r="3" />
                <circle class="dot" r="1.8" />
              {:else if m.sprite}
                <image
                  href={m.sprite}
                  x={-m.size / 2}
                  y={-m.size / 2}
                  width={m.size}
                  height={m.size}
                  onerror={() => {
                    const sp = speciesById.get(m.site.species[0] ?? '');
                    if (sp) brokenSprites = new Set([...brokenSprites, sp.sprite]);
                  }}
                />
              {:else}
                <circle class="shadow" r="6.5" cy="1.2" />
                <circle class="ring" r={selected ? 7 : 5.5} />
                <circle class="dot" r={selected ? 5 : 4} />
              {/if}
              {#if selected || labelled.has(m.site.id)}
                <text class="label" x={m.sprite ? 0 : 11} y={m.sprite ? m.size / 2 + 12 : 4} text-anchor={m.sprite ? 'middle' : 'start'}>
                  {$tx(m.site.name)}
                </text>
              {/if}
            </g>
          {/each}
        </g>
      </g>

      <!-- static overlays -->
      <rect class="vignette" {width} {height} fill="url(#vignette)" />
      <g class="speckle" aria-hidden="true">
        {#each speckle as s, i (i)}<circle cx={s.x} cy={s.y} r={s.r} />{/each}
      </g>
      {#if !narrow}
        <g class="frame" aria-hidden="true">
          <rect x="14" y="14" width={width - 28} height={height - 28} stroke-width="0.6" />
          <rect x={FRAME_INSET} y={FRAME_INSET} width={width - 2 * FRAME_INSET} height={height - 2 * FRAME_INSET} stroke-width="1.1" />
          <g class="ticks">
            {#each ticks.lon as tk (tk.text)}
              <line x1={tk.x} y1={FRAME_INSET} x2={tk.x} y2={FRAME_INSET + 4} />
              <line x1={tk.x} y1={height - FRAME_INSET} x2={tk.x} y2={height - FRAME_INSET - 4} />
              <text x={tk.x} y={FRAME_INSET + 13} text-anchor="middle">{tk.text}</text>
            {/each}
            {#each ticks.lat as tk (tk.text)}
              <line x1={FRAME_INSET} y1={tk.y} x2={FRAME_INSET + 4} y2={tk.y} />
              <line x1={width - FRAME_INSET} y1={tk.y} x2={width - FRAME_INSET - 4} y2={tk.y} />
              <text x={FRAME_INSET + 7} y={tk.y + 3}>{tk.text}</text>
            {/each}
          </g>
        </g>
      {/if}
      <g class="compass" transform={`translate(${compass.x},${compass.y})`} aria-hidden="true">
        <circle r={compass.r} class="c-outer" />
        <circle r={compass.r * 0.78} class="c-inner" />
        <path d={`M0,${-compass.r * 1.08} L${compass.r * 0.17},0 L0,${compass.r * 0.5} L${-compass.r * 0.17},0 Z`} class="c-n" />
        <path d={`M0,${compass.r} L${compass.r * 0.14},0 L0,${-compass.r * 0.4} L${-compass.r * 0.14},0 Z`} class="c-s" />
        <path d={`M${-compass.r},0 L0,${compass.r * 0.14} L${compass.r * 0.4},0 L0,${-compass.r * 0.14} Z`} class="c-s" />
        <path d={`M${compass.r},0 L0,${compass.r * 0.14} L${-compass.r * 0.4},0 L0,${-compass.r * 0.14} Z`} class="c-s" />
        <circle r={compass.r * 0.09} class="c-dot" />
        <text y={-compass.r * 1.22} text-anchor="middle" style:font-size={narrow ? '8px' : '11px'}>{$t('compass.n')}</text>
      </g>
    </svg>
    <div class="grain" aria-hidden="true"></div>
  {/if}

  {#if chooser && chooserBox}
    <div
      class="chooser"
      bind:this={chooserEl}
      role="dialog"
      aria-labelledby="chooser-title"
      tabindex="-1"
      style:left={`${chooserBox.left}px`}
      style:top={`${chooserBox.top}px`}
      style:width={`${chooserBox.w}px`}
      style:max-height={`${chooserBox.h}px`}
      onkeydown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation(); // only the chooser: App's Escape would close the card too
        closeChooser();
      }}
    >
      <p id="chooser-title">{$t('map.nearbySites').replace('{n}', String(chooser.items.length))}</p>
      {#each chooser.items as m (m.site.id)}
        <button
          onclick={() => {
            select_(m.site.id);
            closeChooser(m.site.id);
          }}
        >
          {#if m.sprite}<img src={m.sprite} alt="" decoding="async" />{:else}<span class="disc"></span>{/if}
          <span>{$tx(m.site.name)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if geoStatus !== 'ready'}
    <div class="notice">
      {geoStatus === 'loading' ? $t('map.loading') : $t('map.noGeo')}
    </div>
  {/if}

  <!-- counts the filter, not what is on screen: the same in both views, and silent while the globe turns -->
  <div class="count" aria-live="polite">
    {visibleSites.filter((s) => inSeason(s, $month)).length} {$t('map.sitesShown')}
  </div>
</div>

<style>
  .map {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--ocean-deep);
    touch-action: none;
  }
  svg {
    display: block;
    cursor: grab;
  }
  svg:active {
    cursor: grabbing;
  }
  svg:focus-visible {
    outline: 2px solid var(--sun);
    outline-offset: -2px;
  }

  /* ---- globe ---- */
  .atmo,
  .cap,
  .shade,
  .rim { pointer-events: none; }
  .cap { fill: var(--ocean-deep); fill-opacity: 0.5; }
  .rim {
    fill: none;
    stroke: var(--map-line);
    stroke-opacity: 0.35;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  /* motion LOD while the globe turns: only the land, its near band, graticule and markers */
  svg.moving .s1,
  svg.moving .s2,
  svg.moving .s3 { display: none; }
  svg.flying .s4,
  svg.flying .seas { display: none; }

  /* ---- ocean ---- */
  .st-deep { stop-color: var(--ocean-deep); }
  .st-mid { stop-color: var(--ocean-mid); }
  .st-ocean { stop-color: var(--ocean); }
  .st-shallow { stop-color: var(--ocean-shallow); }
  .st-land-hi { stop-color: var(--land-hi); }
  .st-land-lo { stop-color: var(--land-2); }
  .sea-night { display: none; }
  :global(:root[data-theme='night']) .sea-v,
  :global(:root[data-theme='night']) .sea-r { display: none; }
  :global(:root[data-theme='night']) .sea-night { display: block; }

  /* ---- lines ---- */
  .vs { vector-effect: non-scaling-stroke; }
  .graticule,
  .tropics {
    fill: none;
    stroke: var(--map-line);
    stroke-opacity: 0.1;
    stroke-width: 0.75;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .tropics {
    stroke-opacity: 0.2;
    stroke-dasharray: 3 5;
  }

  /* ---- shelf + land ---- */
  .shelf use {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
    pointer-events: none;
  }
  .s1 { stroke: var(--ring-far); stroke-width: 28; stroke-opacity: 0.05; }
  .s2 { stroke: var(--ring-far); stroke-width: 16; stroke-opacity: 0.1; }
  .s3 { stroke: var(--ring-mid); stroke-width: 8; stroke-opacity: 0.2; }
  .s4 { stroke: var(--ring-near); stroke-width: 3; stroke-opacity: 0.34; }
  :global(:root[data-theme='night']) .s1 { display: none; }
  :global(:root[data-theme='night']) .s2 { stroke-width: 20; stroke-opacity: 0.18; }
  :global(:root[data-theme='night']) .s3 { stroke-width: 10; stroke-opacity: 0.45; }
  :global(:root[data-theme='night']) .s4 { stroke-width: 4; stroke-opacity: 0.9; }
  .land {
    fill: url(#land-grad);
    stroke: var(--land-edge);
    stroke-width: 1;
    stroke-opacity: 0.8;
    stroke-linejoin: round;
    pointer-events: none;
  }

  /* ---- sea names ---- */
  .seas text {
    font-family: var(--font-serif);
    fill: var(--map-line);
    text-anchor: middle;
    pointer-events: none;
  }
  .sea-1 { font-size: 18px; letter-spacing: 0.5em; fill-opacity: 0.62; }
  .sea-2 { font-size: 11.5px; letter-spacing: 0.3em; fill-opacity: 0.7; }
  .sea-3 { font-size: 9.5px; letter-spacing: 0.2em; fill-opacity: 0.7; }
  .sea-en { font-size: 8px; letter-spacing: 0.3em; fill-opacity: 0.5; }
  /* English names are 4–6× longer than the Chinese ones: tighter tracking, smaller caps. */
  :global(html[lang='en']) .sea-1 { font-size: 13px; letter-spacing: 0.18em; }
  :global(html[lang='en']) .sea-2 { font-size: 10px; letter-spacing: 0.12em; }
  :global(html[lang='en']) .sea-3 { font-size: 9px; letter-spacing: 0.08em; }
  :global(:root[data-theme='night']) .sea-1 { fill-opacity: 0.45; }

  /* ---- sites ---- */
  .site {
    cursor: pointer;
    outline: none;
    transition: opacity 0.25s ease;
  }
  .site.unmarked { opacity: 0.75; }
  .site.off { opacity: 0.3; }
  :global(:root[data-theme='night']) .site.off { opacity: 0.4; }
  /* footprint: 潜过 = coral disc inside a coral ring, 想去 = sun ring */
  .site.dived .ring { fill: var(--coral); }
  .site.dived .dot { fill: var(--paper); }
  .site.wish .ring { fill: var(--sun); }
  .site .hit { fill: transparent; }
  .glow {
    display: none;
    fill: none;
    stroke: var(--coral);
    stroke-width: 6;
    stroke-opacity: 0.25;
    pointer-events: none;
  }
  .shadow { fill: var(--ocean-deep); fill-opacity: 0.35; }
  .ring { fill: var(--paper); transition: fill 0.15s ease; }
  .dot { fill: var(--coral); }
  :global(:root[data-theme='night']) .glow { display: block; }
  :global(:root[data-theme='night']) .shadow { display: none; }
  :global(:root[data-theme='night']) .ring { fill: var(--shell); }
  .site:hover .ring,
  .site:focus-visible .ring,
  .site.selected .ring { fill: var(--sun); }
  .site:focus-visible .hit {
    fill: none;
    stroke: var(--sun);
    stroke-width: 2;
  }
  .label {
    font-size: 11px;
    font-weight: 600;
    fill: var(--ink);
    paint-order: stroke;
    stroke: var(--paper);
    stroke-width: 3px;
    stroke-opacity: 0.9;
    stroke-linejoin: round;
  }

  /* ---- several sites under one tap ---- */
  .chooser {
    position: absolute;
    z-index: 4; /* .map is no stacking context: this sits over the toolbar and the phone drawer */
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    padding: 4px;
    border-radius: 12px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow);
    outline: none;
  }
  .chooser p {
    margin: 0;
    padding: 8px 10px 6px;
    font-size: 12px;
    color: var(--ink-soft);
  }
  .chooser button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 44px;
    padding: 0 8px;
    border-radius: 8px;
    text-align: left;
    font-size: 14px;
    font-weight: 600;
  }
  .chooser button:hover,
  .chooser button:focus-visible {
    background: var(--paper-2);
    outline: none;
  }
  .chooser img,
  .chooser .disc {
    flex: none;
    width: 32px;
    height: 32px;
    object-fit: contain;
  }
  .chooser .disc {
    border-radius: 50%;
    background: radial-gradient(var(--coral) 0 4px, var(--paper-2) 4.5px 9px, transparent 9.5px);
  }
  .chooser span:last-child {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* ---- region bubbles ---- */
  .bubble {
    cursor: pointer;
    outline: none;
  }
  .bubble .halo {
    fill: var(--region);
    fill-opacity: 0.22;
  }
  .bubble .disc {
    fill: var(--paper);
    stroke: var(--region);
    stroke-width: 3;
  }
  .bubble:hover .disc,
  .bubble:focus-visible .disc {
    stroke: var(--sun);
  }
  .bubble .n {
    font-size: 15px;
    font-weight: 700;
    fill: var(--ink);
    text-anchor: middle;
    pointer-events: none;
  }
  .bubble .name {
    font-size: 11px;
    font-weight: 600;
    fill: var(--ink);
    text-anchor: middle;
    paint-order: stroke;
    stroke: var(--paper);
    stroke-width: 3px;
    stroke-opacity: 0.9;
    stroke-linejoin: round;
    pointer-events: none;
  }

  /* ---- static furniture ---- */
  .vignette,
  .speckle,
  .frame,
  .compass { pointer-events: none; }
  :global(:root[data-theme='night']) .vignette { display: none; }
  .speckle {
    display: none;
    fill: var(--map-line);
    fill-opacity: 0.25;
  }
  :global(:root[data-theme='night']) .speckle { display: block; }
  .frame rect {
    fill: none;
    stroke: var(--map-line);
    stroke-opacity: 0.38;
  }
  .ticks line {
    stroke: var(--map-line);
    stroke-opacity: 0.45;
    stroke-width: 0.8;
  }
  .ticks text {
    fill: var(--map-line);
    fill-opacity: 0.5;
    font-family: var(--font-serif);
    font-size: 8.5px;
    letter-spacing: 0.06em;
  }
  .compass { opacity: 0.72; }
  .compass .c-outer { fill: none; stroke: var(--map-line); stroke-width: 0.7; stroke-opacity: 0.8; }
  .compass .c-inner { fill: none; stroke: var(--map-line); stroke-width: 0.4; stroke-opacity: 0.5; }
  .compass .c-n { fill: var(--map-line); fill-opacity: 0.95; }
  .compass .c-s { fill: var(--map-line); fill-opacity: 0.45; }
  .compass .c-dot { fill: var(--coral); }
  .compass text {
    fill: var(--map-line);
    fill-opacity: 0.9;
    font-family: var(--font-serif);
  }
  .grain {
    position: absolute;
    inset: 0;
    pointer-events: none;
    will-change: transform; /* own compositor layer: WebKit would otherwise repaint the tile every zoom frame */
    opacity: 0.16;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0.6 0.6 0 -0.5'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")
      0 0 / 200px 200px;
  }
  :global(:root[data-theme='night']) .grain { opacity: 0.06; }

  /* ---- HUD ---- */
  .notice,
  .count {
    position: absolute;
    left: 12px;
    bottom: 12px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--glass);
    color: var(--ink);
    font-size: 12px;
  }
  .notice {
    left: 50%;
    top: 50%;
    bottom: auto;
    transform: translate(-50%, -50%);
    font-size: 14px;
    padding: 10px 16px;
  }
</style>
