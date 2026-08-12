#!/usr/bin/env python3
"""Asset pipeline for the portfolio site.

Reads originals from the source locations below (and from assets/raw/ for anything
you add later), then writes web-ready WebP into assets/img/ and STLs into
assets/models/.

Run it any time you add new media:

    python tools/build_assets.py

Everything it writes is committed to the repo, so the site itself has no build step
and no runtime dependencies.

Requires: Pillow
"""

from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path

from PIL import Image

# --------------------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
IMG_OUT = ROOT / "assets" / "img"
MODEL_OUT = ROOT / "assets" / "models"
RAW_IN = ROOT / "assets" / "raw"

DOCS = Path("C:/Users/jleyd/OneDrive/Documents")
ENG = DOCS / "Engineering SHIT"
CP = DOCS / "CP"
JVM = CP / "JVM Solidworks Parts"
STL_DIR = CP / "STL Files"
PPTX = ENG / "Grant Leyda Portfolio.pptx"
CPII_PPTX = Path("C:/Users/jleyd/Downloads/CPII Final Presentation JVM.pptx")

MAX_EDGE = 1600
THUMB_EDGE = 480
QUALITY = 82

# --------------------------------------------------------------------------------------
# Image sources
#
# crop is a pixel inset (left, top, right, bottom) from each edge, applied before
# resizing. Pixel insets rather than fractions because the SolidWorks window chrome is a
# fixed pixel height, and these screenshots differ slightly in overall size.
#
# The FEA crops keep the study-info header (model, study, plot type), the color legend,
# and the yield-strength annotation — those carry the numbers and are the evidence. They
# drop the menu bar, feature tree, right toolbar, and status bar.
# --------------------------------------------------------------------------------------

FEA_CROP = (278, 222, 34, 67)

# (output stem, source path, crop-or-None)
IMAGES: list[tuple[str, Path, tuple[int, int, int, int] | None]] = [
    # --- FEA plots (high-res SolidWorks screenshots) -----------------------------------
    ("fea-pin-vonmises", JVM / "Pin Von Mises.png", FEA_CROP),
    ("fea-pin-fos", JVM / "Pin FOS.png", FEA_CROP),
    ("fea-pin-displacement", JVM / "Pin Displacement .png", FEA_CROP),
    ("fea-clevis-vonmises", CP / "Hydraulic connection FEA Von Mises .png", FEA_CROP),
    ("fea-clevis-displacement", CP / "Hydraulic connection FEA Displacement .png", FEA_CROP),
    # --- CAD renders -------------------------------------------------------------------
    ("top-arm-annotated", JVM / "Annotated assembly.png", None),
    ("top-arm-exploded", JVM / "Arm exploded assembly.png", None),
    ("top-arm-exploded-1", JVM / "Arm exploded View 1.png", None),
    ("top-arm-exploded-2", JVM / "Arm exploded View 2.png", None),
    ("top-arm-exploded-3", JVM / "Arm exploded View 3.png", None),
    ("top-arm-exploded-4", JVM / "Arm exploded View 4.png", None),
]

# Images embedded in the two decks, extracted losslessly from the pptx zips.
#
# Names below were assigned after visually inspecting every extracted image — slide order
# does not match subject matter, so do not infer content from the image number.
#
# Where the two decks overlap, the CP2 Final Design Review deck wins: it carries the arm
# FEA at 1327x758 where the portfolio deck has 331x190 thumbnails of the same plots.
PPTX_IMAGES: list[tuple[str, str, tuple[int, int, int, int] | None]] = [
    ("drawing-exploded-bom", "ppt/media/image12.png", None), # exploded drawing sheet with parts table
    ("build-photo-welding", "ppt/media/image17.jpeg", None), # team welding the frame
    ("build-photo-frame", "ppt/media/image18.jpeg", None),   # bare frame standing, JVM warehouse
    ("build-photo-installed", "ppt/media/image19.jpeg", None),  # finished machine installed
]

