// localStorage 搜尋紀錄。最近 10 筆、自動去重、失敗降級 in-memory。

const KEY = 'tw-addr.history.v1';
const MAX_ENTRIES = 10;

let memFallback = null;       // localStorage 失敗時用這個
let storageOk = true;

function readRaw() {
  if (!storageOk) return memFallback || [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    storageOk = false;
    memFallback = [];
    return memFallback;
  }
}

function writeRaw(entries) {
  if (!storageOk) { memFallback = entries; return; }
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch (_) {
    storageOk = false;
    memFallback = entries;
  }
}

// 取得歷史紀錄，最新在前。
export function list() {
  return readRaw();
}

// 加入一筆紀錄（最新放最前）。
// 兩個過濾條件：
//   1) 完全相同的 input 去重（避免重複）
//   2) 嚴格 prefix 的舊紀錄移除（避免「打字到一半」的中間狀態殘留）
//      例如新增「市府路 1 號 5 樓」會把先前的「市府路 1 號」擠掉
// 超過上限裁掉最舊。
export function add(entry) {
  if (!entry?.input) return;
  const key = entry.input.trim();
  const remaining = readRaw().filter(e => {
    const k = e.input.trim();
    if (k === key) return false;
    if (key.startsWith(k) && k.length < key.length) return false;
    return true;
  });
  remaining.unshift({ ...entry, ts: entry.ts || Date.now() });
  writeRaw(remaining.slice(0, MAX_ENTRIES));
}

// 刪除單筆。
export function remove(input) {
  const key = (input || '').trim();
  writeRaw(readRaw().filter(e => e.input.trim() !== key));
}

// 全清。
export function clear() {
  writeRaw([]);
}

// 是否使用 fallback（給 UI 顯示警告用）
export function isUsingFallback() {
  return !storageOk;
}
