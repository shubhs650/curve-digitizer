#!/usr/bin/env python3
"""Generate the synthetic sample charts in samples/ with exact ground truth.

Run from the repository root:  python3 scripts/gen-samples.py
Needs NumPy, and Node with the repo's dev dependencies installed (pnpm install): after writing each
sample's source.svg, ground-truth.json, ops.json and README.md it calls scripts/render-samples.ts, which
rasterizes source.svg to source.png with the Playwright Chromium the repo already uses.

Ground truth is analytic: every curve is a known function, drawn as a dense polyline whose vertices are
exactly the ground-truth centerline (after the sample's pixel transform), so nothing is measured from
the rendered image. Output is deterministic (seeded). Ground truth is immutable once committed: changing it
needs an ADR in docs/DECISIONS.md (CLAUDE.md).

Pixel convention (ADR 25): px [0, 0] is the top-left corner of the image, x grows right, y grows down, and
pixel (i, j) covers [i, i+1) x [j, j+1), so its centre is (i + 0.5, j + 0.5). SVG user space and canvas
share this convention.
"""

import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "samples"
GROUND_TRUTH_VERSION = 1
OPS_VERSION = 1
CENTERLINE_STEP_PX = 1.0
SAMPLES_PER_DATASET = 25
FONT = "DejaVu Sans, Arial, sans-serif"


# ---------------------------------------------------------------- axes and transforms


class Axis:
    def __init__(self, kind, lo, hi, label, unit, major, minor=(), tick_labels=None):
        self.kind = kind  # "linear" | "log10"
        self.lo, self.hi = lo, hi
        self.label, self.unit = label, unit
        self.major, self.minor = list(major), list(minor)
        self.tick_labels = tick_labels

    def to_axis(self, v):
        return np.log10(v) if self.kind == "log10" else np.asarray(v, dtype=float)

    def from_axis(self, a):
        return 10.0 ** a if self.kind == "log10" else a

    @property
    def axis_lo(self):
        return float(self.to_axis(self.lo))

    @property
    def axis_hi(self):
        return float(self.to_axis(self.hi))


def mat_apply(m, pts):
    pts = np.atleast_2d(pts)
    h = np.column_stack([pts, np.ones(len(pts))]) @ m.T
    return h[:, :2] / h[:, 2:3]


def tilt_matrix(width, height, rotate_deg, scale_y, shear_x):
    """Scanner distortion about the page centre: rotation, then anisotropic scale and shear (all affine)."""
    cx, cy = width / 2, height / 2
    t = np.array([[1, 0, cx], [0, 1, cy], [0, 0, 1.0]])
    r = math.radians(rotate_deg)
    rot = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1.0]])
    shape = np.array([[1, shear_x, 0], [0, scale_y, 0], [0, 0, 1.0]])
    back = np.array([[1, 0, -cx], [0, 1, -cy], [0, 0, 1.0]])
    return t @ rot @ shape @ back


class Chart:
    """Plot rectangle in chart px, axes, and the chart-px -> image-px transform (identity unless tilted)."""

    def __init__(self, width, height, plot, x, y, tilt=None):
        self.width, self.height = width, height
        self.left, self.top, self.right, self.bottom = plot
        self.x, self.y = x, y
        self.tilt = np.eye(3) if tilt is None else tilt
        sx = (self.right - self.left) / (x.axis_hi - x.axis_lo)
        sy = (self.bottom - self.top) / (y.axis_hi - y.axis_lo)
        # Axis space -> chart px: an exact scale and offset per axis, y flipped.
        self.axis_to_chart = np.array(
            [[sx, 0, self.left - sx * x.axis_lo], [0, -sy, self.bottom + sy * y.axis_lo], [0, 0, 1.0]]
        )
        self.axis_to_px = self.tilt @ self.axis_to_chart
        self.px_to_axis = np.linalg.inv(self.axis_to_px)

    def chart(self, u, v):
        return mat_apply(self.axis_to_chart, np.column_stack([np.atleast_1d(u), np.atleast_1d(v)]))

    def px_of_chart(self, pts):
        return mat_apply(self.tilt, pts)


# ---------------------------------------------------------------- curves


class Dataset:
    def __init__(self, id, name, color, width, domain, family, expression, params, fn, dash=None, param=None,
                 x_unit="", y_unit=""):
        self.id, self.name, self.color, self.width = id, name, color, width
        self.domain = domain  # data units
        self.family, self.expression, self.params, self.fn = family, expression, params, fn
        self.dash, self.param = dash, param
        self.x_unit, self.y_unit = x_unit, y_unit


def dense_curve(chart, ds, n=40001):
    u = np.linspace(chart.x.to_axis(ds.domain[0]), chart.x.to_axis(ds.domain[1]), n)
    v = chart.y.to_axis(ds.fn(chart.x.from_axis(u)))
    return u, chart.chart(u, v)