# CP2 Final Design Review deck — the richest single source. Presented 2026-04-24.
CPII_IMAGES: list[tuple[str, str, tuple[int, int, int, int] | None]] = [
    # --- machine renders ---------------------------------------------------------------
    ("cad-machine-loaded", "ppt/media/image10.png", None),   # full machine with chassis, 3/4
    ("cad-machine-hero", "ppt/media/image12.png", None),     # full machine, standing
    ("cad-machine-side", "ppt/media/image9.png", None),      # side view, actuator visible
    ("cad-frame", "ppt/media/image2.jpg", None),             # motion study: chassis level
    ("motion-chassis-level", "ppt/media/image1.jpg", None),
    ("motion-chassis-rotated", "ppt/media/image3.jpg", None),
    # --- design detail -----------------------------------------------------------------
    ("assembly-ballooned", "ppt/media/image4.png", None),    # numbered exploded assembly
    ("subassembly-exploded", "ppt/media/image7.png", None),  # drive subassembly, motor + gear
    ("top-arm-annotated", "ppt/media/image21.png", None),
    ("part-variants", "ppt/media/image15.png", None),        # arm design iterations
    ("requirements-table", "ppt/media/image16.png", None),   # customer needs vs delivered
    ("bom-table", "ppt/media/image23.png", None),            # costed BOM, $5,432 total
    # --- arm FEA, full resolution ------------------------------------------------------
    ("fea-arm-displacement", "ppt/media/image17.png", None),
    ("fea-arm-stress", "ppt/media/image14.png", None),
    ("fea-arm-vonmises", "ppt/media/image24.png", None),
    ("fea-arm-fos", "ppt/media/image13.png", None),
    ("fea-arm-stress-alt", "ppt/media/image20.png", None),
    # --- photographs ---------------------------------------------------------------------
    ("rotator-in-use", "ppt/media/image5.png", None),        # chassis mid-rotation, shop floor
    ("build-photo-team", "ppt/media/image11.jpg", None),     # team assembling the frame
    ("build-photo-final", "ppt/media/image19.jpg", None),    # finished machine, JVM floor
]

# Custom-designed parts get their own 3D viewer. Purchased McMaster hardware and the
# 12 MB / 240k-triangle actuator are deliberately excluded — they would dominate page
# weight without showing Grant's own design work.
# Part identities are cross-checked against the costed BOM rather than taken from the
# export filenames, which are not all reliable. UA8R and UA9R both show material 711000
# (PLATE HR 1-1/4) in the BOM, and both meshes measure 1.3 in thick — consistent.
#
# `711000 UA3R.STL` is deliberately excluded: its filename claims material 711000 but the
# BOM lists UA3R as 704520, and the mesh measures 1.0 in rather than 1.25 in. Rather than
# label it wrongly, it is left off the site.
MODELS: list[tuple[str, Path]] = [
    ("ua8r-plate.stl", STL_DIR / "711000 - UA8R.STL"),
    ("ua9r-plate.stl", STL_DIR / "711000 - UA9R (1).STL"),
    ("top-arm.stl", JVM / "Top arm print - Top Arm Part 1-1.STL"),
    ("chassis.stl", STL_DIR / "SCT2.5C (1).STL"),
]

DOCUMENTS: list[tuple[str, Path]] = [
    ("Grant_Leyda_Resume_2026.pdf", ENG / "Grant_Leyda_Resume_2026.pdf"),
]

# --------------------------------------------------------------------------------------


def _flatten(im: Image.Image) -> Image.Image:
    """Composite transparency onto white. SolidWorks exports RGBA with a transparent
    background; left as-is it goes black in dark mode and the model disappears."""
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    return im.convert("RGB")


def _fit(im: Image.Image, max_edge: int) -> Image.Image:
    w, h = im.size
    if max(w, h) <= max_edge:
        return im
    s = max_edge / max(w, h)
    return im.resize((round(w * s), round(h * s)), Image.LANCZOS)


