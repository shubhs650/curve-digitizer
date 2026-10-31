#!/usr/bin/env python3
"""Generate NumPy reference fixtures for packages/math and packages/image.

Run from the repository root:  python3 scripts/gen-fixtures.py
Needs NumPy and SciPy. Output is deterministic (seeded) and written to packages/math/fixtures/,
packages/image/fixtures/ and packages/fit/fixtures/.

The reference implementations below are deliberately written independently of the TypeScript code:
affine uses np.linalg.lstsq on raw pixel coordinates, the DLT uses np.linalg.svd, the Jacobian is the
quotient rule in matrix form, and inverse mapping uses np.linalg.inv.
"""

import json
import math
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "packages" / "math" / "fixtures"
IMAGE_OUT = Path(__file__).resolve().parent.parent / "packages" / "image" / "fixtures"
FIT_OUT = Path(__file__).resolve().parent.parent / "packages" / "fit" / "fixtures"
RNG = np.random.default_rng(20261030)
PICK_SIGMA_PX = 0.5
DEFAULT_LINE_WIDTH_PX = 2.0


def to_axis(values, axes):
    out = np.array(values, dtype=float)
    for k, kind in enumerate(axes):
        if kind == "log10":
            out[:, k] = np.log10(out[:, k])
    return out


def from_axis(axis, axes):
    return np.array([10.0 ** a if kind == "log10" else a for a, kind in zip(axis, axes)])


def apply(m, p):
    h = m @ np.array([p[0], p[1], 1.0])
    return h[:2] / h[2]


def solve_affine(px, ax):
    design = np.column_stack([px, np.ones(len(px))])
    coef, *_ = np.linalg.lstsq(design, ax, rcond=None)
    m = np.eye(3)
    m[:2, :] = coef.T
    return m


def normalizer(pts):
    """Per-coordinate shift to zero mean and scale to unit RMS deviation (the TS code uses the same)."""
    c = pts.mean(axis=0)
    s = 1.0 / np.sqrt(((pts - c) ** 2).mean(axis=0))
    return np.array([[s[0], 0, -s[0] * c[0]], [0, s[1], -s[1] * c[1]], [0, 0, 1.0]])


def solve_projective(px, ax):
    tp, ta = normalizer(px), normalizer(ax)
    pn = (tp @ np.column_stack([px, np.ones(len(px))]).T).T[:, :2]
    an = (ta @ np.column_stack([ax, np.ones(len(ax))]).T).T[:, :2]
    rows = []
    for (x, y), (u, v) in zip(pn, an):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(rows))
    hn = vt[-1].reshape(3, 3)
    m = np.linalg.inv(ta) @ hn @ tp
    return m / m[2, 2]


def residuals(m, px, ax):
    inv = np.linalg.inv(m)
    back = np.array([apply(inv, a) for a in ax])
    fwd = np.array([apply(m, p) for p in px])
    res_px = np.linalg.norm(back - px, axis=1)
    return {
        "px": res_px.tolist(),
        "axis": (fwd - ax).tolist(),
        "rmsPx": float(math.sqrt((res_px**2).mean())),
    }


def axis_jacobian(m, p):
    h = m @ np.array([p[0], p[1], 1.0])
    w = h[2]
    uv = h[:2] / w
    return (m[:2, :2] - np.outer(uv, m[2, :2])) / w


def value_jacobian(m, p, axes):
    j = axis_jacobian(m, p)
    a = apply(m, p)
    scale = np.array([math.log(10) * 10.0**ak if kind == "log10" else 1.0 for ak, kind in zip(a, axes)])
    return scale[:, None] * j


def sigma(m, p, axes, line_width):
    s_px = math.hypot(PICK_SIGMA_PX, line_width / 2)
    j = value_jacobian(m, p, axes)
    return (s_px * np.sqrt((j**2).sum(axis=1))).tolist()


