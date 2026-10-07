# trace-vectorizer

Convert raster images (PNG, JPG, ...) into clean, layered vector graphics: SVG, PDF, EPS and DXF. The tracer is written in Rust and compiled to WebAssembly, so the same engine runs in the browser and in Node.js.

Site and live demo: https://trace-vectorizer.vercel.app

## Privacy

Tracing runs entirely on your machine (in your browser tab or your Node process). The library makes no network requests and does not upload your images.

## Install

```sh
npm install trace-vectorizer
# optional, only needed for PNG output from the CLI:
npm install @resvg/resvg-js
```

Requires Node.js 18 or newer for the CLI and Node usage.

## CLI

```sh
npx tracevec logo.png                       # writes logo.svg next to the input
npx tracevec logo.png -o out/logo.svg
npx tracevec photo.jpg --preset photo --colors 24 -o photo.svg
npx tracevec sprite.png --preset pixelart --format dxf
npx tracevec ./images --out-dir ./vectors   # batch: every image in a directory
npx tracevec "icons/*.png" --out-dir svg    # simple globs (in the last path segment)
cat in.png | npx tracevec - -o - > out.svg  # stdin / stdout
npx tracevec logo.png --json --stats        # TraceResult as JSON on stdout, stats on stderr
```

`trace-vectorizer` is installed as an alias of `tracevec`.

| Flag | Meaning |
| --- | --- |
| `<input...>` | Files, directories (non-recursive), simple globs, or `-` for stdin |
| `-o, --out <file>` | Output file (`-` for stdout). Single input only. The format is inferred from the extension |
| `--batch <dir>` | Trace every image under a directory, recursively (use with `--out-dir`) |
| `--out-dir <dir>` | Output directory for batches (created if missing) |
| `-f, --format` | `svg` (default), `pdf`, `eps`, `dxf`, `png` |
| `--preset` | `auto`, `logo`, `lineart`, `pixelart`, `photo`, `icon` |
| `--colors <N\|auto>` | Palette size, 2..64 |
| `--palette "#000,#fff"` | Force a palette (overrides `--colors`) |
| `--simplify <0..1>` | 0 = max fidelity, 1 = fewest nodes |
| `--denoise <0..1>` | Denoising strength |
| `--mode` | `stacked` or `cutout` |
| `--gradients` | Detect linear gradients |
| `--corner <deg>` | Corner threshold in degrees |
| `--speckle <px>` | Minimum region area in pixels |
| `--precision <N>` | Decimal places in output coordinates (0..15) |
| `--json` | Print the `TraceResult` as JSON to stdout |
| `--stats` | Print path/node/color counts and timing to stderr |
| `-q, --quiet` | Suppress progress and stats |
| `-h`, `-v` | Help, version |

If several inputs would produce the same output file (for example `a.png` and `a.jpg`), the source extension is added to the name (`a-png.svg`, `a-jpg.svg`). If that still collides (same file name in different folders under one `--out-dir`), the CLI exits with an error. An output path equal to an input file is always rejected (exit 2), e.g. `tracevec a.png --format png`.

Batches run up to `min(4, available CPUs)` files at a time and print a progress line per file on stderr. Exit codes: `0` success, `1` at least one file failed (the rest are still processed), `2` usage error.

PNG output rasterizes the SVG with the optional `@resvg/resvg-js` package. If it is not installed, the CLI exits with an error telling you to install it.

## JavaScript API

```ts
import { trace, toSvg, toPdf, toEps, toDxf } from 'trace-vectorizer';

const result = await trace(bytes, { preset: 'logo', colors: 6 }); // bytes: Uint8Array of PNG/JPG
const svg = toSvg(result, { precision: 2 });
```

Node:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { trace, toSvg } from 'trace-vectorizer';

const result = await trace(await readFile('logo.png'));
await writeFile('logo.svg', toSvg(result));
```

Browser: the WebAssembly module is located relative to the package. With a bundler such as Vite, `trace()` works as-is; to control how the `.wasm` file is fetched, call `init()` first with a URL, `Response` or bytes.

```ts
import { init, traceImageData, toSvg } from 'trace-vectorizer';

// serve the .wasm yourself and pass its URL (or a Response / bytes)
await init('/assets/trace_wasm_bg.wasm');
const ctx = canvas.getContext('2d')!;
const result = await traceImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
document.body.innerHTML = toSvg(result);
```

### Exports

- `trace(input, options?)`: input is encoded image bytes (`Uint8Array`), `ImageData`, or `{ data, width, height }` RGBA pixels. Returns a `TraceResult`.
- `traceImageData(input, options?)`: same, for raw pixels.
- `analyze(bytes)`: suggests a preset and palette size (`Analysis`).
- `toSvg`, `toPdf` (returns `Uint8Array`), `toEps`, `toDxf`: serialize a `TraceResult`.
- `init(input?)`: load the WebAssembly module explicitly (idempotent).
- Types: `TraceOptions`, `TraceResult`, `Shape`, `GradientDef`, `TraceStats`, `Analysis`, `SvgOptions`, `Preset`, `Mode`, `CurveMode`.

### Trace options

| Option | Type | Notes |
| --- | --- | --- |
| `preset` | `'auto' \| 'logo' \| 'lineart' \| 'pixelart' \| 'photo' \| 'icon'` | Default `auto` |
| `colors` | `number \| 'auto'` | Palette size 2..64 |
| `palette` | `string[]` | Forced `#rrggbb` palette |
| `denoise` | `number` | 0..1 |
| `upscale` | `'auto' \| 1 \| 2 \| 4` | Pre-trace upscaling for small inputs |
| `mode` | `'stacked' \| 'cutout'` | Layering strategy |
| `simplify` | `number` | 0..1 |
| `cornerThreshold` | `number` | Degrees |
| `filterSpeckle` | `number` | Minimum region area in pixels |
| `curveMode` | `'spline' \| 'polygon' \| 'pixel'` | Default depends on preset |
| `gradients` | `boolean` | Emit `<linearGradient>` where detected |
| `maxDimension` | `number` | Larger inputs are downscaled (default 2048) |

## License

MIT
