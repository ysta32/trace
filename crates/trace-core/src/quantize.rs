//! T02. Palette quantization in perceptual (Lab/OKLab) space.
//!
//! Pipeline: sRGB -> OKLab, antialias-blend detection (pixels lying on a
//! linear ramp between two distinct neighbours), weighted k-means++ on a
//! colour histogram of non-blend pixels, merge near-duplicate clusters,
//! antialias-aware assignment (blend pixels may only take a label present in
//! their non-blend neighbourhood), and an isolated-pixel majority cleanup.
use image::RgbaImage;
use std::sync::OnceLock;

pub const TRANSPARENT: u16 = u16::MAX;
#[derive(Debug, Clone)]
pub struct Quantized { pub width: u32, pub height: u32, pub palette: Vec<[u8; 3]>, pub labels: Vec<u16> }

/// k=None => auto color count. `forced` overrides palette (labels = nearest). Pixels with alpha<128 => TRANSPARENT.
pub fn quantize(img: &RgbaImage, k: Option<u32>, forced: Option<&[[u8; 3]]>) -> Quantized {
    let (w, h) = img.dimensions();
    if let Some(pal) = forced.filter(|p| !p.is_empty()) {
        // Labels are u16 with TRANSPARENT reserved.
        return quantize_forced(img, &pal[..pal.len().min(TRANSPARENT as usize)]);
    }
    let prep = prepare(img);
    let (pts, wts) = histogram(img, &prep);
    if pts.is_empty() {
        return Quantized { width: w, height: h, palette: Vec::new(), labels: vec![TRANSPARENT; prep.len()] };
    }
    let centers = match k {
        Some(k) if k > 0 => {
            let (c, sizes) = kmeans_fixed(&pts, &wts, (k as usize).min(1024));
            merge_close(c, sizes, MERGE_FIXED)
        }
        _ => auto_palette(&pts, &wts),
    };
    let mut labels = assign(&prep, &centers);
    if (w.max(h)) > 128 {
        majority_filter(&mut labels, prep.w, prep.h);
    }
    compact(img, &prep, &centers, labels)
}

/// Suggested palette size 2..=64.
pub fn auto_k(img: &RgbaImage) -> u32 {
    auto_k_prepared(img, &prepare(img))
}

/// `auto_k` reusing an existing [`prepare`] result.
pub(crate) fn auto_k_prepared(img: &RgbaImage, prep: &Prep) -> u32 {
    let (pts, wts) = histogram(img, prep);
    (auto_palette(&pts, &wts).len() as u32).clamp(2, 64)
}

// ---------------------------------------------------------------- colour math

pub(crate) type Lab = [f32; 3];

fn srgb_lut() -> &'static [f64; 256] {
    static LUT: OnceLock<[f64; 256]> = OnceLock::new();
    LUT.get_or_init(|| {
        let mut t = [0.0f64; 256];
        for (i, v) in t.iter_mut().enumerate() {
            let c = i as f64 / 255.0;
            *v = if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) };
        }
        t
    })
}

/// sRGB (8-bit) -> OKLab (L in 0..1).
pub(crate) fn rgb_to_oklab(c: [u8; 3]) -> Lab {
    let lut = srgb_lut();
    let (r, g, b) = (lut[c[0] as usize], lut[c[1] as usize], lut[c[2] as usize]);
    let l = (0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b).cbrt();
    let m = (0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b).cbrt();
    let s = (0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b).cbrt();
    [
        (0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s) as f32,
        (1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s) as f32,
        (0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s) as f32,
    ]
}

/// OKLab -> sRGB (8-bit, clamped).
pub(crate) fn oklab_to_rgb(c: Lab) -> [u8; 3] {
    let (lc, ac, bc) = (c[0] as f64, c[1] as f64, c[2] as f64);
    let l = lc + 0.396_337_777_4 * ac + 0.215_803_757_3 * bc;
    let m = lc - 0.105_561_345_8 * ac - 0.063_854_172_8 * bc;
    let s = lc - 0.089_484_177_5 * ac - 1.291_485_548 * bc;
    let (l, m, s) = (l * l * l, m * m * m, s * s * s);
    let r = 4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s;
    let g = -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s;
    let b = -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s;
    let enc = |v: f64| -> u8 {
        let v = v.clamp(0.0, 1.0);
        let e = if v <= 0.003_130_8 { 12.92 * v } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 };
        (e * 255.0 + 0.5).clamp(0.0, 255.0) as u8
    };
    [enc(r), enc(g), enc(b)]
}

