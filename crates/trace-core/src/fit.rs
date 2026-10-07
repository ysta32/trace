//! Closed pixel contour -> lines + cubic Béziers.
//!
//! 1. The contour (pixel-corner vertices) is expanded to unit steps.
//! 2. Corners are found by the turning angle between the chords to the points
//!    `window` steps behind and ahead, with non-maximum suppression.
//! 3. The staircase is smoothed with a [1,2,1]/4 kernel, corners pinned.
//! 4. Each run between corners is fitted with Schneider's least-squares cubic
//!    algorithm (recursive split at the worst point, tangent-continuous joins).
//! 5. Cubics whose control points hug the chord are emitted as lines.
use crate::svgpath::Seg;

type P = (f64, f64);

#[derive(Debug, Clone, Copy)]
pub struct FitParams {
    /// Minimum turning angle (degrees) for a corner.
    pub corner_deg: f64,
    /// Maximum fitting error, in working pixels.
    pub tol: f64,
    /// [1,2,1]/4 smoothing passes.
    pub smooth_iters: usize,
    /// Corner detection half-window, in unit steps.
    pub window: usize,
}

#[inline]
fn sub(a: P, b: P) -> P {
    (a.0 - b.0, a.1 - b.1)
}
#[inline]
fn add(a: P, b: P) -> P {
    (a.0 + b.0, a.1 + b.1)
}
#[inline]
fn mul(a: P, s: f64) -> P {
    (a.0 * s, a.1 * s)
}
#[inline]
fn dot(a: P, b: P) -> f64 {
    a.0 * b.0 + a.1 * b.1
}
#[inline]
fn len(a: P) -> f64 {
    dot(a, a).sqrt()
}
fn norm(a: P) -> P {
    let l = len(a);
    if l > 1e-12 {
        (a.0 / l, a.1 / l)
    } else {
        (0.0, 0.0)
    }
}

/// Unit-step expansion of a closed axis-aligned vertex list (last == first
/// allowed). Returns the cyclic point list without the closing duplicate.
fn expand(corners: &[(i32, i32)]) -> Vec<P> {
    let mut v = Vec::new();
    let n = corners.len();
    if n < 2 {
        return v;
    }
    for i in 0..n - 1 {
        let (a, b) = (corners[i], corners[i + 1]);
        let (dx, dy) = ((b.0 - a.0).signum(), (b.1 - a.1).signum());
        let steps = (b.0 - a.0).abs().max((b.1 - a.1).abs());
        for s in 0..steps {
            v.push(((a.0 + dx * s) as f64, (a.1 + dy * s) as f64));
        }
    }
    if corners[0] != corners[n - 1] {
        let (a, b) = (corners[n - 1], corners[0]);
        let (dx, dy) = ((b.0 - a.0).signum(), (b.1 - a.1).signum());
        let steps = (b.0 - a.0).abs().max((b.1 - a.1).abs());
        for s in 0..steps {
            v.push(((a.0 + dx * s) as f64, (a.1 + dy * s) as f64));
        }
    }
    v
}

