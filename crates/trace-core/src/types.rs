//! FROZEN CONTRACT (v1). Mirrors packages/trace-vectorizer/src/types.ts.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Preset {
    #[default]
    Auto,
    Logo,
    Lineart,
    Pixelart,
    Photo,
    Icon,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Stacked,
    Cutout,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CurveMode {
    Spline,
    Polygon,
    Pixel,
}

/// `colors`: number or "auto". `upscale`: "auto" or 1|2|4.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AutoOr<T> {
    Auto(AutoTag),
    Value(T),
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AutoTag {
    Auto,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TraceOptions {
    pub preset: Option<Preset>,
    pub colors: Option<AutoOr<u32>>,
    pub palette: Option<Vec<String>>,
    pub denoise: Option<f32>,
    pub upscale: Option<AutoOr<u32>>,
    pub mode: Option<Mode>,
    pub simplify: Option<f32>,
    pub corner_threshold: Option<f32>,
    pub filter_speckle: Option<u32>,
    pub curve_mode: Option<CurveMode>,
    pub gradients: Option<bool>,
    pub max_dimension: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradientStop {
    pub offset: f32,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradientDef {
    pub id: String,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub stops: Vec<GradientStop>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shape {
    pub id: u32,
    pub fill: String,
    pub color_index: i32,
    pub d: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraceStats {
    pub paths: u32,
    pub nodes: u32,
    pub colors: u32,
    pub ms: f64,
    pub preset: Preset,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceResult {
    pub width: u32,
    pub height: u32,
    pub palette: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    pub shapes: Vec<Shape>,
    pub gradients: Vec<GradientDef>,
    pub stats: TraceStats,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub width: u32,
    pub height: u32,
    pub preset: Preset,
    pub colors: u32,
    pub is_pixel_art: bool,
    pub pixel_scale: u32,
    pub has_gradients: bool,
    pub has_alpha: bool,
}
