import { formatNumber, paintCommands } from './pdf.js';
import type { SvgOptions, TraceResult } from './types.js';

export function toEps(result: TraceResult, opts: SvgOptions = {}): string {
  const width = formatNumber(Math.ceil(result.width));
  const height = formatNumber(Math.ceil(result.height));
  return `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${width} ${height}\n%%HiResBoundingBox: 0 0 ${formatNumber(result.width)} ${formatNumber(result.height)}\n%%Pages: 1\n%%EndComments\ngsave\n0 ${formatNumber(result.height)} translate\n1 -1 scale\n${paintCommands(result, opts, true)}\ngrestore\nshowpage\n%%EOF\n`;
}
