// build-index.mjs
// 來源：donma/TaiwanAddressCityAreaRoadChineseEnglishJSON 的 CityCountyData.json
// 也可改用中華郵政 6.1 縣市鄉鎮中英對照 Excel（手動轉 JSON 後 import）。
//
// 輸出：data/index/cities.json + data/index/districts.json

import { writeFile, mkdir } from 'node:fs/promises';
import { ISO_CODES, CITY_SHORT } from './_iso-codes.mjs';

const SRC = 'https://raw.githubusercontent.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/master/CityCountyData.json';
const OUT_DIR = new URL('../data/index/', import.meta.url);

function cityAliases(zh) {
  const set = new Set();
  const swap = zh.includes('臺') ? zh.replaceAll('臺', '台') : null;
  const baseForms = swap ? [zh, swap] : [zh];
  for (const f of baseForms) {
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

async function main() {
  console.log('Fetching', SRC);
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();

  const cities = [], districts = [];
  for (const c of data) {
    const code = ISO_CODES[c.CityName];
    if (!code) continue;
    const zips = [...new Set((c.AreaList || []).map(a => a.ZipCode).filter(Boolean))].sort();
    cities.push({
      code, zh: c.CityName, en: c.CityEngName,
      alias: cityAliases(c.CityName),
      zip3Range: zips.length ? [zips[0], zips[zips.length - 1]] : [],
    });
    for (const a of (c.AreaList || [])) {
      if (!a.AreaName) continue;
      districts.push({
        city: code, zh: a.AreaName, en: a.AreaEngName,
        zip3: a.ZipCode || '', alias: districtAlias(a.AreaName),
      });
    }
  }
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(new URL('cities.json', OUT_DIR),
    JSON.stringify(cities, null, 2) + '\n');
  await writeFile(new URL('districts.json', OUT_DIR),
    JSON.stringify(districts, null, 2) + '\n');
  console.log(`Wrote ${cities.length} cities, ${districts.length} districts.`);
}

main().catch(e => { console.error(e); process.exit(1); });
