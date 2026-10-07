//! T01. trace() orchestration: presets -> preprocess -> quantize -> vectorize.
use crate::analyze::{analyze, detect_pixel_scale};
use crate::gradient::fit_linear_gradient;
use crate::preprocess::{denoise, limit_size, upscale};
use crate::quantize::{auto_k, quantize, Quantized, TRANSPARENT};
use crate::types::{AutoOr, CurveMode, GradientDef, GradientStop, Mode, Preset, Shape, TraceOptions, TraceResult, TraceStats};
use crate::vectorize::{length_threshold_for_simplify, speckle_factor_for_simplify, vectorize, VecParams};
use image::RgbaImage;

const DEFAULT_MAX_DIMENSION: u32 = 2048;
/// Shapes covering at least this fraction of the working area get a gradient fit.
const GRADIENT_MIN_FRACTION: f64 = 0.01;
const MAX_GRADIENTS: usize = 32;

#[cfg(not(target_arch = "wasm32"))]
struct Clock(std::time::Instant);
#[cfg(not(target_arch = "wasm32"))]
impl Clock {
    fn start() -> Self {
        Clock(std::time::Instant::now())
    }
    fn ms(&self) -> f64 {
        self.0.elapsed().as_secs_f64() * 1000.0
    }
}
/// `std::time::Instant` panics on wasm32-unknown-unknown; timing is reported as 0 there.
#[cfg(target_arch = "wasm32")]
struct Clock;
#[cfg(target_arch = "wasm32")]
impl Clock {
    fn start() -> Self {
        Clock
    }
    fn ms(&self) -> f64 {
        0.0
    }
}

/// Per-preset defaults; every field can be overridden by TraceOptions.
#[derive(Debug, Clone, Copy)]
pub struct PresetDefaults {
    /// (min, max) clamp applied to the auto colour count.
    pub colors: (u32, u32),
    pub denoise: f32,
    pub curve_mode: CurveMode,
    pub corner_threshold: f32,
    /// Speckle side length in original pixels (area threshold = side^2).
    pub filter_speckle: u32,
    pub simplify: f32,
    pub gradients: bool,
}

pub fn preset_defaults(p: Preset) -> PresetDefaults {
    let base = PresetDefaults {
        colors: (2, 16),
        denoise: 0.3,
        curve_mode: CurveMode::Spline,
        corner_threshold: 60.0,
        filter_speckle: 8,
        simplify: 0.2,
        gradients: false,
    };
    match p {
        Preset::Auto | Preset::Logo => base,
        Preset::Icon => PresetDefaults { filter_speckle: 4, simplify: 0.1, ..base },
        Preset::Lineart => PresetDefaults { colors: (2, 4), denoise: 0.4, filter_speckle: 6, simplify: 0.3, ..base },
        Preset::Pixelart => PresetDefaults {
            colors: (2, 64),
            denoise: 0.0,
            curve_mode: CurveMode::Pixel,
            filter_speckle: 0,
            simplify: 0.0,
            ..base
        },
        Preset::Photo => PresetDefaults {
            colors: (16, 32),
            denoise: 0.5,
            filter_speckle: 16,
            simplify: 0.5,
            gradients: true,
            ..base
        },
    }
}

/// Parses '#rgb', '#rrggbb' (leading '#' optional).
pub fn parse_hex_color(s: &str) -> Option<[u8; 3]> {
    let h = s.trim().trim_start_matches('#');
    if !h.is_ascii() {
        return None;
    }
    let v = |t: &str| u8::from_str_radix(t, 16).ok();
    match h.len() {
        3 => {
            let c = |i: usize| v(&h[i..i + 1]).map(|x| x * 17);
            Some([c(0)?, c(1)?, c(2)?])
        }
        6 => Some([v(&h[0..2])?, v(&h[2..4])?, v(&h[4..6])?]),
        _ => None,
    }
}

pub fn hex(c: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
}

/// Nearest-neighbour downscale by an integer block size (samples block centres).
fn downscale_nearest(img: &RgbaImage, s: u32) -> RgbaImage {
    let (w, h) = ((img.width() / s).max(1), (img.height() / s).max(1));
    RgbaImage::from_fn(w, h, |x, y| {
        let sx = (x * s + s / 2).min(img.width() - 1);
        let sy = (y * s + s / 2).min(img.height() - 1);
        *img.get_pixel(sx, sy)
    })
}

