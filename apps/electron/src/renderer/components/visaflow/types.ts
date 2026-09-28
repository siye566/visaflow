/**
 * VisaFlow case model — the renderer-side contract for visa application cases.
 *
 * The agent persists the case state as `visaflow-case.json` in its session
 * folder; this panel renders that file. Retrieval (RAG) results land in
 * `evidence` and are advisory: the reviewed `rulePack` stays the source of
 * truth for material requirements, never the raw retrieved snippet.
 */

/** 办理流程节点:信息采集 → 类型判断 → 清单生成 → 材料核验 → 补正复核 */
export type VisaFlowStage =
  | 'intake'
  | 'type-judgment'
  | 'checklist'
  | 'verification'
  | 'remediation'

export const VISA_FLOW_STAGES: VisaFlowStage[] = [
  'intake',
  'type-judgment',
  'checklist',
  'verification',
  'remediation',
]

export const VISA_FLOW_CASE_FILENAME = 'visaflow-case.json'
/** Session label marking a session as a VisaFlow case. */
export const VISA_FLOW_LABEL = 'visaflow'
/** systemPromptPreset value selecting the VisaFlow agent prompt. */
export const VISA_FLOW_PRESET = 'visaflow'

export type ChecklistItemStatus = 'missing' | 'uploaded' | 'verified' | 'conflict' | 'waived'

export interface VisaFlowRulePack {
  /** Rule pack id, e.g. "US-B1B2". */
  id: string
  /** Reviewed version the case is pinned to, e.g. "1.4.2". */
  version: string
  effectiveDate?: string
  source?: string
  reviewStatus?: 'reviewed' | 'draft'
}

/**
 * One retrieved rule fragment (hybrid recall over the visa knowledge base).
 * Evidence is shown with provenance so conflicts stay reviewable.
 */
export interface VisaFlowEvidence {
  id: string
  title: string
  /** Source host, e.g. "travel.state.gov" (whitelist-checked upstream). */
  source: string
  url?: string
  effectiveDate?: string
  retrievedAt?: string
  /** Retrieval mode: hybrid | keyword | vector. */
  retrieval?: 'hybrid' | 'keyword' | 'vector'
  /** Match score (0-1) from the retriever; display only. */
  score?: number
  query?: string
  snippet: string
}

export interface VisaFlowChecklistItem {
  id: string
  name: string
  required: boolean
  status: ChecklistItemStatus
  note?: string
}

export interface VisaFlowField {
  name: string
  value: string
  /** Where in the source document the value was read from, e.g. "p.1". */
  location?: string
  confidence?: number
}

export interface VisaFlowIssue {
  field: string
  message: string
  severity: 'error' | 'warning'
}

export interface VisaFlowMaterial {
  id: string
  file: string
  kind?: string
  uploadedAt?: number
  fields: VisaFlowField[]
  issues?: VisaFlowIssue[]
}

export interface VisaFlowConflict {
  id: string
  /** Cross-document field in conflict, e.g. 姓名 / 出生日期 / 证件号. */
  field: string
  values: { value: string; from: string; location?: string }[]
  resolution: 'open' | 'confirmed'
  chosenValue?: string
}

export interface VisaFlowApplicant {
  name?: string
  nationality?: string
}

export interface VisaFlowCase {
  schemaVersion: 1
  applicant?: VisaFlowApplicant
  destination?: string
  destinationName?: string
  travelPurpose?: string
  plannedDepartureDate?: string
  visaType?: {
    code?: string
    status?: 'confirmed' | 'inferred' | 'undetermined'
    note?: string
  }
  stage: VisaFlowStage
  rulePack?: VisaFlowRulePack
  checklist: VisaFlowChecklistItem[]
  materials: VisaFlowMaterial[]
  conflicts: VisaFlowConflict[]
  evidence: VisaFlowEvidence[]
  updatedAt?: number
  /** Set by the panel when displaying built-in sample data. */
  isDemo?: boolean
}

export function isVisaFlowCase(value: unknown): value is VisaFlowCase {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return c.schemaVersion === 1
    && typeof c.stage === 'string'
    && VISA_FLOW_STAGES.includes(c.stage as VisaFlowStage)
    && Array.isArray(c.checklist)
    && Array.isArray(c.materials)
    && Array.isArray(c.conflicts)
    && Array.isArray(c.evidence)
}
