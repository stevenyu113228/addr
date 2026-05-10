// build-roads.mjs
// 來源：donma/TaiwanAddressCityAreaRoadChineseEnglishJSON 的 AllData.json (含路街中英對照)
// 也可改用中華郵政 6.5 路街中英對照 Excel。
//
// 輸出：data/roads/<cityCode>.json（每縣市一檔）

import { writeFile, mkdir } from 'node:fs/promises';
import { ISO_CODES } from './_iso-codes.mjs';
import { updateManifest } from './_manifest.mjs';

const SRC = 'https://raw.githubusercontent.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/master/AllData.json';
const OUT_DIR = new URL('../data/roads/', import.meta.url);

const CN_NUM = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };

// 拆「八德路一段」「信義路五段」→ { base, section }
function parseSection(zh) {
  const s = zh.normalize('NFKC');
  const m = s.match(/^(.+?)([一二三四五六七八九十0-9]+)段$/);
  if (m) {
    const sec = CN_NUM[m[2]] ?? (/^\d+$/.test(m[2]) ? Number(m[2]) : null);
    if (sec != null) return { base: m[1], section: sec };
  }
  return { base: s, section: null };
}

// 拆「Sec. 1, Bade Rd.」→ { base: 'Bade Rd.', section: 1 }
function parseSectionEn(en) {
  const m = en.match(/^Sec\.\s*(\d+),\s*(.+)$/);
  return m ? { base: m[2], section: Number(m[1]) } : { base: en, section: null };
}

async function main() {
  console.log('Fetching', SRC);
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();

  await mkdir(OUT_DIR, { recursive: true });
  let total = 0;
  const codes = [];
  for (const c of data) {
    const code = ISO_CODES[c.CityName];
    if (!code) continue;
    const bucket = new Map();
    for (const a of (c.AreaList || [])) {
      const district = a.AreaName;
      for (const r of (a.RoadList || [])) {
        const z = parseSection(r.RoadName);
        const e = parseSectionEn(r.RoadEngName);
        const key = `${district}|${z.base}`;
        if (!bucket.has(key)) {
          bucket.set(key, { district, zh: z.base, en: e.base, sections: {} });
        }
        const item = bucket.get(key);
        if (z.section != null) {
          const enSec = e.section ?? z.section;
          item.sections[String(z.section)] = `Sec. ${enSec}`;
        }
        if (!item.en && e.base) item.en = e.base;
      }
    }
    const list = [...bucket.values()].sort((a, b) =>
      a.district === b.district ? a.zh.localeCompare(b.zh) : a.district.localeCompare(b.district));
    await writeFile(new URL(`${code}.json`, OUT_DIR), JSON.stringify(list) + '\n');
    total += list.length;
    codes.push(code);
    console.log(`  ${code}: ${list.length} roads`);
  }
  console.log(`Total: ${total} roads.`);
  await updateManifest('roads', codes);
}

main().catch(e => { console.error(e); process.exit(1); });