def make_case(name, model, axes, px, values, queries):
    px = np.array(px, dtype=float)
    ax = to_axis(values, axes)
    m = solve_affine(px, ax) if model == "affine" else solve_projective(px, ax)
    case = {
        "name": name,
        "model": model,
        "axes": {"x": axes[0], "y": axes[1]},
        "points": [{"px": p.tolist(), "value": list(map(float, v))} for p, v in zip(px, values)],
        "matrix": m.flatten().tolist(),
        "residuals": residuals(m, px, ax),
        "queries": [],
    }
    for q in queries:
        lw = q.get("lineWidthPx", DEFAULT_LINE_WIDTH_PX)
        case["queries"].append(
            {
                "px": list(q["px"]),
                "lineWidthPx": lw,
                "value": from_axis(apply(m, q["px"]), axes).tolist(),
                "axisJacobian": axis_jacobian(m, q["px"]).flatten().tolist(),
                "valueJacobian": value_jacobian(m, q["px"], axes).flatten().tolist(),
                "sigma": sigma(m, q["px"], axes, lw),
            }
        )
    return case


def tilted_points(true_m, axis_pts, noise_px):
    """Pixel positions of known axis points under a ground-truth px→axis matrix, plus pick noise."""
    inv = np.linalg.inv(true_m)
    px = np.array([apply(inv, a) for a in axis_pts])
    return px + RNG.normal(0.0, noise_px, px.shape) if noise_px else px


def transform_cases():
    cases = []

    # Clean, untilted linear chart: 4 exact correspondences, affine fits exactly.
    cases.append(
        make_case(
            "linear-exact-affine",
            "affine",
            ("linear", "linear"),
            [[100, 900], [1100, 900], [100, 100], [1100, 100]],
            [[0, 0], [10, 0], [0, 400], [10, 400]],
            [{"px": [600, 500]}, {"px": [250.5, 812.25], "lineWidthPx": 3.1}],
        )
    )

    # Scan tilted by 2°, y axis log10, 8 noisy picks (over-determined affine).
    theta = math.radians(2.0)
    rot = np.array([[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]])
    true_m = np.eye(3)
    true_m[:2, :2] = np.diag([4.0 / 1800, -3.0 / 1500]) @ rot
    true_m[:2, 2] = -true_m[:2, :2] @ np.array([150.0, 1650.0])
    axis_pts = np.array([[0, 0], [4, 0], [0, 3], [4, 3], [2, 0], [0, 1.5], [4, 1.5], [2, 3]])
    px = tilted_points(true_m, axis_pts, 0.3)
    values = [[a[0], 10.0 ** a[1]] for a in axis_pts]
    cases.append(
        make_case(
            "tilted-semilog-noisy-affine",
            "affine",
            ("linear", "log10"),
            px.tolist(),
            values,
            [{"px": [900.0, 800.0]}, {"px": [1700.0, 300.0], "lineWidthPx": 1.0}],
        )
    )

    # Log-log S-N style chart, perspective-distorted photo: projective, exact with 4 points.
    true_p = np.array([[1.9e-3, 2.0e-4, 0.8], [1.0e-4, -1.6e-3, 3.1], [2.0e-6, 3.0e-5, 1.0]])
    axis_pts = np.array([[1, 1], [6, 1], [1, 3], [6, 3]])
    px = tilted_points(true_p, axis_pts, 0.0)
    values = [[10.0 ** a[0], 10.0 ** a[1]] for a in axis_pts]
    cases.append(
        make_case(
            "loglog-exact-projective",
            "projective",
            ("log10", "log10"),
            px.tolist(),
            values,
            [{"px": px.mean(axis=0).tolist()}, {"px": (px[0] * 0.7 + px[3] * 0.3).tolist(), "lineWidthPx": 4.0}],
        )
    )

    # Same distortion, 9 noisy picks: projective least squares (algebraic, normalized DLT).
    axis_pts = np.array([[x, y] for x in (1, 3.5, 6) for y in (1, 2, 3)], dtype=float)
    px = tilted_points(true_p, axis_pts, 0.4)
    values = [[10.0 ** a[0], 10.0 ** a[1]] for a in axis_pts]
    cases.append(
        make_case(
            "loglog-noisy-projective",
            "projective",
            ("log10", "log10"),
            px.tolist(),
            values,
            [{"px": px.mean(axis=0).tolist()}],
        )
    )

    # Wildly different axis magnitudes (x in 1e-6, y in 1e5) to exercise conditioning.
    cases.append(
        make_case(
            "mixed-scale-affine",
            "affine",
            ("linear", "linear"),
            [[80.25, 1203.5], [2410.75, 1199.0], [77.5, 61.0], [2413.0, 58.25], [1250.0, 630.0]],
            [[0.0, 0.0], [5.0e-6, 0.0], [0.0, 2.5e5], [5.0e-6, 2.5e5], [2.5e-6, 1.25e5]],
            [{"px": [1000.0, 400.0]}],
        )
    )
    return cases


