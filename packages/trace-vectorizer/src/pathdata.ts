export interface Point { x: number; y: number }
export type PathSegment =
  | { command: 'M' | 'L'; x: number; y: number }
  | { command: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { command: 'Q'; x1: number; y1: number; x: number; y: number }
  | { command: 'Z' };

const numberPattern = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;

/** Parse the supported SVG commands, expanding repetitions and H/V to M/L/C/Q/Z. */
export function parsePathData(d: string): PathSegment[] {
  const tokens: (string | number)[] = [];
  for (let i = 0; i < d.length;) {
    const character = d.charAt(i);
    if (/[\s,]/.test(character)) { i++; continue; }
    if (/[MLCQZHVmlcqzhv]/.test(character)) { tokens.push(character); i++; continue; }
    numberPattern.lastIndex = i;
    const match = numberPattern.exec(d);
    if (!match || !Number.isFinite(Number(match[0]))) {
      throw new Error(`Invalid or unsupported SVG path data at ${i}`);
    }
    tokens.push(Number(match[0]));
    i = numberPattern.lastIndex;
  }
  const segments: PathSegment[] = [];
  let x = 0, y = 0, startX = 0, startY = 0, i = 0, command = '';
  while (i < tokens.length) {
    const token = tokens[i];
    if (typeof token === 'string') { command = token; i++; }
    if (!command || (segments.length === 0 && command.toUpperCase() !== 'M')) {
      throw new Error('SVG path must begin with moveto');
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper === 'Z') {
      segments.push({ command: 'Z' });
      x = startX; y = startY; command = '';
      continue;
    }
    const count = upper === 'C' ? 6 : upper === 'Q' ? 4 : upper === 'H' || upper === 'V' ? 1 : 2;
    const values = tokens.slice(i, i + count);
    if (values.length !== count || values.some(value => typeof value !== 'number')) {
      throw new Error(`Missing coordinates for SVG command ${command}`);
    }
    i += count;
    const coordinate = (index: number): number => {
      const value = values[index];
      if (typeof value !== 'number') throw new Error(`Missing coordinates for SVG command ${command}`);
      return value;
    };
    const px = (index: number): number => coordinate(index) + (relative ? x : 0);
    const py = (index: number): number => coordinate(index) + (relative ? y : 0);
    let segment: Exclude<PathSegment, { command: 'Z' }>;
    if (upper === 'H') segment = { command: 'L', x: px(0), y };
    else if (upper === 'V') segment = { command: 'L', x, y: py(0) };
    else if (upper === 'C') segment = { command: 'C', x1: px(0), y1: py(1), x2: px(2), y2: py(3), x: px(4), y: py(5) };
    else if (upper === 'Q') segment = { command: 'Q', x1: px(0), y1: py(1), x: px(2), y: py(3) };
    else segment = { command: upper as 'M' | 'L', x: px(0), y: py(1) };
    if (Object.values(segment).some(value => typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error('SVG path coordinate overflow');
    }
    segments.push(segment);
    x = segment.x; y = segment.y;
    if (upper === 'M') {
      startX = x; startY = y;
      command = relative ? 'l' : 'L';
    }
  }
  return segments;
}

export interface Polyline { points: Point[]; closed: boolean }

function midpoint(a: Point, b: Point): Point {
  return { x: a.x / 2 + b.x / 2, y: a.y / 2 + b.y / 2 };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function flattenPath(segments: readonly PathSegment[] | string, tolerance = 0.25): Polyline[] {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Tolerance must be positive and finite');
  const paths: Polyline[] = [];
  let path: Polyline | undefined;
  let current: Point = { x: 0, y: 0 };
  const pointAt = (points: Point[], index: number): Point => {
    const point = points[index];
    if (!point) throw new Error('Missing curve point');
    return point;
  };
  const flatten = (points: Point[], output: Point[], depth = 0): void => {
    const start = pointAt(points, 0), end = pointAt(points, points.length - 1);
    if (points.slice(1, -1).every(p => distanceToSegment(p, start, end) <= tolerance)) {
      output.push(end);
      return;
    }
    if (depth >= 24) throw new Error('Curve cannot be flattened at the requested tolerance');
    const left = [start], right = [end];
    let level = points;
    while (level.length > 1) {
      level = level.slice(1).map((p, i) => midpoint(pointAt(level, i), p));
      left.push(pointAt(level, 0)); right.unshift(pointAt(level, level.length - 1));
    }
    flatten(left, output, depth + 1);
    flatten(right, output, depth + 1);
  };
  for (const segment of typeof segments === 'string' ? parsePathData(segments) : segments) {
    if (segment.command === 'M') {
      current = { x: segment.x, y: segment.y };
      path = { points: [current], closed: false };
      paths.push(path);
    } else if (segment.command === 'Z') {
      if (path) { path.closed = true; current = pointAt(path.points, 0); }
    } else {
      if (!path || path.closed) {
        path = { points: [current], closed: false };
        paths.push(path);
      }
      const end = { x: segment.x, y: segment.y };
      if (segment.command === 'C') flatten([current, { x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }, end], path.points);
      else if (segment.command === 'Q') flatten([current, { x: segment.x1, y: segment.y1 }, end], path.points);
      else path.points.push(end);
      current = end;
    }
  }
  return paths;
}
