import { flattenPath } from './pathdata.js';
import { fillColor, formatNumber } from './pdf.js';
import type { SvgOptions, TraceResult } from './types.js';

export interface DxfOptions extends SvgOptions { tolerance?: number }

function colorIndex(color: string): number {
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  const colors = [[255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [255, 255, 255], [128, 128, 128], [192, 192, 192]] as const;
  let best = 7, distance = Infinity;
  colors.forEach((candidate, index) => {
    const delta = (candidate[0] - red) ** 2 + (candidate[1] - green) ** 2 + (candidate[2] - blue) ** 2;
    if (delta < distance) { best = index + 1; distance = delta; }
  });
  return best;
}

export function toDxf(result: TraceResult, opts: DxfOptions = {}): string {
  const hidden = new Set(opts.hidden);
  const shapes = result.shapes.filter(shape => !hidden.has(shape.id)).map(shape => ({ shape, color: fillColor(result, shape, opts) }));
  const colors = [...new Set(shapes.map(({ color }) => color))];
  const records: (string | number)[] = [];
  const pair = (code: number, value: string | number): void => { records.push(code, value); };
  const layer = (color: string): string => `COLOR_${color.slice(1).toUpperCase()}`;
  pair(0, 'SECTION'); pair(2, 'HEADER'); pair(9, '$ACADVER'); pair(1, 'AC1009'); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES'); pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, 1);
  pair(0, 'LTYPE'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, 0); pair(0, 'ENDTAB');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, colors.length + 1);
  for (const color of [null, ...colors]) {
    pair(0, 'LAYER'); pair(2, color ? layer(color) : '0'); pair(70, 0); pair(62, color ? colorIndex(color) : 7); pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const { shape, color } of shapes) {
    for (const path of flattenPath(shape.d, opts.tolerance ?? 0.25)) {
      if (path.points.length < 2) continue;
      const points = [...path.points];
      const first = points[0], last = points[points.length - 1];
      if (points.length > 2 && first && last && first.x === last.x && first.y === last.y) points.pop();
      pair(0, 'POLYLINE'); pair(8, layer(color)); pair(66, 1); pair(10, 0); pair(20, 0); pair(30, 0); pair(70, 1);
      for (const point of points) {
        pair(0, 'VERTEX'); pair(8, layer(color)); pair(10, formatNumber(point.x, opts.precision ?? 6)); pair(20, formatNumber(result.height - point.y, opts.precision ?? 6)); pair(30, 0);
      }
      pair(0, 'SEQEND'); pair(8, layer(color));
    }
  }
  pair(0, 'ENDSEC'); pair(0, 'EOF');
  return records.join('\n') + '\n';
}
