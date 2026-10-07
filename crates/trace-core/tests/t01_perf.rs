//! T01 regression: per-component work must scale with component size, not
//! bounding box (concentric 1px rings have nested, image-sized bboxes).
use std::time::{Duration, Instant};
use trace_core::quantize::Quantized;
use trace_core::vectorize::{vectorize, VecParams};
use trace_core::{CurveMode, Mode};

fn rings(n: u32) -> Quantized {
    let c = n as i64 / 2;
    let mut labels = Vec::with_capacity((n * n) as usize);
    for y in 0..n as i64 {
        for x in 0..n as i64 {
            labels.push(((x - c).abs().max((y - c).abs()) % 2) as u16);
        }
    }
    Quantized { width: n, height: n, palette: vec![[0, 0, 0], [255, 255, 255]], labels }
}

#[test]
fn concentric_rings_cutout_is_linear() {
    // Release: 2048^2 (old bbox-rescan cost ~1.4e9 visits). Debug builds use 1024^2.
    let (n, bound) = if cfg!(debug_assertions) { (1024, Duration::from_secs(30)) } else { (2048, Duration::from_secs(5)) };
    let q = rings(n);
    for curve in [CurveMode::Pixel, CurveMode::Polygon] {
        let p = VecParams { mode: Mode::Cutout, curve_mode: curve, filter_speckle: 0, ..VecParams::default() };
        let t = Instant::now();
        let shapes = vectorize(&q, &p);
        let el = t.elapsed();
        // One shape per square ring (n/2 rings + centre pixel region).
        assert!(shapes.len() as u32 >= n / 2, "{curve:?}: {} shapes", shapes.len());
        assert!(el < bound, "{curve:?}: {n}x{n} rings took {el:?} (bound {bound:?})");
    }
}
