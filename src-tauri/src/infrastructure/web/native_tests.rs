//! Run explicitly on an interactive Windows desktop:
//! cargo test native_webview_smoke -- --ignored --nocapture --test-threads=1
//! Uses isolated browser directories and local SOCKS fixtures, never user profiles.
use super::*;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

struct ProxyFixture {
    port: u16,
    requests: Arc<StdMutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
}
impl ProxyFixture {
    fn new(name: &'static str) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        listener.set_nonblocking(true).unwrap();
        let requests = Arc::new(StdMutex::new(Vec::new()));
        let captured = requests.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        std::thread::spawn(move || {
            while !stopped.load(Ordering::Relaxed) {
                if let Ok((socket, _)) = listener.accept() {
                    let requests = captured.clone();
                    std::thread::spawn(move || {
                        if let Err(error) = serve(socket, name, requests) {
                            eprintln!("proxy {name}: {error}");
                        }
                    });
                } else {
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        });
        Self {
            port,
            requests,
            stop,
        }
    }
    fn saw(&self, text: &str) -> bool {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .any(|request| request.contains(text))
    }
}
impl Drop for ProxyFixture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn serve(
    mut stream: TcpStream,
    name: &str,
    requests: Arc<StdMutex<Vec<String>>>,
) -> std::io::Result<()> {
    // Accepted Winsock sockets inherit the listener's nonblocking mode.
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    let mut greeting = [0; 2];
    stream.read_exact(&mut greeting)?;
    let mut methods = vec![0; greeting[1] as usize];
    stream.read_exact(&mut methods)?;
    stream.write_all(&[5, 0])?;
    let mut header = [0; 4];
    stream.read_exact(&mut header)?;
    let host = match header[3] {
        3 => {
            let mut size = [0];
            stream.read_exact(&mut size)?;
            let mut bytes = vec![0; size[0] as usize];
            stream.read_exact(&mut bytes)?;
            String::from_utf8_lossy(&bytes).into_owned()
        }
        1 => {
            let mut bytes = [0; 4];
            stream.read_exact(&mut bytes)?;
            std::net::Ipv4Addr::from(bytes).to_string()
        }
        _ => return Ok(()),
    };
    let mut port = [0; 2];
    stream.read_exact(&mut port)?;
    stream.write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 0])?;
    let mut bytes = Vec::new();
    while bytes.len() < 16384 && !bytes.ends_with(b"\r\n\r\n") {
        let mut byte = [0];
        stream.read_exact(&mut byte)?;
        bytes.push(byte[0]);
    }
    let request = String::from_utf8_lossy(&bytes);
    requests
        .lock()
        .unwrap()
        .push(format!("{host}:{} {request}", u16::from_be_bytes(port)));
    let body = format!(
        r#"<!doctype html><html><head><title>Proxy {name}</title></head><body style="background:linear-gradient(120deg,#d9edff,#f8fbff);color:#234;font:20px Segoe UI;padding:24px"><h1>SSH Web · {name}</h1><p id="proof">Independent proxy reached</p><input placeholder="Native input: click and type" style="font:16px Segoe UI;padding:8px;width:90%"><p id="ipc">Checking guest authority…</p><script>
if(document.cookie && !document.cookie.includes('route={name}')) fetch('/cookie-leaked'); else fetch('/cookie-isolated'); document.cookie='route={name}; SameSite=Lax';
window.__TAURI_INTERNALS__.invoke('qa_probe').then(()=>{{document.getElementById('ipc').textContent='FAIL: IPC allowed';fetch('/ipc-allowed')}}).catch(()=>{{document.getElementById('ipc').textContent='PASS: application IPC blocked';fetch('/ipc-blocked')}});
</script></body></html>"#
    );
    if request.starts_with("GET /slow ") {
        std::thread::sleep(Duration::from_secs(3));
    }
    let body = if request.starts_with("GET /ipc-") {
        "ok"
    } else {
        &body
    };
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )?;
    Ok(())
}

