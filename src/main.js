// 進入點：載入索引、綁事件、debounce、串接 parser/lookup/autocomplete/history。

import { parse, buildCityIndex, buildDistrictIndex } from './parser.js';
import { toEnglish } from './english.js';
import { loadIndex, loadRoads, attachZip } from './lookup.js';
import { getSuggestions } from './autocomplete.js';
import * as history from './history.js';
import {
  refs, renderResult, clearResult,
  renderSuggestions, clearSuggestions, moveActive, getActiveSuggestion,
  renderHistory, bindCopyButtons,
} from './ui.js';

// 全域索引（啟動時建立一次）
const ctx = {
  cities: [], districts: [],
  cityIdx: null, districtIdxByCity: null,
  roadIdxByCity: new Map(),  // lazy-load
};

// 當前正在 lazy-load 的 city，用來避免重複請求
const loadingCities = new Set();

// 待寫入的歷史紀錄（debounce 1.5s，使用者停下來才存）。
// 在以下情況立即寫入：textarea blur、Enter（無補全候選時）、關頁面前。
const SAVE_DEBOUNCE_MS = 1500;
let saveTimer = null;
let pendingEntry = null;

function scheduleSave(entry) {
  pendingEntry = entry;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commitSave, SAVE_DEBOUNCE_MS);
}

function cancelSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  pendingEntry = null;
}

function commitSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (pendingEntry) {
    history.add(pendingEntry);
    pendingEntry = null;
    refreshHistory();
  }
}

// ───────────── 啟動 ─────────────

(async function bootstrap() {
  try {
    const { cities, districts } = await loadIndex();
    ctx.cities = cities;
    ctx.districts = districts;
    ctx.cityIdx = buildCityIndex(cities);
    ctx.districtIdxByCity = buildDistrictIndex(districts);
  } catch (e) {
    refs.input.placeholder = '資料載入失敗，請重新整理頁面';
    refs.input.disabled = true;
    console.error(e);
    return;
  }

  bindCopyButtons();
  bindInputEvents();
  bindHistoryEvents();
  refreshHistory();
})();

// ───────────── 事件綁定 ─────────────

let debounceTimer = null;
function bindInputEvents() {
  refs.input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const value = refs.input.value;
    debounceTimer = setTimeout(() => handleInput(value), 200);
  });

  refs.input.addEventListener('keydown', (e) => {
    // Enter（無候選 popover 時）→ 立刻寫入歷史
    if (e.key === 'Enter' && refs.suggestions.hidden) {
      e.preventDefault();
      commitSave();
      return;
    }
    if (refs.suggestions.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Escape') { clearSuggestions(); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const sg = getActiveSuggestion();
      if (sg) { e.preventDefault(); applySuggestion(sg); }
    }
  });

  // textarea 失焦：關閉 popover + 把還在 debounce 的 input 跑完 + 立刻寫入歷史
  refs.input.addEventListener('blur', async () => {
    setTimeout(() => clearSuggestions(), 200);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      await handleInput(refs.input.value);
    }
    commitSave();
  });

  // 關頁面前確保 pending 紀錄落地
  window.addEventListener('beforeunload', commitSave);
}

function bindHistoryEvents() {
  refs.clearHistory.addEventListener('click', () => {
    history.clear();
    refreshHistory();
  });
}

// ───────────── 主流程 ─────────────

async function handleInput(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    clearResult();
    clearSuggestions();
    cancelSave();
    return;
  }

  // 1. 第一次解析（roads 可能還沒載入）
  let parsed = parse(trimmed, ctx);

  // 2. 若解到 city → lazy-load 該縣市的 roads，重新 parse
  if (parsed.cityCode && !ctx.roadIdxByCity.has(parsed.cityCode)) {
    const code = parsed.cityCode;
    if (!loadingCities.has(code)) {
      loadingCities.add(code);
      try {
        const idx = await loadRoads(code);
        ctx.roadIdxByCity.set(code, idx);
      } catch (e) {
        console.warn(`Roads for ${code} not loaded`, e);
      } finally {
        loadingCities.delete(code);
      }
    }
    parsed = parse(trimmed, ctx); // 再 parse 一次（這次有 roads）
  }

  // 3. 試著補 zip5 / zip6（若 data/zip5/<code>.json 不存在會降級到 zip3）
  await attachZip(parsed, { withZip6: false });

  // 4. 算英文
  const en = toEnglish(parsed, { citiesList: ctx.cities, districtsList: ctx.districts });

  // 5. 渲染
  renderResult(parsed, en);

  // 6. 更新自動補全
  const sg = getSuggestions(trimmed, ctx);
  // 沒候選 / 已 done → 收起來
  if (!sg.suggestions.length || sg.token === '') {
    clearSuggestions();
  } else {
    renderSuggestions(sg.suggestions, (s) => applySuggestion(s, sg));
  }

  // 7. 解析完整 → 排程寫入歷史（debounce，使用者停下來才寫）
  if (parsed.ok && parsed.zh.no != null) {
    scheduleSave({
      input: trimmed,
      zh: refs.zhOut.textContent,
      en,
      zip5: parsed.zip5 || null,
      zip6: parsed.zip6 || null,
      zip3: parsed.districtZip3,
    });
  } else {
    // 解析不完整（例如使用者剛 backspace 砍掉號碼）→ 取消未寫入的排程
    cancelSave();
  }
}

function applySuggestion(s, sg) {
  // 把目前輸入框尾段的 token 替換成候選的 replace
  const cur = refs.input.value;
  const trimmed = cur.trimEnd();
  const tokenLen = s.replaceLength || 0;
  const head = trimmed.slice(0, trimmed.length - tokenLen);
  const newVal = head + s.replace;
  refs.input.value = newVal;
  refs.input.focus();
  // 觸發 input event 重新解析
  handleInput(newVal);
  clearSuggestions();
}

// ───────────── 歷史 ─────────────

function refreshHistory() {
  renderHistory(history.list(), {
    onPick: (e) => {
      refs.input.value = e.input;
      refs.input.focus();
      handleInput(e.input);
    },
    onRemove: (e) => {
      history.remove(e.input);
      refreshHistory();
    },
  });
}
