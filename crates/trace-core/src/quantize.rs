//! T02. Palette quantization in perceptual (Lab/OKLab) space.
use image::RgbaImage;
pub const TRANSPARENT: u16 = u16::MAX;
#[derive(Debug, Clone)]
pub struct Quantized { pub width: u32, pub height: u32, pub palette: Vec<[u8; 3]>, pub labels: Vec<u16> }
/// k=None => auto color count. `forced` overrides palette (labels = nearest). Pixels with alpha<128 => TRANSPARENT.
pub fn quantize(img: &RgbaImage, k: Option<u32>, forced: Option<&[[u8; 3]]>) -> Quantized { let _ = (img, k, forced); unimplemented!("T02") }
/// Suggested palette size 2..=64.
pub fn auto_k(img: &RgbaImage) -> u32 { let _ = img; unimplemented!("T02") }
