// build-zip5.mjs
// 來源：政府資料開放平台 dataset/5948「3+2碼/3+3碼郵遞區號」CSV
//        https://data.gov.tw/dataset/5948
// 或：中華郵政下載專區 https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201
//
// CSV 欄位（典型）：縣市、鄉鎮市區、原始路名、巷、弄、號之範圍、奇/偶、3+2 碼。
// 因為來源 CSV 並沒有穩定的公開 URL（需手動下載 zip 後解壓），這個 script 預設讀本地檔，
// 找不到就提示使用者去下載。
//
// 輸出：data/zip5/<cityCode>.json
//   [{ district, road, section, oddEven, start, end, lane, alley, zip5 }, ...]

import { existsSync } from 'node:fs';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { ISO_CODES } from './_iso-codes.mjs';
import { updateManifest } from './_manifest.mjs';

const LOCAL_SRC = new URL('../data/_raw/zip5.csv', import.meta.url);
const OUT_DIR = new URL('../data/zip5/', import.meta.url);

async function main() {
  if (!existsSync(LOCAL_SRC)) {
    console.error(`找不到 ${LOCAL_SRC.pathname}

請先下載 3+2 郵遞區號 CSV：
  1. 前往 https://data.gov.tw/dataset/5948 或 https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201
  2. 下載 zip 並解壓縮，把 CSV（建議命名為 zip5.csv，UTF-8 編碼）放到：
     data/_raw/zip5.csv
  3. 重新執行 npm run build:zip5

預期 CSV 欄位（順序可調整）：
  縣市,鄉鎮市區,路街(含段),巷,弄,起始號,結束號,單雙,3+2碼
TODO: 確認來源 CSV 欄位後再對應。`);
    process.exit(1);
  }

  const csv = await readFile(LOCAL_SRC, 'utf8');
  const rows = parseCsv(csv);
  const byCity = new Map();
  for (const r of rows) {
    const code = ISO_CODES[r['縣市']];
    if (!code) continue;
    if (!byCity.has(code)) byCity.set(code, []);
    const sec = r['段'] ? Number(String(r['段']).replace(/[^0-9]/g, '')) : null;
    byCity.get(code).push({
      district: r['鄉鎮市區'],
      road: r['路街'],
      section: sec,
      oddEven: r['單雙'] === '單' ? 'odd' : r['單雙'] === '雙' ? 'even' : 'all',
      start: Number(r['起始號']) || 0,
      end: Number(r['結束號']) || 0,
      lane: r['巷'] ? Number(r['巷']) : null,
      alley: r['弄'] ? Number(r['弄']) : null,
      zip5: r['3+2碼'] || r['郵遞區號'],
    });
  }
  await mkdir(OUT_DIR, { recursive: true });
  for (const [code, list] of byCity) {
    await writeFile(new URL(`${code}.json`, OUT_DIR), JSON.stringify(list) + '\n');
    console.log(`  ${code}: ${list.length} entries`);
  }
  await updateManifest('zip5', [...byCity.keys()]);
}

// 簡單 CSV parser（能應付 UTF-8、雙引號跳脫）。
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (cols[i] ?? '').trim());
    return obj;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

main().catch(e => { console.error(e); process.exit(1); });
