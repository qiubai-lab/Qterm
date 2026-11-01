FROM node:24-bookworm-slim AS frontend
WORKDIR /build
RUN npm install --global pnpm@11.0.8
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=qterm-pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig*.json vite.web.config.ts ./
COPY src ./src
COPY web ./web
COPY scripts/build-server-screen.mjs ./scripts/build-server-screen.mjs
RUN pnpm build:web
RUN mkdir -p /node-libs && cp /usr/lib/*/libstdc++.so.6 /node-libs/

FROM rust:1.97.1-bookworm AS backend
WORKDIR /build
ARG CARGO_BUILD_JOBS=2
COPY crates ./crates
RUN --mount=type=secret,id=cargo_config,target=/usr/local/cargo/config.toml \
    --mount=type=cache,id=qterm-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=qterm-cargo-target,target=/build/crates/target \
    cargo build --manifest-path crates/Cargo.toml --release --locked -p qterm-server \
    && cp /build/crates/target/release/qterm-server /build/qterm-server

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install --yes --no-install-recommends ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 qterm && useradd --uid 10001 --gid 10001 --no-create-home qterm \
    && mkdir -p /data /app && chown 10001:10001 /data
RUN usermod --home /data/home --shell /bin/bash qterm \
    && mkdir -p /data/home && chown 10001:10001 /data/home
COPY --from=backend /build/qterm-server /usr/local/bin/qterm-server
COPY --from=frontend /build/dist-web /app/public
COPY --from=frontend /build/dist-server /app/runtime
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend /node-libs/ /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib QTERM_SCREEN_WORKER=/app/runtime/screen.mjs
COPY --chmod=755 scripts/server-container-entrypoint.sh /usr/local/bin/qterm-server-entrypoint
ENV HOME=/data/home QTERM_LISTEN=0.0.0.0:8080 QTERM_DATA_DIR=/data QTERM_ASSETS_DIR=/app/public
USER 10001:10001
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD curl --fail --silent http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/qterm-server-entrypoint"]
