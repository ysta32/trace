// FROZEN CONTRACT (v1). Mirrors crates/trace-core/src/types.rs (serde camelCase).
// Changing this file requires an orchestrator DECISION.

export type Preset = 'auto' | 'logo' | 'lineart' | 'pixelart' | 'photo' | 'icon';
export type Mode = 'stacked' | 'cutout';
export type CurveMode = 'spline' | 'polygon' | 'pixel';

export interface TraceOptions {
  preset?: Preset;              // default 'auto' (picked by analyze())
  colors?: number | 'auto';     // palette size 2..64; default 'auto'
  palette?: string[];           // forced palette '#rrggbb'; overrides colors
  denoise?: number;             // 0..1, default from preset
  upscale?: 'auto' | 1 | 2 | 4; // pre-trace upscaling for small inputs
  mode?: Mode;                  // default 'stacked'
  simplify?: number;            // 0..1: 0 = max fidelity, 1 = fewest nodes
  cornerThreshold?: number;     // degrees, default 60
  filterSpeckle?: number;       // min region area in px (post-upscale), default from preset
  curveMode?: CurveMode;        // default from preset ('pixel' for pixelart)
  gradients?: boolean;          // detect linear gradients and emit <linearGradient>
  maxDimension?: number;        // downscale inputs larger than this (default 2048)
}

export interface GradientDef {
  id: string;                   // referenced as fill="url(#id)"
  x1: number; y1: number; x2: number; y2: number; // user-space coords
  stops: { offset: number; color: string }[];
}

export interface Shape {
  id: number;                   // stable index, unique within a result
  fill: string;                 // '#rrggbb' or 'url(#gradId)'
  colorIndex: number;           // index into palette (-1 if gradient-only)
  d: string;                    // SVG path data, absolute coords, in result width/height space
}

export interface TraceStats { paths: number; nodes: number; colors: number; ms: number; preset: Preset; }

export interface TraceResult {
  width: number;                // output viewBox (original image px)
  height: number;
  palette: string[];            // '#rrggbb'
  background?: string;          // detected solid background color, if any
  shapes: Shape[];              // paint order (back to front)
  gradients: GradientDef[];
  stats: TraceStats;
}

export interface Analysis {
  width: number; height: number;
  preset: Preset;               // suggested preset
  colors: number;               // suggested palette size
  isPixelArt: boolean;
  pixelScale: number;           // detected nearest-neighbour block size (1 if none)
  hasGradients: boolean;
  hasAlpha: boolean;
}

export interface SvgOptions { precision?: number; hidden?: number[]; overrides?: Record<number, string>; }
