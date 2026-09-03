import type { DetectedField, Identity, Store } from './types'

type Vocab = {
  key: string
  kind: DetectedField['kind']
  tests: RegExp[]
}

const VOCAB: Vocab[] = [
  { key: 'firstName', kind: 'text', tests: [/\b(first|given|forename)\s*name\b/i, /\bgiven-name\b/i, /^fname$/i] },
  { key: 'middleName', kind: 'text', tests: [/\bmiddle\s*(name|initial)\b/i] },
  { key: 'lastName', kind: 'text', tests: [/\b(last|family|sur)\s*name\b/i, /\bfamily-name\b/i, /^lname$/i] },
  { key: 'nameSuffix', kind: 'text', tests: [/\b(name\s*)?suffix\b/i, /\b(jr|sr|ii|iii)\.?\b/i] },
  { key: 'preferredName', kind: 'text', tests: [/\b(preferred|chosen|nick)\s*name\b/i] },
  { key: 'email', kind: 'text', tests: [/\be-?mail\b/i, /autocomplete.*email/i] },
  { key: 'phoneAlt', kind: 'text', tests: [/\b(alt(?:ernate)?|secondary|home|other)\b.*\bphone\b/i, /\bphone\s*(2|two)\b/i] },
  { key: 'phone', kind: 'text', tests: [/\b(phone|mobile|cell|telephone)\b/i, /\btel\b/i] },
  { key: 'address1', kind: 'text', tests: [/\bstreet\s*address\b/i, /\baddress\s*(line)?\s*1\b/i, /^address$/i] },
  { key: 'address2', kind: 'text', tests: [/\baddress\s*(line)?\s*2\b/i, /\b(apt|suite|unit|building)\b/i] },
  { key: 'city', kind: 'text', tests: [/\b(city|town|locality)\b/i] },
  { key: 'state', kind: 'text', tests: [/\b(state|province|region)\b/i] },
  { key: 'postalCode', kind: 'text', tests: [/\b(zip|postal)\s*code\b/i, /^zip$/i] },
  { key: 'country', kind: 'choice', tests: [/\bcountry\b/i] },
  { key: 'linkedin', kind: 'text', tests: [/\blinkedin\b/i, /\bprofessional\s*profile(\s*url)?\b/i] },
  { key: 'github', kind: 'text', tests: [/\bgithub\b/i] },
  { key: 'portfolio', kind: 'text', tests: [/\b(portfolio|personal\s*site|website\s*url|vimeo|behance)\b/i] },
  { key: 'website', kind: 'text', tests: [/\b(website|homepage|url)\b/i] },
  { key: 'headline', kind: 'text', tests: [/\b(headline|current\s*title|job\s*title)\b/i] },
  { key: 'summary', kind: 'longform', tests: [/\b(summary|about\s*you|bio|cover\s*letter)\b/i] },
  { key: 'workAuthorized', kind: 'choice', tests: [/\b(authorized|authorised)\s+to\s+work\b/i, /\blegally\s+eligible\b/i, /\bwork\s+authorization\b/i, /\bus\s+work\s+eligib/i] },
  { key: 'needsSponsorship', kind: 'choice', tests: [/\bsponsor(ship)?\b/i, /\bvisa\s+sponsor(ship)?\b/i, /\bh-?1b\s+sponsor(ship)?\b/i] },
  { key: 'willingToRelocate', kind: 'choice', tests: [/\breloc/i, /\bwilling\s+to\s+move\b/i] },
  { key: 'noticePeriod', kind: 'text', tests: [/\bnotice\s*period\b/i, /\bavailable\s*(to\s*start|date)\b/i, /\bstart\s*date\b/i] },
  { key: 'salaryExpectation', kind: 'text', tests: [/\b(salary|compensation|pay|expected\s*comp)\b/i] },
  { key: 'pronouns', kind: 'text', tests: [/\bpronouns?\b/i] },
  { key: 'desiredJobTitle', kind: 'text', tests: [/\b(desired|preferred)\s+(job\s+)?(title|role|position)\b/i] },
  { key: 'yearsExperience', kind: 'text', tests: [/\b(years?|yrs?)\s+(of\s+)?(professional\s+)?experience\b/i, /\btotal\s+experience\b/i] },
  { key: 'citizenship', kind: 'choice', tests: [/\bcitizenship\b/i, /\bcitizen\s+of\b/i] },
  { key: 'visaStatus', kind: 'choice', tests: [/\b(visa|immigration)\s+status\b/i, /\bcurrent\s+visa\b/i] },
  { key: 'employmentType', kind: 'choice', tests: [/\b(preferred|desired)\s+employment\s+type\b/i, /\b(full.?time|part.?time|contract)\s+preference\b/i] },
  { key: 'remotePreference', kind: 'choice', tests: [/\b(remote|hybrid|on.?site)\s+(work\s+)?preference\b/i, /\bpreferred\s+work\s+(setting|location)\b/i] },
  { key: 'willingToTravel', kind: 'choice', tests: [/\bwilling(ness)?\s+to\s+travel\b/i, /\btravel\s+requirement\b/i] },
  { key: 'gender', kind: 'choice', tests: [/\b(gender|gender identity|sex)\b/i] },
  { key: 'ethnicity', kind: 'choice', tests: [/\b(race|ethnicity|ethnic background)\b/i] },
  { key: 'veteranStatus', kind: 'choice', tests: [/\b(protected\s+)?veteran(\s+status)?\b/i, /\bmilitary\s+service\b/i] },
  { key: 'disabilityStatus', kind: 'choice', tests: [/\bdisability(\s+status)?\b/i, /\bself.identif(y|ication).*disab/i] },
  { key: 'resume', kind: 'file', tests: [/\b(resume|cv|curriculum)\b/i, /\battach.*file\b/i] },
  { key: 'exp.company', kind: 'experience', tests: [/\b(company|employer|organization|organisation)\b/i] },
  { key: 'exp.description', kind: 'experience', tests: [/\b(responsibilit|description|achievements?|what\s+(did\s+)?you\s+(do|did))\b/i] },
  { key: 'exp.title', kind: 'experience', tests: [/\b(job\s*)?title\b/i, /\b(position|role)\b/i] },
  { key: 'exp.location', kind: 'experience', tests: [/\b(job|work|office)\s*location\b/i] },
  { key: 'exp.startDate', kind: 'experience', tests: [/\b(start|from)\s*(date|month|year)\b/i, /\bfrom\b/i] },
  { key: 'exp.endDate', kind: 'experience', tests: [/\b(end|to|until)\s*(date|month|year)\b/i, /\b(currently?\s*work|present)\b/i] },
  { key: 'edu.school', kind: 'education', tests: [/\b(school|university|college|institution)\b/i] },
  { key: 'edu.degree', kind: 'education', tests: [/\bdegree\b/i, /\b(bachel|master|phd|diploma)\b/i] },
  { key: 'edu.field', kind: 'education', tests: [/\b(major|field\s*of\s*study|discipline)\b/i] },
  { key: 'edu.gpa', kind: 'education', tests: [/\bgpa\b/i] },
  { key: 'edu.startDate', kind: 'education', tests: [/\b(attended\s*from|enrollment)\b/i, /\b(start|from)\s*(date|month|year)\b/i] },
  { key: 'edu.endDate', kind: 'education', tests: [/\b(graduation|graduated)\b/i, /\b(end|to|until)\s*(date|month|year)\b/i] },
]

