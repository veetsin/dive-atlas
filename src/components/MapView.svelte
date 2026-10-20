<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { select } from 'd3-selection';
  import { zoom as d3zoom, zoomIdentity, type ZoomTransform, type ZoomBehavior } from 'd3-zoom';
  import { geoGraticule, geoArea } from 'd3-geo';
  import { merge } from 'topojson-client';
  import type {
    Topology,
    GeometryCollection,
    Polygon as TopoPolygon,
    MultiPolygon as TopoMultiPolygon,
  } from 'topojson-specification';
  import type { MultiPolygon, MultiLineString, Polygon, Position } from 'geojson';

  import { createMapProjection, UNWRAP_LIST, LAT_RANGE, type MapProjection } from '../lib/projection';
  import { sites, siteById, labels, inSeason, speciesById, spriteUrl } from '../lib/data';
  import { month, selectedSiteId, speciesFilter, lang } from '../lib/stores';
  import { t, tx } from '../lib/i18n';
  import type { DiveSite, SeaLabel } from '../lib/types';

  /**
   * Base map, one SVG structure for both themes (SPEC §5):
   *  - static full-frame ocean gradients (outside the zoom group)
   *  - zoom group: graticule + tropics, 4 shelf bands stroked on ONE merged coastline
   *    (<use> ×4), the land fill, sea names, site markers
   *  - static overlays: vignette, speckle, frame + ticks (desktop), compass; paper grain as a CSS tile
   * The day/night difference is CSS only (tokens in app.css, a few display toggles below).
   */

  const ZOOM_EXTENT: [number, number] = [1, 8];
  /** Site labels appear above this zoom; narrow screens need more room. */
  const LABEL_ZOOM = { wide: 2.5, narrow: 4 };
  /** Polygons smaller than this (steradians, ≈ 4 000 km²) only get the narrow shelf bands. */
  const SMALL_SR = 1e-4;
  /** A sea-name tier shows once one degree of longitude spans this many pixels. */
  const TIER_PX_PER_DEG = [0, 0, 2.2, 4.5];
  const PHONE_START: { center: [number, number]; k: number } = { center: [118, 8], k: 1.9 };

  type CountryProps = { ADM0_A3: string };

  let width = $state(0);
  let height = $state(0);
  let svgEl: SVGSVGElement | undefined = $state();
  let zoomT: ZoomTransform = $state(zoomIdentity);
  let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | undefined;
  /** On-screen y of the equator / height; drives the light band of the day ocean. */
  let eqY = $state(0.5);

  let landGeom: MultiPolygon | null = $state(null);
  let bigGeom: MultiPolygon | null = $state(null);
  let grlGeom: MultiPolygon | null = $state(null);
  let geoStatus: 'loading' | 'ready' | 'missing' = $state('loading');
  let brokenSprites = $state(new Set<string>());

  const narrow = $derived(width > 0 && width < 600);
  const proj: MapProjection | null = $derived(
    width > 0 && height > 0 ? createMapProjection(width, height) : null,
  );

  // ---- geometry → path strings ----
  const GRATICULE = geoGraticule()
    .extent([
      [-180, LAT_RANGE[0]],
      [180, LAT_RANGE[1]],
    ])
    .step([30, 30])();
  const TROPICS: MultiLineString = {
    type: 'MultiLineString',
    coordinates: [23.436, -23.436].map((lat) =>
      Array.from({ length: 181 }, (_, i): Position => [-180 + i * 2, lat]),
    ),
  };
  const landD = $derived(proj && landGeom ? (proj.path(landGeom) ?? '') : '');
  const bigD = $derived(proj && bigGeom ? (proj.path(bigGeom) ?? '') : '');
  const grlD = $derived(proj && grlGeom ? (proj.unwrappedPath(grlGeom) ?? '') : '');
  const graticuleD = $derived(proj ? (proj.path(GRATICULE) ?? '') : '');
  const tropicsD = $derived(proj ? (proj.path(TROPICS) ?? '') : '');

  // ---- sea names ----
  const pxPerDeg = $derived(proj ? (zoomT.k * proj.projection.scale() * 0.8707 * Math.PI) / 180 : 0);
  type Sea = { l: SeaLabel; x: number; y: number; rot: number };
  const seaNames: Sea[] = $derived.by(() => {
    if (!proj) return [];
    const out: Sea[] = [];
    for (const l of labels) {
      if (pxPerDeg < (TIER_PX_PER_DEG[l.tier] ?? 0)) continue;
      const p = proj.projection(l.at);
      if (!p) continue;
      let rot = 0;
      if (l.along) {
        const a = proj.projection(l.along[0]);
        const b = proj.projection(l.along[1]);
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
  type Marker = { site: DiveSite; x: number; y: number; season: boolean; sprite?: string };
  const markers: Marker[] = $derived.by(() => {
    if (!proj) return [];
    const out: Marker[] = [];
    for (const site of visibleSites) {
      const p = proj.projection(site.coords);
      if (!p) continue;
      const first = site.species[0];
      const sp = first ? speciesById.get(first) : undefined;
      out.push({
        site,
        x: p[0],
        y: p[1],
        season: inSeason(site, $month),
        sprite: sp && !brokenSprites.has(sp.sprite) ? sp.sprite : undefined,
      });
    }
    return out;
  });
  const showLabels = $derived(zoomT.k >= (narrow ? LABEL_ZOOM.narrow : LABEL_ZOOM.wide));

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
    if (!proj || narrow) return { lon, lat };
    const o = FRAME_INSET;
    for (let L = -180; L < 180; L += 30) {
      const p = proj.projection([L + 0.001, 0]);
      if (!p) continue;
      const x = zoomT.applyX(p[0]);
      if (x < o + 24 || x > width - o - 24) continue;
      lon.push({ x, text: L === 0 || L === -180 ? `${Math.abs(L)}°` : `${Math.abs(L)}°${L > 0 ? 'E' : 'W'}` });
    }
    for (let B = -60; B <= 80; B += 30) {
      const p = proj.projection([150, B]);
      if (!p) continue;
      const y = zoomT.applyY(p[1]);
      if (y < o + 24 || y > height - o - 24) continue;
      lat.push({ y, text: B === 0 ? '0°' : `${Math.abs(B)}°${B > 0 ? 'N' : 'S'}` });
    }
    return { lon, lat };
  });
  const compass = $derived(
    narrow ? { x: width - 30, y: height - 44, r: 16 } : { x: width - 56, y: height - 64, r: 26 },
  );

  // ---- data loading ----
  async function loadGeo() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}geo/countries.topo.json`);
      if (!res.ok) throw new Error(String(res.status));
      const topo = (await res.json()) as Topology;
      const key = Object.keys(topo.objects)[0];
      if (!key) throw new Error('empty topology');
      const obj = topo.objects[key] as GeometryCollection<CountryProps>;
      type Country = (TopoPolygon<CountryProps> | TopoMultiPolygon<CountryProps>) & { properties: CountryProps };
      const countries = obj.geometries.filter(
        (g): g is Country => (g.type === 'Polygon' || g.type === 'MultiPolygon') && !!g.properties,
      );
      const main = countries.filter((g) => !UNWRAP_LIST.has(g.properties.ADM0_A3));
      const unwrapped = countries.filter((g) => UNWRAP_LIST.has(g.properties.ADM0_A3));
      // Coastlines only: dissolve every country into one MultiPolygon (shared borders vanish).
      const merged = merge(topo, main) as MultiPolygon;
      landGeom = merged;
      bigGeom = {
        type: 'MultiPolygon',
        coordinates: merged.coordinates.filter((c) => {
          const a = geoArea({ type: 'Polygon', coordinates: c } as Polygon);
          return Math.min(a, 4 * Math.PI - a) >= SMALL_SR;
        }),
      };
      grlGeom = unwrapped.length ? (merge(topo, unwrapped) as MultiPolygon) : null;
      geoStatus = 'ready';
    } catch {
      geoStatus = 'missing';
    }
  }

  // ---- interaction ----
  function select_(id: string) {
    selectedSiteId.set($selectedSiteId === id ? null : id);
  }

  function refreshEquator() {
    if (!proj) return;
    const p = proj.projection([150, 0]);
    if (p) eqY = Math.min(0.85, Math.max(0.15, zoomT.applyY(p[1]) / height));
  }

  /**
   * Zoom to a site. On phones the header + month bar cover the top ~100 px and the card
   * drawer the bottom 70 %, so the marker is placed in the strip between them.
   */
  function focusSite(id: string): boolean {
    if (!proj || !svgEl || !zoomBehavior) return false;
    const site = siteById.get(id);
    if (!site) return false;
    const p = proj.projection(site.coords);
    if (!p) return false;
    const cy = width < 600 ? Math.max(height * 0.23, 140) : height / 2;
    zoomBehavior.transform(select(svgEl), zoomIdentity.translate(width / 2, cy).scale(4).translate(-p[0], -p[1]));
    return true;
  }

  function initialView() {
    if (!proj || !svgEl || !zoomBehavior) return;
    const id = get(selectedSiteId);
    if (id && focusSite(id)) return;
    // Narrow screens: the whole world is too small to read, so start on Southeast Asia.
    if (width < 600) {
      const c = proj.projection(PHONE_START.center);
      if (c) {
        const k = PHONE_START.k;
        zoomBehavior.transform(select(svgEl), zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-c[0], -c[1]));
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
      .on('zoom', (e) => {
        zoomT = e.transform;
      })
      .on('end', refreshEquator);
    zoomBehavior = zb;
    select(el).call(zb);
    untrack(() => {
      zb.translateExtent([
        [0, 0],
        [width, height],
      ]);
      initialView();
    });
    return () => {
      select(el).on('.zoom', null);
      zoomBehavior = undefined;
    };
  });

  // Viewport changes only move the pan limits; they never rebuild the behaviour.
  $effect(() => {
    if (!width || !height) return;
    zoomBehavior?.translateExtent([
      [0, 0],
      [width, height],
    ]);
  });

  function onMapClick(e: MouseEvent) {
    if ((e.target as Element).classList.contains('sea')) selectedSiteId.set(null);
  }
</script>

<div class="map" bind:clientWidth={width} bind:clientHeight={height}>
  {#if width > 0 && height > 0}
    <!-- The svg is a plain canvas (no img role, so the markers stay reachable); a tap on open water closes the card. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <svg bind:this={svgEl} {width} {height} role="presentation" onclick={onMapClick}>
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
      </defs>

      <!-- ocean: static, full frame -->
      <rect class="sea sea-v" {width} {height} fill="url(#sea-v)" />
      <rect class="sea sea-r" {width} {height} fill="url(#sea-r)" />
      <rect class="sea sea-night" {width} {height} fill="url(#sea-night)" />

      <g transform={zoomT.toString()}>
        <path class="graticule" d={graticuleD} />
        <path class="tropics" d={tropicsD} />

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

        <g class="sites">
          {#each markers as m (m.site.id)}
            {@const selected = $selectedSiteId === m.site.id}
            <g
              class="site"
              class:selected
              class:off={!m.season}
              transform={`translate(${m.x},${m.y}) scale(${1 / zoomT.k})`}
              role="button"
              tabindex="0"
              aria-label={$tx(m.site.name)}
              onclick={() => select_(m.site.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select_(m.site.id);
                }
              }}
            >
              <circle class="hit" r="20" />
              <circle class="glow" r="10" />
              {#if m.sprite}
                <image
                  href={spriteUrl(m.sprite, 192)}
                  x="-22"
                  y="-22"
                  width="44"
                  height="44"
                  onerror={() => {
                    brokenSprites = new Set([...brokenSprites, m.sprite!]);
                  }}
                />
              {:else}
                <circle class="shadow" r="6.5" cy="1.2" />
                <circle class="ring" r={selected ? 7 : 5.5} />
                <circle class="dot" r={selected ? 5 : 4} />
              {/if}
              {#if selected || (showLabels && m.season)}
                <text class="label" x={m.sprite ? 0 : 11} y={m.sprite ? 34 : 4} text-anchor={m.sprite ? 'middle' : 'start'}>
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

  {#if geoStatus !== 'ready'}
    <div class="notice">
      {geoStatus === 'loading' ? $t('map.loading') : $t('map.noGeo')}
    </div>
  {/if}

  <div class="count" aria-live="polite">
    {markers.filter((m) => m.season).length} {$t('map.sitesShown')}
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
  .sea-1 { font-size: 18px; letter-spacing: 0.5em; fill-opacity: 0.5; }
  .sea-2 { font-size: 11.5px; letter-spacing: 0.3em; fill-opacity: 0.55; }
  .sea-3 { font-size: 9.5px; letter-spacing: 0.2em; fill-opacity: 0.55; }
  .sea-en { font-size: 8px; letter-spacing: 0.3em; fill-opacity: 0.4; }
  :global(:root[data-theme='night']) .sea-1 { fill-opacity: 0.45; }

  /* ---- sites ---- */
  .site {
    cursor: pointer;
    outline: none;
    transition: opacity 0.25s ease;
  }
  .site.off { opacity: 0.3; }
  :global(:root[data-theme='night']) .site.off { opacity: 0.4; }
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
