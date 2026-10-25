//! Dynamic guest rendering without a host sync or reload repairing the stylesheet.
use super::native_local_tests::{eval, run, wait_for_page};

const STYLED: &str = r#"(() => {
  const root = document.documentElement;
  const thumb = getComputedStyle(root, '::-webkit-scrollbar-thumb');
  const nested = document.getElementById('nested');
  const overlay = document.querySelector('qterm-scrollbars')?.shadowRoot;
  return document.querySelectorAll('style#qterm-native-scrollbars').length === 1
    && getComputedStyle(root, '::-webkit-scrollbar').display === 'none'
    && getComputedStyle(root, '::-webkit-scrollbar-button').display === 'none'
    && thumb.backgroundColor === 'rgb(43, 160, 129)'
    && root.scrollHeight > root.clientHeight && innerWidth - root.clientWidth === 0
    && innerHeight - root.clientHeight === 0 && nested.offsetWidth - nested.clientWidth === 0
    && overlay?.querySelectorAll('.bar:not([hidden])').length === 4
    && getComputedStyle(overlay.querySelector('.thumb')).backgroundColor === 'rgb(43, 160, 129)';
})()"#;

pub(super) fn verify(app: &mut tauri::App, view: &tauri::Webview) {
    wait_for_page(app, view, "document.title==='Local fixture'");
    let before = view.url().unwrap();
    view.set_bounds(tauri::Rect {
        position: tauri::LogicalPosition::new(20.0, 50.0).into(),
        size: tauri::LogicalSize::new(900.0, 550.0).into(),
    })
    .unwrap();
    view.show().unwrap();
    eval(
        app,
        view,
        r#"document.body.style.cssText='margin:0;background:#f6faf9;color:#234;font:16px Segoe UI';
      document.body.innerHTML='<header style="padding:24px;background:#18332e;color:#bdf6e6">Qterm · Dynamic native scrollbars</header><main style="padding:24px"><p>Content expands after loading. No reload or host sync.</p><div id="nested" style="width:360px;height:90px;overflow:auto;background:#e1eeea"><div id="nested-content">Nested scroll area</div></div><div id="growth"></div></main>';
      window.scrollbarDocumentProof='same document'; true"#,
    );
    // One explicit theme update before all mutations. Repairs must retain this palette.
    view.eval(super::scrollbars::script(Some(&[
        [43, 160, 129, 255],
        [63, 180, 149, 255],
        [83, 200, 169, 255],
    ])))
    .unwrap();
    wait_for_page(
        app,
        view,
        "document.documentElement.scrollHeight <= document.documentElement.clientHeight",
    );
    eval(
        app,
        view,
        "document.getElementById('growth').style.cssText='height:2200px;width:1800px;background:repeating-linear-gradient(#f6faf9 0 79px,#d4e7df 80px 81px)'; document.getElementById('nested-content').style.cssText='height:400px;width:900px'; true",
    );
    wait_for_page(app, view, STYLED);
    capture(app, view, "dynamic-overflow.png");
    eval(app, view, "window.scrollTo(0,180); true");
    wait_for_page(app, view, "scrollY===180");
    for mutation in [
        "document.getElementById('qterm-native-scrollbars').remove()",
        "document.getElementById('qterm-native-scrollbars').textContent=''",
        "document.head.replaceWith(Object.assign(document.createElement('head'),{innerHTML:'<title>Dynamic update</title>'}))",
        "document.getElementById('qterm-native-scrollbars').media='not all'",
        "document.getElementById('qterm-native-scrollbars').type='text/plain'",
        "document.querySelector('qterm-scrollbars').remove()",
        "document.head.insertAdjacentHTML('beforeend','<style>::-webkit-scrollbar{width:17px!important;height:17px!important} :root{scrollbar-color:red blue!important}</style>')",
    ] {
        eval(app, view, &format!("{mutation}; true"));
        wait_for_page(app, view, STYLED);
        assert_eq!(
            eval(
                app,
                view,
                "window.scrollbarDocumentProof==='same document' && scrollY===180"
            ),
            "true",
            "mutation must retain the document and scroll position: {mutation}"
        );
    }
    capture(app, view, "recovered-head.png");
    super::native_scrollbar_drag_tests::verify(app, view);
    eprintln!(
        "PASS: dynamic viewport/nested zero gutters, latest palette, style/head edits and late CSS recover without reload or scroll reset"
    );
    if std::env::var_os("QTERM_WEB_LIVE_SCROLLBARS").is_some() {
        verify_baidu(app, view);
    }
    view.navigate(before).unwrap();
    wait_for_page(
        app,
        view,
        "document.title==='Local fixture' && window.ipcProof==='blocked'",
    );
}

