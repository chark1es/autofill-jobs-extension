import { useCallback, useEffect, useState } from 'preact/hooks'
import type { DetectedField, DetectResult, Experience, Education, MatchStatus, Store } from '../lib/types'
import { EMPTY_IDENTITY, EMPTY_STORE } from '../lib/types'
import { fromExportBundle, loadStore, saveStore, subscribeStore, toExportBundle, uid } from '../lib/storage'
import { sendTabOrInject } from '../lib/messages'
import { findSavedAnswer, heuristicValue, isOpenEndedField, needsAI, suggestionHints } from '../lib/match'
import { completeWithOpenRouter, fetchModelPricing, formatModelCost, formatUsdShort, type ModelPricing } from '../lib/openrouter'
import { CUSTOM_MODEL, isPresetModel, OPENROUTER_MODELS } from '../lib/types'
import { Icon } from './icons'

type Tab = 'fill' | 'profile' | 'experience' | 'resume' | 'settings'

interface Row {
  field: DetectedField
  value: string
  status: MatchStatus
  source: 'heuristic' | 'ai'
  failureReason?: string
}

async function currentTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

function valuesMatch(current: string, planned: string): boolean {
  if (!current || !planned || planned === '__resume__') return false
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalize(current) === normalize(planned)
}

function rowsFor(detect: DetectResult, store: Store): Row[] {
  return detect.fields.map((field) => {
    const saved = findSavedAnswer(field.label, store)
    const plannedValue = saved || heuristicValue(field, store)
    const value = plannedValue || field.currentValue
    const status: MatchStatus = field.currentValue && (!plannedValue || valuesMatch(field.currentValue, plannedValue))
      ? 'filled'
      : plannedValue
        ? 'mapped'
        : needsAI(field, plannedValue)
          ? 'needs-ai'
          : 'empty'
    return { field, value, status, source: 'heuristic' }
  })
}

function experienceProgress(rows: Row[]): { label: string; tone: MatchStatus } {
  if (!rows.length) return { label: 'Not on form', tone: 'empty' }
  const filled = rows.filter((row) => row.status === 'filled').length
  const failed = rows.filter((row) => row.status === 'failed').length
  const ready = rows.filter((row) => Boolean(row.value)).length
  if (filled === rows.length) return { label: 'Filled', tone: 'filled' }
  if (filled > 0) return { label: `${filled}/${rows.length} filled`, tone: 'needs-ai' }
  if (failed > 0) return { label: 'Fill failed', tone: 'failed' }
  if (ready < rows.length) return { label: 'Needs info', tone: 'needs-ai' }
  return { label: 'Not filled', tone: 'empty' }
}

async function linkedInProfileTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null
  const current = await currentTab()
  if (current?.url && /^https:\/\/([^.]+\.)?linkedin\.com\/in\/[^/]+/i.test(current.url)) {
    return current
  }
  const tabs = await chrome.tabs.query({})
  const profiles = tabs.filter(
    (candidate) => candidate.id && candidate.url && /^https:\/\/([^.]+\.)?linkedin\.com\/in\/[^/]+/i.test(candidate.url),
  )
  profiles.sort((a, b) => {
    if (a.windowId === current?.windowId && b.windowId !== current?.windowId) return -1
    if (b.windowId === current?.windowId && a.windowId !== current?.windowId) return 1
    return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)
  })
  return profiles[0] ?? null
}

async function ensureDetect(tabId: number): Promise<DetectResult> {
  if (!chrome.tabs?.sendMessage) throw new Error('Not running as an extension.')
  return sendTabOrInject(tabId, { type: 'DETECT' })
}

