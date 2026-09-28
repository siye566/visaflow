import type { VisaFlowCase } from './types'

/**
 * Built-in sample case so the panel is demoable before the backend writes
 * real `visaflow-case.json` files. Always rendered with an explicit demo
 * marker — never silently presented as a real case.
 */
export const VISA_FLOW_DEMO_CASE: VisaFlowCase = {
  schemaVersion: 1,
  isDemo: true,
  applicant: { name: '王小明', nationality: '中国' },
  destination: 'US',
  destinationName: '美国',
  travelPurpose: '商务(短期商务访问)',
  plannedDepartureDate: '2026-11-16',
  visaType: {
    code: 'B-1/B-2',
    status: 'confirmed',
    note: '依据出行目的与邀请方信息判定,已与申请人确认',
  },
  stage: 'verification',
  rulePack: {
    id: 'US-B1B2',
    version: '1.4.2',
    effectiveDate: '2026-04-01',
    source: 'travel.state.gov',
    reviewStatus: 'reviewed',
  },
  checklist: [
    { id: 'passport', name: '护照信息页', required: true, status: 'verified' },
    { id: 'photo', name: '签证照片(51×51mm)', required: true, status: 'uploaded' },
    { id: 'ds160', name: 'DS-160 确认页', required: true, status: 'uploaded' },
    { id: 'invitation', name: '美方邀请函', required: true, status: 'conflict' },
    { id: 'employment', name: '在职证明', required: true, status: 'verified' },
    { id: 'bank', name: '银行流水(近6个月)', required: false, status: 'missing', note: '可选,建议提供以增强资产证明' },
    { id: 'itinerary', name: '往返行程单', required: false, status: 'missing' },
  ],
  materials: [
    {
      id: 'm-passport',
      file: 'passport.pdf',
      kind: '护照',
      uploadedAt: 1758902400000,
      fields: [
        { name: '姓名', value: 'WANG XIAOMING', location: 'p.1', confidence: 0.98 },
        { name: '护照号', value: 'E12345678', location: 'p.1', confidence: 0.99 },
        { name: '有效期至', value: '2034-05-12', location: 'p.1', confidence: 0.97 },
        { name: '出生日期', value: '1996-03-04', location: 'p.1', confidence: 0.96 },
      ],
    },
    {
      id: 'm-invitation',
      file: 'invitation-letter.pdf',
      kind: '邀请函',
      uploadedAt: 1758988800000,
      fields: [
        { name: '被邀请人', value: 'Xiaoming Wang', location: 'p.1', confidence: 0.91 },
        { name: '邀请方', value: 'ACME Trading LLC', location: 'p.1', confidence: 0.94 },
        { name: '行程日期', value: '2026-11-16 ~ 2026-11-27', location: 'p.2', confidence: 0.89 },
      ],
      issues: [
        { field: '被邀请人', message: '与护照姓名拼写顺序不一致,待确认', severity: 'warning' },
      ],
    },
    {
      id: 'm-ds160',
      file: 'ds160-confirmation.pdf',
      kind: 'DS-160 确认页',
      uploadedAt: 1759075200000,
      fields: [
        { name: 'DS-160 编号', value: 'AA00B2C3D4', location: 'p.1', confidence: 0.99 },
        { name: '出生日期', value: '1996-03-05', location: 'p.1', confidence: 0.95 },
      ],
    },
  ],
  conflicts: [
    {
      id: 'c-name',
      field: '姓名',
      values: [
        { value: 'WANG XIAOMING', from: 'passport.pdf', location: 'p.1' },
        { value: 'Xiaoming Wang', from: 'invitation-letter.pdf', location: 'p.1' },
      ],
      resolution: 'open',
    },
    {
      id: 'c-dob',
      field: '出生日期',
      values: [
        { value: '1996-03-04', from: 'passport.pdf', location: 'p.1' },
        { value: '1996-03-05', from: 'ds160-confirmation.pdf', location: 'p.1' },
      ],
      resolution: 'open',
    },
  ],
  evidence: [
    {
      id: 'ev-1',
      title: 'Visitor Visa — B-1/B-2 Required Documents',
      source: 'travel.state.gov',
      url: 'https://travel.state.gov/content/travel/en/us-visas/business.html',
      effectiveDate: '2026-04-01',
      retrievedAt: '2026-09-26T08:30:00Z',
      retrieval: 'hybrid',
      score: 0.91,
      query: '商务签证 需要哪些材料 邀请函',
      snippet: 'B-1 商务访问申请人一般需提供:有效护照、DS-160 确认页、符合规格的照片、美方机构出具的邀请函,以及能够证明访问目的与足够资金约束的材料……',
    },
    {
      id: 'ev-2',
      title: '照片要求(_DIGITAL IMAGE REQUIREMENTS)',
      source: 'travel.state.gov',
      url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html',
      effectiveDate: '2026-04-01',
      retrievedAt: '2026-09-26T08:30:00Z',
      retrieval: 'hybrid',
      score: 0.87,
      query: '签证照片 尺寸 白底',
      snippet: '照片应为 51mm×51mm 正方形白色背景,6 个月内拍摄,头部占画面 50%-69%……',
    },
    {
      id: 'ev-3',
      title: 'DS-160 表格填写指引',
      source: 'ceac.state.gov',
      url: 'https://ceac.state.gov/genniv/',
      effectiveDate: '2026-02-10',
      retrievedAt: '2026-09-26T08:31:12Z',
      retrieval: 'keyword',
      score: 0.82,
      query: 'DS-160 确认页 提交',
      snippet: '完成 DS-160 后请打印确认页并在面谈时携带,确认页上的条形码编号用于预约……',
    },
  ],
  updatedAt: 1759075200000,
}
