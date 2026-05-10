// 純 DOM 操作：渲染結果卡片、自動補全清單、歷史 chips。

const $ = (sel) => document.querySelector(sel);

export const refs = {
  input: $('#addr-input'),
  suggestions: $('#suggestions'),
  result: $('#result'),
  zhOut: $('#zh-out'),
  zipOut: $('#zip-out'),
  enOut: $('#en-out'),
  warnings: $('#warnings'),
  historySection: $('#history-section'),
  historyList: $('#history-list'),
  clearHistory: $('#clear-history'),
};

// ───────────── 結果區渲染 ─────────────

export function renderResult(parsed, en, opts = {}) {
  if (!parsed?.zh?.city) {
    refs.result.hidden = true;
    return;
  }
  refs.result.hidden = false;

  // 中文整理（補上 區/路/段/巷/弄/號/樓/室）
  const zh = composeZh(parsed);
  refs.zhOut.textContent = zh;

  // Zip：優先 zip6 → zip5 → zip3
  const zip = parsed.zip6 || parsed.zip5 || parsed.districtZip3 || '—';
  refs.zipOut.textContent = zip;

  // English
  refs.enOut.textContent = en || '—';

  // Warnings
  const warns = [];
  if (parsed.missing?.includes('road')) warns.push('未解析到路街，僅顯示鄉鎮郵遞區號（3 碼）。');
  if (parsed.missing?.includes('no')) warns.push('未提供號碼，無法精確到 5/6 碼。');
  if (parsed.tail) warns.push(`未識別的尾段：「${parsed.tail}」`);
  if (parsed.error) warns.push(parsed.error);
  if (parsed.ambiguous) warns.push('地址在郵遞區號邊界，請參考候選清單。');
  if (warns.length) {
    refs.warnings.hidden = false;
    refs.warnings.classList.toggle('error', !!parsed.error);
    refs.warnings.textContent = warns.join(' ');
  } else {
    refs.warnings.hidden = true;
  }
}

function composeZh(p) {
  const z = p.zh;
  const parts = [];
  if (z.city) parts.push(z.city);
  if (z.district) parts.push(z.district);
  if (z.road) parts.push(z.road);
  if (z.section) parts.push(`${z.section}段`);
  if (z.lane) parts.push(`${z.lane}巷`);
  if (z.alley) parts.push(`${z.alley}弄`);
  if (z.no != null) parts.push(z.sub ? `${z.no}-${z.sub}號` : `${z.no}號`);
  if (z.basement) parts.push(`地下${z.basement}樓`);
  if (z.floor) parts.push(z.subFloor ? `${z.floor}樓之${z.subFloor}` : `${z.floor}樓`);
  if (z.room) parts.push(`${z.room}室`);
  if (z.village && !z.road) parts.push(z.village);
  if (z.neighborhood) parts.push(`${z.neighborhood}鄰`);
  return parts.join(' ');
}

export function clearResult() {
  refs.result.hidden = true;
}

// ───────────── 自動補全清單 ─────────────

let activeIdx = -1;
let currentSuggestions = [];

export function renderSuggestions(suggestions, onSelect) {
  currentSuggestions = suggestions || [];
  activeIdx = -1;
  refs.suggestions.innerHTML = '';
  if (!currentSuggestions.length) {
    refs.suggestions.hidden = true;
    refs.input.setAttribute('aria-expanded', 'false');
    return;
  }
  for (let i = 0; i < currentSuggestions.length; i++) {
    const s = currentSuggestions[i];
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.id = `sg-${i}`;
    li.setAttribute('role', 'option');
    li.dataset.idx = String(i);
    li.innerHTML = `
      <span>
        <span class="suggestion-label"></span>
        <span class="suggestion-sublabel"></span>
      </span>
      <span class="suggestion-type"></span>
    `;
    li.querySelector('.suggestion-label').textContent = s.label;
    li.querySelector('.suggestion-sublabel').textContent = ' ' + (s.sublabel || '');
    li.querySelector('.suggestion-type').textContent = stageLabel(s.type);
    li.addEventListener('mouseenter', () => setActive(i));
    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 不要讓 textarea 失焦
      onSelect?.(currentSuggestions[i]);
    });
    refs.suggestions.appendChild(li);
  }
  refs.suggestions.hidden = false;
  refs.input.setAttribute('aria-expanded', 'true');
}

export function clearSuggestions() {
  currentSuggestions = [];
  activeIdx = -1;
  refs.suggestions.hidden = true;
  refs.suggestions.innerHTML = '';
  refs.input.setAttribute('aria-expanded', 'false');
  refs.input.removeAttribute('aria-activedescendant');
}

export function moveActive(delta) {
  if (!currentSuggestions.length) return;
  activeIdx = (activeIdx + delta + currentSuggestions.length) % currentSuggestions.length;
  setActive(activeIdx);
}

function setActive(i) {
  activeIdx = i;
  for (const li of refs.suggestions.children) {
    li.classList.toggle('active', li.dataset.idx === String(i));
  }
  if (i >= 0) {
    refs.input.setAttribute('aria-activedescendant', `sg-${i}`);
    refs.suggestions.children[i]?.scrollIntoView({ block: 'nearest' });
  }
}

export function getActiveSuggestion() {
  return activeIdx >= 0 ? currentSuggestions[activeIdx] : null;
}

function stageLabel(type) {
  return ({ city: '縣市', district: '區', road: '路街' })[type] || '';
}

// ───────────── 歷史紀錄 chips ─────────────

export function renderHistory(entries, { onPick, onRemove }) {
  refs.historyList.innerHTML = '';
  if (!entries?.length) {
    refs.historySection.hidden = true;
    return;
  }
  refs.historySection.hidden = false;
  for (const e of entries) {
    const li = document.createElement('li');
    li.className = 'history-chip';
    li.title = e.input;
    const label = document.createElement('span');
    label.className = 'history-chip-label';
    label.textContent = shorten(e.input, 24);
    label.addEventListener('click', () => onPick?.(e));
    const x = document.createElement('button');
    x.className = 'history-chip-x';
    x.setAttribute('aria-label', '刪除這筆紀錄');
    x.textContent = '✕';
    x.addEventListener('click', (ev) => { ev.stopPropagation(); onRemove?.(e); });
    li.appendChild(label);
    li.appendChild(x);
    refs.historyList.appendChild(li);
  }
}

function shorten(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

// ───────────── 複製 ─────────────

export function bindCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target?.textContent) return;
      try {
        await navigator.clipboard.writeText(target.textContent);
        btn.classList.add('copied');
        const orig = btn.textContent;
        btn.textContent = '已複製';
        setTimeout(() => { btn.classList.remove('copied'); btn.textContent = orig; }, 1200);
      } catch (e) {
        // 退回 select-all（user 自行複製）
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  });
}
