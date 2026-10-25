//! Production Local lifecycle with an isolated HTTP fixture, no SSH or user data.
use super::{WebBounds, WebHost, WebTarget, native_surface_tests::pump};
use crate::infrastructure::{
    persistence::{
        json_known_host_repository::JsonKnownHostRepository,
        json_remote_shell_cache::JsonRemoteShellCache,
    },
    ssh::client::SshSessionManager,
};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::Manager;

pub(super) fn run<T: Send + 'static>(
    app: &mut tauri::App,
    work: impl std::future::Future<Output = T> + Send + 'static,
) -> T {
    let (send, receive) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let _ = send.send(work.await);
    });
    let result = std::cell::RefCell::new(None);
    pump(app, || {
        if let Ok(value) = receive.try_recv() {
            *result.borrow_mut() = Some(value);
        }
        result.borrow().is_some()
    });
    result.into_inner().unwrap()
}

pub(super) fn eval(app: &mut tauri::App, view: &tauri::Webview, script: &str) -> String {
    let (send, receive) = std::sync::mpsc::channel();
    view.eval_with_callback(script, move |value| {
        let _ = send.send(value);
    })
    .unwrap();
    let result = std::cell::RefCell::new(None);
    pump(app, || {
        if let Ok(value) = receive.try_recv() {
            *result.borrow_mut() = Some(value);
        }
        result.borrow().is_some()
    });
    result.into_inner().unwrap()
}

pub(super) fn wait_for_page(app: &mut tauri::App, view: &tauri::Webview, condition: &str) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while eval(app, view, condition) != "true" {
        assert!(
            std::time::Instant::now() < deadline,
            "page did not become ready: {condition}"
        );
    }
}

pub(super) fn verify(app: &mut tauri::App, remote: &tauri::Webview) {
    let root = tempfile::tempdir().unwrap();
    let host = Arc::new(WebHost::new(root.path().join("web")));
    let sessions = Arc::new(SshSessionManager::new(
        JsonKnownHostRepository::new(root.path().join("hosts.json")),
        JsonRemoteShellCache::new(root.path().join("shell.json")),
    ));
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let url = format!(
        "http://127.0.0.1:{}/",
        listener.local_addr().unwrap().port()
    );
    let stopped = Arc::new(AtomicBool::new(false));
    let stop = stopped.clone();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let received = requests.clone();
    let server = std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            if let Ok((mut socket, _)) = listener.accept() {
                socket.set_nonblocking(false).unwrap();
                socket
                    .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut byte = [0];
                while request.len() < 16384 && !request.ends_with(b"\r\n\r\n") {
                    if socket.read_exact(&mut byte).is_err() {
                        break;
                    }
                    request.push(byte[0]);
                }
                let body_length = String::from_utf8_lossy(&request)
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0)
                    .min(16384);
                let mut body = vec![0; body_length];
                let _ = socket.read_exact(&mut body);
                request.extend(body);
                received
                    .lock()
                    .unwrap()
                    .push(String::from_utf8_lossy(&request).into_owned());
                let body = "<!doctype html><title>Local fixture</title><body>Local network<script>window.__TAURI_INTERNALS__.invoke('qa_probe').then(()=>window.ipcProof='allowed').catch(()=>window.ipcProof='blocked'); if(location.search==='?automatic=1') setTimeout(()=>window.open(location.origin+'/?blocked=1'),6000)</script>";
                let _ = write!(
                    socket,
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            } else {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        }
    });
    let mut ids = Vec::new();
    for _ in 0..2 {
        let id = uuid::Uuid::new_v4().to_string();
        let (host, sessions, handle, id_copy, url) = (
            host.clone(),
            sessions.clone(),
            app.handle().clone(),
            id.clone(),
            url.clone(),
        );
        run(app, async move {
            host.open(&handle, &sessions, &id_copy, &WebTarget::Local {}, &url)
                .await
        })
        .unwrap();
        ids.push(id);
    }
    let a = app.get_webview(&super::label(&ids[0]).unwrap()).unwrap();
    let b = app.get_webview(&super::label(&ids[1]).unwrap()).unwrap();
    for page in [&a, &b] {
        wait_for_page(
            app,
            page,
            "document.title === 'Local fixture' && window.ipcProof === 'blocked'",
        );
    }
    eval(
        app,
        &a,
        "document.cookie='localProof=yes; SameSite=Lax'; localStorage.setItem('local-proof','yes'); true",
    );
    assert_eq!(
        eval(
            app,
            &b,
            "document.cookie.includes('localProof=yes') && localStorage.getItem('local-proof')==='yes'"
        ),
        "true"
    );
    remote.navigate(url.parse().unwrap()).unwrap();
    wait_for_page(
        app,
        remote,
        &format!(
            "location.href === {} && document.title === 'Proxy A' && document.readyState === 'complete'",
            serde_json::to_string(&url).unwrap()
        ),
    );
    assert_eq!(
        eval(
            app,
            remote,
            "!document.cookie.includes('localProof=yes') && localStorage.getItem('local-proof')===null"
        ),
        "true"
    );
    {
        let (host, sessions, handle, id) = (
            host.clone(),
            sessions.clone(),
            app.handle().clone(),
            ids[0].clone(),
        );
        run(app, async move {
            host.sync(
                &handle,
                &sessions,
                &id,
                WebBounds {
                    x: 20.0,
                    y: 80.0,
                    width: 470.0,
                    height: 500.0,
                    visible: true,
                    covered: false,
                    input_blocked: false,
                    occlusions: vec![],
                    frame: None,
                    panels: vec![],
                    scrollbar: None,
                },
            )
            .await?;
            host.action(&handle, &sessions, &id, "reload", None).await?;
            host.metrics(&handle, &sessions, &id).await?;
            Ok::<_, String>(())
        })
        .unwrap();
    }
    wait_for_page(
        app,
        &a,
        "document.title === 'Local fixture' && window.ipcProof === 'blocked'",
    );
    super::native_modal_tests::verify(app, &a, "QB-20261025-local-browser-links");
    {
        let (host, sessions, handle, id) = (
            host.clone(),
            sessions.clone(),
            app.handle().clone(),
            ids[0].clone(),
        );
        run(app, async move {
            host.clear_data(
                &handle,
                &sessions,
                &id,
                crate::domain::web_storage::ClearBrowserData {
                    cache: false,
                    cookies: true,
                    storage: true,
                },
            )
            .await
        })
        .unwrap();
        assert_eq!(
            eval(
                app,
                &b,
                "!document.cookie.includes('localProof=yes') && localStorage.getItem('local-proof')===null"
            ),
            "true"
        );
    }
    super::native_popup_tests::verify(app, &host, &sessions, &a, &requests);
    for id in ids {
        let (host, sessions, handle) = (host.clone(), sessions.clone(), app.handle().clone());
        run(
            app,
            async move { host.close(&handle, &sessions, &id).await },
        )
        .unwrap();
    }
    stopped.store(true, Ordering::Relaxed);
    server.join().unwrap();
    eprintln!(
        "PASS: Local lifecycle without SSH, same-local storage sharing, remote separation, guest IPC denied, modal cover and clearing"
    );
}
