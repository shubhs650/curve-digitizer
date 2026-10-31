#!/usr/bin/env python3
"""Generates the PDF fixtures in packages/pdf/fixtures/ (task 1.7).

chart.pdf               three A4-landscape vector pages: vector-clean, sn-family, and dark-bg with /Rotate 90
chart-password.pdf      chart.pdf with the user password "open-sesame" (AES-256)
chart-no-copy.pdf       chart.pdf with only an owner password: viewing and printing allowed, copying and
                        content extraction not (the app must refuse to crop it, as Adobe Reader's snapshot tool does)
chart-a1.pdf            chart.pdf's first page scaled up to A1 (2384 × 1684 pt), so a 600 DPI crop of the whole
                        page (≈ 278 Mpx) is over the 50 Mpx budget and must be capped (R7, task 1.8)

Needs pypdf (BSD-3, dev-time only) and node with the repo's Playwright. Output is deterministic except for
the encryption salts, so re-running changes the two encrypted files' bytes but not their behaviour.
Usage: python3 scripts/gen-pdf-fixtures.py
"""
import subprocess
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions as P

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "packages" / "pdf" / "fixtures"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    base = OUT / "chart.base.pdf"
    subprocess.run(
        ["node", "scripts/render-pdf-fixture.ts", str(base), "vector-clean", "sn-family", "dark-bg"],
        cwd=ROOT,
        check=True,
    )

    writer = PdfWriter(clone_from=PdfReader(base))
    writer.pages[2].rotate(90)
    writer.add_metadata({"/Title": "Curve Digitizer PDF fixture", "/Producer": "scripts/gen-pdf-fixtures.py"})
    with open(OUT / "chart.pdf", "wb") as f:
        writer.write(f)
    base.unlink()

    protected = PdfWriter(clone_from=PdfReader(OUT / "chart.pdf"))
    protected.encrypt(user_password="open-sesame", owner_password="owner-sesame", algorithm="AES-256")
    with open(OUT / "chart-password.pdf", "wb") as f:
        protected.write(f)

    restricted = PdfWriter(clone_from=PdfReader(OUT / "chart.pdf"))
    allowed = P.PRINT | P.PRINT_TO_REPRESENTATION
    restricted.encrypt(user_password="", owner_password="owner-sesame", permissions_flag=allowed, algorithm="AES-256")
    with open(OUT / "chart-no-copy.pdf", "wb") as f:
        restricted.write(f)

    write_a1()

    for name in ("chart.pdf", "chart-password.pdf", "chart-no-copy.pdf", "chart-a1.pdf"):
        print(f"{OUT / name}  {(OUT / name).stat().st_size} bytes")


def write_a1() -> None:
    large = PdfWriter()
    large.add_page(PdfReader(OUT / "chart.pdf").pages[0])
    page = large.pages[0]
    page.scale_to(2384, 1684)
    large.add_metadata({"/Title": "Curve Digitizer PDF fixture (A1)", "/Producer": "scripts/gen-pdf-fixtures.py"})
    with open(OUT / "chart-a1.pdf", "wb") as f:
        large.write(f)


if __name__ == "__main__":
    main()
