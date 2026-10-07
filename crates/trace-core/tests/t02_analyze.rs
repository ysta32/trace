//! T02 analysis / classification tests.
use image::{imageops, Rgba, RgbaImage};
use trace_core::analyze::detect_pixel_scale;
use trace_core::preprocess::{denoise, effective_upscale_factor, limit_size, upscale, MAX_UPSCALE_PIXELS};
use trace_core::{analyze, Preset};

fn render(w: u32, h: u32, f: impl Fn(f32, f32) -> [u8; 3]) -> RgbaImage {
    const SS: u32 = 4;
    RgbaImage::from_fn(w, h, |x, y| {
        let mut acc = [0u32; 3];
        for sy in 0..SS {
            for sx in 0..SS {
                let c = f(
                    (x as f32 + (sx as f32 + 0.5) / SS as f32) / w as f32,
                    (y as f32 + (sy as f32 + 0.5) / SS as f32) / h as f32,
                );
                for k in 0..3 {
                    acc[k] += c[k] as u32;
                }
            }
        }
        Rgba([(acc[0] / 16) as u8, (acc[1] / 16) as u8, (acc[2] / 16) as u8, 255])
    })
}

fn logo(w: u32) -> RgbaImage {
    render(w, w, |u, v| {
        if (u - 0.65).abs() < 0.2 && (v - 0.6).abs() < 0.15 {
            [20, 40, 120]
        } else if (u - 0.4).powi(2) + (v - 0.42).powi(2) < 0.09 {
            [220, 30, 40]
        } else {
            [250, 250, 250]
        }
    })
}

fn sprite() -> RgbaImage {
    let pal = [[0u8, 0, 0], [255, 220, 180], [40, 120, 40], [200, 40, 40]];
    let mut s = 7u32;
    RgbaImage::from_fn(8, 8, |_, _| {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        let c = pal[(s % 4) as usize];
        Rgba([c[0], c[1], c[2], 255])
    })
}

#[test]
fn upscaled_sprite_is_pixelart() {
    let big = upscale(&sprite(), 6, true);
    assert_eq!(big.dimensions(), (48, 48));
    assert_eq!(detect_pixel_scale(&big), 6);
    let a = analyze(&big);
    assert_eq!(a.pixel_scale, 6);
    assert!(a.is_pixel_art);
    assert_eq!(a.preset, Preset::Pixelart);
    // Grid offset (cropped by 2 px) still detected.
    let cropped = imageops::crop_imm(&big, 2, 2, 46, 46).to_image();
    assert_eq!(detect_pixel_scale(&cropped), 6);
    // Native-resolution tiny sprite counts as pixel art too.
    let native = upscale(&sprite(), 4, true);
    let native = imageops::resize(&native, 32, 32, imageops::FilterType::Nearest);
    assert!(analyze(&native).is_pixel_art);
}

#[test]
fn antialiased_logo_is_not_pixel_art() {
    let img = logo(512);
    assert_eq!(detect_pixel_scale(&img), 1);
    let a = analyze(&img);
    assert!(!a.is_pixel_art);
    assert_eq!(a.preset, Preset::Logo);
    assert!((3..=4).contains(&a.colors), "{a:?}");
    assert!(!a.has_alpha && !a.has_gradients, "{a:?}");
    assert_eq!((a.width, a.height), (512, 512));
    let small = analyze(&logo(200));
    assert_eq!(small.preset, Preset::Icon, "{small:?}");
}

