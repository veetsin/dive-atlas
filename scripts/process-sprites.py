#!/usr/bin/env python3
"""
Sprite pipeline: GPT raw sheets → transparent, trimmed, two-size WebP sprites.

    # run with uv (the system python3 on this Mac is broken), see docs/ILLUSTRATION_GUIDE.md §6
    uv run --python 3.13 --with 'rembg[cpu]' --with pillow python scripts/process-sprites.py \
        art/raw/batch-01/grid.png --grid 2x2 --ids-file art/raw/batch-01/ids.txt --outline 2.5

    # a single-subject decoration
    ... scripts/process-sprites.py art/raw/deco/compass.png --ids deco-compass --outline 2.5

How a 2x2 sheet is cut: the background is removed from the WHOLE sheet once, the result is
split into connected components, and each component is assigned to the cell that contains
its centroid. A tail or wingtip that crosses the invisible cell boundary therefore stays
with its animal instead of being amputated by a fixed crop, and a neighbour's fin that
pokes into a cell is not picked up. Specks are dropped, enclosed holes left by the matte
(white bellies against the grey background) are filled from the original pixels.

Options:
    --grid RxC        cells per sheet (default: one subject per file)
    --ids a,b,c       ids in reading order (TL, TR, BL, BR); "-" skips a cell
    --ids-file FILE   same, one id per line
    --sizes 192,512   output long-edge sizes (default 192,512)
    --quality 82      WebP quality (default 82)
    --alpha-erode N   erode the alpha mask by N px to kill light fringes (default 0)
    --outline PX      die-cut sticker edge in off-white, PX wide at the 192 px size (scaled for
                      other sizes; default 0 = none). Project standard: 2.5
    --pad 0.04        safety margin as a fraction of the long edge (default 0.04)
    --out DIR         output dir (default public/sprites)
    --no-rembg        input already transparent: skip background removal

Writes <id>-<size>.webp and updates <out>/manifest.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUTLINE_RGB = (251, 248, 241)  # --paper
ALPHA_SOLID = 40  # alpha above this counts as "subject" when finding components


def rel(p: Path) -> Path:
    """Path relative to the repo when inside it (for log lines); otherwise unchanged."""
    p = p.resolve()
    return p.relative_to(ROOT) if p.is_relative_to(ROOT) else p


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("inputs", nargs="+", type=Path)
    p.add_argument("--grid", default=None)
    p.add_argument("--ids", default=None)
    p.add_argument("--ids-file", type=Path, default=None)
    p.add_argument("--sizes", default="192,512")
    p.add_argument("--quality", type=int, default=82)
    p.add_argument("--alpha-erode", type=int, default=0)
    p.add_argument("--outline", type=float, default=0.0)
    p.add_argument("--pad", type=float, default=0.04)
    p.add_argument("--out", type=Path, default=ROOT / "public" / "sprites")
    p.add_argument("--no-rembg", action="store_true")
    return p.parse_args()


def remove_bg(img: Image.Image) -> Image.Image:
    try:
        from rembg import remove, new_session
    except ImportError:
        sys.exit('rembg not installed: pip install "rembg[cpu]"  (or pass --no-rembg)')
    session = new_session("isnet-general-use")
    return remove(img, session=session, alpha_matting=True, alpha_matting_foreground_threshold=240,
                  alpha_matting_background_threshold=10, alpha_matting_erode_size=10).convert("RGBA")


# ---------------------------------------------------------------- components

class Component:
    __slots__ = ("id", "area", "sx", "sy", "x0", "y0", "x1", "y1")

    def __init__(self, cid: int) -> None:
        self.id = cid
        self.area = 0
        self.sx = 0
        self.sy = 0
        self.x0 = self.y0 = 1 << 30
        self.x1 = self.y1 = -1

    @property
    def centroid(self) -> tuple[float, float]:
        return self.sx / self.area, self.sy / self.area


def label_components(mask: bytes, w: int, h: int) -> tuple[list[Component], list[int]]:
    """4-connected components of a 0/255 mask. Returns components and a per-pixel label list (0 = background)."""
    labels = [0] * (w * h)
    comps: list[Component] = []
    for start in range(w * h):
        if not mask[start] or labels[start]:
            continue
        comp = Component(len(comps) + 1)
        labels[start] = comp.id
        stack = [start]
        while stack:
            i = stack.pop()
            x, y = i % w, i // w
            comp.area += 1
            comp.sx += x
            comp.sy += y
            if x < comp.x0: comp.x0 = x
            if x > comp.x1: comp.x1 = x
            if y < comp.y0: comp.y0 = y
            if y > comp.y1: comp.y1 = y
            if x > 0 and mask[i - 1] and not labels[i - 1]:
                labels[i - 1] = comp.id; stack.append(i - 1)
            if x < w - 1 and mask[i + 1] and not labels[i + 1]:
                labels[i + 1] = comp.id; stack.append(i + 1)
            if y > 0 and mask[i - w] and not labels[i - w]:
                labels[i - w] = comp.id; stack.append(i - w)
            if y < h - 1 and mask[i + w] and not labels[i + w]:
                labels[i + w] = comp.id; stack.append(i + w)
        comps.append(comp)
    return comps, labels


def fill_holes(mask: bytearray, w: int, h: int, max_hole: int) -> None:
    """Set enclosed zero-regions (not reachable from the border) to 255, if smaller than max_hole px."""
    outside = bytearray(w * h)
    stack = [i for i in range(w) if not mask[i]] + [i for i in range((h - 1) * w, w * h) if not mask[i]]
    stack += [y * w for y in range(h) if not mask[y * w]] + [y * w + w - 1 for y in range(h) if not mask[y * w + w - 1]]
    for i in stack:
        outside[i] = 1
    while stack:
        i = stack.pop()
        x, y = i % w, i // w
        for j in (i - 1 if x > 0 else -1, i + 1 if x < w - 1 else -1, i - w if y > 0 else -1, i + w if y < h - 1 else -1):
            if j >= 0 and not mask[j] and not outside[j]:
                outside[j] = 1
                stack.append(j)
    # remaining zeros are holes; fill them component by component so huge gaps are left alone
    hole_mask = bytes(255 if (not mask[i] and not outside[i]) else 0 for i in range(w * h))
    holes, hole_labels = label_components(hole_mask, w, h)
    small = {c.id for c in holes if c.area <= max_hole}
    if not small:
        return
    for i in range(w * h):
        if hole_labels[i] in small:
            mask[i] = 255


def cut_cells(raw: Image.Image, cut: Image.Image, rows: int, cols: int) -> list[Image.Image | None]:
    """Split a background-removed sheet into per-cell RGBA images by component centroid."""
    w, h = cut.size
    alpha = cut.getchannel("A").tobytes()
    mask = bytes(255 if a > ALPHA_SOLID else 0 for a in alpha)
    comps, labels = label_components(mask, w, h)
    cw, ch = w / cols, h / rows
    by_cell: dict[int, list[Component]] = {}
    for c in comps:
        cx, cy = c.centroid
        idx = min(rows - 1, int(cy // ch)) * cols + min(cols - 1, int(cx // cw))
        by_cell.setdefault(idx, []).append(c)

    raw_rgb = raw.convert("RGB")
    cells: list[Image.Image | None] = []
    for idx in range(rows * cols):
        group = by_cell.get(idx, [])
        if not group:
            cells.append(None)
            continue
        biggest = max(c.area for c in group)
        keep = {c.id for c in group if c.area >= max(30, biggest * 0.004)}
        kept = [c for c in group if c.id in keep]
        x0, y0 = min(c.x0 for c in kept), min(c.y0 for c in kept)
        x1, y1 = max(c.x1 for c in kept) + 1, max(c.y1 for c in kept) + 1
        bw, bh = x1 - x0, y1 - y0
        # soft alpha from the matte, restricted to this cell's components
        cell_alpha = bytearray(bw * bh)
        solid = bytearray(bw * bh)
        for y in range(y0, y1):
            row = y * w
            o = (y - y0) * bw - x0
            for x in range(x0, x1):
                if labels[row + x] in keep:
                    cell_alpha[o + x] = alpha[row + x]
                    solid[o + x] = 255
        fill_holes(solid, bw, bh, max_hole=int(biggest * 0.15))
        for i in range(bw * bh):
            if solid[i] and cell_alpha[i] < 255 and not (labels[(y0 + i // bw) * w + x0 + i % bw] in keep):
                cell_alpha[i] = 255  # filled hole: fully opaque, colour comes from the raw sheet
        rgb = raw_rgb.crop((x0, y0, x1, y1))
        a = Image.frombytes("L", (bw, bh), bytes(cell_alpha))
        rgba = rgb.copy()
        rgba.putalpha(a)
        cells.append(rgba)
    return cells


# ---------------------------------------------------------------- finishing

def erode_alpha(img: Image.Image, px: int) -> Image.Image:
    if px <= 0:
        return img
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.MinFilter(px * 2 + 1))
    return Image.merge("RGBA", (r, g, b, a))


def add_outline(img: Image.Image, px: int) -> Image.Image:
    """Die-cut sticker edge: grow the alpha mask by `px` and fill it with off-white under the art."""
    if px <= 0:
        return img
    grown = img.getchannel("A").filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(0.7))
    backing = Image.new("RGBA", img.size, OUTLINE_RGB + (0,))
    backing.putalpha(grown)
    return Image.alpha_composite(backing, img)


def trim(img: Image.Image, pad: float) -> Image.Image:
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    m = int(max(x1 - x0, y1 - y0) * pad)
    # pad with transparent margin so the outline never touches the edge
    canvas = Image.new("RGBA", (x1 - x0 + 2 * m, y1 - y0 + 2 * m), (0, 0, 0, 0))
    canvas.paste(img.crop((x0, y0, x1, y1)), (m, m))
    return canvas


def fit(img: Image.Image, long_edge: int) -> Image.Image:
    w, h = img.size
    scale = long_edge / max(w, h)
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def main() -> None:
    args = parse_args()
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    sizes = [int(s) for s in args.sizes.split(",")]

    ids: list[str] = []
    if args.ids:
        ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    if args.ids_file:
        ids += [l.strip() for l in args.ids_file.read_text().splitlines() if l.strip()]

    cells: list[Image.Image | None] = []
    for path in args.inputs:
        raw = Image.open(path).convert("RGBA")
        cut = raw if args.no_rembg else remove_bg(raw)
        if args.grid:
            rows, cols = (int(x) for x in args.grid.lower().split("x"))
            cells += cut_cells(raw, cut, rows, cols)
        else:
            cells += cut_cells(raw, cut, 1, 1)

    if len(ids) != len(cells):
        sys.exit(f"{len(cells)} image cell(s) but {len(ids)} id(s) — they must match")

    manifest_path = out / "manifest.json"
    manifest: dict = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    for sprite_id, cell in zip(ids, cells):
        if sprite_id == "-":  # placeholder: a cell that failed acceptance and was redrawn elsewhere
            continue
        if cell is None:
            print(f"!! {sprite_id}: nothing found in its cell, skipped")
            continue
        img = erode_alpha(cell, args.alpha_erode)
        img = trim(img, args.pad)
        entry = {"files": {}, "aspect": round(img.width / img.height, 3)}
        for size in sizes:
            dest = out / f"{sprite_id}-{size}.webp"
            scaled = fit(img, size)
            if args.outline > 0:
                scaled = add_outline(scaled, max(1, round(args.outline * size / 192)))
            scaled.save(dest, "WEBP", quality=args.quality, method=6)
            data = dest.read_bytes()
            entry["files"][str(size)] = {"bytes": len(data), "sha1": hashlib.sha1(data).hexdigest()[:10]}
            budget = 15_000 if size <= 192 else 40_000
            flag = "" if len(data) <= budget else f"   ← over budget ({budget} B)"
            print(f"{rel(dest)}  {len(data):>7} B{flag}")
        manifest[sprite_id] = entry

    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"manifest: {rel(manifest_path)} ({len(manifest)} sprites)")


if __name__ == "__main__":
    main()
