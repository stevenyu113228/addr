# scripts/

資料預處理腳本，runtime 完全不會用到。只在官方資料更新或要新增資料源時，本機跑一次。

## 結構

| 檔案 | 來源 | 輸出 |
|------|------|------|
| `build-index.mjs` | donma/TaiwanAddressCityAreaRoadChineseEnglishJSON 的 `CityCountyData.json`（MIT） | `data/index/cities.json`、`data/index/districts.json` |
| `build-roads.mjs` | 同上的 `AllData.json`（含路街中英） | `data/roads/<cityCode>.json` |
| `build-zip5.mjs` | data.gov.tw dataset/5948 或 中華郵政 3+2 CSV（手動下載） | `data/zip5/<cityCode>.json` |
| `build-zip6.mjs` | 中華郵政 3+3 投遞區段碼 RAR（手動下載解壓） | `data/zip6/<cityCode>.json` |

## 用法

```bash
cd scripts
node build-index.mjs        # 從 GitHub 抓 donma JSON
node build-roads.mjs        # 同上
# zip5 / zip6 需先放原始檔到 ../data/_raw/
node build-zip5.mjs
node build-zip6.mjs
```

或一次跑：
```bash
npm run build:all
```

## zip5 / zip6 原始資料怎麼拿

### 3+2 碼（zip5）

1. 到 [data.gov.tw/dataset/5948](https://data.gov.tw/dataset/5948) 下載 CSV
2. 或到 [中華郵政下載專區](https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201) 找 3+2 相關檔案
3. 解壓後把 CSV 改名為 `zip5.csv`（UTF-8 編碼），放到 `data/_raw/zip5.csv`
4. `node build-zip5.mjs`

### 3+3 碼（zip6）

1. 到 [中華郵政下載專區](https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201) 下載「3+3 郵遞區號應用系統」（~12.5MB RAR）
2. 用 unrar 解壓，找到 DBF/CSV 檔（內部格式可能要再轉）
3. 命名為 `zip6.csv` 放到 `data/_raw/zip6.csv`
4. `node build-zip6.mjs`

> **注意**：3+3 應用系統檔案格式可能不是 CSV（可能是 DBF / MS Access），實際拿到資料後要對齊欄位再實作。`build-zip6.mjs` 目前是 scaffold。

## 授權

- donma 的 JSON：MIT
- data.gov.tw / 中華郵政：政府資料開放授權條款 第 1 版（可商用，需註明出處）

請在 README + footer 註明出處。