#[test]
fn photo_like_noise_and_gradient() {
    let mut s = 0xBEEFu32;
    let img = RgbaImage::from_fn(512, 384, |x, y| {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        let n = (s % 31) as i32 - 15;
        let c = |v: f32| (v as i32 + n).clamp(0, 255) as u8;
        let (u, v) = (x as f32 / 511.0, y as f32 / 383.0);
        Rgba([c(40.0 + 180.0 * u), c(60.0 + 150.0 * v), c(200.0 - 120.0 * u * v), 255])
    });
    let a = analyze(&img);
    assert_eq!(a.preset, Preset::Photo, "{a:?}");
    assert!(!a.is_pixel_art);
    // Same smooth image without noise is detected as gradient content.
    let smooth = RgbaImage::from_fn(512, 384, |x, y| {
        let (u, v) = (x as f32 / 511.0, y as f32 / 383.0);
        Rgba([
            (40.0 + 180.0 * u) as u8,
            (60.0 + 150.0 * v) as u8,
            (200.0 - 120.0 * u * v) as u8,
            255,
        ])
    });
    assert!(analyze(&smooth).has_gradients);
}

#[test]
fn line_art_preset_and_alpha() {
    let sw = 3.0 / 400.0;
    let img = render(400, 400, |u, v| {
        let ring = |cx: f32, cy: f32, r: f32| (((u - cx).powi(2) + (v - cy).powi(2)).sqrt() - r).abs() < sw / 2.0;
        if ring(0.5, 0.5, 0.3) || ring(0.35, 0.3, 0.1) || ((u - v).abs() < sw && u > 0.2) {
            [0, 0, 0]
        } else {
            [255, 255, 255]
        }
    });
    let a = analyze(&img);
    assert_eq!(a.colors, 2, "{a:?}");
    assert_eq!(a.preset, Preset::Lineart, "{a:?}");
    let mut t = img.clone();
    t.put_pixel(0, 0, Rgba([255, 255, 255, 0]));
    assert!(analyze(&t).has_alpha);
}

#[test]
fn preprocess_basics() {
    let img = logo(64);
    assert_eq!(denoise(&img, 0.0), img);
    let up = upscale(&img, 2, false);
    assert_eq!(up.dimensions(), (128, 128));
    assert_eq!(upscale(&img, 1, false), img);
    // Oversize requests are clamped instead of allocating > 64 MP.
    assert_eq!(effective_upscale_factor(16384, 4096, 4), 1);
    assert_eq!(effective_upscale_factor(4096, 4096, 4), 2);
    assert_eq!(effective_upscale_factor(1024, 1024, 4), 4);
    assert_eq!(effective_upscale_factor(u32::MAX, 2, 4), 1);
    assert_eq!(effective_upscale_factor(10, 10, 0), 1);
    for (w, h, f) in [(16384u32, 4096u32, 4u32), (5000, 3000, 4), (3000, 3000, 3)] {
        let e = effective_upscale_factor(w, h, f) as u64;
        assert!(e >= 1 && (e == 1 || (w as u64 * e) * (h as u64 * e) <= MAX_UPSCALE_PIXELS));
    }
    let near = upscale(&img, 4, true);
    assert_eq!(near.get_pixel(13, 9), img.get_pixel(3, 2));
    assert_eq!(limit_size(&img, 100), img);
    assert_eq!(limit_size(&RgbaImage::new(300, 150), 100).dimensions(), (100, 50));

    // Denoise lowers noise in flat areas but keeps a hard step edge.
    let mut s = 3u32;
    let noisy = RgbaImage::from_fn(64, 64, |x, _| {
        s = s.wrapping_mul(1_103_515_245).wrapping_add(12345);
        let n = ((s >> 16) % 13) as i32 - 6;
        let base = if x < 32 { 40 } else { 210 };
        let v = (base + n) as u8;
        Rgba([v, v, v, 255])
    });
    let d = denoise(&noisy, 0.6);
    let var = |im: &RgbaImage| {
        let vals: Vec<f64> = (4..60)
            .flat_map(|y| (4..28).map(move |x| (x, y)))
            .map(|(x, y)| im.get_pixel(x, y)[0] as f64)
            .collect();
        let m = vals.iter().sum::<f64>() / vals.len() as f64;
        vals.iter().map(|v| (v - m).powi(2)).sum::<f64>() / vals.len() as f64
    };
    assert!(var(&d) < 0.5 * var(&noisy));
    assert!(d.get_pixel(31, 30)[0] < 60 && d.get_pixel(32, 30)[0] > 190);
}