export function App({ mode }: { mode: 'popup' | 'options' | 'sidepanel' }) {
  const [store, setStore] = useState<Store>(EMPTY_STORE)
  const [tab, setTab] = useState<Tab>('fill')
  const [detect, setDetect] = useState<DetectResult | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState('')
  const [writingUid, setWritingUid] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void loadStore().then(setStore)
    return subscribeStore(setStore)
  }, [])

  useEffect(() => {
    const h = location.hash.replace('#', '') as Tab
    if (h === 'profile' || h === 'experience' || h === 'resume' || h === 'settings' || h === 'fill') {
      setTab(h)
    }
  }, [])

  const persist = useCallback(async (next: Store) => {
    setStore(next)
    await saveStore(next)
  }, [])

  const refreshDetect = useCallback(async () => {
    setError('')
    const t = await currentTab()
    if (!t?.id || !t.url || t.url.startsWith('chrome')) {
      setDetect(null)
      setRows([])
      return
    }
    try {
      const d = await ensureDetect(t.id)
      setDetect(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this page.')
    }
  }, [])

  useEffect(() => {
    void refreshDetect()
  }, [refreshDetect])

  useEffect(() => {
    if (mode !== 'sidepanel' || typeof chrome === 'undefined' || !chrome.tabs) return
    const refresh = () => void refreshDetect()
    const updated = (_tabId: number, change: chrome.tabs.TabChangeInfo, changedTab: chrome.tabs.Tab) => {
      if (changedTab.active && (change.url || change.status === 'complete')) refresh()
    }
    chrome.tabs.onActivated.addListener(refresh)
    chrome.tabs.onUpdated.addListener(updated)
    return () => {
      chrome.tabs.onActivated.removeListener(refresh)
      chrome.tabs.onUpdated.removeListener(updated)
    }
  }, [mode, refreshDetect])

  useEffect(() => {
    if (!detect) {
      setRows([])
      return
    }
    setRows(rowsFor(detect, store))
  }, [detect, store])

  const mapped = rows.filter((r) => r.status === 'mapped' || r.value).length
  const aiCount = rows.filter((r) => r.status === 'needs-ai').length
  const displayName = [store.identity.firstName, store.identity.lastName].filter(Boolean).join(' ')

  function updateRowValue(uid: string, value: string) {
    setRows((current) => current.map((row) => {
      if (row.field.uid !== uid) return row
      return {
        ...row,
        value,
        status: value ? 'mapped' : needsAI(row.field, value) ? 'needs-ai' : 'empty',
        failureReason: undefined,
      }
    }))
  }

  async function answerWithAI(uid: string) {
    const row = rows.find((candidate) => candidate.field.uid === uid)
    if (!row) return
    if (!store.settings.enabled) {
      setError('Turn Carbon on before generating an answer.')
      return
    }
    if (!store.settings.openrouterKey) {
      setError('Add an OpenRouter key in Settings before asking AI to write an answer.')
      return
    }
    if (!store.settings.openrouterModel) {
      setError('Choose an OpenRouter model in Settings before asking AI to write an answer.')
      return
    }
    setError('')
    setNotice('')
    setBusy('Writing tailored answer')
    setWritingUid(uid)
    setRows((current) => current.map((candidate) =>
      candidate.field.uid === uid ? { ...candidate, status: 'writing' } : candidate,
    ))
    try {
      const value = await completeWithOpenRouter({
        key: store.settings.openrouterKey,
        model: store.settings.openrouterModel,
        question: row.field.label,
        options: row.field.options,
        store,
        pageTitle: detect?.title ?? '',
      })
      const active = await currentTab()
      if (!active?.id) throw new Error('No active tab.')
      const result = await sendTabOrInject(active.id, {
        type: 'FILL',
        payload: {
          items: [{
            uid,
            value,
            source: 'ai',
            suggestionHints: suggestionHints(row.field, store),
          }],
        },
      })
      const failure = result.failed.find((item) => item.uid === uid)
      const filled = result.filledUids.includes(uid)
      setRows((current) => current.map((candidate) =>
        candidate.field.uid === uid
          ? {
              ...candidate,
              value,
              status: filled ? 'filled' : 'failed',
              source: 'ai',
              failureReason: failure?.reason ?? (filled ? undefined : "The page didn't accept this answer."),
            }
          : candidate,
      ))
      if (!filled) throw new Error(failure?.reason ?? "The page didn't accept this answer.")
      setNotice('Generated and filled the answer. You can still review or edit it.')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not write the answer.'
      setRows((current) => current.map((candidate) =>
        candidate.field.uid === uid
          ? { ...candidate, status: 'failed', failureReason: message }
          : candidate,
      ))
      setError(message)
    } finally {
      setWritingUid('')
      setBusy('')
    }
  }

  async function fillNow() {
    setError('')
    if (!store.settings.enabled) {
      setError('Turn Carbon on before filling this page.')
      return
    }
    setBusy('Filling')
    const t = await currentTab()
    if (!t?.id) {
      setBusy('')
      setError('No active tab.')
      return
    }
    try {
      await sendTabOrInject(t.id, {
        type: 'EXPAND_REPEATERS',
        payload: { experience: store.experience.length, education: store.education.length },
      })
      const freshDetect = await ensureDetect(t.id)
      setDetect(freshDetect)
      const drafts = new Map(
        rows
          .filter((row) => isOpenEndedField(row.field) && row.value)
          .map((row) => [row.field.uid, row] as const),
      )
      const nextRows = rowsFor(freshDetect, store).map((row) => {
        const draft = drafts.get(row.field.uid)
        if (!draft) return row
        return {
          ...row,
          value: draft.value,
          source: draft.source,
          status: valuesMatch(row.field.currentValue, draft.value) ? 'filled' as const : 'mapped' as const,
        }
      })
      setRows(nextRows)
      for (let i = 0; i < nextRows.length; i++) {
        const row = nextRows[i]
        if (row.value) continue
        if (row.status !== 'needs-ai') continue
        if (!store.settings.openrouterKey) {
          nextRows[i] = {
            ...row,
            status: 'failed',
            failureReason: 'Add an OpenRouter key in Settings to generate this answer.',
          }
          continue
        }
        nextRows[i] = { ...row, status: 'writing' }
        setRows([...nextRows])
        try {
          const text = await completeWithOpenRouter({
            key: store.settings.openrouterKey,
            model: store.settings.openrouterModel,
            question: row.field.label,
            options: row.field.options,
            store,
            pageTitle: freshDetect.title || t.title || '',
          })
          nextRows[i] = { ...row, value: text, status: 'mapped', source: 'ai' }
        } catch (e) {
          nextRows[i] = {
            ...row,
            status: 'failed',
            failureReason: e instanceof Error ? e.message : 'OpenRouter failed.',
          }
          setError(e instanceof Error ? e.message : 'OpenRouter failed.')
        }
        setRows([...nextRows])
      }
      const items = nextRows
        .filter((r) => r.value)
        .map((r) => ({
          uid: r.field.uid,
          value: r.value,
          source: r.source,
          suggestionHints: suggestionHints(r.field, store),
        }))
      const resume = store.resume
        ? { name: store.resume.name, mime: store.resume.mime, dataBase64: store.resume.dataBase64 }
        : undefined
      const result = await sendTabOrInject(t.id, { type: 'FILL', payload: { items, resume } })
      const filled = new Set(result.filledUids ?? [])
      const failed = new Map(result.failed.map((item) => [item.uid, item.reason]))
      setRows(nextRows.map((row) => ({
        ...row,
        status: filled.has(row.field.uid) ? 'filled' : 'failed',
        failureReason: filled.has(row.field.uid)
          ? undefined
          : failed.get(row.field.uid) ?? row.failureReason ?? (row.value ? "The page didn't accept this value." : 'No profile value or AI answer was available.'),
      })))
      setNotice(`Wrote ${result.filled} fields${result.failed.length ? ` · ${result.failed.length} failed` : ''}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fill failed.')
    } finally {
      setBusy('')
    }
  }

  async function importLinkedIn() {
    setError('')
    setBusy('Importing')
    try {
      const t = await linkedInProfileTab()
      if (!t?.id) throw new Error('Open your LinkedIn profile in a tab, then try again.')
      const data = await sendTabOrInject(t.id, { type: 'IMPORT_LINKEDIN' }) as Partial<Store> & { error?: string }
      if (data.error) throw new Error(data.error)
      const next: Store = {
        ...store,
        identity: { ...store.identity, ...data.identity },
        experience: data.experience?.length ? data.experience : store.experience,
        education: data.education?.length ? data.education : store.education,
        skills: data.skills?.length ? data.skills : store.skills,
      }
      await persist(next)
      const counts = [
        data.experience?.length ? `${data.experience.length} roles` : '',
        data.education?.length ? `${data.education.length} schools` : '',
        data.skills?.length ? `${data.skills.length} skills` : '',
      ].filter(Boolean)
      setNotice(`LinkedIn profile imported${counts.length ? `: ${counts.join(', ')}` : ''}.`)
      setTab('profile')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LinkedIn import failed. Open your profile tab.')
    } finally {
      setBusy('')
    }
  }

  async function exportPageDiagnostics() {
    setError('')
    setBusy('Exporting page data')
    try {
      const active = await currentTab()
      if (!active?.id) throw new Error('No website tab is active.')
      const diagnostics = await sendTabOrInject(active.id, { type: 'COLLECT_PAGE_DIAGNOSTICS' })
      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const host = (diagnostics.page.host || 'website').replace(/[^a-z0-9.-]+/gi, '-')
      link.href = url
      link.download = `carbon-page-diagnostics-${host}.json`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Page diagnostics downloaded. Attach the JSON file when requesting support.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export page diagnostics.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div class="app">
      <header class="header">
        <div>
          <h1>Candidate file</h1>
          <p class="meta status">
            {!store.settings.enabled
              ? 'Carbon is off'
              : busy
              ? busy
              : detect
                ? `${mapped} mapped · ${aiCount} need AI · ${detect.host.replace(/^www\./, '')}`
                : mode === 'options'
                  ? 'Full editor'
                  : 'Open an application form'}
          </p>
        </div>
        <div class="header-actions">
          <label class="enable-switch" title={store.settings.enabled ? 'Disable Carbon' : 'Enable Carbon'}>
            <input
              type="checkbox"
              checked={store.settings.enabled}
              onChange={(event) => void persist({
                ...store,
                settings: { ...store.settings, enabled: (event.target as HTMLInputElement).checked },
              })}
            />
            <span aria-hidden="true" />
            <b>{store.settings.enabled ? 'On' : 'Off'}</b>
          </label>
          <button class="btn btn-primary" disabled={!store.settings.enabled || !!busy || rows.length === 0} onClick={() => void fillNow()}>
            <Icon name="fill" />
            Fill
          </button>
        </div>
      </header>
      <div class="main">
        {error ? <div class="banner error">{error}</div> : null}
        {notice ? <div class="banner ok">{notice}</div> : null}
        {tab === 'fill' ? (
          <FillTab
            store={store}
            detect={detect}
            rows={rows}
            displayName={displayName}
            onRefresh={() => void refreshDetect()}
            onLinkedIn={() => void importLinkedIn()}
            onDiagnostics={() => void exportPageDiagnostics()}
            writingUid={writingUid}
            onAnswerWithAI={(uid) => void answerWithAI(uid)}
            onValueChange={updateRowValue}
          />
        ) : null}
        {tab === 'profile' ? (
          <ProfileTab store={store} onChange={(identity) => void persist({ ...store, identity })} onSkills={(skills) => void persist({ ...store, skills })} />
        ) : null}
        {tab === 'experience' ? (
          <ExperienceTab store={store} rows={rows} persist={persist} />
        ) : null}
        {tab === 'resume' ? (
          <ResumeTab store={store} persist={persist} setError={setError} setNotice={setNotice} />
        ) : null}
        {tab === 'settings' ? (
          <SettingsTab store={store} persist={persist} setError={setError} setNotice={setNotice} onLinkedIn={() => void importLinkedIn()} />
        ) : null}
      </div>
      <nav class="tabs">
        {(
          [
            ['fill', 'Fill', 'fill'],
            ['profile', 'Profile', 'profile'],
            ['experience', 'Jobs', 'experience'],
            ['resume', 'Resume', 'resume'],
            ['settings', 'Settings', 'settings'],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function FillTab({
  store,
  detect,
  rows,
  displayName,
  onRefresh,
  onLinkedIn,
  onDiagnostics,
  writingUid,
  onAnswerWithAI,
  onValueChange,
}: {
  store: Store
  detect: DetectResult | null
  rows: Row[]
  displayName: string
  onRefresh: () => void
  onLinkedIn: () => void
  onDiagnostics: () => void
  writingUid: string
  onAnswerWithAI: (uid: string) => void
  onValueChange: (uid: string, value: string) => void
}) {
  if (detect?.isLinkedIn) {
    return (
      <div class="empty">
        <h2>LinkedIn profile</h2>
        <p>Import visible experience, education, and identity from this tab into the local candidate file.</p>
        <div class="toolbar">
          <button class="btn btn-primary" onClick={onLinkedIn}>
            <Icon name="linkedin" />
            Import from this tab
          </button>
        </div>
      </div>
    )
  }
  const unknownCount = rows.filter((row) => row.field.matchKey === 'unknown').length
  const needsDiagnostics = !detect || rows.length === 0 || unknownCount > 0
  if (!displayName && !store.identity.email) {
    return (
      <div class="empty">
        <h2>Empty candidate file</h2>
        <p>Add identity under Profile, upload a resume, or import from a LinkedIn tab. Fill reads this file, not the page.</p>
        {needsDiagnostics ? <DiagnosticsButton onClick={onDiagnostics} /> : null}
      </div>
    )
  }
  if (!detect || rows.length === 0) {
    return (
      <div class="empty">
        <h2>No form on this page</h2>
        <p>Open a Greenhouse, Lever, Workday, Ashby, or company application, then come back.</p>
        <div class="toolbar">
          <button class="btn btn-ghost" onClick={onRefresh}>Scan again</button>
          <DiagnosticsButton onClick={onDiagnostics} />
        </div>
      </div>
    )
  }
  const filledCount = rows.filter((row) => row.status === 'filled').length
  const failedCount = rows.filter((row) => row.status === 'failed').length
  return (
    <>
      {unknownCount ? (
        <div class="banner support-banner">
          <p>Carbon could not recognize {unknownCount} field{unknownCount === 1 ? '' : 's'} on this page.</p>
          <DiagnosticsButton onClick={onDiagnostics} />
        </div>
      ) : null}
      <div class="strip">
        <span><strong>{displayName || 'Unnamed'}</strong></span>
        {store.identity.email ? <span>{store.identity.email}</span> : null}
        {store.identity.phone ? <span>{store.identity.phone}</span> : null}
        {store.identity.city ? <span>{store.identity.city}</span> : null}
      </div>
      <section class="fill-section">
        <div class="section-heading">
          <h2>Detected inputs</h2>
          <span>{rows.length} found{filledCount ? `, ${filledCount} filled` : ''}{failedCount ? `, ${failedCount} not filled` : ''}</span>
        </div>
        <FieldTable
          rows={rows}
          resumeName={store.resume?.name}
          writingUid={writingUid}
          onAnswerWithAI={onAnswerWithAI}
          onValueChange={onValueChange}
        />
      </section>
    </>
  )
}

function DiagnosticsButton({ onClick }: { onClick: () => void }) {
  return (
    <div class="diagnostics-action">
      <button class="btn btn-ghost" onClick={onClick}>
        <Icon name="download" />
        Export page diagnostics
      </button>
      <small>Entered values and common personal data are removed.</small>
    </div>
  )
}

function StatusChip({ label, tone }: { label: string; tone: MatchStatus }) {
  const className = tone === 'needs-ai' ? 'ai' : tone === 'empty' ? 'status-empty' : tone
  return <span class={`chip ${className}`}>{label}</span>
}

function FieldTable({
  rows,
  resumeName,
  writingUid,
  onAnswerWithAI,
  onValueChange,
}: {
  rows: Row[]
  resumeName?: string
  writingUid: string
  onAnswerWithAI: (uid: string) => void
  onValueChange: (uid: string, value: string) => void
}) {
  return (
    <table class="table compact-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const openEnded = isOpenEndedField(row.field)
          const canGenerate = openEnded || row.status === 'needs-ai' || row.source === 'ai'
          const statusLabel: Record<MatchStatus, string> = {
            mapped: 'Ready',
            'needs-ai': 'Needs AI',
            empty: 'No value',
            skipped: 'Skipped',
            writing: 'Writing',
            filled: 'Filled',
            failed: 'Not filled',
          }
          return (
            <tr key={row.field.uid} class={`${row.status} ${openEnded ? 'open-ended' : ''}`}>
              <td class="field-label">
                {row.field.label}
                {row.field.required ? <small>Required</small> : null}
              </td>
              <td class="field-value">
                <div class={canGenerate ? 'ai-answer' : undefined}>
                  {openEnded && row.value ? (
                    <textarea
                      aria-label={`Answer for ${row.field.label}`}
                      value={row.value}
                      onInput={(event) =>
                        onValueChange(row.field.uid, (event.target as HTMLTextAreaElement).value)}
                    />
                  ) : (
                    <span class={!row.value ? 'answer-placeholder' : undefined}>
                      {row.value === '__resume__' ? resumeName ?? 'Resume' : row.value || 'No value found'}
                    </span>
                  )}
                  {canGenerate ? (
                    <button
                      class="btn btn-ai"
                      disabled={Boolean(writingUid)}
                      onClick={() => onAnswerWithAI(row.field.uid)}
                    >
                      <Icon name="spark" />
                      {writingUid === row.field.uid ? 'Generating…' : row.value ? 'Regenerate' : 'Generate'}
                    </button>
                  ) : null}
                  {row.failureReason ? <small class="failure-reason">{row.failureReason}</small> : null}
                </div>
              </td>
              <td class="status-cell">
                <StatusChip tone={row.status} label={statusLabel[row.status]} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Field({
  label,
  value,
  onInput,
  span,
  type = 'text',
}: {
  label: string
  value: string
  onInput: (v: string) => void
  span?: boolean
  type?: string
}) {
  return (
    <label class={`field ${span ? 'span-2' : ''}`}>
      <span>{label}</span>
      {type === 'textarea' ? (
        <textarea value={value} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
      ) : (
        <input type={type} value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
      )}
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label class="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange((event.target as HTMLSelectElement).value)}>
        <option value="">Select</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

const CITIZENSHIP_OPTIONS = [
  'U.S. citizen',
  'U.S. national',
  'Permanent resident',
  'Non-U.S. citizen',
  'Prefer not to answer',
]
const VISA_OPTIONS = [
  'No visa required',
  'H-1B',
  'F-1 OPT/CPT',
  'TN',
  'O-1',
  'E-3',
  'L-1',
  'J-1',
  'Other work visa',
  'Sponsorship required',
  'Prefer not to answer',
]
const EMPLOYMENT_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship']
const WORK_SETTING_OPTIONS = ['Remote', 'Hybrid', 'On-site', 'No preference']
const GENDER_OPTIONS = [
  'Woman',
  'Man',
  'Non-binary',
  'Self-describe',
  'Prefer not to answer',
]
const ETHNICITY_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Middle Eastern or North African',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Two or more races',
  'Prefer not to answer',
]
const VETERAN_OPTIONS = [
  'I am not a protected veteran',
  'I identify as one or more classifications of a protected veteran',
  'I am a protected veteran',
  'Prefer not to answer',
]
const DISABILITY_OPTIONS = [
  'Yes, I have a disability or have had one in the past',
  'No, I do not have a disability and have not had one in the past',
  'Prefer not to answer',
]

function ProfileTab({
  store,
  onChange,
  onSkills,
}: {
  store: Store
  onChange: (id: Store['identity']) => void
  onSkills: (skills: string[]) => void
}) {
  const id = store.identity
  const set = (k: keyof Store['identity'], v: string) => onChange({ ...id, [k]: v })
  const [skillDraft, setSkillDraft] = useState('')
  return (
    <>
      <div class="form-grid">
        <Field label="First name" value={id.firstName} onInput={(v) => set('firstName', v)} />
        <Field label="Middle name" value={id.middleName} onInput={(v) => set('middleName', v)} />
        <Field label="Last name" value={id.lastName} onInput={(v) => set('lastName', v)} />
        <Field label="Name suffix" value={id.nameSuffix} onInput={(v) => set('nameSuffix', v)} />
        <Field label="Preferred name" value={id.preferredName} onInput={(v) => set('preferredName', v)} />
        <Field label="Pronouns" value={id.pronouns} onInput={(v) => set('pronouns', v)} />
        <Field label="Email" value={id.email} type="email" onInput={(v) => set('email', v)} />
        <Field label="Phone" value={id.phone} type="tel" onInput={(v) => set('phone', v)} />
        <Field label="Alternate phone" value={id.phoneAlt} type="tel" span onInput={(v) => set('phoneAlt', v)} />
        <Field label="Address line 1" value={id.address1} span onInput={(v) => set('address1', v)} />
        <Field label="Address line 2" value={id.address2} span onInput={(v) => set('address2', v)} />
        <Field label="City" value={id.city} onInput={(v) => set('city', v)} />
        <Field label="State" value={id.state} onInput={(v) => set('state', v)} />
        <Field label="Postal code" value={id.postalCode} onInput={(v) => set('postalCode', v)} />
        <Field label="Country" value={id.country} onInput={(v) => set('country', v)} />
        <Field label="LinkedIn" value={id.linkedin} type="url" span onInput={(v) => set('linkedin', v)} />
        <Field label="GitHub" value={id.github} type="url" onInput={(v) => set('github', v)} />
        <Field label="Portfolio" value={id.portfolio} type="url" onInput={(v) => set('portfolio', v)} />
        <Field label="Website" value={id.website} type="url" onInput={(v) => set('website', v)} />
        <Field label="Desired job title" value={id.desiredJobTitle} onInput={(v) => set('desiredJobTitle', v)} />
        <Field label="Years of experience" value={id.yearsExperience} onInput={(v) => set('yearsExperience', v)} />
        <Field label="Headline" value={id.headline} span onInput={(v) => set('headline', v)} />
        <Field label="Summary" value={id.summary} type="textarea" span onInput={(v) => set('summary', v)} />
        <label class="field">
          <span>Work authorized</span>
          <select value={id.workAuthorized} onChange={(e) => set('workAuthorized', (e.target as HTMLSelectElement).value)}>
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label class="field">
          <span>Needs sponsorship</span>
          <select value={id.needsSponsorship} onChange={(e) => set('needsSponsorship', (e.target as HTMLSelectElement).value)}>
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label class="field">
          <span>Willing to relocate</span>
          <select value={id.willingToRelocate} onChange={(e) => set('willingToRelocate', (e.target as HTMLSelectElement).value)}>
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label class="field">
          <span>Willing to travel</span>
          <select value={id.willingToTravel} onChange={(e) => set('willingToTravel', (e.target as HTMLSelectElement).value)}>
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <SelectField label="Citizenship" value={id.citizenship} options={CITIZENSHIP_OPTIONS} onChange={(v) => set('citizenship', v)} />
        <SelectField label="Visa status" value={id.visaStatus} options={VISA_OPTIONS} onChange={(v) => set('visaStatus', v)} />
        <SelectField label="Employment type" value={id.employmentType} options={EMPLOYMENT_OPTIONS} onChange={(v) => set('employmentType', v)} />
        <SelectField label="Work setting" value={id.remotePreference} options={WORK_SETTING_OPTIONS} onChange={(v) => set('remotePreference', v)} />
        <Field label="Salary expectation" value={id.salaryExpectation} onInput={(v) => set('salaryExpectation', v)} />
        <Field label="Notice / start" value={id.noticePeriod} onInput={(v) => set('noticePeriod', v)} />
        <SelectField label="Gender" value={id.gender} options={GENDER_OPTIONS} onChange={(v) => set('gender', v)} />
        <SelectField label="Race / ethnicity" value={id.ethnicity} options={ETHNICITY_OPTIONS} onChange={(v) => set('ethnicity', v)} />
        <SelectField label="Veteran status" value={id.veteranStatus} options={VETERAN_OPTIONS} onChange={(v) => set('veteranStatus', v)} />
        <SelectField label="Disability status" value={id.disabilityStatus} options={DISABILITY_OPTIONS} onChange={(v) => set('disabilityStatus', v)} />
      </div>
      <div class="toolbar" />
      <label class="field span-2">
        <span>Skills</span>
        <div class="skills">
          {store.skills.map((s) => (
            <span class="tag" key={s}>
              {s}
              <button type="button" onClick={() => onSkills(store.skills.filter((x) => x !== s))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          placeholder="Add a skill and press Enter"
          value={skillDraft}
          onInput={(e) => setSkillDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const v = skillDraft.trim()
            if (!v) return
            onSkills([...store.skills, v])
            setSkillDraft('')
          }}
        />
      </label>
    </>
  )
}

function ExperienceTab({
  store,
  rows,
  persist,
}: {
  store: Store
  rows: Row[]
  persist: (s: Store) => Promise<void>
}) {
  const [openCards, setOpenCards] = useState<string[]>([])
  const setCardOpen = (id: string, open: boolean) => {
    setOpenCards((current) => open
      ? current.includes(id) ? current : [...current, id]
      : current.filter((item) => item !== id))
  }
  const addExp = () => {
    const job: Experience = {
      id: uid('exp'), company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '',
    }
    setOpenCards((current) => [...current, job.id])
    void persist({
      ...store,
      experience: [...store.experience, job],
    })
  }
  const addEdu = () => {
    const school: Education = {
      id: uid('edu'), school: '', degree: '', field: '', location: '', startDate: '', endDate: '', gpa: '',
    }
    setOpenCards((current) => [...current, school.id])
    void persist({
      ...store,
      education: [...store.education, school],
    })
  }
  return (
    <>
      <div class="toolbar">
        <button class="btn" onClick={addExp}><Icon name="plus" /> Role</button>
        <button class="btn" onClick={addEdu}><Icon name="plus" /> School</button>
      </div>
      {store.experience.length === 0 && store.education.length === 0 ? (
        <div class="empty">
          <h2>No roles yet</h2>
          <p>Add jobs and schools, or import from LinkedIn / a resume. Repeaters on the form map in list order.</p>
        </div>
      ) : null}
      <div class="card-list">
        {store.experience.map((job, i) => {
          const jobRows = rows.filter(
            (row) => row.field.kind === 'experience' && (row.field.experienceIndex ?? 0) === i,
          )
          const progress = experienceProgress(jobRows)
          const dates = [job.startDate, job.current ? 'Present' : job.endDate].filter(Boolean).join(' – ')
          return (
            <details
              class="compact-card editor-card"
              key={job.id}
              open={openCards.includes(job.id)}
              onToggle={(event) => setCardOpen(job.id, (event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                <span class="card-chevron"><Icon name="chevron" /></span>
                <span class="card-heading">
                  <strong>{job.title || job.company || `Role ${i + 1}`}</strong>
                  <span>{[job.company, dates].filter(Boolean).join(' · ') || 'Add role details'}</span>
                </span>
                <StatusChip label={progress.label} tone={progress.tone} />
              </summary>
              <div class="compact-card-body">
                <div class="card-actions">
                  <button class="btn btn-ghost" onClick={() => void persist({ ...store, experience: store.experience.filter((e) => e.id !== job.id) })}>
                    <Icon name="trash" /> Delete role
                  </button>
                </div>
                <ExpForm
                  job={job}
                  onChange={(next) =>
                    void persist({
                      ...store,
                      experience: store.experience.map((e) => (e.id === job.id ? next : e)),
                    })
                  }
                />
              </div>
            </details>
          )
        })}
      </div>
      {store.education.map((edu, i) => (
        <details
          class="compact-card editor-card"
          key={edu.id}
          open={openCards.includes(edu.id)}
          onToggle={(event) => setCardOpen(edu.id, (event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>
            <span class="card-chevron"><Icon name="chevron" /></span>
            <span class="card-heading">
              <strong>{edu.school || `School ${i + 1}`}</strong>
              <span>{[edu.degree, edu.field, edu.endDate].filter(Boolean).join(' · ') || 'Add education details'}</span>
            </span>
          </summary>
          <div class="compact-card-body">
            <div class="card-actions">
              <button class="btn btn-ghost" onClick={() => void persist({ ...store, education: store.education.filter((e) => e.id !== edu.id) })}>
                <Icon name="trash" /> Delete school
              </button>
            </div>
            <EduForm
              edu={edu}
              onChange={(next) =>
                void persist({
                  ...store,
                  education: store.education.map((e) => (e.id === edu.id ? next : e)),
                })
              }
            />
          </div>
        </details>
      ))}
      <Answers store={store} persist={persist} />
    </>
  )
}

function ExpForm({ job, onChange }: { job: Experience; onChange: (j: Experience) => void }) {
  const set = (k: keyof Experience, v: string | boolean) => onChange({ ...job, [k]: v })
  return (
    <div class="form-grid">
      <Field label="Title" value={job.title} onInput={(v) => set('title', v)} />
      <Field label="Company" value={job.company} onInput={(v) => set('company', v)} />
      <Field label="Location" value={job.location} onInput={(v) => set('location', v)} />
      <Field label="Start" value={job.startDate} onInput={(v) => set('startDate', v)} />
      <Field label="End" value={job.endDate} onInput={(v) => set('endDate', v)} />
      <label class="check span-2">
        <input type="checkbox" checked={job.current} onChange={(e) => set('current', (e.target as HTMLInputElement).checked)} />
        Current role
      </label>
      <Field label="Description" value={job.description} type="textarea" span onInput={(v) => set('description', v)} />
    </div>
  )
}

function EduForm({ edu, onChange }: { edu: Education; onChange: (j: Education) => void }) {
  const set = (k: keyof Education, v: string) => onChange({ ...edu, [k]: v })
  return (
    <div class="form-grid">
      <Field label="School" value={edu.school} onInput={(v) => set('school', v)} />
      <Field label="Degree" value={edu.degree} onInput={(v) => set('degree', v)} />
      <Field label="Field" value={edu.field} onInput={(v) => set('field', v)} />
      <Field label="GPA" value={edu.gpa} onInput={(v) => set('gpa', v)} />
      <Field label="Start" value={edu.startDate} onInput={(v) => set('startDate', v)} />
      <Field label="End" value={edu.endDate} onInput={(v) => set('endDate', v)} />
    </div>
  )
}

function Answers({ store, persist }: { store: Store; persist: (s: Store) => Promise<void> }) {
  return (
    <>
      <div class="toolbar">
        <button
          class="btn"
          onClick={() =>
            void persist({
              ...store,
              answers: [...store.answers, { id: uid('ans'), question: '', answer: '' }],
            })
          }
        >
          <Icon name="plus" /> Saved answer
        </button>
      </div>
      {store.answers.map((a) => (
        <article class="row-card" key={a.id}>
          <header>
            <span>{a.question || 'Question'}</span>
            <button class="btn btn-ghost" onClick={() => void persist({ ...store, answers: store.answers.filter((x) => x.id !== a.id) })}>
              <Icon name="trash" />
            </button>
          </header>
          <div class="form-grid">
            <Field
              label="Question"
              value={a.question}
              span
              onInput={(v) =>
                void persist({
                  ...store,
                  answers: store.answers.map((x) => (x.id === a.id ? { ...x, question: v } : x)),
                })
              }
            />
            <Field
              label="Answer"
              value={a.answer}
              type="textarea"
              span
              onInput={(v) =>
                void persist({
                  ...store,
                  answers: store.answers.map((x) => (x.id === a.id ? { ...x, answer: v } : x)),
                })
              }
            />
          </div>
        </article>
      ))}
    </>
  )
}

function ResumeTab({
  store,
  persist,
  setError,
  setNotice,
}: {
  store: Store
  persist: (s: Store) => Promise<void>
  setError: (s: string) => void
  setNotice: (s: string) => void
}) {
  async function onFile(file: File) {
    setError('')
    try {
      const { extractResumeText, fileToBase64, parseResumeHeuristics } = await import('../lib/resume')
      const { structureResumeWithAI } = await import('../lib/openrouter')
      const text = await extractResumeText(file)
      const dataBase64 = await fileToBase64(file)
      let parsed = parseResumeHeuristics(text)
      if (store.settings.openrouterKey) {
        try {
          const ai = (await structureResumeWithAI({
            key: store.settings.openrouterKey,
            model: store.settings.openrouterModel,
            text,
          })) as {
            identity?: Store['identity']
            experience?: Experience[]
            education?: Education[]
            skills?: string[]
          }
          if (ai.identity) parsed = { ...parsed, identity: { ...parsed.identity, ...ai.identity } }
          if (ai.experience?.length) {
            parsed.experience = ai.experience.map((e) => ({ ...e, id: e.id || uid('exp') }))
          }
          if (ai.education?.length) {
            parsed.education = ai.education.map((e) => ({ ...e, id: e.id || uid('edu') }))
          }
          if (ai.skills?.length) parsed.skills = ai.skills
        } catch {
          /* heuristics still apply */
        }
      }
      await persist({
        ...store,
        resume: { name: file.name, mime: file.type, dataBase64, text, uploadedAt: new Date().toISOString() },
        identity: { ...store.identity, ...parsed.identity },
        experience: parsed.experience.length ? parsed.experience : store.experience,
        education: parsed.education.length ? parsed.education : store.education,
        skills: parsed.skills.length ? parsed.skills : store.skills,
      })
      setNotice(`Imported ${file.name}. Review Profile and Jobs.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read resume.')
    }
  }

  return (
    <>
      <label class="file-drop">
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) void onFile(f)
          }}
        />
        <Icon name="upload" />
        <div>{store.resume ? store.resume.name : 'Drop a PDF or DOCX, or click to upload'}</div>
        {store.resume ? <div>{Math.round(store.resume.text.length / 1000)}k characters extracted</div> : null}
      </label>
      {store.resume ? (
        <p class="meta" style={{ color: 'var(--muted)' }}>
          File stays in local extension storage. Fill attaches it to resume file inputs.
        </p>
      ) : null}
    </>
  )
}

