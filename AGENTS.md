# Repository Guidelines

## Project Structure & Module Organization

The React/TypeScript frontend lives in `src/`. Feature code is grouped by domain: `workspace/` manages layouts and workspace state, `terminal/` owns terminal UI, `components/` contains shared views and dialogs, and `lib/tauri/` wraps backend IPC. Keep frontend tests beside the code they cover as `*.test.ts` or `*.test.tsx`; shared test setup is in `src/test/`.

The Tauri/Rust backend is under `src-tauri/src/`. Preserve its layering: `domain/` holds business rules, `application/` orchestrates use cases, `ports/` defines interfaces, `infrastructure/` implements SSH and persistence, and `commands/` exposes Tauri APIs. Project specifications are in `docs/qb-spec/`.

## Build, Test, and Development Commands

- `pnpm install --frozen-lockfile` installs the pinned Node dependencies (Node 22, pnpm 11.0.8).
- `pnpm tauri dev` runs the complete desktop app; `pnpm dev` runs only the browser UI without working Tauri IPC.
- `pnpm check` runs ESLint, Vitest, TypeScript checking, and the Vite production build.
- `pnpm test:watch` runs frontend tests interactively.
- From `src-tauri/`, run `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test --all-targets --all-features`.
- `pnpm tauri build` creates a release bundle. Run it only for releases or changes affecting native dependencies, Tauri configuration, or packaging. Pushing a `v*` tag builds desktop bundles for macOS/Windows/Linux and publishes them to a GitHub Release via `.github/workflows/build-desktop.yml`.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, final newline, two-space indentation; Rust uses four spaces. ESLint enforces recommended TypeScript and React Hooks rules, while `rustfmt` formats Rust. Use `PascalCase` for React components and TypeScript types, `camelCase` for functions and variables, and `snake_case` for Rust modules and functions. Keep Tauri transport code thin; business rules belong in the domain or application layers.

## Testing Guidelines

Frontend tests use Vitest, jsdom, and Testing Library. Name tests after the module (`reducer.test.ts`) and test observable behavior, including failure and edge cases. Rust tests should live near their module; environment-dependent OpenSSH scenarios may remain `#[ignore]` and must document how to run them. Add regression coverage for changes to authentication, host-key handling, persistence, layouts, or transfers.

Match verification effort to risk. During development, run focused tests, lint, or type checking; use `pnpm check` before integration. Routine code and documentation edits do not require a desktop package build.

## Commit & Pull Request Guidelines

History follows Conventional Commits, primarily `feat: ...`; use imperative subjects such as `fix: reject changed host keys`. Keep commits focused and commit dependency lockfiles. Pull requests should explain behavior, security or migration impact, linked issues/specs, and verification. Include screenshots or recordings for UI changes.