#[test]
#[ignore = "interactive Windows WebView2 test; uses an isolated window and local proxy fixtures"]
#[allow(deprecated)] // Bounded pump with sleeps permits assertions on the native UI thread.
fn native_webview_smoke() {
    let first = ProxyFixture::new("A");
    let second = ProxyFixture::new("B");
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let mut app = tauri::Builder::default()
        .any_thread()
        .invoke_handler(trusted_handler(|invoke| {
            invoke.resolver.resolve("UNEXPECTED");
            true
        }))
        .build(context)
        .unwrap();
    let main = tauri::WebviewWindowBuilder::new(
        &app,
        "main",
        tauri::WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .title("Qterm Web Block Smoke")
    .inner_size(1000.0, 650.0)
    .build()
    .unwrap();
    let navigation = super::native_navigation_tests::NavigationProbe::new(&app);
    let handle = app.handle().clone();
    let (tx, rx) = std::sync::mpsc::channel();
    let ports = (first.port, second.port);
    std::thread::spawn(move || {
        let a = windows::create(
            &handle,
            "web-smoke-a",
            ports.0,
            "http://internal.invalid:8765/".parse().unwrap(),
        );
        let b = windows::create(
            &handle,
            "web-smoke-b",
            ports.1,
            "http://internal.invalid:8765/".parse().unwrap(),
        );
        tx.send((a, b)).unwrap();
    });
    let deadline = Instant::now() + Duration::from_secs(60);
    let directories = loop {
        app.run_iteration(|_, _| {});
        if let Ok(result) = rx.try_recv() {
            break result;
        }
        assert!(Instant::now() < deadline, "native creation timeout");
        std::thread::sleep(Duration::from_millis(10));
    };
    let _directories = (directories.0.unwrap(), directories.1.unwrap());
    let a = app.get_webview("web-smoke-a").unwrap();
    let b = app.get_webview("web-smoke-b").unwrap();
    for (view, x) in [(&a, 20.0), (&b, 510.0)] {
        view.set_bounds(tauri::Rect {
            position: tauri::LogicalPosition::new(x, 80.0).into(),
            size: tauri::LogicalSize::new(470.0, 500.0).into(),
        })
        .unwrap();
        view.show().unwrap();
    }
    while !first.saw("GET /ipc-blocked") || !second.saw("GET /ipc-blocked") {
        app.run_iteration(|_, _| {});
        assert!(
            Instant::now() < deadline,
            "proxy/IPC proof missing: A={:?}, B={:?}",
            first.requests.lock().unwrap(),
            second.requests.lock().unwrap()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(first.saw("GET /cookie-isolated") && second.saw("GET /cookie-isolated"));
    assert!(!first.saw("GET /cookie-leaked") && !second.saw("GET /cookie-leaked"));
    super::native_profile_tests::verify(&mut app, &a, &b, _directories.0.path(), ports.0);
    a.navigate("http://127.0.0.1:8765/".parse().unwrap())
        .unwrap();
    while !first.saw("127.0.0.1:8765") {
        app.run_iteration(|_, _| {});
        std::thread::sleep(Duration::from_millis(10));
        assert!(Instant::now() < deadline, "loopback did not traverse proxy");
    }
    assert!(second.saw("internal.invalid:8765"));
    assert!(!first.saw("ipc-allowed") && !second.saw("ipc-allowed"));
    navigation.verify(&mut app, &a, || first.saw("GET /stop-preserved"));
    super::native_metrics_tests::verify(&mut app, &a);
    a.eval("if(getComputedStyle(document.documentElement,'::-webkit-scrollbar').width==='3px') fetch('/scrollbar-initial')").unwrap();
    super::native_surface_tests::pump(&mut app, || first.saw("GET /scrollbar-initial"));
    a.eval(super::scrollbars::script(Some(&[
        [16, 32, 48, 255],
        [48, 64, 80, 255],
        [80, 96, 112, 255],
    ])))
    .unwrap();
    a.eval("if(getComputedStyle(document.documentElement,'::-webkit-scrollbar-thumb').backgroundColor==='rgb(16, 32, 48)' && getComputedStyle(document.documentElement,'::-webkit-scrollbar-button').display==='none') fetch('/scrollbar-updated')").unwrap();
    super::native_surface_tests::pump(&mut app, || first.saw("GET /scrollbar-updated"));
    eprintln!("PASS: native scrollbar width, hidden arrows and live palette update");
    a.navigate("file:///C:/Windows/win.ini".parse().unwrap())
        .unwrap();
    for _ in 0..30 {
        app.run_iteration(|_, _| {});
        std::thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(a.url().unwrap().scheme(), "http");
    a.hide().unwrap();
    b.hide().unwrap();
    for _ in 0..10 {
        app.run_iteration(|_, _| {});
    }
    a.show().unwrap();
    b.show().unwrap();
    super::native_modal_tests::verify(&mut app, &a);
    super::native_surface_tests::verify(&mut app, &a, &b);
    eprintln!(
        "PASS: two isolated proxies, remote loopback/domain, guest IPC denied, file navigation denied, native bounds/show/hide"
    );
    let hold = std::env::var("QTERM_WEB_SMOKE_HOLD_SECONDS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0)
        .min(120);
    let end = Instant::now() + Duration::from_secs(hold);
    super::native_surface_tests::animate(&mut app, &a, &b, end);
    super::native_surface_tests::close_guests(&mut app, &a, &b);
    main.close().unwrap();
    app.cleanup_before_exit();
}
