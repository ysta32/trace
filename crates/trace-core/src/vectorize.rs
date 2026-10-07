//! T01. Label map -> shapes (connected components + visioncortex path fitting).
//!
//! Connected components are labelled here (u32 ids) rather than with
//! `BinaryImage::to_clusters`, whose u16 cluster ids panic past 65535 clusters.
use crate::quantize::{Quantized, TRANSPARENT};
use crate::svgpath::{format_path, Subpath};
use crate::types::{CurveMode, Mode};
use visioncortex::{BinaryImage, PathI32, PathSimplifyMode, Spline};

/// Outset ratio used by visioncortex/vtracer spline smoothing.
const OUTSET_RATIO: f64 = 8.0;

#[derive(Debug, Clone)]
pub struct VecParams {
    pub mode: Mode,
    pub curve_mode: CurveMode,
    pub corner_threshold_deg: f32,
    /// Segment length for spline smoothing, in working pixels.
    pub length_threshold: f32,
    pub splice_threshold_deg: f32,
    pub max_iterations: u32,
    /// Clusters (and holes) with fewer working pixels than this are dropped.
    pub filter_speckle: u32,
    /// Output coordinates = working coordinates / scale (e.g. upscale factor).
    pub scale: f32,
}

impl Default for VecParams {
    fn default() -> Self {
        VecParams {
            mode: Mode::Stacked,
            curve_mode: CurveMode::Spline,
            corner_threshold_deg: 60.0,
            length_threshold: 4.0,
            splice_threshold_deg: 45.0,
            max_iterations: 10,
            filter_speckle: 4,
            scale: 1.0,
        }
    }
}

/// simplify 0..1 -> spline segment length 3.5..10.
pub fn length_threshold_for_simplify(simplify: f32) -> f32 {
    3.5 + 6.5 * simplify.clamp(0.0, 1.0)
}

/// simplify 0..1 -> speckle side multiplier 1..2.
pub fn speckle_factor_for_simplify(simplify: f32) -> f32 {
    1.0 + simplify.clamp(0.0, 1.0)
}

#[derive(Debug, Clone, PartialEq)]
pub struct RawShape {
    pub color_index: u16,
    pub d: String,
    pub nodes: u32,
    /// Pixel count of the traced cluster, in working pixels.
    pub mask_area: u32,
    /// Cluster bounding box in working pixels: [x0, y0, x1, y1) (exclusive end).
    pub bbox: [u32; 4],
}

#[derive(Debug, Clone, Copy)]
struct Comp {
    x0: usize,
    y0: usize,
    x1: usize,
    y1: usize,
    area: u32,
}

/// 4-connected component labelling. Returns (labels, comps) where labels are
/// 1-based component ids (0 = unset) and comps[id - 1] describes component id.
fn label_components(w: usize, h: usize, is_set: impl Fn(usize) -> bool) -> (Vec<u32>, Vec<Comp>) {
    let mut labels = vec![0u32; w * h];
    let mut comps = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for start in 0..w * h {
        if labels[start] != 0 || !is_set(start) {
            continue;
        }
        let id = comps.len() as u32 + 1;
        let mut c = Comp { x0: usize::MAX, y0: usize::MAX, x1: 0, y1: 0, area: 0 };
        labels[start] = id;
        stack.push(start);
        while let Some(i) = stack.pop() {
            let (x, y) = (i % w, i / w);
            c.x0 = c.x0.min(x);
            c.y0 = c.y0.min(y);
            c.x1 = c.x1.max(x + 1);
            c.y1 = c.y1.max(y + 1);
            c.area += 1;
            let visit = |j: usize, labels: &mut [u32], stack: &mut Vec<usize>| {
                if labels[j] == 0 && is_set(j) {
                    labels[j] = id;
                    stack.push(j);
                }
            };
            if x > 0 {
                visit(i - 1, &mut labels, &mut stack);
            }
            if x + 1 < w {
                visit(i + 1, &mut labels, &mut stack);
            }
            if y > 0 {
                visit(i - w, &mut labels, &mut stack);
            }
            if y + 1 < h {
                visit(i + w, &mut labels, &mut stack);
            }
        }
        comps.push(c);
    }
    (labels, comps)
}

fn boundary_to_subpath(img: &BinaryImage, outer: bool, off: (i32, i32), p: &VecParams) -> Option<Subpath> {
    let (ox, oy) = (off.0 as f64, off.1 as f64);
    match p.curve_mode {
        CurveMode::Pixel | CurveMode::Polygon => {
            let mode = if p.curve_mode == CurveMode::Pixel { PathSimplifyMode::None } else { PathSimplifyMode::Polygon };
            let path = PathI32::image_to_path(img, outer, mode);
            let pts: Vec<(f64, f64)> = path.path.iter().map(|q| (q.x as f64 + ox, q.y as f64 + oy)).collect();
            (pts.len() >= 3).then_some(Subpath::Polygon(pts))
        }
        CurveMode::Spline => {
            let spline = Spline::from_image(
                img,
                outer,
                (p.corner_threshold_deg as f64).to_radians(),
                OUTSET_RATIO,
                p.length_threshold.max(0.5) as f64,
                p.max_iterations.max(1) as usize,
                (p.splice_threshold_deg as f64).to_radians(),
            );
            if spline.is_empty() || spline.points.iter().any(|q| !q.x.is_finite() || !q.y.is_finite()) {
                return None;
            }
            let start = (spline.points[0].x + ox, spline.points[0].y + oy);
            let segs = spline.points[1..]
                .as_chunks::<3>()
                .0
                .iter()
                .map(|c| [(c[0].x + ox, c[0].y + oy), (c[1].x + ox, c[1].y + oy), (c[2].x + ox, c[2].y + oy)])
                .collect();
            Some(Subpath::Cubic { start, segs })
        }
    }
}

