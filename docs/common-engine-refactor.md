# Waseda-first Vocabulary Engine refactor

## Goal

Refactor the existing Waseda Singapore vocabulary production app into a school-neutral engine **before** extracting/reusing the common pieces for Rikkyo.

The current Waseda production behavior is the source of truth. This refactor must not require existing learners to reset, re-import, change URL, or lose local/cloud progress.

## Production baseline

- Repository: `FYam8/english-vocab`
- Baseline branch: `main`
- Baseline commit: `531d505c19a86eaa2c8bbc4b25179de8089ab585`
- Existing storage schema contract: `SCHEMA_VERSION=7`
- Existing local state key: `waseshibu_vocab_state`
- Existing active-session key: `waseshibu_vocab_active_session_v1`
- Existing cloud adapter: `progress-sync.js`

The baseline remains the compatibility target until the refactor is merged.

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

3. **Parity validation**
   - Run existing browser/content QA twice.
   - Verify old localStorage fixtures still load and continue learning.
   - Verify no destructive storage operations are introduced.
   - Verify Waseda dataset/content is unchanged unless a separate content change is explicitly approved.

4. **Merge the refactor to Waseda production**
   - Only after parity gates pass.
   - This merge changes implementation structure, not learner-visible behavior or persistence semantics.

5. **Extract the common engine**
   - Only after Waseda production is successfully running on the internal engine boundary.
   - Extract only school-neutral code to the shared engine artifact/repository.
   - Do not extract Waseda storage identifiers, cloud sync, branding, source metadata, or Waseda dataset.

6. **Adopt from Rikkyo**
   - Rikkyo consumes the extracted engine with its own adapter, dataset, stable IDs, persistence namespace, and release policy.

## Non-negotiable Waseda compatibility invariants

The initial engine refactor must preserve all of the following:

- Same public URL behavior.
- Same `SCHEMA_VERSION=7` until a separately reviewed storage migration is intentionally introduced.
- Same `waseshibu_vocab_state` localStorage key.
- Same `waseshibu_vocab_active_session_v1` active-session key.
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

The branch `refactor/waseda-common-engine-v1` is a compatibility refactor branch. It must not be merged to `main` until the existing-user protection gate and two-pass browser/content QA pass against the refactored build.