/// Palette index covering >60% of the border, if any.
pub fn detect_background(q: &Quantized) -> Option<usize> {
    let (w, h) = (q.width as usize, q.height as usize);
    if w == 0 || h == 0 || q.labels.len() < w * h {
        return None;
    }
    let mut counts = vec![0usize; q.palette.len()];
    let mut total = 0usize;
    let mut add = |x: usize, y: usize| {
        total += 1;
        let l = q.labels[y * w + x];
        if l != TRANSPARENT && (l as usize) < counts.len() {
            counts[l as usize] += 1;
        }
    };
    for x in 0..w {
        add(x, 0);
        if h > 1 {
            add(x, h - 1);
        }
    }
    for y in 1..h.saturating_sub(1) {
        add(0, y);
        if w > 1 {
            add(w - 1, y);
        }
    }
    let (best, n) = counts.iter().enumerate().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(&a.0)))?;
    (*n as f64 > 0.6 * total as f64).then_some(best)
}

fn empty_result(w: u32, h: u32, preset: Preset, clock: &Clock) -> TraceResult {
    TraceResult {
        width: w,
        height: h,
        palette: Vec::new(),
        background: None,
        shapes: Vec::new(),
        gradients: Vec::new(),
        stats: TraceStats { paths: 0, nodes: 0, colors: 0, ms: clock.ms(), preset },
    }
}

pub fn trace(img: &RgbaImage, opts: &TraceOptions) -> TraceResult {
    let clock = Clock::start();
    let (ow, oh) = img.dimensions();
    let requested = opts.preset.unwrap_or(Preset::Auto);
    if ow == 0 || oh == 0 {
        return empty_result(ow, oh, if requested == Preset::Auto { Preset::Logo } else { requested }, &clock);
    }

    // 1. Size limit. `lim` = limited / original (<= 1).
    let max_dim = opts.max_dimension.filter(|&m| m > 0).unwrap_or(DEFAULT_MAX_DIMENSION);
    let base = limit_size(img, max_dim);
    if base.width() == 0 || base.height() == 0 {
        return empty_result(ow, oh, if requested == Preset::Auto { Preset::Logo } else { requested }, &clock);
    }
    let lim = base.width().max(base.height()) as f64 / ow.max(oh) as f64;

    // 2. Preset resolution.
    let analysis = (requested == Preset::Auto).then(|| analyze(&base));
    let preset = match &analysis {
        Some(a) if a.preset != Preset::Auto => a.preset,
        Some(_) => Preset::Logo,
        None => requested,
    };
    let def = preset_defaults(preset);
    let pixel_art = preset == Preset::Pixelart;
    let curve_mode = opts.curve_mode.unwrap_or(def.curve_mode);

    // 3. Resample into working space. `factor` = working / limited.
    let (work, factor) = if pixel_art {
        let ps = match &analysis {
            Some(a) => a.pixel_scale,
            None => detect_pixel_scale(&base),
        }
        .max(1);
        let den = opts.denoise.unwrap_or(def.denoise).clamp(0.0, 1.0);
        let small = if ps > 1 { downscale_nearest(&base, ps) } else { base.clone() };
        let small = if den > 0.0 { denoise(&small, den) } else { small };
        (small, 1.0 / ps as f64)
    } else {
        let max_side = base.width().max(base.height());
        let up = match &opts.upscale {
            Some(AutoOr::Value(n)) => match *n {
                0 | 1 => 1,
                2 | 3 => 2,
                _ => 4,
            },
            _ if curve_mode == CurveMode::Pixel => 1,
            _ if max_side < 128 => 4,
            _ if max_side < 512 => 2,
            _ => 1,
        };
        let den = opts.denoise.unwrap_or(def.denoise).clamp(0.0, 1.0);
        let pre = if den > 0.0 { denoise(&base, den) } else { base.clone() };
        let work = if up > 1 { upscale(&pre, up, curve_mode == CurveMode::Pixel) } else { pre };
        (work, up as f64)
    };
    // working coordinate / divisor = original coordinate.
    let divisor = factor * lim;

    // 4. Quantize.
    let forced: Vec<[u8; 3]> = opts.palette.iter().flatten().filter_map(|s| parse_hex_color(s)).collect();
    let q = if !forced.is_empty() {
        quantize(&work, Some(forced.len() as u32), Some(&forced))
    } else {
        let k = match &opts.colors {
            Some(AutoOr::Value(n)) => (*n).clamp(1, 64),
            _ => {
                let auto = match &analysis {
                    Some(a) if a.colors > 0 => a.colors,
                    _ => auto_k(&work),
                };
                auto.clamp(def.colors.0, def.colors.1)
            }
        };
        quantize(&work, Some(k), None)
    };

    // 5. Vectorize.
    let simplify = opts.simplify.unwrap_or(def.simplify).clamp(0.0, 1.0);
    let speckle_side = match opts.filter_speckle {
        Some(s) => s as f64,
        None => def.filter_speckle as f64 * speckle_factor_for_simplify(simplify) as f64,
    };
    let speckle_area = (speckle_side * factor).powi(2).round().min(u32::MAX as f64) as u32;
    let params = VecParams {
        mode: opts.mode.unwrap_or(Mode::Stacked),
        curve_mode,
        corner_threshold_deg: opts.corner_threshold.unwrap_or(def.corner_threshold).clamp(0.0, 180.0),
        length_threshold: length_threshold_for_simplify(simplify),
        splice_threshold_deg: 45.0,
        max_iterations: 10,
        filter_speckle: speckle_area,
        scale: divisor as f32,
    };
    let raw = vectorize(&q, &params);

    // 6. Assemble, with optional gradient fills.
    let palette: Vec<String> = q.palette.iter().map(|&c| hex(c)).collect();
    let want_gradients = opts.gradients.unwrap_or(def.gradients) && !pixel_art && curve_mode != CurveMode::Pixel;
    let work_area = (q.width as f64) * (q.height as f64);
    let mut gradients = Vec::new();
    let mut shapes = Vec::with_capacity(raw.len());
    let mut nodes = 0u32;
    for (i, r) in raw.into_iter().enumerate() {
        nodes = nodes.saturating_add(r.nodes);
        let mut fill = palette.get(r.color_index as usize).cloned().unwrap_or_else(|| "#000000".to_string());
        if want_gradients && gradients.len() < MAX_GRADIENTS && r.mask_area as f64 >= GRADIENT_MIN_FRACTION * work_area {
            if let Some(g) = gradient_for(&base, &q, factor, lim, &r.bbox, r.color_index, gradients.len()) {
                fill = format!("url(#{})", g.id);
                gradients.push(g);
            }
        }
        shapes.push(Shape { id: i as u32, fill, color_index: r.color_index as i32, d: r.d });
    }
    let background = detect_background(&q).map(|c| palette[c].clone());
    TraceResult {
        width: ow,
        height: oh,
        background,
        stats: TraceStats { paths: shapes.len() as u32, nodes, colors: palette.len() as u32, ms: clock.ms(), preset },
        palette,
        shapes,
        gradients,
    }
}

