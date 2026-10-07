//! T02. Linear gradient fitting for a region.
use crate::quantize::{dist2, rgb_to_oklab};
use image::RgbaImage;

#[derive(Debug, Clone)]
pub struct GradientFit { pub x1: f32, pub y1: f32, pub x2: f32, pub y2: f32, pub stops: Vec<(f32, [u8; 3])>, pub error: f32 }

/// Minimum OKLab distance between gradient ends (12 dE*100).
const MIN_RANGE: f32 = 0.12;
/// Fit residual must be below this fraction of the flat-fill residual.
const MAX_REL_ERR: f64 = 0.4;

/// mask.len() == w*h of img. Returns Some only if a linear gradient explains the region clearly better than a flat fill.
///
/// Fits colour = a + b*x + c*y per channel (least squares, sRGB space as used
/// by SVG), takes the principal gradient direction, projects masked pixels on
/// it for the endpoints, then fits 2 or 3 piecewise-linear stops along it.
/// `error` is the RMS residual per channel in 0..255 units.
pub fn fit_linear_gradient(img: &RgbaImage, mask: &[bool]) -> Option<GradientFit> {
    let (w, h) = (img.width() as usize, img.height() as usize);
    if mask.len() != w * h {
        return None;
    }
    let raw = img.as_raw();
    let mut px: Vec<(f64, f64, [f64; 3])> = Vec::new();
    for (i, &m) in mask.iter().enumerate() {
        if m && raw[i * 4 + 3] >= 128 {
            let x = (i % w) as f64 + 0.5;
            let y = (i / w) as f64 + 0.5;
            px.push((x, y, [raw[i * 4] as f64, raw[i * 4 + 1] as f64, raw[i * 4 + 2] as f64]));
        }
    }
    let n = px.len();
    if n < 16 {
        return None;
    }
    let nf = n as f64;
    let (mut mx, mut my, mut mc) = (0.0, 0.0, [0.0f64; 3]);
    for (x, y, c) in &px {
        mx += x;
        my += y;
        for k in 0..3 {
            mc[k] += c[k];
        }
    }
    mx /= nf;
    my /= nf;
    for v in mc.iter_mut() {
        *v /= nf;
    }
    // Centered normal equations for the plane fit.
    let (mut sxx, mut sxy, mut syy) = (0.0, 0.0, 0.0);
    let mut sxc = [0.0f64; 3];
    let mut syc = [0.0f64; 3];
    let mut flat_sse = 0.0;
    for (x, y, c) in &px {
        let (dx, dy) = (x - mx, y - my);
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
        for k in 0..3 {
            let dc = c[k] - mc[k];
            sxc[k] += dx * dc;
            syc[k] += dy * dc;
            flat_sse += dc * dc;
        }
    }
    let flat_rms = (flat_sse / (3.0 * nf)).sqrt();
    if flat_rms < 1.0 {
        return None;
    }
    let det = sxx * syy - sxy * sxy;
    let mut bx = [0.0f64; 3];
    let mut by = [0.0f64; 3];
    if det.abs() > 1e-9 {
        for k in 0..3 {
            bx[k] = (syy * sxc[k] - sxy * syc[k]) / det;
            by[k] = (sxx * syc[k] - sxy * sxc[k]) / det;
        }
    } else if sxx > syy {
        // Degenerate (1-pixel wide) region: only one axis is informative.
        for k in 0..3 {
            bx[k] = sxc[k] / sxx.max(1e-9);
        }
    } else {
        for k in 0..3 {
            by[k] = syc[k] / syy.max(1e-9);
        }
    }
    // Principal direction of the 2x2 structure tensor sum_k (bx,by)(bx,by)^T.
    let (mut a, mut b, mut c) = (0.0, 0.0, 0.0);
    for k in 0..3 {
        a += bx[k] * bx[k];
        b += bx[k] * by[k];
        c += by[k] * by[k];
    }
    if a + c < 1e-12 {
        return None;
    }
    let theta = 0.5 * (2.0 * b).atan2(a - c);
    let (mut ux, mut uy) = (theta.cos(), theta.sin());
    // Orient so that the direction follows increasing lightness (deterministic).
    let lum = |k: [f64; 3]| 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
    let slope_l = lum([bx[0] * ux + by[0] * uy, bx[1] * ux + by[1] * uy, bx[2] * ux + by[2] * uy]);
    if slope_l < 0.0 {
        ux = -ux;
        uy = -uy;
    }
    let ts: Vec<f64> = px.iter().map(|(x, y, _)| (x - mx) * ux + (y - my) * uy).collect();
    let tmin = ts.iter().cloned().fold(f64::INFINITY, f64::min);
    let tmax = ts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let span = tmax - tmin;
    if span < 2.0 {
        return None;
    }
    let us: Vec<f64> = ts.iter().map(|t| (t - tmin) / span).collect();

    let two = fit_stops(&px, &us, &[0.0, 1.0]);
    let three = fit_stops(&px, &us, &[0.0, 0.5, 1.0]);
    let (stops, sse) = match (two, three) {
        (Some(t2), Some(t3)) => {
            let mid_lin: Vec<f64> = (0..3).map(|k| 0.5 * (t3.0[0][k] + t3.0[2][k])).collect();
            let bend = (0..3).map(|k| (t3.0[1][k] - mid_lin[k]).abs()).fold(0.0, f64::max);
            if bend > 4.0 && t3.1 < 0.8 * t2.1 { t3 } else { t2 }
        }
        (Some(t2), None) => t2,
        _ => return None,
    };
    let error = (sse / (3.0 * nf)).sqrt();
    if error >= MAX_REL_ERR * flat_rms {
        return None;
    }
    let to_u8 = |c: [f64; 3]| [c[0].round().clamp(0.0, 255.0) as u8, c[1].round().clamp(0.0, 255.0) as u8, c[2].round().clamp(0.0, 255.0) as u8];
    let cols: Vec<[u8; 3]> = stops.iter().map(|&c| to_u8(c)).collect();
    let labs: Vec<_> = cols.iter().map(|&c| rgb_to_oklab(c)).collect();
    let mut range = 0.0f32;
    for i in 0..labs.len() {
        for j in i + 1..labs.len() {
            range = range.max(dist2(labs[i], labs[j]).sqrt());
        }
    }
    if range < MIN_RANGE {
        return None;
    }
    let offs: Vec<f32> = if cols.len() == 3 { vec![0.0, 0.5, 1.0] } else { vec![0.0, 1.0] };
    Some(GradientFit {
        x1: (mx + tmin * ux) as f32,
        y1: (my + tmin * uy) as f32,
        x2: (mx + tmax * ux) as f32,
        y2: (my + tmax * uy) as f32,
        stops: offs.into_iter().zip(cols).collect(),
        error: error as f32,
    })
}

