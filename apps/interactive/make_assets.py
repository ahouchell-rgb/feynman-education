#!/usr/bin/env python3
"""Generate the raster brand assets: og-image.png, favicon.ico, apple-touch-icon.png.

favicon.svg is hand-authored (scales crisply) and is the primary icon; this script
produces the raster fallbacks the SVG can't cover — the legacy /favicon.ico request
that every browser makes, and the iOS home-screen apple-touch-icon — plus the
og-image.png used in social/link previews (the <head> already references it).

Re-runnable; overwrites in place.  Requires Pillow.  Usage:  python3 make_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

# Brand palette — from the site theme-color + the widget house style.
PAPER  = (245, 239, 227)   # #F5EFE3  page background
NAVY   = (30, 39, 97)      # #1E2761
ACCENT = (184, 80, 66)     # #B85042
INK    = (26, 26, 26)      # #1A1A1A
MUTED  = (92, 99, 112)     # #5C6370
ORB    = (252, 250, 244)   # #FCFAF4

GEORGIA_B = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
ARIAL     = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_B   = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def atom_mark(size, rounded=True):
    """The atom logo on a navy tile. RGBA; transparent outside the rounded tile
    when rounded=True, fully opaque navy square when rounded=False (for iOS)."""
    S = size * 4  # supersample, then downscale for clean edges
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=NAVY + (255,))
    else:
        d.rectangle([0, 0, S, S], fill=NAVY + (255,))
    cx = cy = S / 2
    rx, ry = S * 0.34, S * 0.14
    sw = max(2, int(S * 0.045))
    for ang in (0, 60, 120):
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse(
            [cx - rx, cy - ry, cx + rx, cy + ry], outline=ORB + (255,), width=sw
        )
        img.alpha_composite(layer.rotate(ang, center=(cx, cy), resample=Image.BICUBIC))
    nr = S * 0.085
    d.ellipse([cx - nr, cy - nr, cx + nr, cy + nr], fill=ACCENT + (255,))
    return img.resize((size, size), Image.LANCZOS)


def draw_tracked(d, xy, text, fnt, fill, tracking):
    """Letter-spaced text (Pillow has no native tracking)."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill)
        x += d.textlength(ch, font=fnt) + tracking


def wrap(d, text, fnt, max_w):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def make_og():
    W, H, M = 1200, 630, 90
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 10], fill=NAVY)               # top accent bar
    mk = atom_mark(150)
    img.paste(mk, (W - M - 150, H - M - 150), mk)        # mark, clear bottom-right
    draw_tracked(d, (M, 96), "INTERACTIVE-SCIENCE.COM", font(ARIAL_B, 26), ACCENT, 4)
    d.text((M - 2, 150), "Interactive Science", font=font(GEORGIA_B, 92), fill=NAVY)
    sf = font(ARIAL, 36)
    y = 300
    for ln in wrap(d, "Free AQA GCSE & KS3 science tools, revision booklets and "
                      "retrieval practice.", sf, W - 2 * M):
        d.text((M, y), ln, font=sf, fill=INK)
        y += 50
    d.rectangle([M, y + 18, M + 90, y + 24], fill=ACCENT)
    d.text((M, H - 92), "Built by a teacher   ·   No accounts   ·   No ads",
           font=font(ARIAL, 28), fill=MUTED)
    img.save(os.path.join(HERE, "og-image.png"), "PNG")
    print("wrote og-image.png", img.size)


def make_icons():
    atom_mark(512).save(os.path.join(HERE, "favicon.ico"),
                        sizes=[(16, 16), (32, 32), (48, 48)])
    # iOS masks the icon itself, so use the opaque (non-rounded) tile.
    atom_mark(180, rounded=False).convert("RGB").save(
        os.path.join(HERE, "apple-touch-icon.png"), "PNG")
    print("wrote favicon.ico + apple-touch-icon.png")


if __name__ == "__main__":
    make_og()
    make_icons()
