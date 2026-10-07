//! T02 gradient fitting tests.
use image::{Rgba, RgbaImage};
use trace_core::gradient::fit_linear_gradient;

fn lerp(a: [u8; 3], b: [u8; 3], t: f32) -> Rgba<u8> {
    let f = |i: usize| (a[i] as f32 + (b[i] as f32 - a[i] as f32) * t).round() as u8;
    Rgba([f(0), f(1), f(2), 255])
}

#[test]
fn horizontal_gradient_rectangle() {
    let (a, b) = ([20, 40, 200], [240, 200, 40]);
    let img = RgbaImage::from_fn(100, 60, |x, _| lerp(a, b, x as f32 / 99.0));
    let mut mask = vec![false; 100 * 60];
    for y in 10..50 {
        for x in 10..90 {
            mask[y * 100 + x] = true;
        }
    }
    let g = fit_linear_gradient(&img, &mask).expect("gradient expected");
    assert!((g.x2 - g.x1).abs() > 70.0, "{g:?}");
    assert!((g.y2 - g.y1).abs() < 1.0, "{g:?}");
    assert!((2..=3).contains(&g.stops.len()));
    assert!(g.error < 2.0, "{g:?}");
    // Endpoints are at the mask extent and stop colours match the ramp there.
    let (lo, hi) = if g.x1 < g.x2 { (g.x1, g.x2) } else { (g.x2, g.x1) };
    assert!((lo - 10.5).abs() < 1.0 && (hi - 89.5).abs() < 1.0, "{g:?}");
    let first = g.stops.first().unwrap().1;
    let at = if g.x1 < g.x2 { 10.0 } else { 89.0 };
    let want = lerp(a, b, at / 99.0);
    for c in 0..3 {
        assert!((first[c] as i32 - want[c] as i32).abs() <= 3, "{first:?} vs {want:?}");
    }
}

#[test]
fn vertical_and_diagonal_direction() {
    let img = RgbaImage::from_fn(64, 64, |_, y| lerp([0, 0, 0], [255, 255, 255], y as f32 / 63.0));
    let g = fit_linear_gradient(&img, &[true; 64 * 64]).expect("vertical");
    assert!((g.y2 - g.y1).abs() > 50.0 && (g.x2 - g.x1).abs() < 1.0, "{g:?}");
    assert!(g.y2 > g.y1, "dark->light orientation {g:?}");

    let img = RgbaImage::from_fn(64, 64, |x, y| {
        lerp([200, 30, 30], [30, 30, 200], (x + y) as f32 / 126.0)
    });
    let g = fit_linear_gradient(&img, &[true; 64 * 64]).expect("diagonal");
    let (dx, dy) = (g.x2 - g.x1, g.y2 - g.y1);
    assert!((dx.abs() - dy.abs()).abs() < 0.1 * dx.abs().max(dy.abs()), "{g:?}");
}

#[test]
fn flat_square_and_noise_rejected() {
    let img = RgbaImage::from_pixel(50, 50, Rgba([90, 120, 30, 255]));
    assert!(fit_linear_gradient(&img, &[true; 2500]).is_none());
    let mut s = 99u32;
    let noise = RgbaImage::from_fn(50, 50, |_, _| {
        s = s.wrapping_mul(1_103_515_245).wrapping_add(12345);
        let v = (s >> 16) as u8;
        Rgba([v, v, v, 255])
    });
    assert!(fit_linear_gradient(&noise, &[true; 2500]).is_none());
    // Subtle ramp (below the colour-range threshold) is not a gradient.
    let subtle = RgbaImage::from_fn(50, 50, |x, _| lerp([100, 100, 100], [106, 106, 106], x as f32 / 49.0));
    assert!(fit_linear_gradient(&subtle, &[true; 2500]).is_none());
    // Wrong mask length.
    assert!(fit_linear_gradient(&img, &[true; 10]).is_none());
}

#[test]
fn bent_gradient_gets_three_stops() {
    let img = RgbaImage::from_fn(90, 20, |x, _| {
        let t = x as f32 / 89.0;
        if t < 0.5 {
            lerp([255, 0, 0], [255, 255, 0], t * 2.0)
        } else {
            lerp([255, 255, 0], [0, 0, 255], t * 2.0 - 1.0)
        }
    });
    let g = fit_linear_gradient(&img, &[true; 90 * 20]).expect("gradient");
    assert_eq!(g.stops.len(), 3, "{g:?}");
    assert!((g.stops[1].0 - 0.5).abs() < 1e-6);
}
