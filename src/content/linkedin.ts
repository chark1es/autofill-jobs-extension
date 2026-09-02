import type { Education, Experience, Identity, Store } from '../lib/types'
import { uid } from '../lib/storage'

const DATE_RANGE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present|Now)/i

type VoyagerRecord = Record<string, unknown> & {
  $type?: string
  entityUrn?: string
}

interface VoyagerPayload {
  data?: VoyagerRecord
  included?: VoyagerRecord[]
}

interface ParsedLinkedIn {
  identity: Partial<Identity>
  experience: Experience[]
  education: Education[]
  skills: string[]
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function visibleLines(el: Element): string[] {
  const aria = [...el.querySelectorAll('span[aria-hidden="true"]')]
    .filter((node) => !node.querySelector('span[aria-hidden="true"]'))
    .map((node) => text(node))
    .filter((line) => line.length < 500)
  if (aria.length) return unique(aria)
  return unique(text(el).split(/\n|(?<=\d)\s+·\s+/))
}

function profilePath(doc: Document): string {
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
  const raw = canonical || location.href
  const match = new URL(raw, location.href).pathname.match(/^\/in\/[^/]+/i)
  return match ? `${match[0]}/` : ''
}

function sectionRoot(doc: Document, name: string): Element | null {
  const lower = name.toLowerCase()
  const anchor = [...doc.querySelectorAll('[id]')].find((el) => {
    const id = el.id.toLowerCase()
    return id === lower || id === `${lower}-section` || id.endsWith(`-${lower}`)
  })
  const anchorSection = anchor?.closest('section')
  if (anchorSection) return anchorSection

  const heading = [...doc.querySelectorAll('h1, h2, h3')].find(
    (el) => text(el).toLowerCase() === lower,
  )
  return heading?.closest('section, main') ?? anchor?.parentElement ?? null
}

function datePair(raw: string): { startDate: string; endDate: string; current: boolean } {
  const match = raw.match(DATE_RANGE)
  if (!match) return { startDate: '', endDate: '', current: /present|now/i.test(raw) }
  const current = /present|now/i.test(match[2])
  return {
    startDate: match[1],
    endDate: current ? '' : match[2],
    current,
  }
}

function leafItems(root: Element, requiresDate = false): Element[] {
  const entitySelector = '[data-view-name*="profile-component-entity"]'
  const entities = [...root.querySelectorAll(entitySelector)].filter(
    (item) => !item.querySelector(entitySelector),
  )
  const listItems = [...root.querySelectorAll('li')].filter((item) => {
    if (item.querySelector('li')) return false
    return !requiresDate || DATE_RANGE.test(text(item))
  })
  const candidates = entities.length ? entities : listItems
  return candidates.filter((item) => !requiresDate || DATE_RANGE.test(text(item)))
}

function parentCompany(item: Element, root: Element): string {
  let parent = item.parentElement?.closest('li')
  while (parent && root.contains(parent)) {
    const line = visibleLines(parent)[0] ?? ''
    if (line && !DATE_RANGE.test(line)) return line
    parent = parent.parentElement?.closest('li')
  }
  return ''
}

function cleanOrganization(raw: string): string {
  return raw
    .replace(/\s*·\s*(Full[- ]time|Part[- ]time|Contract|Freelance|Internship|Self-employed|Temporary|Apprenticeship).*$/i, '')
    .trim()
}

function parseExperience(doc: Document): Experience[] {
  const root = sectionRoot(doc, 'experience')
  if (!root) return []
  const jobs: Experience[] = []
  for (const item of leafItems(root, true).slice(0, 20)) {
    const lines = visibleLines(item)
    const dateIndex = lines.findIndex((line) => DATE_RANGE.test(line))
    if (dateIndex < 0) continue
    const dates = datePair(lines[dateIndex])
    const beforeDate = lines.slice(0, dateIndex).filter((line) => !/^logo$/i.test(line))
    const title = beforeDate[0] ?? ''
    const company = cleanOrganization(beforeDate[1] || parentCompany(item, root))
    const location = lines
      .slice(dateIndex + 1)
      .find((line) => !/\b(?:yr|yrs|mo|mos|year|years|month|months)\b/i.test(line)) ?? ''
    const description = text(
      item.querySelector('.inline-show-more-text, [class*="inline-show-more"], [data-field="description"]'),
    )
    if (!title) continue
    jobs.push({
      id: uid('exp'),
      company: company.slice(0, 120),
      title: title.slice(0, 120),
      location: location.slice(0, 160),
      startDate: dates.startDate,
      endDate: dates.endDate,
      current: dates.current,
      description: description.slice(0, 2000),
    })
  }
  return jobs
}

function parseEducation(doc: Document): Education[] {
  const root = sectionRoot(doc, 'education')
  if (!root) return []
  const schools: Education[] = []
  for (const item of leafItems(root).slice(0, 12)) {
    const lines = visibleLines(item)
    const dateIndex = lines.findIndex((line) => DATE_RANGE.test(line))
    const dates = datePair(dateIndex >= 0 ? lines[dateIndex] : text(item))
    const school = lines[0] ?? ''
    if (!school || /show all|education/i.test(school)) continue
    const degreeLine = (dateIndex > 1 ? lines[1] : lines.slice(1).find((line) => !DATE_RANGE.test(line))) ?? ''
    const degreeParts = degreeLine.split(',').map((part) => part.trim())
    const location = lines.find((line) => /,\s*[A-Z]{2}\b|,\s*[^,]+$/i.test(line) && line !== degreeLine) ?? ''
    schools.push({
      id: uid('edu'),
      school: school.slice(0, 160),
      degree: (degreeParts[0] ?? '').slice(0, 120),
      field: degreeParts.slice(1).join(', ').slice(0, 120),
      location: location.slice(0, 160),
      startDate: dates.startDate,
      endDate: dates.endDate,
      gpa: text(item).match(/GPA[:\s]+([0-9.]+)/i)?.[1] ?? '',
    })
  }
  return schools
}

function parseSkills(doc: Document): string[] {
  const root = sectionRoot(doc, 'skills')
  if (!root) return []
  const itemSkills = leafItems(root)
    .map((item) => visibleLines(item)[0] ?? '')
    .filter((value) => !/endorsement|show all|skill/i.test(value))
  const fallback = [...root.querySelectorAll('.t-bold span[aria-hidden="true"], strong')].map((el) => text(el))
  return unique(itemSkills.length ? itemSkills : fallback)
    .filter((value) => value.length > 1 && value.length < 100)
    .slice(0, 100)
}

function parseName(fullName: string): Partial<Identity> {
  const parts = fullName.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).filter(Boolean)
  const suffixMatch = parts.at(-1)?.match(/^(Jr\.?|Sr\.?|II|III|IV)$/i)
  const nameSuffix = suffixMatch ? parts.pop() ?? '' : ''
  return {
    firstName: parts.shift() ?? '',
    middleName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
    lastName: parts.pop() ?? '',
    nameSuffix,
  }
}