fn verify_baidu(app: &mut tauri::App, view: &tauri::Webview) {
    view.navigate("https://www.baidu.com/s?wd=%E7%9A%84".parse().unwrap())
        .unwrap();
    wait_live_page(
        app,
        view,
        "document.readyState==='complete' && Array.from(document.querySelectorAll('input,textarea')).some(e=>e.value==='的' && e.getBoundingClientRect().width>100 && e.getBoundingClientRect().top<150) && document.documentElement.scrollHeight > innerHeight",
    );
    view.window().set_focus().unwrap();
    view.set_focus().unwrap();
    eval(
        app,
        view,
        "window.scrollbarLiveProof='before search'; const field=Array.from(document.querySelectorAll('input,textarea')).find(e=>e.value==='的' && e.getBoundingClientRect().width>100 && e.getBoundingClientRect().top<150); field.setAttribute('data-qterm-smoke-search',''); field.focus(); field.select(); true",
    );
    native_input(
        app,
        view,
        "Input.insertText",
        serde_json::json!({"text":"的字"}),
    );
    eprintln!(
        "Baidu input state: {}",
        eval(
            app,
            view,
            "({active:document.activeElement?.outerHTML, value:document.querySelector('[data-qterm-smoke-search]')?.value})"
        )
    );
    eval(
        app,
        view,
        "const button=Array.from(document.querySelectorAll('button,div,a,input[type=submit]')).filter(e=>(e.value||e.textContent).trim()==='百度一下' && e.getBoundingClientRect().width>60 && e.getBoundingClientRect().width<180 && e.getBoundingClientRect().height>20 && e.getBoundingClientRect().height<80 && e.getBoundingClientRect().top<150).sort((a,b)=>a.getBoundingClientRect().width*a.getBoundingClientRect().height-b.getBoundingClientRect().width*b.getBoundingClientRect().height)[0]; button.setAttribute('data-qterm-smoke-submit',''); true",
    );
    eprintln!(
        "Baidu button: {}",
        eval(
            app,
            view,
            "document.querySelector('[data-qterm-smoke-submit]').outerHTML"
        )
    );
    super::native_popup_click_tests::click(app, view, "[data-qterm-smoke-submit]");
    eval(
        app,
        view,
        "window.scrollbarLiveSettled=false; setTimeout(()=>window.scrollbarLiveSettled=true,1500); true",
    );
    wait_for_page(app, view, "window.scrollbarLiveSettled===true");
    eprintln!(
        "Baidu after click: {}",
        eval(
            app,
            view,
            "({url:location.href,value:document.querySelector('#kw')?.value,click:window.popupClickProof})"
        )
    );
    capture(app, view, "baidu-search.png");
    wait_for_page(
        app,
        view,
        "new URL(location.href).searchParams.get('wd')==='的字'",
    );
    wait_for_page(
        app,
        view,
        "!!document.getElementById('qterm-native-scrollbars') && getComputedStyle(document.documentElement,'::-webkit-scrollbar').display==='none' && innerWidth-document.documentElement.clientWidth===0",
    );
    let same_document = eval(app, view, "window.scrollbarLiveProof==='before search'");
    capture(app, view, "baidu-search.png");
    eprintln!(
        "PASS: live Baidu search keeps a 3px scrollbar; same-document transition: {same_document}"
    );
}

fn wait_live_page(app: &mut tauri::App, view: &tauri::Webview, condition: &str) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(45);
    while eval(app, view, condition) != "true" {
        assert!(
            std::time::Instant::now() < deadline,
            "live page did not become ready: {condition}"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

pub(super) fn native_input(
    app: &mut tauri::App,
    view: &tauri::Webview,
    method: &str,
    parameters: serde_json::Value,
) {
    let page = view.clone();
    let parameters = parameters.to_string();
    let method = method.to_owned();
    run(app, async move {
        let (send, receive) = tokio::sync::oneshot::channel();
        page.with_webview(move |native| unsafe {
            let method = webview2_com::CoTaskMemPWSTR::from(method.as_str());
            let parameters = webview2_com::CoTaskMemPWSTR::from(parameters.as_str());
            native
                .controller()
                .CoreWebView2()
                .unwrap()
                .CallDevToolsProtocolMethod(
                    *method.as_ref().as_pcwstr(),
                    *parameters.as_ref().as_pcwstr(),
                    &webview2_com::CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                        move |result, _| {
                            let _ = send.send(result);
                            Ok(())
                        },
                    )),
                )
                .unwrap();
        })
        .unwrap();
        receive.await.unwrap()
    })
    .unwrap();
}

pub(super) fn capture(app: &mut tauri::App, view: &tauri::Webview, name: &str) {
    let folder = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../docs/qb-spec/evidence/QB-20261025-browser-session-overlay");
    std::fs::create_dir_all(&folder).unwrap();
    let page = view.clone();
    let png = run(
        app,
        async move { super::windows_snapshot::capture(&page).await },
    )
    .unwrap();
    use base64::Engine;
    std::fs::write(
        folder.join(name),
        base64::engine::general_purpose::STANDARD
            .decode(png)
            .unwrap(),
    )
    .unwrap();
}
