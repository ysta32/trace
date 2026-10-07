//! T02. Edge-preserving denoise and upscaling.
use image::RgbaImage;
/// strength 0..1; 0 returns a clone.
pub fn denoise(img: &RgbaImage, strength: f32) -> RgbaImage { let _ = (img, strength); unimplemented!("T02") }
/// factor in {1,2,4}; `nearest` for pixel art, smooth edge-aware otherwise.
pub fn upscale(img: &RgbaImage, factor: u32, nearest: bool) -> RgbaImage { let _ = (img, factor, nearest); unimplemented!("T02") }
/// Downscale so max(w,h) <= max_dim (no-op if already smaller).
pub fn limit_size(img: &RgbaImage, max_dim: u32) -> RgbaImage { let _ = (img, max_dim); unimplemented!("T02") }