def write_image(stem: str, im: Image.Image, crop=None, square=False) -> None:
    im = _flatten(im)

    if crop:
        w, h = im.size
        l, t, r, b = crop
        im = im.crop((l, t, w - r, h - b))

    if square:
        w, h = im.size
        side = min(w, h)
        # Bias the crop upward — a centered square crop on a portrait headshot cuts the head.
        top = max(0, round((h - side) * 0.12))
        im = im.crop(((w - side) // 2, top, (w - side) // 2 + side, top + side))

    full = _fit(im, MAX_EDGE)
    full.save(IMG_OUT / f"{stem}.webp", "WEBP", quality=QUALITY, method=6)

    thumb = _fit(im, THUMB_EDGE)
    thumb.save(IMG_OUT / f"{stem}-thumb.webp", "WEBP", quality=QUALITY, method=6)

    kb = (IMG_OUT / f"{stem}.webp").stat().st_size / 1024
    print(f"  img  {stem:26s} {full.size[0]:5d}x{full.size[1]:<5d} {kb:7.1f} KB")


def main() -> int:
    for d in (IMG_OUT, MODEL_OUT, RAW_IN):
        d.mkdir(parents=True, exist_ok=True)

    missing: list[str] = []

    print("\nImages from disk")
    for stem, src, crop in IMAGES:
        if not src.exists():
            missing.append(str(src))
            continue
        write_image(stem, Image.open(src), crop=crop)

    for label, deck, spec in (
        ("portfolio deck", PPTX, PPTX_IMAGES),
        ("CP2 final design review deck", CPII_PPTX, CPII_IMAGES),
    ):
        print(f"\nImages from the {label}")
        if not deck.exists():
            missing.append(str(deck))
            continue
        with zipfile.ZipFile(deck) as z:
            names = set(z.namelist())
            for stem, member, crop in spec:
                if member not in names:
                    missing.append(f"{deck.name}:{member}")
                    continue
                with z.open(member) as fh:
                    write_image(stem, Image.open(fh), crop=crop)

    print("\nHeadshot")
    headshot = CP / "headshot.jpg"
    if headshot.exists():
        write_image("headshot", Image.open(headshot), square=True)
    else:
        missing.append(str(headshot))

    # Anything dropped into assets/raw/ later is picked up automatically, so adding a new
    # project does not mean editing this file.
    extras = [p for p in sorted(RAW_IN.iterdir()) if p.suffix.lower() in
              {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}] if RAW_IN.exists() else []
    if extras:
        print("\nImages from assets/raw/")
        for p in extras:
            write_image(p.stem.lower().replace(" ", "-"), Image.open(p))

    print("\nModels")
    for name, src in MODELS:
        if not src.exists():
            missing.append(str(src))
            continue
        shutil.copy2(src, MODEL_OUT / name)
        kb = (MODEL_OUT / name).stat().st_size / 1024
        print(f"  stl  {name:26s} {kb:7.1f} KB")

    for p in (sorted(RAW_IN.glob("*.stl")) + sorted(RAW_IN.glob("*.STL"))) if RAW_IN.exists() else []:
        shutil.copy2(p, MODEL_OUT / p.name.lower())
        print(f"  stl  {p.name.lower():26s} (from assets/raw/)")

    # Video is optional. Drop an .mp4 into assets/raw/ and the capstone page picks it up
    # automatically — see the motion-study section in projects/rotator.html.
    vids = sorted(RAW_IN.glob("*.mp4")) + sorted(RAW_IN.glob("*.MP4")) if RAW_IN.exists() else []
    if vids:
        vid_out = ROOT / "assets" / "video"
        vid_out.mkdir(parents=True, exist_ok=True)
        print("\nVideo")
        for p in vids:
            name = p.name.lower().replace(" ", "-")
            shutil.copy2(p, vid_out / name)
            print(f"  vid  {name:26s} {p.stat().st_size / 1024 / 1024:6.2f} MB")

    print("\nDocuments")
    for name, src in DOCUMENTS:
        if not src.exists():
            missing.append(str(src))
            continue
        shutil.copy2(src, ROOT / "assets" / name)
        kb = (ROOT / "assets" / name).stat().st_size / 1024
        print(f"  doc  {name:26s} {kb:7.1f} KB")

    img_total = sum(p.stat().st_size for p in IMG_OUT.glob("*.webp")) / 1024 / 1024
    model_total = sum(p.stat().st_size for p in MODEL_OUT.glob("*")) / 1024 / 1024
    print(f"\nTotal: {img_total:.2f} MB images, {model_total:.2f} MB models")

    if missing:
        print("\nMissing sources (skipped):")
        for m in missing:
            print(f"  ! {m}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
