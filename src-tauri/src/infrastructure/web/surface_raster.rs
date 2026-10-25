//! Alpha-composited app chrome above a windowed guest. Binary holes expose HTML content;
//! this transparent native rim covers only the rounded edge left outside those holes.
use super::frame_raster::WebFrame;
#[cfg(any(windows, test))]
use super::{
    WebBounds,
    frame_raster::{self, FrameBitmap, rounded_distance},
};

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WebPanel {
    pub edge: WebFrame,
    pub background: [u8; 4],
}

#[cfg(any(windows, test))]
pub(super) fn rasterize(
    bounds: &WebBounds,
    scale: f64,
) -> Result<Option<FrameBitmap>, &'static str> {
    if !bounds.valid() || !scale.is_finite() || !(0.1..=8.0).contains(&scale) {
        return Err("网页覆盖层参数无效");
    }
    let mut images = Vec::new();
    for panel in &bounds.panels {
        if let Some(image) = panel_bitmap(panel, bounds.width, bounds.height, scale)? {
            images.push(image);
        }
    }
    if let Some(frame) = &bounds.frame
        && let Some(image) = frame_raster::rasterize(frame, bounds.width, bounds.height, scale)?
    {
        images.push(image);
    }
    if images.is_empty() {
        return Ok(None);
    }
    if images.len() == 1 {
        return Ok(images.pop());
    }
    let x = images.iter().map(|b| b.x).min().unwrap();
    let y = images.iter().map(|b| b.y).min().unwrap();
    let width = images.iter().map(|b| b.x + b.width).max().unwrap() - x;
    let height = images.iter().map(|b| b.y + b.height).max().unwrap() - y;
    let count = width as usize * height as usize;
    if count > 16_777_216 {
        return Err("网页覆盖层区域过大");
    }
    let mut output = FrameBitmap {
        x,
        y,
        width,
        height,
        pixels: vec![0; count * 4],
    };
    for image in images {
        for py in 0..image.height {
            for px in 0..image.width {
                let src = ((py * image.width + px) * 4) as usize;
                if image.pixels[src + 3] == 0 {
                    continue;
                }
                let dst = (((image.y - y + py) * width + image.x - x + px) * 4) as usize;
                let inverse = 255 - u16::from(image.pixels[src + 3]);
                for channel in 0..4 {
                    output.pixels[dst + channel] = (u16::from(image.pixels[src + channel])
                        + (u16::from(output.pixels[dst + channel]) * inverse + 127) / 255)
                        .min(255) as u8;
                }
            }
        }
    }
    Ok(Some(output))
}

