import { detectFields } from './detect'
import { fillFields } from './fill'
import { importLinkedIn } from './linkedin'
import { expandRepeaters } from './repeaters'
import { collectPageDiagnostics } from './diagnostics'
import type { Msg } from '../lib/messages'
import type { FillRequest } from '../lib/types'
import { installLauncher } from './launcher'

const LISTENER_KEY = '__carbonContentListener_v1__'
const LAUNCHER_KEY = '__carbonLauncher_v1__'
const contentGlobal = globalThis as typeof globalThis & Record<string, unknown>

if (!contentGlobal[LAUNCHER_KEY]) {
  contentGlobal[LAUNCHER_KEY] = true
  installLauncher()
}

function handleMessage(msg: Msg, sendResponse: (response?: unknown) => void): boolean {
  void (async () => {
    try {
      if (msg.type === 'DETECT') {
        sendResponse(detectFields())
        return
      }
      if (msg.type === 'FILL') {
        const payload = (msg as { payload: FillRequest }).payload
        sendResponse(await fillFields(payload.items, payload.resume))
        return
      }
      if (msg.type === 'IMPORT_LINKEDIN') {
        sendResponse(await importLinkedIn())
        return
      }
      if (msg.type === 'EXPAND_REPEATERS') {
        sendResponse(await expandRepeaters(msg.payload.experience, msg.payload.education))
        return
      }
      if (msg.type === 'COLLECT_PAGE_DIAGNOSTICS') {
        sendResponse(collectPageDiagnostics())
        return
      }
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) })
    }
  })()
  return true
}

// The manifest loader and the synchronous recovery bundle can briefly overlap
// on a slow page. Install one listener per frame so a fill action never runs
// twice when that race occurs.
if (!contentGlobal[LISTENER_KEY]) {
  contentGlobal[LISTENER_KEY] = true
  chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) =>
    handleMessage(msg, sendResponse),
  )
}
