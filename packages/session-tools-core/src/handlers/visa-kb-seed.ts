/**
 * VisaFlow built-in rule corpus (seed).
 *
 * Each document is a versioned, source-attributed fragment of official visa
 * guidance. The corpus is the retrieval layer only: executable material
 * requirements stay in reviewed Rule Packs, and retrieved fragments are
 * advisory evidence (see the panel's evidence disclaimer).
 *
 * Fields:
 *  - destination  ISO-ish region code used for hard metadata filtering
 *  - visaType     visa category code (B-1/B-2, F-1, SCHENGEN-C, ...)
 *  - effectiveDate  date the guidance version takes effect
 *  - version      corpus document version (bumped on edits)
 *  - source/url   provenance (whitelist-checked upstream)
 *  - tags         retrieval boost terms
 *  - body         rule fragment text
 */

export interface VisaRuleDoc {
  id: string;
  title: string;
  destination: string;
  destinationName: string;
  visaType: string;
  /** Node focus of this fragment: intake | type-judgment | checklist | verification | remediation */
  node: string;
  effectiveDate: string;
  version: string;
  source: string;
  url: string;
  tags: string[];
  body: string;
}

export const VISA_KB_SEED: VisaRuleDoc[] = [
  {
    id: 'us-b1b2-docs',
    title: 'US B-1/B-2 Visitor Visa — Required Documents',
    destination: 'US',
    destinationName: '美国',
    visaType: 'B-1/B-2',
    node: 'checklist',
    effectiveDate: '2026-04-01',
    version: '1.4.2',
    source: 'travel.state.gov',
    url: 'https://travel.state.gov/content/travel/en/us-visas/business.html',
    tags: ['材料清单', '商务', '旅游', '邀请函', 'documents', 'checklist'],
    body: 'B-1/B-2 商务/旅游访问申请人一般需提交:有效期超出计划停留至少 6 个月的护照、DS-160 确认页(含条形码)、51mm×51mm 白底照片(6 个月内拍摄)、美方机构出具的邀请函(B-1)、资产与约束力证明(在职证明、银行流水、行程单)。办理节点:信息采集 → 类型判断 → 清单生成 → 材料核验 → 补正复核;面谈前应完成 DS-160 提交并携带确认页。',
  },
  {
    id: 'us-b1b2-passport',
    title: 'US Visa — Passport Validity Requirement',
    destination: 'US',
    destinationName: '美国',
    visaType: 'B-1/B-2',
    node: 'verification',
    effectiveDate: '2026-04-01',
    version: '1.4.2',
    source: 'travel.state.gov',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/passport.html',
    tags: ['护照', '有效期', 'passport', 'validity', '六个月'],
    body: '护照有效期须覆盖预期停留时间,且建议超出计划离美日期至少 6 个月。材料核验节点应检查护照有效期、个人信息页与 DS-160 填写信息的一致性(姓名拼写、出生日期、护照号)。跨文件字段不一致时必须暂停并请求申请人确认,不得自行选择取值。',
  },
  {
    id: 'us-b1b2-type',
    title: 'US Visa — Choosing Between B-1 and B-2',
    destination: 'US',
    destinationName: '美国',
    visaType: 'B-1/B-2',
    node: 'type-judgment',
    effectiveDate: '2026-04-01',
    version: '1.4.2',
    source: 'travel.state.gov',
    url: 'https://travel.state.gov/content/travel/en/us-visas/business.html',
    tags: ['类型判断', '商务', '旅游', '动机', 'purpose'],
    body: 'B-1 适用于与商务活动直接相关的短期访问(参加会议、合同谈判、考察设备,不得受雇领取美国境内报酬);B-2 适用于旅游、探亲访友、就医。类型判断节点应确认:访问目的、停留时间、是否领取报酬、邀请关系。两者常合并签发为 B-1/B-2。',
  },
  {
    id: 'us-f1-docs',
    title: 'US F-1 Student Visa — Required Documents',
    destination: 'US',
    destinationName: '美国',
    visaType: 'F-1',
    node: 'checklist',
    effectiveDate: '2026-03-15',
    version: '1.2.0',
    source: 'travel.state.gov',
    url: 'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html',
    tags: ['留学', '材料清单', 'I-20', 'student', 'checklist'],
    body: 'F-1 学生签证需提交:SEVIS 缴费收据(I-901)、院校签发的 I-20 表、录取通知书、财力证明(覆盖第一学年费用)、学历成绩单及语言成绩。办理节点:获得 I-20 后才能提交 DS-160;签证签发不得早于开学前 365 天,入境不得早于开学前 30 天。',
  },
  {
    id: 'schengen-c-docs',
    title: 'Schengen Short-Stay Visa (C) — Common Checklist',
    destination: 'SCHENGEN',
    destinationName: '申根区',
    visaType: 'SCHENGEN-C',
    node: 'checklist',
    effectiveDate: '2026-02-01',
    version: '2.0.1',
    source: 'home-affairs.ec.europa.eu',
    url: 'https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en',
    tags: ['申根', '材料清单', '旅游', '保险', 'schengen', 'checklist'],
    body: '申根短期签证(C 类)通用材料:申请表、护照(签发未超 10 年、有效期超出计划离境 3 个月以上)、覆盖整个申根区的旅行医疗保险(保额不低于 3 万欧元)、行程单、住宿证明、财力证明、往返机票预订单。办理节点:按主要目的地国或首入境国递交;材料核验需核对保险覆盖区间与行程一致。',
  },
  {
    id: 'schengen-c-verification',
    title: 'Schengen Visa — Itinerary and Insurance Consistency',
    destination: 'SCHENGEN',
    destinationName: '申根区',
    visaType: 'SCHENGEN-C',
    node: 'verification',
    effectiveDate: '2026-02-01',
    version: '2.0.1',
    source: 'home-affairs.ec.europa.eu',
    url: 'https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en',
    tags: ['申根', '核验', '保险', '行程', 'consistency'],
    body: '材料核验节点应确认:旅行医疗保险起止日期覆盖申请的整个停留区间;行程单所示天数与住宿证明一致;跨文件日期字段冲突(如邀请函日期与行程单不符)应记为待确认冲突,由申请人或人工复核裁决。',
  },
  {
    id: 'uk-standard-docs',
    title: 'UK Standard Visitor Visa — Supporting Documents',
    destination: 'GB',
    destinationName: '英国',
    visaType: 'STANDARD-VISITOR',
    node: 'checklist',
    effectiveDate: '2026-01-10',
    version: '1.6.0',
    source: 'gov.uk',
    url: 'https://www.gov.uk/standard-visitor',
    tags: ['英国', '材料清单', '旅游', '商务', 'uk', 'visitor'],
    body: '英国标准访问签证需提供:有效护照、访问目的证明(会议邀请、行程安排)、在职/在读证明、资金证明、住宿与行程安排。访问期间不得从事有偿工作;类型判断节点需确认访问目的属于允许活动清单。',
  },
  {
    id: 'jp-temporary-docs',
    title: 'Japan Temporary Visitor Visa — Documents (Chinese Nationals)',
    destination: 'JP',
    destinationName: '日本',
    visaType: 'TEMPORARY-VISITOR',
    node: 'checklist',
    effectiveDate: '2026-05-01',
    version: '1.1.3',
    source: 'cn.mofa.go.jp',
    url: 'https://www.cn.emb-japan.go.jp/itpr_zh/visa_dantai.html',
    tags: ['日本', '材料清单', '旅游', '单次', 'japan'],
    body: '日本短期停留(单次)签证常见材料:护照、签证申请表、照片、行程表(指定格式)、在职证明及能证明经济能力的材料、户口本复印件。通过指定代办机构递交;材料核验注意行程表日期与机票/酒店预订一致性。',
  },
  {
    id: 'generic-intake',
    title: 'VisaFlow Intake Guidance — Minimum Information Set',
    destination: '*',
    destinationName: '通用',
    visaType: '*',
    node: 'intake',
    effectiveDate: '2026-01-01',
    version: '1.0.0',
    source: 'visaflow.internal',
    url: '',
    tags: ['信息采集', 'intake', '最小信息集'],
    body: '信息采集节点的最小信息集:出行目的、目的地国家、计划停留时间、计划出发日期、同行人情况、历史签证记录。缺少任一项时向申请人追问,不得在目的地与出行目的未确认前进入类型判断节点。',
  },
  {
    id: 'generic-conflict',
    title: 'VisaFlow Verification Guidance — Cross-Document Field Conflicts',
    destination: '*',
    destinationName: '通用',
    visaType: '*',
    node: 'verification',
    effectiveDate: '2026-01-01',
    version: '1.0.0',
    source: 'visaflow.internal',
    url: '',
    tags: ['冲突', '核验', '跨文件', 'conflict', 'verification'],
    body: '姓名、出生日期、证件号等关键字段在不同文件间不一致时:记录冲突字段、各文件取值、文件与页码位置、解析时间与可信度;向申请人展示证据并请求确认,确认前案件停在补正复核;确认后仅重跑依赖该字段的校验,保留原值与确认记录以便追溯。',
  },
  {
    id: 'generic-remediation',
    title: 'VisaFlow Remediation Guidance — Missing and Expired Documents',
    destination: '*',
    destinationName: '通用',
    visaType: '*',
    node: 'remediation',
    effectiveDate: '2026-01-01',
    version: '1.0.0',
    source: 'visaflow.internal',
    url: '',
    tags: ['补正', '过期', '缺件', 'remediation'],
    body: '补正复核节点处理三类问题:缺件(给出具体补件项与建议格式)、证件过期(提示护照有效期不足等硬性问题)、字段冲突(引用冲突记录)。补正完成后仅重跑受影响的核验项,并输出更新后的规则版本与证据引用。',
  },
  {
    id: 'us-b1b2-photo',
    title: 'US Visa — Photo Requirements',
    destination: 'US',
    destinationName: '美国',
    visaType: 'B-1/B-2',
    node: 'verification',
    effectiveDate: '2026-04-01',
    version: '1.4.2',
    source: 'travel.state.gov',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html',
    tags: ['照片', '规格', 'photo', '尺寸'],
    body: '签证照片应为 51mm×51mm 正方形、白色背景、6 个月内拍摄,头部占画面 50%-69%。数码上传时分辨率不低于 600×600 像素。材料核验节点发现照片规格不符应记为 warning 问题并引导补正。',
  },
];
