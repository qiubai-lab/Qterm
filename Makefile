# Thin entry points; package.json and scripts/tauri.mjs own the underlying commands.
# Compatible with macOS's GNU Make 3.81. Recipes require a POSIX shell.
SHELL := /bin/sh
.DEFAULT_GOAL := help
# Keep aggregate checks ordered, including when invoked with make -j.
.NOTPARALLEL:

PNPM ?= pnpm
CARGO ?= cargo
ARGS ?=
QTERM_LISTEN ?= 127.0.0.1:8080
QTERM_PUBLIC_ORIGIN ?= http://localhost:1423
QTERM_PASSWORD_FILE ?= $(if $(QTERM_PASSWORD_HASH_FILE),,$(CURDIR)/.server-secrets/password)
QTERM_DATA_DIR ?= $(CURDIR)/.server-data

.PHONY: help install dev dev-web dev-demo build package preview \
        check check-web check-rust check-size lint typecheck \
        test test-web test-unit test-rust test-watch fmt fmt-check lint-rust \
        build-site preview-site test-demo check-site audit-rust \
        package-macos package-windows package-linux install-local \
        dev-server dev-server-web server-password

help: ## Show available commands
	@awk 'BEGIN { print "Qterm development commands:\n" } /^[a-zA-Z0-9_-]+:.*## / { split($$0, parts, "## "); sub(/:.*/, "", parts[1]); printf "  make %-16s %s\n", parts[1], parts[2] } END { print "\nPass extra arguments to supported targets with ARGS=\"...\"; see docs/DEVELOPMENT.md." }' Makefile

install: ## Install pinned frontend dependencies
	$(PNPM) install --frozen-lockfile

dev: ## Run the full Tauri desktop app (Qterm Dev)
	$(PNPM) tauri dev $(ARGS)

dev-web: ## Run only the browser UI, without native IPC
	$(PNPM) dev $(ARGS)

dev-server: build-server-screen ## Run the Web runtime backend (pair with dev-server-web)
	QTERM_LISTEN="$(QTERM_LISTEN)" QTERM_PUBLIC_ORIGIN="$(QTERM_PUBLIC_ORIGIN)" \
	QTERM_PASSWORD_FILE="$(QTERM_PASSWORD_FILE)" QTERM_PASSWORD_HASH_FILE="$(QTERM_PASSWORD_HASH_FILE)" \
	QTERM_DATA_DIR="$(QTERM_DATA_DIR)" \
	$(CARGO) run --manifest-path crates/Cargo.toml --locked -p qterm-server $(ARGS)

dev-server-web: ## Run the Web runtime frontend at http://localhost:1423
	$(PNPM) dev:web $(ARGS)

server-password: ## Read a login password from stdin and print its Argon2id hash
	@$(CARGO) run --manifest-path crates/Cargo.toml --locked -p qterm-server -- hash-password

dev-demo: ## Run the website's simulated workspace demo
	$(PNPM) dev:demo $(ARGS)

build: ## Type-check and build frontend assets (no desktop bundle)
	$(PNPM) build

package: ## Build the current platform's release desktop bundle
	$(PNPM) tauri build $(ARGS)

package-macos: ## Build standard macOS app/DMG packages on macOS
	$(PNPM) package:desktop --platform macos $(ARGS)

package-windows: ## Build standard Windows NSIS/MSI packages on Windows
	$(PNPM) package:desktop --platform windows $(ARGS)

package-linux: ## Build standard Linux AppImage/deb/rpm packages on Linux
	$(PNPM) package:desktop --platform linux $(ARGS)

install-local: ## Build and install standard Qterm locally, keeping existing config
	$(PNPM) install:local $(ARGS)

preview: ## Preview built frontend assets
	$(PNPM) preview $(ARGS)

check: check-web check-rust ## Run all frontend and Rust quality gates

check-web: ## Run source-size, lint, tests, type checking and frontend build
	$(PNPM) check

check-rust: fmt-check lint-rust test-rust ## Run Rust format, Clippy and tests

check-size: ## Check source-size limits
	$(PNPM) check:source-size

lint: ## Lint frontend code
	$(PNPM) lint

typecheck: ## Type-check frontend code
	$(PNPM) typecheck

test: test-web test-rust ## Run frontend, script and Rust tests

test-web: ## Run frontend and repository script tests
	$(PNPM) test

test-unit: ## Run Vitest once; supports file paths and filters via ARGS
	$(PNPM) exec vitest run $(ARGS)

test-rust: ## Run Rust tests with all targets and features
	$(CARGO) test --manifest-path crates/Cargo.toml --workspace --all-targets --all-features --locked $(ARGS)
	cd src-tauri && $(CARGO) test --all-targets --all-features $(ARGS)

test-watch: ## Run frontend tests in watch mode
	$(PNPM) test:watch $(ARGS)

fmt: ## Apply Rust formatting
	$(CARGO) fmt --manifest-path crates/Cargo.toml --all
	cd src-tauri && $(CARGO) fmt

fmt-check: ## Check Rust formatting without changing files
	$(CARGO) fmt --manifest-path crates/Cargo.toml --all -- --check
	cd src-tauri && $(CARGO) fmt --check

lint-rust: ## Run Clippy for all targets and features; reject warnings
	$(CARGO) clippy --manifest-path crates/Cargo.toml --workspace --all-targets --all-features --locked -- -D warnings
	cd src-tauri && $(CARGO) clippy --all-targets --all-features -- -D warnings

build-site: ## Build the website and browser demo
	$(PNPM) build:site

preview-site: ## Preview the built website
	$(PNPM) preview:site $(ARGS)

test-demo: ## Run browser-demo tests
	$(PNPM) test:demo $(ARGS)

check-site: ## Verify website build and desktop/demo asset isolation
	$(PNPM) check:site

audit-rust: ## Audit Rust dependencies (requires cargo-audit)
	cd crates && $(CARGO) audit
	cd src-tauri && $(CARGO) audit

.PHONY: build-server-screen
build-server-screen: ## Build the headless terminal state worker
	$(PNPM) build:server-screen
