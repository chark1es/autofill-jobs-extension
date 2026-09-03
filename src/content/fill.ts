import type { FillPlanItem, FillResult } from '../lib/types'
import { elementByUid, fieldLabel } from './detect'

function setNative(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  commit = true,
) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value }))
  if (commit) el.dispatchEvent(new Event('change', { bubbles: true }))
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pickSelect(el: HTMLSelectElement, value: string): Promise<boolean> {
  const want = value.toLowerCase().trim()
  const opt = [...el.options].find((o) => {
    const t = (o.textContent ?? '').trim().toLowerCase()
    const v = o.value.toLowerCase()
    return t === want || v === want || t.includes(want) || want.includes(t)
  })
  if (!opt) return false
  el.value = opt.value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

async function pickRadio(el: HTMLElement, value: string): Promise<boolean> {
  const name = el.getAttribute('name')
  if (!name) return false
  const group = el.ownerDocument.querySelectorAll(`input[name="${CSS.escape(name)}"]`)
  const want = value.toLowerCase().trim()
  for (const node of group) {
    const input = node as HTMLInputElement
    const lab = `${fieldLabel(input)} ${input.value}`.toLowerCase()
    if (lab.includes(want) || want.includes(input.value.toLowerCase())) {
      input.click()
      input.checked = true
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
  }
  return false
}

const SUGGESTION_SELECTOR = [
  '[role="option"]',
  'mat-option',
  '[data-option-index]',
  '[data-suggestion]',
  '.pac-item',
  '[role="listbox"] li',
  '[class*="autocomplete"] li',
  '[class*="typeahead"] li',
  '[class*="suggestion"] li',
  '[class*="autocomplete-option"]',
  '[class*="typeahead-option"]',
  '[class*="suggestion-item"]',
].join(', ')

const SUGGESTION_FIELD = /\b(zip|postal|location|address|city|state|province|region|country|school|university|college|company|employer)\b/i

function visible(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function suggestionRoots(el: HTMLElement): Array<Document | ShadowRoot> {
  const ownRoot = el.getRootNode()
  return ownRoot instanceof ShadowRoot ? [ownRoot, el.ownerDocument] : [el.ownerDocument]
}

function controlledContainers(el: HTMLElement): HTMLElement[] {
  const ids = [
    el.getAttribute('aria-controls'),
    el.getAttribute('aria-owns'),
    el.getAttribute('list'),
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(/\s+/))
  const containers: HTMLElement[] = []
  for (const root of suggestionRoots(el)) {
    for (const id of ids) {
      const found = root.querySelector(`#${CSS.escape(id)}`)
      if (found instanceof HTMLElement && !containers.includes(found)) containers.push(found)
    }
  }
  return containers
}

function suggestionOptions(el: HTMLElement): HTMLElement[] {
  const options: HTMLElement[] = []
  const add = (node: Element) => {
    if (
      node instanceof HTMLElement &&
      !options.includes(node) &&
      visible(node) &&
      node.getAttribute('aria-disabled') !== 'true' &&
      !node.hasAttribute('disabled')
    ) {
      options.push(node)
    }
  }
  for (const container of controlledContainers(el)) {
    if (container.matches(SUGGESTION_SELECTOR)) add(container)
    container.querySelectorAll(SUGGESTION_SELECTOR).forEach(add)
  }
  for (const root of suggestionRoots(el)) {
    root.querySelectorAll(SUGGESTION_SELECTOR).forEach(add)
  }
  return options
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function suggestionScore(option: HTMLElement, value: string, hints: string[]): number {
  const text = normalized(option.getAttribute('data-value') || option.textContent || '')
  const want = normalized(value)
  if (!text || /^(loading|no (matches|options|results))$/.test(text)) return -1
  if (text === want) return 1000
  let score = 0
  if (text.startsWith(want)) score = 850
  else if (text.includes(want)) score = 800
  else if (want.length >= 3 && want.includes(text)) score = 700

  const wantTokens = want.split(' ').filter((token) => token.length > 1)
  score += wantTokens.filter((token) => text.split(' ').includes(token)).length * 80
  for (const hint of hints) {
    for (const token of normalized(hint).split(' ').filter((part) => part.length > 1)) {
      if (text.split(' ').includes(token)) score += 20
    }
  }
  return score
}

function hasExplicitSuggestions(el: HTMLElement): boolean {
  return (
    el.getAttribute('role') === 'combobox' ||
    el.getAttribute('aria-autocomplete') === 'list' ||
    el.getAttribute('aria-haspopup') === 'listbox' ||
    Boolean(el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || el.getAttribute('list'))
  )
}

function looksLikeSuggestionInput(el: HTMLElement): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false
  if (hasExplicitSuggestions(el)) return true
  const identity = [
    fieldLabel(el),
    el.name,
    el.id,
    el.placeholder,
    el.className,
  ].join(' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return SUGGESTION_FIELD.test(identity) || /autocomplete|typeahead|suggest/i.test(identity)
}

function chooseSuggestion(option: HTMLElement, input: HTMLInputElement) {
  option.scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior })
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
  if (option.isConnected) option.click()
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function pickSuggestion(
  el: HTMLInputElement,
  value: string,
  hints: string[],
): Promise<boolean> {
  const existing = new Set(suggestionOptions(el))
  const attempts = hasExplicitSuggestions(el) ? 20 : 8
  el.click()
  el.focus()
  setNative(el, value, false)

  for (let attempt = 0; attempt < attempts; attempt++) {
    await sleep(100)
    const controlled = new Set(controlledContainers(el))
    const options = suggestionOptions(el).filter((option) => {
      if (!existing.has(option)) return true
      if (el.getAttribute('aria-expanded') === 'true') return true
      return [...controlled].some((container) => container === option || container.contains(option))
    })
    if (options.length) {
      const minimumScore = hasExplicitSuggestions(el) ? 0 : 1
      const ranked = options
        .map((option, index) => ({ option, index, score: suggestionScore(option, value, hints) }))
        .filter((candidate) => candidate.score >= minimumScore)
        .sort((a, b) => b.score - a.score || a.index - b.index)
      const hit = ranked[0]?.option
      if (!hit) continue
      chooseSuggestion(hit, el)
      await sleep(50)
      return true
    }
  }

  // Native datalists accept the typed value without exposing their popup DOM.
  // Soft location/address inputs may also accept free text, while an explicit
  // ARIA listbox must select a real option to be considered filled.
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return Boolean(el.getAttribute('list')) || !hasExplicitSuggestions(el)
}

async function attachFile(
  el: HTMLInputElement,
  resume: { name: string; mime: string; dataBase64: string },
): Promise<boolean> {
  const bin = Uint8Array.from(atob(resume.dataBase64), (c) => c.charCodeAt(0))
  const file = new File([bin], resume.name, { type: resume.mime || 'application/pdf' })
  const dt = new DataTransfer()
  dt.items.add(file)
  el.files = dt.files
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export async function fillFields(
  items: FillPlanItem[],
  resume?: { name: string; mime: string; dataBase64: string },
): Promise<FillResult> {
  const failed: FillResult['failed'] = []
  const filledUids: string[] = []
  let filled = 0
  for (const item of items) {
    const el = elementByUid(item.uid)
    if (!el) {
      failed.push({ uid: item.uid, reason: 'Field left the page.' })
      continue
    }
    try {
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
      if (item.value === '__resume__') {
        if (el instanceof HTMLInputElement && el.type === 'file' && resume) {
          const ok = await attachFile(el, resume)
          if (ok) {
            filled += 1
            filledUids.push(item.uid)
          }
          else failed.push({ uid: item.uid, reason: 'Could not attach resume.' })
        } else {
          failed.push({ uid: item.uid, reason: 'Not a file input.' })
        }
        continue
      }
      if (!item.value) continue
      if (el instanceof HTMLSelectElement) {
        const ok = await pickSelect(el, item.value)
        if (ok) {
          filled += 1
          filledUids.push(item.uid)
        }
        else failed.push({ uid: item.uid, reason: 'No matching option.' })
        continue
      }
      if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
        if (el.type === 'checkbox') {
          const on = /^(yes|true|on|1)$/i.test(item.value)
          if (el.checked !== on) el.click()
          filled += 1
          filledUids.push(item.uid)
        } else {
          const ok = await pickRadio(el, item.value)
          if (ok) {
            filled += 1
            filledUids.push(item.uid)
          }
          else failed.push({ uid: item.uid, reason: 'No matching choice.' })
        }
        continue
      }
      if (looksLikeSuggestionInput(el)) {
        const ok = await pickSuggestion(el, item.value, item.suggestionHints ?? [])
        if (ok) {
          filled += 1
          filledUids.push(item.uid)
        } else {
          failed.push({ uid: item.uid, reason: 'No matching suggestion.' })
        }
        continue
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        setNative(el, item.value)
        filled += 1
        filledUids.push(item.uid)
        continue
      }
      if (el.isContentEditable) {
        el.focus()
        el.textContent = item.value
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
        filled += 1
        filledUids.push(item.uid)
        continue
      }
      failed.push({ uid: item.uid, reason: 'Unsupported control.' })
    } catch (err) {
      failed.push({
        uid: item.uid,
        reason: err instanceof Error ? err.message : 'Fill failed.',
      })
    }
  }
  return { filled, filledUids, failed }
}

