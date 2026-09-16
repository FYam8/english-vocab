from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "waseda-bootstrap"
PERSISTENCE = SRC / "15-waseda-persistence.js"
ENGINE = SRC / "20-engine-candidate.js"
COMPAT_PRELUDE = SRC / "30-compat-runtime.js"
SESSION_RUNTIME = SRC / "31-waseda-session-runtime.js"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one legacy form, found {text.count(old)}")
    return text.replace(old, new, 1)


def main() -> None:
    persistence = PERSISTENCE.read_text(encoding="utf-8")
    engine = ENGINE.read_text(encoding="utf-8")
    compat_prelude = COMPAT_PRELUDE.read_text(encoding="utf-8")
    session_path = SESSION_RUNTIME if SESSION_RUNTIME.is_file() else COMPAT_PRELUDE
    session_runtime = session_path.read_text(encoding="utf-8")

    required_config = [
        'schemaVersion:7',
        'storageKey:"waseshibu_vocab_state"',
        'activeSessionKey:"waseshibu_vocab_active_session_v1"',
        'activeSessionFormatVersion:1',
    ]
    for needle in required_config:
        if needle not in persistence:
            raise SystemExit(f"Waseda persistence config missing: {needle}")

    adapter_anchor = 'const STORAGE_KEY=WASEDA_APP_CONFIG.storageKey;\n'
    adapter_block = (
        adapter_anchor
        + 'function wasedaStorageGet(key){return localStorage.getItem(key)}\n'
        + 'function wasedaStorageSet(key,value){localStorage.setItem(key,value)}\n'
        + 'function wasedaStorageRemove(key){localStorage.removeItem(key)}\n'
    )
    if 'function wasedaStorageGet(key)' not in persistence:
        if persistence.count(adapter_anchor) != 1:
            raise SystemExit("Waseda persistence adapter anchor is not unique")
        persistence = persistence.replace(adapter_anchor, adapter_block, 1)

    engine = replace_once(
        engine,
        'const raw=localStorage.getItem(STORAGE_KEY);',
        'const raw=wasedaStorageGet(STORAGE_KEY);',
        'main-state load adapter',
    )
    engine = replace_once(
        engine,
        'try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}',
        'try{wasedaStorageSet(STORAGE_KEY,JSON.stringify(state))}',
        'main-state save adapter',
    )

    compat_prelude = replace_once(
        compat_prelude,
        'const V75_ACTIVE_SESSION_KEY="waseshibu_vocab_active_session_v1";',
        'const V75_ACTIVE_SESSION_KEY=WASEDA_APP_CONFIG.activeSessionKey;',
        'active-session key adapter',
    )
    compat_prelude = replace_once(
        compat_prelude,
        'const V75_SESSION_FORMAT_VERSION=1;',
        'const V75_SESSION_FORMAT_VERSION=WASEDA_APP_CONFIG.activeSessionFormatVersion;',
        'active-session format adapter',
    )

    session_runtime = replace_once(
        session_runtime,
        'try{localStorage.setItem(V75_ACTIVE_SESSION_KEY,JSON.stringify(v75SerializableSession()))}',
        'try{wasedaStorageSet(V75_ACTIVE_SESSION_KEY,JSON.stringify(v75SerializableSession()))}',
        'active-session save adapter',
    )
    session_runtime = replace_once(
        session_runtime,
        'try{localStorage.removeItem(V75_ACTIVE_SESSION_KEY)}',
        'try{wasedaStorageRemove(V75_ACTIVE_SESSION_KEY)}',
        'active-session clear adapter',
    )
    session_runtime = replace_once(
        session_runtime,
        'const raw=localStorage.getItem(V75_ACTIVE_SESSION_KEY);',
        'const raw=wasedaStorageGet(V75_ACTIVE_SESSION_KEY);',
        'active-session load adapter',
    )

    # The schema/ID migration policy is Waseda-specific. Move the exact existing
    # function body into the Waseda persistence adapter, leaving only a generic
    # engine delegation point. No migration rule is rewritten in this step.
    migration_wrapper = 'function migrate(raw){return wasedaMigrateState(raw)}\n'
    if 'function wasedaMigrateState(raw){' not in persistence:
        start_marker = 'function migrate(raw){\n'
        end_marker = 'function loadState(){\n'
        if engine.count(start_marker) != 1 or engine.count(end_marker) != 1:
            raise SystemExit("Could not identify a unique Waseda migration block")
        start = engine.index(start_marker)
        end = engine.index(end_marker, start)
        migration = engine[start:end]
        required_migration_markers = [
            's.schemaVersion=2;v=2;',
            's.schemaVersion=6;v=6;',
            'const oldId="w3186341920",newId="p0431020501";',
            's.schemaVersion=7;v=7;',
            's.words[id]=Object.assign(defaultProgress(),p);',
        ]
        for needle in required_migration_markers:
            if needle not in migration:
                raise SystemExit(f"Waseda migration block missing reviewed rule: {needle}")
        migration = migration.replace('function migrate(raw){', 'function wasedaMigrateState(raw){', 1)
        persistence = persistence.rstrip() + '\n\n' + migration.rstrip() + '\n'
        engine = engine[:start] + migration_wrapper + engine[end:]
    else:
        if migration_wrapper not in engine:
            raise SystemExit("Waseda migration adapter exists but engine delegation wrapper is missing")

    if 'localStorage.getItem(STORAGE_KEY)' in engine or 'localStorage.setItem(STORAGE_KEY' in engine:
        raise SystemExit("main-state storage still bypasses Waseda persistence adapter")
    combined_session_sources = compat_prelude if session_path == COMPAT_PRELUDE else compat_prelude + session_runtime
    for forbidden in [
        'localStorage.getItem(V75_ACTIVE_SESSION_KEY)',
        'localStorage.setItem(V75_ACTIVE_SESSION_KEY',
        'localStorage.removeItem(V75_ACTIVE_SESSION_KEY)',
    ]:
        if forbidden in combined_session_sources:
            raise SystemExit(f"active-session storage still bypasses adapter: {forbidden}")

    if 'const oldId="w3186341920",newId="p0431020501";' in engine:
        raise SystemExit("Waseda fixed-ID migration policy still lives in engine candidate")
    for required in [
        'function wasedaMigrateState(raw){',
        'const oldId="w3186341920",newId="p0431020501";',
        's.schemaVersion=7;v=7;',
    ]:
        if required not in persistence:
            raise SystemExit(f"Waseda persistence adapter lost migration rule: {required}")

    PERSISTENCE.write_text(persistence, encoding="utf-8")
    ENGINE.write_text(engine, encoding="utf-8")
    COMPAT_PRELUDE.write_text(compat_prelude, encoding="utf-8")
    if session_path == SESSION_RUNTIME:
        SESSION_RUNTIME.write_text(session_runtime, encoding="utf-8")
    else:
        COMPAT_PRELUDE.write_text(session_runtime, encoding="utf-8")
    print("Waseda persistence boundary transform: PASS")


if __name__ == "__main__":
    main()
