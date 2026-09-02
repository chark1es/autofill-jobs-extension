import { classifyField } from '../lib/match'
import type { DetectedField, DetectResult } from '../lib/types'

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'color'])
const HONEYPOT = /\b(honeypot|website_url|fax|leave.?blank)\b/i

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

function labelledBy(el: HTMLElement): string {
  const id = el.getAttribute('aria-labelledby')
  if (!id) return ''
  return id
    .split(/\s+/)
    .map((i) => textOf(el.ownerDocument.getElementById(i)))
    .join(' ')
}

export function fieldLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()
  const by = labelledBy(el)
  if (by) return by
  if (el.id) {
    const viaFor = el.ownerDocument.querySelector(`label[for="${cssEscape(el.id)}"]`)
    if (viaFor) return textOf(viaFor)
  }
  const wrap = el.closest('label')
  if (wrap) return textOf(wrap)
  const dt = el.closest('div, li, td, section, fieldset')
  const nearby = dt?.querySelector('label, legend, .label, [class*="label"], [data-automation-id$="label"]')
  if (nearby && nearby !== el) return textOf(nearby)
  const prev = el.previousElementSibling
  if (prev && /label|legend|span|p|div/i.test(prev.tagName)) return textOf(prev)
  const workday = el.getAttribute('data-automation-id')
  if (workday) return workday.replace(/[-_]/g, ' ')
  return (el.getAttribute('placeholder') ?? el.getAttribute('name') ?? '').trim()
}

function cssEscape(id: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(id)
  return id.replace(/"/g, '\\"')
}

function optionsOf(el: HTMLElement): string[] {
  if (el instanceof HTMLSelectElement) {
    return [...el.options].map((o) => o.textContent?.trim() || o.value).filter(Boolean)
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
  fields: Array<{ el: HTMLElement; kind: string }>,
): number | null {
  const peers = fields.filter((f) => f.kind === kind).map((f) => f.el)
  if (peers.length === 0) return null
  const sections = new Map<Element, number>()
  let next = 0
  for (const p of peers) {
    const root =
      p.closest('[class*="experience"], [class*="employment"], [class*="education"], [data-automation-id*="education"], [data-automation-id*="work"], li, tr, [class*="repeat"]') ??
      p.parentElement
    if (!root) continue
    if (!sections.has(root)) sections.set(root, next++)
  }
  const mine =
    el.closest('[class*="experience"], [class*="employment"], [class*="education"], [data-automation-id*="education"], [data-automation-id*="work"], li, tr, [class*="repeat"]') ??
    el.parentElement
  if (mine && sections.has(mine)) return sections.get(mine)!
  const idx = peers.indexOf(el)
  return idx >= 0 ? idx : 0
}

export function detectFields(): DetectResult {
  const els = allElements(document).filter((el) => isField(el) && visible(el))
  const prelim = els
    .filter((el) => {
      const name = `${el.getAttribute('name') ?? ''} ${el.getAttribute('id') ?? ''}`
      return !HONEYPOT.test(name)
    })
    .map((el) => {
      const label = fieldLabel(el)
      const name = el.getAttribute('name') ?? ''
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
      })
      return { el, label, name, autocomplete, inputType, tag, options, matchKey, kind }
    })

  const radioSeen = new Set<string>()
  const fields: DetectedField[] = []
  prelim.forEach((p) => {
    if (p.inputType === 'radio' && p.name) {
      if (radioSeen.has(p.name)) return
      radioSeen.add(p.name)
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
      required: p.el.hasAttribute('required') || p.el.getAttribute('aria-required') === 'true',
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
