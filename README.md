# addr

> [addr.stevenyu.tw](https://addr.stevenyu.tw) — 台灣中文地址 → 郵遞區號 + 英譯

純前端的台灣地址解析器：**貼上中文地址，自動拆解縣市/區/路街/巷弄號樓，產出官方規範英文地址 + 郵遞區號**。

> 為什麼做：[中華郵政官方頁面](https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=207) 要多級下拉 + 驗證碼 + 不能貼整段地址。這個工具讓你打一次就好。

## 特色

- **單一輸入框**：貼整段「臺北市信義區市府路 1 號 5 樓」就好
- **即時自動補全**：縣市 → 區 → 路街三層候選，鍵盤可選
- **正規化容錯**：台/臺、全形/半形、中文數字（一段/1段/第一段）、空格、「之/-」混用
- **3+2 / 3+3 郵遞區號**（zip5 / zip6 資料準備好後即時生效）
- **官方規範英文地址**（漢語拼音、Sec./Ln./Aly./Dist. 縮寫）
- **最近搜尋**：localStorage 紀錄最近 10 筆，下次回來一鍵重用
- **隱私安全**：所有運算都在你的瀏覽器，不會上傳任何資料
- **零 build**：純 HTML + ES Modules，github pages 直接 serve

## 在本機跑

```bash
# 啟一個靜態 server（任一即可）
python3 -m http.server 8000
# 或
npx http-server -c-1
# 開瀏覽器
open http://localhost:8000
```

## 執行測試

```bash
node --test tests/parser.test.mjs
```

## 部署到 GitHub Pages

1. 推上 GitHub，Settings → Pages → Source = `main` / root
2. 預設訪問 `https://<你的帳號>.github.io/<repo>/`
3. 自訂網域（如 `addr.stevenyu.tw`）：在 repo root 加 `CNAME` 檔，內容寫一行你的網址；DNS 設 `CNAME` 指向 `<你的帳號>.github.io`
4. `.nojekyll` 已在 root，`data/` 不會被 Jekyll 忽略

## 更新資料

`data/` 內的 JSON 由 `scripts/` 預處理產出，runtime 不需要 build。資料更新時：

```bash
cd scripts
node build-index.mjs        # 縣市 + 區
node build-roads.mjs        # 路街中英對照
node build-zip5.mjs         # 3+2 碼（需手動下載原始 CSV）
node build-zip6.mjs         # 3+3 碼（需手動下載原始 RAR）
```

詳見 [scripts/README.md](./scripts/README.md)。

## 專案結構

```
.
├── index.html
├── css/styles.css
├── src/                  # runtime ES modules
│   ├── main.js           # 進入點
│   ├── normalize.js      # 字串正規化
│   ├── parser.js         # 地址 tokenizer/parser
│   ├── lookup.js         # lazy-load + Cache API
│   ├── english.js        # ParsedAddress → 英文
│   ├── autocomplete.js   # 即時補全
│   ├── history.js        # localStorage 歷史
│   └── ui.js             # DOM 渲染
├── data/                 # 預先產出的靜態 JSON
│   ├── index/            # 首屏載：縣市 + 區
│   ├── roads/            # 路街中英對照（按縣市拆檔，lazy-load）
│   ├── zip5/             # 3+2 碼（按縣市拆檔，lazy-load）
│   └── zip6/             # 3+3 碼（按縣市拆檔，lazy-load）
├── scripts/              # 資料預處理（不部署）
└── tests/                # node:test 單元測試
```

## 已知限制

- **zip5 / zip6 資料未隨 repo 出貨**：因為原始檔授權條款要求註明出處，且 12.5MB RAR 不適合放 git。請依 `scripts/README.md` 手動下載後跑 build script。在資料準備好之前，工具只回傳 3 碼郵遞區號。
- **村里地址**：若該地址只有村里、沒有街道，工具只能回到鄉鎮層級（3 碼）。
- **部分原住民鄉**：英文拼音遵循中華郵政公布表，可能與羅馬拼音標準不同。

## 資料來源

- [donma/TaiwanAddressCityAreaRoadChineseEnglishJSON](https://github.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON)（MIT 授權）
- [中華郵政下載專區](https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201)
- [政府資料開放平台 dataset/5948](https://data.gov.tw/dataset/5948)（政府資料開放授權第 1 版）

## 授權

MIT
