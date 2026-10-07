//! Trace core: raster -> vector. See CONTRACT.md.
pub mod analyze; // T02
pub mod decode; // T01
pub mod fit;
pub mod gradient;
pub mod pipeline; // T01: analyze()+trace() orchestration
pub mod preprocess; // T02
pub mod quantize; // T02
pub mod svgpath; // T01
pub mod types;
pub mod vectorize; // T01 // T02
pub use analyze::analyze;
pub use decode::decode;
pub use image::RgbaImage;
pub use pipeline::trace;
pub use types::*;
