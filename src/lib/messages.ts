import type {
  DetectResult,
  FillRequest,
  FillResult,
  Store,
} from './types'

export type Msg =
  | { type: 'DETECT' }
  | { type: 'FILL'; payload: FillRequest }
  | { type: 'IMPORT_LINKEDIN' }
  | { type: 'AI_COMPLETE'; payload: { question: string; options: string[]; context: string } }
  | { type: 'GET_STORE' }
  | { type: 'SAVE_STORE'; payload: Store }
  | { type: 'FILL_ACTIVE_TAB' }

export type MsgResult = {
  DETECT: DetectResult
  FILL: FillResult
  IMPORT_LINKEDIN: Partial<Store>
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
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js
  if (!files?.length) throw new Error('No content script in the manifest.')
  return files
}

export async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: contentScriptFiles(),
  })
}

export async function sendTabOrInject<T extends Msg['type']>(
  tabId: number,
  msg: Extract<Msg, { type: T }>,
): Promise<MsgResult[T]> {
  try {
    return await chrome.tabs.sendMessage(tabId, msg)
  } catch {
    await injectContent(tabId)
    return chrome.tabs.sendMessage(tabId, msg)
  }
}
