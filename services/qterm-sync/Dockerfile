FROM rust:1.90-bookworm AS builder
WORKDIR /build
COPY crates/sync-core crates/sync-core
COPY services/qterm-sync services/qterm-sync
RUN cargo build --release --locked --manifest-path services/qterm-sync/Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home qterm \
    && mkdir /data && chown qterm:qterm /data
COPY --from=builder /build/services/qterm-sync/target/release/qterm-sync-server /usr/local/bin/qterm-sync-server
USER qterm
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["qterm-sync-server"]
