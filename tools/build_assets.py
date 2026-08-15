#!/usr/bin/env python3
"""Asset pipeline for the portfolio site.

Reads originals from the source locations below (and from assets/raw/ for anything
you add later), then writes web-ready WebP into assets/img/ and STLs into
assets/models/.

Run it any time you add new media:

    python tools/build_assets.py

Everything it writes is committed to the repo, so the site itself has no build step
and no runtime dependencies.

Requires: Pillow, PyMuPDF (pip install pymupdf)
"""

from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path

import pymupdf
from PIL import Image, ImageOps

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
CCA_PDF = CP / "Critical Component Analysis Final.pdf"

MAX_EDGE = 1600
THUMB_EDGE = 480
QUALITY = 82

# Some source photos were rotated for display inside PowerPoint via a slide-level
# transform (<a:xfrm rot="...">) rather than by rotating the embedded file, so the raw
# bytes we extract come out sideways. Confirmed by reading the deck's slide XML: slide 5
# of the portfolio deck applies rot="5400000" (90 degrees, clockwise) to image19.jpeg.
# Degrees are clockwise, matching the OOXML convention.
MANUAL_ROTATE_CW: dict[str, int] = {
    "build-photo-installed": 90,
}

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
#
# "Annotated assembly.png" is deliberately not listed here even though it exists in this
# folder: the CP2 deck's copy of the same screenshot (see CPII_IMAGES below) is sharper
# and needs a smaller crop, and the pipeline asserts stems are unique — see main().
IMAGES: list[tuple[str, Path, tuple[int, int, int, int] | None]] = [
    # --- FEA plots (high-res SolidWorks screenshots) -----------------------------------
    ("fea-pin-vonmises", JVM / "Pin Von Mises.png", FEA_CROP),
    ("fea-pin-fos", JVM / "Pin FOS.png", FEA_CROP),
    ("fea-pin-displacement", JVM / "Pin Displacement .png", FEA_CROP),
    ("fea-clevis-vonmises", CP / "Hydraulic connection FEA Von Mises .png", FEA_CROP),
    ("fea-clevis-displacement", CP / "Hydraulic connection FEA Displacement .png", FEA_CROP),
    # --- CAD renders -------------------------------------------------------------------
    # "Arm exploded assembly.png" is the assembled view despite its filename — it's the
    # same geometry as top-arm-annotated with no callouts, so it isn't used on the site,
    # but is still generated in case it's useful later. The numbered views are the ones
    # that actually show parts pulled apart; view 1 is the one used, cropped to drop the
    # SolidWorks toolbar the same way top-arm-annotated is.
    ("top-arm-exploded", JVM / "Arm exploded assembly.png", None),
    ("top-arm-exploded-1", JVM / "Arm exploded View 1.png", (0, 38, 0, 0)),
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
#
# image13/14/17/20/24 (all labelled "fea-arm-*" in an earlier pass) are NOT used: visual
# inspection showed they depict the restraining-arm bracket, not the upper/lower arm the
# report table cites, and at 1327x758 or smaller they were soft besides. The correct,
# sharp, exactly-matching-the-report images come from the PDF instead — see PDF_IMAGES.
CPII_IMAGES: list[tuple[str, str, tuple[int, int, int, int] | None]] = [
    # --- machine renders ---------------------------------------------------------------
    ("cad-machine-loaded", "ppt/media/image10.png", None),   # full machine with chassis, 3/4
    ("cad-machine-hero", "ppt/media/image12.png", None),     # full machine, standing
    ("cad-machine-side", "ppt/media/image9.png", None),      # side view, actuator visible
    ("motion-chassis-level", "ppt/media/image1.jpg", None),
    ("motion-chassis-rotated", "ppt/media/image3.jpg", None),
    # --- design detail -----------------------------------------------------------------
    ("assembly-ballooned", "ppt/media/image4.png", None),    # numbered exploded assembly
    ("subassembly-exploded", "ppt/media/image7.png", None),  # drive subassembly, motor + gear
    ("top-arm-annotated", "ppt/media/image21.png", (0, 38, 0, 0)),  # trims the SW toolbar row
    ("part-variants", "ppt/media/image15.png", None),        # arm design iterations
    ("bom-table", "ppt/media/image23.png", None),            # costed BOM, $5,432 total
    # --- photographs ---------------------------------------------------------------------
    ("rotator-in-use", "ppt/media/image5.png", None),        # chassis mid-rotation, shop floor
    ("build-photo-team", "ppt/media/image11.jpg", None),     # team assembling the frame
    ("build-photo-final", "ppt/media/image19.jpg", None),    # finished machine, JVM floor
]

# Critical Component Analysis Final.pdf — the source report itself. These are the actual
# embedded PNG plots (not a rasterised screenshot of the page), so they are sharp, and
# their legend values are cross-checked against the report's own table:
#   page 2, image 0: von Mises stress, upper/lower arm.  Legend max 1.897e8 -> matches the
#                     report's "Max Stress 1.897e8 N/m^2" for the Upper Arm exactly.
#   page 2, image 1: factor of safety, same load case.   Legend Min FOS = 1.318 -> matches
#                     "Static FoS 1.318" exactly.
#   page 3, image 0: resultant displacement (URES).      Legend max 1.681e1 mm = 0.6619 in
#                     -> matches "Max Deflection (in) 0.6619" exactly.
# (page, image-index) are 0-indexed and taken from PyMuPDF's embedded-image order, which
# is confirmed correct by the value matches above rather than assumed from position.
#   page 12, images 1-3: restraining arm at 90 (Figures 4-6: horizontal von Mises, FOS,
#                     displacement). Legend values match the report's 90 row exactly
#                     (FOS 3.6, deflection 0.5811 mm = 0.0229 in).
PDF_IMAGES: list[tuple[str, Path, int, int]] = [
    ("fea-arm-stress", CCA_PDF, 1, 0),
    ("fea-arm-fos", CCA_PDF, 1, 1),
    ("fea-arm-deflection", CCA_PDF, 2, 0),
    ("fea-restraining-vonmises", CCA_PDF, 12, 1),
    ("fea-restraining-fos", CCA_PDF, 12, 2),
    ("fea-restraining-displacement", CCA_PDF, 12, 3),
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
    # Applies a camera's EXIF orientation tag, if present, before anything else touches
    # the pixels. None of the current sources carry one (checked), but this is the kind
    # of bug that stays invisible until someone drops in a phone photo that does.
    im = ImageOps.exif_transpose(im)

    if stem in MANUAL_ROTATE_CW:
        im = im.rotate(-MANUAL_ROTATE_CW[stem], expand=True)

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


def _font(size: int, bold: bool = False) -> "ImageFont.FreeTypeFont":
    from PIL import ImageFont

    candidates = (
        [r"C:\Windows\Fonts\consolab.ttf", r"C:\Windows\Fonts\segoeuib.ttf"]
        if bold
        else [r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\segoeui.ttf"]
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def generated_covers() -> None:
    """Draws the two software-project title cards.

    Bankroll and Recipe Book don't have a marketing screenshot to source a cover from, so
    these are designed cards instead — real vector-style content (a data curve, a pipeline
    diagram), not a fake product screenshot. They are code, not a source file, which is why
    they live here instead of in one of the source lists above: nothing on disk to point at,
    and nothing to go missing if `assets/img` gets wiped and rebuilt.
    """
    from PIL import ImageDraw

    W, H = 1440, 900
    BG, GRID, ACC, INK, MUT = (11, 15, 20), (26, 38, 50), (232, 69, 92), (232, 238, 244), (117, 134, 151)

    def base(title: str, kicker: str, sub: str) -> tuple[Image.Image, "ImageDraw.ImageDraw"]:
        im = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(im, "RGBA")
        for x in range(0, W, 60):
            d.line([(x, 0), (x, H)], fill=GRID)
        for y in range(0, H, 60):
            d.line([(0, y), (W, y)], fill=GRID)
        d.text((150, 140), title, font=_font(88, True), fill=INK)
        d.text((156, 252), kicker, font=_font(26), fill=ACC)
        d.text((156, 302), sub, font=_font(24), fill=MUT)
        return im, d

    # --- Bankroll: a rising session-total curve, the app's actual subject -------------
    import random

    im, d = base("BANKROLL", "SESSION TRACKING  \u00b7  PROGRESSIVE WEB APP",
                 "Vanilla JS \u00b7 Firebase Auth \u00b7 Cloud Firestore \u00b7 ~2,200 lines")
    random.seed(7)
    pts, val = [], 0.0
    for _ in range(46):
        val += random.uniform(-0.30, 0.62)
        pts.append(val)
    lo, hi = min(pts), max(pts)
    x0, x1, ybase, yamp = 150, W - 150, 700, 300
    coords = [(x0 + (x1 - x0) * i / 45, ybase - yamp * ((v - lo) / (hi - lo))) for i, v in enumerate(pts)]
    d.polygon([(x0, ybase)] + coords + [(x1, ybase)], fill=(*ACC, 26))
    d.line(coords, fill=ACC, width=4, joint="curve")
    for c in coords[::9]:
        d.ellipse([c[0] - 6, c[1] - 6, c[0] + 6, c[1] + 6], fill=BG, outline=ACC, width=3)
    d.line([(x0, ybase), (x1, ybase)], fill=(44, 61, 77), width=2)
    d.text((150, 790), "leydagrant-ux.github.io/Bankroll", font=_font(24), fill=MUT)
    write_image("bankroll-cover", im)

    # --- Recipe Book: the four-stage pipeline, the app's actual architecture ----------
    im, d = base("RECIPE BOOK", "VIDEO  \u2192  STRUCTURED RECIPE",
                 "Python \u00b7 Flask \u00b7 SQLite \u00b7 LLM extraction \u00b7 iOS Shortcut")
    stages = ["REEL", "TRANSCRIPT", "EXTRACT", "RECIPE"]
    bw, bh, gap, y0, x = 250, 96, 58, 480, 150
    for i, st in enumerate(stages):
        box = [x, y0, x + bw, y0 + bh]
        d.rounded_rectangle(box, 12, fill=(18, 26, 34), outline=ACC if i == 2 else (44, 61, 77), width=2)
        tw = d.textlength(st, font=_font(24, True))
        d.text((x + (bw - tw) / 2, y0 + bh / 2 - 16), st, font=_font(24, True), fill=INK if i == 2 else MUT)
        if i < len(stages) - 1:
            ax = x + bw
            d.line([(ax + 12, y0 + bh / 2), (ax + gap - 16, y0 + bh / 2)], fill=ACC, width=3)
            d.polygon([(ax + gap - 16, y0 + bh / 2 - 7), (ax + gap - 16, y0 + bh / 2 + 7), (ax + gap - 4, y0 + bh / 2)], fill=ACC)
        x += bw + gap
    d.text((150, 650), "Images stored as bytes, not links \u2014 the library outlives the source post.",
           font=_font(24), fill=MUT)
    d.text((150, 790), "github.com/leydagrant-ux/Recipe-Book", font=_font(24), fill=MUT)
    write_image("recipes-cover", im)


def pdf_embedded_image(pdf_path: Path, page_no: int, image_index: int) -> Image.Image:
    """Pulls one embedded raster image out of a PDF page, at its native resolution.

    This is not a screenshot of the rendered page — it is the original image the PDF
    embeds, so a PNG figure pasted into a Word doc comes back exactly as sharp as it went
    in, rather than however sharp a JPEG export of the PowerPoint slide happened to be.
    """
    doc = pymupdf.open(pdf_path)
    try:
        page = doc[page_no]
        images = page.get_images(full=True)
        xref = images[image_index][0]
        raw = doc.extract_image(xref)
        from io import BytesIO

        return Image.open(BytesIO(raw["image"]))
    finally:
        doc.close()


def main() -> int:
    for d in (IMG_OUT, MODEL_OUT, RAW_IN):
        d.mkdir(parents=True, exist_ok=True)

    missing: list[str] = []

    # A stem silently overwriting another stem's output is exactly how the site ended up
    # showing the wrong FEA plot under the right caption once already — catch it here
    # instead of relying on someone noticing the picture is wrong.
    all_stems = (
        [s for s, _, _ in IMAGES]
        + [s for s, _, _ in PPTX_IMAGES]
        + [s for s, _, _ in CPII_IMAGES]
        + [s for s, _, _, _ in PDF_IMAGES]
        + ["bankroll-cover", "recipes-cover"]
    )
    dupes = {s for s in all_stems if all_stems.count(s) > 1}
    if dupes:
        raise SystemExit(f"build_assets: duplicate output stem(s), fix before running: {sorted(dupes)}")

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

    print("\nImages from the Critical Component Analysis report")
    if CCA_PDF.exists():
        for stem, pdf, page_no, image_index in PDF_IMAGES:
            try:
                write_image(stem, pdf_embedded_image(pdf, page_no, image_index))
            except (IndexError, RuntimeError) as e:
                missing.append(f"{pdf.name}:page{page_no + 1}#{image_index} ({e})")
    else:
        missing.append(str(CCA_PDF))

    print("\nGenerated cards")
    generated_covers()

    print("\nHeadshot")
    headshot = CP / "headshot.jpg"
    if headshot.exists():
        write_image("headshot", Image.open(headshot), square=True)
    else:
        missing.append(str(headshot))

    # Anything dropped into assets/raw/ later is picked up automatically, so adding a new
    # project does not mean editing this file.
    #
    # cramalot-logo.png is the capstone sponsor's logo, used to identify who the machine
    # was built for. Source:
    # https://recyclinginside.com/wp-content/uploads/2016/06/CRAM-A-LOT-J.V.-Manufacturing-Inc..jpg
    # That original is 484x484 with the mark sitting in a band of white padding; it was
    # auto-cropped to its non-white bounding box (+6 px) giving the 484x99 file here.
    # This combined "CRAM-A-LOT / J.V. Manufacturing, Inc." version is preferred over the
    # 208x94 logo on cram-a-lot.com because it names JVM, the plant the team actually
    # worked with, and it is more than twice the resolution.
    # It is deliberately NOT resized up — _fit() leaves anything under MAX_EDGE alone, so
    # it stays at native resolution rather than being blurred by an upscale.
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

    # glob("*.stl") and glob("*.STL") return the SAME files twice on a case-insensitive
    # filesystem (Windows, default macOS) — matched case-insensitively, so both patterns
    # find the same STLModel.stl once each. Filter on suffix instead of globbing twice.
    stl_raw = sorted(p for p in RAW_IN.iterdir() if p.suffix.lower() == ".stl") if RAW_IN.exists() else []
    for p in stl_raw:
        shutil.copy2(p, MODEL_OUT / p.name.lower())
        print(f"  stl  {p.name.lower():26s} (from assets/raw/)")

    # Video is optional. Drop an .mp4 into assets/raw/ and the capstone page picks it up
    # automatically — see the motion-study section in projects/rotator.html.
    vids = sorted(p for p in RAW_IN.iterdir() if p.suffix.lower() == ".mp4") if RAW_IN.exists() else []
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
