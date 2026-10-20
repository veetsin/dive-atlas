# Night dive — design direction spec

Renders: `map-1280.png` (world, night, zh), `map-375.png` (375×640, 1.9× on [118, 8], night, zh), `map-1280-day.png` (same structure, day palette).
Renderer: `render.mts` (`node --experimental-strip-types render.mts`), reuses `src/lib/projection.ts` unchanged. Sea names: `labels.json`.

## (a) Rationale

Divers already know this image: the surface seen from below at night, where the only light is the shallow water glowing around the reef — so the map puts the ocean in deep navy and lets three luminous seafoam bands radiate from every coastline, which is also the honest cartographic cue (shallow = bright) rather than a CSS glow. Land is a single muted slate with no stroke, no borders and a 4 % top-left light, so the continents become quiet shapes and the coral site markers are the only warm thing on the page. A faint 30° graticule, dashed tropics, letter-spaced Songti ocean names and a static sprinkling of 1 px "plankton" and paper grain are what make it read as a typeset poster instead of a map library default — none of them cost a filter inside the zoom group.

## (b) Layers, in paint order

Token names refer to `src/app.css`; `(new)` = token to add. Values are night / day.

| # | Layer | SVG | Values |
|---|---|---|---|
| L0 | Ocean | `<rect width height fill="url(#ocean)">` — `<radialGradient id="ocean" cx="46%" cy="44%" r="72%">` | stop 0 `var(--ocean)` `#123A5C` / `#1A9E9A` → stop 1 `var(--ocean-edge)` (new) `#0E2A47` / `#15807F` |
| — | **zoom group** `<g transform={zoomT}>` opens | | |
| L1 | Graticule 30° | `<path class="graticule" d={proj.path(geoGraticule().extent([[-180,-60],[180,85]]).step([30,30])())}>` | `stroke: var(--map-line)` (new) `#9ED9C9` / `#FBF8F1`, opacity `.08` / `.12`, width `.75`, `vector-effect: non-scaling-stroke` |
| L1b | Tropics ±23.436° | `<path class="tropics">` MultiLineString, 181 points per parallel | same colour, opacity `.16` / `.24`, `stroke-dasharray 3 5` |
| L2 | Shallow rings (under land), widest first | `<use href="#coast" class="ring ring-far">` / `ring-mid` / `ring-near` | far `var(--ring-far)` (new) `#2A6A85` / `#5FBFB6`, width 20, opacity .18 · mid `var(--ring-mid)` (new) `#397C97` / `#7FD4C8`, width 10, opacity .45 · near `var(--ring-near)` (new) `#4A8FA6` / `#9ED9C9`, width 4, opacity .9 · `stroke-linejoin/linecap: round`, `fill: none` |
| L3 | Land (one merged path + Greenland unwrapped), no stroke, no borders | `<use href="#coast" class="land">` with `fill="url(#land)"` — `<linearGradient id="land" gradientUnits="userSpaceOnUse" x1=0 y1=0 x2={width} y2={height}>` | stop 0 `var(--land-hi)` (new) `#3D5B77` / `#F7EAD0` → stop 1 `var(--land-2)` (re-valued) `#33506A` / `#EEDCB9`; flat fallback `var(--land)` `#36526D` / `#F3E3C3` |
| L4 | Sea names | `<g transform="translate(x,y) scale(1/k)"><text class="sea sea-1">太平洋</text><text class="sea-en" y="16">PACIFIC OCEAN</text></g>` | `font-family: var(--font-serif)` (new) `'Songti SC','STSong','Noto Serif CJK SC',Georgia,'Times New Roman',serif`; fill `var(--map-line)` at `.45` / `.62`; tier 1: 16 px, `letter-spacing .5em`, Latin line 8 px caps `.3em` at 80 % of that opacity; tier 2: 11.5 px, `.38em`, shown only when `k·pxPerDeg ≥ 3` (≈ 1280 px world view and up); `dx = letter-spacing/2` keeps the word optically centred; `pointer-events: none` |
| L5a | Site glow rings (all of them, under all discs) | `<g class="glow"><circle transform="translate(x,y) scale(1/k)" r="10">` | `stroke: var(--coral) #F2795B`, width 6, opacity .25, `fill: none`, `pointer-events: none` |
| L5b | Site discs + labels | existing `.site` group: `<circle class="dot" r="5.5">` + `<text class="label">` | disc `fill: var(--coral)`, `stroke: var(--shell)` 2 px (`#F9A68B` lighter coral; current `#F2B5A7` acceptable); label `PingFang SC` 12 px / 600, `fill: var(--ink)` `#FBF8F1` / `#13293D`, `paint-order: stroke`, `stroke: var(--paper)` `#13293D` / `#FBF8F1` 3 px round, opacity .92; label sits right of the disc (x = 11, baseline +4.2), falling back to left / below / above when it collides |
| — | **zoom group** closes | | |
| L6 | Speckle (static) | `<g class="speckle">` 120 `<circle r=".8|1.3">` at seeded positions (mulberry32(2026), re-seeded per width×height) | `fill: var(--map-line)`, opacity `.25` / `.18`, `pointer-events: none` |
| L7 | Grain (static) | `<rect width height fill="url(#grain)" fill-opacity=".04">` — `<pattern id="grain" width=96 height=96 patternUnits="userSpaceOnUse">` with 260 1×1 rects (mulberry32(7)) | rect fill `var(--ink)`; `pointer-events: none` |

