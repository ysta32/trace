//! T01. Compact SVG path data formatting.
//!
//! Coordinates are rounded to 2 decimals and handled as integer hundredths so
//! relative commands never accumulate rounding drift. Each command is emitted
//! in whichever of its absolute/relative forms is shorter.

/// One closed subpath in working coordinates.
#[derive(Debug, Clone, PartialEq)]
pub enum Subpath {
    /// Closed polygon; the closing edge back to the first vertex is implicit.
    Polygon(Vec<(f64, f64)>),
    /// Closed cubic spline: start point followed by (c1, c2, end) segments.
    Cubic {
        start: (f64, f64),
        segs: Vec<[(f64, f64); 3]>,
    },
}

/// Formats `v` (in hundredths) as a compact decimal: no trailing zeros, no leading `0.`.
pub fn fmt_num(v: i64) -> String {
    let neg = v < 0;
    let a = v.unsigned_abs();
    let int = a / 100;
    let frac = a % 100;
    let mut s = String::new();
    if neg && a != 0 {
        s.push('-');
    }
    if frac == 0 {
        s.push_str(&int.to_string());
        return s;
    }
    if int != 0 {
        s.push_str(&int.to_string());
    }
    s.push('.');
    if frac.is_multiple_of(10) {
        s.push_str(&(frac / 10).to_string());
    } else {
        s.push_str(&format!("{frac:02}"));
    }
    s
}

struct Writer {
    out: String,
    cur: (i64, i64),
    start: (i64, i64),
    /// Command whose implicit repetition is active (None right after Z / at start).
    last_cmd: Option<char>,
    /// Some(has_dot) if the last emitted token was a number.
    last_num_dot: Option<bool>,
    nodes: u32,
}

impl Writer {
    fn new() -> Self {
        Writer {
            out: String::new(),
            cur: (0, 0),
            start: (0, 0),
            last_cmd: None,
            last_num_dot: None,
            nodes: 0,
        }
    }

    /// Renders a command (letter possibly omitted) without committing it.
    fn render(&self, letter: char, nums: &[i64]) -> (String, Option<bool>) {
        let mut s = String::new();
        let mut prev_dot = self.last_num_dot;
        if self.last_cmd != Some(letter) {
            s.push(letter);
            prev_dot = None;
        }
        for &n in nums {
            let t = fmt_num(n);
            let has_dot = t.contains('.');
            if let Some(pd) = prev_dot {
                let glued = t.starts_with('-') || (t.starts_with('.') && pd);
                if !glued {
                    s.push(' ');
                }
            }
            s.push_str(&t);
            prev_dot = Some(has_dot);
        }
        (s, prev_dot)
    }

    /// Emits the shorter of two candidate commands. Implicit repetition after
    /// M/m continues as L/l.
    fn emit_best(&mut self, a: (char, Vec<i64>), b: (char, Vec<i64>)) {
        let ra = self.render(a.0, &a.1);
        let rb = self.render(b.0, &b.1);
        let (letter, (s, dot)) = if rb.0.len() < ra.0.len() { (b.0, rb) } else { (a.0, ra) };
        self.out.push_str(&s);
        self.last_num_dot = dot;
        self.last_cmd = Some(match letter {
            'M' => 'L',
            'm' => 'l',
            c => c,
        });
    }

    fn move_to(&mut self, p: (i64, i64)) {
        let abs = ('M', vec![p.0, p.1]);
        if self.out.is_empty() {
            let (s, dot) = self.render('M', &abs.1);
            self.out.push_str(&s);
            self.last_num_dot = dot;
            self.last_cmd = Some('L');
        } else {
            let rel = ('m', vec![p.0 - self.cur.0, p.1 - self.cur.1]);
            self.emit_best(abs, rel);
        }
        self.cur = p;
        self.start = p;
        self.nodes += 1;
    }

    fn line_to(&mut self, p: (i64, i64)) {
        let (dx, dy) = (p.0 - self.cur.0, p.1 - self.cur.1);
        if dx == 0 && dy == 0 {
            return;
        }
        if dy == 0 {
            self.emit_best(('H', vec![p.0]), ('h', vec![dx]));
        } else if dx == 0 {
            self.emit_best(('V', vec![p.1]), ('v', vec![dy]));
        } else {
            self.emit_best(('L', vec![p.0, p.1]), ('l', vec![dx, dy]));
        }
        self.cur = p;
        self.nodes += 1;
    }

    fn cubic_to(&mut self, c1: (i64, i64), c2: (i64, i64), p: (i64, i64)) {
        let o = self.cur;
        self.emit_best(
            ('C', vec![c1.0, c1.1, c2.0, c2.1, p.0, p.1]),
            (
                'c',
                vec![c1.0 - o.0, c1.1 - o.1, c2.0 - o.0, c2.1 - o.1, p.0 - o.0, p.1 - o.1],
            ),
        );
        self.cur = p;
        self.nodes += 1;
    }

    fn close(&mut self) {
        self.out.push('Z');
        self.cur = self.start;
        self.last_cmd = None;
        self.last_num_dot = None;
    }
}

fn q(p: (f64, f64), mul: f64) -> (i64, i64) {
    ((p.0 * mul * 100.0).round() as i64, (p.1 * mul * 100.0).round() as i64)
}

/// Formats subpaths (coordinates multiplied by `mul`) as compact path data.
/// Returns (d, node count). Degenerate subpaths (fewer than 3 distinct points
/// after rounding) are skipped.
pub fn format_path(subpaths: &[Subpath], mul: f64) -> (String, u32) {
    let mut w = Writer::new();
    for sp in subpaths {
        match sp {
            Subpath::Polygon(pts) => {
                let mut qs: Vec<(i64, i64)> = Vec::with_capacity(pts.len());
                for &p in pts {
                    let qp = q(p, mul);
                    if qs.last() != Some(&qp) {
                        qs.push(qp);
                    }
                }
                while qs.len() > 1 && qs.first() == qs.last() {
                    qs.pop();
                }
                let qs = merge_collinear(qs);
                if qs.len() < 3 {
                    continue;
                }
                w.move_to(qs[0]);
                for &p in &qs[1..] {
                    w.line_to(p);
                }
                w.close();
            }
            Subpath::Cubic { start, segs } => {
                if segs.is_empty() {
                    continue;
                }
                w.move_to(q(*start, mul));
                for s in segs {
                    w.cubic_to(q(s[0], mul), q(s[1], mul), q(s[2], mul));
                }
                w.close();
            }
        }
    }
    (w.out, w.nodes)
}

/// Removes vertices lying exactly on the straight line between their
/// (cyclic) neighbours, including spikes that double back on themselves.
pub fn merge_collinear(mut pts: Vec<(i64, i64)>) -> Vec<(i64, i64)> {
    loop {
        let n = pts.len();
        if n < 3 {
            return pts;
        }
        let mut keep = Vec::with_capacity(n);
        let mut removed = false;
        for i in 0..n {
            let a = keep.last().copied().unwrap_or(pts[(i + n - 1) % n]);
            let b = pts[i];
            let c = pts[(i + 1) % n];
            let cross = (b.0 - a.0) as i128 * (c.1 - b.1) as i128 - (b.1 - a.1) as i128 * (c.0 - b.0) as i128;
            if cross == 0 || a == b {
                removed = true;
            } else {
                keep.push(b);
            }
        }
        if !removed {
            return keep;
        }
        pts = keep;
    }
}
