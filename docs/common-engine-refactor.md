# Waseda-first Vocabulary Engine refactor

## Goal

Refactor the existing Waseda Singapore vocabulary production app into a school-neutral engine **before** extracting/reusing the common pieces for Rikkyo.

The current Waseda production behavior is the source of truth. This refactor must not require existing learners to reset, re-import, change URL, or lose local/cloud progress.

## Production baseline

- Repository: `FYam8/english-vocab`
- Baseline branch: `main`
- Baseline commit: `531d505c19a86eaa2c8bbc4b25179de8089ab585`
- Baseline data version: `2019-2026-v7.6-memory-curve-scheduler`
- Existing storage schema contract: `SCHEMA_VERSION=7`
- Existing local state key: `waseshibu_vocab_state`
- Existing active-session key: `waseshibu_vocab_active_session_v1`
- Existing cloud adapter: `progress-sync.js`
- Existing memory-curve behavior: v7.6 lazy `memoryModel`, target-retention rules, lapse/retry scheduling and exam-date UI

The baseline remains the compatibility target until the refactor is merged. A compatibility test that expects the older v7.5 data version is stale and must be adapted to the v7.6 production baseline; old v7.5 fixtures remain useful only where they intentionally test upgrade/import compatibility.

### Baseline drift rule

The compatibility branch is valid only while Waseda production `main` still points to the reviewed baseline commit above. CI must stop if `main` moves. If production changes for any reason while this refactor is in progress, do not silently continue and do not merely update the expected SHA: review the intervening production commits, rebase the refactor, rerun the full compatibility suite, and explicitly establish a new baseline.

## First-refactor delivery shape

The first production engine refactor changes **source structure and internal boundaries**, not the browser delivery model.

- Keep the Waseda production page self-contained for the app UI/engine code, except for the already-existing `progress-sync.js` loader.
- Do not introduce a new cross-repository, CDN, dynamic-import, or runtime package dependency in this first refactor.
- Split engine / Waseda adapter / Waseda data at source/build time, then deterministically assemble the production `index.html` so browser load ordering remains equivalent to the current app.
- Keep only one editable source of truth for each code/data section. The generated `index.html` must not become an independently hand-maintained second implementation.
- The assembly step must be idempotent, and CI must fail if rebuilding changes a supposedly up-to-date production artifact.
- `progress-sync.js` stays external exactly as it is today and is not absorbed into the engine bundle.

This avoids creating new cache/load-order/partial-deploy failure modes for current Waseda learners while still making the production implementation internally engine-based.

## Refactor order

1. **Boundary first, no behavior change**
   - Identify school-neutral UI/learning/scheduler functions.
   - Identify Waseda-only dataset, branding, source metadata, storage keys, and cloud sync.
   - Introduce explicit engine/adapter boundaries without changing learner-visible behavior.

2. **Internal modularization inside the Waseda repository**
   - Move common code behind a stable engine contract.
   - Keep Waseda-specific configuration/data behind a Waseda adapter.
   - Keep `progress-sync.js` Waseda-only and outside the common engine.
   - Keep production URL and persistence contract unchanged.
   - Keep the first production artifact runtime-equivalent to the current single-page delivery shape.

3. **Parity validation before merge**
   - Run the production v7.5 browser/content regression suite adapted to the v7.6 data-version baseline twice.
   - Run the v7.6 memory-curve regression suite twice.
   - Verify old localStorage fixtures still load and continue learning.
   - Verify no destructive storage operations are introduced.
   - Verify Waseda dataset/content is unchanged unless a separate content change is explicitly approved.
   - Verify the Waseda cloud adapter is byte-for-byte unchanged from the production baseline during this boundary refactor.
   - Validate the cloud adapter contract separately from local browser QA; local parity tests must not call the production progress API.
   - Verify the generated production artifact is reproducible/idempotent once the source split is introduced.

4. **Merge the refactor to Waseda production**
   - Only after all pre-merge parity gates pass twice.
   - This merge changes implementation structure, not learner-visible behavior or persistence semantics.

5. **Post-deploy Waseda verification**
   - Treat deployment success as a separate gate from merge/CI success.
   - Verify the actual public Waseda URL after deployment using an existing-user local-state fixture in an isolated browser profile.
   - Confirm the fixture is not reset or rewritten on load, fixed vocabulary IDs remain addressable, the app can continue a study interaction, and the production version/branding are correct.
   - Do not generate real learner/cloud records during smoke testing; isolate or mock the progress API while separately checking the unchanged production cloud adapter contract.
   - If live verification fails, revert the refactor merge. Because persistence identifiers and schema are deliberately unchanged, rollback must not require deleting or transforming learner history.

6. **Extract the common engine**
   - Only after Waseda production has passed the post-deploy verification and is successfully running on the internal engine boundary.
   - Extract only school-neutral code to the shared engine artifact/repository.
   - Do not extract Waseda storage identifiers, cloud sync, branding, source metadata, or Waseda dataset.

7. **Adopt from Rikkyo**
   - Rikkyo consumes the extracted engine with its own adapter, dataset, stable IDs, persistence namespace, and release policy.

## Non-negotiable Waseda compatibility invariants

The initial engine refactor must preserve all of the following:

- Same public URL behavior.
- Same `SCHEMA_VERSION=7` until a separately reviewed storage migration is intentionally introduced.
- Same `waseshibu_vocab_state` localStorage key.
- Same `waseshibu_vocab_active_session_v1` active-session key.
- Same production data semantics as v7.6, including lazy memory-model initialization and scheduler behavior.
- No `localStorage.clear()`.
- No `localStorage.removeItem(STORAGE_KEY)`.
- Existing fixed vocabulary IDs remain unchanged.
- Existing mastery/history migration continues to work.
- Existing `progress-sync.js` contract remains Waseda-only and unchanged during the engine-boundary refactor.
- Existing users must not need to export/import or restart their learning history.

## Engine vs adapter boundary

### Common engine candidates

- View/navigation state machine.
- Question selection and session orchestration.
- Mastery/evidence evaluation.
- Review scheduling policy that does not contain school-specific constants.
- Question type rendering and grading.
- Audio/voice UI.
- Statistics rendering logic.
- Search/filter/list rendering primitives.
- Generic backup/export hooks (not school-specific identifiers).

### Waseda adapter/data (must stay outside the common engine)

- App/brand strings such as `早稲渋 Vocabulary Coach`.
- Waseda dataset (`VOCAB`, exam examples, evidence/source metadata).
- Waseda year/source lists and exam-specific labels.
- Storage namespace and migration identifiers.
- `progress-sync.js`, Waseda progress API endpoint, and cloud `APP_ID`.
- Waseda-specific release/data version strings.

## Release rule

The branch `refactor/waseda-common-engine-v1` is a compatibility refactor branch. It must not be merged to `main` until the production baseline has not drifted and the existing-user protection gate, the adapted browser/content suite, and the v7.6 memory-curve suite all pass twice against the refactored build. The shared engine must not be extracted for Rikkyo until the merged Waseda build also passes the separate post-deploy verification on the real public URL.
