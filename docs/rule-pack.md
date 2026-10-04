# Rule Pack：结构与运行契约

可执行入口：[rules.ts](../packages/visa-domain/src/rules.ts)。默认 `DEMO-ENTRY@1.0.0` 是虚构目的地与虚构材料要求，供工程演示，不对应任何国家的现行政策。

| 字段 | 用途 |
| --- | --- |
| id / version | 规则标识与三段版本号 |
| source / effectiveDate / reviewed | 来源、适用起始日期、人工审核标记 |
| scope / types | 目的地、出行目的、类型及停留天数条件 |
| materials | 必需/可选材料、字段约束、有效期；visaTypes 裁剪类型对应的材料面 |
| consistentFields / fieldPatterns | 跨材料一致性字段与格式规则 |
| nodes / sop / template / errorCases | 办理节点、流程、模板与错误案例关联 |
| isDemo | 区分工程样例与部署规则 |

案件创建时固定规则内容 SHA-256，后续每次调用检查版本与完整内容。已审核但未生效、缺少字段、运行中变更内容均拒绝。默认包包含 passport、application，商务类型另有可选 invitation。有效期计算以计划出行日为基准，样例中的 90 天仅用于测试。

本地操作员可将符合 `RulePack` 接口的规则放入案件目录 `visa-rule-pack.json`；模型工具没有创建、修改或审核规则的入口。`reviewed` 是本地操作员信任配置，不是数字签名/多用户 RBAC。新规则版本请创建新案件，不会自动迁移已确认的条件。

## SOP

1. 采集姓名、国籍、目的地、出行目的、日期与停留天数；非法日期与过往计划日期拒绝。
2. 规则匹配只输出唯一候选；范围不支持或目的不明时保留 undetermined，重新采集信息。
3. 本地 applicant/reviewer 确认候选类型后生成类型对应清单，记录每个要求的规则引用。
4. 解析 JSON/TXT 源文件，记录原始内容哈希与真实字段位置。只支持已确认类型的材料 kind。
5. 核验材料覆盖、必填字段、格式、日期、有效期与跨材料/采集信息一致性。
6. 有错误进入 remediation；修正源文件、重新解析、重新核验。采集信息变更会重新进入类型判断，清除旧结论。
7. 核验通过后允许填充纯文本模板；本地 reviewer 可确认材料预审结果。签证签发由有权机关决定。

## 错误案例

| 样例 | 预期 |
| --- | --- |
| missing / expired | 缺失必需材料或有效期不足 → blocked |
| name/passport/birth/date-conflict | 保留冲突双方值、来源文件与字段位置 → remediation |
| invalid-date | 不存在的日历日期 → blocked |
| ambiguous | 无唯一类型 → undetermined，禁止生成清单 |
| unauthorized-approval | Agent 即使传入 reviewer/approved 参数也不能审批 |

原有 `visa_search_rules` 是关键词检索，返回来源与版本，独立于可执行 Rule Pack。检索片段只供辅助查证，不能自动替换已固定的材料规则。仓库未实现向量检索，也未验证原有语料的当前政策时效性。
