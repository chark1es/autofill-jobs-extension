import { classifyField } from '../lib/match'
import type { DetectedField, DetectResult } from '../lib/types'

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'color'])
const HONEYPOT = /\b(honeypot|website_url|fax|leave.?blank)\b/i
const MANUAL_CHECKBOX = /\b(terms?|privacy|consent|communication.?preference|marketing|newsletter|opt.?in)\b/i
const MANUAL_CHOICE = /\b(consent|privacy|terms?|marketing|newsletter|text messages?|sms|communication preference|contacted regarding)\b/i

function visible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (!style) return true
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function allElements(doc: Document): HTMLElement[] {
  const out: HTMLElement[] = []
  const stack: Array<Document | ShadowRoot> = [doc]
  while (stack.length) {
    const root = stack.pop()!
    root.querySelectorAll('*').forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      out.push(el)
      if (el.shadowRoot) stack.push(el.shadowRoot)
    })
  }
  return out
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function customMenuLabel(el: HTMLElement): string {
  if (!(el instanceof HTMLButtonElement) || el.getAttribute('aria-haspopup') !== 'true') return ''
  const wrapper = el.closest('c-lwc-drop-down-menu')
  const wrapperLabel = wrapper?.querySelector('.labelTextDropDown')
  if (wrapperLabel) {
    const ownText = textOf(el)
    const label = textOf(wrapperLabel).replace(ownText, '').replace(/\s*\*\s*$/, '').trim()
    if (label) return label
  }
  const hostLabel = el.closest('lightning-button-menu')?.getAttribute('aria-label') || ''
  return hostLabel.replace(/^select\s+(?:a|an|the)\s+/i, '').replace(/show menu$/i, '').trim()
}

function choiceContainer(el: HTMLElement): HTMLElement | null {
  return el.closest('c-as-apply-question, [role="radiogroup"], fieldset') as HTMLElement | null
}

function choiceQuestion(el: HTMLElement): string {
  const container = choiceContainer(el)
  if (!container) return ''
  return textOf(container.querySelector('.as-question-title, legend, [role="heading"], h1, h2, h3, h4'))
    .replace(/\s*\*\s*$/, '')
    .trim()
}

function choiceOptionLabel(el: HTMLInputElement): string {
  if (el.getAttribute('alt')) return el.getAttribute('alt')!.trim()
  if (el.id) {
    const label = el.ownerDocument.querySelector(`label[for="${cssEscape(el.id)}"]`)
    const labelText = textOf(label)
    if (labelText) return labelText
  }
  return el.getAttribute('aria-label') || el.value || ''
}

function sectionContext(el: HTMLElement): string {
  const section = el.closest(
    'fieldset, section, [class*="experience"], [class*="employment"], [class*="education"], [class*="school"]',
  )
  return textOf(section?.querySelector('legend, h1, h2, h3, h4, [role="heading"]') ?? null)
}

function labelledBy(el: HTMLElement): string {
  const id = el.getAttribute('aria-labelledby')
  if (!id) return ''
  return id
    .split(/\s+/)
    .map((i) => textOf(el.ownerDocument.getElementById(i)))
    .join(' ')
}

export function fieldLabel(el: HTMLElement): string {
  const menu = customMenuLabel(el)
  if (menu) return menu
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    const question = choiceQuestion(el)
    if (question) return question
  }
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()
  const by = labelledBy(el)
  if (by) return by
  if (el.id) {
    const viaFor = el.ownerDocument.querySelector(`label[for="${cssEscape(el.id)}"]`)
    const viaForText = textOf(viaFor)
    if (viaForText) return viaForText
  }
  const wrap = el.closest('label')
  const wrapText = textOf(wrap)
  if (wrapText) return wrapText
  const dt = el.closest('div, li, td, section, fieldset')
  const nearby = dt?.querySelector('label, legend, .label, [class*="label"], [data-automation-id$="label"]')
  const nearbyText = nearby !== el ? textOf(nearby ?? null) : ''
  if (nearbyText) return nearbyText
  const prev = el.previousElementSibling
  const previousText = prev && /label|legend|span|p|div/i.test(prev.tagName) ? textOf(prev) : ''
  if (previousText) return previousText
  const workday = el.getAttribute('data-automation-id')
  if (workday) return workday.replace(/[-_]/g, ' ')
  return (
    el.getAttribute('placeholder') ||
    el.getAttribute('name') ||
    el.getAttribute('formcontrolname') ||
    el.getAttribute('ng-reflect-name') ||
    el.id ||
    ''
  ).trim()
}