def solve_crossings(x_picks, y_picks):
    """Exact affine from two picks per axis with unknown crossings (task 1.3).

    u = a·px + b·py + c with u(X1), u(X2) known and u(Y1) = u(Y2) = u_c unknown; likewise v with v_c.
    Returns (v_c, u_c): the axis-space v the X picks lie on and the u the Y picks lie on.
    """
    (x1, u1), (x2, u2) = x_picks
    (y1, v1), (y2, v2) = y_picks
    a_u = np.array([[*x1, 1, 0], [*x2, 1, 0], [*y1, 1, -1], [*y2, 1, -1]], dtype=float)
    u_c = np.linalg.solve(a_u, [u1, u2, 0, 0])[3]
    a_v = np.array([[*y1, 1, 0], [*y2, 1, 0], [*x1, 1, -1], [*x2, 1, -1]], dtype=float)
    v_c = np.linalg.solve(a_v, [v1, v2, 0, 0])[3]
    return float(v_c), float(u_c)


def crossing_cases():
    cases = []
    for name, theta_deg, skew_deg, crossing in (
        ("upright", 0.0, 0.0, (0.0, 0.0)),
        ("tilted-3deg-offset-origin", 3.0, 0.0, (20.0, 1.0)),
        ("skewed-1.5deg", -1.0, 1.5, (-5.0, 2.5)),
    ):
        t = math.radians(theta_deg)
        k = math.radians(skew_deg)
        # Axis directions in px for one axis unit; y up on the chart is −py.
        ex = np.array([math.cos(t), math.sin(t)]) * 21.2
        ey = np.array([math.sin(t + k), -math.cos(t + k)]) * 18.4
        origin = np.array([200.0, 1450.0])
        u_c, v_c = crossing  # Y picks lie on u = u_c, X picks on v = v_c
        px_of = lambda u, v: (origin + u * ex + v * ey).tolist()
        x_picks = [(px_of(10.0, v_c), 10.0), (px_of(90.0, v_c), 90.0)]
        y_picks = [(px_of(u_c, 10.0), 10.0), (px_of(u_c, 50.0), 50.0)]
        got_v, got_u = solve_crossings(x_picks, y_picks)
        cases.append(
            {
                "name": name,
                "x": [{"px": p, "axis": a} for p, a in x_picks],
                "y": [{"px": p, "axis": a} for p, a in y_picks],
                "xAxisAt": got_v,
                "yAxisAt": got_u,
            }
        )
    return cases


def linalg_cases():
    a = RNG.normal(size=(12, 5)) * np.array([1, 10, 1e3, 1e-2, 1])
    b = RNG.normal(size=12)
    x, *_ = np.linalg.lstsq(a, b, rcond=None)
    s_mat = RNG.normal(size=(10, 9))
    sv = np.linalg.svd(s_mat, compute_uv=False)
    _, _, vt = np.linalg.svd(s_mat)
    m3 = RNG.normal(size=(3, 3))
    return {
        "lstsq": {"a": a.tolist(), "b": b.tolist(), "x": x.tolist()},
        "svd": {"a": s_mat.tolist(), "values": sv.tolist(), "vLast": vt[-1].tolist()},
        "invert3": {"m": m3.flatten().tolist(), "inv": np.linalg.inv(m3).flatten().tolist()},
    }


