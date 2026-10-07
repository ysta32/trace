//! T02. Image classification -> suggested preset/colors.
use crate::quantize::{auto_k_prepared, dist2, prepare, Prep};
use crate::types::{Analysis, Preset};
use image::RgbaImage;
use std::collections::HashSet;

pub fn analyze(img: &RgbaImage) -> Analysis {
    let (width, height) = img.dimensions();
    let has_alpha = img.pixels().any(|p| p[3] < 255);
    if width == 0 || height == 0 {
        return Analysis { width, height, preset: Preset::Logo, colors: 2, is_pixel_art: false, pixel_scale: 1, has_gradients: false, has_alpha };
    }
    let prep = prepare(img);
    let colors = auto_k_prepared(img, &prep);
    let pixel_scale = detect_pixel_scale(img);
    let n_opaque = prep.opaque.iter().filter(|&&o| o).count().max(1);
    let n_blend = prep.blend.iter().filter(|&&b| b).count();
    let blend_frac = n_blend as f64 / n_opaque as f64;
    let distinct = distinct_colors(img, 4096);
    let max_dim = width.max(height);
    let is_pixel_art = pixel_scale > 1 || (max_dim <= 128 && distinct <= 48 && blend_frac < 0.05);
    let grad_frac = gradient_fraction(&prep);
    let has_gradients = grad_frac > 0.12;
    let (bins, entropy) = bin_entropy(img);

    let preset = if is_pixel_art {
        Preset::Pixelart
    } else if (bins >= 1024 && entropy >= 7.5) || (has_gradients && colors >= 24 && entropy >= 6.5) {
        Preset::Photo
    } else if colors <= 3 && is_line_art(&prep) {
        Preset::Lineart
    } else if max_dim <= 256 {
        Preset::Icon
    } else {
        Preset::Logo
    };
    Analysis { width, height, preset, colors, is_pixel_art, pixel_scale, has_gradients, has_alpha }
}

/// Nearest-neighbour block size of upscaled pixel art (1 if not pixel art).
///
/// Collects every column/row index where a pixel differs from its left/upper
/// neighbour. If all such indices are congruent modulo s (s>=2), every s x s
/// block of the grid (with that offset) is constant; s is the gcd of the
/// index differences, which is verified implicitly by construction.
pub fn detect_pixel_scale(img: &RgbaImage) -> u32 {
    let (w, h) = (img.width() as usize, img.height() as usize);
    if w < 4 || h < 4 {
        return 1;
    }
    let raw: &[u32] = &img.pixels().map(|p| u32::from_le_bytes(p.0)).collect::<Vec<_>>();
    let mut col_change = vec![false; w];
    let mut row_change = vec![false; h];
    for y in 0..h {
        let row = &raw[y * w..(y + 1) * w];
        for x in 1..w {
            if row[x] != row[x - 1] {
                col_change[x] = true;
            }
        }
        if y > 0 {
            let prev = &raw[(y - 1) * w..y * w];
            if row != prev {
                row_change[y] = true;
            }
        }
    }
    let g = gcd(diff_gcd(&col_change), diff_gcd(&row_change));
    let n_changes = col_change.iter().filter(|&&c| c).count() + row_change.iter().filter(|&&c| c).count();
    if g >= 2 && n_changes >= 3 && g as usize <= w.min(h) / 2 {
        g
    } else {
        1
    }
}

fn gcd(mut a: u32, mut b: u32) -> u32 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

/// gcd of differences between consecutive change positions (0 if <2 changes).
fn diff_gcd(changes: &[bool]) -> u32 {
    let mut prev: Option<usize> = None;
    let mut g = 0u32;
    for (i, &c) in changes.iter().enumerate() {
        if c {
            if let Some(p) = prev {
                g = gcd(g, (i - p) as u32);
            }
            prev = Some(i);
        }
    }
    g
}

fn distinct_colors(img: &RgbaImage, cap: usize) -> usize {
    let mut set = HashSet::new();
    for p in img.pixels() {
        if p[3] >= 128 {
            set.insert([p[0], p[1], p[2]]);
            if set.len() > cap {
                break;
            }
        }
    }
    set.len()
}