def arc_resample(pts, step):
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    count = max(2, int(round(s[-1] / step)) + 1)
    targets = np.linspace(0.0, s[-1], count)
    return np.column_stack([np.interp(targets, s, pts[:, 0]), np.interp(targets, s, pts[:, 1])])


def centerline(chart, ds):
    """Drawn polyline in chart px (3 decimals, exactly what the SVG path contains) and its image-px image."""
    _, dense = dense_curve(chart, ds)
    drawn = np.round(arc_resample(dense, CENTERLINE_STEP_PX), 3)
    for p in drawn:
        assert chart.left + 2 < p[0] < chart.right - 2 and chart.top + 2 < p[1] < chart.bottom - 2, (ds.id, p)
    return drawn, chart.px_of_chart(drawn)


def round_sig(x, sig=4):
    if x == 0:
        return 0.0
    return float(round(x, sig - 1 - int(math.floor(math.log10(abs(x))))))


def dataset_samples(chart, ds):
    """SAMPLES_PER_DATASET exact points, evenly spaced in axis space inside the domain (X-step targets)."""
    a0, a1 = chart.x.to_axis(ds.domain[0]), chart.x.to_axis(ds.domain[1])
    inset = 0.02 * (a1 - a0)
    xs = [round_sig(float(chart.x.from_axis(a)))
          for a in np.linspace(a0 + inset, a1 - inset, SAMPLES_PER_DATASET)]
    out = []
    for x in xs:
        y = float(ds.fn(np.array([x]))[0])
        axis = [float(chart.x.to_axis(x)), float(chart.y.to_axis(y))]
        px = mat_apply(chart.axis_to_px, np.array([axis]))[0]
        out.append({"value": [x, sig_round(y)], "px": rnd(px)})
    return out


def sig_round(y):
    return float(f"{y:.12g}")


def rnd(p, digits=4):
    return [round(float(p[0]), digits), round(float(p[1]), digits)]


def intersections(chart, datasets):
    out = []
    for i, a in enumerate(datasets):
        for b in datasets[i + 1:]:
            lo = max(chart.x.to_axis(a.domain[0]), chart.x.to_axis(b.domain[0]))
            hi = min(chart.x.to_axis(a.domain[1]), chart.x.to_axis(b.domain[1]))
            if lo >= hi:
                continue
            def g(u, a=a, b=b):
                n = np.array([chart.x.from_axis(u)])
                return float(chart.y.to_axis(a.fn(n))[0] - chart.y.to_axis(b.fn(n))[0])

            grid = np.linspace(lo, hi, 4001)
            vals = np.array([g(u) for u in grid])
            for k in np.where(np.sign(vals[:-1]) != np.sign(vals[1:]))[0]:
                u0, u1 = grid[k], grid[k + 1]
                for _ in range(80):
                    um = 0.5 * (u0 + u1)
                    if np.sign(g(um)) == np.sign(g(u0)):
                        u0 = um
                    else:
                        u1 = um
                u = 0.5 * (u0 + u1)
                v = float(chart.y.to_axis(a.fn(np.array([chart.x.from_axis(u)])))[0])
                px = mat_apply(chart.axis_to_px, np.array([[u, v]]))[0]
                out.append({
                    "datasets": [a.id, b.id],
                    "px": rnd(px),
                    "value": [sig_round(float(chart.x.from_axis(u))), sig_round(float(chart.y.from_axis(v)))],
                    "angleDeg": round(crossing_angle(chart, a, b, u), 2),
                })
    return out


def crossing_angle(chart, a, b, u, h=1e-6):
    def direction(ds):
        us = np.array([u - h, u + h])
        vs = chart.y.to_axis(ds.fn(chart.x.from_axis(us)))
        p = mat_apply(chart.axis_to_px, np.column_stack([us, vs]))
        d = p[1] - p[0]
        return d / np.hypot(*d)

    c = abs(float(np.dot(direction(a), direction(b))))
    return math.degrees(math.acos(min(1.0, c)))


