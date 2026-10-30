//! Clip only the guest HWND, subtracting the union of occlusions with outward DPI rounding.
use super::WebBounds;
use windows::Win32::{
    Foundation::HWND,
    Graphics::Gdi::{CombineRgn, CreateRectRgn, DeleteObject, RGN_DIFF, SetWindowRgn},
};

pub(super) fn apply(hwnd: HWND, bounds: &WebBounds, scale: f64) -> Result<(), &'static str> {
    unsafe {
        if !bounds.covered && bounds.occlusions.is_empty() {
            return (SetWindowRgn(hwnd, None, true) != 0)
                .then_some(())
                .ok_or("无法恢复网页区域");
        }
        let region = CreateRectRgn(
            0,
            0,
            if bounds.covered {
                0
            } else {
                (bounds.width * scale).ceil() as i32
            },
            if bounds.covered {
                0
            } else {
                (bounds.height * scale).ceil() as i32
            },
        );
        if region.is_invalid() {
            return Err("无法创建网页区域");
        }
        for rect in &bounds.occlusions {
            let cut = CreateRectRgn(
                (rect.x * scale).floor() as i32,
                (rect.y * scale).floor() as i32,
                ((rect.x + rect.width) * scale).ceil() as i32,
                ((rect.y + rect.height) * scale).ceil() as i32,
            );
            let combined = if cut.is_invalid() {
                0
            } else {
                CombineRgn(Some(region), Some(region), Some(cut), RGN_DIFF).0
            };
            if !cut.is_invalid() {
                let _ = DeleteObject(cut.into());
            }
            if combined == 0 {
                let _ = DeleteObject(region.into());
                return Err("无法裁剪网页区域");
            }
        }
        if SetWindowRgn(hwnd, Some(region), true) == 0 {
            let _ = DeleteObject(region.into());
            return Err("无法应用网页区域");
        }
        // Windows owns the region after success.
        Ok(())
    }
}