`<defs>` also holds `<g id="coast"><path d={landD} vector-effect="non-scaling-stroke"/><path d={grlD} vector-effect="non-scaling-stroke"/></g>` where `landD = proj.path(merge(topo, countries − GRL))` and `grlD = proj.unwrappedPath(merge(topo, GRL))`. `vector-effect` is not inherited, so it must sit on those two paths, not on the `<use>` elements. `stroke`, `stroke-width`, `fill` are inherited from each `<use>`.

Borders: off (`SHOW_BORDERS = false`; the merged coastline has none anyway). Continent tint (`landFill()`): removed — the Russia/China seam read as a political highlight.

## (c) Inside vs outside the zoom group

- **Outside (static, full-frame, painted once):** L0 ocean gradient, L6 speckle, L7 grain. They are what the brief would have done with `feTurbulence`/`feGaussianBlur`; as a gradient rect, 120 tiny circles and one pattern-filled rect they cost one raster each and are never re-rasterised while panning. Both overlays carry `pointer-events="none"` so the zoom behaviour on the `<svg>` still receives every drag. Consequence: specks and grain do not move with the map (correct for a "paper" effect; specks on land after a pan are 0.8 px at 25 % — invisible in practice).
- **Inside:** graticule, tropics, rings, land, sea names, markers — everything that must stay registered to geography. Ring widths are constant-pixel via `vector-effect`, so they look the same at 1× and 8×; text and markers counter-scale with `scale(1/k)` exactly as the existing markers do. No `filter` anywhere in this group (the current `.dot { filter: drop-shadow }` goes; the glow ring replaces it).
- Why the merge matters here: today the zoom group holds 245 land paths + 2×245 halo paths. After `topojson.merge` it holds one coast group referenced four times (3 strokes + 1 fill) — ~137 KB of path data instead of ~3×220 KB of attribute strings, shared borders are no longer stroked under the land, and the per-frame re-raster is 4 paint ops over one geometry.

## (d) New data

`data/labels.json` — 13 sea/ocean names, `{ id, tier (1|2), name: {zh, en}, anchor: [lon, lat] }` (see `labels.json` here). **1,452 B raw, 495 B gzip.** Anchors are hand-placed in open water for the 150°E projection (Atlantic at [-38, -45] is the only anchor that clears Argentina and the 30°W cut at 1280 px); 南海/红海/孟加拉湾 exist in the file but are dropped by the placement test on the world view and appear on zoom. Add to `scripts/validate-data.mjs`: tier ∈ {1,2}, anchor in range, zh+en non-empty, anchor not inside the merged land polygon.

No other bytes: no fonts, no images, base map unchanged (160 KB of the 250 KB budget). JS: `merge` (topojson-client, already a dependency) + `geoGraticule` (d3-geo, already a dependency) + ~60 lines (PRNG, speckle/grain generation, sea-label gating, greedy label placement) ≈ **+5 KB minified, ~2 KB gzip**. DOM node count: ~735 paths today → 2 paths + 4 `<use>` + 2 graticule paths + ≤ 13 labels + 120 circles + 260 pattern rects.

## (e) Implementation plan (no edits made)

