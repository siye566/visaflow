import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Plane } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { navigate, routes } from '@/lib/navigate'
import { VISA_FLOW_LABEL, VISA_FLOW_PRESET } from './types'

interface VisaFlowStartCardProps {
  disabled?: boolean
}

interface IntakeForm {
  applicantName: string
  destination: string
  travelPurpose: string
  plannedDepartureDate: string
  note: string
}

const EMPTY_FORM: IntakeForm = {
  applicantName: '',
  destination: '',
  travelPurpose: 'tourism',
  plannedDepartureDate: '',
  note: '',
}

/**
 * Empty-session entry point for VisaFlow. Shown on any brand-new chat:
 * registering a case navigates through the new-session action, which creates
 * a session carrying the `visaflow` label AND the `visaflow` system prompt
 * preset (the marker the case panel and the agent prompt key on), then
 * auto-sends the intake message that starts stage one.
 */
export function VisaFlowStartCard({ disabled }: VisaFlowStartCardProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<IntakeForm>(EMPTY_FORM)

  const canSubmit = form.applicantName.trim().length > 0 && form.destination.trim().length > 0

  const openDialog = React.useCallback(() => {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }, [])

  const handleSubmit = React.useCallback(() => {
    if (!canSubmit) return
    const purpose = t(`visaflow.purpose.${form.travelPurpose}`)
    const trimmedNote = form.note.trim()
    const note = trimmedNote
      ? `\n${t('visaflow.intake.notePrefix', { note: trimmedNote, interpolation: { escapeValue: false } })}`
      : ''
    const message = t('visaflow.intake.message', {
      name: form.applicantName.trim(),
      destination: form.destination.trim(),
      purpose,
      date: form.plannedDepartureDate || t('visaflow.intake.dateUnset'),
      note,
      interpolation: { escapeValue: false },
    })
    setDialogOpen(false)
    // One-shot creation route: session gets the visaflow preset + label and
    // the intake message is sent right after navigation settles.
    navigate(routes.action.newSession({
      name: `${t('visaflow.caseTitlePrefix')} · ${form.applicantName.trim()}`,
      systemPrompt: VISA_FLOW_PRESET,
      label: VISA_FLOW_LABEL,
      input: message,
      send: true,
    }))
  }, [canSubmit, form, t])

  return (
    <div className="min-h-[46vh] flex items-center justify-center py-10" data-testid="visaflow-start-card">
      <div className="flex flex-col items-center text-center gap-3 max-w-md px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
          <Plane className="h-6 w-6 text-accent" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-semibold">VisaFlow</div>
          <div className="text-sm text-muted-foreground leading-relaxed">
            {t('visaflow.start.subtitle')}
          </div>
        </div>
        <Button size="sm" onClick={openDialog} disabled={disabled} data-testid="visaflow-start-button">
          {t('visaflow.start.cta')}
        </Button>
        <div className="text-[11px] text-muted-foreground/60">{t('visaflow.start.skipHint')}</div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('visaflow.intake.title')}</DialogTitle>
            <DialogDescription>{t('visaflow.intake.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="visaflow-applicant">{t('visaflow.intake.applicantName')}</Label>
                <Input
                  id="visaflow-applicant"
                  value={form.applicantName}
                  onChange={e => setForm(prev => ({ ...prev, applicantName: e.target.value }))}
                  placeholder={t('visaflow.intake.applicantPlaceholder')}
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="visaflow-destination">{t('visaflow.intake.destination')}</Label>
                <Input
                  id="visaflow-destination"
                  value={form.destination}
                  onChange={e => setForm(prev => ({ ...prev, destination: e.target.value }))}
                  placeholder={t('visaflow.intake.destinationPlaceholder')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('visaflow.intake.travelPurpose')}</Label>
                <Select
                  value={form.travelPurpose}
                  onValueChange={value => setForm(prev => ({ ...prev, travelPurpose: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tourism">{t('visaflow.purpose.tourism')}</SelectItem>
                    <SelectItem value="business">{t('visaflow.purpose.business')}</SelectItem>
                    <SelectItem value="family">{t('visaflow.purpose.family')}</SelectItem>
                    <SelectItem value="study">{t('visaflow.purpose.study')}</SelectItem>
                    <SelectItem value="work">{t('visaflow.purpose.work')}</SelectItem>
                    <SelectItem value="other">{t('visaflow.purpose.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="visaflow-date">{t('visaflow.intake.departureDate')}</Label>
                <Input
                  id="visaflow-date"
                  type="date"
                  value={form.plannedDepartureDate}
                  onChange={e => setForm(prev => ({ ...prev, plannedDepartureDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="visaflow-note">{t('visaflow.intake.note')}</Label>
              <Textarea
                id="visaflow-note"
                rows={2}
                value={form.note}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder={t('visaflow.intake.notePlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
              {t('visaflow.intake.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
