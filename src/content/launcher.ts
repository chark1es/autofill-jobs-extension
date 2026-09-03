import { loadStore, subscribeStore } from '../lib/storage'

const HOST_ID = '__carbon_side_launcher__'
const DRAWER_ID = '__carbon_in_page_drawer__'

function closeDrawer() {
  document.getElementById(DRAWER_ID)?.remove()
}

function openDrawer() {
  closeDrawer()
  const host = document.createElement('div')
  host.id = DRAWER_ID
  host.setAttribute('data-carbon-ui', 'drawer')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    .drawer {
      position: fixed;
      inset: 0 0 0 auto;
      z-index: 2147483647;
      width: min(420px, calc(100vw - 24px));
      display: flex;
      flex-direction: column;
      background: #fff;
      border-left: 1px solid #d9d9d6;
      box-shadow: -8px 0 28px rgba(0, 0, 0, .16);
      font-family: 'Segoe UI', sans-serif;
    }
    .fallback-note {
      min-height: 34px;
      padding: 7px 8px 7px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: #f4f4f5;
      color: #5c5c5c;
      border-bottom: 1px solid #e8e8e6;
      font-size: 11px;
      line-height: 1.3;
    }
    .fallback-note span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button {
      flex: 0 0 auto;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #111;
      cursor: pointer;
      font: 20px/1 'Segoe UI', sans-serif;
    }
    button:hover { background: #e8e8e6; }
    button:focus-visible { outline: 2px solid #2f6fed; outline-offset: 1px; }
    iframe { flex: 1; width: 100%; border: 0; background: #fff; }
  `
  const drawer = document.createElement('aside')
  drawer.className = 'drawer'
  drawer.setAttribute('aria-label', 'Carbon side panel')
  const note = document.createElement('div')
  note.className = 'fallback-note'
  const text = document.createElement('span')
  text.textContent = "Chrome couldn't open its panel, so Carbon opened here instead."
  const close = document.createElement('button')
  close.type = 'button'
  close.title = 'Close Carbon'
  close.setAttribute('aria-label', 'Close Carbon side panel')
  close.textContent = '×'
  close.addEventListener('click', closeDrawer)
  note.append(text, close)
  const frame = document.createElement('iframe')
  frame.title = 'Carbon'
  frame.src = chrome.runtime.getURL('src/sidepanel/index.html')
  drawer.append(note, frame)
  shadow.append(style, drawer)
  document.documentElement.append(host)
}

function launcherHost(): HTMLElement {
  const existing = document.getElementById(HOST_ID)
  if (existing) return existing

  const host = document.createElement('div')
  host.id = HOST_ID
  host.setAttribute('data-carbon-ui', 'launcher')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    button {
      position: fixed;
      top: 42%;
      right: 0;
      z-index: 2147483647;
      width: 42px;
      height: 48px;
      padding: 0;
      border: 1px solid #d9d9d6;
      border-right: 0;
      border-radius: 8px 0 0 8px;
      background: #fff;
      color: #111;
      cursor: pointer;
      display: grid;
      place-items: center;
      box-shadow: 0 2px 10px rgba(0, 0, 0, .12);
      transition: width 140ms ease, background 140ms ease;
    }
    button:hover { width: 46px; background: #f7f7f6; }
    button:focus-visible { outline: 2px solid #2f6fed; outline-offset: 2px; }
    img { width: 25px; height: 25px; display: block; }
  `
  const button = document.createElement('button')
  button.type = 'button'
  button.title = 'Open Carbon'
  button.setAttribute('aria-label', 'Open Carbon side panel')
  const icon = document.createElement('img')
  icon.src = chrome.runtime.getURL('icons/icon-32.png')
  icon.alt = ''
  button.append(icon)
  button.addEventListener('click', () => {
    if (document.getElementById(DRAWER_ID)) {
      closeDrawer()
      return
    }
    button.disabled = true
    void chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
      .then((response: { ok?: boolean; error?: string } | undefined) => {
        if (!response?.ok) openDrawer()
      })
      .catch(() => openDrawer())
      .finally(() => {
        button.disabled = false
      })
  })
  shadow.append(style, button)
  document.documentElement.append(host)
  return host
}

function setLauncherVisible(enabled: boolean) {
  const current = document.getElementById(HOST_ID)
  if (enabled) launcherHost()
  else {
    current?.remove()
    closeDrawer()
  }
}

export function installLauncher() {
  void loadStore().then((store) => setLauncherVisible(store.settings.enabled))
  subscribeStore((store) => setLauncherVisible(store.settings.enabled))
}
