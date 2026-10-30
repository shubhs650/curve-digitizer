#!/usr/bin/env python3
"""Generate NumPy reference fixtures for packages/math.

Run from the repository root:  python3 scripts/gen-fixtures.py
Needs NumPy only. Output is deterministic (seeded) and written to packages/math/fixtures/.

The reference implementations below are deliberately written independently of the TypeScript code:
affine uses np.linalg.lstsq on raw pixel coordinates, the DLT uses np.linalg.svd, the Jacobian is the
quotient rule in matrix form, and inverse mapping uses np.linalg.inv.
"""

import json
import math
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "packages" / "math" / "fixtures"
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


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {"generator": "scripts/gen-fixtures.py", "numpy": np.__version__}
    (OUT / name).write_text(json.dumps({"meta": meta, **data}, indent=2) + "\n")


if __name__ == "__main__":
    write("transforms.json", {"cases": transform_cases()})
    write("linalg.json", linalg_cases())
    write("crossings.json", {"cases": crossing_cases()})
    print(f"wrote fixtures to {OUT}")
