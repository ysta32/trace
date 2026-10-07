//! T01: decode() round-trips encoded images.
use image::{ImageFormat, Rgba, RgbaImage};
use std::io::Cursor;
use trace_core::decode;

#[test]
fn decode_png_and_bmp_roundtrip() {
    let img = RgbaImage::from_fn(7, 5, |x, y| Rgba([x as u8 * 30, y as u8 * 40, 7, 255]));
    for fmt in [ImageFormat::Png, ImageFormat::Bmp] {
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, fmt).expect("encode");
        let out = decode(buf.get_ref()).expect("decode");
        assert_eq!(out.dimensions(), (7, 5));
        assert_eq!(out.get_pixel(3, 2), img.get_pixel(3, 2), "{fmt:?}");
    }
}

#[test]
fn decode_rejects_garbage() {
    assert!(decode(&[]).is_err());
    assert!(decode(b"not an image at all").is_err());
}
