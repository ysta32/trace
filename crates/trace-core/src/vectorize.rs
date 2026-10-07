//! T01/T12. Label map -> shapes (connected components + contour fitting).
//!
//! Connected components are labelled here (u32 ids) rather than with
//! `BinaryImage::to_clusters`, whose u16 cluster ids panic past 65535 clusters,
//! and contours are followed directly on the label map (visioncortex's
//! image-based walkers rescan each component's whole bounding box). The
//! contours then go through visioncortex simplification (Polygon mode) or the
//! corner-aware cubic fitter in `fit` (Spline mode).
use crate::fit::{fit_contour, FitParams};
use crate::quantize::{Quantized, TRANSPARENT};
use crate::svgpath::{format_path_step, Subpath};
use crate::types::{CurveMode, Mode};
use visioncortex::{PathI32, PointI32};

#[derive(Debug, Clone)]
pub struct VecParams {
    pub mode: Mode,
    pub curve_mode: CurveMode,
    pub corner_threshold_deg: f32,
    /// Segment length for spline smoothing, in working pixels.
    pub length_threshold: f32,
    /// Legacy visioncortex spline parameters (unused by the cubic fitter).
    pub splice_threshold_deg: f32,
    pub max_iterations: u32,
    /// Clusters (and holes) with fewer working pixels than this are dropped.
    pub filter_speckle: u32,
    /// Output coordinates = working coordinates / scale (e.g. upscale factor).
    pub scale: f32,
    /// Spline mode: maximum curve fitting error, in working pixels.
    pub fit_tolerance: f32,
    /// Output coordinate rounding step in hundredths (1 = 2 decimals, 10 = 1 decimal).
    pub coord_step: u32,
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
            fit_tolerance: 0.8,
            coord_step: 1,
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
    /// This component's pixels are `order[start..start + area]`; the first is
    /// its topmost-leftmost pixel.
    start: usize,
}

