"""Sample preview images for the home screen's sample cards.

Writes apps/web/src/home/previews/<sample>.webp, 480 px wide, from samples/<sample>/source.png. The full
source images (up to 1.8 MB) stay out of the home screen; the previews are a few kB each.

Run from the repository root: python3 scripts/gen-previews.py (needs Pillow).
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "samples"
OUT = ROOT / "apps" / "web" / "src" / "home" / "previews"
WIDTH = 480


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source in sorted(SAMPLES.glob("*/source.png")):
        image = Image.open(source).convert("RGB")
        height = round(image.height * WIDTH / image.width)
        preview = image.resize((WIDTH, height), Image.LANCZOS)
        preview.save(OUT / f"{source.parent.name}.webp", "WEBP", quality=80, method=6)


if __name__ == "__main__":
    main()
