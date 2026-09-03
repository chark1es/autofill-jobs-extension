import type {
  DetectResult,
  ExpandRepeatersResult,
  FillRequest,
  FillResult,
  PageDiagnostics,
  Store,
} from './types'
import injectedContentScript from '../content/recovery.ts?script&iife'

export type Msg =
  | { type: 'DETECT' }
  | { type: 'FILL'; payload: FillRequest }
  | { type: 'IMPORT_LINKEDIN' }
  | { type: 'EXPAND_REPEATERS'; payload: { experience: number; education: number } }
  | { type: 'COLLECT_PAGE_DIAGNOSTICS' }
  | { type: 'AI_COMPLETE'; payload: { question: string; options: string[]; context: string } }
  | { type: 'GET_STORE' }
  | { type: 'SAVE_STORE'; payload: Store }
  | { type: 'FILL_ACTIVE_TAB' }

export type MsgResult = {
  DETECT: DetectResult
  FILL: FillResult
  IMPORT_LINKEDIN: Partial<Store>
  EXPAND_REPEATERS: ExpandRepeatersResult
  COLLECT_PAGE_DIAGNOSTICS: PageDiagnostics
  AI_COMPLETE: { text: string }
  GET_STORE: Store
  SAVE_STORE: { ok: true }
  FILL_ACTIVE_TAB: FillResult & { detect: DetectResult }
}

export function send<T extends Msg['type']>(
  msg: Extract<Msg, { type: T }>,
): Promise<MsgResult[T]> {
  return chrome.runtime.sendMessage(msg)
}

export function sendTab<T extends Msg['type']>(
  tabId: number,
  msg: Extract<Msg, { type: T }>,
): Promise<MsgResult[T]> {
  return chrome.tabs.sendMessage(tabId, msg)
}

export function contentScriptFiles(): string[] {
  return [injectedContentScript]
}

export async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: contentScriptFiles(),
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendTabWhenReady<T extends Msg['type']>(
  tabId: number,
  msg: Extract<Msg, { type: T }>,
): Promise<MsgResult[T]> {
  const delays = [0, 25, 50, 100, 200, 400, 800]
  let lastError: unknown
  for (const delay of delays) {
    if (delay) await wait(delay)
    try {
      return await chrome.tabs.sendMessage(tabId, msg)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function sendTabOrInject<T extends Msg['type']>(
  tabId: number,
  msg: Extract<Msg, { type: T }>,
): Promise<MsgResult[T]> {
  try {
    return await chrome.tabs.sendMessage(tabId, msg)
  } catch {
    await injectContent(tabId)
    return sendTabWhenReady(tabId, msg)
  }
}
