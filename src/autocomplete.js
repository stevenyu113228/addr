// 即時補全：依照輸入目前能解析到哪個階段，補對應層級的候選清單。
// stage: 'city' | 'district' | 'road' | 'road-loading' | 'done'

import { normalize } from './normalize.js';
import { parseCity, parseDistrict, parseRoad } from './parser.js';

// 從 input 解出 { stage, token, ctx }，其中 token 是「使用者目前正在打的這一段」。
export function getStageAndToken(input, { cityIdx, districtIdxByCity, roadIdxByCity }) {
  const s = normalize(input);
  if (!s) return { stage: 'city', token: '', normalized: s };

  const cityM = parseCity(s, cityIdx);
  if (!cityM) return { stage: 'city', token: s, normalized: s };

  const distIdx = districtIdxByCity.get(cityM.value.code);
  const distM = parseDistrict(cityM.rest, distIdx);
  if (!distM) {
    return {
      stage: 'district', token: cityM.rest, normalized: s,
      city: cityM.value,
    };
  }

  const roadIdx = roadIdxByCity?.get(cityM.value.code);
  if (!roadIdx) {
    return {
      stage: 'road-loading', token: distM.rest, normalized: s,
      city: cityM.value, district: distM.value,
    };
  }
  const roadM = parseRoad(distM.rest, roadIdx, distM.value.zh);
  if (!roadM) {
    return {
      stage: 'road', token: distM.rest, normalized: s,
      city: cityM.value, district: distM.value,
    };
  }
  return { stage: 'done', token: roadM.rest, normalized: s };
}

// 簡單 fuzzy：token 是否為 key 的子序列（容錯一個錯字）。回傳分數 0~1。
function fuzzyScore(token, key) {
  if (!token) return 0;
  if (key.startsWith(token)) return 1;                            // prefix 完全相符
  if (key.includes(token)) return 0.6;                            // 中段命中
  // 子序列：token 字元在 key 裡依序出現
  let i = 0;
  for (const ch of key) {
    if (ch === token[i]) i++;
    if (i === token.length) break;
  }
  if (i === token.length) return 0.3;
  return 0;
}

// 從 keys（{ key, value }）裡找候選並排序（最多 8 筆）。
function rank(token, keys, valueToSuggestion) {
  const out = [];
  for (const { key, value } of keys) {
    const score = fuzzyScore(token, key);
    if (score > 0) out.push({ key, value, score });
  }
  out.sort((a, b) => b.score - a.score || a.key.length - b.key.length);
  // 同 value 去重（zh 跟 alias 可能指向同一個 city）
  const seen = new Set();
  const unique = [];
  for (const { key, value, score } of out) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(valueToSuggestion(key, value, score));
    if (unique.length >= 8) break;
  }
  return unique;
}

export function getSuggestions(input, ctx) {
  const sat = getStageAndToken(input, ctx);
  const { stage, token } = sat;

  if (stage === 'done' || stage === 'road-loading') return { stage, suggestions: [], ...sat };

  const tokenNorm = token.replace(/臺/g, '台');

  if (stage === 'city') {
    const keys = [...ctx.cityIdx.zhFirst, ...ctx.cityIdx.aliasFirst];
    const suggestions = rank(tokenNorm, keys, (key, value, score) => ({
      type: 'city',
      label: value.zh,
      sublabel: value.en,
      replace: value.zh, // 補全要插入的中文（用標準 zh 形式）
      replaceLength: token.length, // 要替換掉幾個字（從 input 尾端算）
      score,
    }));
    return { stage, suggestions, ...sat };
  }

  if (stage === 'district') {
    const distIdx = ctx.districtIdxByCity.get(sat.city.code);
    if (!distIdx) return { stage, suggestions: [], ...sat };
    const keys = [...distIdx.zhFirst, ...distIdx.aliasFirst];
    const suggestions = rank(tokenNorm, keys, (key, value, score) => ({
      type: 'district',
      label: value.zh,
      sublabel: `${value.en}・${value.zip3}`,
      replace: value.zh,
      replaceLength: token.length,
      score,
    }));
    return { stage, suggestions, ...sat };
  }

  if (stage === 'road') {
    const roadIdx = ctx.roadIdxByCity.get(sat.city.code);
    const distZh = sat.district.zh;
    const list = roadIdx?.zhFirstByDistrict.get(distZh);
    if (!list) return { stage, suggestions: [], ...sat };
    const suggestions = rank(tokenNorm, list, (key, value, score) => ({
      type: 'road',
      label: value.zh,
      sublabel: value.en,
      replace: value.zh,
      replaceLength: token.length,
      score,
    }));
    return { stage, suggestions, ...sat };
  }

  return { stage, suggestions: [], ...sat };
}