`src/app.css`
- L2–L26 `:root`: becomes the **night** set (default): `--ocean-deep #0E2A47; --ocean #123A5C; --ocean-edge #0E2A47; --ocean-shallow #2A6A85; --seafoam #4A8FA6; --ring-near #4A8FA6; --ring-mid #397C97; --ring-far #2A6A85; --land-hi #3D5B77; --land #36526D; --land-2 #33506A; --map-line #9ED9C9; --shell #F9A68B; --ink #FBF8F1; --ink-soft rgba(251,248,241,.65); --paper #13293D; --paper-2 #1B3550; --line rgba(251,248,241,.14)`; add `--font-serif: 'Songti SC','STSong','Noto Serif CJK SC',Georgia,'Times New Roman',serif`.
- L29–L40 `:root[data-theme='night']` → rename to `:root[data-theme='day']` with: `--ocean #1A9E9A; --ocean-edge #15807F; --ocean-shallow #7FD4C8; --seafoam #9ED9C9; --ring-near #9ED9C9; --ring-mid #7FD4C8; --ring-far #5FBFB6; --land-hi #F7EAD0; --land #F3E3C3; --land-2 #EEDCB9; --map-line #FBF8F1; --ink #13293D; --ink-soft rgba(19,41,61,.62); --paper #FBF8F1; --paper-2 #F2EDE2; --line rgba(19,41,61,.12)`.
- `index.html:7` `theme-color` → `#0E2A47`.

`src/components/MapView.svelte`
- L3–L5: `import { geoGraticule } from 'd3-geo'`; `import { feature, merge } from 'topojson-client'` (drop `mesh`). L7: add `MultiPolygon` to the geojson types.
- L16: `SHOW_BORDERS` and its uses (L31, L45, L91, L189–L191, L281–L288) → delete.
- L17: keep `LABEL_ZOOM = 2.5` for v1 (see risk 3).
- L29–L31: replace `land`, `unwrappedLand`, `borders` with `landGeom: MultiPolygon | null` and `grlGeom: MultiPolygon | null` (`$state(null)`).
- L39–L45: replace `landPaths/unwrappedPaths/borderPath` with `landD = $derived(proj && landGeom ? proj.path(landGeom) ?? '' : '')`, `grlD` via `proj.unwrappedPath(grlGeom)`, `graticuleD`, `tropicsD` (graticule and tropic geometries built once at module scope).
- after L49: `seaLabels = $derived(...)` from `import labels from '../../data/labels.json'` (route through `src/lib/data.ts` like the other JSON): project each anchor, keep tier 1 always and tier 2 when `zoomT.k * pxPerDeg >= 3` (`pxPerDeg = proj.projection.scale() * 0.8707 * Math.PI / 180`).
- L74–L78: delete `landFill()`.
- L87–L91 (`loadGeo`): `const g = obj.geometries; landGeom = merge(topo, g.filter(x => !UNWRAP_LIST.has(x.properties!.ADM0_A3))); grlGeom = merge(topo, g.filter(x => UNWRAP_LIST.has(x.properties!.ADM0_A3)));`.
- L158–L164 `<defs>`: replace `#ocean-grad` with `#ocean` radial (cx 46 % cy 44 % r 72 %, `var(--ocean)` → `var(--ocean-edge)`); add `#land` linear (userSpaceOnUse 0,0 → width,height; `var(--land-hi)` → `var(--land-2)`); add `#grain` pattern; add `<g id="coast">` with the two paths carrying `vector-effect="non-scaling-stroke"`.
- L166–L167: one `<rect {width} {height} fill="url(#ocean)"/>`.
- L170–L178 (halo groups): replace with `<path class="graticule" d={graticuleD}/>`, `<path class="tropics" d={tropicsD} stroke-dasharray="{3/zoomT.k} {5/zoomT.k}"/>`, then `<use href="#coast" class="ring ring-far"/>`, `… ring-mid`, `… ring-near`.
- L180–L187 (land): `<use href="#coast" class="land"/>`.
- after L187: `<g class="seas">{#each seaLabels as l (l.id)}<g transform="translate({l.x},{l.y}) scale({1/zoomT.k})"><text class="sea sea-{l.tier}">{$tx(l.name)}</text>{#if l.tier === 1 && $lang === 'zh'}<text class="sea-en" y="16">{l.name.en.toUpperCase()}</text>{/if}</g>{/each}</g>` (zh shows the Latin caption underneath; en shows one line).
- L193: before `<g class="sites">` add `<g class="glow" pointer-events="none">{#each markers as m (m.site.id)}<circle transform="translate({m.x},{m.y}) scale({1/zoomT.k})" r="10"/>{/each}</g>`.
- L220: `.dot` stroke → `var(--shell)`; L304: delete the `filter: drop-shadow` line.
- L222–L224: label offset right of the disc (`x="11" y="4.2" text-anchor="start"`) as the default position; keep "below" for sprite markers.
- after L228 (closing `</g>` of the zoom group), before `</svg>`: `<g class="speckle" pointer-events="none">{#each speckle as s}<circle cx={s.x} cy={s.y} r={s.r}/>{/each}</g><rect {width} {height} fill="url(#grain)" fill-opacity="0.04" pointer-events="none"/>` where `speckle = $derived(seeded(width, height))` (mulberry32(2026), 120 points).
- L260–L288 styles: replace `.halo*`, `.land path`, `.borders` with `.ring`, `.ring-far/-mid/-near`, `.land`, `.graticule`, `.tropics`, `.sea`, `.sea-1`, `.sea-2`, `.sea-en`, `.glow circle`, `.speckle circle` using the values in (b). `.label` (L315–L325) keeps `paint-order: stroke`; `stroke-opacity: .92`.
- L295–L297: `.site.off { opacity: .22 }` → `.4` (0.22 coral on navy disappears).

