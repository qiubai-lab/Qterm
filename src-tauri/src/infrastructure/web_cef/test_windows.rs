//! Parent-stdin-only Windows surface diagnostics, absent from normal artifacts and guest IPC.
use super::{
    WebHost, WebTarget,
    test_control::{emit, field},
};
use serde_json::{Value, json};
use tauri::Manager;
use tauri_runtime_cef::cef::*;
use windows::Win32::{
    Foundation::{POINT, RECT},
    Graphics::Gdi::{CreateRectRgn, DeleteObject, GetWindowRgn, MapWindowPoints, PtInRegion},
    UI::{
        Input::KeyboardAndMouse::{GetFocus, IsWindowEnabled},
        WindowsAndMessaging::{
            CWP_SKIPDISABLED, CWP_SKIPINVISIBLE, ChildWindowFromPointEx, GA_ROOT, GetAncestor,
            GetParent, GetWindowRect, IsChild, IsWindowVisible,
        },
    },
};

pub(super) async fn run(app: &tauri::AppHandle, command: &Value) -> Result<(), String> {
    let host = app.state::<WebHost>();
    let sessions = app.state::<crate::commands::session::SessionState>();
    let id = field(command, "id")?;
    match field(command, "op")? {
        "windows-open" => {
            host.open(
                app,
                sessions.manager(),
                id,
                &WebTarget::Local {},
                field(command, "url")?,
            )
            .await?;
            emit(json!({"event":"windows-opened","id":id}));
        }
        "windows-sync" => {
            host.sync(
                app,
                sessions.manager(),
                id,
                serde_json::from_value(command["bounds"].clone()).map_err(|e| e.to_string())?,
            )
            .await?;
            emit(json!({"event":"windows-synced","id":id}));
        }
        "windows-inspect" | "windows-focus" => {
            let label = super::label(id)?;
            let view = host
                .state
                .lock()
                .await
                .guests
                .get(&label)
                .ok_or("unknown guest")?
                .view(app, &label)?;
            let focus = command["op"] == "windows-focus";
            let points = command["points"].as_array().cloned().unwrap_or_default();
            let info = view.with(move |browser| {
                let hwnd = super::windows::handle(&browser)?;
                let host = browser.host().ok_or("missing host")?;
                if focus { host.set_focus(1); }
                unsafe {
                    let parent = GetParent(hwnd).map_err(|e| e.to_string())?;
                    let mut rect = RECT::default(); GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
                    let mut position = [POINT { x:rect.left,y:rect.top }]; MapWindowPoints(None,Some(parent), &mut position);
                    let rgn = CreateRectRgn(0,0,0,0); let kind = GetWindowRgn(hwnd,rgn).0;
                    let hit: Vec<bool> = points.iter().map(|p| kind == 0 || PtInRegion(rgn,p[0].as_i64().unwrap_or(0) as i32,p[1].as_i64().unwrap_or(0) as i32).as_bool()).collect();
                    let _ = DeleteObject(rgn.into());
                    let focus = GetFocus();
                    let front = ChildWindowFromPointEx(parent, POINT {
                        x:position[0].x+(rect.right-rect.left)/2,
                        y:position[0].y+(rect.bottom-rect.top)/2,
                    }, CWP_SKIPINVISIBLE | CWP_SKIPDISABLED);
                    Ok(json!({"hwnd":hwnd.0 as usize,"parent":parent.0 as usize,"top":GetAncestor(hwnd,GA_ROOT).0 as usize,
                        "x":position[0].x,"y":position[0].y,"width":rect.right-rect.left,"height":rect.bottom-rect.top,
                        "visible":IsWindowVisible(hwnd).as_bool(),"enabled":IsWindowEnabled(hwnd).as_bool(),
                        "focused": focus == hwnd || IsChild(hwnd,focus).as_bool(),"region":kind,"hit":hit,
                        "overlay": super::windows_frame::handle(hwnd).0 as usize,
                        "front":front.0 as usize,"unoccluded":front==hwnd,
                        "child":IsChild(parent,hwnd).as_bool()}))
                }
            }).await?;
            emit(json!({"event":"windows-info","id":id,"info":info}));
        }
        _ => return Err("unknown Windows operation".into()),
    }
    Ok(())
}
