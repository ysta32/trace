//! T01: vectorize + svgpath tests on hand-built label maps (no T02 dependency).
use trace_core::quantize::{Quantized, TRANSPARENT};
use trace_core::svgpath::{fmt_num, format_path, merge_collinear, Subpath};
use trace_core::vectorize::{vectorize, RawShape, VecParams};
use trace_core::{CurveMode, Mode};

fn quant(w: u32, h: u32, ncol: usize, f: impl Fn(u32, u32) -> u16) -> Quantized {
    let mut labels = Vec::with_capacity((w * h) as usize);
    for y in 0..h {
        for x in 0..w {
            labels.push(f(x, y));
        }
    }
    let palette = (0..ncol).map(|i| [(i * 40) as u8, 0, 0]).collect();
    Quantized {
        width: w,
        height: h,
        palette,
        labels,
    }
}

fn params(mode: Mode, curve: CurveMode, speckle: u32) -> VecParams {
    VecParams {
        mode,
        curve_mode: curve,
        filter_speckle: speckle,
        ..VecParams::default()
    }
}

/// Parses polygon-only path data (M/m/L/l/H/h/V/v/Z/z) into subpaths.
fn parse_poly(d: &str) -> Vec<Vec<(f64, f64)>> {
    let mut toks: Vec<String> = Vec::new();
    let mut cur = String::new();
    let flush = |cur: &mut String, toks: &mut Vec<String>| {
        if !cur.is_empty() {
            toks.push(std::mem::take(cur));
        }
    };
    for ch in d.chars() {
        if ch.is_ascii_alphabetic() {
            flush(&mut cur, &mut toks);
            toks.push(ch.to_string());
        } else if ch == ' ' || ch == ',' {
            flush(&mut cur, &mut toks);
        } else if ch == '-' || (ch == '.' && cur.contains('.')) {
            flush(&mut cur, &mut toks);
            cur.push(ch);
        } else {
            cur.push(ch);
        }
    }
    flush(&mut cur, &mut toks);
    let mut subs: Vec<Vec<(f64, f64)>> = Vec::new();
    let (mut x, mut y, mut sx, mut sy) = (0.0, 0.0, 0.0, 0.0);
    let mut cmd = ' ';
    let mut i = 0;
    let num = |i: &mut usize| -> f64 {
        let v: f64 = toks[*i]
            .parse()
            .unwrap_or_else(|_| panic!("bad number {:?} in {d}", toks[*i]));
        *i += 1;
        v
    };
    while i < toks.len() {
        let t = &toks[i];
        if t.chars().next().unwrap().is_ascii_alphabetic() {
            cmd = t.chars().next().unwrap();
            i += 1;
            if cmd == 'Z' || cmd == 'z' {
                x = sx;
                y = sy;
                continue;
            }
        }
        match cmd {
            'M' | 'm' => {
                let (a, b) = (num(&mut i), num(&mut i));
                if cmd == 'M' {
                    (x, y) = (a, b)
                } else {
                    (x, y) = (x + a, y + b)
                }
                (sx, sy) = (x, y);
                subs.push(vec![(x, y)]);
                cmd = if cmd == 'M' { 'L' } else { 'l' };
                continue;
            }
            'L' => (x, y) = (num(&mut i), num(&mut i)),
            'l' => {
                let (a, b) = (num(&mut i), num(&mut i));
                (x, y) = (x + a, y + b);
            }
            'H' => x = num(&mut i),
            'h' => x += num(&mut i),
            'V' => y = num(&mut i),
            'v' => y += num(&mut i),
            c => panic!("unexpected command {c} in {d}"),
        }
        subs.last_mut().expect("command before M").push((x, y));
    }
    subs
}

/// Nonzero winding number of point (px,py) against closed polygons.
fn winding(subs: &[Vec<(f64, f64)>], px: f64, py: f64) -> i32 {
    let mut wn = 0;
    for s in subs {
        for k in 0..s.len() {
            let (a, b) = (s[k], s[(k + 1) % s.len()]);
            let is_left = (b.0 - a.0) * (py - a.1) - (px - a.0) * (b.1 - a.1);
            if a.1 <= py {
                if b.1 > py && is_left > 0.0 {
                    wn += 1;
                }
            } else if b.1 <= py && is_left < 0.0 {
                wn -= 1;
            }
        }
    }
    wn
}

