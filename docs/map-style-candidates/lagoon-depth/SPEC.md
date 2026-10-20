# Direction "Lagoon depth" — design spec

Renders: `map-1280.png` (world, zh), `map-375.png` (375×640, 1.9× on [118, 8], zh). Source: `render.mts` (`node --experimental-strip-types render.mts`). Three iterations; see "Iteration log" at the end.

## (a) Rationale

The current map fails because the ocean is one flat teal with a CSS glow around the land, so nothing in the picture says *water* — it says "map library default". This direction keeps the SPEC §5.2 palette but makes the sea read as depth: a slightly deeper base ocean that darkens toward the frame, five fully-opaque stepped shelves hugging every coast (crisp near land, soft further out), a scatter of tiny wave glyphs, and letter-spaced bilingual ocean names set like a printed atlas. Land becomes a single warm cream with a one-pixel fake light from the upper left, no outlines, no borders — the restraint is what makes it look designed rather than generated.

## (b) Layer list (bottom → top), exact structure and values

Tokens: hex → CSS custom property in `src/app.css`. `(new)` = token to add. Pixel values are screen px at the 1280 world view; inside the zoom group they are divided by `k` (or use `vector-effect: non-scaling-stroke`).

```
<svg>
  <defs>
    <path id="coast-lg" d="…"/>                       polygons ≥ 5e-4 sr (≈ 20 000 km²)
    <path id="coast-sm" d="…"/>                       polygons < 5e-4 sr (atolls, small islands)
    <g id="coast"><use href="#coast-lg"/><use href="#coast-sm"/></g>
    <clipPath id="landclip"><use href="#coast-lg"/><use href="#coast-sm"/></clipPath>
    <radialGradient id="depth" cx="50%" cy="46%" r="75%">
      0 → 0.55  #15807F  --ocean-base (new)
      1         #0F5F6B  --ocean-abyss (new)
    </radialGradient>
    <g id="wave" fill="none" stroke="#9ED9C9 --seafoam" stroke-opacity=".35" stroke-width="1" stroke-linecap="round">
      <path d="M-5 -2.4q2.5-2.2 5 0t5 0"/><path d="M-3.5 0.2q1.75-2 3.5 0t3.5 0"/><path d="M-2 2.8q1-1.6 2 0t2 0"/>
    </g>                                              10 × 6 px, three strokes
    <filter id="grain"> feTurbulence fractalNoise baseFrequency=.9 numOctaves=2 → feColorMatrix saturate 0 </filter>
  </defs>

  L0  <rect fill="url(#depth)"/>                      full frame, OUTSIDE zoom group

  <g transform={zoom}>
  L1  shelf bands, widest first, each opaque, stroke-linejoin/linecap round, fill none:
        30 px  #1B8C8A  --shelf-4 (new)   on #coast-lg only
        18 px  #1A9E9A  --ocean           on #coast-lg only
        10 px  #3FB4AC  --shelf-2 (new)   on #coast
         5 px  #62C7BC  --shelf-1 (new)   on #coast
         2 px  #7FD4C8  --ocean-shallow   on #coast
      Width rule: screen px = base × clamp(worldScale × k, 0.6, 1.6), where worldScale =
      projection.scale() / scale at 1280×720 (375 wide → 0.28 → clamped to 0.6 at k = 1.9).
      Shelves are geography, so they grow with zoom, but never below 0.6× (phone) or above 1.6× (8×).
  L2  wave glyphs: <use href="#wave" transform="translate(x,y) scale(v/k)"/>, v ∈ {.85, 1.1, .95, 1.2}
        42 hand-placed [lon, lat] anchors, asserted ≥ 8° from every coastline vertex and not on land
        + off-globe filler: jittered 120-px grid over the visible map rect, keeping only points whose
          projection.invert() round-trip fails or lands outside lat −60…85 (i.e. off the globe)
  L3  land, three copies of #coast, no stroke:
        <use fill="#D9C193 --land-shade (new)" transform="translate(0, 1/k)"/>        1-px drop under S edges
        <use fill="#FFF7E6 --land-light (new)"/>                                      highlight base
        <use fill="#F3E3C3 --land" transform="translate(.8/k, .8/k)" clip-path="url(#landclip)"/>
                                                    → 0.8-px lighter rim along NW edges only
  L4  ocean names, counter-scaled <g transform="translate(x,y) scale(1/k)">, text-anchor middle,
      font-family system CJK sans, weight 500, fill #9ED9C9 --seafoam:
        rank 1 (oceans): zh 15 px letter-spacing 7.5 dx 3.75 opacity .60
                         + en UPPERCASE 8.5 px letter-spacing 1.8 dx .9 y 14 opacity .45 (small-caps emulation)
        rank 2 (major seas): zh 11 px letter-spacing 3.3 dx 1.65 opacity .60
        rank 3 (small seas): same as rank 2, shown only at k ≥ 2.5
      A sea name that collides with a marker or dive-site label is dropped (site labels win).
  L5  markers, counter-scaled <g transform="translate(x,y) scale(1/k)">:
        <circle r="7.5" cy="1.2" fill="#B9472E --coral-deep (new)" fill-opacity=".35"/>   shadow
        <circle r="7.5" fill="#FBF8F1 --paper" stroke="#B9472E --coral-deep" stroke-width="1"/>  cream ring + outline
        <circle r="4.8" fill="#F2795B --coral"/>                                            coral disc
        <text class="lbl"> 11 px, weight 600, fill #13293D --ink, paint-order stroke,
              stroke #FBF8F1 --paper, stroke-opacity .78, stroke-width 3, linejoin round
              placed greedily: below (0,+21) → above (0,−13) → right (+12,+4) → left (−12,+4) → dropped
  </g>

  L6  <rect filter="url(#grain)" opacity=".05" pointer-events="none"/>   full frame, OUTSIDE zoom group
</svg>
```

