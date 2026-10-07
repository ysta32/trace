//! T02. Linear gradient fitting for a region.
use image::RgbaImage;
#[derive(Debug, Clone)]
pub struct GradientFit { pub x1: f32, pub y1: f32, pub x2: f32, pub y2: f32, pub stops: Vec<(f32, [u8; 3])>, pub error: f32 }
/// mask.len() == w*h of img. Returns Some only if a linear gradient explains the region clearly better than a flat fill.
pub fn fit_linear_gradient(img: &RgbaImage, mask: &[bool]) -> Option<GradientFit> { let _ = (img, mask); unimplemented!("T02") }