/// 4-connected component labelling. Returns (labels, comps, order): labels are
/// 1-based component ids (0 = unset), comps[id - 1] describes component id and
/// `order` lists pixel indices grouped by component.
fn label_components(w: usize, h: usize, is_set: impl Fn(usize) -> bool) -> (Vec<u32>, Vec<Comp>, Vec<u32>) {
    let mut labels = vec![0u32; w * h];
    let mut comps = Vec::new();
    let mut order: Vec<u32> = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for start in 0..w * h {
        if labels[start] != 0 || !is_set(start) {
            continue;
        }
        let id = comps.len() as u32 + 1;
        let mut c = Comp {
            x0: usize::MAX,
            y0: usize::MAX,
            x1: 0,
            y1: 0,
            area: 0,
            start: order.len(),
        };
        labels[start] = id;
        stack.push(start);
        while let Some(i) = stack.pop() {
            order.push(i as u32);
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
    (labels, comps, order)
}

/// Edge directions indexed by pixel side: 0 top (east), 1 right (south),
/// 2 bottom (west), 3 left (north), in y-down coordinates. The component's
/// interior is always on the right of travel.
const DIRS: [(i32, i32); 4] = [(1, 0), (0, 1), (-1, 0), (0, -1)];

fn edge_start(x: i32, y: i32, side: usize) -> (i32, i32) {
    match side {
        0 => (x, y),
        1 => (x + 1, y),
        2 => (x + 1, y + 1),
        _ => (x, y + 1),
    }
}

/// Follows the closed contour of component `id` through boundary edge
/// (`px`,`py`,`side`), marking visited edges. Pixels are 4-connected (contours
/// turn right at diagonal pinches). Returns corner vertices rotated to start at
/// the min (y, x) vertex, closed (last == first). Outer contours run clockwise
/// on screen, holes counter-clockwise, matching visioncortex's PathWalker.
#[allow(clippy::too_many_arguments)]
fn trace_contour(
    labels: &[u32],
    w: usize,
    h: usize,
    id: u32,
    visited: &mut [u8],
    px: i32,
    py: i32,
    side: usize,
) -> Vec<(i32, i32)> {
    let fg = |x: i32, y: i32| {
        x >= 0 && y >= 0 && (x as usize) < w && (y as usize) < h && labels[y as usize * w + x as usize] == id
    };
    let (mut x, mut y, mut s) = (px, py, side);
    let mut verts: Vec<(i32, i32)> = Vec::new();
    let mut sides: Vec<u8> = Vec::new();
    loop {
        visited[y as usize * w + x as usize] |= 1 << s;
        verts.push(edge_start(x, y, s));
        sides.push(s as u8);
        let d = DIRS[s];
        let n = DIRS[(s + 1) % 4];
        let (ax, ay) = (x + d.0, y + d.1);
        if !fg(ax, ay) {
            s = (s + 1) % 4;
        } else if fg(ax - n.0, ay - n.1) {
            x = ax - n.0;
            y = ay - n.1;
            s = (s + 3) % 4;
        } else {
            x = ax;
            y = ay;
        }
        if x == px && y == py && s == side {
            break;
        }
    }
    let m = verts.len();
    let mut corners: Vec<(i32, i32)> = (0..m)
        .filter(|&i| sides[i] != sides[(i + m - 1) % m])
        .map(|i| verts[i])
        .collect();
    if let Some(k) = (0..corners.len()).min_by_key(|&i| (corners[i].1, corners[i].0)) {
        corners.rotate_left(k);
    }
    if let Some(&f) = corners.first() {
        corners.push(f);
    }
    corners
}

/// Absolute shoelace area of a closed vertex list.
fn polygon_area(pts: &[(i32, i32)]) -> u64 {
    let s: i64 = pts
        .windows(2)
        .map(|p| p[0].0 as i64 * p[1].1 as i64 - p[1].0 as i64 * p[0].1 as i64)
        .sum();
    s.unsigned_abs() / 2
}

fn contour_to_subpath(pts: Vec<(i32, i32)>, outer: bool, off: (i32, i32), p: &VecParams) -> Option<Subpath> {
    let path = PathI32 {
        path: pts
            .into_iter()
            .map(|(x, y)| PointI32 {
                x: x + off.0,
                y: y + off.1,
            })
            .collect(),
    };
    if path.path.len() < 4 {
        return None;
    }
    match p.curve_mode {
        CurveMode::Pixel => Some(Subpath::Polygon(
            path.path.iter().map(|q| (q.x as f64, q.y as f64)).collect(),
        )),
        CurveMode::Polygon => {
            let simp = path.simplify(outer);
            (simp.path.len() >= 3)
                .then(|| Subpath::Polygon(simp.path.iter().map(|q| (q.x as f64, q.y as f64)).collect()))
        }
        CurveMode::Spline => {
            let wk = if p.scale.is_finite() && p.scale > 0.0 {
                p.scale as f64
            } else {
                1.0
            };
            let fp = FitParams {
                corner_deg: p.corner_threshold_deg as f64,
                tol: (p.fit_tolerance as f64).max(0.05),
                smooth_iters: (3.0 * wk).round().clamp(1.0, 12.0) as usize,
                window: (2.0 * wk).round().clamp(3.0, 8.0) as usize,
            };
            let pts: Vec<(i32, i32)> = path.path.iter().map(|q| (q.x, q.y)).collect();
            let (start, segs) = fit_contour(&pts, &fp)?;
            if segs.iter().any(|s| match *s {
                crate::svgpath::Seg::Line(a) => !(a.0.is_finite() && a.1.is_finite()),
                crate::svgpath::Seg::Cubic(a, b, c) => ![a.0, a.1, b.0, b.1, c.0, c.1].iter().all(|v| v.is_finite()),
            }) {
                return None;
            }
            Some(Subpath::Mixed { start, segs })
        }
    }
}

/// Traces one component (outer contour + holes >= filter_speckle) into
/// subpaths in working coordinates. Work is proportional to component area.
#[allow(clippy::too_many_arguments)]
fn trace_component(
    labels: &[u32],
    order: &[u32],
    lw: usize,
    lh: usize,
    id: u32,
    c: &Comp,
    origin: (usize, usize),
    visited: &mut [u8],
    p: &VecParams,
) -> Vec<Subpath> {
    let pixels = &order[c.start..c.start + c.area as usize];
    let off = (origin.0 as i32, origin.1 as i32);
    let first = pixels[0] as usize;
    let outer = trace_contour(labels, lw, lh, id, visited, (first % lw) as i32, (first / lw) as i32, 0);
    let mut out = Vec::new();
    match contour_to_subpath(outer, true, off, p) {
        Some(sp) => out.push(sp),
        None => return out,
    }
    // Stacked: a hole only reveals the (correct) lower layers, so smaller holes
    // are kept; cutout holes must match the speckle filter to avoid gaps.
    let min_hole = if p.mode == Mode::Stacked {
        (p.filter_speckle / 16).max(1) as u64
    } else {
        p.filter_speckle.max(1) as u64
    };
    for &i in pixels {
        let i = i as usize;
        let (x, y) = ((i % lw) as i32, (i / lw) as i32);
        for side in 0..4 {
            if visited[i] & (1 << side) != 0 {
                continue;
            }
            let o = DIRS[(side + 1) % 4];
            let (nx, ny) = (x - o.0, y - o.1);
            let neighbour_in = nx >= 0
                && ny >= 0
                && (nx as usize) < lw
                && (ny as usize) < lh
                && labels[ny as usize * lw + nx as usize] == id;
            if neighbour_in {
                continue;
            }
            // Every contour other than the outer one bounds a hole.
            let hole = trace_contour(labels, lw, lh, id, visited, x, y, side);
            if polygon_area(&hole) >= min_hole {
                if let Some(sp) = contour_to_subpath(hole, false, off, p) {
                    out.push(sp);
                }
            }
        }
    }
    out
}

fn p_step(p: &VecParams) -> i64 {
    p.coord_step.clamp(1, 100) as i64
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
    let mul = if params.scale.is_finite() && params.scale > 0.0 {
        1.0 / params.scale as f64
    } else {
        1.0
    };
    let mut shapes = Vec::new();
    for (r, &color) in order.iter().enumerate() {
        let [bx0, by0, bx1, by1] = layer_bb[r];
        let (bw, bh) = (bx1 - bx0, by1 - by0);
        let stacked = params.mode == Mode::Stacked;
        let in_layer = |i: usize| {
            let l = q.labels[(by0 + i / bw) * w + bx0 + i % bw];
            if stacked {
                valid(l) && rank[l as usize] >= r
            } else {
                l as usize == color && valid(l)
            }
        };
        let (labels, comps, order_px) = label_components(bw, bh, in_layer);
        let mut visited = vec![0u8; bw * bh];
        for (ci, c) in comps.iter().enumerate() {
            if c.area < params.filter_speckle {
                continue;
            }
            let subs = trace_component(
                &labels,
                &order_px,
                bw,
                bh,
                ci as u32 + 1,
                c,
                (bx0, by0),
                &mut visited,
                params,
            );
            if subs.is_empty() {
                continue;
            }
            let (d, nodes) = format_path_step(&subs, mul, p_step(params));
            if d.is_empty() {
                continue;
            }
            shapes.push(RawShape {
                color_index: color as u16,
                d,
                nodes,
                mask_area: c.area,
                bbox: [
                    (bx0 + c.x0) as u32,
                    (by0 + c.y0) as u32,
                    (bx0 + c.x1) as u32,
                    (by0 + c.y1) as u32,
                ],
            });
        }
    }
    shapes
}

#[cfg(test)]
mod tests {
    use super::*;
    use visioncortex::{BinaryImage, PathSimplifyMode};

    fn has_pinch(img: &BinaryImage) -> bool {
        let g = |x: i32, y: i32| img.get_pixel_safe(x, y);
        (-1..img.height as i32).any(|y| {
            (-1..img.width as i32).any(|x| {
                let (a, b, c, d) = (g(x, y), g(x + 1, y), g(x, y + 1), g(x + 1, y + 1));
                (a && d && !b && !c) || (b && c && !a && !d)
            })
        })
    }

    /// Our contour follower must reproduce visioncortex's PathWalker output on
    /// pinch-free shapes, so Polygon/Spline simplification sees identical input.
    #[test]
    fn outer_contour_matches_visioncortex_walker() {
        let mut seed = 0x2545_f491_u32;
        let mut rnd = || {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            seed
        };
        let mut checked = 0;
        for _ in 0..400 {
            let (w, h) = (3 + (rnd() % 10) as usize, 3 + (rnd() % 10) as usize);
            let bits: Vec<bool> = (0..w * h).map(|_| rnd() % 3 != 0).collect();
            let (labels, comps, order) = label_components(w, h, |i| bits[i]);
            for (ci, c) in comps.iter().enumerate() {
                let id = ci as u32 + 1;
                let mut img = BinaryImage::new_w_h(w, h);
                for (i, &l) in labels.iter().enumerate() {
                    img.set_pixel(i % w, i / w, l == id);
                }
                if has_pinch(&img) {
                    continue;
                }
                let first = order[c.start] as usize;
                let mut visited = vec![0u8; w * h];
                let ours = trace_contour(
                    &labels,
                    w,
                    h,
                    id,
                    &mut visited,
                    (first % w) as i32,
                    (first / w) as i32,
                    0,
                );
                let theirs: Vec<(i32, i32)> = PathI32::image_to_path(&img, true, PathSimplifyMode::None)
                    .path
                    .iter()
                    .map(|p| (p.x, p.y))
                    .collect();
                assert_eq!(ours, theirs, "{w}x{h} comp {id}");
                checked += 1;
            }
        }
        assert!(checked > 100, "only {checked} shapes checked");
    }

    #[test]
    fn hole_contours_wind_opposite_and_cover_every_edge() {
        // 7x7 square with a 3x3 hole and a 1px island inside the hole.
        let (w, h) = (9, 9);
        let bits: Vec<bool> = (0..w * h)
            .map(|i| {
                let (x, y) = (i % w, i / w);
                let ring = (1..8).contains(&x) && (1..8).contains(&y) && !((3..6).contains(&x) && (3..6).contains(&y));
                ring || (x == 4 && y == 4)
            })
            .collect();
        let (labels, comps, order) = label_components(w, h, |i| bits[i]);
        assert_eq!(comps.len(), 2);
        let mut visited = vec![0u8; w * h];
        let p = VecParams {
            curve_mode: CurveMode::Pixel,
            filter_speckle: 0,
            ..VecParams::default()
        };
        let subs = trace_component(&labels, &order, w, h, 1, &comps[0], (0, 0), &mut visited, &p);
        assert_eq!(
            subs,
            vec![
                Subpath::Polygon(vec![(1.0, 1.0), (8.0, 1.0), (8.0, 8.0), (1.0, 8.0), (1.0, 1.0)]),
                Subpath::Polygon(vec![(3.0, 3.0), (3.0, 6.0), (6.0, 6.0), (6.0, 3.0), (3.0, 3.0)]),
            ]
        );
        // Every boundary edge of the ring was consumed by exactly those two contours.
        let edges: u32 = visited.iter().map(|v| v.count_ones()).sum();
        assert_eq!(edges, 7 * 4 + 3 * 4);
    }
}