function topCard(doc: Document): Element {
  const h1 = doc.querySelector('main h1') ?? doc.querySelector('h1')
  return h1?.closest('section') ?? h1?.parentElement?.parentElement ?? doc.body
}

function parseIdentity(doc: Document, linkedin: string): Partial<Identity> {
  const card = topCard(doc)
  const fullName = text(card.querySelector('h1'))
  const headline = text(
    card.querySelector('.text-body-medium, [data-generated-suggestion-target*="headline"]'),
  )
  const locationText = text(
    card.querySelector('.text-body-small.inline, .text-body-small:not(.break-words), [class*="top-card"] .text-body-small'),
  )
  const locationParts = locationText.split(',').map((part) => part.trim())
  const aboutRoot = sectionRoot(doc, 'about')
  const summary = text(
    aboutRoot?.querySelector('.inline-show-more-text, [class*="inline-show-more"]') ?? aboutRoot,
  ).replace(/^About\s*/i, '')
  return {
    ...parseName(fullName),
    headline,
    summary: summary.slice(0, 3000),
    city: locationParts[0] ?? '',
    state: locationParts.length > 2 ? locationParts[1] : '',
    country: locationParts.length > 1 ? locationParts.at(-1) ?? '' : '',
    linkedin,
  }
}

function parseContact(doc: Document): Partial<Identity> {
  const raw = text(doc.body)
  const email = doc.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')?.href.replace(/^mailto:/i, '') ||
    raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
  const phone = doc.querySelector<HTMLAnchorElement>('a[href^="tel:"]')?.href.replace(/^tel:/i, '') ||
    raw.match(/(?:\+?\d[\d ().-]{7,}\d)/)?.[0] || ''
  const externalUrls = [...doc.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')]
    .map((anchor) => anchor.href)
    .filter((href) => !/linkedin\.com/i.test(href))
  const github = externalUrls.find((href) => /github\.com/i.test(href)) ?? ''
  const portfolio = externalUrls.find((href) => !/github\.com/i.test(href)) ?? ''
  return { email, phone, github, portfolio }
}

function asRecord(value: unknown): VoyagerRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as VoyagerRecord)
    : null
}