No frame. Borders off (`SHOW_BORDERS = false`). Per-continent land tint (`--land-2`) dropped: one cream reads as a poster, two reads as a political map.

## (c) Inside vs outside the zoom group

| Outside (static, painted once per resize) | Inside (re-rasterised every zoom frame) |
|---|---|
| L0 base gradient — frame-relative vignette, must not pan | L1 shelves — they are geography, must move with the coast |
| L6 grain — the only filter in the scene; a static overlay costs one raster per resize, inside the group it would re-run `feTurbulence` on every frame | L2 waves — decorative but anchored to sea positions, so they pan |
| | L3 land, L4 names, L5 markers — map content |

Everything inside the group is plain fills and strokes; the one `clip-path` (L3) is a single complex path clip, no blur or turbulence. All text and markers counter-scale with `scale(1/k)` as `MapView.svelte` already does for markers.

## (d) New data

- `data/labels.json` — 14 sea/ocean names `{ id, name: {zh, en}, at: [lon, lat], rank }` ≈ **1.2 KB** (gzip ≈ 0.5 KB). Entries and anchors are the `LABELS` array in `render.mts`.
- Wave anchors — 42 `[lon, lat]` pairs ≈ **0.5 KB**, as `decor.waves` in the same file or a const in `src/lib/decor.ts`. The ≥ 8° coast check belongs in `scripts/validate-data.mjs`, not at runtime.
- No new geometry. `public/geo/countries.topo.json` unchanged (160 KB of the 250 KB budget); the small/large split is computed at load with `geoArea` per polygon (516 polygons, 327 small).
- Optional: replace `feTurbulence` with a pre-baked 96×96 greyscale noise PNG tiled via CSS `::after` ≈ **4–6 KB** as data URI.

Added bytes overall ≈ 5 KB (≈ 10 KB with the noise tile), gzip ≈ 2–3 KB; first load stays far under 2 MB.

## (e) Implementation plan (no edits made)

