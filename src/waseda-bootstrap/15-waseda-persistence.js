const WASEDA_APP_CONFIG=Object.freeze({
  schemaVersion:7,
  storageKey:"waseshibu_vocab_state",
  activeSessionKey:"waseshibu_vocab_active_session_v1",
  activeSessionFormatVersion:1
});
const SCHEMA_VERSION=WASEDA_APP_CONFIG.schemaVersion;
const STORAGE_KEY=WASEDA_APP_CONFIG.storageKey;
function wasedaStorageGet(key){return localStorage.getItem(key)}
function wasedaStorageSet(key,value){localStorage.setItem(key,value)}
function wasedaStorageRemove(key){localStorage.removeItem(key)}
