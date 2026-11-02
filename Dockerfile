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

FROM rust:1.97.1-bookworm AS backend
WORKDIR /build
ARG CARGO_BUILD_JOBS=2
COPY crates ./crates
RUN --mount=type=secret,id=cargo_config,target=/usr/local/cargo/config.toml \
    --mount=type=cache,id=qterm-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=qterm-cargo-target,target=/build/crates/target \
    cargo build --manifest-path crates/Cargo.toml --release --locked -p qterm-server \
    && cp /build/crates/target/release/qterm-server /build/qterm-server

FROM ubuntu:24.04 AS runtime
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
    bash ca-certificates curl tini git openssh-client libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
# Preserve the existing persistent HOME; usermod rejects root while PID 1 uses it.
RUN groupadd --gid 10001 qterm \
    && useradd --uid 10001 --gid 10001 --home-dir /data/users/qterm --shell /bin/bash --no-create-home qterm \
    && sed -i 's#^root:[^:]*:0:0:[^:]*:[^:]*:[^:]*$#root:x:0:0:root:/data/home:/bin/bash#' /etc/passwd \
    && mkdir -p /data/home /data/users /app /opt/qterm/bin \
    && install -d -o qterm -g qterm /data/users/qterm
COPY --from=backend /build/qterm-server /usr/local/bin/qterm-server
COPY --from=frontend /build/dist-web /app/public
COPY --from=frontend /build/dist-server /app/runtime
COPY --from=frontend /usr/local/bin/node /opt/qterm/bin/node
ENV LANG=C.UTF-8 QTERM_NODE=/opt/qterm/bin/node QTERM_SCREEN_WORKER=/app/runtime/screen.mjs
COPY --chmod=755 scripts/server-container-entrypoint.sh /usr/local/bin/qterm-server-entrypoint
COPY --chmod=755 scripts/server-container-healthcheck.sh /usr/local/bin/qterm-server-healthcheck
ENV HOME=/data/home QTERM_LISTEN=0.0.0.0:8080 QTERM_DATA_DIR=/data QTERM_ASSETS_DIR=/app/public
USER root
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD ["/usr/local/bin/qterm-server-healthcheck"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/qterm-server-entrypoint"]