def min_distance(points, others, reach=60.0):
    """Smallest distance from any of `points` to any polyline vertex in `others` (inf beyond `reach`)."""
    lo, hi = points.min(axis=0) - reach, points.max(axis=0) + reach
    best = math.inf
    for o in others:
        near = o[np.all((o >= lo) & (o <= hi), axis=1)]
        for chunk in np.array_split(points, max(1, len(points) // 2000)):
            if len(near) == 0 or len(chunk) == 0:
                continue
            d = np.hypot(near[:, 0][None, :] - chunk[:, 0][:, None], near[:, 1][None, :] - chunk[:, 1][:, None])
            best = min(best, float(d.min()))
    return best


def box_points(x0, y0, x1, y1, step=2.0):
    xs = np.arange(x0, x1 + step, step)
    ys = np.arange(y0, y1 + step, step)
    return np.array([(x, y) for x in xs for y in ys])


# ---------------------------------------------------------------- SVG


def path_d(pts):
    return "M" + " L".join(f"{p[0]:.3f} {p[1]:.3f}" for p in pts)


def fmt_tick(axis, value):
    if axis.tick_labels is not None:
        return axis.tick_labels(value)
    return f"{value:g}"


def pow10_label(value):
    e = int(round(math.log10(value)))
    return ("10", str(e))


class Svg:
    def __init__(self, width, height):
        self.width, self.height = width, height
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size, fill, anchor="middle", rotate=None, weight="normal"):
        tr = f' transform="rotate({rotate} {x:.1f} {y:.1f})"' if rotate is not None else ""
        if isinstance(s, tuple):  # base and superscript exponent
            body = f'{s[0]}<tspan dy="{-0.45 * size:.1f}" font-size="{0.7 * size:.1f}">{s[1]}</tspan>'
        else:
            body = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" fill="{fill}" '
                 f'text-anchor="{anchor}" font-weight="{weight}"{tr}>{body}</text>')

    def render(self, defs=""):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" '
                f'viewBox="0 0 {self.width} {self.height}">\n{defs}' + "\n".join(self.parts) + "\n</svg>\n")


def draw_chart(chart, style, datasets, drawn, title, extras=()):
    """Chart content in chart px: background, grid, frame, ticks, labels, curves. Returns a list of SVG strings."""
    s = Svg(chart.width, chart.height)
    x, y = chart.x, chart.y
    L, T, R, B = chart.left, chart.top, chart.right, chart.bottom
    s.add(f'<rect x="-200" y="-200" width="{chart.width + 400}" height="{chart.height + 400}" '
          f'fill="{style["background"]}"/>')

    def xpx(v):
        return float(chart.chart(x.to_axis(v), y.axis_lo)[0][0])

    def ypx(v):
        return float(chart.chart(x.axis_lo, y.to_axis(v))[0][1])

    for v in x.minor:
        if style.get("minorGrid"):
            s.add(f'<line x1="{xpx(v):.3f}" y1="{T}" x2="{xpx(v):.3f}" y2="{B}" stroke="{style["minorGrid"]}" '
                  f'stroke-width="{style["minorGridWidth"]}"/>')
    for v in y.minor:
        if style.get("minorGrid"):
            s.add(f'<line x1="{L}" y1="{ypx(v):.3f}" x2="{R}" y2="{ypx(v):.3f}" stroke="{style["minorGrid"]}" '
                  f'stroke-width="{style["minorGridWidth"]}"/>')
    for v in x.major:
        s.add(f'<line x1="{xpx(v):.3f}" y1="{T}" x2="{xpx(v):.3f}" y2="{B}" stroke="{style["grid"]}" '
              f'stroke-width="{style["gridWidth"]}"/>')
    for v in y.major:
        s.add(f'<line x1="{L}" y1="{ypx(v):.3f}" x2="{R}" y2="{ypx(v):.3f}" stroke="{style["grid"]}" '
              f'stroke-width="{style["gridWidth"]}"/>')

    fw = style["frameWidth"]
    s.add(f'<rect x="{L}" y="{T}" width="{R - L}" height="{B - T}" fill="none" stroke="{style["frame"]}" '
          f'stroke-width="{fw}"/>')
    fs = style["fontSize"]
    for v in x.major:
        s.add(f'<line x1="{xpx(v):.3f}" y1="{B}" x2="{xpx(v):.3f}" y2="{B + 14}" stroke="{style["frame"]}" '
              f'stroke-width="{fw}"/>')
        s.text(xpx(v), B + 18 + fs, fmt_tick(x, v), fs, style["text"])
    for v in x.minor:
        s.add(f'<line x1="{xpx(v):.3f}" y1="{B}" x2="{xpx(v):.3f}" y2="{B + 7}" stroke="{style["frame"]}" '
              f'stroke-width="{fw * 0.75}"/>')
    for v in y.major:
        s.add(f'<line x1="{L - 14}" y1="{ypx(v):.3f}" x2="{L}" y2="{ypx(v):.3f}" stroke="{style["frame"]}" '
              f'stroke-width="{fw}"/>')
        s.text(L - 22, ypx(v) + fs * 0.35, fmt_tick(y, v), fs, style["text"], anchor="end")
    for v in y.minor:
        s.add(f'<line x1="{L - 7}" y1="{ypx(v):.3f}" x2="{L}" y2="{ypx(v):.3f}" stroke="{style["frame"]}" '
              f'stroke-width="{fw * 0.75}"/>')

    xl = f"{x.label} ({x.unit})" if x.unit else x.label
    yl = f"{y.label} ({y.unit})" if y.unit else y.label
    s.text((L + R) / 2, B + 40 + 2.2 * fs, xl, round(fs * 1.15), style["text"])
    s.text(L - 60 - 2.6 * fs, (T + B) / 2, yl, round(fs * 1.15), style["text"], rotate=-90)
    s.text((L + R) / 2, T - 0.9 * fs, title, round(fs * 1.25), style["text"], weight="bold")

    for e in extras:
        s.add(e)
    for ds, pts in zip(datasets, drawn):
        dash = f' stroke-dasharray="{" ".join(str(d) for d in ds.dash)}"' if ds.dash else ""
        s.add(f'<path d="{path_d(pts)}" fill="none" stroke="{ds.color}" stroke-width="{ds.width}" '
              f'stroke-linecap="butt" stroke-linejoin="round"{dash}/>')
    return s


