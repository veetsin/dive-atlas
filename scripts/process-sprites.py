#!/usr/bin/env python3
"""
Sprite pipeline: GPT raw images → transparent, trimmed, two-size WebP sprites.

    pip install "rembg[cpu]" pillow

    # a 2x2 grid of four species (ids in reading order: TL, TR, BL, BR)
    python3 scripts/process-sprites.py art/raw/batch-01/grid.png --grid 2x2 \
        --ids whale-shark,reef-manta,green-turtle,nudibranch

    # a single-subject decoration
    python3 scripts/process-sprites.py art/raw/deco/compass.png --ids deco-compass

    # several files, one id each (or one grid each with the same --grid)
    python3 scripts/process-sprites.py art/raw/batch-02/*.png --grid 2x2 --ids-file ids.txt

Options:
    --grid RxC        split each input into R rows × C columns (default: no split)
    --ids a,b,c       ids in reading order (one per cell / per file)
    --ids-file FILE   same, one id per line
    --sizes 192,512   output long-edge sizes (default 192,512)
    --quality 82      WebP quality (default 82)
    --alpha-erode N   erode the alpha mask by N px to kill light fringes (default 0)
    --pad 0.04        safety margin as a fraction of the long edge (default 0.04)
    --out DIR         output dir (default public/sprites)
    --no-rembg        skip background removal (input already transparent)

Writes <id>-<size>.webp and updates public/sprites/manifest.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent


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
    p.add_argument("--pad", type=float, default=0.04)
    p.add_argument("--out", type=Path, default=ROOT / "public" / "sprites")
    p.add_argument("--no-rembg", action="store_true")
    return p.parse_args()


def split_grid(img: Image.Image, rows: int, cols: int) -> list[Image.Image]:
    w, h = img.size
    cw, ch = w // cols, h // rows
    return [img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)) for r in range(rows) for c in range(cols)]


def remove_bg(img: Image.Image) -> Image.Image:
    try:
        from rembg import remove, new_session
    except ImportError:
        sys.exit('rembg not installed: pip install "rembg[cpu]"  (or pass --no-rembg)')
    session = new_session("isnet-general-use")
    return remove(img, session=session, alpha_matting=True, alpha_matting_foreground_threshold=240,
                  alpha_matting_background_threshold=10, alpha_matting_erode_size=10).convert("RGBA")


def erode_alpha(img: Image.Image, px: int) -> Image.Image:
    if px <= 0:
        return img
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.MinFilter(px * 2 + 1))
    return Image.merge("RGBA", (r, g, b, a))


def trim(img: Image.Image, pad: float) -> Image.Image:
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    m = int(max(x1 - x0, y1 - y0) * pad)
    x0, y0 = max(0, x0 - m), max(0, y0 - m)
    x1, y1 = min(img.width, x1 + m), min(img.height, y1 + m)
    return img.crop((x0, y0, x1, y1))


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

    cells: list[Image.Image] = []
    for path in args.inputs:
        img = Image.open(path).convert("RGBA")
        if args.grid:
            rows, cols = (int(x) for x in args.grid.lower().split("x"))
            cells += split_grid(img, rows, cols)
        else:
            cells.append(img)

    if len(ids) != len(cells):
        sys.exit(f"{len(cells)} image cell(s) but {len(ids)} id(s) — they must match")

    manifest_path = out / "manifest.json"
    manifest: dict = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    for sprite_id, cell in zip(ids, cells):
        img = cell if args.no_rembg else remove_bg(cell)
        img = erode_alpha(img, args.alpha_erode)
        img = trim(img, args.pad)
        entry = {"files": {}, "aspect": round(img.width / img.height, 3)}
        for size in sizes:
            dest = out / f"{sprite_id}-{size}.webp"
            fit(img, size).save(dest, "WEBP", quality=args.quality, method=6)
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
