# Common-engine refactor checkpoints

## Checkpoint A — mechanical source handoff

Completed on the refactor branch.

- The reviewed production `index.html` was split mechanically into source-owned sections.
- Reassembly was proven byte-for-byte identical to the reviewed Waseda production artifact before semantic changes began.
- The split source is now the authoritative editable input; `index.html` is assembled deterministically from it.
- The bootstrap-from-production workflow is manual-only after this handoff so later source refactors cannot be silently overwritten from `index.html`.

## Checkpoint B — first Waseda-only adapter boundary

In validation.

The production persistence constants were moved behind an explicit Waseda configuration object while preserving their exact runtime values:

```js
const WASEDA_APP_CONFIG=Object.freeze({schemaVersion:7,storageKey:"waseshibu_vocab_state"});
const SCHEMA_VERSION=WASEDA_APP_CONFIG.schemaVersion;
const STORAGE_KEY=WASEDA_APP_CONFIG.storageKey;
```

This is intentionally a very small first semantic refactor. It does not change the schema number, localStorage key, vocabulary IDs, learning state format, scheduler behavior, public URL, or cloud adapter.

The change is not eligible for `main` until the generated artifact passes the complete existing-user parity, v7.6 memory-curve, persistence-contract, and cloud-contract gates twice. `progress-sync.js` remains Waseda-only and unchanged.
