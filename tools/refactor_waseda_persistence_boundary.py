from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PERSISTENCE = ROOT / "src" / "waseda-bootstrap" / "15-waseda-persistence.js"
ENGINE = ROOT / "src" / "waseda-bootstrap" / "20-engine-candidate.js"
COMPAT = ROOT / "src" / "waseda-bootstrap" / "30-compat-runtime.js"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one legacy form, found {text.count(old)}")
    return text.replace(old, new, 1)


def main() -> None:
    persistence = PERSISTENCE.read_text(encoding="utf-8")
    engine = ENGINE.read_text(encoding="utf-8")
    compat = COMPAT.read_text(encoding="utf-8")

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

    compat = replace_once(
        compat,
        'const V75_ACTIVE_SESSION_KEY="waseshibu_vocab_active_session_v1";',
        'const V75_ACTIVE_SESSION_KEY=WASEDA_APP_CONFIG.activeSessionKey;',
        'active-session key adapter',
    )
    compat = replace_once(
        compat,
        'const V75_SESSION_FORMAT_VERSION=1;',
        'const V75_SESSION_FORMAT_VERSION=WASEDA_APP_CONFIG.activeSessionFormatVersion;',
        'active-session format adapter',
    )
    compat = replace_once(
        compat,
        'try{localStorage.setItem(V75_ACTIVE_SESSION_KEY,JSON.stringify(v75SerializableSession()))}',
        'try{wasedaStorageSet(V75_ACTIVE_SESSION_KEY,JSON.stringify(v75SerializableSession()))}',
        'active-session save adapter',
    )
    compat = replace_once(
        compat,
        'try{localStorage.removeItem(V75_ACTIVE_SESSION_KEY)}',
        'try{wasedaStorageRemove(V75_ACTIVE_SESSION_KEY)}',
        'active-session clear adapter',
    )
    compat = replace_once(
        compat,
        'const raw=localStorage.getItem(V75_ACTIVE_SESSION_KEY);',
        'const raw=wasedaStorageGet(V75_ACTIVE_SESSION_KEY);',
        'active-session load adapter',
    )

    if 'localStorage.getItem(STORAGE_KEY)' in engine or 'localStorage.setItem(STORAGE_KEY' in engine:
        raise SystemExit("main-state storage still bypasses Waseda persistence adapter")
    for forbidden in [
        'localStorage.getItem(V75_ACTIVE_SESSION_KEY)',
        'localStorage.setItem(V75_ACTIVE_SESSION_KEY',
        'localStorage.removeItem(V75_ACTIVE_SESSION_KEY)',
    ]:
        if forbidden in compat:
            raise SystemExit(f"active-session storage still bypasses adapter: {forbidden}")

    PERSISTENCE.write_text(persistence, encoding="utf-8")
    ENGINE.write_text(engine, encoding="utf-8")
    COMPAT.write_text(compat, encoding="utf-8")
    print("Waseda persistence boundary transform: PASS")


if __name__ == "__main__":
    main()
