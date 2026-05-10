// 地址解析器：normalize 後的字串 → ParsedAddress
// 策略：從外向內 greedy longest match + 後綴錨點。

import { normalize } from './normalize.js';

const DISTRICT_SUFFIX = /[區鄉鎮市]$/;

// 把 list 依 key 長度（含 alias）建立 longest-first 的查找鍵
function buildLongestFirstKeys(list, getKeys) {
  const keys = [];
  for (const obj of list) {
    for (const name of getKeys(obj)) {
      if (name) keys.push({ key: name, value: obj });
    }
  }
  keys.sort((a, b) => b.key.length - a.key.length);
  return keys;
}

// 縣市索引：{ list, byCode, zhFirst, aliasFirst }
export function buildCityIndex(cities) {
  return {
    list: cities,
    byCode: new Map(cities.map(c => [c.code, c])),
    zhFirst: buildLongestFirstKeys(cities, c => [c.zh.replace(/臺/g, '台')]),
    aliasFirst: buildLongestFirstKeys(cities, c => c.alias.map(a => a.replace(/臺/g, '台'))),
  };
}

// 區索引：每個 city.code → { list, zhFirst, aliasFirst }
export function buildDistrictIndex(districts) {
  const byCity = new Map();
  for (const d of districts) {
    if (!byCity.has(d.city)) byCity.set(d.city, []);
    byCity.get(d.city).push(d);
  }
  const byCityIndex = new Map();
  for (const [code, list] of byCity) {
    byCityIndex.set(code, {
      list,
      zhFirst: buildLongestFirstKeys(list, d => [d.zh.replace(/臺/g, '台')]),
      aliasFirst: buildLongestFirstKeys(list, d => d.alias.map(a => a.replace(/臺/g, '台'))),
    });
  }
  return byCityIndex;
}

// 路索引：city.code → { list, byDistrict, zhFirstByDistrict }
// key 統一用「台」（normalize 後輸入都是「台」），避免「臺/台」不一致導致 miss。
export function buildRoadIndex(roadsList) {
  const byDistrict = new Map();
  for (const r of roadsList) {
    if (!byDistrict.has(r.district)) byDistrict.set(r.district, []);
    byDistrict.get(r.district).push(r);
  }
  const zhFirstByDistrict = new Map();
  for (const [district, list] of byDistrict) {
    zhFirstByDistrict.set(district,
      buildLongestFirstKeys(list, r => [r.zh.replace(/臺/g, '台')]));
  }
  return { list: roadsList, byDistrict, zhFirstByDistrict };
}

// 對 normalized 字串做 longest match。返回 { match, value, rest } 或 null。
function longestMatch(s, longestFirst, predicate = null) {
  for (const { key, value } of longestFirst) {
    if (s.startsWith(key)) {
      if (predicate && !predicate(s, key, value)) continue;
      return { match: key, value, rest: s.slice(key.length) };
    }
  }
  return null;
}

// 在字串裡找 city：先 zh 形式 longest match，再 alias longest match。
export function parseCity(s, cityIdx) {
  return longestMatch(s, cityIdx.zhFirst) ||
         longestMatch(s, cityIdx.aliasFirst);
}

// 在剩餘字串裡找 district：先 zh（須 區/鄉/鎮/市 結尾），再 alias（後綴須為路/街/巷/數字...）
export function parseDistrict(s, districtIdxForCity) {
  if (!districtIdxForCity) return null;
  // zh 形式
  const zhMatch = longestMatch(s, districtIdxForCity.zhFirst,
    (str, key) => DISTRICT_SUFFIX.test(key));
  if (zhMatch) return zhMatch;
  // alias 形式：next char 必須是路名/編號錨點
  const aliasMatch = longestMatch(s, districtIdxForCity.aliasFirst,
    (str, key) => {
      const after = str.slice(key.length);
      return /^(路|街|大道|大街|大路|巷|弄|號|段|村|里|鄰|[0-9])/.test(after) || after === '';
    });
  return aliasMatch;
}

// 在剩餘字串裡找 road（已正規化、無段別）。後綴須為段/巷/弄/號/樓/室/數字/字尾。
// 排除「村/里」結尾的條目（那些是村里 fallback，不是 road）。
export function parseRoad(s, roadIdxForCity, districtZh) {
  if (!roadIdxForCity || !districtZh) return null;
  const longestFirst = roadIdxForCity.zhFirstByDistrict.get(districtZh);
  if (!longestFirst) return null;
  return longestMatch(s, longestFirst, (str, key, value) => {
    if (/[村里]$/.test(key)) return false; // 不接受 村/里 作為 road
    const after = str.slice(key.length);
    return after === '' ||
      /^([0-9]+段|[0-9]+巷|[0-9]+弄|[0-9]+(?:之[0-9]+)?號|[0-9]+樓|[0-9]+室|地下)/.test(after);
  });
}