#[cfg(any(windows, test))]
fn panel_bitmap(
    panel: &WebPanel,
    width: f64,
    height: f64,
    scale: f64,
) -> Result<Option<FrameBitmap>, &'static str> {
    let frame = &panel.edge;
    if panel.background[3] == 0 && frame.color[3] == 0 {
        return Ok(None);
    }
    let (left, top) = (frame.x * scale, frame.y * scale);
    let (right, bottom) = (
        (frame.x + frame.width) * scale,
        (frame.y + frame.height) * scale,
    );
    let (x, y) = (left.floor().max(0.0) as i32, top.floor().max(0.0) as i32);
    let end_x = right.ceil().min((width * scale).ceil()) as i32;
    let end_y = bottom.ceil().min((height * scale).ceil()) as i32;
    if x >= end_x || y >= end_y {
        return Ok(None);
    }
    let (w, h) = (end_x - x, end_y - y);
    let count = w as usize * h as usize;
    if count > 16_777_216 {
        return Err("网页面板区域过大");
    }
    let mut pixels = vec![0; count * 4];
    let half = ((right - left) / 2.0, (bottom - top) / 2.0);
    let center = ((left + right) / 2.0, (top + bottom) / 2.0);
    let radius = (frame.radius * scale).min(half.0.min(half.1));
    let stroke = (frame.stroke * scale).min(half.0.min(half.1));
    for py in y..end_y {
        for px in x..end_x {
            let point = (px as f64 + 0.5 - center.0, py as f64 + 0.5 - center.1);
            let distance = rounded_distance(point, half, radius);
            // The interior belongs to the HTML list, including hover and text.
            if distance < -3.0 * scale {
                continue;
            }
            let outer = (0.5 - distance).clamp(0.0, 1.0);
            let inner = (0.5
                - rounded_distance(
                    point,
                    (half.0 - stroke, half.1 - stroke),
                    (radius - stroke).max(0.0),
                ))
            .clamp(0.0, 1.0)
            .min(outer);
            let background_alpha = inner * f64::from(panel.background[3]) / 255.0;
            let border_alpha = (outer - inner) * f64::from(frame.color[3]) / 255.0;
            let i = (((py - y) * w + px - x) * 4) as usize;
            for (channel, source) in [2, 1, 0].iter().enumerate() {
                pixels[i + channel] = (f64::from(panel.background[*source]) * background_alpha
                    + f64::from(frame.color[*source]) * border_alpha)
                    .round() as u8;
            }
            pixels[i + 3] = ((background_alpha + border_alpha) * 255.0).round() as u8;
        }
    }
    Ok(Some(FrameBitmap {
        x,
        y,
        width: w,
        height: h,
        pixels,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inset_menu_stroke_survives_native_corner_compositing() {
        let outer = WebPanel {
            edge: WebFrame {
                x: 10.3,
                y: 12.2,
                width: 80.0,
                height: 50.0,
                radius: 7.0,
                stroke: 1.0,
                color: [25, 27, 31, 255],
            },
            background: [25, 27, 31, 255],
        };
        let inner = WebPanel {
            edge: WebFrame {
                x: 11.3,
                y: 13.2,
                width: 78.0,
                height: 48.0,
                radius: 6.0,
                stroke: 1.0,
                color: [0, 221, 235, 97],
            },
            background: outer.background,
        };
        let bounds = WebBounds {
            x: 0.0,
            y: 0.0,
            width: 120.0,
            height: 100.0,
            visible: true,
            input_blocked: false,
            covered: false,
            frame: None,
            scrollbar: None,
            occlusions: vec![],
            panels: vec![outer, inner],
        };
        for scale in [1.0, 1.25, 1.5, 2.0, 3.0, 4.0] {
            let bitmap = rasterize(&bounds, scale).unwrap().unwrap();
            for (cx, sx) in [(17.3, -1.0), (83.3, 1.0)] {
                for (cy, sy) in [(19.2, -1.0), (55.2, 1.0)] {
                    for degrees in [0.0_f64, 30.0, 45.0, 60.0, 90.0] {
                        let angle = degrees.to_radians();
                        let x = ((cx + sx * 5.5 * angle.cos()) * scale).floor() as i32 - bitmap.x;
                        let y = ((cy + sy * 5.5 * angle.sin()) * scale).floor() as i32 - bitmap.y;
                        let pixel = ((y * bitmap.width + x) * 4) as usize;
                        assert!(
                            bitmap.pixels[pixel + 1] > 27,
                            "missing corner stroke at {scale}x/{degrees}"
                        );
                        assert_eq!(
                            bitmap.pixels[pixel + 3],
                            255,
                            "corner stroke must retain its opaque backing"
                        );
                    }
                }
            }
            let center = ((bitmap.height / 2 * bitmap.width + bitmap.width / 2) * 4) as usize;
            assert_eq!(
                bitmap.pixels[center + 3],
                0,
                "HTML still owns the menu interior"
            );
        }
    }

    #[test]
    fn rounded_rim_has_partial_alpha_and_preserves_transparent_interior() {
        let panel = WebPanel {
            edge: WebFrame {
                x: 10.3,
                y: 12.2,
                width: 80.0,
                height: 50.0,
                radius: 6.0,
                stroke: 1.0,
                color: [48, 52, 58, 255],
            },
            background: [25, 27, 31, 255],
        };
        for scale in [1.0, 1.25, 1.5, 2.0, 3.0, 4.0] {
            let bitmap = panel_bitmap(&panel, 120.0, 100.0, scale).unwrap().unwrap();
            assert!(
                bitmap
                    .pixels
                    .chunks_exact(4)
                    .any(|p| p[3] > 0 && p[3] < 255)
            );
            assert!(
                bitmap
                    .pixels
                    .chunks_exact(4)
                    .all(|p| p[0] <= p[3] && p[1] <= p[3] && p[2] <= p[3])
            );
            let center = (((bitmap.height / 2) * bitmap.width + bitmap.width / 2) * 4) as usize;
            assert_eq!(bitmap.pixels[center + 3], 0);
            assert_eq!(bitmap.pixels[3], 0);
        }
    }
}