function fieldText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const record = asRecord(value)
  return typeof record?.text === 'string' ? record.text.trim() : ''
}

function voyagerDate(value: unknown): string {
  const date = asRecord(value)
  if (!date || typeof date.year !== 'number') return ''
  return typeof date.month === 'number'
    ? `${date.year}-${String(date.month).padStart(2, '0')}`
    : String(date.year)
}

function makeVoyagerIndex(payload: VoyagerPayload): Map<string, VoyagerRecord> {
  const index = new Map<string, VoyagerRecord>()
  for (const item of payload.included ?? []) {
    if (item.entityUrn) index.set(item.entityUrn, item)
  }
  return index
}

function resolveRecord(value: unknown, index: Map<string, VoyagerRecord>): VoyagerRecord | null {
  if (typeof value === 'string') return index.get(value) ?? null
  return asRecord(value)
}

function collectionItems(
  owner: VoyagerRecord,
  key: string,
  index: Map<string, VoyagerRecord>,
): VoyagerRecord[] {
  const collection = resolveRecord(owner[key], index)
  if (!collection) return []
  const elements = collection['*elements'] ?? collection.elements
  if (!Array.isArray(elements)) return []
  return elements
    .map((item) => resolveRecord(item, index))
    .filter((item): item is VoyagerRecord => Boolean(item))
}

function belongsToProfile(item: VoyagerRecord, profileId: string): boolean {
  return Boolean(item.entityUrn?.includes(`(${profileId},`))
}

function targetProfile(
  payload: VoyagerPayload,
  index: Map<string, VoyagerRecord>,
): VoyagerRecord | null {
  const targetRef = payload.data?.['*elements']
  const targetUrn = Array.isArray(targetRef) ? targetRef[0] : undefined
  const resolved = resolveRecord(targetUrn, index)
  if (resolved?.$type?.endsWith('.Profile')) return resolved
  return (payload.included ?? []).find((item) => item.$type?.endsWith('.Profile')) ?? null
}

function voyagerExperience(
  profile: VoyagerRecord,
  index: Map<string, VoyagerRecord>,
): Experience[] {
  const positions: VoyagerRecord[] = []
  for (const group of collectionItems(profile, '*profilePositionGroups', index)) {
    positions.push(...collectionItems(group, '*profilePositionInPositionGroup', index))
  }

  const profileId = profile.entityUrn?.replace(/^urn:li:fsd_profile:/, '') ?? ''
  if (!positions.length && profileId) {
    positions.push(
      ...[...index.values()].filter(
        (item) => item.$type?.endsWith('.Position') && belongsToProfile(item, profileId),
      ),
    )
  }

  return positions
    .filter((item) => item.$type?.endsWith('.Position'))
    .map((position) => {
      const range = asRecord(position.dateRange)
      const startDate = voyagerDate(range?.start)
      const endDate = voyagerDate(range?.end)
      const companyRef = resolveRecord(position['*company'], index)
      return {
        id: uid('exp'),
        company: (fieldText(position.companyName) || fieldText(companyRef?.name)).slice(0, 120),
        title: fieldText(position.title).slice(0, 120),
        location: (fieldText(position.locationName) || fieldText(position.geoLocationName)).slice(0, 160),
        startDate,
        endDate,
        current: Boolean(startDate && !endDate),
        description: fieldText(position.description).slice(0, 2000),
      }
    })
    .filter((position) => position.title || position.company)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
}