/// Traces one component (outer boundary + holes) into subpaths in working coordinates.
fn trace_component(labels: &[u32], lw: usize, id: u32, c: &Comp, origin: (usize, usize), p: &VecParams) -> Vec<Subpath> {
    let (cw, ch) = (c.x1 - c.x0, c.y1 - c.y0);
    let mut outer = BinaryImage::new_w_h(cw, ch);
    for y in 0..ch {
        let row = (c.y0 + y) * lw + c.x0;
        for x in 0..cw {
            if labels[row + x] == id {
                outer.set_pixel(x, y, true);
            }
        }
    }
    let (hl, holes) = label_components(cw, ch, |i| !outer.get_pixel(i % cw, i / cw));
    let mut hole_imgs = Vec::new();
    for (hi, h) in holes.iter().enumerate() {
        if h.x0 == 0 || h.y0 == 0 || h.x1 == cw || h.y1 == ch {
            continue; // touches the bbox border: outside, not a hole
        }
        let hid = hi as u32 + 1;
        let keep = h.area >= p.filter_speckle.max(1);
        let mut himg = keep.then(|| BinaryImage::new_w_h(h.x1 - h.x0, h.y1 - h.y0));
        for y in h.y0..h.y1 {
            for x in h.x0..h.x1 {
                if hl[y * cw + x] == hid {
                    outer.set_pixel(x, y, true);
                    if let Some(img) = himg.as_mut() {
                        img.set_pixel(x - h.x0, y - h.y0, true);
                    }
                }
            }
        }
        if let Some(img) = himg {
            hole_imgs.push((img, (h.x0, h.y0)));
        }
    }
    let base = ((origin.0 + c.x0) as i32, (origin.1 + c.y0) as i32);
    let mut out = Vec::with_capacity(1 + hole_imgs.len());
    match boundary_to_subpath(&outer, true, base, p) {
        Some(sp) => out.push(sp),
        None => return out,
    }
    for (himg, (hx, hy)) in &hole_imgs {
        if let Some(sp) = boundary_to_subpath(himg, false, (base.0 + *hx as i32, base.1 + *hy as i32), p) {
            out.push(sp);
        }
    }
    out
}

/// Traces each colour layer. Stacked: layers ordered by descending colour area,
/// each layer covering its own colour plus all later (smaller) colours, so
/// painting in order leaves no gaps. Cutout: each colour region on its own.
pub fn vectorize(q: &Quantized, params: &VecParams) -> Vec<RawShape> {
    let (w, h) = (q.width as usize, q.height as usize);
    let ncol = q.palette.len();
    if w == 0 || h == 0 || ncol == 0 || q.labels.len() < w * h {
        return Vec::new();
    }
    let valid = |l: u16| l != TRANSPARENT && (l as usize) < ncol;
    let mut area = vec![0u64; ncol];
    let mut bb = vec![[usize::MAX, usize::MAX, 0usize, 0usize]; ncol];
    for (i, &l) in q.labels[..w * h].iter().enumerate() {
        if valid(l) {
            let c = l as usize;
            let (x, y) = (i % w, i / w);
            area[c] += 1;
            let b = &mut bb[c];
            b[0] = b[0].min(x);
            b[1] = b[1].min(y);
            b[2] = b[2].max(x + 1);
            b[3] = b[3].max(y + 1);
        }
    }
    let mut order: Vec<usize> = (0..ncol).filter(|&c| area[c] > 0).collect();
    order.sort_by(|&a, &b| area[b].cmp(&area[a]).then(a.cmp(&b)));
    let mut rank = vec![usize::MAX; ncol];
    for (r, &c) in order.iter().enumerate() {
        rank[c] = r;
    }
    // Layer bboxes: stacked layers cover the union of their own and later colours.
    let mut layer_bb: Vec<[usize; 4]> = order.iter().map(|&c| bb[c]).collect();
    if params.mode == Mode::Stacked {
        for r in (0..layer_bb.len().saturating_sub(1)).rev() {
            let n = layer_bb[r + 1];
            let b = &mut layer_bb[r];
            *b = [b[0].min(n[0]), b[1].min(n[1]), b[2].max(n[2]), b[3].max(n[3])];
        }
    }
    let mul = if params.scale.is_finite() && params.scale > 0.0 { 1.0 / params.scale as f64 } else { 1.0 };
    let mut shapes = Vec::new();
    for (r, &color) in order.iter().enumerate() {
        let [bx0, by0, bx1, by1] = layer_bb[r];
        let (bw, bh) = (bx1 - bx0, by1 - by0);
        let stacked = params.mode == Mode::Stacked;
        let in_layer = |i: usize| {
            let l = q.labels[(by0 + i / bw) * w + bx0 + i % bw];
            if stacked { valid(l) && rank[l as usize] >= r } else { l as usize == color && valid(l) }
        };
        let (labels, comps) = label_components(bw, bh, in_layer);
        for (ci, c) in comps.iter().enumerate() {
            if c.area < params.filter_speckle {
                continue;
            }
            let subs = trace_component(&labels, bw, ci as u32 + 1, c, (bx0, by0), params);
            if subs.is_empty() {
                continue;
            }
            let (d, nodes) = format_path(&subs, mul);
            if d.is_empty() {
                continue;
            }
            shapes.push(RawShape {
                color_index: color as u16,
                d,
                nodes,
                mask_area: c.area,
                bbox: [(bx0 + c.x0) as u32, (by0 + c.y0) as u32, (bx0 + c.x1) as u32, (by0 + c.y1) as u32],
            });
        }
    }
    shapes
}