/// (non-empty 5-bit RGB bins, Shannon entropy in bits) over opaque pixels.
fn bin_entropy(img: &RgbaImage) -> (usize, f64) {
    let mut bins = vec![0u32; 1 << 15];
    let mut n = 0u64;
    for p in img.pixels() {
        if p[3] >= 128 {
            bins[((p[0] as usize >> 3) << 10) | ((p[1] as usize >> 3) << 5) | (p[2] as usize >> 3)] += 1;
            n += 1;
        }
    }
    if n == 0 {
        return (0, 0.0);
    }
    let mut used = 0;
    let mut e = 0.0;
    for &c in &bins {
        if c > 0 {
            used += 1;
            let p = c as f64 / n as f64;
            e -= p * p.log2();
        }
    }
    (used, e)
}

/// Fraction of (sampled) opaque pixels lying in smooth, non-flat ramps:
/// moderate first derivative and small second derivative in OKLab.
fn gradient_fraction(prep: &Prep) -> f64 {
    let (w, h) = (prep.w, prep.h);
    if w < 3 || h < 3 {
        return 0.0;
    }
    let step = ((w * h) as f64 / 60_000.0).sqrt().ceil().max(1.0) as usize;
    let (mut total, mut smooth) = (0usize, 0usize);
    let mut y = 1;
    while y + 1 < h {
        let mut x = 1;
        while x + 1 < w {
            let i = y * w + x;
            let idx = [i, i - 1, i + 1, i - w, i + w];
            if idx.iter().all(|&j| prep.opaque[j]) {
                total += 1;
                let p = prep.lab[i];
                let (l, r, u, d) = (prep.lab[i - 1], prep.lab[i + 1], prep.lab[i - w], prep.lab[i + w]);
                let g = (0.25 * (dist2(l, r) + dist2(u, d))).sqrt();
                let sec = |a: [f32; 3], b: [f32; 3]| dist2([a[0] + b[0] - 2.0 * p[0], a[1] + b[1] - 2.0 * p[1], a[2] + b[2] - 2.0 * p[2]], [0.0; 3]).sqrt();
                let curv = sec(l, r).max(sec(u, d));
                if g > 0.0015 && g < 0.04 && curv < 0.5 * g + 0.002 {
                    smooth += 1;
                }
            }
            x += step;
        }
        y += step;
    }
    if total == 0 {
        0.0
    } else {
        smooth as f64 / total as f64
    }
}

/// Mostly dark, thin strokes on a light (or transparent) background.
fn is_line_art(prep: &Prep) -> bool {
    let (w, h) = (prep.w, prep.h);
    let n = w * h;
    let dark: Vec<bool> = (0..n).map(|i| prep.opaque[i] && prep.lab[i][0] < 0.45).collect();
    let light = (0..n).filter(|&i| !prep.opaque[i] || (prep.lab[i][0] > 0.8 && chroma(prep.lab[i]) < 0.08)).count();
    let n_dark = dark.iter().filter(|&&d| d).count();
    if n_dark == 0 || light * 2 < n || n_dark * 10 > n * 3 {
        return false;
    }
    // A dark pixel is "thick" if all 8 pixels at Chebyshev distance 3 are dark.
    const R: isize = 3;
    let offs = [(-R, -R), (0, -R), (R, -R), (-R, 0), (R, 0), (-R, R), (0, R), (R, R)];
    let mut thick = 0usize;
    for y in 0..h {
        for x in 0..w {
            if !dark[y * w + x] {
                continue;
            }
            let all = offs.iter().all(|&(dx, dy)| {
                let (xx, yy) = (x as isize + dx, y as isize + dy);
                xx >= 0 && yy >= 0 && (xx as usize) < w && (yy as usize) < h && dark[yy as usize * w + xx as usize]
            });
            if all {
                thick += 1;
            }
        }
    }
    thick * 2 < n_dark
}

fn chroma(l: [f32; 3]) -> f32 {
    (l[1] * l[1] + l[2] * l[2]).sqrt()
}
