import type { FillPlanItem, FillResult } from '../lib/types'
import { elementByUid, fieldLabel } from './detect'

function setNative(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
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

async function pickCombobox(el: HTMLElement, value: string): Promise<boolean> {
  el.click()
  el.focus()
  if (el instanceof HTMLInputElement) setNative(el, value)
  else {
    el.textContent = value
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
  }
  await sleep(180)
  const want = value.toLowerCase().trim()
  const options = [
    ...el.ownerDocument.querySelectorAll('[role="option"], [role="listbox"] li, [class*="option"]'),
  ].filter((o): o is HTMLElement => o instanceof HTMLElement)
  const hit = options.find((o) => (o.textContent ?? '').toLowerCase().trim().includes(want))
  if (hit) {
    hit.click()
    return true
  }
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return true
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
          if (ok) filled += 1
          else failed.push({ uid: item.uid, reason: 'Could not attach resume.' })
        } else {
          failed.push({ uid: item.uid, reason: 'Not a file input.' })
        }
        continue
      }
      if (!item.value) continue
      if (el instanceof HTMLSelectElement) {
        const ok = await pickSelect(el, item.value)
        if (ok) filled += 1
        else failed.push({ uid: item.uid, reason: 'No matching option.' })
        continue
      }
      if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
        if (el.type === 'checkbox') {
          const on = /^(yes|true|on|1)$/i.test(item.value)
          if (el.checked !== on) el.click()
          filled += 1
        } else {
          const ok = await pickRadio(el, item.value)
          if (ok) filled += 1
          else failed.push({ uid: item.uid, reason: 'No matching choice.' })
        }
        continue
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        setNative(el, item.value)
        filled += 1
        continue
      }
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
        const ok = await pickCombobox(el, item.value)
        if (ok) filled += 1
        continue
      }
      if (el.isContentEditable) {
        el.focus()
        el.textContent = item.value
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
        filled += 1
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
  return { filled, failed }
}