#[inline]
pub(crate) fn dist2(a: Lab, b: Lab) -> f32 {
    let (d0, d1, d2) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    d0 * d0 + d1 * d1 + d2 * d2
}

#[inline]
fn nearest(p: Lab, centers: &[Lab]) -> (usize, f32) {
    let mut best = (0usize, f32::INFINITY);
    for (i, c) in centers.iter().enumerate() {
        let d = dist2(p, *c);
        if d < best.1 {
            best = (i, d);
        }
    }
    best
}

/// Tiny deterministic xorshift64* RNG.
struct XorShift(u64);
impl XorShift {
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

// ---------------------------------------------------------------- preparation

/// Per-pixel OKLab, opacity and antialias-blend flags.
pub(crate) struct Prep {
    pub w: usize,
    pub h: usize,
    pub lab: Vec<Lab>,
    pub opaque: Vec<bool>,
    pub blend: Vec<bool>,
}
impl Prep {
    fn len(&self) -> usize {
        self.w * self.h
    }
}

/// Minimum OKLab distance between the two neighbours for a pixel to count as a blend.
const BLEND_MIN_SPAN: f32 = 0.06;
/// Clusters closer than this (OKLab) are merged (auto / fixed k).
const MERGE_AUTO: f32 = 0.03;
const MERGE_FIXED: f32 = 0.012;

pub(crate) fn prepare(img: &RgbaImage) -> Prep {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let n = w * h;
    let mut lab = Vec::with_capacity(n);
    let mut opaque = Vec::with_capacity(n);
    // Cache conversions of runs of identical pixels (very common in flat art).
    let mut last: Option<([u8; 3], Lab)> = None;
    for p in img.pixels() {
        let rgb = [p[0], p[1], p[2]];
        let l = match last {
            Some((c, l)) if c == rgb => l,
            _ => {
                let l = rgb_to_oklab(rgb);
                last = Some((rgb, l));
                l
            }
        };
        lab.push(l);
        opaque.push(p[3] >= 128);
    }
    let blend = detect_blends(w, h, &lab, &opaque);
    Prep { w, h, lab, opaque, blend }
}

/// A pixel is an antialias blend if along some axis/diagonal its colour lies
/// (approximately) on the segment between two clearly different neighbours.
fn detect_blends(w: usize, h: usize, lab: &[Lab], opaque: &[bool]) -> Vec<bool> {
    const DIRS: [(isize, isize); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];
    let mut blend = vec![false; w * h];
    if w < 3 && h < 3 {
        return blend;
    }
    let min2 = BLEND_MIN_SPAN * BLEND_MIN_SPAN;
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if !opaque[i] {
                continue;
            }
            let p = lab[i];
            for &(dx, dy) in &DIRS {
                let (ax, ay) = (x as isize - dx, y as isize - dy);
                let (bx, by) = (x as isize + dx, y as isize + dy);
                if ax < 0 || ay < 0 || bx < 0 || by < 0 {
                    continue;
                }
                let (ax, ay, bx, by) = (ax as usize, ay as usize, bx as usize, by as usize);
                if ax >= w || ay >= h || bx >= w || by >= h {
                    continue;
                }
                let (ia, ib) = (ay * w + ax, by * w + bx);
                if !opaque[ia] || !opaque[ib] {
                    continue;
                }
                let (a, b) = (lab[ia], lab[ib]);
                let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                let n2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
                if n2 < min2 {
                    continue;
                }
                let ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
                let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / n2;
                if !(0.12..=0.88).contains(&t) {
                    continue;
                }
                let q = [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
                // sRGB blends are curved in OKLab: allow a generous perpendicular tolerance.
                let tol = 0.25 * n2.sqrt() + 0.01;
                if dist2(p, q) <= tol * tol {
                    blend[i] = true;
                    break;
                }
            }
        }
    }
    blend
}

