# Common-engine refactor checkpoints

## Checkpoint A — mechanical source handoff

Completed on the refactor branch.

- The reviewed production `index.html` was split mechanically into source-owned sections.
- Reassembly was proven byte-for-byte identical to the reviewed Waseda production artifact before semantic changes began.
- The split source is now the authoritative editable input; `index.html` is assembled deterministically from it.
- The bootstrap-from-production workflow is manual-only after this handoff so later source refactors cannot be silently overwritten from `index.html`.

## Checkpoint B — first Waseda-only adapter boundary

Validated on the refactor branch.

The production persistence constants now sit behind an explicit Waseda configuration object while preserving their exact runtime values:

```js
const WASEDA_APP_CONFIG=Object.freeze({schemaVersion:7,storageKey:"waseshibu_vocab_state"});
const SCHEMA_VERSION=WASEDA_APP_CONFIG.schemaVersion;
const STORAGE_KEY=WASEDA_APP_CONFIG.storageKey;
```

This is intentionally a very small first semantic refactor. It does not change the schema number, localStorage key, vocabulary IDs, learning state format, scheduler behavior, public URL, or cloud adapter.

Validation completed with deterministic source assembly, the existing-user static gates, unchanged `progress-sync.js`, the cloud-contract guard, the adapted browser/content regression suite, the v7.6 memory-curve suite, and the dedicated persistence-contract suite. Both parity passes completed successfully.

## Checkpoint C — safety audit hardening before deeper adapter extraction

Validated on both the refactor branch head and the synthetic PR merge result.

The audit found and closed several paths that could have weakened the Waseda-user safety guarantee later in the refactor:

- **Source ownership drift:** after the source handoff, the old cloud-loader maintenance path could still edit generated `index.html` directly. The cloud-loader patch is now source-aware: when the source manifest exists it updates the source-owned suffix and deterministically reassembles the artifact. The cloud deploy workflow commits source + manifest + generated artifact together.
- **Legacy patch bypass:** the historical v7.5 and v7.6 direct-index patch scripts now refuse to run once the source-owned manifest exists. This prevents a maintenance workflow from silently bypassing the engine/adapter source tree.
- **Historical learner states:** a dedicated browser test now seeds schema versions 1 through 6, confirms boot is non-destructive, confirms migration to schema 7 on explicit save, and specifically verifies the historical `according` → `according to` fixed-ID merge does not reduce objective progress.
- **Direct production-baseline comparison:** CI now serves the reviewed production baseline and the refactored artifact side-by-side with a fixed clock and deterministic randomness, then compares data, mode/year pools, session plans, migration output, and representative memory-scheduler behavior.
- **Real cloud-adapter integration without production traffic:** a separate isolated browser run loads the real, unchanged `progress-sync.js`, redirects its API base to a mocked endpoint, verifies registration/control/snapshot/event flow, and confirms the cloud adapter does not modify the learner's local state or upload raw `recentResults`.
- **Merge-result validation:** the compatibility workflow runs for pull requests targeting `main`, so the synthetic merge result is tested as well as the branch head.

The latest branch-head run and PR merge-result run both completed the full two-pass suite successfully after these additions.

## Manual production-safety blocker

The refactor is still **draft-only and not merge-eligible**.

Production `main` currently has no branch protection/ruleset. Before this PR may leave draft status, production must be configured so a direct push cannot bypass the compatibility gate. The merge rule must require the compatibility checks for the exact current head/merge result. If an Actions-generated assembly commit becomes the latest PR head, it must not be treated as implicitly validated merely because the preceding source commit passed; the exact final artifact/head must receive an explicit compatibility run before merge.

## Next extraction step

Move direct persistence I/O and Waseda-specific persistence policy behind the Waseda adapter in small, independently validated changes:

1. add the active-session key/format to the Waseda persistence configuration without changing their values;
2. route main-state and active-session localStorage access through adapter functions while preserving byte-level stored payload semantics;
3. move Waseda historical schema/ID migration policy out of the engine candidate and into the Waseda persistence adapter;
4. rerun branch-head and PR-merge two-pass suites, including baseline differential, historical migration, real-cloud integration and current persistence-contract tests after each step;
5. only after these boundaries are stable, flatten the v7.5/v7.6 compatibility overrides into canonical engine behavior.

The common engine must not be extracted for Rikkyo while Waseda-specific migration/session policy still lives inside the engine-candidate or compatibility runtime.
