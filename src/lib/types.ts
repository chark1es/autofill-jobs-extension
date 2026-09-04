export type YesNo = '' | 'yes' | 'no'

export type FieldKind =
  | 'text'
  | 'choice'
  | 'experience'
  | 'education'
  | 'longform'
  | 'file'
  | 'unknown'

export type MatchStatus = 'mapped' | 'needs-ai' | 'empty' | 'skipped' | 'writing' | 'filled' | 'failed'

export interface Identity {
  firstName: string
  middleName: string
  lastName: string
  nameSuffix: string
  preferredName: string
  email: string
  phone: string
  phoneAlt: string
  address1: string
  address2: string
  city: string
  state: string
  postalCode: string
  country: string
  linkedin: string
  github: string
  portfolio: string
  website: string
  headline: string
  summary: string
  workAuthorized: YesNo
  needsSponsorship: YesNo
  willingToRelocate: YesNo
  noticePeriod: string
  salaryExpectation: string
  pronouns: string
  desiredJobTitle: string
  yearsExperience: string
  citizenship: string
  visaStatus: string
  employmentType: string
  remotePreference: string
  willingToTravel: YesNo
  gender: string
  ethnicity: string
  veteranStatus: string
  disabilityStatus: string
}

export interface Experience {
  id: string
  company: string
  title: string
  location: string
  startDate: string
  endDate: string
  current: boolean
  description: string
}

export interface Education {
  id: string
  school: string
  degree: string
  field: string
  location: string
  startDate: string
  endDate: string
  gpa: string
}

export interface SavedAnswer {
  id: string
  question: string
  answer: string
}

export interface ResumeFile {
  name: string
  mime: string
  dataBase64: string
  text: string
  uploadedAt: string
}

export interface Settings {
  enabled: boolean
  openrouterKey: string
  openrouterModel: string
  fillUnmatchedWithAI: boolean
}

export interface Store {
  version: 1
  identity: Identity
  experience: Experience[]
  education: Education[]
  skills: string[]
  answers: SavedAnswer[]
  resume: ResumeFile | null
  settings: Settings
}

export type ExportBundle = Omit<Store, 'settings'> & {
  settings: Omit<Settings, 'openrouterKey'>
}

export interface DetectedField {
  uid: string
  kind: FieldKind
  label: string
  name: string
  autocomplete: string
  inputType: string
  tag: string
  required: boolean
  options: string[]
  matchKey: string
  currentValue: string
  experienceIndex: number | null
  educationIndex: number | null
}

export interface DetectResult {
  url: string
  title: string
  host: string
  isLinkedIn: boolean
  fields: DetectedField[]
}

export interface FillPlanItem {
  uid: string
  value: string
  source: 'heuristic' | 'ai' | 'resume-file'
  suggestionHints?: string[]
}

export interface FillRequest {
  items: FillPlanItem[]
  runId?: string
  resume?: { name: string; mime: string; dataBase64: string }
}

export interface FillFieldProgress {
  runId: string
  uid: string
  status: 'filling' | 'filled' | 'failed'
  reason?: string
}

export interface FillResult {
  filled: number
  filledUids: string[]
  failed: Array<{ uid: string; reason: string }>
}

export interface ExpandRepeatersResult {
  experienceAdded: number
  educationAdded: number
}

export interface PageDiagnosticElement {
  tag: string
  label: string
  path: string
  visible: boolean
  attributes: Record<string, string>
}

export interface PageDiagnostics {
  version: 1
  capturedAt: string
  page: {
    url: string
    title: string
    host: string
    language: string
    userAgent: string
  }
  frameworks: string[]
  customElements: string[]
  fields: PageDiagnosticElement[]
  buttons: PageDiagnosticElement[]
  forms: Array<{
    path: string
    attributes: Record<string, string>
    fieldCount: number
  }>
  sanitizedHtml: string
  htmlTruncated: boolean
}

export const EMPTY_IDENTITY: Identity = {
  firstName: '',
  middleName: '',
  lastName: '',
  nameSuffix: '',
  preferredName: '',
  email: '',
  phone: '',
  phoneAlt: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  linkedin: '',
  github: '',
  portfolio: '',
  website: '',
  headline: '',
  summary: '',
  workAuthorized: '',
  needsSponsorship: '',
  willingToRelocate: '',
  noticePeriod: '',
  salaryExpectation: '',
  pronouns: '',
  desiredJobTitle: '',
  yearsExperience: '',
  citizenship: '',
  visaStatus: '',
  employmentType: '',
  remotePreference: '',
  willingToTravel: '',
  gender: '',
  ethnicity: '',
  veteranStatus: '',
  disabilityStatus: '',
}

export const EMPTY_SETTINGS: Settings = {
  enabled: true,
  openrouterKey: '',
  openrouterModel: 'deepseek/deepseek-v4-flash-0731',
  fillUnmatchedWithAI: true,
}

export const EMPTY_STORE: Store = {
  version: 1,
  identity: EMPTY_IDENTITY,
  experience: [],
  education: [],
  skills: [],
  answers: [],
  resume: null,
  settings: EMPTY_SETTINGS,
}

export const OPENROUTER_MODELS = [
  'deepseek/deepseek-v4-flash-0731',
  'z-ai/glm-5.3-flash',
  'openai/gpt-5.6-luna',
] as const

export type OpenRouterPreset = (typeof OPENROUTER_MODELS)[number]

export const CUSTOM_MODEL = '__custom__'

export function isPresetModel(id: string): id is OpenRouterPreset {
  return (OPENROUTER_MODELS as readonly string[]).includes(id)
}