`src/components/MapView.svelte`
- L4 / L9: also import `geoArea` from `d3-geo`; import `labels.json` + wave anchors through `src/lib/data.ts` (components do not fetch).
- L16: `SHOW_BORDERS = false`.
- L17: keep `LABEL_ZOOM = 2.5`; reuse it as the rank-3 sea-name threshold.
- L29–31: after `land`/`unwrappedLand`, derive `shelfPolys: { d: string; small: boolean }[]` by splitting each feature's MultiPolygon into polygons and flagging `min(geoArea, 4π − geoArea) < 5e-4`; Greenland polygons go through `proj.unwrappedPath`.
- L39–45: `landPaths`/`unwrappedPaths` stay for the land fills; add `coastAllD` (every polygon) and `coastLgD` (large only) joined `d` strings so the five band `<path>`s are five elements, not 5 × 516.
- L52–70: add a `$derived` `shelfScale = clamp(worldScale * zoomT.k, 0.6, 1.6)` where `worldScale = proj.projection.scale() / createMapProjection(1280, 720).projection.scale()`; add `fillerWaves` derived from `zoomT` (120-px grid over the visible rect, keep off-globe points via `projection.invert` round-trip).
- L74–78: delete `landFill()` (single cream).
- L158–164 `<defs>`: replace `#ocean-grad` with the `#depth` radialGradient; add `<clipPath id="landclip">` wrapping the land paths, the `#wave` symbol, and the `#grain` filter (or drop the filter in favour of the CSS tile, see risks).
- L166–167: one `<rect fill="url(#depth)"/>`.
- L170–178: replace the two `.halo` groups with five `<path class="shelf shelf-4|3|2|1|0">` using `coastLgD` for the two widest and `coastAllD` for the rest; `style:stroke-width={base * shelfScale}` with `vector-effect: non-scaling-stroke`.
- new after L178: `<g class="waves">` — `{#each waves}` `<use href="#wave" transform="translate(x,y) scale(v/zoomT.k)">`.
- L180–187: render the land three times: `.land-shade` with `transform="translate(0,{1/zoomT.k})"`, `.land-light`, `.land-main` with `transform="translate({.8/zoomT.k},{.8/zoomT.k})" clip-path="url(#landclip)"`.
- L189–191: remove the borders block.
- new before L193: `<g class="sea-names">` — rank ≤ 2 always, rank 3 when `zoomT.k ≥ LABEL_ZOOM`; `$tx(l.name)` for the primary line, `l.name.en.toUpperCase()` as the secondary line only when `$lang === 'zh'` and rank 1 (and `l.name.zh` as secondary when `$lang === 'en'`); counter-scaled `<g transform="translate(x,y) scale(1/zoomT.k)">`.
- L220: replace the single `.dot` with shadow / ring / disc circles (values in (b)); keep `r` bump on `selected`.
- L223: `.label` `y` unchanged; styling moves to the new values.
- after L228 (outside the zoom `<g>`): `<rect class="grain" {width} {height} filter="url(#grain)" opacity="0.05" pointer-events="none"/>` — or nothing here and the CSS `::after` tile on `.map`.
- L260–288 `<style>`: replace `.halo*`, `.land path`, `.borders` with `.shelf` (fill none, round joins, non-scaling-stroke, stroke per band token), `.land-shade/.land-light/.land-main` (fills, no stroke), `.waves` (pointer-events none), `.sea1/.sea1en/.sea2` (fills, opacities, letter-spacing as in (b)).
- L301–314: `.dot` rules → `.ring` / `.disc`; drop the `drop-shadow` filter (the offset shadow circle replaces it — no filter inside the zoom group).
- L315–325 `.label`: `font-size: 11px; stroke-opacity: .78; stroke-width: 3px`.
- L248–251 `.map`: `background: var(--ocean-abyss)`; optional `.map::after` with the noise tile, `opacity: .05; pointer-events: none; mix-blend-mode: normal`.

`src/app.css`
- L3–16: add `--ocean-base: #15807F; --ocean-abyss: #0F5F6B; --shelf-4: #1B8C8A; --shelf-2: #3FB4AC; --shelf-1: #62C7BC; --land-shade: #D9C193; --land-light: #FFF7E6; --coral-deep: #B9472E;`. Keep `--ocean`, `--ocean-shallow`, `--seafoam`, `--land`, `--coral`, `--paper`, `--ink` unchanged; `--land-2` becomes unused (remove or keep for cards).
- L29–40 night theme: add night values for every new token (proposal, untested: `--ocean-base #0F2F4C; --ocean-abyss #0A1E33; --shelf-4 #143A5A; --shelf-2 #1E4F70; --shelf-1 #2A6485; --land-shade #1F3449; --land-light #35526E; --coral-deep #D9684C`).
- L52 `body { background: var(--ocean) }` → `var(--ocean-abyss)` so overscroll/rubber-band edges match the gradient rim.