/// Paints shapes in order (nonzero rule) at pixel centres; returns top colour per pixel.
fn raster(shapes: &[RawShape], w: u32, h: u32, scale: f64) -> Vec<Option<u16>> {
    let parsed: Vec<_> = shapes.iter().map(|s| (s.color_index, parse_poly(&s.d))).collect();
    let mut out = vec![None; (w * h) as usize];
    for y in 0..h {
        for x in 0..w {
            let (px, py) = ((x as f64 + 0.5) / scale, (y as f64 + 0.5) / scale);
            for (c, subs) in &parsed {
                if winding(subs, px, py) != 0 {
                    out[(y * w + x) as usize] = Some(*c);
                }
            }
        }
    }
    out
}

fn subpath_count(d: &str) -> usize {
    d.chars().filter(|&c| c == 'M' || c == 'm').count()
}

fn circle(w: u32) -> Quantized {
    let c = w as f64 / 2.0;
    let r = w as f64 * 0.35;
    quant(w, w, 2, |x, y| {
        let (dx, dy) = (x as f64 + 0.5 - c, y as f64 + 0.5 - c);
        u16::from(dx * dx + dy * dy <= r * r)
    })
}

#[test]
fn red_circle_on_white_spline() {
    let q = circle(64);
    for mode in [Mode::Stacked, Mode::Cutout] {
        let shapes = vectorize(&q, &params(mode, CurveMode::Spline, 4));
        assert!(
            !shapes.is_empty() && shapes.len() <= 3,
            "{mode:?}: {} shapes",
            shapes.len()
        );
        for s in &shapes {
            assert!(!s.d.is_empty() && s.nodes > 0);
            assert!(
                s.d.contains('C') || s.d.contains('c'),
                "spline output should have cubics: {}",
                s.d
            );
        }
        let circ = shapes.iter().find(|s| s.color_index == 1).expect("circle shape");
        assert_eq!(subpath_count(&circ.d), 1);
        assert!(circ.nodes >= 4 && circ.nodes < 40, "nodes {}", circ.nodes);
        if mode == Mode::Cutout {
            let bg = shapes.iter().find(|s| s.color_index == 0).expect("background shape");
            assert_eq!(subpath_count(&bg.d), 2, "cutout background has circle hole: {}", bg.d);
        }
    }
}

#[test]
fn two_color_checker_cutout() {
    // 4x4 cells of 8px.
    let q = quant(32, 32, 2, |x, y| (((x / 8) + (y / 8)) % 2) as u16);
    for curve in [CurveMode::Pixel, CurveMode::Polygon, CurveMode::Spline] {
        let shapes = vectorize(&q, &params(Mode::Cutout, curve, 0));
        assert_eq!(shapes.len(), 16, "{curve:?}");
        assert!(shapes.iter().all(|s| s.mask_area == 64 && subpath_count(&s.d) == 1));
    }
    let shapes = vectorize(&q, &params(Mode::Cutout, CurveMode::Pixel, 0));
    let r = raster(&shapes, 32, 32, 1.0);
    for (i, &l) in q.labels.iter().enumerate() {
        assert_eq!(r[i], Some(l), "pixel {i}");
    }
}

#[test]
fn ring_has_hole() {
    let c = 32.0;
    let q = quant(64, 64, 2, |x, y| {
        let (dx, dy) = (x as f64 + 0.5 - c, y as f64 + 0.5 - c);
        let d2 = dx * dx + dy * dy;
        u16::from((12.0 * 12.0..=26.0 * 26.0).contains(&d2))
    });
    for curve in [CurveMode::Spline, CurveMode::Polygon, CurveMode::Pixel] {
        for mode in [Mode::Cutout, Mode::Stacked] {
            let shapes = vectorize(&q, &params(mode, curve, 4));
            let ring: Vec<_> = shapes.iter().filter(|s| s.color_index == 1).collect();
            assert_eq!(ring.len(), 1, "{curve:?} {mode:?}");
            // In stacked mode the ring (smaller colour) is on top, the background layer is a full square.
            assert_eq!(subpath_count(&ring[0].d), 2, "{curve:?} {mode:?}: {}", ring[0].d);
        }
    }
    // Pixel mode: hole must not be painted with the ring colour (nonzero winding).
    let shapes = vectorize(&q, &params(Mode::Cutout, CurveMode::Pixel, 0));
    let r = raster(&shapes, 64, 64, 1.0);
    for (i, &l) in q.labels.iter().enumerate() {
        assert_eq!(r[i], Some(l), "pixel {i}");
    }
}