/// Fits a gradient over the pixels of `color` inside `bbox` (working coords),
/// evaluated on `base` (limited original-resolution image).
fn gradient_for(base: &RgbaImage, q: &Quantized, factor: f64, lim: f64, bbox: &[u32; 4], color: u16, n: usize) -> Option<GradientDef> {
    let (bw, bh) = (base.width() as usize, base.height() as usize);
    let (qw, qh) = (q.width as usize, q.height as usize);
    let mut mask = vec![false; bw * bh];
    let x0 = (bbox[0] as f64 / factor).floor() as usize;
    let y0 = (bbox[1] as f64 / factor).floor() as usize;
    let x1 = ((bbox[2] as f64 / factor).ceil() as usize).min(bw);
    let y1 = ((bbox[3] as f64 / factor).ceil() as usize).min(bh);
    let mut any = false;
    for y in y0..y1 {
        let qy = (((y as f64 + 0.5) * factor) as usize).min(qh - 1);
        for x in x0..x1 {
            let qx = (((x as f64 + 0.5) * factor) as usize).min(qw - 1);
            if q.labels[qy * qw + qx] == color {
                mask[y * bw + x] = true;
                any = true;
            }
        }
    }
    if !any {
        return None;
    }
    let fit = fit_linear_gradient(base, &mask)?;
    let k = (1.0 / lim) as f32;
    Some(GradientDef {
        id: format!("g{n}"),
        x1: fit.x1 * k,
        y1: fit.y1 * k,
        x2: fit.x2 * k,
        y2: fit.y2 * k,
        stops: fit.stops.iter().map(|&(offset, c)| GradientStop { offset, color: hex(c) }).collect(),
    })
}
