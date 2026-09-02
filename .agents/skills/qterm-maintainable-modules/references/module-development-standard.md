# Qterm Module Development Standard

## Why this standard exists

Recent Qterm modularization work repeatedly found the same failure pattern: a stable entrypoint accumulated new feature branches because adding locally was cheaper than choosing a new owner. Over time, React composition, runtime orchestration, Rust transport, Git/SSH adapters, parsers, mutations, and their tests became coupled in a few high-churn files.

Successful repairs shared four properties:

- callers kept a stable façade while internals moved behind capability names;
- extraction followed ownership and change reasons rather than arbitrary line ranges;
- existing behavior tests moved with the capability and protected compatibility;
- measurable source-size gates prevented the repaired hotspots from growing back.

Line count is a guardrail and discovery signal. It does not replace cohesion, dependency direction, or behavioral evidence.

## Placement matrix

| Concern | Owner | Must not own |
| --- | --- | --- |
| React page or pane entry | Page-level composition, dependency wiring, top-level state connection | Pure rules, direct filesystem/process work, reusable transport semantics |
| Feature controller or hook | Async lifecycle, epoch/intent protection, operation sequencing | JSX-heavy presentation, a second authoritative store, backend rules |
| Feature model | Pure derivation, validation needed for display, closed UI state | Tauri calls, React lifecycle, persistence access |
| Presentation component | Rendering, accessible interaction, feature-local view state | Direct Tauri IPC, persistence, cross-feature session ownership |
| `src/lib/tauri/` | Typed IPC request/response mapping | Product rules, filesystem/process execution, feature state |
| Rust command | DTO validation, state injection, use-case invocation, error mapping | Domain decisions, parsers, repository transactions, protocol loops |
| Rust application | Use-case sequencing, rollback and coordination through ports | Tauri types, JSON records, process/russh details |
| Rust domain | Stable models, invariants, state transitions, input boundaries | Framework, persistence, process, SSH, UI types |
| Rust port | Application-owned external capability contract | Adapter-specific configuration or third-party types |
| Rust infrastructure | Git/SSH/filesystem/persistence implementation details | UI contracts, domain policy, reverse control of application rules |
| CSS manifest | Ordered imports and truly global foundations | Feature selector warehouse |
| Feature CSS | One visual surface and its states/media behavior | New global tokens or unrelated component rules |
| Test module | Observable behavior of one capability | Production helpers, unrelated feature fixtures, implementation-only assertions |
| Repository script | Deterministic development tooling with argument boundaries | Runtime business logic, user-data mutation, shell-string composition |

## Preflight and growth budget

Before coding:

1. Identify the primary file expected to receive the change and count the separate reasons it already changes.
2. Check whether it appears in `scripts/source-size-baseline.json`. A baseline hotspot must not grow.
3. Inspect the limits in `scripts/check-source-size.mjs`; they are the executable source of truth. Do not duplicate or override them in feature specs.
4. Estimate which modules and tests the slice should change. If most behavior lands in one already-large entrypoint, reshape before implementation.
5. Record stable contracts and critical behavior that must not change, especially IPC DTOs, persistence schemas, security boundaries, cleanup order, focus behavior, and stale-result protection.

Prefer extraction before feature growth when any of these apply:

- the file is baselined;
- the new capability introduces a distinct external dependency or lifecycle;
- it adds a separate parser, mutation family, dialog surface, or async state machine;
- the target already mixes composition with rules or transport;
- the change would make focused tests harder to name or run.

Do not create a directory hierarchy for a tiny cohesive helper. A small local function remains appropriate when it shares the same owner, lifecycle, dependencies, and test surface.

## Stable façade pattern

A good façade preserves the path callers already know while exposing a small, capability-oriented surface. It may own construction, shared limits, dependency injection, trait implementation delegation, or page composition. The implementation modules own the work.

A façade is not successful when it:

- re-exports every internal type;
- forwards a wide bag of mutable state through every call;
- contains the same branching logic after helpers were moved;
- creates circular sibling imports;
- uses public visibility only to bypass a boundary.

Use the narrowest Rust visibility that supports composition. In React, pass capability-shaped inputs or controllers rather than the full context object when a child needs only a subset.

## Vertical-slice procedure

For a non-trivial feature:

1. Add or update the pure rule/model and its edge-case tests.
2. Add application/controller orchestration with failure, cancellation, rollback, or stale-result protection where relevant.
3. Implement the infrastructure or IPC adapter behind the existing narrow boundary.
4. Add the presentation and wire it through the stable entrypoint.
5. Run focused tests and the source-size gate before expanding to the next capability.

This is an ownership sequence, not a requirement to manufacture every layer. Skip layers the capability genuinely does not need.

## Tests as part of the boundary

- Name test files/modules after capabilities or behaviors, not after a former mega-file.
- Preserve observable assertions during structural moves; improve coverage in a separate, reviewable step when possible.
- Put reusable fixture construction in test-only modules and keep it narrower than production APIs.
- Cover normal behavior plus the relevant failure, recovery, cancellation, stale-response, security, or rollback path.
- Prefer pure tests below React/Tauri when the rule can be verified without framework setup; keep integration tests for wiring and contracts.
- A split is incomplete if production code is modular but one oversized test file still requires the entire feature context.

## Source-size ratchet rules

`scripts/check-source-size.mjs` and `scripts/source-size-baseline.json` are canonical.

- New source files must remain within their type limit.
- Existing baseline files may stay at or below their recorded ceiling but may not grow.
- When actual size drops below the baseline, lower or remove the entry in the same change.
- Do not move code to an excluded extension or generated-looking location to evade scanning.
- Do not raise a default or baseline limit as a routine implementation step.
- A cohesive exception requires explicit user approval and a written reason covering ownership, alternatives, and a future split trigger.

## Review checklist

### Ownership

- Can each changed module be described with one primary responsibility?
- Is there exactly one authoritative owner for mutable runtime state and transaction/rollback order?
- Are public paths stable where compatibility matters?

### Dependencies

- Do imports follow the frontend and Rust layer directions in the Directory Map?
- Are framework and third-party types contained in their adapters?
- Did the change avoid generic helpers, duplicated models, and circular sibling knowledge?

### Change isolation

- Can the capability be tested and reverted without unrelated feature surgery?
- Did feature growth land in a semantic module instead of the nearest large switch, component, command, or adapter?
- Were adjacent tests and documentation updated with the ownership change?

### Verification

- Does `pnpm check:source-size` pass without ignored ratchet output?
- Do focused behavior tests cover the changed capability and critical neighboring invariants?
- Did the selected qb-spec tier run the necessary lint, typecheck, build, Rust, or integration gates?

