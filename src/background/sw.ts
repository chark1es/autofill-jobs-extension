import { completeWithOpenRouter } from '../lib/openrouter'
import { loadStore, saveStore } from '../lib/storage'
import {
  findSavedAnswer,
  heuristicValue,
  needsAI,
} from '../lib/match'
import type { Msg } from '../lib/messages'
import type { DetectResult, FillPlanItem, FillRequest, FillResult, Store } from '../lib/types'

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab.')
  return tab
}

async function tabMsg<T>(tabId: number, msg: Msg): Promise<T> {
  try {
    return await chrome.tabs.sendMessage(tabId, msg)
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/index.ts'],
    })
    return chrome.tabs.sendMessage(tabId, msg)
  }
}

async function planFill(store: Store, detect: DetectResult): Promise<FillPlanItem[]> {
  const items: FillPlanItem[] = []
  for (const field of detect.fields) {
    const saved = findSavedAnswer(field.label, store)
    let value = saved || heuristicValue(field, store)
    if (!value && store.settings.fillUnmatchedWithAI && needsAI(field, value) && store.settings.openrouterKey) {
      try {
        value = await completeWithOpenRouter({
          key: store.settings.openrouterKey,
          model: store.settings.openrouterModel,
          question: field.label,
          options: field.options,
          store,
          pageTitle: detect.title,
        })
        items.push({ uid: field.uid, value, source: 'ai' })
        continue
      } catch {
        // leave empty; popup surfaces OpenRouter errors on explicit AI calls
      }
    }
    if (value) {
      items.push({
        uid: field.uid,
        value,
        source: field.kind === 'file' ? 'resume-file' : 'heuristic',
      })
    }
  }
  return items
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  void (async () => {
    try {
      if (msg.type === 'GET_STORE') {
        sendResponse(await loadStore())
        return
      }
      if (msg.type === 'SAVE_STORE') {
        await saveStore(msg.payload)
        sendResponse({ ok: true })
        return
      }
      if (msg.type === 'AI_COMPLETE') {
        const store = await loadStore()
        const text = await completeWithOpenRouter({
          key: store.settings.openrouterKey,
          model: store.settings.openrouterModel,
          question: msg.payload.question,
          options: msg.payload.options,
          store,
          pageTitle: msg.payload.context,
        })
        sendResponse({ text })
        return
      }
      if (msg.type === 'FILL_ACTIVE_TAB') {
        const tab = await activeTab()
        const detect = await tabMsg<DetectResult>(tab.id!, { type: 'DETECT' })
        const store = await loadStore()
        const items = await planFill(store, detect)
        const resume = store.resume
          ? { name: store.resume.name, mime: store.resume.mime, dataBase64: store.resume.dataBase64 }
          : undefined
        const payload: FillRequest = { items, resume }
        const result = await tabMsg<FillResult>(tab.id!, { type: 'FILL', payload })
        sendResponse({ ...result, detect })
        return
      }
      sendResponse(null)
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) })
    }
  })()
  return true
})

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'fill-form') return
  void (async () => {
    const tab = await activeTab()
    const detect = await tabMsg<DetectResult>(tab.id!, { type: 'DETECT' })
    const store = await loadStore()
    const items = await planFill(store, detect)
    const resume = store.resume
      ? { name: store.resume.name, mime: store.resume.mime, dataBase64: store.resume.dataBase64 }
      : undefined
    await tabMsg<FillResult>(tab.id!, { type: 'FILL', payload: { items, resume } })
  })()
})
