// build-index.mjs
// 來源：中華郵政官方「6.1 縣市鄉鎮中英對照 Excel」
//   https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201
// 直接下載 XLS 解析後輸出，比 donma 那邊新（donma 的 cities/districts 也是抄這個）。
//
// 輸出：data/index/cities.json + data/index/districts.json

import { writeFile, mkdir } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { ISO_CODES, CITY_SHORT } from './_iso-codes.mjs';

// 下載連結會隨資料版本變動。若 fetch 404，去 listing 頁找最新檔名。
const SRC = 'https://www.post.gov.tw/post/download/county_h_10706.xls';
const OUT_DIR = new URL('../data/index/', import.meta.url);

// 6.1 row 結構：[zip3, "臺北市中正區", "Zhongzheng Dist., Taipei City"]
function splitZh(zhFull) {
  // city 結尾為「市」或「縣」
  const m = zhFull.match(/^(.+?[市縣])(.+)$/);
  return m ? [m[1], m[2]] : [null, zhFull];
}

function splitEn(enFull) {
  // "Zhongzheng Dist., Taipei City" 或 "Hualien City, Hualien County"
  const parts = enFull.split(',').map(s => s.trim());
  if (parts.length < 2) return [parts[0], ''];
  // 修正一個 6.1 的歷史 typo：Taoyuan City City → Taoyuan City
  const cityEn = parts.slice(1).join(', ').replace(/Taoyuan City City$/, 'Taoyuan City');
  return [parts[0], cityEn];
}

function cityAliases(zh) {
  const set = new Set();
  const swap = zh.includes('臺') ? zh.replaceAll('臺', '台') : null;
  for (const f of swap ? [zh, swap] : [zh]) {
    set.add(f);
    if (f.endsWith('市') || f.endsWith('縣')) set.add(f.slice(0, -1));
  }
  set.delete(zh);
  for (const a of (CITY_SHORT[zh] || [])) set.add(a);
  return [...set].sort();
}

function districtAlias(zh) {
  for (const suf of ['區', '鄉', '鎮', '市']) {
    if (zh.endsWith(suf) && zh.length > 1) return [zh.slice(0, -1)];
  }
  return [];
}

async function fetchXls(url) {
  console.log('Fetching', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const buf = await fetchXls(SRC);
  const wb = XLSX.read(buf, { type: 'array' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1 });

  const cityMap = new Map(); // zh → { code, zh, en, zips: Set }
  const districts = [];
  let skipped = 0;

  for (const row of rows) {
    if (!row || row.length < 3) continue;
    const zip3 = String(row[0]).trim();
    const zhFull = String(row[1]).trim();
    const enFull = String(row[2]).trim();
    if (!/^\d{3}$/.test(zip3)) continue;

    const [cityZh, distZh] = splitZh(zhFull);
    const [distEn, cityEn] = splitEn(enFull);
    if (!cityZh || !distZh) {
      // 釣魚台之類沒縣市
      skipped++; continue;
    }
    if (!ISO_CODES[cityZh]) {
      // 例如「南海島」這種非標準 entry，跳過
      skipped++; continue;
    }
    const code = ISO_CODES[cityZh];
    if (!cityMap.has(cityZh)) {
      cityMap.set(cityZh, { code, zh: cityZh, en: cityEn, zips: new Set() });
    }
    cityMap.get(cityZh).zips.add(zip3);
    districts.push({
      city: code, zh: distZh, en: distEn,
      zip3, alias: districtAlias(distZh),
    });
  }

  const cities = [...cityMap.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(c => {
      const zips = [...c.zips].sort();
      return {
        code: c.code, zh: c.zh, en: c.en,
        alias: cityAliases(c.zh),
        zip3Range: zips.length ? [zips[0], zips[zips.length - 1]] : [],
      };
    });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(new URL('cities.json', OUT_DIR),
    JSON.stringify(cities, null, 2) + '\n');
  await writeFile(new URL('districts.json', OUT_DIR),
    JSON.stringify(districts, null, 2) + '\n');
  console.log(`Wrote ${cities.length} cities, ${districts.length} districts (skipped ${skipped} 特殊項).`);
}

main().catch(e => { console.error(e); process.exit(1); });