function cssEscape(id: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(id)
  return id.replace(/"/g, '\\"')
}

function optionsOf(el: HTMLElement): string[] {
  if (el instanceof HTMLSelectElement) {
    return [...el.options].map((o) => o.textContent?.trim() || o.value).filter(Boolean)
  }
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    const container = choiceContainer(el)
    if (container) {
      return [...container.querySelectorAll('input[type="radio"], input[type="checkbox"]')]
        .map((node) => choiceOptionLabel(node as HTMLInputElement))
        .filter(Boolean)
    }
  }
  const groupName = el.getAttribute('name')
  if (
    (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) &&
    groupName
  ) {
    const group = el.ownerDocument.querySelectorAll(`input[name="${cssEscape(groupName)}"]`)
    return [...group].map((n) => {
      const input = n as HTMLInputElement
      const lab = fieldLabel(input)
      return lab || input.value
    })
  }
  const listId = el.getAttribute('list') || el.getAttribute('aria-controls')
  if (listId) {
    const list = el.ownerDocument.getElementById(listId)
    if (list) {
      return [...list.querySelectorAll('[role="option"], option, li')]
        .map((o) => textOf(o))
        .filter(Boolean)
        .slice(0, 40)
    }
  }
  return []
}

function currentValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? el.value || 'on' : ''
    return el.value
  }
  if (el instanceof HTMLTextAreaElement) return el.value
  if (el instanceof HTMLSelectElement) {
    return el.selectedOptions[0]?.textContent?.trim() || el.value
  }
  if (el.isContentEditable) return el.textContent?.trim() ?? ''
  return (el.getAttribute('value') || textOf(el)).slice(0, 200)
}

function isField(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement && customMenuLabel(el)) {
    return /\b(country|state|province|region)\b/i.test(customMenuLabel(el))
  }
  if (el instanceof HTMLInputElement) {
    if (SKIP_TYPES.has(el.type)) return false
    if (el.disabled || el.readOnly) return false
    return true
  }
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly
  if (el instanceof HTMLSelectElement) return !el.disabled
  if (el.isContentEditable && el.getAttribute('role') !== 'button') return true
  const role = el.getAttribute('role')
  if (role === 'combobox' || role === 'listbox' || role === 'textbox' || role === 'searchbox') {
    return true
  }
  return false
}

function stamp(el: HTMLElement, uid: string) {
  el.setAttribute('data-carbon-uid', uid)
}

export function elementByUid(uid: string): HTMLElement | null {
  const doc = document
  const direct = doc.querySelector(`[data-carbon-uid="${cssEscape(uid)}"]`)
  if (direct instanceof HTMLElement) return direct
  for (const el of allElements(doc)) {
    if (el.getAttribute('data-carbon-uid') === uid) return el
  }
  return null
}