/// Fits a closed pixel contour. Returns (start, segments) in working coordinates.
pub fn fit_contour(corners: &[(i32, i32)], fp: &FitParams) -> Option<(P, Vec<Seg>)> {
    let v = expand(corners);
    let n = v.len();
    if n < 4 {
        return None;
    }
    let at = |i: isize| v[i.rem_euclid(n as isize) as usize];

    // Corner detection.
    let k = fp.window.clamp(1, (n / 4).max(1)) as isize;
    let min_ang = fp.corner_deg.to_radians();
    let ang: Vec<f64> = (0..n as isize)
        .map(|i| {
            let a = sub(at(i), at(i - k));
            let b = sub(at(i + k), at(i));
            let cross = a.0 * b.1 - a.1 * b.0;
            cross.atan2(dot(a, b)).abs()
        })
        .collect();
    let mut is_corner = vec![false; n];
    let mut corners_idx = Vec::new();
    for i in 0..n {
        if ang[i] < min_ang {
            continue;
        }
        let mut peak = true;
        for d in 1..=k {
            let before = ang[(i as isize - d).rem_euclid(n as isize) as usize];
            let after = ang[(i as isize + d).rem_euclid(n as isize) as usize];
            if before >= ang[i] || after > ang[i] {
                peak = false;
                break;
            }
        }
        if peak {
            is_corner[i] = true;
            corners_idx.push(i);
        }
    }

    // Smoothing with corners pinned.
    let mut sm = v.clone();
    let mut tmp = vec![(0.0, 0.0); n];
    for _ in 0..fp.smooth_iters {
        for i in 0..n {
            tmp[i] = if is_corner[i] {
                sm[i]
            } else {
                let (a, b, c) = (sm[(i + n - 1) % n], sm[i], sm[(i + 1) % n]);
                ((a.0 + 2.0 * b.0 + c.0) * 0.25, (a.1 + 2.0 * b.1 + c.1) * 0.25)
            };
        }
        std::mem::swap(&mut sm, &mut tmp);
    }

    // Break points: corners, or three smooth joins for corner-free loops (a
    // single cubic spans at most ~120 degrees of a circle accurately).
    let (breaks, sharp): (Vec<usize>, bool) = if corners_idx.is_empty() {
        (vec![0, n / 3, 2 * n / 3], false)
    } else if corners_idx.len() == 1 {
        let c = corners_idx[0];
        (vec![c, (c + n / 2) % n], true)
    } else {
        (corners_idx, true)
    };
    let smi = |i: isize| sm[i.rem_euclid(n as isize) as usize];
    let center_tangent = |i: usize| -> P {
        let i = i as isize;
        let t = norm(sub(smi(i - 2), smi(i + 2)));
        if t == (0.0, 0.0) {
            norm(sub(smi(i - 1), smi(i + 1)))
        } else {
            t
        }
    };
    let tk = (k as usize).max(2);
    let mut beziers: Vec<[P; 4]> = Vec::new();
    let nb = breaks.len();
    for bi in 0..nb {
        let b0 = breaks[bi];
        let b1 = if bi + 1 < nb { breaks[bi + 1] } else { breaks[0] + n };
        let pts: Vec<P> = (b0..=b1).map(|i| sm[i % n]).collect();
        let m = pts.len();
        if m < 2 {
            continue;
        }
        let corner0 = sharp && is_corner[b0];
        let corner1 = sharp && is_corner[b1 % n];
        let t1 = if corner0 {
            norm(sub(pts[tk.min(m - 1)], pts[0]))
        } else {
            mul(center_tangent(b0), -1.0)
        };
        let t2 = if corner1 {
            norm(sub(pts[m - 1 - tk.min(m - 1)], pts[m - 1]))
        } else {
            center_tangent(b1 % n)
        };
        fit_cubic(&pts, t1, t2, fp.tol, &mut beziers, 0);
    }
    if beziers.is_empty() {
        return None;
    }
    let start = beziers[0][0];
    let segs = beziers
        .iter()
        .map(|b| {
            if is_straight(b, fp.tol * 0.35) {
                Seg::Line(b[3])
            } else {
                Seg::Cubic(b[1], b[2], b[3])
            }
        })
        .collect();
    Some((start, segs))
}

/// Control points within `eps` of the chord and projecting inside it.
fn is_straight(b: &[P; 4], eps: f64) -> bool {
    let d = sub(b[3], b[0]);
    let l = len(d);
    if l < 1e-9 {
        return len(sub(b[1], b[0])) <= eps && len(sub(b[2], b[0])) <= eps;
    }
    let u = (d.0 / l, d.1 / l);
    [b[1], b[2]].iter().all(|&c| {
        let r = sub(c, b[0]);
        let along = dot(r, u);
        let off = (r.0 * u.1 - r.1 * u.0).abs();
        off <= eps && along >= -eps && along <= l + eps
    })
}

fn bez(b: &[P; 4], t: f64) -> P {
    let mt = 1.0 - t;
    let (a, bb, c, d) = (mt * mt * mt, 3.0 * mt * mt * t, 3.0 * mt * t * t, t * t * t);
    (
        a * b[0].0 + bb * b[1].0 + c * b[2].0 + d * b[3].0,
        a * b[0].1 + bb * b[1].1 + c * b[2].1 + d * b[3].1,
    )
}

fn chord_params(d: &[P]) -> Vec<f64> {
    let mut u = Vec::with_capacity(d.len());
    u.push(0.0);
    for i in 1..d.len() {
        let prev = u[i - 1];
        u.push(prev + len(sub(d[i], d[i - 1])));
    }
    let total = *u.last().unwrap_or(&0.0);
    if total > 0.0 {
        for x in &mut u {
            *x /= total;
        }
    } else {
        let m = (d.len() - 1).max(1) as f64;
        for (i, x) in u.iter_mut().enumerate() {
            *x = i as f64 / m;
        }
    }
    u
}

fn heuristic(d0: P, d1: P, t1: P, t2: P) -> [P; 4] {
    let dist = len(sub(d1, d0)) / 3.0;
    [d0, add(d0, mul(t1, dist)), add(d1, mul(t2, dist)), d1]
}

