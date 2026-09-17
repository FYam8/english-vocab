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

## Checkpoint E — v7.5 compatibility runtime mechanically decomposed

Completed without changing the assembled browser artifact.

The old v7.5 compatibility block is now source-owned as four consecutive parts:

- `30-compat-runtime.js`: v7.5 prelude/configuration and routing overrides;
- `31-waseda-session-runtime.js`: active-session serialization, restore, outcome idempotency and recovery behavior;
- `32-session-planning-runtime.js`: weighted selection, challenge-plan construction and session queue traversal;
- `33-v75-ui-runtime.js`: remaining v7.5 question/UI/content behavior.

The split is mechanical. Reviewed function boundaries are used as cut points and the split tool first proves that concatenating all four parts reproduces the previous v7.5 byte stream. Separator newlines are assigned to the following part so source files remain `git diff --check` clean without changing the assembled bytes.

## Checkpoint F — v7.6 runtime mechanically decomposed

Completed without changing scheduler semantics or the assembled browser artifact.

The reviewed v7.6 block is now source-owned as three consecutive parts:

- `35-v76-memory-runtime.js`: memory-model and forgetting-curve core calculations;
- `36-v76-engine-integration.js`: outcome/scheduler/challenge/import integration overrides;
- `37-v76-waseda-ui-runtime.js`: Waseda memory-detail UI, exam-date settings and init integration.

The final bootstrap/export/init tail remains in `40-runtime-bootstrap-tail.js`. The assembly manifest still reports the same generated artifact SHA-256, `f46c304560446c8d8a8b321fe2097d800c9eb5660c36d22382ce309fb83e8360`, after the v7.5 and v7.6 mechanical decompositions. This means these checkpoints changed source ownership only; the browser-delivered artifact stayed byte-identical to the already-reviewed refactor artifact.

A dedicated compatibility ownership guard now evaluates the decomposed parts together, while also checking the individual reviewed boundaries. This prevents raw Waseda persistence identifiers from leaking back into executable engine/compatibility code and prevents a partial split from being treated as valid.

## Checkpoint G — first school-neutral helper promoted into the engine candidate

The first semantic source move is intentionally limited to a single reviewed helper: `v75WeightedWithoutReplacement`.

Before the move, an explicit extraction-readiness contract was added. It classifies helpers as either immediately school-neutral, policy-injection-required, or Waseda-owned, and rejects supposedly neutral helpers if they contain persistence identifiers, branding, score-band policy, `priority`, `studyLayer`, exam-date policy, Waseda data globals, or learner/session globals.

`v75WeightedWithoutReplacement` passed that gate because its implementation depends only on its arguments, `Math.random`, item IDs, and the generic `weightedChoice` helper. Its name and function body were not changed. The definition was moved from `32-session-planning-runtime.js` into `20-engine-candidate.js`; all Waseda-specific challenge scoring, Japanese foundation-reason text, `75`-mode policy and session-state behavior remain in the policy/runtime side.

This source move necessarily changes the assembled byte order, so the generated artifact hash changed to `cf8b5078bc6e7ab09113464025857e49cb7c5a5e8d31a514d5733ab301f3c1b7`. The move is not considered safe merely because the function body is unchanged: the exact assembled head must pass the same full branch-head and synthetic PR-merge two-pass parity suites before any further helper is promoted.

No second helper is to be promoted until that exact-head validation is green.

## Manual production-safety blocker

The refactor is still **draft-only and not merge-eligible**.

Production `main` currently has no branch protection/ruleset. Before this PR may leave draft status, production must be configured so a direct push cannot bypass the compatibility gate. The merge rule must require the compatibility checks for the exact current head/merge result. If an Actions-generated assembly commit becomes the latest PR head, it must not be treated as implicitly validated merely because the preceding source commit passed; the exact final artifact/head must receive an explicit compatibility run before merge.

## Next extraction step

The first pure helper promotion is now isolated behind a machine-readable readiness contract. The next phase remains intentionally conservative:

1. complete exact-head branch and synthetic-merge validation for the first helper promotion;
2. do not move `v75ChallengeScore`, `buildChallengeSessionPlan`, `buildSessionPlan`, retry/session functions, `v76TargetRetention`, `v76UpdateMemoryAfterOutcome`, scheduler overrides, exam-date logic or UI functions into the common engine without first introducing explicit policy injection;
3. after the first promotion has passed all gates, review the remaining pure numeric v7.6 helpers individually rather than moving the entire memory runtime as a block;
4. keep Waseda active-session policy, branding/data metadata, UI wording and cloud integration outside the common engine;
5. only after the compatibility-only override structure has been flattened and the Waseda production app has passed live existing-user smoke testing may a school-neutral shared engine be extracted for Rikkyo.

The common engine must not be extracted for Rikkyo while Waseda-specific session/persistence/policy behavior still contaminates the engine boundary.