function clusterIndex(
  el: HTMLElement,
  kind: 'experience' | 'education',
  fields: Array<{ el: HTMLElement; kind: string; matchKey: string }>,
): number | null {
  const peers = fields.filter((field) => field.kind === kind)
  if (peers.length === 0) return null

  const rootFor = (field: HTMLElement) =>
    field.closest(
      '[class*="experience"], [class*="employment"], [class*="education"], [data-automation-id*="education"], [data-automation-id*="work"], fieldset, li, tr, [class*="repeat"]',
    ) ?? field.parentElement
  const rootCounts = new Map<Element, number>()
  for (const peer of peers) {
    const root = rootFor(peer.el)
    if (root) rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1)
  }

  // Prefer explicit repeated containers when each container owns multiple
  // fields. A collection of one-field wrappers is not an experience group.
  if (rootCounts.size > 1 && [...rootCounts.values()].every((count) => count > 1)) {
    const sections = new Map<Element, number>()
    let next = 0
    for (const peer of peers) {
      const root = rootFor(peer.el)
      if (root && !sections.has(root)) sections.set(root, next++)
    }
    const mine = rootFor(el)
    if (mine && sections.has(mine)) return sections.get(mine)!
  }

  // Some ATSs put every repeated entry inside one shared container. Infer a
  // new group when a reliable anchor such as company/title repeats.
  const anchors = kind === 'experience'
    ? new Set(['exp.company', 'exp.title'])
    : new Set(['edu.school', 'edu.degree'])
  const indexes = new Map<HTMLElement, number>()
  const seen = new Set<string>()
  let next = 0
  for (const peer of peers) {
    if (anchors.has(peer.matchKey) && seen.has(peer.matchKey)) {
      next += 1
      seen.clear()
    }
    indexes.set(peer.el, next)
    if (anchors.has(peer.matchKey)) seen.add(peer.matchKey)
  }
  return indexes.get(el) ?? 0
}

export function detectFields(): DetectResult {
  const els = allElements(document).filter((el) => {
    if (!isField(el)) return false
    if (el instanceof HTMLInputElement && el.type === 'file') return true
    return visible(el)
  })
  const prelim = els
    .filter((el) => {
      const identity = [
        el.getAttribute('name'),
        el.getAttribute('formcontrolname'),
        el.getAttribute('ng-reflect-name'),
        el.id,
      ].filter(Boolean).join(' ')
      if (HONEYPOT.test(identity)) return false
      const question = choiceQuestion(el)
      if (question && MANUAL_CHOICE.test(question)) return false
      if (el instanceof HTMLInputElement && el.type === 'checkbox' && MANUAL_CHECKBOX.test(identity)) {
        return false
      }
      return true
    })
    .map((el) => {
      const label = fieldLabel(el)
      const name =
        el.getAttribute('name') ||
        el.getAttribute('formcontrolname') ||
        el.getAttribute('ng-reflect-name') ||
        el.id ||
        ''
      const autocomplete = el.getAttribute('autocomplete') ?? ''
      const inputType = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase()
      const tag = el.tagName.toLowerCase()
      const options = optionsOf(el)
      const { matchKey, kind } = classifyField({
        label,
        name,
        autocomplete,
        inputType,
        tag,
        options,
        context: sectionContext(el),
      })
      return { el, label, name, autocomplete, inputType, tag, options, matchKey, kind }
    })

  const choiceSeen = new Set<string | Element>()
  const fields: DetectedField[] = []
  prelim.forEach((p) => {
    if (p.el instanceof HTMLInputElement && (p.inputType === 'radio' || p.inputType === 'checkbox')) {
      const container = choiceContainer(p.el)
      const group: string | Element | null = container || (p.name ? `${p.inputType}:${p.name}` : null)
      if (group && choiceSeen.has(group)) return
      if (group) choiceSeen.add(group)
    }
    const uid = `f${fields.length}_${(p.name || p.label || 'x').slice(0, 24).replace(/\W+/g, '_')}`
    stamp(p.el, uid)
    const exp =
      p.kind === 'experience'
        ? clusterIndex(p.el, 'experience', prelim)
        : null
    const edu =
      p.kind === 'education' ? clusterIndex(p.el, 'education', prelim) : null
    fields.push({
      uid,
      kind: p.kind,
      label: p.label || p.name || p.inputType,
      name: p.name,
      autocomplete: p.autocomplete,
      inputType: p.inputType,
      tag: p.tag,
      required:
        p.el.hasAttribute('required') ||
        p.el.getAttribute('aria-required') === 'true' ||
        Boolean(p.el.closest('c-lwc-drop-down-menu')?.querySelector('.asterisk')) ||
        Boolean(choiceContainer(p.el)?.querySelector('.as-question-title span')),
      options: p.options,
      matchKey: p.matchKey,
      currentValue: currentValue(p.el),
      experienceIndex: exp,
      educationIndex: edu,
    })
  })

  const host = location.hostname
  return {
    url: location.href,
    title: document.title,
    host,
    isLinkedIn: host.endsWith('linkedin.com'),
    fields,
  }
}
