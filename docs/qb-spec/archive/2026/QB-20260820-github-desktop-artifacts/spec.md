---
id: QB-20260820-github-desktop-artifacts
status: archived
archived: 2026-09-02
legacy: true
---
# GitHub Desktop Artifacts

## Goal

GitHub Actions can reproducibly build downloadable Terminal Demo desktop artifacts for macOS ARM64, Windows x64, and Linux x64 from the same triggering commit.

## Scope

- Remove the superseded Gitea desktop build workflow.
- Add a GitHub Actions workflow triggered manually or by a `v*` tag.
- Build the configured Tauri bundles on GitHub-hosted native runners for the three requested platform and architecture pairs.
- Upload each platform's bundle directory as a commit-addressed workflow artifact.
- Preserve the existing `.github/workflows/ci.yml` quality and cross-platform executable checks.
- Update the Directory Map to identify the GitHub artifact workflow as the packaging entrypoint.

## Constraints

- Use Node 22.22.2, pnpm 11.0.8, Rust 1.97.1, and the committed lockfiles.
- Use read-only repository contents permission and do not persist checkout credentials.
- Use `macos-15` for Apple Silicon, `windows-2025` for Windows x64, and `ubuntu-22.04` for Linux x64.
- Explicitly target `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`, and `x86_64-unknown-linux-gnu`.
- Fail artifact upload when no bundle files were produced.

## Non-Goals

- Do not publish a GitHub Release, deploy an application, or upload to an app store/package registry.
- Do not add code signing, Apple notarization, or Windows signing credentials.
- Do not change product code, dependencies, or Tauri bundle configuration.
- Do not remove the existing CI executable-build matrix.

## Acceptance

- No Gitea workflow remains in the repository.
- A manual run and a `v*` tag schedule three GitHub-hosted native builds.
- The matrix maps each requested target triple to the correct runner architecture and bundle path.
- Every job installs locked frontend dependencies and uses the pinned Rust toolchain.
- Every successful matrix entry uploads a non-empty, platform-specific artifact named with the full commit SHA.
- Existing GitHub CI remains unchanged.

## Acceptance To Verification

- Assert that `.gitea/workflows/build-desktop.yml` is absent.
- Parse both GitHub workflows as YAML and inspect triggers, permissions, matrix entries, runner labels, target triples, and artifact paths.
- Search the new workflow for lockfile installation, pinned tool versions, non-persisted credentials, and non-empty artifact enforcement.
- Run `pnpm check` as the repository integration gate.
- Run `git diff --check` and focused final-newline/trailing-whitespace checks.
- Treat an actual GitHub Actions run as the final native packaging integration check.

## Open Questions

- Signing and notarization remain future release-hardening work.
- A later task may add a release aggregation job for `v*` tags.

## Recommended Approach

Keep daily quality/executable checks in the existing CI workflow and add a separate packaging workflow for manual and version-tag runs. This avoids redundant full installer builds on every commit while making downloadable artifacts available when requested.

Alternative considered: extending `ci.yml` to build bundles on every push is simpler in file count but consumes substantially more macOS and Windows runner time and mixes validation with release packaging.

## Next Skills

- `writing-qb-plans`: strict CI/infrastructure plan.
- `verifying-before-completion`: YAML, repository, and patch verification.
- `updating-directory-map`: remove the superseded `.gitea/` boundary and record the GitHub packaging entrypoint.
- Project Context: not needed; this is a task-specific automation change.
- Architecture boundary review: not needed; runtime module responsibilities do not change.
- Critical behavior protection: not needed; workflow assertions and the repository quality gate cover this configuration-only change.
