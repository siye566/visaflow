# Workflow、MCP 与 CLI

领域实现不依赖模型 API；MCP 工具和 CLI 共用 `execute` / `runCase`。现有桌面面板读取案件目录中的 `visaflow-case.json`，新增状态保持其 schemaVersion=1 的兼容字段。CLI 的全部演示可独立运行，无需构建桌面应用。

## MCP 入口

| 工具 | 行为 |
| --- | --- |
| visa_case_read | 只读案件信息、当前 revision、规则引用与 allowedActions |
| visa_workflow | 当前阶段许可的采集、类型判断、清单、解析、核验和模板动作 |
| visa_search_rules | 原有规则知识库检索；结果供辅助查证 |

调用 `visa_workflow` 前读取当前 revision。写动作要求 `expectedRevision` 完全匹配。工具每次返回 `ruleVersion`、`ruleHash`、`fileLocations`、`evidenceRefs`、verification 与 approval 状态。材料输入为 `{kind,file}`，路径仅能指向宿主提供的 sessionPath 内的相对文件，检查路径穿越和符号链接越界。

统一工具注册表仍暴露稳定 schema；**动态裁剪的是 allowedActions 与类型对应的材料 kind，执行器对非法调用进行强制拒绝**。尚未按节点热更新各模型提供商的 MCP tool-list。普通 shell/Write 的文件权限属于宿主环境，当前工作流门禁不能阻止具有这些权限的进程直接改文件；领域工具不是 OS 沙箱。

## CLI 操作

以下均从仓库根目录执行。需要 Node.js 22.18+。

```sh
node --experimental-strip-types packages/visa-domain/src/cli.ts demo
node --experimental-strip-types packages/visa-domain/src/cli.ts demo name-conflict
node --experimental-strip-types packages/visa-domain/src/cli.ts demo expired
```

`demo` 新建隔离临时案件，使用合成的 LIN DEMO / E00000001 字段，输出实际状态与 caseDirectory。演示固定日期 2026-10-04，避免随执行日期变化产生不可复现结果。临时案件包含追踪记录与源材料，演示完成后可自行删除输出的临时目录。

单次调用或 JSONL 批量执行：

```sh
node --experimental-strip-types packages/visa-domain/src/cli.ts call <case-dir> <request.json>
node --experimental-strip-types packages/visa-domain/src/cli.ts batch <case-dir> <requests.jsonl>
```

采集请求：

```json
{"action":"intake","expectedRevision":0,"input":{"name":"LIN DEMO","nationality":"DEMO","destination":"DEMO","travelPurpose":"business","stayDays":7,"plannedDepartureDate":"2026-12-01"}}
```

随后 judge_type 为 revision=1；人工确认请求：

```json
{"action":"confirm_type","expectedRevision":2,"input":{"code":"DEMO-BUSINESS"}}
```

```sh
node --experimental-strip-types packages/visa-domain/src/cli.ts call <case-dir> <confirmation.json> applicant <operator-name>
```

本地操作员继续 checklist（revision=3）、parse_material（revision=4、5）、verify（revision=6）。一次完整正常运行的核验状态为 revision=7。实际操作以 read 返回的 revision 为准。

解析请求示例：

```json
{"action":"parse_material","expectedRevision":4,"input":{"kind":"passport","file":"passport.json"}}
```

源文件为扁平字符串对象，或 TXT 每行 `fieldName: value`。JSON 位置为 `$.fieldName`，TXT 为 `line:N`。PDF、图片 OCR 和扫描件目前拒绝，需接入真实解析适配器后再宣称支持。

本地审批 `approve` 仅在 verification=pass 时允许，CLI 需显式指定 `reviewer <operator-name>`。MCP 角色固定为 agent，不能确认类型或审批。CLI 角色是本机操作员声明，不是远程身份认证。

## Trace Replay 与 Eval

```sh
node --experimental-strip-types packages/visa-domain/src/cli.ts replay <case-dir>
node --experimental-strip-types packages/visa-domain/src/eval.ts
node --experimental-strip-types --test packages/visa-domain/src/*.test.ts
```

Trace 保存调用参数、执行前快照、源文件字节、证据引用、规则版本/哈希、Prompt/Tool Contract 版本与审批状态。modelInput 只有调用者传入真实内容时才保存，否则为 null；尚未自动捕获每个模型提供商的完整上下文。read 不创建 Trace。

Replay 在内存中重放领域调用，不重新读取生产文件或执行审批副作用。内容、规则版本、Prompt 版本、Tool Contract 版本不一致将报告 drift；文件 I/O 错误的环境无法仅凭内存 Trace 重建，会明确显示回放差异。CI 在规则、工具、Prompt 变更时重新执行样例和回放，上传评估报告。

更新 Prompt/Tool Contract 时需同步版本常量。评估结果衡量合成材料下的确定性规则、门禁与一致性核验，不衡量 LLM 类型判断准确率。真实 LLM Eval 需要额外的标注样本、模型连接与实际 Trace。

## 数据与许可

案件、材料与 Trace 含客户数据，保存在本地，默认不提交 Git。请勿将客户 PDF/扫描件、证件号、操作员身份或模型凭证放入示例目录。公开展示仅使用合成样例。

保留仓库 [LICENSE](../LICENSE) 与 [NOTICE](../NOTICE)。领域模块在已有 Agent 桌面运行时的工具注册与案件展示扩展点上接入；运行时构建和模型调用的验证范围与独立领域模块分开。
