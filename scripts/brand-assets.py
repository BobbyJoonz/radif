#!/usr/bin/env python
"""
Radif brand assets — one source of truth, reproducible.

The four supplied PNGs are the brand. Nothing here redraws them: this script only
trims the transparent margin, pads to a square, and composites them onto the
product ground (#000014) where an icon must be opaque (app icon, Apple touch
icon, maskable PWA icon). Colours are never altered — the brand orange is
#F87820, which is NOT the UI accent token #FF852E; see DIRECTION.md §3.

    python scripts/brand-assets.py

Outputs
    brand/source/*                 the supplied files, unmodified (committed)
    public/brand/radif-emblem.png  transparent emblem, trimmed, 512px tall
    public/brand/radif-lockup.png  emblem + wordmark, transparent, 1200px wide
    public/brand/radif-lockup-caps.png
    src/app/icon.png               512, navy ground, rounded (Next favicon)
    src/app/apple-icon.png         180, navy ground, opaque (iOS)
    public/favicon.ico             16/32/48, navy ground
    public/icons/icon-192.png      PWA, navy ground
    public/icons/icon-512.png      PWA, navy ground
    public/icons/maskable-512.png  full-bleed navy, emblem at 55% (safe zone)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "source"
OUT_BRAND = ROOT / "public" / "brand"
OUT_ICONS = ROOT / "public" / "icons"

GROUND = (0, 0, 20, 255)      # #000014 — the product ground
RULE = (51, 51, 119, 255)     # #333377

SOURCES = {
    "emblem": "radif-emblem.png",
    "lockup": "radif-lockup-source.png",
    "lockup_caps": "radif-lockup-caps-source.png",
    "presentation": "radif-presentation.png",
}


def load(name: str) -> Image.Image:
    path = SRC / SOURCES[name]
    if not path.exists():
        raise SystemExit(f"missing source: {path}")
    return Image.open(path).convert("RGBA")


def trimmed(image: Image.Image, pad_ratio: float = 0.0) -> Image.Image:
    """Crop to the visible pixels, then add an even margin of pad_ratio*max side."""
    box = image.getchannel("A").getbbox()
    if box:
        image = image.crop(box)
    if pad_ratio:
        pad = int(round(max(image.size) * pad_ratio))
        canvas = Image.new("RGBA", (image.width + pad * 2, image.height + pad * 2), (0, 0, 0, 0))
        canvas.paste(image, (pad, pad), image)
        image = canvas
    return image


def square(image: Image.Image, size: int, fill_ratio: float) -> Image.Image:
    """Fit into a transparent square canvas at fill_ratio of the side."""
    target = int(size * fill_ratio)
    scale = min(target / image.width, target / image.height)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
    return canvas


def app_icon(emblem: Image.Image, size: int, fill_ratio: float = 0.68, radius_ratio: float = 0.22) -> Image.Image:
    """Navy rounded square with the emblem centred — the app icon everywhere."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    canvas.paste(Image.new("RGBA", (size, size), GROUND), (0, 0), mask)
    # a hairline keeps the tile from melting into a dark tab bar
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle(
        [0, 0, size - 1, size - 1],
        radius=int(size * radius_ratio),
        outline=RULE if size >= 180 else (0, 0, 0, 0),
        width=max(1, size // 180),
    )
    icon = square(emblem, size, fill_ratio)
    canvas.paste(icon, (0, 0), icon)
    canvas.alpha_composite(ring)
    return canvas


def main() -> None:
    OUT_BRAND.mkdir(parents=True, exist_ok=True)
    OUT_ICONS.mkdir(parents=True, exist_ok=True)
    (ROOT / "src" / "app").mkdir(parents=True, exist_ok=True)

    emblem = trimmed(load("emblem"), 0.04)
    lockup = trimmed(load("lockup"))
    lockup_caps = trimmed(load("lockup_caps"))

    # transparent brand files used by the UI (rendered at 3x for crispness)
    e512 = square(emblem, 512, 0.94)
    e512.save(OUT_BRAND / "radif-emblem.png", optimize=True)

    for img, name in ((lockup, "radif-lockup.png"), (lockup_caps, "radif-lockup-caps.png")):
        scale = 1200 / img.width
        resized = img.resize((1200, round(img.height * scale)), Image.LANCZOS)
        resized.save(OUT_BRAND / name, optimize=True)

    # app / favicon set: opaque, navy, rounded
    app_icon(emblem, 512).save(ROOT / "src" / "app" / "icon.png", optimize=True)
    app_icon(emblem, 180, fill_ratio=0.7).save(ROOT / "src" / "app" / "apple-icon.png", optimize=True)

    ico_sizes = [16, 32, 48]
    frames = [app_icon(emblem, s, fill_ratio=0.72).convert("RGBA") for s in ico_sizes]
    frames[-1].save(ROOT / "src" / "app" / "favicon.ico", sizes=[(s, s) for s in ico_sizes], append_images=frames[:-1])

    app_icon(emblem, 192).save(OUT_ICONS / "icon-192.png", optimize=True)
    app_icon(emblem, 512).save(OUT_ICONS / "icon-512.png", optimize=True)

    # maskable: full-bleed ground, emblem inside the 80% safe circle
    maskable = Image.new("RGBA", (512, 512), GROUND)
    inner = square(emblem, 512, 0.52)
    maskable.paste(inner, (0, 0), inner)
    maskable.save(OUT_ICONS / "maskable-512.png", optimize=True)

    for path in sorted(list(OUT_BRAND.glob("*.png")) + list(OUT_ICONS.glob("*.png"))):
        print(f"  {path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")
    print(f"  src/app/icon.png, src/app/apple-icon.png, public/favicon.ico")


if __name__ == "__main__":
    main()

