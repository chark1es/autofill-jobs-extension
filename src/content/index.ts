import { detectFields } from './detect'
import { fillFields } from './fill'
import { importLinkedIn } from './linkedin'
import type { Msg } from '../lib/messages'
import type { FillRequest } from '../lib/types'

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
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
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) })
    }
  })()
  return true
})
