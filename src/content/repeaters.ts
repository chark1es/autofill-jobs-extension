import type { ExpandRepeatersResult, FieldKind } from '../lib/types'
import { detectFields } from './detect'

type RepeaterKind = 'experience' | 'education'

const ADD = /\b(add|another|new|create)\b/i
const EXPERIENCE = /\b(work|employment|experience|job|position|role)\b/i
const EDUCATION = /\b(education|school|college|university|degree)\b/i

function visible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style?.display === 'none' || style?.visibility === 'hidden') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function controlText(el: HTMLElement): string {
  const own = [
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el.getAttribute('data-automation-id'),
    el instanceof HTMLInputElement ? el.value : '',
    el.textContent,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const section = el.closest('fieldset, section, [class*="experience"], [class*="education"]')
  const heading = section?.querySelector('legend, h1, h2, h3, h4')?.textContent ?? ''
  const parent = el.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) ?? ''
  return `${/^\s*\+\s*$/.test(own) ? 'add' : own} ${heading} ${parent}`.trim()
}

function repeaterKind(el: HTMLElement): RepeaterKind | null {
  const value = controlText(el)
  if (!ADD.test(value) || /\b(remove|delete)\b/i.test(value)) return null
  if (EXPERIENCE.test(value)) return 'experience'
  if (EDUCATION.test(value)) return 'education'
  return null
}

function controls(): HTMLElement[] {
  const found: HTMLElement[] = []
  const roots: Array<Document | ShadowRoot> = [document]
  while (roots.length) {
    const root = roots.pop()!
    root.querySelectorAll<HTMLElement>('button, [role="button"], input[type="button"]').forEach((el) => {
      found.push(el)
    })
    root.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot)
    })
  }
  return found.filter((el) => visible(el) && !el.hasAttribute('disabled'))
}

function findAddControl(kind: RepeaterKind): HTMLElement | null {
  return controls().find((control) => repeaterKind(control) === kind) ?? null
}

function groupCount(kind: Extract<FieldKind, 'experience' | 'education'>): number {
  const fields = detectFields().fields.filter((field) => field.kind === kind)
  if (!fields.length) return 0
  const indexes = fields
    .map((field) => kind === 'experience' ? field.experienceIndex : field.educationIndex)
    .filter((index): index is number => index !== null)
  const indexedCount = indexes.length ? Math.max(...indexes) + 1 : 1
  const anchors = kind === 'experience'
    ? new Set(['exp.company', 'exp.title'])
    : new Set(['edu.school', 'edu.degree'])
  const anchorCounts = new Map<string, number>()
  for (const field of fields) {
    if (!anchors.has(field.matchKey)) continue
    anchorCounts.set(field.matchKey, (anchorCounts.get(field.matchKey) ?? 0) + 1)
  }
  const repeatedCount = Math.max(1, ...anchorCounts.values())
  return Math.max(indexedCount, repeatedCount)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForGroup(kind: RepeaterKind, previous: number): Promise<number> {
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(75)
    const count = groupCount(kind)
    if (count > previous) return count
  }
  return groupCount(kind)
}

async function expand(kind: RepeaterKind, desired: number): Promise<number> {
  let current = groupCount(kind)
  let added = 0
  const target = Math.min(Math.max(desired, 0), 20)
  while (current < target) {
    const control = findAddControl(kind)
    if (!control) break
    control.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
    control.click()
    const next = await waitForGroup(kind, current)
    if (next <= current) break
    added += next - current
    current = next
  }
  return added
}

export async function expandRepeaters(
  experience: number,
  education: number,
): Promise<ExpandRepeatersResult> {
  return {
    experienceAdded: await expand('experience', experience),
    educationAdded: await expand('education', education),
  }
}
