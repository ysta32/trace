//! T12: contour fitter (corners -> lines, smooth loops -> cubics) and compact output.
use trace_core::fit::{fit_contour, FitParams};
use trace_core::svgpath::{format_path_step, Seg, Subpath};

fn fp() -> FitParams {
    FitParams {
        corner_deg: 60.0,
        tol: 0.8,
        smooth_iters: 3,
        window: 3,
    }
}

#[test]
fn square_is_four_lines_with_exact_corners() {
    let sq = [(0, 0), (20, 0), (20, 20), (0, 20), (0, 0)];
    let (start, segs) = fit_contour(&sq, &fp()).expect("fit");
    assert_eq!(segs.len(), 4, "{segs:?}");
    assert!(segs.iter().all(|s| matches!(s, Seg::Line(_))), "{segs:?}");
    let ends: Vec<(f64, f64)> = segs
        .iter()
        .map(|s| match *s {
            Seg::Line(p) | Seg::Cubic(_, _, p) => p,
        })
        .collect();
    for c in [(0.0, 0.0), (20.0, 0.0), (20.0, 20.0), (0.0, 20.0)] {
        assert!(ends.contains(&c) || start == c, "corner {c:?} missing: {ends:?}");
    }
    let (d, n) = format_path_step(&[Subpath::Mixed { start, segs }], 1.0, 10);
    assert_eq!(n, 4, "{d}");
    assert!(d.ends_with('Z') && !d.contains('C') && !d.contains('c'), "{d}");
}

#[test]
fn staircase_circle_is_few_smooth_cubics_close_to_radius() {
    // Pixel outline of a disc of radius 30 (cell centres inside).
    let (r, c) = (30.0f64, 40.0f64);
    let inside = |x: i32, y: i32| {
        let (dx, dy) = (x as f64 + 0.5 - c, y as f64 + 0.5 - c);
        dx * dx + dy * dy <= r * r
    };
    // Walk the boundary by collecting the corner polygon of the disc row spans
    // (monotone per row), clockwise: right edge top->bottom, left edge bottom->top.
    let rows: Vec<(i32, i32, i32)> = (0..80)
        .filter_map(|y| {
            let xs: Vec<i32> = (0..80).filter(|&x| inside(x, y)).collect();
            Some((y, *xs.first()?, *xs.last()? + 1))
        })
        .collect();
    let mut pts = Vec::new();
    for &(y, _, x1) in &rows {
        pts.push((x1, y));
        pts.push((x1, y + 1));
    }
    for &(y, x0, _) in rows.iter().rev() {
        pts.push((x0, y + 1));
        pts.push((x0, y));
    }
    pts.dedup();
    pts.push(pts[0]);
    let (start, segs) = fit_contour(&pts, &fp()).expect("fit");
    assert!((3..=10).contains(&segs.len()), "{} segments", segs.len());
    let mut prev = start;
    for s in &segs {
        let (c1, c2, p) = match *s {
            Seg::Cubic(a, b, p) => (a, b, p),
            Seg::Line(p) => (prev, p, p),
        };
        for t in [0.25, 0.5, 0.75] {
            let mt = 1.0 - t;
            let x = mt * mt * mt * prev.0 + 3.0 * mt * mt * t * c1.0 + 3.0 * mt * t * t * c2.0 + t * t * t * p.0;
            let y = mt * mt * mt * prev.1 + 3.0 * mt * mt * t * c1.1 + 3.0 * mt * t * t * c2.1 + t * t * t * p.1;
            let rr = ((x - c).powi(2) + (y - c).powi(2)).sqrt();
            assert!((rr - r).abs() < 1.5, "radius {rr} at t={t}");
        }
        prev = p;
    }
}

#[test]
fn degenerate_contours_do_not_panic() {
    for pts in [
        vec![(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)],
        vec![(0, 0), (2, 0), (2, 1), (0, 1), (0, 0)],
        vec![(0, 0), (1, 0), (1, 1), (0, 0)],
        vec![(5, 5)],
        vec![],
    ] {
        if let Some((s, segs)) = fit_contour(&pts, &fp()) {
            assert!(s.0.is_finite() && s.1.is_finite() && !segs.is_empty());
        }
    }
}

#[test]
fn single_cubic_subpath_is_kept_with_implicit_close() {
    // Regression: the closing line was dropped and the lone cubic rejected.
    let sp = Subpath::Mixed {
        start: (0.0, 0.0),
        segs: vec![Seg::Cubic((0.0, 2.0), (2.0, 2.0), (2.0, 0.0)), Seg::Line((0.0, 0.0))],
    };
    let (d, n) = format_path_step(&[sp], 1.0, 1);
    assert_eq!(d, "M0 0C0 2 2 2 2 0Z");
    assert_eq!(n, 2);
    // A flat single cubic (no area) is still dropped.
    let flat = Subpath::Mixed {
        start: (0.0, 0.0),
        segs: vec![Seg::Cubic((1.0, 0.0), (2.0, 0.0), (3.0, 0.0)), Seg::Line((0.0, 0.0))],
    };
    assert_eq!(format_path_step(&[flat], 1.0, 1).0, "");
}

