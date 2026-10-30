//! Premultiplied transparent border pixels, independent of native window ownership.
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WebFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub radius: f64,
    pub stroke: f64,
    pub color: [u8; 4],
}

impl WebFrame {
    pub fn valid(&self) -> bool {
        [self.x, self.y]
            .iter()
            .all(|n| n.is_finite() && n.abs() <= 32768.0)
            && [self.width, self.height]
                .iter()
                .all(|n| n.is_finite() && *n > 0.0 && *n <= 32768.0)
            && self.radius.is_finite()
            && (0.0..=32768.0).contains(&self.radius)
            && self.stroke.is_finite()
            && (0.0..=8.0).contains(&self.stroke)
    }
}

#[cfg(any(windows, test))]
pub(super) struct FrameBitmap {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub pixels: Vec<u8>,
}

#[cfg(any(windows, test))]
pub(super) fn rasterize(
    frame: &WebFrame,
    width: f64,
    height: f64,
    scale: f64,
) -> Result<Option<FrameBitmap>, &'static str> {
    if !frame.valid() || !scale.is_finite() || !(0.1..=8.0).contains(&scale) {
        return Err("网页边框参数无效");
    }
    if frame.color[3] == 0 || frame.stroke == 0.0 {
        return Ok(None);
    }
    let left = frame.x * scale;
    let top = frame.y * scale;
    let right = (frame.x + frame.width) * scale;
    let bottom = (frame.y + frame.height) * scale;
    let x = left.floor().max(0.0) as i32;
    let y = top.floor().max(0.0) as i32;
    let end_x = right.ceil().min((width * scale).ceil()) as i32;
    let end_y = bottom.ceil().min((height * scale).ceil()) as i32;
    if x >= end_x || y >= end_y {
        return Ok(None);
    }
    let bitmap_width = end_x - x;
    let bitmap_height = end_y - y;
    let count = bitmap_width as usize * bitmap_height as usize;
    if count > 16_777_216 {
        return Err("网页边框区域过大");
    }
    let mut pixels = vec![0; count * 4];
    let stroke = (frame.stroke * scale).min((right - left).min(bottom - top) / 2.0);
    let radius = (frame.radius * scale).min((right - left).min(bottom - top) / 2.0);
    let center = ((left + right) / 2.0, (top + bottom) / 2.0);
    let half = ((right - left) / 2.0, (bottom - top) / 2.0);
    let mut painted = false;
    for py in y..end_y {
        let mut paint = |start: i32, end: i32| {
            for px in start.max(x)..end.min(end_x) {
                let point = (px as f64 + 0.5 - center.0, py as f64 + 0.5 - center.1);
                let outer = (0.5 - rounded_distance(point, half, radius)).clamp(0.0, 1.0);
                let inner = (0.5
                    - rounded_distance(
                        point,
                        (half.0 - stroke, half.1 - stroke),
                        (radius - stroke).max(0.0),
                    ))
                .clamp(0.0, 1.0);
                let alpha = ((outer - inner).max(0.0) * f64::from(frame.color[3])).round() as u8;
                if alpha == 0 {
                    continue;
                }
                let i = ((py - y) as usize * bitmap_width as usize + (px - x) as usize) * 4;
                for (channel, source) in [frame.color[2], frame.color[1], frame.color[0]]
                    .iter()
                    .enumerate()
                {
                    pixels[i + channel] =
                        ((u16::from(*source) * u16::from(alpha) + 127) / 255) as u8;
                }
                pixels[i + 3] = alpha;
                painted = true;
            }
        };
        // Skip the transparent interior instead of evaluating every content pixel.
        if py as f64 + 0.5 > top + radius.max(stroke) + 1.0
            && (py as f64 + 0.5) < bottom - radius.max(stroke) - 1.0
        {
            let left_end = (left + stroke + 1.0).ceil() as i32;
            paint(x, left_end);
            paint(((right - stroke - 1.0).floor() as i32).max(left_end), end_x);
        } else {
            paint(x, end_x);
        }
    }
    Ok(painted.then_some(FrameBitmap {
        x,
        y,
        width: bitmap_width,
        height: bitmap_height,
        pixels,
    }))
}

#[cfg(any(windows, test))]
pub(super) fn rounded_distance(point: (f64, f64), half: (f64, f64), radius: f64) -> f64 {
    let q = (
        point.0.abs() - half.0 + radius,
        point.1.abs() - half.1 + radius,
    );
    q.0.max(0.0).hypot(q.1.max(0.0)) + q.0.max(q.1).min(0.0) - radius
}

#[cfg(test)]
#[path = "frame_raster/tests.rs"]
mod tests;
