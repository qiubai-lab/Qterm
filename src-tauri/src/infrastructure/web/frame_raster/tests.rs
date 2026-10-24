use super::*;

fn frame(x: f64) -> WebFrame {
    WebFrame {
        x,
        y: 20.0,
        width: 130.0,
        height: 100.0,
        radius: 8.0,
        stroke: 1.0,
        color: [255, 255, 0, 255],
    }
}

fn pixel(bitmap: &FrameBitmap, x: i32, y: i32) -> [u8; 4] {
    if x < bitmap.x || y < bitmap.y || x >= bitmap.x + bitmap.width || y >= bitmap.y + bitmap.height
    {
        return [0; 4];
    }
    let i = ((y - bitmap.y) * bitmap.width + x - bitmap.x) as usize * 4;
    bitmap.pixels[i..i + 4].try_into().unwrap()
}

#[test]
fn moving_and_reversing_frames_never_paint_black_or_erase_content() {
    for scale in [1.0, 1.25, 1.5, 2.0] {
        for step in (0..60).chain((0..60).rev()) {
            let outline = frame(-80.0 + step as f64 * 4.0);
            if let Some(bitmap) = rasterize(&outline, 300.0, 160.0, scale).unwrap() {
                for bgra in bitmap.pixels.chunks_exact(4) {
                    // Every non-transparent pixel is premultiplied yellow, never opaque black.
                    assert_eq!(bgra, [0, bgra[3], bgra[3], bgra[3]]);
                }
                assert_eq!(
                    pixel(
                        &bitmap,
                        ((outline.x + 65.0) * scale) as i32,
                        (70.0 * scale) as i32
                    ),
                    [0; 4]
                );
            }
        }
    }
}

#[test]
fn a_new_frame_clears_the_old_stroke_and_preserves_rounded_corners() {
    let first = rasterize(&frame(10.0), 300.0, 160.0, 1.0).unwrap().unwrap();
    assert_eq!(pixel(&first, 10, 60), [0, 255, 255, 255]);
    assert_eq!(pixel(&first, 10, 20), [0; 4]);
    let next = rasterize(&frame(30.0), 300.0, 160.0, 1.0).unwrap().unwrap();
    assert_eq!(pixel(&next, 10, 60), [0; 4]);
    assert_eq!(pixel(&next, 30, 60), [0, 255, 255, 255]);
}

#[test]
fn hidden_and_non_overlapping_strokes_remove_the_overlay() {
    assert!(
        rasterize(&frame(500.0), 300.0, 160.0, 1.0)
            .unwrap()
            .is_none()
    );
    let mut invisible = frame(20.0);
    invisible.color[3] = 0;
    assert!(rasterize(&invisible, 300.0, 160.0, 1.0).unwrap().is_none());
    let enclosing = WebFrame {
        x: -10.0,
        y: -10.0,
        width: 400.0,
        height: 200.0,
        ..frame(0.0)
    };
    assert!(rasterize(&enclosing, 300.0, 160.0, 1.0).unwrap().is_none());
}

#[test]
fn partial_alpha_is_premultiplied_and_invalid_parameters_are_rejected() {
    let mut outline = frame(10.0);
    outline.color = [100, 200, 240, 128];
    let bitmap = rasterize(&outline, 300.0, 160.0, 1.0).unwrap().unwrap();
    assert_eq!(pixel(&bitmap, 10, 60), [120, 100, 50, 128]);
    outline.x = f64::NAN;
    assert!(!outline.valid());
    assert!(rasterize(&outline, 300.0, 160.0, 1.0).is_err());
}
