// Lazy-load 縣市相依資料：roads / zip5 / zip6。
// 雙層快取：分頁內 Map（同次解析不重抓） + Cache API（跨分頁、跨 reload）。

import { buildRoadIndex } from './parser.js';

const CACHE_NAME = 'tw-addr-v1';

// 第一層快取：in-memory，同分頁不重抓
const memCache = {
  roads: new Map(),     // cityCode → built road index
  zip5: new Map(),      // cityCode → zip5 list
  zip6: new Map(),      // cityCode → zip6 list
  // negative cache：記住已知缺檔（404）的縣市，避免重複 fetch 產生 console 警告
  missing: new Set(),   // 'zip5:TPE' / 'zip6:TPE' / 'roads:TPE'
};

// 由 loadIndex() 帶回的「資料清單」：哪些縣市有 roads/zip5/zip6 資料。
// 沒在清單裡的就不發 fetch，避免 404 console 訊息。
let manifest = null;

// 第二層快取：Cache API
async function fetchWithCache(url) {
  // Cache API 可能在 file:// 或 sandbox 下不可用，try/catch 包起來
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) return cached.clone().json();
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res.clone());
      return res.json();
    }
  } catch (e) {
    // Cache API 失敗（隱私模式、file://），fallthrough 到 plain fetch
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return res.json();
}

// 載入 cities.json + districts.json + manifest.json（首屏）
export async function loadIndex(baseUrl = './data') {
  const [cities, districts, mf] = await Promise.all([
    fetchWithCache(`${baseUrl}/index/cities.json`),
    fetchWithCache(`${baseUrl}/index/districts.json`),
    fetchWithCache(`${baseUrl}/manifest.json`).catch(() => ({ roads: [], zip5: [], zip6: [] })),
  ]);
  manifest = mf;
  return { cities, districts, manifest: mf };
}

function manifestHas(kind, code) {
  if (!manifest) return true; // 還沒載 manifest → 樂觀放行（試 fetch）
  return (manifest[kind] || []).includes(code);
}

// 載入某縣市的路街資料（lazy）。回傳已建索引的物件。
export async function loadRoads(cityCode, baseUrl = './data/roads') {
  if (memCache.roads.has(cityCode)) return memCache.roads.get(cityCode);
  if (!manifestHas('roads', cityCode)) throw new Error('roads not available');
  if (memCache.missing.has(`roads:${cityCode}`)) throw new Error('roads not available');
  try {
    const list = await fetchWithCache(`${baseUrl}/${cityCode}.json`);
    const idx = buildRoadIndex(list);
    memCache.roads.set(cityCode, idx);
    return idx;
  } catch (e) {
    memCache.missing.add(`roads:${cityCode}`);
    throw e;
  }
}

// 載入 zip5（3+2）。資料還沒準備好時 throw，caller 降級到 zip3。
export async function loadZip5(cityCode, baseUrl = './data/zip5') {
  if (memCache.zip5.has(cityCode)) return memCache.zip5.get(cityCode);
  if (!manifestHas('zip5', cityCode)) throw new Error('zip5 not available');
  if (memCache.missing.has(`zip5:${cityCode}`)) throw new Error('zip5 not available');
  try {
    const list = await fetchWithCache(`${baseUrl}/${cityCode}.json`);
    memCache.zip5.set(cityCode, list);
    return list;
  } catch (e) {
    memCache.missing.add(`zip5:${cityCode}`);
    throw e;
  }
}

// 載入 zip6（3+3）。同樣可能 404。
export async function loadZip6(cityCode, baseUrl = './data/zip6') {
  if (memCache.zip6.has(cityCode)) return memCache.zip6.get(cityCode);
  if (!manifestHas('zip6', cityCode)) throw new Error('zip6 not available');
  if (memCache.missing.has(`zip6:${cityCode}`)) throw new Error('zip6 not available');
  try {
    const list = await fetchWithCache(`${baseUrl}/${cityCode}.json`);
    memCache.zip6.set(cityCode, list);
    return list;
  } catch (e) {
    memCache.missing.add(`zip6:${cityCode}`);
    throw e;
  }
}

// 在 zip5/zip6 list 裡查單筆地址命中的紀錄。
// 條件：district + road + section 完全相符，no 落在 [start, end] 且 oddEven 相符。
// 多筆命中時回傳全部（caller 決定要顯示哪個或標 ambiguous）。
export function lookupZip(zipList, parsed, zipKey /* 'zip5' | 'zip6' */) {
  if (!zipList || !parsed?.zh?.road || parsed.zh.no == null) return [];
  const { district, road, section, no, lane, alley } = parsed.zh;
  return zipList.filter(e =>
    e.district === district &&
    e.road === road &&
    (e.section ?? null) === (section ?? null) &&
    (e.lane ?? null) === (lane ?? null) &&
    (e.alley ?? null) === (alley ?? null) &&
    no >= e.start && no <= e.end &&
    (e.oddEven === 'all' ||
      (e.oddEven === 'odd' && no % 2 === 1) ||
      (e.oddEven === 'even' && no % 2 === 0))
  ).map(e => e[zipKey]);
}

// 對 ParsedAddress 做 zip 補全：嘗試 zip5、zip6，失敗就用 zip3。
// 是 best-effort，從不 throw。
export async function attachZip(parsed, { withZip6 = false } = {}) {
  if (!parsed?.cityCode) return parsed;
  // zip5
  try {
    const list = await loadZip5(parsed.cityCode);
    const hits = lookupZip(list, parsed, 'zip5');
    if (hits.length === 1) parsed.zip5 = hits[0];
    else if (hits.length > 1) { parsed.zip5 = hits[0]; parsed.zip5Candidates = hits; parsed.ambiguous = true; }
  } catch (_) { /* zip5 資料不存在 → 用 zip3 fallback */ }
  // zip6
  if (withZip6) {
    try {
      const list = await loadZip6(parsed.cityCode);
      const hits = lookupZip(list, parsed, 'zip6');
      if (hits.length === 1) parsed.zip6 = hits[0];
      else if (hits.length > 1) { parsed.zip6 = hits[0]; parsed.zip6Candidates = hits; parsed.ambiguous = true; }
    } catch (_) { /* zip6 資料不存在 */ }
  }
  return parsed;
}

// 清快取（使用者按「重新載入資料」用）
export async function clearCache() {
  memCache.roads.clear();
  memCache.zip5.clear();
  memCache.zip6.clear();
  try { if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME); } catch (_) {}
}
