import { useCallback, useEffect, useState } from 'preact/hooks'
import type { DetectedField, DetectResult, Experience, Education, MatchStatus, Store } from '../lib/types'
import { EMPTY_IDENTITY, EMPTY_STORE } from '../lib/types'
import { fromExportBundle, loadStore, saveStore, subscribeStore, toExportBundle, uid } from '../lib/storage'
import { findSavedAnswer, heuristicValue, needsAI } from '../lib/match'
import { completeWithOpenRouter } from '../lib/openrouter'
import { OPENROUTER_MODELS } from '../lib/types'
import { Icon } from './icons'

type Tab = 'fill' | 'profile' | 'experience' | 'resume' | 'settings'

interface Row {
  field: DetectedField
  value: string
  status: MatchStatus
}

async function currentTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

async function ensureDetect(tabId: number): Promise<DetectResult> {
  if (!chrome.tabs?.sendMessage) throw new Error('Not running as an extension.')
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'DETECT' })
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/index.ts'] })
    return chrome.tabs.sendMessage(tabId, { type: 'DETECT' })
  }
}

export function App({ mode }: { mode: 'popup' | 'options' }) {
  const [store, setStore] = useState<Store>(EMPTY_STORE)
  const [tab, setTab] = useState<Tab>('fill')
  const [detect, setDetect] = useState<DetectResult | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState('')
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
    if (!detect) {
      setRows([])
      return
    }
    setRows(
      detect.fields.map((field) => {
        const saved = findSavedAnswer(field.label, store)
        const value = saved || heuristicValue(field, store)
        const status: MatchStatus = value
          ? 'mapped'
          : needsAI(field, value)
            ? 'needs-ai'
            : 'empty'
        return { field, value, status }
      }),
    )
  }, [detect, store])

  const mapped = rows.filter((r) => r.status === 'mapped' || r.value).length
  const aiCount = rows.filter((r) => r.status === 'needs-ai').length
  const displayName = [store.identity.firstName, store.identity.lastName].filter(Boolean).join(' ')

  async function fillNow() {
    setError('')
    setBusy('Filling')
    const t = await currentTab()
    if (!t?.id) {
      setBusy('')
      setError('No active tab.')
      return
    }
    const nextRows = [...rows]
    try {
      for (let i = 0; i < nextRows.length; i++) {
        const row = nextRows[i]
        if (row.value) continue
        if (row.status !== 'needs-ai' || !store.settings.fillUnmatchedWithAI) continue
        if (!store.settings.openrouterKey) continue
        nextRows[i] = { ...row, status: 'writing' }
        setRows([...nextRows])
        try {
          const text = await completeWithOpenRouter({
            key: store.settings.openrouterKey,
            model: store.settings.openrouterModel,
            question: row.field.label,
            options: row.field.options,
            store,
            pageTitle: detect?.title ?? t.title ?? '',
          })
          nextRows[i] = { ...row, value: text, status: 'mapped' }
        } catch (e) {
          nextRows[i] = {
            ...row,
            status: 'failed',
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
          source: (r.status === 'mapped' ? 'heuristic' : 'ai') as 'heuristic' | 'ai',
        }))
      const resume = store.resume
        ? { name: store.resume.name, mime: store.resume.mime, dataBase64: store.resume.dataBase64 }
        : undefined
      await chrome.tabs.sendMessage(t.id, { type: 'FILL', payload: { items, resume } })
      setNotice(`Wrote ${items.length} fields.`)
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
      const t = await currentTab()
      if (!t?.id) throw new Error('No active tab.')
      let data: Partial<Store>
      try {
        data = await chrome.tabs.sendMessage(t.id, { type: 'IMPORT_LINKEDIN' })
      } catch {
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['src/content/index.ts'] })
        data = await chrome.tabs.sendMessage(t.id, { type: 'IMPORT_LINKEDIN' })
      }
      const next: Store = {
        ...store,
        identity: { ...store.identity, ...data.identity },
        experience: data.experience?.length ? data.experience : store.experience,
        education: data.education?.length ? data.education : store.education,
        skills: data.skills?.length ? data.skills : store.skills,
      }
      await persist(next)
      setNotice('LinkedIn fields merged into the candidate file.')
      setTab('profile')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LinkedIn import failed. Open your profile tab.')
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
            {busy
              ? busy
              : detect
                ? `${mapped} mapped · ${aiCount} need AI · ${detect.host.replace(/^www\./, '')}`
                : mode === 'options'
                  ? 'Full editor'
                  : 'Open an application form'}
          </p>
        </div>
        <button class="btn btn-primary" disabled={!!busy || rows.length === 0} onClick={() => void fillNow()}>
          <Icon name="fill" />
          Fill
        </button>
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
          />
        ) : null}
        {tab === 'profile' ? (
          <ProfileTab store={store} onChange={(identity) => void persist({ ...store, identity })} onSkills={(skills) => void persist({ ...store, skills })} />
        ) : null}
        {tab === 'experience' ? (
          <ExperienceTab store={store} persist={persist} />
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
}: {
  store: Store
  detect: DetectResult | null
  rows: Row[]
  displayName: string
  onRefresh: () => void
  onLinkedIn: () => void
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
  if (!displayName && !store.identity.email) {
    return (
      <div class="empty">
        <h2>Empty candidate file</h2>
        <p>Add identity under Profile, upload a resume, or import from a LinkedIn tab. Fill reads this file, not the page.</p>
      </div>
    )
  }
  if (!detect || rows.length === 0) {
    return (
      <div class="empty">
        <h2>No form on this page</h2>
        <p>Open a Greenhouse, Lever, Workday, Ashby, or company application, then come back.</p>
        <button class="btn btn-ghost" onClick={onRefresh}>Scan again</button>
      </div>
    )
  }
  return (
    <>
      <div class="strip">
        <span><strong>{displayName || 'Unnamed'}</strong></span>
        {store.identity.email ? <span>{store.identity.email}</span> : null}
        {store.identity.phone ? <span>{store.identity.phone}</span> : null}
        {store.identity.city ? <span>{store.identity.city}</span> : null}
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field.uid} class={row.status}>
              <td class="field-label">{row.field.label}</td>
              <td class="field-value">{row.value === '__resume__' ? store.resume?.name ?? 'Resume' : row.value || '—'}</td>
              <td>
                <span class={`chip ${row.status === 'needs-ai' ? 'ai' : row.status}`}>
                  {row.status === 'needs-ai' ? 'needs AI' : row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
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
        <Field label="Last name" value={id.lastName} onInput={(v) => set('lastName', v)} />
        <Field label="Preferred name" value={id.preferredName} onInput={(v) => set('preferredName', v)} />
        <Field label="Pronouns" value={id.pronouns} onInput={(v) => set('pronouns', v)} />
        <Field label="Email" value={id.email} type="email" onInput={(v) => set('email', v)} />
        <Field label="Phone" value={id.phone} type="tel" onInput={(v) => set('phone', v)} />
        <Field label="Address" value={id.address1} span onInput={(v) => set('address1', v)} />
        <Field label="City" value={id.city} onInput={(v) => set('city', v)} />
        <Field label="State" value={id.state} onInput={(v) => set('state', v)} />
        <Field label="Postal code" value={id.postalCode} onInput={(v) => set('postalCode', v)} />
        <Field label="Country" value={id.country} onInput={(v) => set('country', v)} />
        <Field label="LinkedIn" value={id.linkedin} type="url" span onInput={(v) => set('linkedin', v)} />
        <Field label="GitHub" value={id.github} type="url" onInput={(v) => set('github', v)} />
        <Field label="Website" value={id.website} type="url" onInput={(v) => set('website', v)} />
        <Field label="Headline" value={id.headline} span onInput={(v) => set('headline', v)} />
        <Field label="Summary" value={id.summary} type="textarea" span onInput={(v) => set('summary', v)} />
        <label class="field">
          <span>Work authorized</span>
          <select value={id.workAuthorized} onChange={(e) => set('workAuthorized', (e.target as HTMLSelectElement).value)}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label class="field">
          <span>Needs sponsorship</span>
          <select value={id.needsSponsorship} onChange={(e) => set('needsSponsorship', (e.target as HTMLSelectElement).value)}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <Field label="Salary expectation" value={id.salaryExpectation} onInput={(v) => set('salaryExpectation', v)} />
        <Field label="Notice / start" value={id.noticePeriod} onInput={(v) => set('noticePeriod', v)} />
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

function ExperienceTab({ store, persist }: { store: Store; persist: (s: Store) => Promise<void> }) {
  const addExp = () =>
    void persist({
      ...store,
      experience: [
        ...store.experience,
        { id: uid('exp'), company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' },
      ],
    })
  const addEdu = () =>
    void persist({
      ...store,
      education: [
        ...store.education,
        { id: uid('edu'), school: '', degree: '', field: '', location: '', startDate: '', endDate: '', gpa: '' },
      ],
    })
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
      {store.experience.map((job, i) => (
        <article class="row-card" key={job.id}>
          <header>
            <span>{job.title || job.company || `Role ${i + 1}`}</span>
            <button class="btn btn-ghost" onClick={() => void persist({ ...store, experience: store.experience.filter((e) => e.id !== job.id) })}>
              <Icon name="trash" />
            </button>
          </header>
          <ExpForm
            job={job}
            onChange={(next) =>
              void persist({
                ...store,
                experience: store.experience.map((e) => (e.id === job.id ? next : e)),
              })
            }
          />
        </article>
      ))}
      {store.education.map((edu, i) => (
        <article class="row-card" key={edu.id}>
          <header>
            <span>{edu.school || `School ${i + 1}`}</span>
            <button class="btn btn-ghost" onClick={() => void persist({ ...store, education: store.education.filter((e) => e.id !== edu.id) })}>
              <Icon name="trash" />
            </button>
          </header>
          <EduForm
            edu={edu}
            onChange={(next) =>
              void persist({
                ...store,
                education: store.education.map((e) => (e.id === edu.id ? next : e)),
              })
            }
          />
        </article>
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
            value={s.openrouterModel}
            onChange={(e) =>
              void persist({
                ...store,
                settings: { ...s, openrouterModel: (e.target as HTMLSelectElement).value },
              })
            }
          >
            {OPENROUTER_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label class="check span-2">
          <input
            type="checkbox"
            checked={s.fillUnmatchedWithAI}
            onChange={(e) =>
              void persist({
                ...store,
                settings: { ...s, fillUnmatchedWithAI: (e.target as HTMLInputElement).checked },
              })
            }
          />
          Use OpenRouter for unmatched and long-form fields
        </label>
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

