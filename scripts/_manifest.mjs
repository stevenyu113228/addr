// 更新 data/manifest.json 的某一類（roads/zip5/zip6）。
// 用法：updateManifest('roads', ['TPE', 'NWT', ...])

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const PATH = new URL('../data/manifest.json', import.meta.url);

export async function updateManifest(kind, codes) {
  let mf = { version: 'v1', roads: [], zip5: [], zip6: [] };
  if (existsSync(PATH)) {
    try { mf = JSON.parse(await readFile(PATH, 'utf8')); } catch (_) {}
  }
  mf[kind] = [...codes].sort();
  await writeFile(PATH, JSON.stringify(mf, null, 2) + '\n');
  console.log(`manifest.${kind}: ${codes.length} cities`);
}