/// Weighted colour histogram (mean OKLab per sRGB bin) of opaque non-blend pixels.
/// Falls back to all opaque pixels if almost everything is a blend.
fn histogram(img: &RgbaImage, prep: &Prep) -> (Vec<Lab>, Vec<f32>) {
    let n_opaque = prep.opaque.iter().filter(|&&o| o).count();
    if n_opaque == 0 {
        return (Vec::new(), Vec::new());
    }
    let n_core = (0..prep.len()).filter(|&i| prep.opaque[i] && !prep.blend[i]).count();
    let use_all = n_core * 20 < n_opaque;
    let build = |bits: u32| -> Vec<[f64; 4]> {
        let shift = 8 - bits;
        let mut bins = vec![[0.0f64; 4]; 1 << (3 * bits)];
        for (i, p) in img.pixels().enumerate() {
            if !prep.opaque[i] || (!use_all && prep.blend[i]) {
                continue;
            }
            let key = (((p[0] >> shift) as usize) << (2 * bits)) | (((p[1] >> shift) as usize) << bits) | (p[2] >> shift) as usize;
            let l = prep.lab[i];
            let b = &mut bins[key];
            b[0] += 1.0;
            b[1] += l[0] as f64;
            b[2] += l[1] as f64;
            b[3] += l[2] as f64;
        }
        bins
    };
    let mut bins = build(5);
    if bins.iter().filter(|b| b[0] > 0.0).count() > 12_000 {
        bins = build(4);
    }
    let mut pts = Vec::new();
    let mut wts = Vec::new();
    for b in bins.iter().filter(|b| b[0] > 0.0) {
        pts.push([(b[1] / b[0]) as f32, (b[2] / b[0]) as f32, (b[3] / b[0]) as f32]);
        wts.push(b[0] as f32);
    }
    (pts, wts)
}

// ---------------------------------------------------------------- k-means

/// Lloyd iterations; returns (weighted mean OKLab distance, cluster weights).
fn lloyd(pts: &[Lab], wts: &[f32], centers: &mut [Lab], iters: usize) -> (f32, Vec<f32>) {
    let k = centers.len();
    let mut assign = vec![usize::MAX; pts.len()];
    let total: f64 = wts.iter().map(|&w| w as f64).sum();
    let mut err = 0.0f64;
    let mut sizes = vec![0.0f32; k];
    for it in 0..=iters {
        let mut acc = vec![[0.0f64; 4]; k];
        let mut changed = false;
        err = 0.0;
        for (j, p) in pts.iter().enumerate() {
            let (c, d) = nearest(*p, centers);
            if assign[j] != c {
                assign[j] = c;
                changed = true;
            }
            let w = wts[j] as f64;
            err += w * (d as f64).sqrt();
            let a = &mut acc[c];
            a[0] += w;
            a[1] += w * p[0] as f64;
            a[2] += w * p[1] as f64;
            a[3] += w * p[2] as f64;
        }
        for (c, a) in acc.iter().enumerate() {
            sizes[c] = a[0] as f32;
        }
        if it == iters || (!changed && it > 0) {
            break;
        }
        for (c, a) in acc.iter().enumerate() {
            if a[0] > 0.0 {
                centers[c] = [(a[1] / a[0]) as f32, (a[2] / a[0]) as f32, (a[3] / a[0]) as f32];
            }
        }
    }
    ((err / total.max(1e-9)) as f32, sizes)
}

/// Greedy k-means++ seeding step: sample a few candidates proportional to
/// w*d^2 and keep the one that lowers the potential the most.
fn add_center(pts: &[Lab], wts: &[f32], centers: &mut Vec<Lab>, rng: &mut XorShift) {
    let d2: Vec<f32> = pts.iter().map(|p| nearest(*p, centers).1).collect();
    let pot: Vec<f64> = d2.iter().zip(wts).map(|(&d, &w)| d as f64 * w as f64).collect();
    let total: f64 = pot.iter().sum();
    if total <= 0.0 {
        return;
    }
    let trials = 2 + (centers.len() as f64 + 1.0).ln() as usize;
    let mut best: Option<(usize, f64)> = None;
    for _ in 0..trials {
        let mut r = rng.next_f64() * total;
        let mut cand = pts.len() - 1;
        for (j, &v) in pot.iter().enumerate() {
            if r < v {
                cand = j;
                break;
            }
            r -= v;
        }
        let c = pts[cand];
        let new_pot: f64 = pts.iter().zip(wts).zip(&d2).map(|((p, &w), &d)| w as f64 * d.min(dist2(*p, c)) as f64).sum();
        if best.is_none_or(|(_, bp)| new_pot < bp) {
            best = Some((cand, new_pot));
        }
    }
    if let Some((j, _)) = best {
        centers.push(pts[j]);
    }
}

fn heaviest(pts: &[Lab], wts: &[f32]) -> Lab {
    let mut bi = 0;
    for (i, &w) in wts.iter().enumerate() {
        if w > wts[bi] {
            bi = i;
        }
    }
    pts[bi]
}

