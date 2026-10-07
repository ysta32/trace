//! T01: end-to-end trace() tests. Depends on T02 (quantize/preprocess/analyze/gradient).
use image::{Rgba, RgbaImage};
use trace_core::{trace, AutoOr, CurveMode, Mode, Preset, TraceOptions};

fn red_circle(size: u32) -> RgbaImage {
    let c = size as f32 / 2.0;
    let r = size as f32 * 0.35;
    RgbaImage::from_fn(size, size, |x, y| {
        let (dx, dy) = (x as f32 + 0.5 - c, y as f32 + 0.5 - c);
        if dx * dx + dy * dy <= r * r {
            Rgba([220, 20, 30, 255])
        } else {
            Rgba([255, 255, 255, 255])
        }
    })
}

fn sprite_x8() -> RgbaImage {
    const S: [&str; 8] = [
        "..####..", ".#oooo#.", "#o#oo#o#", "#oooooo#", "#o#oo#o#", "#oo##oo#", ".#oooo#.", "..####..",
    ];
    RgbaImage::from_fn(64, 64, |x, y| match S[(y / 8) as usize].as_bytes()[(x / 8) as usize] {
        b'.' => Rgba([255, 255, 255, 255]),
        b'#' => Rgba([0, 0, 0, 255]),
        _ => Rgba([255, 200, 0, 255]),
    })
}

#[test]
fn logo_circle() {
    let img = red_circle(200);
    let opts = TraceOptions {
        preset: Some(Preset::Logo),
        colors: Some(AutoOr::Value(2)),
        ..Default::default()
    };
    let r = trace(&img, &opts);
    assert_eq!((r.width, r.height), (200, 200));
    assert_eq!(r.palette.len(), 2);
    assert!(r.palette.iter().all(|p| p.len() == 7 && p.starts_with('#')));
    assert!(!r.shapes.is_empty() && r.shapes.len() <= 4, "{} shapes", r.shapes.len());
    assert!(r.shapes.iter().all(|s| !s.d.is_empty()));
    let bg = r.background.as_deref().expect("white border is background");
    let near_white = (1..7)
        .step_by(2)
        .all(|i| u8::from_str_radix(&bg[i..i + 2], 16).unwrap() >= 235);
    assert!(near_white, "background {bg}");
    assert_eq!(r.stats.paths as usize, r.shapes.len());
    assert_eq!(r.stats.preset, Preset::Logo);
    assert!(r.stats.nodes > 0);
}

#[test]
fn auto_preset_resolves() {
    let r = trace(&red_circle(96), &TraceOptions::default());
    assert_ne!(r.stats.preset, Preset::Auto);
    assert!(!r.shapes.is_empty());
}

#[test]
fn pixelart_axis_aligned() {
    let opts = TraceOptions {
        preset: Some(Preset::Pixelart),
        ..Default::default()
    };
    let r = trace(&sprite_x8(), &opts);
    assert_eq!((r.width, r.height), (64, 64));
    assert!(r.shapes.len() >= 3);
    for s in &r.shapes {
        assert!(
            s.d.chars().all(|c| "MmHhVvZ0123456789.- ".contains(c)),
            "non-axis path {}",
            s.d
        );
    }
    // Stacked bottom layer spans the original 64x64 canvas.
    assert_eq!(r.shapes[0].d, "M0 0H64V64H0Z");
}

#[test]
fn cutout_forced_palette_and_gradients_flag() {
    let img = red_circle(80);
    let opts = TraceOptions {
        preset: Some(Preset::Photo),
        palette: Some(vec!["#ffffff".into(), "#dc141e".into()]),
        mode: Some(Mode::Cutout),
        curve_mode: Some(CurveMode::Polygon),
        gradients: Some(true),
        ..Default::default()
    };
    let r = trace(&img, &opts);
    assert_eq!(r.palette.len(), 2);
    for s in &r.shapes {
        if let Some(id) = s.fill.strip_prefix("url(#").and_then(|t| t.strip_suffix(')')) {
            assert!(r.gradients.iter().any(|g| g.id == id));
        } else {
            assert!(r.palette.contains(&s.fill));
        }
    }
}

#[test]
fn speckle_threshold_is_in_original_pixels_after_limit() {
    // 2048^2 limited to 1024 (lim .5): a 12x12 dark square (144 px^2 original)
    // exceeds a speckle of 10 (100 px^2 original) and must survive, even though
    // it is only ~6x6 working pixels.
    let img = RgbaImage::from_fn(2048, 2048, |x, y| {
        if (1000..1012).contains(&x) && (1000..1012).contains(&y) {
            Rgba([0, 0, 0, 255])
        } else {
            Rgba([255, 255, 255, 255])
        }
    });
    let opts = TraceOptions {
        preset: Some(Preset::Logo),
        colors: Some(AutoOr::Value(2)),
        denoise: Some(0.0),
        filter_speckle: Some(10),
        max_dimension: Some(1024),
        mode: Some(Mode::Cutout),
        ..Default::default()
    };
    let r = trace(&img, &opts);
    assert_eq!(
        r.shapes.len(),
        2,
        "dark square dropped as speckle: {:?}",
        r.shapes.iter().map(|s| &s.fill).collect::<Vec<_>>()
    );
}