`scripts/validate-data.mjs`: validate `labels.json` (zh/en present, anchor in range, not on land) and the wave anchors (≥ 8° from any coast vertex — the same check `render.mts` runs).

`docs/SPEC.md` §5.2/§5.4: record the new tokens and replace the two-stroke halo recipe with the five-band one.

## (f) Risks

1. **Zoom performance on low-end Android / WeChat X5.** The current app already re-rasterises two wide strokes of the whole coast per frame; this direction has five (two of them 18–30 px with round joins over ~500 polygons) plus one complex `clip-path`. On a 2019-class Android in X5 that can drop a pinch to ~20 fps. Mitigations in order: (i) toggle a `.zooming` class on d3 `start`/`end` and hide `.shelf-4`/`.shelf-3` and `.land-main` (the clipped copy) during the gesture — the picture degrades to three bands and flat cream for the duration, nobody notices; (ii) if still janky, rasterise L1–L3 to a `<canvas>` at zoom-end and show it as an `<image>` while zooming (bigger change, do only if measured).
2. **`feTurbulence` grain.** A full-frame filter at 3× DPR is 100–400 ms on each resize/orientation change and X5 has had rendering bugs with `feTurbulence`. Prefer the pre-baked noise PNG tile via CSS; at 0.05 nobody can tell the difference (the preview grain is already near-invisible — it is a hint, not a texture).
3. **Legibility.** Seafoam sea names at 0.6 on `--ocean-base` are ≈ 2.3:1 — decorative, below AA; acceptable only because they are not the way users find a sea (search and markers are). Rank-3 names and dive-site labels will collide at k 2.5–3 in the real app; the preview resolves this with greedy placement that `MapView.svelte` does not have yet — either port the 20-line placer or hide a sea name whenever a marker label is within 40 px.
4. **Palette drift from SPEC §5.2.** The ocean is no longer `--ocean #1A9E9A`; it is `#15807F` at the centre falling to `#0F5F6B` at the rim, and `--ocean` is demoted to the outermost shelf step. Net effect: a darker, slightly bluer sea than the spec table; `--land-2` (continent tint) is dropped. The night theme tokens above are a proposal and have not been rendered.
5. **Phone start view.** At 375×640 and k = 1.9 the globe strip is ~160 px tall; the gradient and off-globe wave filler make that intentional, but a start k of ~2.3–2.6 (or a start centre further south) would serve the Southeast-Asia audience better. Product call, not made here.
6. **Marker overlap in the Coral Triangle.** Sipadan / Tubbataha / Malapascua overlap at both preview scales; two of their labels are dropped on the phone. That is data density, fixed by the planned cluster bubbles (SPEC §6.2), not by styling.
7. **Renderer vs browser differences.** librsvg substituted system fonts (PingFang SC was available here; a Windows/Android viewer gets Microsoft YaHei / Noto Sans CJK — wider glyphs, so letter-spacing values may need −10 %). `letter-spacing` + `text-anchor: middle` leaves a trailing gap in both librsvg and browsers; the `dx = track/2` compensation holds. Small caps are emulated with uppercase at 8.5 px because `font-variant: small-caps` synthesises badly on CJK fallbacks.

## Iteration log

1. Bands 2/6/14/26/44 px as briefed, all polygons: the Mediterranean, Red Sea, Caribbean and Sea of Japan became solid shelf, every atoll a concentric bullseye, rank-2 sea names sat invisibly on shelf colour. Rejected.
2. Bands 2/5/10/18/30, outer two steps softened and restricted to polygons ≥ 20 000 km²; small seas demoted to rank 3; rank-1 names 15/8.5 px; marker shadow disc; wave sizes varied. Crisp shelves, water back in the inland seas, atolls as halos. "ARCTIC OCEAN" swallowed by the Taymyr shelf; 菲律宾海 collided with a marker label on the phone; off-globe sea on the phone dead flat.
3. Arctic anchor moved to the Beaufort Sea; site labels given priority over sea names; off-globe filler glyphs on a seeded grid. Shipped.
