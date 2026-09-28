import * as React from 'react'
import { VISA_FLOW_CASE_FILENAME, isVisaFlowCase, type VisaFlowCase } from './types'
import { VISA_FLOW_DEMO_CASE } from './demo-case'

interface SessionFileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: SessionFileEntry[]
}

function findCaseFile(entries: SessionFileEntry[] | undefined): SessionFileEntry | null {
  if (!entries) return null
  for (const entry of entries) {
    if (entry.type === 'file' && entry.name === VISA_FLOW_CASE_FILENAME) return entry
    const nested = findCaseFile(entry.children)
    if (nested) return nested
  }
  return null
}

/**
 * Load the VisaFlow case state for a session.
 *
 * Contract: the agent maintains `visaflow-case.json` inside its session
 * folder. The panel polls it (the shared session-file watcher is owned by
 * SessionFilesSection, so the panel deliberately does not call watch APIs)
 * and can additionally show built-in sample data via demo mode.
 */
export function useVisaFlowCase(sessionId: string | undefined, enabled: boolean) {
  const [caseData, setCaseData] = React.useState<VisaFlowCase | null>(null)
  const [demoMode, setDemoMode] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [notFound, setNotFound] = React.useState(false)

  const fetchCase = React.useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const files = (await window.electronAPI.getSessionFiles(sessionId)) as SessionFileEntry[]
      const entry = findCaseFile(files)
      if (!entry) {
        setNotFound(true)
        setCaseData(null)
        return
      }
      setNotFound(false)
      const content = await window.electronAPI.readFile(entry.path)
      const parsed: unknown = JSON.parse(content)
      setCaseData(isVisaFlowCase(parsed) ? parsed : null)
    } catch {
      // Missing file, unreadable content or a JSON/schema mismatch — the
      // panel falls back to its empty state either way.
      setNotFound(true)
      setCaseData(null)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  React.useEffect(() => {
    if (!enabled || !sessionId || demoMode) return
    void fetchCase()
    const timer = setInterval(() => { void fetchCase() }, 15_000)
    return () => clearInterval(timer)
  }, [enabled, sessionId, demoMode, fetchCase])

  const loadDemo = React.useCallback(() => {
    setDemoMode(true)
    setCaseData({ ...VISA_FLOW_DEMO_CASE, updatedAt: Date.now() })
  }, [])

  const exitDemo = React.useCallback(() => {
    setDemoMode(false)
    void fetchCase()
  }, [fetchCase])

  return { caseData, loading, notFound, demoMode, reload: fetchCase, loadDemo, exitDemo }
}
