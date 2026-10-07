# trace-core contract (frozen v1)
- `pub fn analyze(img: &RgbaImage) -> Analysis`
- `pub fn trace(img: &RgbaImage, opts: &TraceOptions) -> TraceResult`
- `pub fn decode(bytes: &[u8]) -> Result<RgbaImage, String>` (png, jpeg, gif, webp, bmp)
- Types in `src/types.rs`, serde `rename_all = "camelCase"`, field-for-field identical to packages/trace-vectorizer/src/types.ts.
- Modules: decode.rs, analyze.rs, preprocess.rs (denoise, upscale), quantize.rs (auto-k palette in Lab), gradient.rs, vectorize.rs (visioncortex clustering + path fitting, stacked/cutout, pixel mode), svgpath.rs (path data formatting).
# trace-wasm contract
- `#[wasm_bindgen] fn analyze(bytes: &[u8]) -> Result<JsValue, JsValue>` -> Analysis
- `#[wasm_bindgen] fn trace(bytes: &[u8], opts: JsValue) -> Result<JsValue, JsValue>` -> TraceResult
- `#[wasm_bindgen] fn trace_rgba(rgba: &[u8], width: u32, height: u32, opts: JsValue) -> Result<JsValue, JsValue>`
- Built with `wasm-pack --target web` into packages/trace-vectorizer/wasm/ (trace_wasm.js, trace_wasm_bg.wasm).
# trace-vectorizer (npm) contract
- `init(wasmInput?)`, `analyze(bytes)`, `trace(bytes|ImageData, opts)`, `toSvg(result, SvgOptions)`, `toPdf(result)`: Uint8Array, `toEps(result)`: string, `toDxf(result)`: string
- Node CLI bin `trace-vectorizer` / `tracevec`: `tracevec in.png [-o out.svg] [--preset logo] [--colors 8] [--format svg|pdf|eps|dxf|png] [--batch dir]`
