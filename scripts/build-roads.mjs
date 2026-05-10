// build-roads.mjs
// 結構：donma AllData.json（提供「縣市/區 → 路名」對應，官方公開檔沒有這個）
// 英譯：中華郵政官方「6.5 路街中英對照 Excel」（最新版，覆蓋 donma 舊翻譯與引號）
//
// 兩個來源合併，donma 的英譯只在 6.5 找不到時使用 fallback。
//
// 輸出：data/roads/<cityCode>.json

import { writeFile, mkdir } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { ISO_CODES } from './_iso-codes.mjs';
import { updateManifest } from './_manifest.mjs';

const DONMA_SRC = 'https://raw.githubusercontent.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/master/AllData.json';
const POST_SRC = 'https://www.post.gov.tw/post/download/%E4%B8%AD%E8%8B%B1%E6%96%87%E8%A1%97%E8%B7%AF%E5%90%8D%E7%A8%B1%E5%B0%8D%E7%85%A7%E6%AA%941130401.xls';
const OUT_DIR = new URL('../data/roads/', import.meta.url);

const CN_NUM = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };

function parseSection(zh) {
  const s = zh.normalize('NFKC');
  const m = s.match(/^(.+?)([一二三四五六七八九十0-9]+)段$/);
  if (m) {
    const sec = CN_NUM[m[2]] ?? (/^\d+$/.test(m[2]) ? Number(m[2]) : null);
    if (sec != null) return { base: m[1], section: sec };
  }
  return { base: s, section: null };
}

function parseSectionEn(en) {
  const m = en.match(/^Sec\.\s*(\d+),\s*(.+)$/);
  return m ? { base: m[2], section: Number(m[1]) } : { base: en, section: null };
}

async function fetchJson(url) {
  console.log('Fetching', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return res.json();
}
async function fetchXls(url) {
  console.log('Fetching', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const [donma, postBuf] = await Promise.all([fetchJson(DONMA_SRC), fetchXls(POST_SRC)]);

  // 解析 6.5 → roadEnMap：路名（含段別） → 英譯（含段別）
  const wb = XLSX.read(postBuf, { type: 'array' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1 });
  const roadEnMap = new Map(); // 中文（含段）→ 英文（含段）
  for (let r = 1; r < rows.length; r++) {
    const [zh, en] = (rows[r] || []).map(v => v == null ? '' : String(v).trim());
    if (zh && en) roadEnMap.set(zh, en);
  }
  console.log(`Official 6.5: ${roadEnMap.size} road entries`);

  // donma 結構 → bucket by city/district/road-base
  // 對每條路，先嘗試 6.5 完整查（含段別），再分段組，最後 fallback donma 英譯
  await mkdir(OUT_DIR, { recursive: true });
  let total = 0, overrides = 0;
  const writtenCodes = [];

  for (const c of donma) {
    const code = ISO_CODES[c.CityName];
    if (!code) continue;
    const bucket = new Map();
    for (const a of (c.AreaList || [])) {
      const district = a.AreaName;
      for (const r of (a.RoadList || [])) {
        const z = parseSection(r.RoadName);
        // 1. 先用官方 6.5 找完整的「路名+段」(如「八德路一段」)
        const officialFull = roadEnMap.get(r.RoadName);
        // 2. 段別獨立時也找官方對 base「八德路」
        const officialBase = roadEnMap.get(z.base);

        let baseEn, secEn;
        if (officialFull) {
          const e = parseSectionEn(officialFull);
          baseEn = e.base;
          secEn = e.section != null ? `Sec. ${e.section}` : null;
          overrides++;
        } else if (officialBase) {
          baseEn = officialBase;
          secEn = z.section != null ? `Sec. ${z.section}` : null;
          overrides++;
        } else {
          // fallback to donma
          const e = parseSectionEn(r.RoadEngName);
          baseEn = e.base;
          secEn = e.section != null ? `Sec. ${e.section}` : (z.section != null ? `Sec. ${z.section}` : null);
        }

        const key = `${district}|${z.base}`;
        if (!bucket.has(key)) {
          bucket.set(key, { district, zh: z.base, en: baseEn, sections: {} });
        }
        const item = bucket.get(key);
        if (z.section != null && secEn) item.sections[String(z.section)] = secEn;
        if (!item.en && baseEn) item.en = baseEn;
      }
    }
    const list = [...bucket.values()].sort((a, b) =>
      a.district === b.district ? a.zh.localeCompare(b.zh) : a.district.localeCompare(b.district));
    await writeFile(new URL(`${code}.json`, OUT_DIR), JSON.stringify(list) + '\n');
    total += list.length;
    writtenCodes.push(code);
    console.log(`  ${code}: ${list.length} roads`);
  }
  console.log(`Total: ${total} roads, ${overrides} 個英譯來自官方 6.5（取代 donma）`);
  await updateManifest('roads', writtenCodes);
}

main().catch(e => { console.error(e); process.exit(1); });