def brute_force_edt(mask):
    """Distance from each set pixel centre to the nearest unset pixel centre, the image border counting as
    unset: pad with a ring of zeros, then take the minimum over every unset pixel."""
    padded = np.pad(mask, 1)
    zy, zx = np.nonzero(padded == 0)
    out = np.zeros(mask.shape)
    for y, x in zip(*np.nonzero(mask)):
        out[y, x] = np.sqrt(np.min((zy - (y + 1)) ** 2 + (zx - (x + 1)) ** 2))
    return out


def reference_otsu(values, bins=256):
    """Otsu by exhaustive search over histogram splits, maximising w0 w1 (mu0 - mu1)^2."""
    hist, _ = np.histogram(np.clip(np.floor(values * bins), 0, bins - 1), bins=bins, range=(0, bins))
    centres = np.arange(bins) + 0.5
    best, best_bin = -1.0, 0
    for i in range(bins - 1):
        w0, w1 = hist[: i + 1].sum(), hist[i + 1 :].sum()
        if w0 == 0 or w1 == 0:
            continue
        mu0 = (hist[: i + 1] * centres[: i + 1]).sum() / w0
        mu1 = (hist[i + 1 :] * centres[i + 1 :]).sum() / w1
        between = w0 * w1 * (mu0 - mu1) ** 2
        if between > best:
            best, best_bin = between, i
    return (best_bin + 1) / bins


def image_cases():
    rng = np.random.default_rng(20261031)
    masks = {
        "random": (rng.random((13, 17)) < 0.7).astype(np.uint8),
        "stroke": np.zeros((15, 21), dtype=np.uint8),
        "blob": np.zeros((16, 16), dtype=np.uint8),
    }
    masks["stroke"][5:8, :] = 1
    masks["stroke"][:, 9:11] = 1
    yy, xx = np.mgrid[0:16, 0:16]
    masks["blob"][(yy - 7.5) ** 2 + (xx - 8.0) ** 2 <= 36] = 1
    edt = [
        {"name": name, "width": m.shape[1], "height": m.shape[0], "mask": m.flatten().tolist(),
         "distance": brute_force_edt(m).flatten().tolist()}
        for name, m in masks.items()
    ]
    paper = rng.normal(0.03, 0.02, 3000)
    ink = rng.normal(0.6, 0.08, 400)
    grid = rng.normal(0.17, 0.02, 300)
    values = np.clip(np.concatenate([paper, ink, grid]), 0, 1)
    return {"edt": edt, "otsu": {"values": values.tolist(), "threshold": reference_otsu(values)}}


def reference_lab(rgb):
    """sRGB (8-bit) to CIELAB D65 straight from the IEC 61966-2-1 and CIE 15 formulas, vectorised in NumPy."""
    c = np.asarray(rgb, dtype=float) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    d = 6 / 29
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d * d) + 4 / 29)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def reference_median(img, r):
    """Brute-force (2r+1)^2 median with the edge replicated."""
    padded = np.pad(img, r, mode="edge")
    out = np.zeros_like(img)
    h, w = img.shape
    for y in range(h):
        for x in range(w):
            out[y, x] = np.median(padded[y:y + 2 * r + 1, x:x + 2 * r + 1])
    return out


def reference_zhang_suen(mask, min_neighbours=2):
    """Zhang-Suen thinning as published (1984), written from the paper: two sub-iterations until stable.
    min_neighbours=3 is the Lu-Wang (1986) correction, which keeps diagonal strokes two pixels thick."""
    img = np.pad(mask.astype(np.uint8), 1)
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            remove = []
            for y in range(1, img.shape[0] - 1):
                for x in range(1, img.shape[1] - 1):
                    if not img[y, x]:
                        continue
                    p = [img[y - 1, x], img[y - 1, x + 1], img[y, x + 1], img[y + 1, x + 1],
                         img[y + 1, x], img[y + 1, x - 1], img[y, x - 1], img[y - 1, x - 1]]
                    b = sum(p)
                    a = sum(1 for k in range(8) if p[k] == 0 and p[(k + 1) % 8] == 1)
                    p2, p4, p6, p8 = p[0], p[2], p[4], p[6]
                    if step == 0:
                        cond = p2 * p4 * p6 == 0 and p4 * p6 * p8 == 0
                    else:
                        cond = p2 * p4 * p8 == 0 and p2 * p6 * p8 == 0
                    if min_neighbours <= b <= 6 and a == 1 and cond:
                        remove.append((y, x))
            for y, x in remove:
                img[y, x] = 0
            if remove:
                changed = True
    return img[1:-1, 1:-1]


