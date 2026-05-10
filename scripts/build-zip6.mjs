// build-zip6.mjs
// 來源：中華郵政 3+3 郵遞區號應用系統（RAR 12.5MB）
//        https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201
//
// RAR 內含 DBF / TXT 等格式的 raw 投遞段碼，欄位通常包含：
//   縣市、鄉鎮市區、路街、段、巷、弄、起始號、結束號、單雙、3+3 投遞段碼
//
// 因為解 RAR 跨平台（unrar / node-unrar-js）較不穩定，這個 script 預設讀解壓後
// 的 CSV/TXT；不存在就提示使用者去下載解壓。
//
// 輸出：data/zip6/<cityCode>.json
//   [{ district, road, section, lane, alley, oddEven, start, end, zip6 }, ...]

import { existsSync } from 'node:fs';
import { writeFile, mkdir, readFile } from 'node:fs/promises';

const LOCAL_SRC = new URL('../data/_raw/zip6.csv', import.meta.url);
const OUT_DIR = new URL('../data/zip6/', import.meta.url);

async function main() {
  if (!existsSync(LOCAL_SRC)) {
    console.error(`找不到 ${LOCAL_SRC.pathname}

請先下載 3+3 投遞區段碼資料：
  1. 前往 https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201
  2. 下載「3+3郵遞區號應用系統」RAR (~12.5MB)，解壓後找到 CSV / TXT
  3. 把 CSV 命名為 zip6.csv（UTF-8）放到：
     data/_raw/zip6.csv
  4. 重新執行 npm run build:zip6

注意：RAR 內格式可能是 DBF/MS Access，需要先轉成 CSV。
TODO: 加入自動 RAR 解壓 + DBF 轉 CSV 流程（建議用 unrar + dbf2csv）。`);
    process.exit(1);
  }

  // 結構同 build-zip5.mjs，但欄位是 zip6 (6 碼)
  console.log('TODO: 對齊 zip6 CSV 的實際欄位後實作。');
  console.log('參考 build-zip5.mjs 的 CSV parser。');
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
