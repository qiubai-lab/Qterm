//! Mouse-transparent layered child owned by the guest HWND, not by the guest webpage.
use super::{WebBounds, frame_raster::FrameBitmap};
use windows::{
    Win32::{
        Foundation::{COLORREF, HANDLE, HWND, POINT, SIZE},
        Graphics::Gdi::{
            AC_SRC_ALPHA, AC_SRC_OVER, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BLENDFUNCTION,
            CreateCompatibleDC, CreateDIBSection, DIB_RGB_COLORS, DeleteDC, DeleteObject,
            SelectObject,
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, GetPropW, HWND_TOP, IsWindow, SW_HIDE, SWP_NOACTIVATE,
            SWP_SHOWWINDOW, SetPropW, SetWindowPos, ShowWindow, ULW_ALPHA, UpdateLayeredWindow,
            WS_CHILD, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TRANSPARENT,
        },
    },
    core::w,
};

const PROPERTY: windows::core::PCWSTR = w!("Qterm.WebFrameOverlay");

pub(super) fn handle(parent: HWND) -> HWND {
    // A non-owning property; Windows destroys this child and the property with its parent.
    unsafe { HWND(GetPropW(parent, PROPERTY).0) }
}

pub(super) fn sync(parent: HWND, bounds: &WebBounds, scale: f64) -> Result<(), &'static str> {
    let bitmap = if bounds.covered {
        None
    } else {
        super::surface_raster::rasterize(bounds, scale)?
    };
    let mut overlay = handle(parent);
    let Some(bitmap) = bitmap else {
        if !overlay.is_invalid() {
            unsafe {
                let _ = ShowWindow(overlay, SW_HIDE);
            }
        }
        return Ok(());
    };
    unsafe {
        if overlay.is_invalid() || !IsWindow(Some(overlay)).as_bool() {
            overlay = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE,
                w!("STATIC"),
                w!(""),
                WS_CHILD,
                0,
                0,
                1,
                1,
                Some(parent),
                None,
                None,
                None,
            )
            .map_err(|error| {
                eprintln!("web frame CreateWindowExW: {error}");
                "无法创建网页边框覆盖层"
            })?;
            if SetPropW(parent, PROPERTY, Some(HANDLE(overlay.0))).is_err() {
                let _ = DestroyWindow(overlay);
                return Err("无法保存网页边框覆盖层");
            }
        }
        paint(overlay, &bitmap)?;
        SetWindowPos(
            overlay,
            Some(HWND_TOP),
            bitmap.x,
            bitmap.y,
            bitmap.width,
            bitmap.height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        )
        .map_err(|_| "无法定位网页边框覆盖层")?;
    }
    Ok(())
}

unsafe fn paint(overlay: HWND, bitmap: &FrameBitmap) -> Result<(), &'static str> {
    unsafe {
        let dc = CreateCompatibleDC(None);
        if dc.is_invalid() {
            return Err("无法创建边框绘图上下文");
        }
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: bitmap.width,
                biHeight: -bitmap.height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits = std::ptr::null_mut();
        let image = match CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0) {
            Ok(image) => image,
            Err(_) => {
                let _ = DeleteDC(dc);
                return Err("无法创建透明边框位图");
            }
        };
        std::ptr::copy_nonoverlapping(
            bitmap.pixels.as_ptr(),
            bits.cast::<u8>(),
            bitmap.pixels.len(),
        );
        let previous = SelectObject(dc, image.into());
        let size = SIZE {
            cx: bitmap.width,
            cy: bitmap.height,
        };
        let source = POINT::default();
        let blend = BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: 255,
            AlphaFormat: AC_SRC_ALPHA as u8,
        };
        let result = UpdateLayeredWindow(
            overlay,
            None,
            None,
            Some(&size),
            Some(dc),
            Some(&source),
            COLORREF(0),
            Some(&blend),
            ULW_ALPHA,
        );
        SelectObject(dc, previous);
        let _ = DeleteObject(image.into());
        let _ = DeleteDC(dc);
        result.map_err(|_| "无法显示透明网页边框")
    }
}
