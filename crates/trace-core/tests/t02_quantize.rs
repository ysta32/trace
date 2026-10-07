//! T02 quantization tests on synthetic antialiased images.
use image::{Rgba, RgbaImage};
use std::time::Instant;
use trace_core::quantize::{auto_k, quantize, TRANSPARENT};

/// Supersampled (4x4) rendering, averaged in sRGB like typical rasterizers.
fn render(w: u32, h: u32, f: impl Fn(f32, f32) -> [u8; 3]) -> RgbaImage {
    const SS: u32 = 4;
    RgbaImage::from_fn(w, h, |x, y| {
        let mut acc = [0u32; 3];
        for sy in 0..SS {
            for sx in 0..SS {
                let c = f((x as f32 + (sx as f32 + 0.5) / SS as f32) / w as f32, (y as f32 + (sy as f32 + 0.5) / SS as f32) / h as f32);
                for k in 0..3 {
                    acc[k] += c[k] as u32;
                }
            }
        }
        let n = SS * SS;
        Rgba([((acc[0] + n / 2) / n) as u8, ((acc[1] + n / 2) / n) as u8, ((acc[2] + n / 2) / n) as u8, 255])
    })
}

/// White background, red disc, navy rotated square overlapping the disc.
pub fn logo(w: u32, h: u32) -> RgbaImage {
    render(w, h, |u, v| {
        let (rx, ry) = (u - 0.62, v - 0.6);
        let (a, b) = (0.8 * rx + 0.6 * ry, -0.6 * rx + 0.8 * ry);
        if a.abs() < 0.2 && b.abs() < 0.2 {
            [20, 40, 120]
        } else if (u - 0.4).powi(2) + (v - 0.42).powi(2) < 0.3f32.powi(2) {
            [220, 30, 40]
        } else {
            [250, 250, 250]
        }
    })
}

/// Black strokes (circles and diagonals, ~2.5px wide at 256px) on white.
fn line_art(w: u32, h: u32) -> RgbaImage {
    let sw = 2.5 / w as f32;
    render(w, h, move |u, v| {
        let ring = |cx: f32, cy: f32, r: f32| (((u - cx).powi(2) + (v - cy).powi(2)).sqrt() - r).abs() < sw / 2.0;
        let line = |a: f32, b: f32, c: f32| (a * u + b * v + c).abs() / (a * a + b * b).sqrt() < sw / 2.0;
        if ring(0.5, 0.5, 0.3) || ring(0.3, 0.35, 0.12) || line(1.0, -0.7, -0.1) || line(0.3, 1.0, -0.9) {
            [10, 10, 10]
        } else {
            [255, 255, 255]
        }
    })
}

fn usage(labels: &[u16], k: usize) -> Vec<usize> {
    let mut c = vec![0; k];
    for &l in labels {
        if l != TRANSPARENT {
            c[l as usize] += 1;
        }
    }
    c
}

#[test]
fn logo_three_colors_no_blend_labels() {
    let img = logo(256, 256);
    let k = auto_k(&img);
    assert!((3..=4).contains(&k), "auto_k = {k}");
    let q = quantize(&img, None, None);
    assert!((3..=4).contains(&q.palette.len()), "palette {:?}", q.palette);
    let n = q.labels.len();
    for (i, c) in usage(&q.labels, q.palette.len()).into_iter().enumerate() {
        assert!(c * 1000 >= n * 2, "label {i} ({:?}) used by only {c}/{n}", q.palette[i]);
    }
    // Palette colours are the true flat colours.
    for want in [[250u8, 250, 250], [220, 30, 40], [20, 40, 120]] {
        assert!(
            q.palette.iter().any(|p| (0..3).all(|c| (p[c] as i32 - want[c] as i32).abs() <= 4)),
            "missing {want:?} in {:?}",
            q.palette
        );
    }
}

#[test]
fn line_art_two_colors() {
    let img = line_art(256, 256);
    assert_eq!(auto_k(&img), 2);
    let q = quantize(&img, None, None);
    assert_eq!(q.palette.len(), 2, "{:?}", q.palette);
    assert_eq!(q.labels.len(), 256 * 256);
}

#[test]
fn fixed_k_and_forced_palette() {
    let img = logo(128, 128);
    let q = quantize(&img, Some(2), None);
    assert!(q.palette.len() <= 2 && !q.palette.is_empty());
    let pal = [[0u8, 0, 0], [255, 255, 255], [255, 0, 0]];
    let f = quantize(&img, None, Some(&pal));
    assert_eq!(f.palette, pal.to_vec());
    // Corner is white background, disc centre is red.
    assert_eq!(f.labels[0], 1);
    let c = (0.42 * 128.0) as usize * 128 + (0.4 * 128.0) as usize;
    assert_eq!(f.labels[c], 2);
}

#[test]
fn transparency_is_preserved() {
    let mut img = logo(64, 64);
    for y in 0..64 {
        for x in 0..10 {
            img.put_pixel(x, y, Rgba([0, 0, 0, 0]));
        }
    }
    let q = quantize(&img, None, None);
    assert_eq!(q.labels[0], TRANSPARENT);
    assert_eq!(q.labels[63 * 64 + 9], TRANSPARENT);
    assert!(q.labels[63 * 64 + 10] != TRANSPARENT);
    let empty = RgbaImage::from_pixel(8, 8, Rgba([1, 2, 3, 0]));
    let q = quantize(&empty, None, None);
    assert!(q.palette.is_empty() && q.labels.iter().all(|&l| l == TRANSPARENT));
    assert_eq!(auto_k(&empty), 2);
}

#[test]
fn speckles_are_removed() {
    let mut img = RgbaImage::from_pixel(200, 200, Rgba([255, 255, 255, 255]));
    for y in 100..200 {
        for x in 0..200 {
            img.put_pixel(x, y, Rgba([0, 90, 200, 255]));
        }
    }
    for i in 0..20u32 {
        img.put_pixel(10 + i * 9, 20 + (i * 7) % 60, Rgba([0, 90, 200, 255]));
    }
    let q = quantize(&img, Some(2), None);
    let top = q.labels[0];
    for i in 0..20usize {
        assert_eq!(q.labels[(20 + (i * 7) % 60) * 200 + 10 + i * 9], top);
    }
}

#[test]
fn auto_k_is_fast_on_1024() {
    let limit = if cfg!(debug_assertions) { 30_000 } else { 1_500 };
    let img = logo(1024, 1024);
    let t = Instant::now();
    let k = auto_k(&img);
    let ms = t.elapsed().as_millis();
    assert!((3..=4).contains(&k), "auto_k = {k}");
    assert!(ms < limit, "auto_k logo took {ms} ms");
    // Noisy photo-like content is the worst case for histogram size.
    let mut s = 0x1234_5678u32;
    let photo = RgbaImage::from_fn(1024, 1024, |x, y| {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        let n = (s % 41) as i32 - 20;
        let c = |v: u32| (v as i32 + n).clamp(0, 255) as u8;
        Rgba([c(x / 4), c(y / 4), c((x + y) / 8), 255])
    });
    let t = Instant::now();
    let k = auto_k(&photo);
    let ms = t.elapsed().as_millis();
    assert!((2..=64).contains(&k));
    assert!(ms < limit, "auto_k photo took {ms} ms");
}