function voyagerEducation(
  profile: VoyagerRecord,
  index: Map<string, VoyagerRecord>,
): Education[] {
  let records = collectionItems(profile, '*profileEducations', index)
  const profileId = profile.entityUrn?.replace(/^urn:li:fsd_profile:/, '') ?? ''
  if (!records.length && profileId) {
    records = [...index.values()].filter(
      (item) => item.$type?.endsWith('.Education') && belongsToProfile(item, profileId),
    )
  }
  return records
    .filter((item) => item.$type?.endsWith('.Education'))
    .map((education) => {
      const range = asRecord(education.dateRange)
      const schoolRef = resolveRecord(education['*school'], index)
      return {
        id: uid('edu'),
        school: (fieldText(education.schoolName) || fieldText(schoolRef?.name)).slice(0, 160),
        degree: fieldText(education.degreeName).slice(0, 120),
        field: fieldText(education.fieldOfStudy).slice(0, 120),
        location: (fieldText(education.locationName) || fieldText(schoolRef?.locationName)).slice(0, 160),
        startDate: voyagerDate(range?.start),
        endDate: voyagerDate(range?.end),
        gpa: (fieldText(education.grade) || fieldText(education.gradeValue)).slice(0, 30),
      }
    })
    .filter((education) => education.school || education.degree)
}

function voyagerSkills(
  profile: VoyagerRecord,
  index: Map<string, VoyagerRecord>,
): string[] {
  let records = collectionItems(profile, '*profileSkills', index)
  const profileId = profile.entityUrn?.replace(/^urn:li:fsd_profile:/, '') ?? ''
  if (!records.length && profileId) {
    records = [...index.values()].filter(
      (item) => item.$type?.endsWith('.Skill') && belongsToProfile(item, profileId),
    )
  }
  return unique(records.map((skill) => fieldText(skill.name)))
    .filter((skill) => skill.length > 1 && skill.length < 100)
    .slice(0, 100)
}

export function parseVoyagerProfile(
  payload: VoyagerPayload,
  linkedin: string,
): ParsedLinkedIn | null {
  const index = makeVoyagerIndex(payload)
  const profile = targetProfile(payload, index)
  if (!profile) return null

  const geoLocation = asRecord(profile.geoLocation)
  const geo = resolveRecord(geoLocation?.geoUrn ?? geoLocation?.['*geo'], index)
  const locationText =
    fieldText(profile.locationName) ||
    fieldText(profile.address) ||
    fieldText(geo?.defaultLocalizedName) ||
    fieldText(geo?.defaultLocalizedNameWithoutCountryName)
  const locationParts = locationText.split(',').map((part) => part.trim()).filter(Boolean)
  const firstName = fieldText(profile.firstName)
  const lastName = fieldText(profile.lastName)
  const identity = nonEmptyIdentity({
    firstName,
    lastName,
    headline: fieldText(profile.headline),
    summary: fieldText(profile.summary).slice(0, 3000),
    city: locationParts[0] ?? '',
    state: locationParts.length > 2 ? locationParts[1] : '',
    country: locationParts.length > 1 ? locationParts.at(-1) ?? '' : '',
    linkedin,
  })
  const experience = voyagerExperience(profile, index)
  return {
    identity,
    experience,
    education: voyagerEducation(profile, index),
    skills: voyagerSkills(profile, index),
  }
}