# ---------------------------------------------------------------- outputs


def axis_json(a):
    out = {"type": a.kind, "label": a.label, "min": a.lo, "max": a.hi}
    if a.unit:
        out["unit"] = a.unit
    return out


def ground_truth(name, description, chart, datasets, centerlines, crossings):
    ticks = []
    for v in chart.x.major:
        px = mat_apply(chart.axis_to_px, np.array([[float(chart.x.to_axis(v)), chart.y.axis_lo]]))[0]
        ticks.append({"axis": "x", "value": v, "px": rnd(px)})
    for v in chart.y.major:
        px = mat_apply(chart.axis_to_px, np.array([[chart.x.axis_lo, float(chart.y.to_axis(v))]]))[0]
        ticks.append({"axis": "y", "value": v, "px": rnd(px)})
    out_ds = []
    for ds, cl in zip(datasets, centerlines):
        d = {
            "id": ds.id,
            "name": ds.name,
            "color": ds.color,
            "lineWidthPx": ds.width,
            "dash": ds.dash,
            "mode": "function",
            "xUnit": ds.x_unit,
            "yUnit": ds.y_unit,
            "model": {"family": ds.family, "expression": ds.expression, "params": ds.params},
            "domain": list(ds.domain),
            "samples": dataset_samples(chart, ds),
            "centerline": [rnd(p) for p in cl],
        }
        if ds.param:
            d["param"] = ds.param
        out_ds.append(d)
    return {
        "groundTruthVersion": GROUND_TRUTH_VERSION,
        "sample": name,
        "description": description,
        "generator": "scripts/gen-samples.py",
        "pixelConvention": "px [0,0] is the image's top-left corner; pixel (i,j) has centre (i+0.5, j+0.5) (ADR 25)",
        "image": {"path": "source.png", "width": chart.width, "height": chart.height},
        "axes": {"x": axis_json(chart.x), "y": axis_json(chart.y)},
        "axisToPx": [float(v) for v in chart.axis_to_px.flatten()],
        "pxToAxis": [float(v) for v in chart.px_to_axis.flatten()],
        "ticks": ticks,
        "datasets": out_ds,
        "intersections": crossings,
    }


