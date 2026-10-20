# Direction "Editorial atlas" — design spec

Renders: `map-1280.png` (1280×720 world view, zh) · `map-375.png` (375×640, the app's 1.9× Southeast-Asia start view, zh). Renderer: `render.mts` (`node --experimental-strip-types render.mts`). Three iterations; nothing under the project was touched.

## (a) Rationale

The baseline looked generic because every element was a library default: a flat single-colour ocean, a CSS-style glow around land, political borders, and sans labels with white outlines. A printed atlas spread gets its authority from the opposite choices — a deep, graded ocean that is lighter at the equator and darker at the edges, a stepped continental shelf instead of a blur, coastlines only, ocean names typeset in a tracked serif, and page furniture (a double-line frame with graticule ticks, a compass, a title block) that says a person laid this out. Everything is still code-drawn, Natural Earth CHN-POV, zero external requests, and the heavy pixels (gradients, vignette, grain) live outside the zoom group so a phone only re-rasterises strokes and text per frame.

## (b) Layer list (bottom → top), exact structure and values

Colours are given as hex and as the `src/app.css` token they replace or add.

| # | Layer | SVG | Values |
|---|---|---|---|
| 1 | Ocean, vertical | `<rect width height fill="url(#sea-v)">` — `<linearGradient id="sea-v" x1=0 y1=0 x2=0 y2=1>` | stops: `0%` `#0E2A47` `--ocean-deep` · `eq×0.45` `#124A6C` `--ocean-mid` (new) · `eq` `#19858F` `--ocean` (was `#1A9E9A`) · `eq+(1−eq)×0.55` `#124A6C` · `100%` `#0E2A47`; `eq` = on-screen y of the equator / height (clamped 0.15–0.85) |
| 2 | Ocean, radial | `<rect fill="url(#sea-r)">` — `<radialGradient id="sea-r" cx=.5 cy={eq} r=.7>` | `0` `#6FCBBE` `--ocean-shallow` @ 0.14 · `0.55` same @ 0 · `1` `#0E2A47` @ 0.35 |
| 3 | **zoom group** `<g transform={zoomT}>` | | |
| 3.1 | Graticule | `<path d={path(geoGraticule10())} class="graticule">` | `fill:none; stroke:#FBF8F1 (--paper); stroke-opacity:.12; stroke-width:.35px; stroke-dasharray:3 3; vector-effect:non-scaling-stroke` |
| 3.2 | Shelf | `<g class="shelf">` with four `<g>` each holding `<use href="#land-big">`/`<use href="#land-main">` (+ one `<use>` per unwrapped feature) | stroke `#6FCBBE` `--ocean-shallow`, `linejoin/linecap:round`, non-scaling: **28 px @ .05** and **16 px @ .10** on `#land-big` only; **8 px @ .20** and **3 px @ .34** on `#land-main` |
| 3.3 | Land | `<g class="land"><use href="#land-main"/><use href="#land-u0"/></g>` | `fill:#F3E6CB (--land, was #F3E3C3); stroke:#D8C49A (--land-edge, new); stroke-width:1px; stroke-opacity:.8; stroke-linejoin:round` — no per-continent tint, no borders |
| 3.4 | Sea names | `<g class="sea-names" font-family=var(--font-serif) fill=#FBF8F1 text-anchor=middle>` → per label `<g transform="translate(x,y) scale(k^-0.75) rotate(θ)"><text font-size letter-spacing dx=spacing/2 fill-opacity>` | tier 1 oceans 18 px / 0.5em / .50 · tier 2 seas 11.5 px / 0.3em / .55 · tier 3 9.5 px / 0.2em / .55, shown at k ≥ 1.8 (phone start view therefore shows oceans only). `dominant-baseline:central` (or `dy=.35em` for X5) |
| 3.5 | Markers | `<g transform="translate(x,y) scale(1/k)">` `<circle r=6.5 cy=1.2 fill=#0E2A47 opacity=.35/>` `<circle r=5.5 fill=#FBF8F1/>` `<circle r=4 fill=#F2795B (--coral)/>` `<text class="label">` | label: `font-family:var(--font-sans); font-size:10.5px; font-weight:500; fill:#13293D (--ink); paint-order:stroke; stroke:#FBF8F1; stroke-width:2.5px; stroke-opacity:.9; stroke-linejoin:round`; greedy placement over 8 candidates (below, right, left, above, 4 diagonals) avoiding other markers/labels |
| 4 | Vignette | `<rect fill="url(#vignette)">` — `<radialGradient cx=.5 cy=.5 r=.75>` | `0.6` `#0E2A47` @ 0 → `1` @ .38 |
| 5 | Paper grain | *in the app:* `<div class="grain">` over the svg, `background:url("data:image/svg+xml,…feTurbulence baseFrequency=.9 numOctaves=2 + feColorMatrix 0.6 0.6 0.6 0 −0.5 → alpha") 0 0/200px 200px repeat; opacity:.16; pointer-events:none` (the render uses the same filter as a full-frame `<rect>`) | luminance→alpha black speckle; darkens without relying on `mix-blend-mode` |
| 6 | Frame (desktop ≥ 600 px only) | two `<rect>` at inset 14 (0.6 px) and 18 (1.1 px), stroke `#FBF8F1` @ .38; 4 px ticks every 30° lon on top/bottom (x of the equator crossing) and 30° lat on left/right; labels `font-family:var(--font-serif); font-size:8.5px; letter-spacing:.06em; fill:#FBF8F1 @ .5`, ticks within 24 px of a corner skipped | |
| 7 | Title block (desktop) | `潜 图` 19 px / .38em @ .9 · `WORLD DIVE ATLAS · 世界潜点图` 8.5 px / .22em @ .55 · `NATURAL EARTH I · 150°E` 7.5 px @ .45, serif, bottom-left (x 40, y H−58…H−28) | optional; the app header already carries the name — keep as a poster credit or drop |
| 8 | Compass | `<g transform="translate(W−56, H−64)">` r 26 (phone: r 16 at (W−30, 34)); outer ring .7 px @ .8, inner ring r×.78 .4 px @ .5, N needle `M0,−1.08r L.17r,0 L0,.5r L−.17r,0 Z` @ .95, three short needles @ .45, centre dot r×.09 `#F2795B`, "N" serif 11 px | whole group `opacity:.72` |

Fonts (system only): `--font-serif: 'Songti SC','Noto Serif CJK SC',Georgia,'Times New Roman',serif` (new); `--font-sans` unchanged.

Land geometry: `mainland = topojson.merge(topo, geometries.filter(!UNWRAP_LIST))` → one MultiPolygon (coastlines only, shared borders vanish, 334 rings); `landBig = rings with geoArea ≥ 1e-4 sr (≈4 000 km²)` → 118 rings, used for the two wide shelf bands so atolls get a soft 8 px halo instead of a concentric target. Greenland stays on `unwrappedPath` exactly as today.

## (c) Outside vs inside the zoom group

Outside (static, full frame, painted once per resize): ocean gradients (1, 2), vignette (4), grain (5), frame/ticks (6), title (7), compass (8). They are screen-space furniture, and gradients + feTurbulence are the only expensive rasters — kept out so a zoom frame never touches them. The grain goes in an HTML `div` with a tiled data-URI background rather than an SVG `<rect filter>` because browsers (X5 included) rasterise a CSS background tile once and composite it, whereas an in-SVG filter can be re-evaluated on repaint.

Inside (geo-anchored, re-rasterised per zoom frame): graticule, shelf, land, sea names, markers. All are plain strokes/fills/text — cheap. Pixel-constant things use `vector-effect:non-scaling-stroke` (graticule, shelf, land edge) or `scale(1/k)` (markers) and sea names `scale(k^-0.75)` so they grow gently rather than balloon. The shelf references the land path through `<use>` so the 5 shelf/land layers share one path string (SVG dropped from 1.4 MB to 330 KB in the render).

## (d) New data

`data/labels.json` — 25 ocean/sea names, `{ id, zh, en, at:[lon,lat], tier, along?:[[lon,lat],[lon,lat]] }` (`along` only for 红海, gives the rotation). ≈ 2.4 KB raw, ≈ 1.1 KB gzip. Anchors are hand-chosen in open water at world view; the renderer samples each label's box against land with `geoContains` and warns on a bad anchor, so re-run it when adding names. Current list and anchors are in `render.mts` → `LABELS`. Nothing else changes: `countries.topo.json` stays at 160 KB.

## (e) Implementation plan (no edits made)

`src/components/MapView.svelte`
- L5 `import { feature, mesh }` → `import { feature, merge }`; add `geoGraticule10, geoArea, geoContains` is **not** needed at runtime (anchors are pre-validated) — only `geoGraticule10` from `d3-geo`.
- L16 `SHOW_BORDERS = true` → delete the constant; drop `borders` state L31, `borderPath` L45, `mesh(...)` L91, the `{#if borderPath}` block L189–191 and `.borders` style L281–288 (coastlines only).
- L17 `LABEL_ZOOM = 2.5` keep; add `SEA_TIER3_ZOOM = 1.8`, `SMALL_SR = 1e-4`.
- L29–30 add `let landMain: Geometry | null`, `let landBig: Geometry | null`; L84–96 `loadGeo()` compute `landMain = merge(topo, obj.geometries.filter(g => !UNWRAP_LIST.has(g.properties.ADM0_A3)))`, `landBig = { type:'MultiPolygon', coordinates: landMain.coordinates.filter(c => min(geoArea(c), 4π−geoArea(c)) ≥ SMALL_SR) }`; keep `unwrappedLand` as is.
- L38–44 replace `landPaths` with `$derived` `mainPath`, `bigPath`, `graticulePath = proj.path(geoGraticule10())`; keep `unwrappedPaths`.
- L74–78 delete `landFill` (single `var(--land)`).
- Add `import labels from '../../data/labels.json'` via `src/lib/data.ts` (same pattern as sites); `$derived` `seaNames = labels.filter(l => l.tier < 3 || zoomT.k >= SEA_TIER3_ZOOM).map(l => ({ l, p: proj.projection(l.at), rot }))`.
- L158–164 `<defs>`: replace `ocean-grad` with `sea-v`, `sea-r`, `vignette` from table rows 1/2/4 (`eq` = `(zoomT.applyY(proj.projection([150,0])[1]))/height`, update only on `zoom.end` to keep it static); add `<path id="land-main" d={mainPath}/>`, `<path id="land-big" d={bigPath}/>`, `<path id="land-u{i}">` per unwrapped feature.
- L166–167 `<rect class="ocean" fill=var(--ocean)>` + grad rect → two rects `fill="url(#sea-v)"` and `fill="url(#sea-r)"`.
- L169 after the zoom `<g>` opens: `<path class="graticule" d={graticulePath}/>`.
- L170–178 `.halo` groups → `<g class="shelf"><g class="s28"><use href="#land-big"/>…</g><g class="s16">…</g><g class="s8"><use href="#land-main"/>…</g><g class="s3">…</g></g>` (each with the unwrapped `<use>`s).
- L180–187 `.land` → `<g class="land"><use href="#land-main"/>{#each unwrapped}<use href="#land-u{i}"/>{/each}</g>`.
- Before L193 `.sites`: `<g class="sea-names">{#each seaNames}<g transform="translate(x,y) scale({zoomT.k ** -0.75}) rotate(rot)"><text class="tier{l.tier}">{$tx(l)}</text></g>{/each}</g>`.
- L211–221 marker: replace `.dot` circle with shadow/ring/disc trio (row 3.5); L223 label stays, restyled.
- After the zoom `</g>` (before L229 `</svg>`): `<rect fill="url(#vignette)" pointer-events="none"/>`, `{#if width >= 600}` frame + ticks + title `{/if}`, compass.
- L231 after `</svg>`: `<div class="grain" aria-hidden="true"></div>`.
- `<style>` L243+: delete `.halo*`, `.borders`; add `.graticule`, `.shelf g { fill:none; stroke:var(--ocean-shallow); stroke-linejoin:round; stroke-linecap:round } .shelf use { vector-effect:non-scaling-stroke } .s28{stroke-width:28;stroke-opacity:.05} .s16{16;.10} .s8{8;.20} .s3{3;.34}`; `.land use { fill:var(--land); stroke:var(--land-edge); stroke-width:1; stroke-opacity:.8; vector-effect:non-scaling-stroke }`; `.sea-names text { font-family:var(--font-serif); fill:var(--paper); text-anchor:middle; dominant-baseline:central; pointer-events:none } .tier1{font-size:18px;letter-spacing:.5em;fill-opacity:.5} .tier2{11.5px;.3em;.55} .tier3{9.5px;.2em;.55}`; L316–322 `.label` → `font-size:10.5px; font-weight:500; stroke-width:2.5px; stroke-opacity:.9`; `.grain { position:absolute; inset:0; pointer-events:none; opacity:.16; background:url("data:image/svg+xml,…") 0 0/200px 200px }`; `.frame`, `.compass` per table; `@media (prefers-reduced-motion)` already covers transitions.
- L244 `.map { background: var(--ocean) }` → `var(--ocean-deep)` (edges are deep now, avoids a teal flash before the svg paints).

`src/app.css`
- L4 `--ocean: #1a9e9a` → `#19858f`; L5 `--ocean-shallow: #7fd4c8` → `#6fcbbe`; L7 `--land: #f3e3c3` → `#f3e6cb`; L8 `--land-2` → remove (unused after single-tone land) or keep for cards.
- After L3 add `--ocean-mid: #124a6c;` and after L8 add `--land-edge: #d8c49a;`.
- After L20 `--font-sans` add `--font-serif: 'Songti SC', 'Noto Serif CJK SC', Georgia, 'Times New Roman', serif;`.
- L29–40 night theme: add `--ocean-mid: #0b1f35; --land-edge: #3a5673; --ocean-shallow: #2a6a85` stays; retune shelf opacities ×0.7 under `[data-theme='night']` in MapView.
- L52 `body { background: var(--ocean) }` → `var(--ocean-deep)`.

`docs/SPEC.md` §5.2 table: add the two tokens and the new values; §5.4 replace "两层光晕" with the 4-step shelf; §3.1 row "大洲 / 海域标签" now has its data file.

Added download: labels.json ≈ 2.4 KB (1.1 KB gz) + MapView markup/CSS ≈ 3 KB (1.2 KB gz) + `geoGraticule10`/`merge` tree-shaken from deps already installed ≈ 2.5 KB (1 KB gz) + grain data-URI 0.4 KB ≈ **+8 KB raw / +4 KB gzip**. Base map unchanged (160 KB).

## (f) Risks

- **Low-end Android / WeChat X5.** Per zoom frame the GPU rasterises ~12 path draws of the merged world outline (graticule + 4 shelf strokes + land) with non-scaling strokes up to 28 px, plus ≤ 25 texts and the markers. That is the same order as today's two halos but twice the stroke count. If it stutters: drop the 28/16 px bands while a gesture is active (toggle a `.zooming` class on `zoom.start`/`end`), or skip them when `width < 600`. `<use>` + `vector-effect` on `<use>` descendants is fine on Chromium ≥ 57 (X5 is 57–86); put `vector-effect` on the `<path>` in `<defs>` to be safe. Replace `dominant-baseline:central` with `dy=".35em"` — X5 ignores it on some builds. The gradients/vignette/grain are static; the grain must stay in a CSS tile, not an in-SVG `feTurbulence` (which X5 re-evaluates on repaint).
- **Legibility.** Sea names at 0.5–0.55 opacity on the teal equatorial band sit at roughly 2.3:1 contrast — intentional (they are decoration) but they will disappear on a dim phone outdoors; site labels (ink on cream halo) and coral discs are unaffected. At the 1.9× phone start view only oceans fit; sea names arrive at 1.8× only where they clear land and markers — which is what the render does and what `labels.json` anchors guarantee. Site labels are shown in the render where they fit; in the app they still appear only at `LABEL_ZOOM` or on selection, so the phone view will show discs only — acceptable, discs are 11 px with a cream ring and a shadow.
- **Fonts on Android.** `Songti SC` exists only on Apple devices. Most Android/WeChat installs have no serif CJK face, so ocean names fall back to the sans (Droid Sans Fallback / MiSans) and the "typeset" effect is lost there — the layout still works. If that matters, SPEC §5.3 already allows one subset display font ≤ 60 KB: the ~70 glyphs used by `labels.json` + the title in a Source Han Serif subset is ≈ 20–30 KB WOFF2, bundled, zero external requests.
- **Palette drift from SPEC §5.2.** `--ocean` moves from `#1A9E9A` to `#19858F` (darker, less saturated) and the *perceived* background is now `--ocean-deep`-dominated at the edges; "日潜主题：--ocean 系为背景" no longer describes the day theme exactly. The "柔和但饱满" keyword is met only in the equatorial band. Future species stickers drawn for a teal background will sit on indigo near the poles — the illustration guide should state the background range (`#0E2A47 → #19858F`). The night theme needs its own pass (land edge, shelf opacity), not a token swap alone.
- **Frame ticks are decorative.** Natural Earth I meridians curve, so a top-edge tick at a meridian's equator crossing does not line up with that meridian at the top edge; atlases do this too, but a purist will notice. Latitude ticks are exact.
- **Label anchors are hand-placed and validated only by the renderer** (`geoContains` sampling at the two reference views). Adding a name without re-running `render.mts` can put it on land at some zoom. The app does no runtime collision test — tier gating + anchors are the whole mechanism.
- **Rasteriser note.** `sharp … { density: 192 }` is 2.67× (SVG DPI base is 72), so the PNGs are 3413×1920 and 1000×1707, not 2×; harmless for review, use 144 for exact 2×.
