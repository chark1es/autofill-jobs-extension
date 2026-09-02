import {
  EMPTY_STORE,
  type ExportBundle,
  type Store,
} from './types'

const KEY = 'carbon.store.v1'

export async function loadStore(): Promise<Store> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return structuredClone(EMPTY_STORE)
  }
  const raw = await chrome.storage.local.get(KEY)
  const stored = raw[KEY] as Store | undefined
  if (!stored || stored.version !== 1) return structuredClone(EMPTY_STORE)
  return {
    ...EMPTY_STORE,
    ...stored,
    identity: { ...EMPTY_STORE.identity, ...stored.identity },
    settings: { ...EMPTY_STORE.settings, ...stored.settings },
    experience: stored.experience ?? [],
    education: stored.education ?? [],
    skills: stored.skills ?? [],
    answers: stored.answers ?? [],
    resume: stored.resume ?? null,
  }
}

export async function saveStore(store: Store): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  await chrome.storage.local.set({ [KEY]: store })
}

export function subscribeStore(cb: (store: Store) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return () => {}
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== 'local' || !changes[KEY]) return
    void loadStore().then(cb)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

export function toExportBundle(store: Store): ExportBundle {
  const { openrouterKey: _omit, ...safeSettings } = store.settings
  void _omit
  return {
    version: 1,
    identity: store.identity,
    experience: store.experience,
    education: store.education,
    skills: store.skills,
    answers: store.answers,
    resume: store.resume,
    settings: safeSettings,
  }
}

export function fromExportBundle(data: unknown, current: Store): Store {
  if (!data || typeof data !== 'object') {
    throw new Error('Not a Carbon export.')
  }
  const bundle = data as Partial<Store>
  if (bundle.version !== 1) {
    throw new Error('Unknown export version.')
  }
  const incomingSettings =
    bundle.settings && typeof bundle.settings === 'object'
      ? (bundle.settings as Store['settings'])
      : current.settings
  return {
    version: 1,
    identity: { ...EMPTY_STORE.identity, ...bundle.identity },
    experience: Array.isArray(bundle.experience) ? bundle.experience : [],
    education: Array.isArray(bundle.education) ? bundle.education : [],
    skills: Array.isArray(bundle.skills) ? bundle.skills : [],
    answers: Array.isArray(bundle.answers) ? bundle.answers : [],
    resume: bundle.resume ?? null,
    settings: {
      ...current.settings,
      ...incomingSettings,
      openrouterKey: current.settings.openrouterKey,
    },
  }
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}
