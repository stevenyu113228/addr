// 中文地址輸入正規化：把所有可預期的同義寫法收斂到單一規範形。
// 順序很重要：NFKC → 臺/台 → 空白 → 中文數字 → 段別 → 之/夾號 → 樓 → 室。

const CN_DIGIT = { 零:0, 〇:0, O:0, 一:1, 壹:1, 二:2, 兩:2, 貳:2, 三:3, 參:3, 四:4, 肆:4,
  五:5, 伍:5, 六:6, 陸:6, 七:7, 柒:7, 八:8, 捌:8, 九:9, 玖:9 };

// 把「一二三…十百千」這類中文數字串轉成阿拉伯數字。
// 支援：一(1)、十(10)、十一(11)、二十(20)、二十一(21)、一百(100)、一百零五(105)、
//      一千二百三十四(1234)。
function cnNumStrToInt(s) {
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let total = 0, section = 0, current = 0;
  for (const ch of s) {
    if (ch in CN_DIGIT) {
      current = CN_DIGIT[ch];
    } else if (ch === '十') {
      section += (current || 1) * 10;
      current = 0;
    } else if (ch === '百') {
      section += (current || 1) * 100;
      current = 0;
    } else if (ch === '千') {
      section += (current || 1) * 1000;
      current = 0;
    } else if (ch === '萬') {
      total += (section + current) * 10000;
      section = 0; current = 0;
    } else {
      return null;
    }
  }
  return total + section + current;
}

// 邊界感知的中文數字轉阿拉伯：只在「段/巷/弄/號/樓/室」前一個 token 做轉換，
// 避免把「三民路」的「三」誤轉成「3民路」。
function cnNumToArabic(s) {
  // 找出每個錨點，往前最多 4 字看是否為中文數字串
  return s.replace(/([零〇一二三四五六七八九十百千萬壹貳參肆伍陸柒捌玖兩]{1,5})(段|巷|弄|號|樓|樓之|之|室|鄰)/g,
    (match, num, anchor) => {
      const n = cnNumStrToInt(num);
      return n === null ? match : `${n}${anchor}`;
    });
}

export function normalize(input) {
  if (!input) return '';
  let s = input.normalize('NFKC');                  // 全形→半形（含全形數字、英文、空白）
  s = s.replace(/臺/g, '台');                       // 內部用「台」，輸出階段再換回
  s = s.replace(/[\s　]+/g, '');                // 移除所有空白
  s = cnNumToArabic(s);                             // 中文數字→阿拉伯（邊界感知）
  s = s.replace(/第?\s*([0-9]+)\s*段/g, '$1段');     // 第N段 / N段 / 段別統一
  s = s.replace(/(\d+)\s*[之\-—–~﹣－]\s*(\d+)\s*號/g, '$1之$2號'); // 之/-/— 統一
  s = s.replace(/(\d+)\s*[Ff]\b/g, '$1樓');          // 1F → 1樓
  s = s.replace(/地下\s*(\d+)\s*樓?/g, '地下$1樓');  // 地下一樓 → 地下1樓
  s = s.replace(/\bB\s*(\d+)/gi, '地下$1樓');        // B1 → 地下1樓
  return s;
}

// 暴露給其他模組（含測試）使用
export { cnNumStrToInt, cnNumToArabic };
