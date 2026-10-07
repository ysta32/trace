import type { Shape, SvgOptions, TraceResult } from './types.js';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function numberFormatter(precision = 2): (value: number) => string {
  if (!Number.isInteger(precision) || precision < 0 || precision > 15) {
    throw new RangeError('Precision must be an integer between 0 and 15');
  }
  const formatter = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: precision });
  return value => {
    if (!Number.isFinite(value)) throw new RangeError('Coordinates must be finite');
    const rounded = Number(value.toFixed(precision));
    // PDF and PostScript numbers do not support exponent notation.
    return formatter.format(rounded === 0 ? 0 : rounded);
  };
}

export function visibleShapes(result: TraceResult, opts: SvgOptions): Shape[] {
  const hidden = new Set(opts.hidden ?? []);
  return result.shapes.filter(shape => !hidden.has(shape.id)).map(shape => ({
    ...shape, fill: opts.overrides?.[shape.id] ?? shape.fill,
  }));
}

export function solidColor(result: TraceResult, fill: string): string {
  const reference = /^url\(#(.+)\)$/.exec(fill);
  if (!reference) return fill;
  const gradient = result.gradients.find(item => item.id === reference[1]);
  if (!gradient || gradient.stops.length === 0) throw new Error(`Missing gradient stops: ${reference[1]}`);
  return gradient.stops[Math.floor(gradient.stops.length / 2)].color;
}

export function rgb(color: string): [number, number, number] {
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(color);
  if (short) color = `#${short[1].repeat(2)}${short[2].repeat(2)}${short[3].repeat(2)}`;
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error(`Unsupported fill color: ${color}`);
  return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255) as [number, number, number];
}

export function toSvg(result: TraceResult, opts: SvgOptions = {}): string {
  const n = numberFormatter(opts.precision);
  const gradients = result.gradients.map(gradient =>
    `<linearGradient id="${escapeAttribute(gradient.id)}" gradientUnits="userSpaceOnUse" x1="${n(gradient.x1)}" y1="${n(gradient.y1)}" x2="${n(gradient.x2)}" y2="${n(gradient.y2)}">` +
    gradient.stops.map(stop => `<stop offset="${n(stop.offset)}" stop-color="${escapeAttribute(stop.color)}"/>`).join('') +
    '</linearGradient>',
  ).join('');
  const paths = visibleShapes(result, opts).map(shape => {
    const d = shape.d
      .replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, value => `${n(Number(value))} `)
      .replace(/[\s,]+/g, ' ')
      .replace(/\s*([a-zA-Z])\s*/g, '$1')
      .trim();
    return `<path fill="${escapeAttribute(shape.fill)}" d="${escapeAttribute(d)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(result.width)} ${n(result.height)}">${gradients ? `<defs>${gradients}</defs>` : ''}${paths}</svg>`;
}