fn generate(d: &[P], u: &[f64], t1: P, t2: P) -> [P; 4] {
    let (first, last) = (d[0], d[d.len() - 1]);
    let (mut c00, mut c01, mut c11, mut x0, mut x1) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for (i, &t) in u.iter().enumerate() {
        let mt = 1.0 - t;
        let b0 = mt * mt * mt;
        let b1 = 3.0 * mt * mt * t;
        let b2 = 3.0 * mt * t * t;
        let b3 = t * t * t;
        let a1 = mul(t1, b1);
        let a2 = mul(t2, b2);
        c00 += dot(a1, a1);
        c01 += dot(a1, a2);
        c11 += dot(a2, a2);
        let tmp = sub(d[i], add(mul(first, b0 + b1), mul(last, b2 + b3)));
        x0 += dot(a1, tmp);
        x1 += dot(a2, tmp);
    }
    let det = c00 * c11 - c01 * c01;
    let seg = len(sub(last, first));
    if det.abs() < 1e-12 || seg < 1e-9 {
        return heuristic(first, last, t1, t2);
    }
    let al = (x0 * c11 - x1 * c01) / det;
    let ar = (c00 * x1 - c01 * x0) / det;
    let eps = 1e-6 * seg;
    if !al.is_finite() || !ar.is_finite() || al < eps || ar < eps || al > 2.0 * seg || ar > 2.0 * seg {
        return heuristic(first, last, t1, t2);
    }
    [first, add(first, mul(t1, al)), add(last, mul(t2, ar)), last]
}

fn max_error(d: &[P], b: &[P; 4], u: &[f64]) -> (f64, usize) {
    let mut worst = (0.0, d.len() / 2);
    for i in 1..d.len() - 1 {
        let e = sub(bez(b, u[i]), d[i]);
        let e2 = dot(e, e);
        if e2 > worst.0 {
            worst = (e2, i);
        }
    }
    worst
}

/// One Newton-Raphson step per point towards the closest curve parameter.
fn reparam(d: &[P], u: &mut [f64], b: &[P; 4]) {
    let q1 = [
        mul(sub(b[1], b[0]), 3.0),
        mul(sub(b[2], b[1]), 3.0),
        mul(sub(b[3], b[2]), 3.0),
    ];
    let q2 = [mul(sub(q1[1], q1[0]), 2.0), mul(sub(q1[2], q1[1]), 2.0)];
    for (i, t) in u.iter_mut().enumerate() {
        let p = bez(b, *t);
        let mt = 1.0 - *t;
        let d1 = add(add(mul(q1[0], mt * mt), mul(q1[1], 2.0 * mt * *t)), mul(q1[2], *t * *t));
        let d2 = add(mul(q2[0], mt), mul(q2[1], *t));
        let diff = sub(p, d[i]);
        let num = dot(diff, d1);
        let den = dot(d1, d1) + dot(diff, d2);
        if den.abs() > 1e-12 {
            let nt = *t - num / den;
            if nt.is_finite() {
                *t = nt.clamp(0.0, 1.0);
            }
        }
    }
}

fn fit_cubic(d: &[P], t1: P, t2: P, tol: f64, out: &mut Vec<[P; 4]>, depth: u32) {
    let n = d.len();
    if n <= 2 {
        out.push(heuristic(d[0], d[n - 1], t1, t2));
        return;
    }
    let mut u = chord_params(d);
    let mut b = generate(d, &u, t1, t2);
    let (mut err, mut split) = max_error(d, &b, &u);
    let tol2 = tol * tol;
    if err <= tol2 {
        out.push(b);
        return;
    }
    if err <= 16.0 * tol2 {
        for _ in 0..6 {
            reparam(d, &mut u, &b);
            b = generate(d, &u, t1, t2);
            (err, split) = max_error(d, &b, &u);
            if err <= tol2 {
                out.push(b);
                return;
            }
        }
    }
    if depth > 40 || n < 4 {
        if n >= 3 && depth <= 40 {
            // Too few points to split usefully: two straight pieces.
            let mid = n / 2;
            let tm = norm(sub(d[mid], d[0]));
            out.push(heuristic(d[0], d[mid], tm, mul(tm, -1.0)));
            let tm2 = norm(sub(d[n - 1], d[mid]));
            out.push(heuristic(d[mid], d[n - 1], tm2, mul(tm2, -1.0)));
        } else {
            out.push(b);
        }
        return;
    }
    let split = split.clamp(1, n - 2);
    let lo = split.saturating_sub(2);
    let hi = (split + 2).min(n - 1);
    let mut tc = norm(sub(d[lo], d[hi]));
    if tc == (0.0, 0.0) {
        tc = norm(sub(d[split - 1], d[split + 1]));
    }
    if tc == (0.0, 0.0) {
        tc = norm(sub(d[0], d[n - 1]));
    }
    fit_cubic(&d[..=split], t1, tc, tol, out, depth + 1);
    fit_cubic(&d[split..], mul(tc, -1.0), t2, tol, out, depth + 1);
}