`docs/SPEC.md`: §3.1 ocean row → radial gradient; add rows "经纬网 + 回归线" and "海域名 (`data/labels.json`)"; §4.5 default borders off, land merged; §5.2 add the new tokens and night-as-default; §5.4 replace the two-stroke halo with the three rings on the merged coast and the static speckle/grain.

`scripts/preview-map.mts`: port the merged coast + rings so the project preview matches the app (or point it at this renderer's structure).

## (f) Risks

1. **Low-end Android / WeChat X5.** Three round-joined strokes of a ~60 k-vertex path at 20/10/4 px are re-rasterised every zoom frame. Total vertex work is no higher than today's 2×245 halo paths (shared borders are gone), but wide round strokes are Skia's most expensive primitive. Must be measured on a Redmi-class phone in WeChat; the escape hatch is a `zooming` class that hides `.ring-far` during the gesture (d3-zoom `start`/`end`). `<use>` + `vector-effect` + `paint-order` need Chromium ≥ 50 / iOS 12 — old X5 kernels (< 57, 2019) are a risk; verify, and fall back to four `<path>` elements sharing the same `d` string if `<use>` misbehaves. Do not add `color-mix()` (Chromium 111) in SVG paint.
2. **Legibility.** Land/ocean contrast is intentionally low (≈ 1.6:1 between `#36526D` and `#123A5C`); the coast is read from the rings, not the fill. Check on a dim AMOLED outdoors; if it fades, lift `--land` to `#3B5873`, not the rings. Sea names at 45 % opacity are decoration and must never carry information. Site labels (paper on navy halo) are > 12:1. Off-season markers at `opacity .22` vanish on navy → `.4` or a desaturated disc.
3. **375 start view pile-up.** Five Coral Triangle sites fall within 20 px at 1.9×; 5 of the 9 visible labels are dropped and the discs overlap. Styling cannot fix this; it needs the region cluster bubble (SPEC §11) or a start view of ~2.6× on [120, 4]. With 60–80 sites in v1, the 1280 world view will also need the greedy label placement that `render.mts` does (or stay gated at `LABEL_ZOOM`) — the render shows all 14 labels only because 14 is few.
4. **Palette drift from SPEC §5.2.** Night as default re-points `--ocean`/`--seafoam`/`--land` (already the case in the existing night block). New values outside §5.2: `#397C97`, `#3D5B77`, `#33506A` (night), `#15807F`, `#5FBFB6`, `#F7EAD0`, `#EEDCB9` (day), `#F9A68B` (disc ring). The brief's `#2C4660` land was lifted ~4 % to `#36526D` for phone contrast. `--land-2` loses its "second continent tint" meaning. §5.2 must be updated, otherwise the next person "fixes" the tokens back.
5. **Serif fallback.** `Songti SC` is iOS/macOS only; most Chinese Android ROMs ship no CJK serif, so ocean names fall to the system sans (letter-spacing still applies). Acceptable because they are decoration, but the "typeset" effect is weaker on Android. If it matters, subset a CJK serif to the ~25 glyphs in `labels.json` (≈ 8 KB WOFF2, bundled, zero external requests, within §5.3's 60 KB).
6. **Atoll "donuts".** The 4 px ring around 2 px islets yields a bright ring with a dark centre. It reads as reef/lagoon and I kept it; some viewers will read the Pacific specks as noise. Dropping `ring-near` to 3 px / .8 is the tuning knob.
7. **`merge` discards per-country identity.** Nothing in SPEC §6 needs it; the CHN-POV source is unchanged; `countries-detail.topo.json` (v1.5) must be merged the same way or the detail swap will flash.
