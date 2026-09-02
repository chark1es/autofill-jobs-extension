export type YesNo = '' | 'yes' | 'no'

export type FieldKind =
  | 'text'
  | 'choice'
  | 'experience'
  | 'education'
  | 'longform'
  | 'file'
  | 'unknown'

export type MatchStatus = 'mapped' | 'needs-ai' | 'empty' | 'skipped' | 'writing' | 'failed'

export interface Identity {
  firstName: string
  lastName: string
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
}

export interface FillRequest {
  items: FillPlanItem[]
  resume?: { name: string; mime: string; dataBase64: string }
}

export interface FillResult {
  filled: number
  failed: Array<{ uid: string; reason: string }>
}

export const EMPTY_IDENTITY: Identity = {
  firstName: '',
  lastName: '',
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
}

export const EMPTY_SETTINGS: Settings = {
  openrouterKey: '',
  openrouterModel: 'openai/gpt-4o-mini',
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
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
] as const
