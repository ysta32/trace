//! Trace core: raster -> vector. See CONTRACT.md.
pub mod types;
pub mod decode;      // T01
pub mod svgpath;     // T01
pub mod vectorize;   // T01
pub mod pipeline;    // T01: analyze()+trace() orchestration
pub mod analyze;     // T02
pub mod preprocess;  // T02
pub mod quantize;    // T02
pub mod gradient;    // T02
pub use types::*;
pub use image::RgbaImage;
pub use pipeline::{trace};
pub use analyze::analyze;
pub use decode::decode;
