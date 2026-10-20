#!/usr/bin/env bash
# Build the base-map TopoJSON from Natural Earth (China point-of-view variant).
#
#   npm run geo              # world view  → public/geo/countries.topo.json        (~3% of vertices)
#   npm run geo -- --detail  # also build  → public/geo/countries-detail.topo.json (~15%, for zoom ≥ 4x, lazy-loaded)
#
# Source: Natural Earth v5+ via the nvkelso/natural-earth-vector GitHub mirror (public domain).
# Note: the point-of-view variants (ne_*_admin_0_countries_chn) only exist at 10m scale, so both
# outputs are simplified from the 10m file. Antarctica is dropped (the map crops at 60°S).
# Idempotent: downloads are cached in scripts/.cache/. Requires: bash, curl or git, node (mapshaper via npx).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/scripts/.cache"
OUT="$ROOT/public/geo"
REPO_RAW="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master"
REPO_GIT="https://github.com/nvkelso/natural-earth-vector.git"
KEEP_FIELDS="ADM0_A3,NAME_EN,NAME_ZH,CONTINENT"
SRC_DIR="10m_cultural"
SRC_BASE="ne_10m_admin_0_countries_chn"

mkdir -p "$CACHE" "$OUT"

want_detail=0
for arg in "$@"; do
  [[ "$arg" == "--detail" ]] && want_detail=1
done

# fetch <dir> <basename> — downloads .shp/.shx/.dbf/.prj(/.cpg) into the cache
fetch() {
  local dir="$1" base="$2"
  local ok=1
  for ext in shp shx dbf prj cpg; do
    local f="$CACHE/$base.$ext"
    [[ -s "$f" ]] && continue
    if ! curl -fsSL --retry 3 -o "$f" "$REPO_RAW/$dir/$base.$ext"; then
      rm -f "$f"
      [[ "$ext" == "cpg" ]] && continue   # .cpg is optional
      ok=0
      break
    fi
  done
  if [[ $ok -eq 0 ]]; then
    echo "raw download failed for $base — falling back to sparse git checkout" >&2
    local tmp="$CACHE/ne-git"
    if [[ ! -d "$tmp/.git" ]]; then
      git clone --depth 1 --filter=blob:none --no-checkout "$REPO_GIT" "$tmp"
    fi
    (cd "$tmp" && git sparse-checkout set --no-cone "$dir/$base.*" && git checkout)
    cp "$tmp/$dir/$base".* "$CACHE/"
  fi
}

# build <input.shp> <output.topo.json> <simplify%>
build() {
  local in="$1" out="$2" simp="$3"
  npx --yes mapshaper "$in" \
    -filter "CONTINENT != 'Antarctica'" \
    -simplify "$simp" keep-shapes \
    -filter-fields "$KEEP_FIELDS" \
    -clean \
    -o format=topojson precision=0.001 quantization=1e4 "$out"
  echo "→ $out  ($(wc -c < "$out") bytes, gzip $(gzip -c "$out" | wc -c))"
}

echo "== Natural Earth 10m admin-0 countries, CHN point of view =="
fetch "$SRC_DIR" "$SRC_BASE"

build "$CACHE/$SRC_BASE.shp" "$OUT/countries.topo.json" 3%

if [[ $want_detail -eq 1 ]]; then
  build "$CACHE/$SRC_BASE.shp" "$OUT/countries-detail.topo.json" 15%
fi

echo "done. Budget: countries.topo.json ≤ 250 KB raw / ≤ 100 KB gzip (see CLAUDE.md)."
