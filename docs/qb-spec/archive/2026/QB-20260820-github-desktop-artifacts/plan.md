---
id: QB-20260820-github-desktop-artifacts
status: archived
archived: 2026-09-02
legacy: true
---
# GitHub Desktop Artifacts Plan

## Background

The repository already uses GitHub Actions for quality checks and no-bundle desktop compilation. The requested change replaces an uncommitted Gitea packaging workflow with GitHub-hosted native bundle builds. Packaging crosses CI and native SDK boundaries, so this uses a Strict plan.

## Requirement

Provide a reproducible, build-only GitHub Actions workflow for macOS ARM64, Windows x64, and Linux x64, and remove the superseded Gitea workflow.

## Non-Goals

- GitHub Release publication, deployment, signing, and notarization.
- Product-code, dependency, or bundle-configuration changes.
- Replacement of the existing quality and no-bundle CI checks.

## Architecture Impact

Removes the temporary `.gitea/workflows/` boundary and adds a packaging entrypoint under the existing `.github/workflows/` automation boundary. Runtime frontend and Rust layers remain unchanged.

## Domain Model Impact

None.

## API Impact

None. The workflow uses the GitHub artifact service and a read-only `GITHUB_TOKEN` checkout.

## Database Impact

None.

## Implementation Tasks

1. Remove the Gitea workflow and its superseded task documentation.
2. Define GitHub manual and version-tag triggers plus read-only token permissions.
3. Add a native build matrix for macOS ARM64, Windows x64, and Linux x64.
4. Install pinned Node, pnpm, Rust targets, lockfile dependencies, and Linux packaging prerequisites.
5. Build explicit Tauri targets and upload non-empty, SHA-addressed artifacts.
6. Update the Directory Map to reflect the final automation boundary.

## Acceptance To Verification

- Gitea removal: filesystem assertion and repository search.
- GitHub triggers and native matrix: YAML parse plus structural assertions.
- Correct architectures: assertions for runner labels, all three target triples, architecture checks, and bundle paths.
- Reproducibility: assertions for pinned versions, `--frozen-lockfile`, read-only permissions, and `persist-credentials: false`.
- Artifact availability: assertion for `upload-artifact@v7`, unique SHA names, and `if-no-files-found: error`.
- Repository integrity: `pnpm check`, focused text integrity checks, and `git diff --check`.
- Native packaging: final GitHub Actions run; unavailable during local verification.

## Test Plan

- Parse `.github/workflows/ci.yml` and `.github/workflows/build-desktop.yml` with the installed YAML package.
- Run focused Node assertions over the packaging workflow.
- Search for remaining Gitea workflow references, unresolved template markers, and suspicious credential literals.
- Run `pnpm check`.
- Run `git diff --check`.

## Rollback Plan

Remove `.github/workflows/build-desktop.yml` and the GitHub task-specific qb-spec files. Restore the Gitea workflow and its documentation only if the repository returns to self-hosted Gitea runners. No runtime or persisted user data is affected.

## Risks

- GitHub-hosted runner labels and preinstalled software evolve; pinned OS labels and explicit toolchain setup reduce but do not eliminate this risk.
- Unsigned macOS and Windows bundles may display platform trust warnings and are not production-distribution-ready.
- Artifact retention is limited to 14 days; durable releases require a separate GitHub Release publication step.
- Native packaging cannot be fully validated without executing the workflow on GitHub-hosted runners.

## Documentation Updates

- Replace the Gitea task spec and plan with GitHub-specific versions.
- Update `docs/qb-spec/DIRECTORY_MAP.md` to remove `.gitea/` and identify `.github/workflows/build-desktop.yml`.