function voyagerHeaders(): HeadersInit {
  const match = document.cookie.match(/(?:^|;\s*)JSESSIONID=("?[^";]+"?)/)
  if (!match) throw new Error('LinkedIn session cookie is unavailable. Sign in again and retry.')
  const csrf = decodeURIComponent(match[1]).replace(/^"|"$/g, '')
  return {
    'csrf-token': csrf,
    'x-restli-protocol-version': '2.0.0',
    accept: 'application/vnd.linkedin.normalized+json+2.1',
  }
}

async function fetchVoyagerProfile(
  publicId: string,
  linkedin: string,
): Promise<ParsedLinkedIn> {
  const params = new URLSearchParams({
    q: 'memberIdentity',
    memberIdentity: publicId,
    decorationId: 'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-101',
  })
  const endpoint = new URL(`/voyager/api/identity/dash/profiles?${params}`, location.origin)
  const response = await fetch(endpoint.href, {
    credentials: 'include',
    headers: voyagerHeaders(),
  })
  if (response.status === 401) throw new Error('LinkedIn says this session is signed out. Sign in again and retry.')
  if (response.status === 403) throw new Error('LinkedIn blocked profile access (403). Open your own profile and retry.')
  if (response.status === 429) throw new Error('LinkedIn temporarily rate-limited the import. Wait a few minutes and retry.')
  if (!response.ok) throw new Error(`LinkedIn profile request failed (${response.status}).`)
  const parsed = parseVoyagerProfile((await response.json()) as VoyagerPayload, linkedin)
  if (!parsed) throw new Error('LinkedIn returned an unreadable profile response.')
  return parsed
}

async function fetchDocument(url: string): Promise<Document | null> {
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok || /\/login|\/checkpoint/i.test(response.url)) return null
    return new DOMParser().parseFromString(await response.text(), 'text/html')
  } catch {
    return null
  }
}

function nonEmptyIdentity(value: Partial<Identity>): Partial<Identity> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => typeof field === 'string' && field.trim()),
  ) as Partial<Identity>
}

export async function importLinkedIn(): Promise<Partial<Store>> {
  if (!/(^|\.)linkedin\.com$/i.test(location.hostname)) {
    throw new Error('Open a LinkedIn profile before importing.')
  }
  const path = profilePath(document)
  if (!path) throw new Error('Open the profile page you want to import (linkedin.com/in/…).')

  const baseUrl = new URL(path, location.origin).href
  const publicId = path.split('/').filter(Boolean)[1] ?? ''
  let voyager: ParsedLinkedIn | null = null
  let voyagerError = ''
  try {
    voyager = await fetchVoyagerProfile(publicId, baseUrl)
  } catch (error) {
    voyagerError = error instanceof Error ? error.message : String(error)
  }

  if (voyager) {
    const contactDoc = await fetchDocument(`${baseUrl}overlay/contact-info/`)
    const identity = nonEmptyIdentity({
      ...parseIdentity(document, baseUrl),
      ...voyager.identity,
      ...(contactDoc ? parseContact(contactDoc) : {}),
    })
    return {
      identity: identity as Identity,
      experience: voyager.experience,
      education: voyager.education,
      skills: voyager.skills,
    }
  }

  const [experienceDoc, educationDoc, skillsDoc, contactDoc] = await Promise.all([
    fetchDocument(`${baseUrl}details/experience/`),
    fetchDocument(`${baseUrl}details/education/`),
    fetchDocument(`${baseUrl}details/skills/`),
    fetchDocument(`${baseUrl}overlay/contact-info/`),
  ])

  const identity = nonEmptyIdentity({
    ...parseIdentity(document, baseUrl),
    ...(contactDoc ? parseContact(contactDoc) : {}),
  })
  const experience = parseExperience(experienceDoc ?? document)
  const education = parseEducation(educationDoc ?? document)
  const skills = parseSkills(skillsDoc ?? document)

  if (!identity.firstName && !identity.headline && !experience.length && !education.length && !skills.length) {
    throw new Error(voyagerError || 'LinkedIn did not expose profile data. Refresh the profile page and try again.')
  }
  return { identity: identity as Identity, experience, education, skills }
}
