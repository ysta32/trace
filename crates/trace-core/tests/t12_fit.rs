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