/// Pixel outline (clockwise, y down) of a row-convex shape, rotated to start at `rot`.
fn row_convex_outline(inside: impl Fn(i32, i32) -> bool, size: i32, rot: usize) -> Vec<(i32, i32)> {
    let rows: Vec<(i32, i32, i32)> = (0..size)
        .filter_map(|y| {
            let xs: Vec<i32> = (0..size).filter(|&x| inside(x, y)).collect();
            Some((y, *xs.first()?, *xs.last()? + 1))
        })
        .collect();
    let mut pts = Vec::new();
    for &(y, _, x1) in &rows {
        pts.push((x1, y));
        pts.push((x1, y + 1));
    }
    for &(y, x0, _) in rows.iter().rev() {
        pts.push((x0, y + 1));
        pts.push((x0, y));
    }
    pts.dedup();
    while pts.len() > 1 && pts.first() == pts.last() {
        pts.pop();
    }
    let r = rot % pts.len();
    pts.rotate_left(r);
    pts.push(pts[0]);
    pts
}

/// (total signed turning, length) of the fitted path sampled densely.
fn turning_and_length(start: (f64, f64), segs: &[Seg]) -> (f64, f64) {
    let mut poly = vec![start];
    let mut prev = start;
    for s in segs {
        match *s {
            Seg::Line(p) => poly.push(p),
            Seg::Cubic(c1, c2, p) => {
                for i in 1..=16 {
                    let t = i as f64 / 16.0;
                    let mt = 1.0 - t;
                    let (a, b, c, d) = (mt * mt * mt, 3.0 * mt * mt * t, 3.0 * mt * t * t, t * t * t);
                    poly.push((
                        a * prev.0 + b * c1.0 + c * c2.0 + d * p.0,
                        a * prev.1 + b * c1.1 + c * c2.1 + d * p.1,
                    ));
                }
            }
        }
        prev = match *s {
            Seg::Line(p) | Seg::Cubic(_, _, p) => p,
        };
    }
    poly.push(start);
    poly.dedup_by(|a, b| (a.0 - b.0).hypot(a.1 - b.1) < 1e-9);
    let m = poly.len() - 1; // poly is closed: last == first
    let dirs: Vec<(f64, f64)> = (0..m)
        .map(|i| (poly[i + 1].0 - poly[i].0, poly[i + 1].1 - poly[i].1))
        .collect();
    let mut turn = 0.0;
    let mut length = 0.0;
    for i in 0..m {
        let (a, b) = (dirs[i], dirs[(i + 1) % m]);
        turn += (a.0 * b.1 - a.1 * b.0).atan2(a.0 * b.0 + a.1 * b.1);
        length += a.0.hypot(a.1);
    }
    (turn, length)
}

#[test]
fn random_closed_contours_fit_one_simple_lap() {
    let mut seed = 0x1234_5678_u32;
    let mut rnd = || {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        seed
    };
    let mut checked = 0;
    for case in 0..200 {
        let r = 8.0 + (rnd() % 20) as f64;
        let c = 32.0;
        let corners = case % 4; // 0: disc, 1: teardrop, 2: lens, 3: rounded triangle
        let tip = r * (1.4 + (rnd() % 10) as f64 / 10.0);
        let inside = move |x: i32, y: i32| {
            let (px, py) = (x as f64 + 0.5 - c, y as f64 + 0.5 - c);
            let disc = px * px + py * py <= r * r;
            match corners {
                0 => disc,
                // Disc plus a triangular tip pointing down.
                1 => disc || (py >= 0.0 && py <= tip && px.abs() <= r * (1.0 - py / tip)),
                // Intersection of two offset discs: sharp top and bottom.
                2 => {
                    let o = r * 0.6;
                    (px - o).powi(2) + py * py <= r * r && (px + o).powi(2) + py * py <= r * r
                }
                // Triangle.
                _ => py >= -r && py <= r && px.abs() <= (py + r) * 0.5,
            }
        };
        let rot = rnd() as usize;
        let pts = row_convex_outline(inside, 64, rot);
        let perim_l1: f64 = pts
            .windows(2)
            .map(|w| ((w[1].0 - w[0].0).abs() + (w[1].1 - w[0].1).abs()) as f64)
            .sum();
        for window in [3usize, 4, 6] {
            let p = FitParams { window, ..fp() };
            let (start, segs) = fit_contour(&pts, &p).expect("fit");
            let (turn, length) = turning_and_length(start, &segs);
            assert!(
                (turn.abs() - std::f64::consts::TAU).abs() < 0.35,
                "case {case} rot {rot} w {window}: turning {turn}"
            );
            // One lap: Euclidean length is below the staircase (L1) perimeter
            // and above ~L1/sqrt(2); 1.5 laps would exceed L1.
            assert!(
                length < perim_l1 * 1.02 && length > perim_l1 * 0.6,
                "case {case} rot {rot} w {window}: length {length} vs L1 {perim_l1}"
            );
            checked += 1;
        }
    }
    assert_eq!(checked, 600);
}