def filter_cases():
    rng = np.random.default_rng(20261101)
    colours = np.concatenate([
        np.array([[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [31, 119, 180],
                  [255, 127, 14], [44, 160, 44], [38, 38, 38], [10, 10, 10], [5, 3, 1]]),
        rng.integers(0, 256, (20, 3)),
    ])
    lab = reference_lab(colours)
    grey = rng.integers(0, 256, (9, 11)).astype(float)
    grey[4, 5] = 255
    medians = [{"radius": r, "width": 11, "height": 9, "input": grey.flatten().astype(int).tolist(),
                "output": reference_median(grey, r).flatten().astype(int).tolist()} for r in (1, 2)]
    shapes = {}
    bar = np.zeros((12, 24), dtype=np.uint8)
    bar[4:9, 2:22] = 1
    shapes["bar"] = bar
    cross = np.zeros((21, 21), dtype=np.uint8)
    cross[9:12, 2:19] = 1
    cross[2:19, 9:12] = 1
    shapes["cross"] = cross
    yy, xx = np.mgrid[0:20, 0:20]
    ring = (((yy - 9.5) ** 2 + (xx - 9.5) ** 2 <= 64) & ((yy - 9.5) ** 2 + (xx - 9.5) ** 2 >= 16)).astype(np.uint8)
    shapes["ring"] = ring
    shapes["random"] = (rng.random((14, 18)) < 0.55).astype(np.uint8)
    # A 45 degree stroke two pixels thick, which plain Zhang-Suen erases completely.
    shapes["diagonal"] = ((xx - yy >= 0) & (xx - yy <= 1) & (xx >= 2) & (xx <= 17)).astype(np.uint8)
    thinning = [{"name": n, "width": m.shape[1], "height": m.shape[0], "mask": m.flatten().tolist(),
                 "skeleton": reference_zhang_suen(m).flatten().astype(int).tolist(),
                 "skeletonLuWang": reference_zhang_suen(m, 3).flatten().astype(int).tolist()}
                for n, m in shapes.items()]
    return {"lab": {"rgb": colours.tolist(), "lab": lab.tolist()}, "median": medians, "thinning": thinning}


# ---------------------------------------------------------------------------------------------------------
# Fitting (task 3.1). SciPy is the reference for splines and nonlinear least squares; its own generator keeps
# the fixtures above unchanged.

def fit_rng():
    return np.random.default_rng(20261031)


def poly_cases(rng):
    cases = []
    for name, x, degree in [
        ("cubic", np.linspace(-2.0, 3.0, 25), 3),
        ("line-offset", np.linspace(100.0, 600.0, 18), 1),
        ("quintic-uneven", np.sort(rng.uniform(0.0, 10.0, 40)), 5),
        ("nonic", np.linspace(-1.0, 1.0, 30), 9),
    ]:
        y = np.sin(x / (x.max() - x.min()) * 4.0) * 10.0 + 0.1 * x + rng.normal(0.0, 0.05, len(x))
        coef = np.polyfit(x, y, degree)[::-1]
        queries = np.linspace(x.min(), x.max(), 7)
        cases.append({"name": name, "x": x.tolist(), "y": y.tolist(), "degree": degree,
                      "coefficients": coef.tolist(), "queries": queries.tolist(),
                      "values": np.polynomial.polynomial.polyval(queries, coef).tolist()})
    return cases


def spline_cases(rng):
    from scipy.interpolate import CubicSpline, PchipInterpolator
    cases = []
    knots_sets = {
        "smooth": (np.array([0.0, 1.0, 2.5, 3.0, 4.5, 6.0]), np.array([1.0, 2.0, 1.5, 0.2, -1.0, 0.5])),
        "monotone-flat": (np.array([0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0]),
                          np.array([0.0, 0.0, 1.0, 3.0, 3.0, 3.5, 8.0])),
        "two-knots": (np.array([2.0, 5.0]), np.array([1.0, -2.0])),
        "three-knots": (np.array([-1.0, 0.5, 4.0]), np.array([3.0, 0.0, 2.0])),
        "sign-change-ends": (np.array([0.0, 0.2, 1.5, 1.6, 4.0]), np.array([5.0, 0.0, 4.0, 4.1, -3.0])),
    }
    for name, (t, v) in knots_sets.items():
        queries = np.concatenate([np.linspace(t[0] - 0.5, t[-1] + 0.5, 23), t])
        natural = CubicSpline(t, v, bc_type="natural")
        pchip = PchipInterpolator(t, v, extrapolate=True)
        cases.append({"name": name, "knots": t.tolist(), "values": v.tolist(), "queries": queries.tolist(),
                      "natural": natural(queries).tolist(), "naturalSecond": natural(t, 2).tolist(),
                      "naturalSlopes": natural(t, 1).tolist(),
                      "pchip": pchip(queries).tolist(), "pchipSlopes": pchip(t, 1).tolist()})
    return cases


def lsq_spline_case(rng):
    """Least-squares natural cubic spline on fixed knots: the spline is linear in its knot values, so the
    design matrix column j is the natural spline through the j-th unit vector."""
    from scipy.interpolate import CubicSpline
    x = np.sort(rng.uniform(0.0, 10.0, 60))
    y = np.exp(-0.3 * x) * np.cos(x) + rng.normal(0.0, 0.02, len(x))
    knots = np.quantile(x, np.linspace(0.0, 1.0, 7))
    design = np.column_stack([CubicSpline(knots, np.eye(len(knots))[j], bc_type="natural")(x)
                              for j in range(len(knots))])
    values, *_ = np.linalg.lstsq(design, y, rcond=None)
    lin_design = np.column_stack([np.interp(x, knots, np.eye(len(knots))[j]) for j in range(len(knots))])
    lin_values, *_ = np.linalg.lstsq(lin_design, y, rcond=None)
    return {"x": x.tolist(), "y": y.tolist(), "knots": knots.tolist(), "naturalValues": values.tolist(),
            "linearValues": lin_values.tolist()}


def curve_fit_cases(rng):
    from scipy.optimize import curve_fit
    cases = []
    x = np.linspace(1.0, 50.0, 30)
    y = 120.0 * x ** -0.62 + rng.normal(0.0, 0.4, len(x))
    p, _ = curve_fit(lambda x, a, b: a * x ** b, x, y, p0=[100.0, -0.5], xtol=1e-15, ftol=1e-15, gtol=1e-15)
    cases.append({"model": "power", "x": x.tolist(), "y": y.tolist(), "p0": [100.0, -0.5], "params": p.tolist()})
    x = np.linspace(0.0, 4.0, 35)
    y = 2.5 * np.exp(0.8 * x) + rng.normal(0.0, 0.3, len(x))
    p, _ = curve_fit(lambda x, a, b: a * np.exp(b * x), x, y, p0=[2.0, 0.7], xtol=1e-15, ftol=1e-15, gtol=1e-15)
    cases.append({"model": "exp", "x": x.tolist(), "y": y.tolist(), "p0": [2.0, 0.7], "params": p.tolist()})
    x = np.linspace(0.0, 8.0, 40)
    y = (1.0 + 2.0 * x) / (1.0 + 0.5 * x) + rng.normal(0.0, 0.02, len(x))
    p, _ = curve_fit(lambda x, p0, p1, q1: (p0 + p1 * x) / (1.0 + q1 * x), x, y, p0=[1.2, 1.5, 0.3],
                     xtol=1e-15, ftol=1e-15, gtol=1e-15)
    cases.append({"model": "rational11", "x": x.tolist(), "y": y.tolist(), "p0": [1.2, 1.5, 0.3],
                  "params": p.tolist()})
    return cases


def aicc(rss, n, k):
    return n * math.log(rss / n) + 2 * k + 2 * k * (k + 1) / (n - k - 1)


def fit_math_cases():
    rng = fit_rng()
    return {"poly": poly_cases(rng), "splines": spline_cases(rng), "lsqSpline": lsq_spline_case(rng),
            "curveFit": curve_fit_cases(rng),
            "aicc": [{"rss": r, "n": n, "k": k, "aicc": aicc(r, n, k)}
                     for r, n, k in [(1.5, 20, 3), (2.0e-6, 45, 7), (310.0, 12, 2)]]}


def recommend_cases():
    """Synthetic datasets for A7: the recommendation must pick the family each was drawn from.

    Noise is Gaussian with sigma a fraction of the y range (in fit space), at the 0.3 % a careful digitization
    reaches and at a rougher 1 %."""
    rng = np.random.default_rng(20261101)
    families = {
        "power": ("power", "linear", "linear", lambda n: np.linspace(1.0, 60.0, n), lambda x: 85.0 * x ** -0.55),
        "exp": ("exp", "linear", "linear", lambda n: np.linspace(0.0, 5.0, n), lambda x: 1.8 * np.exp(0.72 * x)),
        "exp-decay": ("exp", "linear", "linear", lambda n: np.linspace(0.0, 400.0, n),
                      lambda x: 950.0 * np.exp(-0.009 * x)),
        "poly3": ("poly", "linear", "linear", lambda n: np.linspace(-3.0, 4.0, n),
                  lambda x: 0.5 * x ** 3 - 2.0 * x ** 2 - 1.5 * x + 4.0),
        "piecewise": ("piecewise", "linear", "linear", lambda n: np.linspace(0.0, 10.0, n),
                      lambda x: np.where(x < 4.0, 2.0 + 1.5 * x, 8.0 - 0.4 * (x - 4.0))),
        "piecewise-3": ("piecewise", "linear", "linear", lambda n: np.linspace(0.0, 30.0, n),
                        lambda x: np.interp(x, [0.0, 8.0, 19.0, 30.0], [10.0, 40.0, 45.0, 12.0])),
        "power-loglog": ("power", "log10", "log10", lambda n: np.logspace(1.0, 6.0, n),
                         lambda x: 4000.0 * x ** -0.25),
        "exp-semilog": ("exp", "linear", "log10", lambda n: np.linspace(0.0, 600.0, n),
                        lambda x: 2.0e5 * np.exp(-0.011 * x)),
    }
    cases = []
    for name, (family, xaxis, yaxis, xs, f) in families.items():
        for n in (30, 60):
            for rel in (0.003, 0.01):
                x = xs(n)
                y = f(x)
                if yaxis == "log10":
                    v = np.log10(y)
                    y = 10.0 ** (v + rng.normal(0.0, rel * (v.max() - v.min()), n))
                else:
                    y = y + rng.normal(0.0, rel * (y.max() - y.min()), n)
                cases.append({"name": f"{name} n={n} noise={rel * 100:g}%", "family": family,
                              "degree": 3 if family == "poly" else None,
                              "axes": {"x": xaxis, "y": yaxis}, "x": x.tolist(), "y": y.tolist()})
    return cases


def write(name, data, out=OUT):
    out.mkdir(parents=True, exist_ok=True)
    meta = {"generator": "scripts/gen-fixtures.py", "numpy": np.__version__}
    if out == FIT_OUT or name == "fits.json":
        import scipy
        meta["scipy"] = scipy.__version__
    (out / name).write_text(json.dumps({"meta": meta, **data}, indent=2) + "\n")


if __name__ == "__main__":
    write("transforms.json", {"cases": transform_cases()})
    write("linalg.json", linalg_cases())
    write("crossings.json", {"cases": crossing_cases()})
    write("thinness.json", image_cases(), IMAGE_OUT)
    write("filters.json", filter_cases(), IMAGE_OUT)
    write("fits.json", fit_math_cases())
    write("recommend.json", {"cases": recommend_cases()}, FIT_OUT)
    print(f"wrote fixtures to {OUT}, {IMAGE_OUT} and {FIT_OUT}")
