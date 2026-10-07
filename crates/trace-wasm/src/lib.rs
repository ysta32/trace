//! wasm-bindgen bindings over trace-core.
use serde::Serialize;
use serde_wasm_bindgen::Serializer;
use trace_core::{RgbaImage, TraceOptions};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsValue> {
    v.serialize(&Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

fn parse_opts(opts: JsValue) -> Result<TraceOptions, JsValue> {
    if opts.is_undefined() || opts.is_null() {
        return Ok(TraceOptions::default());
    }
    serde_wasm_bindgen::from_value(opts).map_err(|e| JsValue::from_str(&format!("invalid options: {e}")))
}

#[wasm_bindgen]
pub fn analyze(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let img = trace_core::decode(bytes).map_err(|e| JsValue::from_str(&e))?;
    to_js(&trace_core::analyze(&img))
}

#[wasm_bindgen]
pub fn trace(bytes: &[u8], opts: JsValue) -> Result<JsValue, JsValue> {
    let opts = parse_opts(opts)?;
    let img = trace_core::decode(bytes).map_err(|e| JsValue::from_str(&e))?;
    to_js(&trace_core::trace(&img, &opts))
}

#[wasm_bindgen]
pub fn trace_rgba(rgba: &[u8], width: u32, height: u32, opts: JsValue) -> Result<JsValue, JsValue> {
    let opts = parse_opts(opts)?;
    let img = RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| JsValue::from_str("rgba length does not match width*height*4"))?;
    to_js(&trace_core::trace(&img, &opts))
}