function SettingsTab({
  store,
  persist,
  setError,
  setNotice,
  onLinkedIn,
}: {
  store: Store
  persist: (s: Store) => Promise<void>
  setError: (s: string) => void
  setNotice: (s: string) => void
  onLinkedIn: () => void
}) {
  const s = store.settings
  const custom = !isPresetModel(s.openrouterModel)
  const [prices, setPrices] = useState<Record<string, ModelPricing | null>>({})
  const [priceStatus, setPriceStatus] = useState<'idle' | 'loading' | 'missing'>('idle')

  useEffect(() => {
    const ids = [...OPENROUTER_MODELS, custom ? s.openrouterModel : ''].filter(Boolean)
    let cancelled = false
    const run = () => {
      setPriceStatus('loading')
      void Promise.all(ids.map((id) => fetchModelPricing(id).then((p) => [id, p] as const))).then(
        (entries) => {
          if (cancelled) return
          const next: Record<string, ModelPricing | null> = {}
          for (const [id, p] of entries) next[id] = p
          setPrices((prev) => ({ ...prev, ...next }))
          const active = s.openrouterModel.trim()
          if (!active) setPriceStatus('idle')
          else setPriceStatus(next[active] ? 'idle' : 'missing')
        },
      )
    }
    const handle = window.setTimeout(run, custom ? 400 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [s.openrouterModel, custom])

  const activePrice = prices[s.openrouterModel.trim()] ?? null

  function exportFile() {
    const blob = new Blob([JSON.stringify(toExportBundle(store), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'carbon-dossier.json'
    a.click()
    URL.revokeObjectURL(url)
    setNotice('Exported. OpenRouter key was not included.')
  }
  async function importFile(file: File) {
    try {
      const data = JSON.parse(await file.text())
      await persist(fromExportBundle(data, store))
      setNotice('Imported. Existing OpenRouter key kept.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    }
  }
  return (
    <>
      <div class="form-grid">
        <label class="field span-2">
          <span>OpenRouter key</span>
          <input
            type="password"
            value={s.openrouterKey}
            autocomplete="off"
            placeholder="sk-or-…"
            onInput={(e) =>
              void persist({
                ...store,
                settings: { ...s, openrouterKey: (e.target as HTMLInputElement).value.trim() },
              })
            }
          />
        </label>
        <label class="field span-2">
          <span>Model</span>
          <select
            value={custom ? CUSTOM_MODEL : s.openrouterModel}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value
              void persist({
                ...store,
                settings: {
                  ...s,
                  openrouterModel: v === CUSTOM_MODEL ? (custom ? s.openrouterModel : '') : v,
                },
              })
            }}
          >
            {OPENROUTER_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
                {prices[m] ? ` · ${formatUsdShort(prices[m]!)}` : ''}
              </option>
            ))}
            <option value={CUSTOM_MODEL}>Custom</option>
          </select>
        </label>
        {custom ? (
          <label class="field span-2">
            <span>OpenRouter slug</span>
            <input
              type="text"
              value={s.openrouterModel}
              placeholder="provider/model-id"
              spellcheck={false}
              onInput={(e) =>
                void persist({
                  ...store,
                  settings: { ...s, openrouterModel: (e.target as HTMLInputElement).value.trim() },
                })
              }
            />
          </label>
        ) : null}
        <p class="price">
          {priceStatus === 'loading'
            ? 'Fetching price…'
            : activePrice
              ? formatModelCost(activePrice)
              : s.openrouterModel.trim()
                ? priceStatus === 'missing'
                  ? 'No OpenRouter price for this slug.'
                  : ''
                : 'Enter a model slug to see price.'}
        </p>
        <p class="meta span-2">When Fill finds a question that needs a written answer, Carbon generates it automatically and puts it on the page.</p>
      </div>
      <div class="toolbar">
        <button class="btn" onClick={onLinkedIn}><Icon name="linkedin" /> Import LinkedIn tab</button>
        <button class="btn" onClick={exportFile}><Icon name="download" /> Export</button>
        <label class="btn">
          Import
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0]
              if (f) void importFile(f)
            }}
          />
        </label>
        <button
          class="btn"
          onClick={() =>
            void persist({
              ...store,
              identity: {
                ...EMPTY_IDENTITY,
                firstName: 'Mira',
                lastName: 'Chen',
                email: 'mira@chen.dev',
                phone: '+1 415 555 0142',
                city: 'San Francisco',
                state: 'CA',
                country: 'United States',
                linkedin: 'https://linkedin.com/in/mirachen',
                github: 'https://github.com/mirachen',
                headline: 'Staff engineer',
                summary: 'Synthetic preview profile. Replace with your dossier.',
                workAuthorized: 'yes',
                needsSponsorship: 'no',
              },
              experience: [
                {
                  id: uid('exp'),
                  company: 'Northwind Labs',
                  title: 'Staff engineer',
                  location: 'San Francisco, CA',
                  startDate: 'Jan 2023',
                  endDate: '',
                  current: true,
                  description: 'Led the application platform. Synthetic.',
                },
              ],
              education: [
                {
                  id: uid('edu'),
                  school: 'UC San Diego',
                  degree: 'B.S.',
                  field: 'Computer Science',
                  location: 'La Jolla, CA',
                  startDate: '2015',
                  endDate: '2019',
                  gpa: '',
                },
              ],
              skills: ['TypeScript', 'Distributed systems'],
            })
          }
        >
          Load sample
        </button>
        <button
          class="btn btn-danger"
          onClick={() => void persist({ ...EMPTY_STORE, settings: store.settings })}
        >
          Clear file
        </button>
      </div>
      <p class="meta" style={{ color: 'var(--muted)' }}>
        Everything lives in chrome.storage.local. Exports never contain the OpenRouter key. Shortcut: ⌘⇧F / Ctrl+Shift+F.
      </p>
    </>
  )
}