def arc_point(cl, fraction):
    seg = np.hypot(*np.diff(cl, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    t = fraction * s[-1]
    return np.array([np.interp(t, s, cl[:, 0]), np.interp(t, s, cl[:, 1])]), s


def round_to(p, q):
    return [round(float(p[0]) / q) * q, round(float(p[1]) / q) * q]


def calibration_op(chart, targets):
    """Four clicks a careful user makes with the loupe: two x ticks, two y ticks, to 0.1 px."""
    xt = [chart.x.major[1], chart.x.major[-2]]
    yt = [chart.y.major[1], chart.y.major[-2]]
    pts = []
    for v in xt:
        px = mat_apply(chart.axis_to_px, np.array([[float(chart.x.to_axis(v)), chart.y.axis_lo]]))[0]
        pts.append({"px": [round(float(px[0]), 1), round(float(px[1]), 1)], "value": [v, chart.y.lo]})
    for v in yt:
        px = mat_apply(chart.axis_to_px, np.array([[chart.x.axis_lo, float(chart.y.to_axis(v))]]))[0]
        pts.append({"px": [round(float(px[0]), 1), round(float(px[1]), 1)], "value": [chart.x.lo, v]})
    return {"id": "calibrate", "kind": "calibrate", "targets": targets, "model": "affine", "points": pts}


def manual_pick_op(ds, cl, rng, targets, clicks=12, max_offset=3.5):
    """Clicks near (not on) the curve, as a user relying on magnetic snap would make them."""
    out = []
    for f in np.linspace(0.06, 0.94, clicks):
        p, _ = arc_point(cl, f)
        q, _ = arc_point(cl, min(1.0, f + 0.002))
        t = (q - p) / np.hypot(*(q - p))
        n = np.array([-t[1], t[0]])
        c = p + n * rng.uniform(-max_offset, max_offset) + t * rng.uniform(-1.0, 1.0)
        out.append(round_to(c, 0.25))
    return {"id": f"pick-{ds.id}", "kind": "manualPick", "targets": targets, "datasetId": ds.id, "snap": True,
            "clicks": out}


def trace_op(ds, cl, targets):
    start, _ = arc_point(cl, 0.02)
    end, _ = arc_point(cl, 0.98)
    return {"id": f"trace-{ds.id}", "kind": "trace", "targets": targets, "datasetId": ds.id,
            "start": round_to(start, 0.5), "end": round_to(end, 0.5)}


def colour_mask_op(ds, cl, targets):
    p, _ = arc_point(cl, 0.5)
    return {"id": f"mask-{ds.id}", "kind": "colourMask", "targets": targets, "datasetId": ds.id,
            "pick": [math.floor(p[0]) + 0.5, math.floor(p[1]) + 0.5]}


def x_step_op(ds, cl, samples, targets):
    start, _ = arc_point(cl, 0.02)
    return {"id": f"xstep-{ds.id}", "kind": "xStep", "targets": targets, "datasetId": ds.id,
            "start": round_to(start, 0.5), "xs": [s["value"][0] for s in samples]}


def dumps(obj):
    """Indented JSON with each array of plain numbers on one line, so a centerline is one point per line."""
    text = json.dumps(obj, indent=1, ensure_ascii=False)
    return re.sub(r"\[\s*(-?[\d.eE+-]+(?:,\s*-?[\d.eE+-]+)*)\s*\]",
                  lambda m: "[" + ", ".join(v.strip() for v in m.group(1).split(",")) + "]", text) + "\n"


def write_sample(name, description, readme, chart, datasets, style, title, ops_fn, extras_fn=None, wrap=None):
    drawn, centerlines = [], []
    for ds in datasets:
        d, c = centerline(chart, ds)
        drawn.append(d)
        centerlines.append(c)
    assert all(len(d) > 50 for d in drawn)
    extras = extras_fn(drawn) if extras_fn else ()
    svg = draw_chart(chart, style, datasets, drawn, title, extras)
    crossings = intersections(chart, datasets)
    gt = ground_truth(name, description, chart, datasets, centerlines, crossings)
    out = SAMPLES / name
    out.mkdir(parents=True, exist_ok=True)
    body = svg.render() if wrap is None else wrap(svg)
    (out / "source.svg").write_text(body, encoding="utf-8")
    (out / "ground-truth.json").write_text(dumps(gt), encoding="utf-8")
    ops = {"opsVersion": OPS_VERSION, "sample": name, "ops": ops_fn(chart, datasets, centerlines, gt)}
    (out / "ops.json").write_text(dumps(ops), encoding="utf-8")
    (out / "README.md").write_text(readme(gt, ops), encoding="utf-8")
    return gt


def readme_text(title, purpose, gt, ops, notes=()):
    ax, ay = gt["axes"]["x"], gt["axes"]["y"]
    lines = [
        f"# Sample: {gt['sample']}",
        "",
        title,
        "",
        purpose,
        "",
        "## Files",
        "",
        "- `source.svg`: the vector source, drawn by `scripts/gen-samples.py`.",
        "- `source.png`: `source.svg` rasterized by `scripts/render-samples.ts` "
        f"({gt['image']['width']} × {gt['image']['height']} px). This is the image the app and the harness use.",
        "- `ground-truth.json`: exact axis transform, tick positions, curve centerlines (≤ 1 px spacing), "
        f"{SAMPLES_PER_DATASET} exact points per curve and curve intersections.",
        "- `ops.json`: the recorded user operations that `pnpm test:samples` replays.",
        "",
        "## Chart",
        "",
        f"- X axis: {ax['type']}, {ax['min']:g} to {ax['max']:g} {ax.get('unit', '')}".rstrip(),
        f"- Y axis: {ay['type']}, {ay['min']:g} to {ay['max']:g} {ay.get('unit', '')}".rstrip(),
        "",
        "| Dataset | Colour | Width (px) | Model |",
        "|---|---|---|---|",
    ]
    for d in gt["datasets"]:
        style = " dashed" if d["dash"] else ""
        lines.append(f"| {d['name']} | `{d['color']}`{style} | {d['lineWidthPx']} | `{d['model']['expression']}` |")
    lines += ["", "## Recorded operations", "", "| Op | Kind | Acceptance targets |", "|---|---|---|"]
    for op in ops["ops"]:
        lines.append(f"| `{op['id']}` | {op['kind']} | {', '.join(op['targets']) or '(setup only)'} |")
    if gt["intersections"]:
        lines += ["", "## Intersections", ""]
        for c in gt["intersections"]:
            lines.append(f"- {c['datasets'][0]} × {c['datasets'][1]} at px ({c['px'][0]:.1f}, {c['px'][1]:.1f}), "
                         f"crossing angle {c['angleDeg']:.1f}°")
    lines += ["", *notes, "", "Ground truth is immutable once committed; changing it needs an ADR in "
              "`docs/DECISIONS.md`. Regenerate with `python3 scripts/gen-samples.py`.", ""]
    return "\n".join(lines).replace("\n\n\n", "\n\n")


# ---------------------------------------------------------------- the four samples


def vector_clean():
    x = Axis("linear", 0, 100, "Flow rate Q", "m³/h", range(0, 101, 10), [v for v in range(0, 101, 2) if v % 10])
    y = Axis("linear", 0, 60, "Head H", "m", range(0, 61, 10), [v for v in range(0, 61, 2) if v % 10])
    chart = Chart(2400, 1600, (200, 110, 2320, 1450), x, y)
    common = {"x_unit": "m³/h", "y_unit": "m"}
    datasets = [
        Dataset("d1", "Pump A", "#1f77b4", 3, (4, 96), "poly", "H = 52 + 0.05 Q - 0.0035 Q^2 - 0.000012 Q^3",
                {"c": [52, 0.05, -0.0035, -0.000012]},
                lambda q: 52 + 0.05 * q - 0.0035 * q ** 2 - 0.000012 * q ** 3, **common),
        Dataset("d2", "Pump B", "#ff7f0e", 3, (4, 96), "exp", "H = 38 exp(-0.012 Q)", {"a": 38, "b": -0.012},
                lambda q: 38 * np.exp(-0.012 * q), **common),
        Dataset("d3", "Pump C", "#2ca02c", 3, (4, 96), "power", "H = 30 Q^-0.35", {"a": 30, "b": -0.35},
                lambda q: 30 * q ** -0.35, **common),
    ]
    style = {"background": "#ffffff", "grid": "#d4d4d4", "gridWidth": 1.5, "frame": "#000000", "frameWidth": 2,
             "text": "#000000", "fontSize": 28}

    def legend(drawn):
        x0, y0, w, h = 1900, 140, 390, 175
        box = box_points(x0, y0, x0 + w, y0 + h)
        assert min_distance(box, drawn) > 12, "legend overlaps a curve"
        parts = [f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="#ffffff" stroke="#000000" '
                 f'stroke-width="1.5"/>']
        for i, ds in enumerate(datasets):
            yy = y0 + 42 + i * 48
            parts.append(f'<line x1="{x0 + 24}" y1="{yy}" x2="{x0 + 104}" y2="{yy}" stroke="{ds.color}" '
                         f'stroke-width="{ds.width}"/>')
            parts.append(f'<text x="{x0 + 122}" y="{yy + 10}" font-family="{FONT}" font-size="28" '
                         f'fill="#000000">{ds.name}</text>')
        return parts

    def ops(chart, datasets, cls, gt):
        rng = np.random.default_rng(20261030)
        out = [calibration_op(chart, ["A1"])]
        out += [manual_pick_op(ds, cl, rng, ["A2"]) for ds, cl in zip(datasets, cls)]
        out += [trace_op(ds, cl, ["A3"]) for ds, cl in zip(datasets, cls)]
        out += [colour_mask_op(ds, cl, ["A5"]) for ds, cl in zip(datasets, cls)]
        out += [x_step_op(ds, cl, g["samples"], ["A6"]) for ds, cl, g in zip(datasets, cls, gt["datasets"])]
        return out

    write_sample(
        "vector-clean",
        "Clean vector pump chart: three coloured, non-crossing curves on a light grid (linear axes).",
        lambda gt, ops: readme_text(
            "A clean vector chart, as rendered from a PDF crop at about 300 DPI.",
            "Targets: A1 (calibration), A2 (snapped manual picks), A3 (guided trace ≤ 1 px RMS), A5 (colour mask "
            "≥ 98 % of length), A6 (X-step at 25 X values). The curves span about 2 000 px, which is the P4 "
            "trace size. The three model families (poly-3, exponential, power) are also A7 fit families.",
            gt, ops),
        chart, datasets, style, "Pump performance (synthetic)", ops, legend)


def sn_family():
    decades_x = [10.0 ** e for e in range(1, 8)]
    minor_x = [m * 10.0 ** e for e in range(1, 7) for m in range(2, 10)]
    decades_y = [10.0 ** e for e in range(1, 5)]
    minor_y = [m * 10.0 ** e for e in range(1, 4) for m in range(2, 10)]
    x = Axis("log10", 10, 1e7, "Number of cycles N", "", decades_x, minor_x, pow10_label)
    y = Axis("log10", 10, 1e4, "Stress amplitude S", "MPa", decades_y, minor_y, lambda v: f"{v:g}")
    chart = Chart(2000, 1500, (220, 110, 1900, 1330), x, y)
    common = {"x_unit": "cycles", "y_unit": "MPa"}

    def basquin(se, k, b):
        return lambda n: se + k * n ** -b

    curves = [("c1", "UTS 480 MPa", 480, 20, 15000, 0.48), ("c2", "UTS 690 MPa", 690, 200, 1000, 0.37),
              ("c3", "UTS 860 MPa", 860, 80, 7000, 0.75)]
    datasets = [
        Dataset(cid, name, "#000000", 2.5, (14, 7e6), "basquinEndurance", f"S = {se} + {k} N^-{b}",
                {"se": se, "k": k, "b": b}, basquin(se, k, b),
                param={"name": "UTS", "value": uts, "unit": "MPa"}, **common)
        for cid, name, uts, se, k, b in curves
    ]
    style = {"background": "#ffffff", "grid": "#9a9a9a", "gridWidth": 1.2, "minorGrid": "#d0d0d0",
             "minorGridWidth": 1, "frame": "#000000", "frameWidth": 2.5, "text": "#000000", "fontSize": 26}

    def labels(drawn):
        parts = []
        for ds, pts in zip(datasets, drawn):
            end = pts[-1]
            x0, y0 = end[0] - 230, end[1] + 46
            box = box_points(x0, y0 - 22, x0 + 215, y0 + 6)
            assert min_distance(box, drawn) > 8, f"label for {ds.id} overlaps a curve"
            parts.append(f'<text x="{x0:.1f}" y="{y0:.1f}" font-family="{FONT}" font-size="24" '
                         f'fill="#000000">{ds.name}</text>')
        return parts

    def ops(chart, datasets, cls, gt):
        return [calibration_op(chart, ["A1"])] + [trace_op(ds, cl, ["A4"]) for ds, cl in zip(datasets, cls)]

    gt = write_sample(
        "sn-family",
        "Log-log S-N curve family: three black curves of one colour that cross each other, on a dense log grid.",
        lambda gt, ops: readme_text(
            "A log-log fatigue (S-N) chart in the style of design-code figures: one ink colour, dense minor grid.",
            "Targets: A1 (calibration on log-log axes) and A4 (guided trace crosses every intersection without a "
            "wrong branch and without asking). The curves cross pairwise at the angles listed below, all ≥ 20°.",
            gt, ops),
        chart, datasets, style, "Design fatigue curves (synthetic)", ops, labels)
    assert len(gt["intersections"]) == 3 and all(c["angleDeg"] >= 20 for c in gt["intersections"])


def scan_tilted():
    x = Axis("linear", 0, 500, "Temperature T", "°C", range(0, 501, 50), [v for v in range(0, 501, 10) if v % 50])
    y = Axis("linear", 0, 160, "Allowable stress", "MPa", range(0, 161, 20), [v for v in range(0, 161, 5) if v % 20])
    width, height = 1700, 1200
    tilt = tilt_matrix(width, height, rotate_deg=1.6, scale_y=1.012, shear_x=0.006)
    chart = Chart(width, height, (190, 100, 1610, 1000), x, y, tilt)
    common = {"x_unit": "°C", "y_unit": "MPa"}
    datasets = [
        Dataset("d1", "Carbon steel", "#262626", 2.6, (20, 480), "logistic", "S = 118 / (1 + exp((T - 400) / 30)) + 20",
                {"a": 118, "t0": 400, "w": 30, "c": 20}, lambda t: 118 / (1 + np.exp((t - 400) / 30)) + 20,
                **common),
        Dataset("d2", "Low-alloy steel", "#262626", 2.6, (20, 480), "logistic",
                "S = 70 / (1 + exp((T - 380) / 30)) + 8", {"a": 70, "t0": 380, "w": 30, "c": 8},
                lambda t: 70 / (1 + np.exp((t - 380) / 30)) + 8, dash=[14, 8], **common),
    ]
    style = {"background": "#efe6cc", "grid": "#8c8c8c", "gridWidth": 1.1, "minorGrid": "#c4bba1",
             "minorGridWidth": 0.9, "frame": "#262626", "frameWidth": 2.2, "text": "#262626", "fontSize": 24}
    rng = np.random.default_rng(1970)

    def specks(drawn):
        parts = []
        while len(parts) < 140:
            p = np.array([rng.uniform(0, width), rng.uniform(0, height)])
            if min_distance(p[None, :], drawn) < 12:
                continue
            parts.append(f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{rng.uniform(0.6, 1.8):.2f}" fill="#262626"/>')
        for ds, pts in zip(datasets, drawn):
            mid = pts[len(pts) // 4]
            box = box_points(mid[0] - 10, mid[1] - 52, mid[0] + 200, mid[1] - 26)
            assert min_distance(box, drawn) > 8, f"label for {ds.id} overlaps a curve"
            parts.append(f'<text x="{mid[0] - 10:.1f}" y="{mid[1] - 30:.1f}" font-family="{FONT}" font-size="22" '
                         f'font-style="italic" fill="#262626">{ds.name}</text>')
        return parts

    a, b, c, d, e, f = tilt[0, 0], tilt[1, 0], tilt[0, 1], tilt[1, 1], tilt[0, 2], tilt[1, 2]

    def wrap(svg):
        # Scanner look: the page is tilted (affine), slightly blurred, tinted and grainy. Blur and grain do not
        # move the centreline, so the ground truth stays exact.
        defs = (f'<defs><filter id="scan" filterUnits="userSpaceOnUse" x="0" y="0" width="{width}" height="{height}" '
                'color-interpolation-filters="sRGB">'
                '<feGaussianBlur in="SourceGraphic" stdDeviation="0.85" result="soft"/>'
                '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="grain"/>'
                '<feColorMatrix in="grain" type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 '
                '0.33 0.33 0.33 0 0 0 0 0 0 1" result="gray"/>'
                '<feComposite in="soft" in2="gray" operator="arithmetic" k1="0" k2="1" k3="0.16" k4="-0.08"/>'
                '</filter></defs>\n')
        inner = "\n".join(svg.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
                f'viewBox="0 0 {width} {height}">\n{defs}<g filter="url(#scan)">\n'
                f'<rect x="0" y="0" width="{width}" height="{height}" fill="{style["background"]}"/>\n'
                f'<g transform="matrix({a:.12g} {b:.12g} {c:.12g} {d:.12g} {e:.12g} {f:.12g})">\n{inner}\n</g>\n'
                '</g>\n</svg>\n')

    def ops(chart, datasets, cls, gt):
        return [calibration_op(chart, [])] + [trace_op(ds, cl, ["A3"]) for ds, cl in zip(datasets, cls)]

    gt = write_sample(
        "scan-tilted",
        "Tilted, blurred, grainy 1970s-style scan: two black curves (one dashed) on a dark printed grid.",
        lambda gt, ops: readme_text(
            "A scanned design chart: the page is rotated 1.6° with a slight vertical stretch and shear, blurred, "
            "tinted and grainy, with dust specks.",
            "Target: A3 (guided trace ≤ 2 px RMS). The dashed curve exercises gap bridging; the tilt exercises "
            "affine calibration. The ground-truth transform includes the tilt.",
            gt, ops,
            ["Specks are kept at least 12 px from the curves so they never touch the ground-truth centerline."]),
        chart, datasets, style, "Allowable stress vs temperature (synthetic)", ops, specks, wrap)
    assert not gt["intersections"]


def dark_bg():
    x = Axis("linear", 0, 10, "Time t", "s", range(0, 11, 1), [v / 2 for v in range(1, 20, 2)])
    decades = [10.0 ** e for e in range(0, 5)]
    minor = [m * 10.0 ** e for e in range(0, 4) for m in range(2, 10)]
    y = Axis("log10", 1, 1e4, "Count", "", decades, minor, lambda v: f"{v:g}")
    chart = Chart(1800, 1200, (190, 100, 1720, 1050), x, y)
    datasets = [
        Dataset("d1", "Run 1", "#4cc9f0", 3, (0.3, 9.7), "exp", "N = 2 * 10^(0.35 t)", {"a": 2, "b": 0.35 * math.log(10)},
                lambda t: 2 * 10 ** (0.35 * t), x_unit="s", y_unit=""),
        Dataset("d2", "Run 2", "#ffd166", 3, (0.3, 9.7), "exp", "N = 1.2 * 10^(0.30 t)",
                {"a": 1.2, "b": 0.30 * math.log(10)}, lambda t: 1.2 * 10 ** (0.30 * t), x_unit="s", y_unit=""),
    ]
    style = {"background": "#1e2227", "grid": "#465063", "gridWidth": 1.2, "minorGrid": "#2d333d",
             "minorGridWidth": 1, "frame": "#c5cad3", "frameWidth": 2, "text": "#c5cad3", "fontSize": 24}

    def labels(drawn):
        parts = []
        for ds, pts, dy in zip(datasets, drawn, (-40, 50)):
            mid = pts[int(len(pts) * 0.6)]
            box = box_points(mid[0] - 40, mid[1] + dy - 22, mid[0] + 40, mid[1] + dy + 6)
            assert min_distance(box, drawn) > 8, f"label for {ds.id} overlaps a curve"
            parts.append(f'<text x="{mid[0]:.1f}" y="{mid[1] + dy:.1f}" font-family="{FONT}" font-size="24" '
                         f'text-anchor="middle" fill="{ds.color}">{ds.name}</text>')
        return parts

    def ops(chart, datasets, cls, gt):
        return [calibration_op(chart, [])] + [trace_op(ds, cl, []) for ds, cl in zip(datasets, cls)]

    write_sample(
        "dark-bg",
        "Dark-background semi-log chart: two bright curves on a dark grid (linear x, log10 y).",
        lambda gt, ops: readme_text(
            "A dark-theme chart, as exported from plotting tools and dashboards.",
            "Used by the pre-processing panel (task 2.2): dark-background detection must suggest Invert. No "
            "accuracy target is measured on it; its ops are setup steps for demos and e2e tests.",
            gt, ops),
        chart, datasets, style, "Counts vs time (synthetic)", ops, labels)


def main():
    vector_clean()
    sn_family()
    scan_tilted()
    dark_bg()
    names = ["vector-clean", "sn-family", "scan-tilted", "dark-bg"]
    if "--no-render" not in sys.argv:
        subprocess.run(["node", str(ROOT / "scripts" / "render-samples.ts"), *[str(SAMPLES / n) for n in names]],
                       check=True, cwd=ROOT)


if __name__ == "__main__":
    main()