// 從剩餘字串裡解析詳細欄位（段/巷/弄/號/之/樓/室）。返回 { details, rest }。
export function parseDetails(s) {
  let rest = s;
  const out = { section: null, lane: null, alley: null, no: null, sub: null,
                floor: null, basement: null, subFloor: null, room: null };
  let m = rest.match(/^([0-9]+)段/);
  if (m) { out.section = parseInt(m[1], 10); rest = rest.slice(m[0].length); }
  m = rest.match(/^([0-9]+)巷/);
  if (m) { out.lane = parseInt(m[1], 10); rest = rest.slice(m[0].length); }
  m = rest.match(/^([0-9]+)弄/);
  if (m) { out.alley = parseInt(m[1], 10); rest = rest.slice(m[0].length); }
  m = rest.match(/^([0-9]+)(?:之([0-9]+))?號/);
  if (m) {
    out.no = parseInt(m[1], 10);
    if (m[2]) out.sub = parseInt(m[2], 10);
    rest = rest.slice(m[0].length);
  }
  m = rest.match(/^地下([0-9]+)樓/);
  if (m) { out.basement = parseInt(m[1], 10); rest = rest.slice(m[0].length); }
  m = rest.match(/^([0-9]+)樓(?:之([0-9]+))?/);
  if (m) {
    out.floor = parseInt(m[1], 10);
    if (m[2]) out.subFloor = parseInt(m[2], 10);
    rest = rest.slice(m[0].length);
  }
  m = rest.match(/^([0-9]+)室/);
  if (m) { out.room = parseInt(m[1], 10); rest = rest.slice(m[0].length); }
  return { details: out, rest };
}

// 主入口：parsedAddress = parse(input, indexes)
export function parse(input, { cityIdx, districtIdxByCity, roadIdxByCity = new Map() }) {
  const raw = input;
  const normalized = normalize(input);
  const result = {
    raw, normalized,
    zh: { city: null, district: null, road: null,
          section: null, lane: null, alley: null, no: null, sub: null,
          floor: null, basement: null, subFloor: null, room: null,
          village: null, neighborhood: null },
    cityCode: null, districtZip3: null, roadInfo: null,
    missing: [], warnings: [], ok: false,
  };

  const cityM = parseCity(normalized, cityIdx);
  if (!cityM) {
    result.missing.push('city');
    result.error = '找不到縣市，請以「臺北市」「新北市」等開頭';
    return result;
  }
  result.zh.city = cityM.value.zh;
  result.cityCode = cityM.value.code;
  let rest = cityM.rest;

  const distIdx = districtIdxByCity.get(cityM.value.code);
  const distM = parseDistrict(rest, distIdx);
  if (!distM) {
    result.missing.push('district');
    result.error = '找不到鄉鎮市區';
    return result;
  }
  result.zh.district = distM.value.zh;
  result.districtZip3 = distM.value.zip3;
  rest = distM.rest;

  const roadIdx = roadIdxByCity.get(cityM.value.code);
  if (roadIdx) {
    const roadM = parseRoad(rest, roadIdx, distM.value.zh);
    if (roadM) {
      result.zh.road = roadM.value.zh;
      result.roadInfo = roadM.value;
      rest = roadM.rest;
    } else {
      result.missing.push('road');
      // 嘗試村/里 fallback：先看是否能在 road list 找到村/里條目（取 EN）
      const villM = rest.match(/^([一-鿿]{1,8}?)(村|里)/);
      if (villM) {
        result.zh.village = villM[0];
        // 從 road list 找對應的村/里條目以拿英文
        const allRoads = roadIdx.byDistrict.get(distM.value.zh) || [];
        const villInfo = allRoads.find(r => r.zh === villM[0]);
        if (villInfo) result.villageInfo = villInfo;
        rest = rest.slice(villM[0].length);
      }
      const neiM = rest.match(/^([0-9]+)鄰/);
      if (neiM) { result.zh.neighborhood = parseInt(neiM[1], 10); rest = rest.slice(neiM[0].length); }
    }
  } else {
    result.warnings.push('roads-not-loaded');
  }

  const { details, rest: tail } = parseDetails(rest);
  Object.assign(result.zh, details);
  result.tail = tail;

  if (!result.zh.no && roadIdx && !result.zh.village) result.missing.push('no');
  result.ok = !!(result.zh.city && result.zh.district &&
                 (result.zh.road || result.zh.village));
  return result;
}
