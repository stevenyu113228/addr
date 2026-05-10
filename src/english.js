// ParsedAddress → 英文地址字串。順序為中文反序：室/樓/號/弄/巷/段/路、區、縣市 + zip、Taiwan。

// floor → "1F", "2F", ..., "10F", with 之 → "F.-2"
function floorEn(floor, subFloor) {
  if (floor == null) return null;
  return subFloor ? `${floor}F.-${subFloor}` : `${floor}F`;
}

function basementEn(b) { return b == null ? null : `B${b}F`; }

function noEn(no, sub) {
  if (no == null) return null;
  return sub ? `No. ${no}-${sub}` : `No. ${no}`;
}

// 從 roadInfo（{ zh, en, sections }）拼出英文路名 + 段別。
// 中華郵政英譯規範：段別放在路名「之前」，逗號分隔。
//   例：「信義路五段」 → "Sec. 5, Xinyi Rd."
function roadEn(zhRoad, section, roadInfo) {
  if (!zhRoad) return null;
  let baseEn = roadInfo?.en || zhRoad; // 找不到對照時回退中文
  if (section != null) {
    const secStr = roadInfo?.sections?.[String(section)] || `Sec. ${section}`;
    return `${secStr}, ${baseEn}`;
  }
  return baseEn;
}

// 區英文：來自 districts 索引
function districtEn(zhDistrict, districtIdxList) {
  const d = districtIdxList?.find(x => x.zh === zhDistrict);
  return d?.en || zhDistrict;
}

// 縣市英文：來自 cities 索引
function cityEn(zhCity, citiesList) {
  const c = citiesList?.find(x => x.zh === zhCity);
  return c?.en || zhCity;
}

// 主 API：parsedResult → English string
// indexes: { citiesList, districtsList, roadInfoMap?: 已用 result.roadInfo 帶入 }
export function toEnglish(p, { citiesList, districtsList } = {}) {
  if (!p?.zh?.city || !p?.zh?.district) return null;
  const z = p.zh;
  const parts = [];

  // 室
  if (z.room) parts.push(`Rm. ${z.room}`);
  // 樓 / 地下
  const fl = floorEn(z.floor, z.subFloor);
  if (fl) parts.push(fl);
  const bs = basementEn(z.basement);
  if (bs) parts.push(bs);
  // 號 / 之
  const no = noEn(z.no, z.sub);
  if (no) parts.push(no);
  // 弄
  if (z.alley) parts.push(`Aly. ${z.alley}`);
  // 巷
  if (z.lane) parts.push(`Ln. ${z.lane}`);
  // 路（含段別）
  const road = roadEn(z.road, z.section, p.roadInfo);
  if (road) parts.push(road);
  else if (z.village) parts.push(p.villageInfo?.en || `${z.village.slice(0, -1)} Vil.`);

  // 區
  parts.push(districtEn(z.district, districtsList));
  // 縣市 + zip
  const zip = p.zip5 || p.zip6 || p.districtZip3 || '';
  parts.push(`${cityEn(z.city, citiesList)}${zip ? ' ' + zip : ''}`);
  // 國名
  parts.push('Taiwan (R.O.C.)');

  return parts.filter(Boolean).join(', ');
}