/// Least-squares piecewise-linear ("hat" basis) fit of colour over u in [0,1]
/// with knots `knots`. Returns (stop colours, SSE over all channels).
fn fit_stops(px: &[(f64, f64, [f64; 3])], us: &[f64], knots: &[f64]) -> Option<(Vec<[f64; 3]>, f64)> {
    let m = knots.len();
    let basis = |u: f64, out: &mut [f64]| {
        for v in out.iter_mut() {
            *v = 0.0;
        }
        for s in 0..m - 1 {
            let (a, b) = (knots[s], knots[s + 1]);
            if u >= a && u <= b {
                let t = (u - a) / (b - a);
                out[s] = 1.0 - t;
                out[s + 1] = t;
                break;
            }
        }
    };
    let mut ata = vec![0.0f64; m * m];
    let mut atb = vec![[0.0f64; 3]; m];
    let mut phi = vec![0.0f64; m];
    for ((_, _, c), &u) in px.iter().zip(us) {
        basis(u, &mut phi);
        for i in 0..m {
            if phi[i] == 0.0 {
                continue;
            }
            for j in 0..m {
                ata[i * m + j] += phi[i] * phi[j];
            }
            for k in 0..3 {
                atb[i][k] += phi[i] * c[k];
            }
        }
    }
    let sol = solve(ata, atb, m)?;
    let mut sse = 0.0;
    for ((_, _, c), &u) in px.iter().zip(us) {
        basis(u, &mut phi);
        for k in 0..3 {
            let pred: f64 = (0..m).map(|i| phi[i] * sol[i][k]).sum();
            let d = c[k] - pred;
            sse += d * d;
        }
    }
    Some((sol, sse))
}

/// Gaussian elimination with partial pivoting for a small SPD system with 3 RHS.
fn solve(mut a: Vec<f64>, mut b: Vec<[f64; 3]>, m: usize) -> Option<Vec<[f64; 3]>> {
    for col in 0..m {
        let piv = (col..m).max_by(|&i, &j| a[i * m + col].abs().total_cmp(&a[j * m + col].abs()))?;
        if a[piv * m + col].abs() < 1e-9 {
            return None;
        }
        if piv != col {
            for j in 0..m {
                a.swap(piv * m + j, col * m + j);
            }
            b.swap(piv, col);
        }
        for r in col + 1..m {
            let f = a[r * m + col] / a[col * m + col];
            for j in col..m {
                a[r * m + j] -= f * a[col * m + j];
            }
            let bc = b[col];
            for (br, bc) in b[r].iter_mut().zip(bc) {
                *br -= f * bc;
            }
        }
    }
    let mut x = vec![[0.0f64; 3]; m];
    for r in (0..m).rev() {
        for k in 0..3 {
            let mut s = b[r][k];
            for j in r + 1..m {
                s -= a[r * m + j] * x[j][k];
            }
            x[r][k] = s / a[r * m + r];
        }
    }
    Some(x)
}
