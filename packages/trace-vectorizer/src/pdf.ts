import { parsePathData } from './pathdata.js';
import type { Shape, SvgOptions, TraceResult } from './types.js';

export function fillColor(result: TraceResult, shape: Shape, opts: SvgOptions): string {
  let fill = opts.overrides?.[shape.id] ?? shape.fill;
  const reference = /^url\(#([^)]*)\)$/.exec(fill);
  if (reference) {
    const gradient = result.gradients.find(item => item.id === reference[1]);
    if (!gradient?.stops.length) throw new Error(`Missing gradient stops for ${reference[1]}`);
    fill = gradient.stops[Math.floor(gradient.stops.length / 2)].color;
  }
  if (/^#[\da-f]{3}$/i.test(fill)) fill = '#' + [...fill.slice(1)].map(c => c + c).join('');
  if (!/^#[\da-f]{6}$/i.test(fill)) throw new Error(`Unsupported fill color: ${fill}`);
  return fill.toLowerCase();
}

export function formatNumber(value: number, precision = 6): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) throw new Error('Invalid export coordinate');
  if (!Number.isInteger(precision) || precision < 0 || precision > 100) throw new Error('Precision must be an integer from 0 to 100');
  const fixed = value.toFixed(precision);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return Number(trimmed) === 0 ? '0' : trimmed;
}

export function paintCommands(result: TraceResult, opts: SvgOptions, postscript = false): string {
  const hidden = new Set(opts.hidden);
  const format = (value: number): string => formatNumber(value, opts.precision ?? 6);
  const commands: string[] = [];
  const operators = postscript ? ['moveto', 'lineto', 'curveto', 'closepath', 'fill', 'setrgbcolor'] : ['m', 'l', 'c', 'h', 'f', 'rg'];
  for (const shape of result.shapes) {
    if (hidden.has(shape.id)) continue;
    const color = fillColor(result, shape, opts);
    commands.push([1, 3, 5].map(offset => formatNumber(parseInt(color.slice(offset, offset + 2), 16) / 255)).join(' ') + ' ' + operators[5]);
    if (postscript) commands.push('newpath');
    let x = 0, y = 0, startX = 0, startY = 0;
    for (const segment of parsePathData(shape.d)) {
      if (segment.command === 'Z') {
        commands.push(operators[3]); x = startX; y = startY;
        continue;
      }
      let values: number[];
      let operator: string;
      if (segment.command === 'Q') {
        values = [x + (segment.x1 - x) * 2 / 3, y + (segment.y1 - y) * 2 / 3, segment.x + (segment.x1 - segment.x) * 2 / 3, segment.y + (segment.y1 - segment.y) * 2 / 3, segment.x, segment.y];
        operator = operators[2];
      } else if (segment.command === 'C') {
        values = [segment.x1, segment.y1, segment.x2, segment.y2, segment.x, segment.y];
        operator = operators[2];
      } else {
        values = [segment.x, segment.y];
        operator = operators[segment.command === 'M' ? 0 : 1];
      }
      commands.push(values.map(format).join(' ') + ' ' + operator);
      x = segment.x; y = segment.y;
      if (segment.command === 'M') { startX = x; startY = y; }
    }
    commands.push(operators[4]);
  }
  return commands.join('\n');
}

export function toPdf(result: TraceResult, opts: SvgOptions = {}): Uint8Array {
  const width = formatNumber(result.width), height = formatNumber(result.height);
  const stream = `q\n1 0 0 -1 0 ${height} cm\n${paintCommands(result, opts)}\nQ\n`;
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(encoder.encode(document).length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = encoder.encode(document).length;
  document += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  document += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(document);
}
