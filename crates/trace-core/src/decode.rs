//! T01. Bytes (png, jpeg, gif, webp, bmp) -> RGBA8.
use image::RgbaImage;

pub fn decode(bytes: &[u8]) -> Result<RgbaImage, String> {
    if bytes.is_empty() {
        return Err("empty input".to_string());
    }
    image::load_from_memory(bytes)
        .map(|img| img.to_rgba8())
        .map_err(|e| format!("decode failed: {e}"))
}