const AUTOCOMPLETE: Record<string, string> = {
  'given-name': 'firstName',
  'family-name': 'lastName',
  'additional-name': 'middleName',
  'honorific-suffix': 'nameSuffix',
  email: 'email',
  'tel': 'phone',
  'tel-national': 'phone',
  'street-address': 'address1',
  'address-line1': 'address1',
  'address-line2': 'address2',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'postalCode',
  country: 'country',
  'country-name': 'country',
  url: 'website',
  organization: 'exp.company',
  'organization-title': 'exp.title',
}

function blob(field: {
  label: string
  name: string
  autocomplete: string
  inputType: string
}): string {
  return [field.label, field.name, field.autocomplete, field.inputType]
    .filter(Boolean)
    .join(' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
}

export function classifyField(field: {
  label: string
  name: string
  autocomplete: string
  inputType: string
  tag: string
  options: string[]
  context?: string
}): { matchKey: string; kind: DetectedField['kind'] } {
  const ac = field.autocomplete.split(' ').pop() ?? ''
  if (AUTOCOMPLETE[ac]) {
    const key = AUTOCOMPLETE[ac]
    const vocab = VOCAB.find((v) => v.key === key)
    return { matchKey: key, kind: vocab?.kind ?? 'text' }
  }
  if (field.inputType === 'email') return { matchKey: 'email', kind: 'text' }
  if (field.inputType === 'tel') return { matchKey: 'phone', kind: 'text' }
  if (field.inputType === 'file') return { matchKey: 'resume', kind: 'file' }
  if (field.inputType === 'url' && /linkedin/i.test(blob(field))) {
    return { matchKey: 'linkedin', kind: 'text' }
  }

  const text = blob(field)
  const sectionSignal = `${field.context ?? ''} ${field.name}`
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
  const sectionKind = /\b(experience|employment|work\s*history|job\s*history)\b/i.test(sectionSignal)
    ? 'experience'
    : /\b(education|school|college|university|academic)\b/i.test(sectionSignal)
      ? 'education'
      : null
  const looksLong =
    field.tag === 'textarea' ||
    text.length > 80 ||
    /\?/.test(field.label) ||
    /\b(describe|explain|why|how|tell us|tell me|cover letter|additional (information|comments)|motivation|motivated|interest(?:ed)?|qualifications?|accomplishments?|challenge|proud of|experience with|please provide|please share)\b/i.test(text)
  if (looksLong && !sectionKind) return { matchKey: 'longform', kind: 'longform' }

  const ordered = sectionKind
    ? [...VOCAB.filter((item) => item.kind === sectionKind), ...VOCAB.filter((item) => item.kind !== sectionKind)]
    : VOCAB
  for (const v of ordered) {
    if (v.tests.some((re) => re.test(text))) {
      return { matchKey: v.key, kind: v.kind }
    }
  }

  const isChoice =
    field.tag === 'select' ||
    field.inputType === 'radio' ||
    field.inputType === 'checkbox' ||
    field.options.length > 0
  if (looksLong) return { matchKey: 'longform', kind: 'longform' }
  if (isChoice) return { matchKey: 'choice', kind: 'choice' }
  return { matchKey: 'unknown', kind: 'unknown' }
}

export function isOpenEndedField(field: DetectedField): boolean {
  if (field.kind === 'longform' || field.tag === 'textarea') return true
  const text = `${field.label} ${field.name}`
  return /\?|\b(describe|explain|why|how|tell us|tell me|please (provide|share)|motivation|interest(?:ed)?|qualifications?|accomplishments?|challenge|proud of|experience with|additional (information|comments))\b/i.test(text)
}

export function identityValue(identity: Identity, key: string): string {
  if (key in identity) return String(identity[key as keyof Identity] ?? '')
  if (key === 'fullName') {
    return [identity.firstName, identity.middleName, identity.lastName, identity.nameSuffix]
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

export function yesNoToChoice(value: string, options: string[]): string {
  if (!value || options.length === 0) return value
  const wantYes = value === 'yes'
  const ranked = options.map((opt) => {
    const t = opt.toLowerCase()
    const yes = /^(yes|y|true|authorized|eligible)\b/.test(t) || /\byes\b/.test(t)
    const no = /^(no|n|false|not)\b/.test(t) || /\bno\b/.test(t)
    return { opt, score: wantYes ? (yes ? 2 : no ? 0 : 1) : no ? 2 : yes ? 0 : 1 }
  })
  ranked.sort((a, b) => b.score - a.score)
  return ranked[0]?.score ? ranked[0].opt : options[0]
}

export function matchSelect(value: string, options: string[]): string {
  if (!value || options.length === 0) return ''
  const v = value.toLowerCase().trim()
  const exact = options.find((o) => o.toLowerCase().trim() === v)
  if (exact) return exact
  const contains = options.find(
    (o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase()),
  )
  return contains ?? ''
}

export function heuristicValue(
  field: DetectedField,
  store: Store,
): string {
  if (field.kind === 'file') return store.resume ? '__resume__' : ''
  if (field.kind === 'experience') {
    const i = field.experienceIndex ?? 0
    const job = store.experience[i]
    if (!job) return ''
    const map: Record<string, string> = {
      'exp.company': job.company,
      'exp.title': job.title,
      'exp.location': job.location,
      'exp.startDate': job.startDate,
      'exp.endDate': job.current ? 'Present' : job.endDate,
      'exp.description': job.description,
    }
    return map[field.matchKey] ?? ''
  }
  if (field.kind === 'education') {
    const i = field.educationIndex ?? 0
    const edu = store.education[i]
    if (!edu) return ''
    const map: Record<string, string> = {
      'edu.school': edu.school,
      'edu.degree': edu.degree,
      'edu.field': edu.field,
      'edu.gpa': edu.gpa,
      'edu.startDate': edu.startDate,
      'edu.endDate': edu.endDate,
    }
    return map[field.matchKey] ?? ''
  }

  let raw = identityValue(store.identity, field.matchKey)
  if (!raw && field.matchKey === 'website') {
    raw = store.identity.portfolio || store.identity.github
  }
  if (!raw && /full\s*name|legal\s*name/i.test(field.label)) {
    raw = identityValue(store.identity, 'fullName')
  }
  if (field.kind === 'choice' || field.options.length > 0) {
    if (field.matchKey === 'workAuthorized' || field.matchKey === 'needsSponsorship' || field.matchKey === 'willingToRelocate' || field.matchKey === 'willingToTravel') {
      return yesNoToChoice(raw, field.options)
    }
    return matchSelect(raw, field.options) || raw
  }
  return raw
}

export function suggestionHints(field: DetectedField, store: Store): string[] {
  const id = store.identity
  if (['address1', 'address2', 'city', 'state', 'postalCode', 'country'].includes(field.matchKey)) {
    return [id.address1, id.address2, id.city, id.state, id.postalCode, id.country].filter(Boolean)
  }
  if (field.kind === 'experience') {
    const job = store.experience[field.experienceIndex ?? 0]
    return job ? [job.company, job.title, job.location].filter(Boolean) : []
  }
  if (field.kind === 'education') {
    const education = store.education[field.educationIndex ?? 0]
    return education ? [education.school, education.degree, education.field, education.location].filter(Boolean) : []
  }
  return []
}

export function needsAI(field: DetectedField, value: string): boolean {
  if (value) return false
  return isOpenEndedField(field) || field.kind === 'unknown' || field.kind === 'choice'
}

export function findSavedAnswer(question: string, store: Store): string {
  const q = question.toLowerCase()
  let best = ''
  let bestScore = 0
  for (const a of store.answers) {
    const t = a.question.toLowerCase()
    if (!t) continue
    if (q.includes(t) || t.includes(q)) {
      const score = Math.min(t.length, q.length)
      if (score > bestScore) {
        best = a.answer
        bestScore = score
      }
    }
  }
  return best
}

export function profileContext(store: Store): string {
  const id = store.identity
  const jobs = store.experience
    .map(
      (e) =>
        `- ${e.title} at ${e.company}${e.location ? `, ${e.location}` : ''} (${e.startDate}–${e.current ? 'present' : e.endDate})\n  ${e.description}`,
    )
    .join('\n')
  const edu = store.education
    .map((e) => `- ${e.degree} in ${e.field}, ${e.school}${e.location ? `, ${e.location}` : ''} (${e.startDate}–${e.endDate})${e.gpa ? `, GPA ${e.gpa}` : ''}`)
    .join('\n')
  const savedAnswers = store.answers
    .map((answer) => `- ${answer.question}: ${answer.answer}`)
    .join('\n')
  return [
    `Name: ${id.firstName} ${id.lastName}`,
    `Headline: ${id.headline}`,
    `Location: ${id.city}, ${id.state}, ${id.country}`,
    `Email: ${id.email}`,
    `Phone: ${id.phone}`,
    `Desired role: ${id.desiredJobTitle}`,
    `Years of experience: ${id.yearsExperience}`,
    `Work authorized: ${id.workAuthorized}`,
    `Needs sponsorship: ${id.needsSponsorship}`,
    `Visa status: ${id.visaStatus}`,
    `Work preference: ${[id.employmentType, id.remotePreference].filter(Boolean).join(', ')}`,
    `Portfolio: ${id.portfolio || id.website}`,
    `LinkedIn: ${id.linkedin}`,
    `GitHub: ${id.github}`,
    `Summary: ${id.summary}`,
    `Skills: ${store.skills.join(', ')}`,
    `Experience:\n${jobs}`,
    `Education:\n${edu}`,
    savedAnswers ? `Previously saved answers:\n${savedAnswers}` : '',
    store.resume?.text ? `Resume text:\n${store.resume.text.slice(0, 6000)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
