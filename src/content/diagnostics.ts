import type { PageDiagnosticElement, PageDiagnostics } from '../lib/types'
import { fieldLabel } from './detect'

const MAX_HTML_LENGTH = 1_500_000
const SENSITIVE_ATTRIBUTE = /^(value|checked|selected|srcdoc)$/i
const SECRET_ATTRIBUTE = /(token|secret|csrf|nonce|authorization|session|password|ng-reflect-(model|value)|aria-valuetext)/i
const STRUCTURAL_DATA_ATTRIBUTE = /^data-(automation-id|automation-label|testid|test-id|test|qa|field|control|component|role|type|name|index|mat-icon-type)$/i

function allElements(doc: Document): HTMLElement[] {
  const elements: HTMLElement[] = []
  const roots: Array<Document | ShadowRoot> = [doc]
  while (roots.length) {
    const root = roots.pop()!
    root.querySelectorAll<HTMLElement>('*').forEach((element) => {
      elements.push(element)
      if (element.shadowRoot) roots.push(element.shadowRoot)
    })
  }
  return elements
}

function redactText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email removed]')
    .replace(/\b\d{3}[-. ]?\d{2}[-. ]?\d{4}\b/g, '[id removed]')
    .replace(/(?:\+?\d[\d ().-]{5,}\d)/g, '[phone removed]')
    .replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, '[token removed]')
}

function safeUrl(value: string): string {
  if (/^(data|blob|javascript):/i.test(value)) return '[url removed]'
  try {
    const parsed = new URL(value, location.href)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return redactText(value).slice(0, 500)
  }
}

function safeAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const attribute of [...element.attributes]) {
    const name = attribute.name
    if (SENSITIVE_ATTRIBUTE.test(name) || SECRET_ATTRIBUTE.test(name) || /^on/i.test(name)) continue
    const value = /^data-/i.test(name) && !STRUCTURAL_DATA_ATTRIBUTE.test(name)
      ? '[data removed]'
      : /^(href|src|action|formaction)$/i.test(name)
        ? safeUrl(attribute.value)
        : redactText(attribute.value).slice(0, 1000)
    attributes[name] = value
  }
  return attributes
}

function selectorPart(element: Element): string {
  const id = element.id ? `#${CSS.escape(element.id)}` : ''
  const classes = [...element.classList]
    .filter((name) => !/^(ng-|mat-|mdc-|css-)/.test(name))
    .slice(0, 3)
    .map((name) => `.${CSS.escape(name)}`)
    .join('')
  const parent = element.parentElement
  const siblings = parent ? [...parent.children].filter((item) => item.tagName === element.tagName) : []
  const position = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : ''
  return `${element.tagName.toLowerCase()}${id}${classes}${position}`
}

function elementPath(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  while (current && parts.length < 10) {
    parts.unshift(selectorPart(current))
    current = current.parentElement
  }
  return parts.join(' > ')
}

function isVisible(element: HTMLElement): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function diagnosticElement(element: HTMLElement, label: string): PageDiagnosticElement {
  return {
    tag: element.tagName.toLowerCase(),
    label: redactText(label.replace(/\s+/g, ' ').trim()).slice(0, 1000),
    path: elementPath(element),
    visible: isVisible(element),
    attributes: safeAttributes(element),
  }
}

function sanitizedHtml(): { html: string; truncated: boolean } {
  const clone = document.documentElement.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script, style, noscript, iframe, object, embed').forEach((element) => element.remove())
  clone.querySelectorAll('svg').forEach((element) => {
    element.replaceChildren()
  })
  clone.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (SENSITIVE_ATTRIBUTE.test(attribute.name) || SECRET_ATTRIBUTE.test(attribute.name) || /^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name)
      } else if (/^data-/i.test(attribute.name) && !STRUCTURAL_DATA_ATTRIBUTE.test(attribute.name)) {
        element.setAttribute(attribute.name, '[data removed]')
      } else if (/^(href|src|action|formaction)$/i.test(attribute.name)) {
        element.setAttribute(attribute.name, safeUrl(attribute.value))
      } else {
        element.setAttribute(attribute.name, redactText(attribute.value).slice(0, 1000))
      }
    }
    if (
      element instanceof HTMLTextAreaElement ||
      element.isContentEditable ||
      element.hasAttribute('contenteditable')
    ) {
      element.textContent = ''
    }
  })
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const parent = node.parentElement
    const semanticText = parent?.closest(
      'label, legend, button, option, h1, h2, h3, h4, h5, h6, [role="button"], [role="heading"], [class*="label"], [class*="header"], [class*="question"], [class*="prompt"], [class*="instruction"]',
    )
    node.textContent = semanticText ? redactText(node.textContent ?? '').slice(0, 1000) : ''
    node = walker.nextNode()
  }
  const html = clone.outerHTML
  return {
    html: html.slice(0, MAX_HTML_LENGTH),
    truncated: html.length > MAX_HTML_LENGTH,
  }
}

function detectFrameworks(elements: HTMLElement[]): string[] {
  const frameworks = new Set<string>()
  if (document.querySelector('[ng-version], app-root, [formcontrolname]')) frameworks.add('Angular')
  if (document.querySelector('[data-reactroot], [data-reactid]')) frameworks.add('React')
  if (document.querySelector('[data-v-app], [data-vue-meta]')) frameworks.add('Vue')
  if (document.querySelector('[data-automation-id]')) frameworks.add('Workday-style automation attributes')
  if (elements.some((element) => element.shadowRoot)) frameworks.add('Shadow DOM')
  return [...frameworks]
}

export function collectPageDiagnostics(): PageDiagnostics {
  const elements = allElements(document)
  const fieldElements = elements.filter((element) => {
    if (element instanceof HTMLInputElement) return true
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true
    return element.isContentEditable || ['textbox', 'combobox', 'listbox', 'searchbox', 'switch'].includes(element.getAttribute('role') ?? '')
  })
  const buttonElements = elements.filter((element) => {
    if (element instanceof HTMLButtonElement) return true
    if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type)) return true
    return element.getAttribute('role') === 'button'
  })
  const html = sanitizedHtml()
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    page: {
      url: `${location.origin}${location.pathname}`,
      title: redactText(document.title),
      host: location.hostname,
      language: document.documentElement.lang || navigator.language,
      userAgent: navigator.userAgent,
    },
    frameworks: detectFrameworks(elements),
    customElements: [...new Set(elements.map((element) => element.tagName.toLowerCase()).filter((tag) => tag.includes('-')))].slice(0, 200),
    fields: fieldElements.map((element) => diagnosticElement(element, fieldLabel(element))),
    buttons: buttonElements.map((element) => diagnosticElement(
      element,
      element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '',
    )),
    forms: elements
      .filter((element): element is HTMLFormElement => element instanceof HTMLFormElement)
      .map((form) => ({
        path: elementPath(form),
        attributes: safeAttributes(form),
        fieldCount: form.querySelectorAll('input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]').length,
      })),
    sanitizedHtml: html.html,
    htmlTruncated: html.truncated,
  }
}