fn sprite() -> Quantized {
    const S: [&str; 8] = [
        "..####..", ".#oooo#.", "#o#oo#o#", "#oooooo#", "#o#oo#o#", "#oo##oo#", ".#oooo#.", "..####..",
    ];
    quant(64, 64, 3, |x, y| {
        match S[(y / 8) as usize].as_bytes()[(x / 8) as usize] {
            b'.' => 0,
            b'#' => 1,
            _ => 2,
        }
    })
}

#[test]
fn pixel_art_axis_aligned_and_exact() {
    let q = sprite();
    for mode in [Mode::Stacked, Mode::Cutout] {
        let shapes = vectorize(&q, &params(mode, CurveMode::Pixel, 0));
        assert!(!shapes.is_empty());
        for s in &shapes {
            assert!(
                s.d.chars().all(|c| "MmHhVvZ0123456789.- ".contains(c)),
                "non-axis command in {}",
                s.d
            );
            for sub in parse_poly(&s.d) {
                for k in 0..sub.len() {
                    let (a, b) = (sub[k], sub[(k + 1) % sub.len()]);
                    assert!(a.0 == b.0 || a.1 == b.1, "diagonal edge {a:?}->{b:?}");
                    assert!(a.0 % 8.0 == 0.0 && a.1 % 8.0 == 0.0, "vertex off pixel grid {a:?}");
                }
            }
        }
        let r = raster(&shapes, 64, 64, 1.0);
        for (i, &l) in q.labels.iter().enumerate() {
            assert_eq!(r[i], Some(l), "{mode:?} pixel {i}");
        }
    }
}

#[test]
fn pixel_mode_minimal_outline() {
    // A single 8x8 block: exactly 4 vertices.
    let q = quant(16, 16, 2, |x, y| {
        u16::from((4..12).contains(&x) && (4..12).contains(&y))
    });
    let shapes = vectorize(&q, &params(Mode::Cutout, CurveMode::Pixel, 0));
    let block = shapes.iter().find(|s| s.color_index == 1).unwrap();
    assert_eq!(block.nodes, 4);
    assert_eq!(block.d, "M4 4h8v8H4Z");
}

#[test]
fn scale_divides_coordinates() {
    let q = sprite();
    let mut p = params(Mode::Stacked, CurveMode::Pixel, 0);
    p.scale = 8.0;
    let shapes = vectorize(&q, &p);
    let r = raster(&shapes, 64, 64, 8.0);
    for (i, &l) in q.labels.iter().enumerate() {
        assert_eq!(r[i], Some(l), "pixel {i}");
    }
    // Bottom layer covers the whole 8x8 canvas.
    assert_eq!(shapes[0].d, "M0 0H8V8H0Z");
}

#[test]
fn stacked_covers_whole_canvas() {
    // Many colours, irregular regions, speckle filtering on: no gaps anywhere.
    let q = quant(48, 40, 5, |x, y| (((x * 7 + y * 3) / 9 + (x * y) % 5) % 5) as u16);
    for curve in [CurveMode::Pixel, CurveMode::Polygon, CurveMode::Spline] {
        let shapes = vectorize(&q, &params(Mode::Stacked, curve, 6));
        assert!(!shapes.is_empty());
        assert_eq!(
            subpath_count(&shapes[0].d),
            1,
            "{curve:?} bottom layer is a solid outline"
        );
        if curve == CurveMode::Pixel {
            let r = raster(&shapes, 48, 40, 1.0);
            assert!(r.iter().all(|c| c.is_some()), "gap in stacked output");
        }
    }
    let q = circle(40);
    let shapes = vectorize(&q, &params(Mode::Stacked, CurveMode::Pixel, 4));
    assert_eq!(shapes[0].d, "M0 0H40V40H0Z");
}

