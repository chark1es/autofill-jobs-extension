import type { Education, Experience, Identity, Store } from '../lib/types'
import { uid } from '../lib/storage'

function text(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function section(name: string): Element | null {
  const re = new RegExp(`^${name}$`, 'i')
  const h = [...document.querySelectorAll('h1, h2, h3, section, div')].find((el) => {
    const t = text(el)
    return t.length < 40 && re.test(t)
  })
  return h ? h.closest('section, div, li') ?? h.parentElement : null
}

function datePair(raw: string): { startDate: string; endDate: string; current: boolean } {
  const m = raw.match(
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present|Now)/i,
  )
  if (!m) return { startDate: '', endDate: '', current: /present/i.test(raw) }
  return {
    startDate: m[1],
    endDate: /present|now/i.test(m[2]) ? '' : m[2],
    current: /present|now/i.test(m[2]),
  }
}

function parseExperience(): Experience[] {
  const root =
    document.querySelector('#experience, [id*="experience"]') ??
    section('experience')
  if (!root) return []
  const items = [...root.querySelectorAll('li, [data-view-name*="profile-component-entity"]')].slice(
    0,
    12,
  )
  const jobs: Experience[] = []
  for (const item of items) {
    const lines = text(item)
    if (lines.length < 8) continue
    const titleEl = item.querySelector('span[aria-hidden="true"], .t-bold span, h3, strong')
    const title = text(titleEl) || lines.split('·')[0]?.slice(0, 80)
    const company =
      text(item.querySelector('.t-14 span[aria-hidden="true"]')) ||
      (lines.match(/at\s+([^·\n]+)/i)?.[1] ?? '')
    const dates = datePair(lines)
    if (!title) continue
    jobs.push({
      id: uid('exp'),
      company: company.slice(0, 120),
      title: title.slice(0, 120),
      location: (lines.match(/\b([A-Z][a-z]+(?:,\s*[A-Z]{2})?)\b/) ?? ['', ''])[1],
      startDate: dates.startDate,
      endDate: dates.endDate,
      current: dates.current,
      description: lines.slice(0, 1200),
    })
  }
  return jobs
}

function parseEducation(): Education[] {
  const root = document.querySelector('#education, [id*="education"]') ?? section('education')
  if (!root) return []
  const items = [...root.querySelectorAll('li')].slice(0, 8)
  return items
    .map((item) => {
      const lines = text(item)
      const dates = datePair(lines)
      return {
        id: uid('edu'),
        school: text(item.querySelector('span[aria-hidden="true"], h3, strong')) || lines.slice(0, 80),
        degree: (lines.match(/(Bachelor|Master|PhD|B\.?S\.?|M\.?S\.?|MBA|Associate)[^·\n]*/i)?.[0] ?? '').trim(),
        field: (lines.match(/in\s+([^·\n]+)/i)?.[1] ?? '').trim(),
        location: '',
        startDate: dates.startDate,
        endDate: dates.endDate,
        gpa: (lines.match(/GPA[:\s]+([0-9.]+)/i)?.[1] ?? ''),
      }
    })
    .filter((e) => e.school)
}

function parseSkills(): string[] {
  const root = document.querySelector('#skills, [id*="skills"]') ?? section('skills')
  if (!root) return []
  return [...root.querySelectorAll('a, span[aria-hidden="true"]')]
    .map((el) => text(el))
    .filter((t) => t.length > 1 && t.length < 40)
    .slice(0, 40)
}

export function importLinkedIn(): Partial<Store> {
  const h1 = document.querySelector('h1')
  const full = text(h1)
  const [firstName, ...rest] = full.split(' ')
  const lastName = rest.join(' ')
  const headline = text(document.querySelector('.text-body-medium, .pv-text-details__left-panel .text-body-medium'))
  const about = text(
    document.querySelector('#about ~ * .inline-show-more-text, [id*="about"] .inline-show-more-text, section.pv-about-section'),
  )
  const loc = text(document.querySelector('.text-body-small.inline, span.text-body-small'))
  const identity: Partial<Identity> = {
    firstName: firstName ?? '',
    lastName,
    headline,
    summary: about.slice(0, 2000),
    city: loc.split(',')[0]?.trim() ?? '',
    state: loc.split(',')[1]?.trim() ?? '',
    linkedin: location.href.split('?')[0],
  }
  return {
    identity: { ...identity } as Identity,
    experience: parseExperience(),
    education: parseEducation(),
    skills: parseSkills(),
  }
}
