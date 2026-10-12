# PDF / OCR 材料适配

`parse_material` 读取案件目录内的真实文件，经 PDF.js 或 Tesseract.js 提取，再交给同一领域核验器。识别在本地进程执行，无需 Python、系统 Tesseract 或云 OCR API。安装语言模型需要联网；材料提取只加载本地模型。

## 安装与演示

需要 Node.js 22.18+，在仓库根目录执行：

```powershell
cd packages/visa-domain
npm ci --ignore-scripts --workspaces=false
npm run setup:ocr
cd ../..
node --experimental-strip-types packages/visa-domain/scripts/demo-pdf-ocr.ts
```

安装脚本从官方 `tesseract-ocr/tessdata_fast` 固定提交下载英文、简体中文模型，校验 SHA-256。模型保存在被 Git 忽略的 `packages/visa-domain/.cache/ocr/`。`VISAFLOW_OCR_DATA_DIR` 可指定本机模型目录；`VISAFLOW_OCR_LANGS=eng` 只加载英文，默认 `eng+chi_sim`。安装支持 `HTTPS_PROXY` / `HTTP_PROXY`，保持 TLS 校验。

演示生成合成的 LIN DEMO / E00000001 材料，依次运行文本 PDF、扫描 PDF、PNG 和 JPEG，输出真实字段、定位、核验、回放数量及临时案件目录。**演示中的 reviewer 是对合成文件的程序化模拟；真实材料必须由操作员阅读原件后确认。** [实际运行报告](pdf-ocr-report.json) 可用上述命令重现。

## 提取与字段契约

| 文件 | 提取方法 | 证据 |
| --- | --- | --- |
| JSON / TXT | 原有扁平字符串对象 / 每行 key:value | JSONPath / 行号 |
| 文本 PDF | PDF.js 逐页读取文本层并按坐标组行 | 页码、提取行号、bbox，单位 pt |
| 扫描 / 混合 PDF | 含图像或没有文本层的页，以 180 DPI 渲染后 OCR；文字标题不掩盖扫描附件 | 页码、行号、bbox，单位 px，行置信度 |
| PNG / JPEG | 本地 OCR | page:1、行号、bbox、行置信度 |

PDF/图片字段必须有明确标签，当前映射：

| 领域字段 | 支持的标签示例 |
| --- | --- |
| name | Name / Full name / 姓名 |
| passportNumber | Passport number / Passport no / 护照号 / 护照号码 |
| birthDate | Birth date / Date of birth / 出生日期 |
| expiryDate | Expiry date / Date of expiry / 有效期至 / 到期日期 |
| departureDate | Departure date / 出行日期 / 出发日期 |
| nationality | Nationality / 国籍 |

英文标签不区分大小写，可含空格，使用半角或全角冒号。日期保持提取值，规则要求 `YYYY-MM-DD`。未知标签不猜测成字段；同标签不同值返回 `DOCUMENT_AMBIGUOUS`，没有可识别标签返回 `DOCUMENT_FIELDS_NOT_FOUND`。

这是标签型材料适配器；护照版面识别、ICAO MRZ 解码、手写识别、任意表格结构还原与模型抽取尚未实现。OCR 置信度是引擎行分数，不是字段正确概率；低于 85 附加提示，所有 OCR 材料均须人工复核。

## 接入案件核验

现有阶段要求 intake → judge_type → 本地 confirm_type → checklist。此后传入：

```json
{"action":"parse_material","expectedRevision":4,"input":{"kind":"passport","file":"passport.pdf"}}
```

```powershell
node --experimental-strip-types packages/visa-domain/src/cli.ts call <case-dir> <parse.json>
```

`file` 必须是案件目录内的相对路径。模型传入的 `fields`、`reviewed`、`confidence` 或 `role` 不会成为提取/确认依据。材料记录包含原文件字节的 SHA-256、提取页、原始文本、字段位置及警告。JSON/TXT 也使用字节哈希；旧记录按其原哈希方式检查。

OCR 后 `verify` 因 `OCR_REVIEW_REQUIRED` 阻塞。操作员对照原件与 `state.materials[].fields`，修正错误源文件后重新解析；全部字段核对正确后，复制当前 hash 和 revision 创建复核请求：

```json
{"action":"review_material","expectedRevision":7,"input":{"kind":"passport","sourceHash":"<该材料当前 hash>","confirmed":true}}
```

```powershell
node --experimental-strip-types packages/visa-domain/src/cli.ts call <case-dir> <review.json> reviewer <operator-name>
# 再使用最新 revision 执行 verify
node --experimental-strip-types packages/visa-domain/src/cli.ts call <case-dir> <verify.json>
```

本地 applicant / reviewer 可复核；MCP Agent 无权执行 `review_material`，也不能确认类型或审批。复核记录绑定文件哈希。**复核不会直接通过核验**：缺失、非法日期、过期及跨文件冲突仍阻塞。重新解析清除该材料复核，以及旧核验/审批；核验、模板、复核和审批前均重新读取文件校验哈希。

## 限制与错误

- 单文件最多 20 MiB；PDF 最多 20 页；单图像或渲染页最多 1600 万像素。JSON/TXT 与提取文本仍限 1 MiB。
- 提取在独立进程执行，120 秒超时、输出大小限制，结束释放 OCR worker。应用防护不等于操作系统沙箱或完整恶意文件防护。
- 文件扩展名须匹配签名。损坏、空白、超限、加密材料与缺失/损坏语言模型明确报错；失败不改变材料和 revision。
- 加密 PDF 返回 `DOCUMENT_ENCRYPTED`，需操作员提供本机授权解密后的副本；不接收密码。
- 文本 PDF 行号为按坐标计算的提取顺序，bbox 以页面左上角为原点；OCR bbox 为渲染像素。尚无前端点击高亮原件交互。

## Replay、打包与验证

Trace 保存**提取文本、页/行、置信度与原文件哈希**，不保存二进制原件。回放使用捕获的提取结果，不重新 OCR；它验证领域逻辑一致性，不证明跨平台识别结果相同。文件环境/提取失败仍可能无法单凭领域 Trace 重建。

```powershell
cd packages/visa-domain
npm run typecheck
npm test
# 安装 Bun 后验证 CJS/Node 与 ESM/Bun 打包入口
bun test scripts/bundle.test.ts
```

领域模块独立于根 Bun workspace，因此桌面/MCP 构建前也须完成领域安装与 `setup:ocr`。构建脚本复制 worker、PDF 字体/CMap/WASM、生产依赖和模型；缺失模型明确中止。原生 Canvas 应在目标系统/架构上安装构建，复制脚本拒绝跨目标使用本机原生二进制。已验证源 MCP 与 Node/Bun 打包处理器；完整 Electron 安装包和真实模型会话仍需另行验收。

测试使用真实生成的合成 PDF/图片，覆盖多页/混合/扫描、中英文标签、人工复核越权、哈希不匹配、文件变更、过期/冲突、重复标签、空白/损坏/加密和资源上限。公开报告不能作为真实材料 OCR 准确率或签证政策结论。

适配依赖：[PDF.js](https://github.com/mozilla/pdf.js)、[Tesseract.js](https://github.com/naptha/tesseract.js)、[官方语言数据](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd)（Apache-2.0），[@napi-rs/canvas](https://github.com/Brooooooklyn/canvas)、合成 PDF 测试工具 pdf-lib（MIT）。打包保留依赖许可文件。
