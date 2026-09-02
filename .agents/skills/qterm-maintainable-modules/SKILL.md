---
name: qterm-maintainable-modules
description: Develop or refactor non-trivial Qterm functionality with ownership-aligned modules, narrow façades, adjacent behavior tests, and the repository source-size ratchet. Use when a change adds a vertical slice, expands an existing hotspot, introduces state or adapter orchestration, or changes module boundaries. Do not use for isolated copy edits or token-only CSS tweaks.
---

# Qterm Maintainable Modules

Keep each change locally understandable. New behavior must have an explicit owner and extension point before it is wired into a stable entry component, command, service, or adapter.

## Required context

Before designing or implementing the change:

1. Read the relevant sections of `docs/qb-spec/DIRECTORY_MAP.md` and any applicable `docs/qb-spec/context/*_SPEC.md` files.
2. Inspect the target file, its direct collaborators, adjacent tests, and `scripts/source-size-baseline.json`.
3. Read [references/module-development-standard.md](references/module-development-standard.md) completely. Use its placement matrix and review checklist for the affected frontend, Rust, style, test, or script surface.

## Workflow

1. Describe the capability in one sentence and name the owner for its rules, orchestration, transport, presentation, and persistence effects. Mark unaffected public contracts and behavioral invariants.
2. Set a growth budget before editing. Run `pnpm check:source-size`; treat a baseline entry as refactoring debt, never as permission to append another responsibility.
3. If the target is already baselined, near its default limit, or owns more than one change reason, create or reuse a semantic extension module first. Keep its existing import path as a narrow façade when callers need stability.
4. Implement one vertical slice through the established layers. Put rules in domain or pure feature models, use-case sequencing in application/controllers, transport mapping in commands or IPC clients, third-party/process/file access in infrastructure, and rendering in presentation components.
5. Keep façade code declarative: construction, dependency wiring, delegation, and page-level composition. Do not hide extracted logic behind generic `utils`, catch-all `helpers`, boolean-heavy universal handlers, or a second state store.
6. Move or add tests with the capability. Group tests by observable behavior and keep shared fixtures test-only; do not preserve a giant test file merely because production code was split.
7. Re-run the size check after the first compiling slice and before completion. Tighten or remove a baseline entry whenever a hotspot shrinks; a ratchet reminder is unfinished maintenance, not ignorable output.
8. Run focused behavior checks, then the tier-appropriate repository gates. Update the Directory Map only when a stable entrypoint or ownership boundary actually changed.

## Stop and reshape when

- the easiest implementation adds another independent state machine, external dependency, parser, mutation family, or large render section to an existing entry file;
- a new module needs broad visibility into its parent, imports through multiple layers, or mostly forwards dozens of parameters;
- tests for the new behavior require unrelated fixtures or cannot be run by capability;
- satisfying the size check would require moving lines without creating a describable owner;
- frontend presentation starts calling Tauri directly, Rust commands gain business decisions, or application/domain imports framework, persistence, process, or SSH implementation types.

When these signals appear, pause implementation long enough to revise the ownership map and plan. Do not silence the checker by raising a limit or adding a new baseline entry unless the user explicitly approves a documented cohesive exception.

## Completion gate

Confirm all of the following:

- a future agent can locate the change from a capability name without reading a mega-file;
- the stable façade and public contract stayed narrow, or an intentional contract change is specified and tested;
- each module has one primary change reason and dependency direction follows the Directory Map;
- behavior, failure, recovery, and concurrency-sensitive invariants affected by the change have adjacent automated protection;
- `pnpm check:source-size` passes with no unaddressed ratchet reminder;
- focused tests and the change-tier verification pass, or exact blockers and residual risks are reported.
