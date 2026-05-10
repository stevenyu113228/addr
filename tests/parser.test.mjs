// node --test tests/parser.test.mjs
//
// 涵蓋 normalize / parse / English assembly。zip5/zip6 還沒有開放資料對齊，
// 這裡先驗 zip3 + parser 結構 + 英文輸出。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { normalize, cnNumStrToInt } from '../src/normalize.js';
import { parse, buildCityIndex, buildDistrictIndex, buildRoadIndex } from '../src/parser.js';
import { toEnglish } from '../src/english.js';

const cities = JSON.parse(readFileSync(new URL('../data/index/cities.json', import.meta.url), 'utf8'));
const districts = JSON.parse(readFileSync(new URL('../data/index/districts.json', import.meta.url), 'utf8'));
const cityIdx = buildCityIndex(cities);
const districtIdxByCity = buildDistrictIndex(districts);
const roadIdxByCity = new Map();
for (const f of readdirSync(new URL('../data/roads/', import.meta.url))) {
  if (!f.endsWith('.json')) continue;
  const code = f.replace('.json', '');
  const list = JSON.parse(readFileSync(new URL(`../data/roads/${code}.json`, import.meta.url), 'utf8'));
  roadIdxByCity.set(code, buildRoadIndex(list));
}
const ctx = { cityIdx, districtIdxByCity, roadIdxByCity };

const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));

test('normalize: 中文數字邊界感知', () => {
  // 段別前的中文數字會轉
  assert.equal(normalize('信義路五段7號'), '信義路5段7號');
  // 路名本體裡的中文數字不會轉
  assert.equal(normalize('四維三路6號'), '四維三路6號');
  // 全形數字 → 半形
  assert.equal(normalize('信義路５段７號'), '信義路5段7號');
  // 「之」「-」統一成「之」
  assert.equal(normalize('民生路1-2號'), '民生路1之2號');
  assert.equal(normalize('民生路1—2號'), '民生路1之2號');
  // 樓 / F
  assert.equal(normalize('5F'), '5樓');
  assert.equal(normalize('B1'), '地下1樓');
  // 臺 → 台
  assert.equal(normalize('臺北市'), '台北市');
  // 全空白
  assert.equal(normalize(' 臺北市 信義區 '), '台北市信義區');
});

test('cnNumStrToInt: 中文數字解析', () => {
  assert.equal(cnNumStrToInt('一'), 1);
  assert.equal(cnNumStrToInt('十'), 10);
  assert.equal(cnNumStrToInt('十一'), 11);
  assert.equal(cnNumStrToInt('二十一'), 21);
  assert.equal(cnNumStrToInt('一百零五'), 105);
  assert.equal(cnNumStrToInt('一千二百三十四'), 1234);
  assert.equal(cnNumStrToInt('5'), 5);
});

for (const fx of fixtures) {
  test(`parse: ${fx.input}`, () => {
    const p = parse(fx.input, ctx);
    assert.equal(p.zh.city, fx.city, `city`);
    if (fx.district) assert.equal(p.zh.district, fx.district, `district`);
    if (fx.road) assert.equal(p.zh.road, fx.road, `road`);
    if (fx.section != null) assert.equal(p.zh.section, fx.section, `section`);
    if (fx.lane != null) assert.equal(p.zh.lane, fx.lane, `lane`);
    if (fx.alley != null) assert.equal(p.zh.alley, fx.alley, `alley`);
    if (fx.no != null) assert.equal(p.zh.no, fx.no, `no`);
    if (fx.sub != null) assert.equal(p.zh.sub, fx.sub, `sub`);
    if (fx.floor != null) assert.equal(p.zh.floor, fx.floor, `floor`);
    if (fx.subFloor != null) assert.equal(p.zh.subFloor, fx.subFloor, `subFloor`);
    if (fx.village) assert.equal(p.zh.village, fx.village, `village`);
    if (fx.zip3) assert.equal(p.districtZip3, fx.zip3, `zip3`);
    if (fx.missing) {
      for (const m of fx.missing) assert.ok(p.missing.includes(m), `missing should include ${m}`);
    }
  });
}

test('toEnglish: 範例輸出', () => {
  for (const fx of fixtures) {
    if (!fx.en) continue;
    const p = parse(fx.input, ctx);
    const en = toEnglish(p, { citiesList: cities, districtsList: districts });
    assert.equal(en, fx.en, `English for ${fx.input}`);
  }
});