#[test]
fn transparent_and_tiny_inputs() {
    let q = quant(10, 10, 2, |x, _| if x < 5 { TRANSPARENT } else { 1 });
    let shapes = vectorize(&q, &params(Mode::Stacked, CurveMode::Pixel, 0));
    assert_eq!(shapes.len(), 1);
    assert_eq!(shapes[0].d, "M5 0h5V10H5Z");
    // Single-pixel and two-pixel clusters must not panic in any curve mode.
    let q = quant(5, 5, 3, |x, y| ((x + y * 2) % 3) as u16);
    for curve in [CurveMode::Pixel, CurveMode::Polygon, CurveMode::Spline] {
        for mode in [Mode::Stacked, Mode::Cutout] {
            let _ = vectorize(&q, &params(mode, curve, 0));
        }
    }
    let q = quant(1, 1, 1, |_, _| 0);
    let _ = vectorize(&q, &params(Mode::Stacked, CurveMode::Spline, 0));
    let empty = Quantized {
        width: 0,
        height: 0,
        palette: vec![],
        labels: vec![],
    };
    assert!(vectorize(&empty, &VecParams::default()).is_empty());
}

#[test]
fn speckle_filter_drops_small_clusters() {
    let q = quant(32, 32, 2, |x, y| {
        u16::from((x == 3 && y == 3) || ((10..20).contains(&x) && (10..20).contains(&y)))
    });
    let shapes = vectorize(&q, &params(Mode::Cutout, CurveMode::Pixel, 4));
    let fg: Vec<_> = shapes.iter().filter(|s| s.color_index == 1).collect();
    assert_eq!(fg.len(), 1);
    assert_eq!(fg[0].mask_area, 100);
    // The 1px hole in the background is filled rather than left as a gap.
    let bg = shapes.iter().find(|s| s.color_index == 0).unwrap();
    assert_eq!(subpath_count(&bg.d), 2);
}

#[test]
fn svgpath_number_formatting() {
    assert_eq!(fmt_num(0), "0");
    assert_eq!(fmt_num(50), ".5");
    assert_eq!(fmt_num(-50), "-.5");
    assert_eq!(fmt_num(1205), "12.05");
    assert_eq!(fmt_num(1250), "12.5");
    assert_eq!(fmt_num(-300), "-3");
    assert_eq!(fmt_num(7), ".07");
}

#[test]
fn svgpath_compact_relative_and_rounding() {
    let sq = Subpath::Polygon(vec![
        (100.0, 100.0),
        (101.0, 100.0),
        (102.0, 100.0),
        (102.0, 102.0),
        (100.0, 102.0),
        (100.0, 100.0),
    ]);
    let (d, n) = format_path(&[sq], 1.0);
    assert_eq!(d, "M100 100h2v2h-2Z");
    assert_eq!(n, 4);
    let tri = Subpath::Polygon(vec![(0.0, 0.0), (1.004, 0.5), (0.333, 1.0)]);
    let (d, _) = format_path(&[tri], 1.0);
    assert_eq!(d, "M0 0 1 .5.33 1Z");
    let cub = Subpath::Cubic {
        start: (10.0, 10.0),
        segs: vec![
            [(11.0, 10.0), (12.0, 11.0), (12.0, 12.0)],
            [(12.0, 13.0), (11.0, 14.0), (10.0, 10.0)],
        ],
    };
    let (d, n) = format_path(&[cub], 0.5);
    assert_eq!(n, 3);
    assert!(d.starts_with("M5 5c.5 0 1 .5 1 1"), "{d}");
    assert!(d.ends_with('Z'));
    assert_eq!(
        merge_collinear(vec![(0, 0), (1, 0), (2, 0), (2, 2), (0, 2), (0, 1)]),
        vec![(0, 0), (2, 0), (2, 2), (0, 2)]
    );
}

#[test]
fn speckle_area_includes_limit_factor() {
    use trace_core::pipeline::speckle_area_working;
    // limit_size halved the image (lim .5), no upscale: side 10 -> 5px -> 25 px^2.
    assert_eq!(speckle_area_working(10.0, 1.0 * 0.5), 25);
    // 2x upscale after a .5 limit cancels out.
    assert_eq!(speckle_area_working(8.0, 2.0 * 0.5), 64);
    // Pixel art downscaled by 8: a side-8 speckle is one working pixel.
    assert_eq!(speckle_area_working(8.0, 1.0 / 8.0), 1);
    assert_eq!(speckle_area_working(0.0, 4.0), 0);
}