fn kmeans_fixed(pts: &[Lab], wts: &[f32], k: usize) -> (Vec<Lab>, Vec<f32>) {
    let mut rng = XorShift(0x9E37_79B9_7F4A_7C15);
    let mut centers = vec![heaviest(pts, wts)];
    let k = k.min(pts.len()).max(1);
    while centers.len() < k {
        let before = centers.len();
        add_center(pts, wts, &mut centers, &mut rng);
        if centers.len() == before {
            break;
        }
    }
    let (_, sizes) = lloyd(pts, wts, &mut centers, 20);
    (centers, sizes)
}

/// Merge clusters closer than `thr` (weighted mean), drop empty ones.
fn merge_close(mut centers: Vec<Lab>, mut sizes: Vec<f32>, thr: f32) -> Vec<Lab> {
    let thr2 = thr * thr;
    loop {
        let mut pair = None;
        let mut best = thr2;
        for i in 0..centers.len() {
            for j in i + 1..centers.len() {
                let d = dist2(centers[i], centers[j]);
                if d < best {
                    best = d;
                    pair = Some((i, j));
                }
            }
        }
        let Some((i, j)) = pair else { break };
        let (wi, wj) = (sizes[i].max(1e-6), sizes[j].max(1e-6));
        let t = wi + wj;
        let cj = centers[j];
        for (ci, cj) in centers[i].iter_mut().zip(cj) {
            *ci = (*ci * wi + cj * wj) / t;
        }
        sizes[i] += sizes[j];
        centers.swap_remove(j);
        sizes.swap_remove(j);
    }
    centers.into_iter().zip(sizes).filter(|(_, s)| *s > 0.0).map(|(c, _)| c).collect()
}

/// Incremental k-means: grow k until the marginal error reduction is small,
/// the new cluster is tiny (<0.3%), or the fit is essentially exact.
fn auto_palette(pts: &[Lab], wts: &[f32]) -> Vec<Lab> {
    if pts.is_empty() {
        return Vec::new();
    }
    let total: f32 = wts.iter().sum();
    let mut rng = XorShift(0x9E37_79B9_7F4A_7C15);
    let mut best = vec![heaviest(pts, wts)];
    let (mut err, mut best_sizes) = lloyd(pts, wts, &mut best, 4);
    while best.len() < 64 && best.len() < pts.len() && err > 0.006 {
        let k = best.len();
        let step = (if k < 16 { 1 } else { 4 }).min(64 - k).min(pts.len() - k);
        let mut c = best.clone();
        for _ in 0..step {
            add_center(pts, wts, &mut c, &mut rng);
        }
        if c.len() == k {
            break;
        }
        let (e, sizes) = lloyd(pts, wts, &mut c, 8);
        let min_frac = sizes.iter().cloned().fold(f32::INFINITY, f32::min) / total.max(1e-9);
        let gain = err - e;
        if k >= 2 && (min_frac < 0.003 || (gain < 0.002 * c.len().saturating_sub(k) as f32 && gain < 0.12 * err)) {
            break;
        }
        best = c;
        best_sizes = sizes;
        err = e;
    }
    if best.len() < 2 && pts.len() >= 2 {
        add_center(pts, wts, &mut best, &mut rng);
        let (_, s) = lloyd(pts, wts, &mut best, 8);
        best_sizes = s;
    }
    merge_close(best, best_sizes, MERGE_AUTO)
}

// ---------------------------------------------------------------- assignment

fn assign(prep: &Prep, centers: &[Lab]) -> Vec<u16> {
    let (w, h) = (prep.w, prep.h);
    let mut labels = vec![TRANSPARENT; w * h];
    // Pass 1: non-blend pixels -> nearest centre (memoised on the previous colour).
    let mut last: Option<(Lab, u16)> = None;
    for (i, lab) in labels.iter_mut().enumerate() {
        if !prep.opaque[i] || prep.blend[i] {
            continue;
        }
        let p = prep.lab[i];
        *lab = match last {
            Some((q, l)) if q == p => l,
            _ => {
                let l = nearest(p, centers).0 as u16;
                last = Some((p, l));
                l
            }
        };
    }
    // Pass 2: blend pixels -> nearest among labels of non-blend neighbours
    // (radius 2), or the global nearest if it is a genuinely close match.
    const CLOSE2: f32 = 0.02 * 0.02;
    let mut out = labels.clone();
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            if !prep.opaque[i] || !prep.blend[i] {
                continue;
            }
            let p = prep.lab[i];
            let (g, gd) = nearest(p, centers);
            let mut cand: [u16; 25] = [0; 25];
            let mut nc = 0;
            for yy in y.saturating_sub(2)..(y + 3).min(h) {
                for xx in x.saturating_sub(2)..(x + 3).min(w) {
                    let l = labels[yy * w + xx];
                    if l != TRANSPARENT && !cand[..nc].contains(&l) {
                        cand[nc] = l;
                        nc += 1;
                    }
                }
            }
            out[i] = if nc == 0 || gd <= CLOSE2 {
                g as u16
            } else {
                let mut best = (cand[0], f32::INFINITY);
                for &l in &cand[..nc] {
                    let d = dist2(p, centers[l as usize]);
                    if d < best.1 {
                        best = (l, d);
                    }
                }
                best.0
            };
        }
    }
    out
}

