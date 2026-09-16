# Common-engine refactor checkpoints

## Checkpoint A — mechanical source handoff

Completed on the refactor branch.

- The reviewed production `index.html` was split mechanically into source-owned sections.
- Reassembly was proven byte-for-byte identical to the reviewed Waseda production artifact before semantic changes began.
- The split source is now the authoritative editable input; `index.html` is assembled deterministically from it.
- The bootstrap-from-production workflow is manual-only after this handoff so later source refactors cannot be silently overwritten from `index.html`.

## Checkpoint B — first Waseda-only adapter boundary

Validated on the refactor branch.

The production persistence identifiers sit behind an explicit Waseda configuration object while preserving their exact runtime values:

```js
const WASEDA_APP_CONFIG=Object.freeze({
  schemaVersion:7,
  storageKey:"waseshibu_vocab_state",
  activeSessionKey:"waseshibu_vocab_active_session_v1",
  activeSessionFormatVersion:1
});
const SCHEMA_VERSION=WASEDA_APP_CONFIG.schemaVersion;
const STORAGE_KEY=WASEDA_APP_CONFIG.storageKey;
```

This does not change the schema number, localStorage keys, active-session format, vocabulary IDs, learning state format, scheduler behavior, public URL, or cloud adapter.

Validation completed with deterministic source assembly, the existing-user static gates, unchanged `progress-sync.js`, the cloud-contract guard, the adapted browser/content regression suite, the v7.6 memory-curve suite, and the dedicated persistence-contract suite. Both parity passes completed successfully.

## Checkpoint C — safety audit hardening before deeper adapter extraction

Validated on both the refactor branch head and the synthetic PR merge result.

The audit found and closed several paths that could have weakened the Waseda-user safety guarantee later in the refactor:

- **Source ownership drift:** after the source handoff, the old cloud-loader maintenance path could still edit generated `index.html` directly. The cloud-loader patch is now source-aware: when the source manifest exists it updates the source-owned suffix and deterministically reassembles the artifact. The cloud deploy workflow commits source + manifest + generated artifact together.
- **Legacy patch bypass:** the historical v7.5 and v7.6 direct-index patch scripts now refuse to run once the source-owned manifest exists. This prevents a maintenance workflow from silently bypassing the engine/adapter source tree.
- **Historical learner states:** a dedicated browser test seeds schema versions 1 through 6, confirms boot is non-destructive, confirms migration to schema 7 on explicit save, and specifically verifies the historical `according` → `according to` fixed-ID merge does not reduce objective progress.
- **Direct production-baseline comparison:** CI serves the reviewed production baseline and the refactored artifact side-by-side with a fixed clock and deterministic randomness, then compares data, mode/year pools, session plans, migration output, and representative memory-scheduler behavior.
- **Real cloud-adapter integration without production traffic:** a separate isolated browser run loads the real, unchanged `progress-sync.js`, redirects its API base to a mocked endpoint, verifies registration/control/snapshot/event flow, and confirms the cloud adapter does not modify the learner's local state or upload raw `recentResults`.
- **Merge-result validation:** the compatibility workflow runs for pull requests targeting `main`, so the synthetic merge result is tested as well as the branch head.

The branch-head and PR merge-result runs completed the full two-pass suite successfully after these additions.

## Checkpoint D — Waseda persistence policy moved behind the adapter

Completed and validated on the refactor branch.

The next persistence boundary has now been implemented without changing learner-facing storage semantics:

- `waseshibu_vocab_state` remains the main-state key and schema remains `7`.
- `waseshibu_vocab_active_session_v1` remains the active-session key and its format version remains `1`.
- Main-state reads/writes now go through `wasedaStorageGet` / `wasedaStorageSet`.
- Active-session reads/writes/removal now go through the same Waseda persistence adapter functions.
- The main learning-state key is never removed through the adapter; CI explicitly forbids `wasedaStorageRemove(STORAGE_KEY)`.
- The exact historical v1→v7 schema migration and fixed-ID migration policy was moved out of the engine candidate into `wasedaMigrateState` in the Waseda persistence adapter. The engine now delegates through `migrate(raw) -> wasedaMigrateState(raw)`.
- The historical `according` → `according to` merge rule remains unchanged and is still covered by the legacy-migration browser test.

The source-owned transformation is idempotent, the generated artifact remains deterministic, and the branch-head plus synthetic PR merge-result both passed the full two-pass suite after the I/O boundary was introduced. The migration-ownership gate was then added and the same two-pass suite passed again.

## Manual production-safety blocker

The refactor is still **draft-only and not merge-eligible**.

Production `main` currently has no branch protection/ruleset. Before this PR may leave draft status, production must be configured so a direct push cannot bypass the compatibility gate. The merge rule must require the compatibility checks for the exact current head/merge result. If an Actions-generated assembly commit becomes the latest PR head, it must not be treated as implicitly validated merely because the preceding source commit passed; the exact final artifact/head must receive an explicit compatibility run before merge.

## Next extraction step

The persistence boundary is now sufficiently separated for the next phase. The next work is to flatten the v7.5/v7.6 compatibility overrides into canonical source-owned engine behavior, but only in small sections and with the same safety discipline:

1. classify every function/override in `30-compat-runtime.js` as school-neutral engine behavior, Waseda adapter policy, or Waseda UI/data behavior;
2. move one coherent school-neutral function group at a time into canonical engine source while preserving execution order and runtime semantics;
3. keep Waseda-only active-session policy, branding/data metadata, and cloud integration outside the common engine;
4. after every move, rerun branch-head and PR-merge two-pass suites, including baseline differential, historical migration, real-cloud integration, active-session restoration and current persistence-contract tests;
5. only after the compatibility layer has been flattened without Waseda-specific leakage may a school-neutral shared engine be extracted for Rikkyo.

The common engine must not be extracted for Rikkyo while Waseda-specific session/persistence policy or compatibility-only override structure still contaminates the engine boundary.
