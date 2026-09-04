import { completeQuestionsWithOpenRouter, completeWithOpenRouter } from '../lib/openrouter'
import { loadStore, saveStore } from '../lib/storage'
import {
  findSavedAnswer,
  heuristicValue,
  needsAI,
  suggestionHints,
} from '../lib/match'
import { sendTabOrInject, type Msg } from '../lib/messages'
import type { DetectResult, FillPlanItem, FillRequest, FillResult, Store } from '../lib/types'

const SIDE_PANEL_PATH = 'src/sidepanel/index.html'

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab.')
  return tab
}

async function tabMsg<T>(tabId: number, msg: Msg): Promise<T> {
  return sendTabOrInject(tabId, msg) as Promise<T>
}

async function planFill(store: Store, detect: DetectResult): Promise<FillPlanItem[]> {
  const items: FillPlanItem[] = []
  const questions = []
  for (const field of detect.fields) {
    const value = findSavedAnswer(field.label, store) || heuristicValue(field, store)
    if (value) {
      items.push({
        uid: field.uid,
        value,
        source: field.kind === 'file' ? 'resume-file' : 'heuristic',
        suggestionHints: suggestionHints(field, store),
      })
    } else if (!field.currentValue && needsAI(field, value) && store.settings.openrouterKey && store.settings.openrouterModel.trim()) {
      questions.push({ uid: field.uid, question: field.label, options: field.options })
    }
  }
  const answers = await completeQuestionsWithOpenRouter({
    key: store.settings.openrouterKey,
    model: store.settings.openrouterModel,
    questions,
    store,
    pageTitle: detect.title,
  })
  for (const answer of answers) {
    if (!answer.value) continue
    const field = detect.fields.find((candidate) => candidate.uid === answer.uid)!
    items.push({ uid: answer.uid, value: answer.value, source: 'ai', suggestionHints: suggestionHints(field, store) })
  }
  return items
}

async function syncEnabledState(): Promise<void> {
  const { settings } = await loadStore()
  await chrome.action.setBadgeText({ text: settings.enabled ? '' : 'OFF' })
  await chrome.action.setBadgeBackgroundColor({ color: '#5c5c5c' })
  await chrome.action.setTitle({
    title: settings.enabled ? 'Carbon is enabled' : 'Carbon is disabled',
  })
  await chrome.sidePanel.setOptions({
    path: SIDE_PANEL_PATH,
    enabled: settings.enabled,
  })
}

chrome.runtime.onInstalled.addListener(() => void syncEnabledState())
chrome.runtime.onStartup.addListener(() => void syncEnabledState())
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['carbon.store.v1']) void syncEnabledState()
})
void syncEnabledState()

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_SIDE_PANEL') {
    if (!sender.tab?.id) {
      sendResponse({ ok: false, error: 'Could not find this browser tab.' })
      return false
    }
    // Chrome requires open() to be invoked synchronously from the user-click
    // message. Any awaited work before this call consumes the user gesture.
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(
      () => sendResponse({ ok: true }),
      (error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return true
  }

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
        const store = await loadStore()
        if (!store.settings.enabled) throw new Error('Carbon is disabled.')
        await tabMsg(tab.id!, {
          type: 'EXPAND_REPEATERS',
          payload: { experience: store.experience.length, education: store.education.length },
        })
        const detect = await tabMsg<DetectResult>(tab.id!, { type: 'DETECT' })
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
    const store = await loadStore()
    if (!store.settings.enabled) return
    await tabMsg(tab.id!, {
      type: 'EXPAND_REPEATERS',
      payload: { experience: store.experience.length, education: store.education.length },
    })
    const detect = await tabMsg<DetectResult>(tab.id!, { type: 'DETECT' })
    const items = await planFill(store, detect)
    const resume = store.resume
      ? { name: store.resume.name, mime: store.resume.mime, dataBase64: store.resume.dataBase64 }
      : undefined
    await tabMsg<FillResult>(tab.id!, { type: 'FILL', payload: { items, resume } })
  })()
})