/// Replace isolated opaque pixels (no 8-neighbour shares their label) by the
/// dominant neighbour label when it holds at least 4 of the 8 neighbours.
fn majority_filter(labels: &mut [u16], w: usize, h: usize) {
    let src = labels.to_vec();
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let me = src[i];
            if me == TRANSPARENT {
                continue;
            }
            let mut vals: [(u16, u8); 8] = [(0, 0); 8];
            let mut nv = 0;
            let mut same = false;
            for yy in y.saturating_sub(1)..(y + 2).min(h) {
                for xx in x.saturating_sub(1)..(x + 2).min(w) {
                    if yy == y && xx == x {
                        continue;
                    }
                    let l = src[yy * w + xx];
                    if l == me {
                        same = true;
                        break;
                    }
                    if l == TRANSPARENT {
                        continue;
                    }
                    match vals[..nv].iter_mut().find(|v| v.0 == l) {
                        Some(v) => v.1 += 1,
                        None => {
                            vals[nv] = (l, 1);
                            nv += 1;
                        }
                    }
                }
                if same {
                    break;
                }
            }
            if same {
                continue;
            }
            if let Some(&(l, c)) = vals[..nv].iter().max_by_key(|v| v.1) {
                if c >= 4 {
                    labels[i] = l;
                }
            }
        }
    }
}

/// Drop unused labels, sort palette by frequency, use mean sRGB of non-blend members.
fn compact(img: &RgbaImage, prep: &Prep, centers: &[Lab], mut labels: Vec<u16>) -> Quantized {
    let k = centers.len();
    let mut count = vec![0usize; k];
    let mut sum = vec![[0u64; 4]; k];
    for (i, &l) in labels.iter().enumerate() {
        if l == TRANSPARENT {
            continue;
        }
        let l = l as usize;
        count[l] += 1;
        if !prep.blend[i] {
            let p = img.as_raw();
            let s = &mut sum[l];
            s[0] += p[i * 4] as u64;
            s[1] += p[i * 4 + 1] as u64;
            s[2] += p[i * 4 + 2] as u64;
            s[3] += 1;
        }
    }
    let mut order: Vec<usize> = (0..k).filter(|&c| count[c] > 0).collect();
    order.sort_by(|&a, &b| count[b].cmp(&count[a]).then(a.cmp(&b)));
    let mut remap = vec![TRANSPARENT; k];
    let mut palette = Vec::with_capacity(order.len());
    for (new, &old) in order.iter().enumerate() {
        remap[old] = new as u16;
        let s = sum[old];
        palette.push(match s[3] {
            0 => oklab_to_rgb(centers[old]),
            n => [((s[0] + n / 2) / n) as u8, ((s[1] + n / 2) / n) as u8, ((s[2] + n / 2) / n) as u8],
        });
    }
    for l in labels.iter_mut() {
        if *l != TRANSPARENT {
            *l = remap[*l as usize];
        }
    }
    Quantized { width: img.width(), height: img.height(), palette, labels }
}

fn quantize_forced(img: &RgbaImage, pal: &[[u8; 3]]) -> Quantized {
    let centers: Vec<Lab> = pal.iter().map(|&c| rgb_to_oklab(c)).collect();
    let mut last: Option<([u8; 3], u16)> = None;
    let labels = img
        .pixels()
        .map(|p| {
            if p[3] < 128 {
                return TRANSPARENT;
            }
            let rgb = [p[0], p[1], p[2]];
            match last {
                Some((c, l)) if c == rgb => l,
                _ => {
                    let l = nearest(rgb_to_oklab(rgb), &centers).0 as u16;
                    last = Some((rgb, l));
                    l
                }
            }
        })
        .collect();
    Quantized { width: img.width(), height: img.height(), palette: pal.to_vec(), labels }
}
