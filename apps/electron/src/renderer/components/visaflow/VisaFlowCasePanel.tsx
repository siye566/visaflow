import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  ExternalLink,
  FileSearch,
  Plane,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  VISA_FLOW_STAGES,
  type ChecklistItemStatus,
  type VisaFlowCase,
  type VisaFlowStage,
} from './types'
import { useVisaFlowCase } from './use-visaflow-case'

interface VisaFlowCasePanelProps {
  sessionId: string
  enabled: boolean
  onOpenUrl?: (url: string) => void
}

const STAGE_ICONS: Record<VisaFlowStage, React.ReactNode> = {
  intake: <CircleDashed className="h-3 w-3" />,
  'type-judgment': <FileSearch className="h-3 w-3" />,
  checklist: <BookOpenCheck className="h-3 w-3" />,
  verification: <ShieldCheck className="h-3 w-3" />,
  remediation: <RefreshCw className="h-3 w-3" />,
}

function stageLabelKey(stage: VisaFlowStage): string {
  return `visaflow.stage.${stage}`
}

function StagePipeline({ current, compact = false }: { current: VisaFlowStage; compact?: boolean }) {
  const { t } = useTranslation()
  const currentIndex = VISA_FLOW_STAGES.indexOf(current)

  return (
    <div className="flex items-center gap-1" data-testid="visaflow-stage-pipeline">
      {VISA_FLOW_STAGES.map((stage, index) => {
        const isDone = index < currentIndex
        const isCurrent = index === currentIndex
        return (
          <React.Fragment key={stage}>
            {index > 0 && <div className={cn('h-px w-3', isDone ? 'bg-accent' : 'bg-border')} />}
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] whitespace-nowrap',
                isCurrent && 'bg-accent/15 text-accent font-medium',
                isDone && 'text-muted-foreground',
                !isDone && !isCurrent && 'text-muted-foreground/50',
              )}
              title={t(stageLabelKey(stage))}
            >
              {isDone ? <Check className="h-3 w-3" /> : STAGE_ICONS[stage]}
              {!compact && <span>{t(stageLabelKey(stage))}</span>}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

const CHECKLIST_STATUS_STYLES: Record<ChecklistItemStatus, string> = {
  missing: 'text-muted-foreground/60 border-border',
  uploaded: 'text-accent border-accent/40 bg-accent/10',
  verified: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  conflict: 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10',
  waived: 'text-muted-foreground/60 border-border line-through',
}

function ChecklistSection({ caseData }: { caseData: VisaFlowCase }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{t('visaflow.panel.checklist')}</div>
      <div className="rounded-md border border-border/60 divide-y divide-border/40 overflow-hidden">
        {caseData.checklist.map(item => (
          <div key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-foreground/[0.02]">
            <span className="flex-1 text-xs">
              {item.name}
              {item.required && <span className="ml-1 text-destructive/80">*</span>}
              {item.note && <span className="ml-2 text-[11px] text-muted-foreground/70">{item.note}</span>}
            </span>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', CHECKLIST_STATUS_STYLES[item.status])}>
              {t(`visaflow.status.${item.status}`)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function MaterialsSection({ caseData }: { caseData: VisaFlowCase }) {
  const { t } = useTranslation()
  if (caseData.materials.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{t('visaflow.panel.materials')}</div>
      <div className="grid grid-cols-1 gap-1.5">
        {caseData.materials.map(material => (
          <div key={material.id} className="rounded-md border border-border/60 bg-foreground/[0.02] px-2.5 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">{material.file}</span>
              {material.kind && <span className="text-[11px] text-muted-foreground">· {material.kind}</span>}
            </div>
            {material.fields.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pl-5">
                {material.fields.map((field, idx) => (
                  <span key={idx} className="text-[11px] text-muted-foreground">
                    {field.name}
                    {' '}
                    <span className="text-foreground">{field.value}</span>
                    {field.location && <span className="text-muted-foreground/50"> ({field.location})</span>}
                  </span>
                ))}
              </div>
            )}
            {material.issues && material.issues.length > 0 && (
              <div className="pl-5 space-y-0.5">
                {material.issues.map((issue, idx) => (
                  <div key={idx} className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {issue.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ConflictsSection({ caseData }: { caseData: VisaFlowCase }) {
  const { t } = useTranslation()
  if (caseData.conflicts.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {t('visaflow.panel.conflicts')}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 dark:text-amber-400 border-amber-500/40">
          {caseData.conflicts.filter(c => c.resolution === 'open').length}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {caseData.conflicts.map(conflict => (
          <div key={conflict.id} className="rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{conflict.field}</span>
              <span className="text-[10px] text-muted-foreground">
                {conflict.resolution === 'open'
                  ? t('visaflow.conflict.open')
                  : t('visaflow.conflict.confirmed')}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {conflict.values.map((entry, idx) => (
                <span key={idx} className="text-[11px] text-muted-foreground">
                  <span className="text-foreground">{entry.value}</span>
                  {' '}
                  ← {entry.from}{entry.location ? ` ${entry.location}` : ''}
                </span>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground/70">{t('visaflow.conflict.hint')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EvidenceSection({ caseData, onOpenUrl }: { caseData: VisaFlowCase; onOpenUrl?: (url: string) => void }) {
  const { t } = useTranslation()
  if (caseData.evidence.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {t('visaflow.panel.evidence')}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">RAG</Badge>
      </div>
      <div className="space-y-1.5">
        {caseData.evidence.map(evidence => (
          <div key={evidence.id} className="rounded-md border border-border/60 bg-foreground/[0.02] px-2.5 py-2 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium">{evidence.title}</span>
              {evidence.score !== undefined && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  {evidence.retrieval === 'hybrid' ? t('visaflow.evidence.hybrid') : evidence.retrieval === 'vector' ? t('visaflow.evidence.vector') : t('visaflow.evidence.keyword')} · {evidence.score.toFixed(2)}
                </Badge>
              )}
              {evidence.effectiveDate && (
                <span className="text-[10px] text-muted-foreground/70">{t('visaflow.evidence.effective')} {evidence.effectiveDate}</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">{evidence.snippet}</div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
              <span>{evidence.source}</span>
              {evidence.url && onOpenUrl && (
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-accent hover:underline"
                  onClick={() => onOpenUrl(evidence.url!)}
                >
                  {t('visaflow.evidence.viewSource')}
                  <ExternalLink className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground/60">{t('visaflow.evidence.disclaimer')}</div>
    </div>
  )
}

function CaseInfoHeader({ caseData }: { caseData: VisaFlowCase }) {
  const { t } = useTranslation()
  const visaStatus = caseData.visaType?.status
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {caseData.destinationName && (
        <Badge variant="secondary" className="text-[11px] font-normal">{caseData.destinationName}</Badge>
      )}
      {caseData.visaType?.code && (
        <Badge
          variant="outline"
          className={cn(
            'text-[11px] font-normal',
            visaStatus === 'confirmed' && 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
            visaStatus === 'inferred' && 'text-accent border-accent/40',
          )}
        >
          {caseData.visaType.code}
          {visaStatus && ` · ${t(`visaflow.visaType.${visaStatus}`)}`}
        </Badge>
      )}
      {caseData.travelPurpose && <span className="text-[11px] text-muted-foreground">{caseData.travelPurpose}</span>}
      {caseData.applicant?.name && (
        <span className="text-[11px] text-muted-foreground">· {caseData.applicant.name}</span>
      )}
      {caseData.plannedDepartureDate && (
        <span className="text-[11px] text-muted-foreground">· {t('visaflow.panel.departure')} {caseData.plannedDepartureDate}</span>
      )}
    </div>
  )
}

export function VisaFlowCasePanel({ sessionId, enabled, onOpenUrl }: VisaFlowCasePanelProps) {
  const { t } = useTranslation()
  const { caseData, loading, notFound, demoMode, reload, loadDemo, exitDemo } = useVisaFlowCase(sessionId, enabled)
  const [expanded, setExpanded] = React.useState(false)

  if (!enabled) return null

  const openConflicts = caseData?.conflicts.filter(c => c.resolution === 'open').length ?? 0

  return (
    <div className="px-3 pt-2" data-testid="visaflow-case-panel">
      <div className="rounded-lg border border-border/60 bg-background/60 overflow-hidden">
        {/* Collapsed bar: always visible for visa sessions */}
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-foreground/[0.03] transition-colors"
        >
          <Plane className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="text-xs font-medium shrink-0">VisaFlow</span>
          {caseData ? (
            <>
              <StagePipeline current={caseData.stage} compact />
              <span className="hidden @md/panel:inline text-[11px] text-muted-foreground whitespace-nowrap">
                {t(stageLabelKey(caseData.stage))}
              </span>
              {openConflicts > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 dark:text-amber-400 border-amber-500/40 shrink-0">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                  {openConflicts}
                </Badge>
              )}
              {caseData.rulePack && (
                <span className="hidden @lg/panel:inline text-[10px] text-muted-foreground/60 whitespace-nowrap">
                  {t('visaflow.panel.rulePack')} v{caseData.rulePack.version}
                </span>
              )}
              {caseData.isDemo && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground shrink-0">
                  {t('visaflow.demo.badge')}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground truncate">
              {loading ? t('visaflow.panel.loading') : notFound ? t('visaflow.panel.noCase') : ''}
            </span>
          )}
          <span className="ml-auto shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-border/40 px-3 py-2.5 space-y-3 max-h-[320px] overflow-y-auto">
            {caseData ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <StagePipeline current={caseData.stage} />
                  <div className="flex items-center gap-1 shrink-0">
                    {demoMode ? (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={exitDemo}>
                        <X className="h-3 w-3 mr-1" />
                        {t('visaflow.demo.exit')}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => void reload()}>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        {t('visaflow.panel.refresh')}
                      </Button>
                    )}
                  </div>
                </div>
                <CaseInfoHeader caseData={caseData} />
                {caseData.visaType?.note && (
                  <div className="text-[11px] text-muted-foreground/80">{caseData.visaType.note}</div>
                )}
                {caseData.rulePack && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    {t('visaflow.panel.rulePack')}: {caseData.rulePack.id} v{caseData.rulePack.version}
                    {caseData.rulePack.effectiveDate && ` · ${t('visaflow.evidence.effective')} ${caseData.rulePack.effectiveDate}`}
                    {caseData.rulePack.reviewStatus === 'reviewed' && ` · ${t('visaflow.rulePack.reviewed')}`}
                  </div>
                )}
                <ChecklistSection caseData={caseData} />
                <ConflictsSection caseData={caseData} />
                <MaterialsSection caseData={caseData} />
                <EvidenceSection caseData={caseData} onOpenUrl={onOpenUrl} />
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Sparkles className="h-5 w-5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">{t('visaflow.panel.waitingAgent')}</p>
                <p className="text-[11px] text-muted-foreground/60 max-w-sm">{t('visaflow.panel.contractHint')}</p>
                {!demoMode && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={loadDemo}>
                    <Sparkles className="h-3 w-3 mr-1" />
                    {t('visaflow.demo.load')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
