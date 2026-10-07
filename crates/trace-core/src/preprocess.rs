//! T02. Edge-preserving denoise and upscaling.
use image::imageops::{self, FilterType};
use image::{Rgba, RgbaImage};

/// strength 0..1; 0 returns a clone.
///
/// Bilateral filter in sRGB: spatial Gaussian (radius 1..2) times a range
/// Gaussian on the L1 colour difference, so flat areas are smoothed while
/// edges between distinct colours are preserved. Alpha is kept unchanged and
/// transparent neighbours (alpha<128) do not contribute to opaque pixels.
pub fn denoise(img: &RgbaImage, strength: f32) -> RgbaImage {
    let s = if strength.is_finite() { strength.clamp(0.0, 1.0) } else { 0.0 };
    let (w, h) = (img.width() as usize, img.height() as usize);
    if s <= 0.0 || w == 0 || h == 0 {
        return img.clone();
    }
    let r: isize = if s < 0.5 { 1 } else { 2 };
    let sigma_s = 0.6 + 0.6 * r as f32;
    let sigma_r = 10.0 + 50.0 * s; // in summed-L1 units over 3 channels
    let range_lut: Vec<f32> = (0..=765).map(|d| (-0.5 * (d as f32 / sigma_r).powi(2)).exp()).collect();
    let side = (2 * r + 1) as usize;
    let mut spatial = vec![0.0f32; side * side];
    for dy in -r..=r {
        for dx in -r..=r {
            spatial[((dy + r) as usize) * side + (dx + r) as usize] = (-((dx * dx + dy * dy) as f32) / (2.0 * sigma_s * sigma_s)).exp();
        }
    }
    let src = img.as_raw();
    let mut out = img.clone();
    for y in 0..h {
        for x in 0..w {
            let i = (y * w + x) * 4;
            let c = [src[i] as i32, src[i + 1] as i32, src[i + 2] as i32];
            let opaque = src[i + 3] >= 128;
            let mut acc = [0.0f32; 3];
            let mut wsum = 0.0f32;
            for dy in -r..=r {
                let yy = y as isize + dy;
                if yy < 0 || yy >= h as isize {
                    continue;
                }
                for dx in -r..=r {
                    let xx = x as isize + dx;
                    if xx < 0 || xx >= w as isize {
                        continue;
                    }
                    let j = (yy as usize * w + xx as usize) * 4;
                    if opaque && src[j + 3] < 128 {
                        continue;
                    }
                    let d = (src[j] as i32 - c[0]).abs() + (src[j + 1] as i32 - c[1]).abs() + (src[j + 2] as i32 - c[2]).abs();
                    let wt = spatial[((dy + r) as usize) * side + (dx + r) as usize] * range_lut[d as usize];
                    acc[0] += wt * src[j] as f32;
                    acc[1] += wt * src[j + 1] as f32;
                    acc[2] += wt * src[j + 2] as f32;
                    wsum += wt;
                }
            }
            if wsum > 0.0 {
                let px = out.get_pixel_mut(x as u32, y as u32);
                for ch in 0..3 {
                    px[ch] = (acc[ch] / wsum).round().clamp(0.0, 255.0) as u8;
                }
            }
        }
    }
    out
}

/// factor in {1,2,4}; `nearest` for pixel art, smooth edge-aware otherwise.
///
/// Smooth path: Catmull-Rom bicubic followed by a mild unsharp mask (colour
/// only; alpha comes from the bicubic result) to keep edges crisp.
pub fn upscale(img: &RgbaImage, factor: u32, nearest: bool) -> RgbaImage {
    let (w, h) = img.dimensions();
    if factor <= 1 || w == 0 || h == 0 {
        return img.clone();
    }
    let (Some(nw), Some(nh)) = (w.checked_mul(factor), h.checked_mul(factor)) else {
        return img.clone();
    };
    if nearest {
        return RgbaImage::from_fn(nw, nh, |x, y| *img.get_pixel(x / factor, y / factor));
    }
    let up = imageops::resize(img, nw, nh, FilterType::CatmullRom);
    let mut sharp = imageops::unsharpen(&up, 0.5 * factor as f32, 2);
    for (s, u) in sharp.pixels_mut().zip(up.pixels()) {
        *s = Rgba([s[0], s[1], s[2], u[3]]);
    }
    sharp
}

/// Downscale so max(w,h) <= max_dim (no-op if already smaller).
pub fn limit_size(img: &RgbaImage, max_dim: u32) -> RgbaImage {
    let (w, h) = img.dimensions();
    let m = w.max(h);
    if max_dim == 0 || m <= max_dim {
        return img.clone();
    }
    let scale = max_dim as f64 / m as f64;
    let nw = ((w as f64 * scale).round() as u32).clamp(1, max_dim);
    let nh = ((h as f64 * scale).round() as u32).clamp(1, max_dim);
    imageops::resize(img, nw, nh, FilterType::Lanczos3)
}
