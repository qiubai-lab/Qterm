#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v cmake >/dev/null
command -v ninja >/dev/null
export CEF_PATH="${CEF_PATH:-$PWD/artifacts/cef-cache}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/src-tauri/target}"
pnpm install --frozen-lockfile
pnpm build
