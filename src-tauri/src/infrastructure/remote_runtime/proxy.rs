use super::RemoteRuntime;
use axum::{
    body::Body,
    extract::{State, ws::WebSocketUpgrade},
    http::{Request, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::sync::Arc;

pub async fn forward(
    State(runtime): State<Arc<RemoteRuntime>>,
    ws: Result<WebSocketUpgrade, axum::extract::ws::rejection::WebSocketUpgradeRejection>,
    request: Request<Body>,
) -> Response {
    if runtime.cancel.is_cancelled() {
        return StatusCode::GONE.into_response();
    }
    let prefix = format!("/{}", runtime.token);
    let Some(path) = request
        .uri()
        .path_and_query()
        .and_then(|p| p.as_str().strip_prefix(&prefix))
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(target) = runtime.target(path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        != Some(&runtime.ui_origin)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    if request.method() == axum::http::Method::OPTIONS {
        return cors(StatusCode::NO_CONTENT.into_response(), &runtime.ui_origin);
    }
    if let Ok(ws) = ws {
        return super::socket::upgrade(runtime, target, ws).await;
    }
    let mut outgoing = runtime
        .client
        .request(request.method().clone(), target)
        .header(
            header::ORIGIN,
            runtime.endpoint.origin().ascii_serialization(),
        );
    for name in ["content-type", "x-qterm-client", "x-qterm-access"] {
        if let Some(value) = request.headers().get(name) {
            outgoing = outgoing.header(name, value);
        }
    }
    let origin = runtime.ui_origin.clone();
    let body = reqwest::Body::wrap_stream(request.into_body().into_data_stream());
    let response = tokio::select! {
        _ = runtime.cancel.cancelled() => return StatusCode::GONE.into_response(),
        result = outgoing.body(body).send() => result,
    };
    match response {
        Ok(upstream) => {
            let mut result = Response::builder().status(upstream.status());
            for name in ["content-type", "content-disposition", "content-length"] {
                if let Some(value) = upstream.headers().get(name) { result = result.header(name, value); }
            }
            // Never expose Set-Cookie or redirects to the WebView. The native jar owns authentication.
            cors(result.body(Body::from_stream(upstream.bytes_stream())).unwrap(), &origin)
        }
        Err(_) => cors((StatusCode::BAD_GATEWAY, axum::Json(serde_json::json!({"code":"runtimeUnavailable","message":"远程服务连接中断，请重试"}))).into_response(), &origin),
    }
}
fn cors(mut response: Response, origin: &str) -> Response {
    let headers = response.headers_mut();
    if let Ok(value) = origin.parse() {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
    }
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
        "true".parse().unwrap(),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        "Content-Type, X-Qterm-Client, X-Qterm-Access"
            .parse()
            .unwrap(),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        "Content-Disposition".parse().unwrap(),
    );
    headers.insert(
        "access-control-allow-private-network",
        "true".parse().unwrap(),
    );
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
