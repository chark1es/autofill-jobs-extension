import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Carbon',
  version: '0.1.0',
  description:
    'Local-first job application fill. Heuristics first, OpenRouter for the remainder.',
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Carbon',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
    },
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/sw.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'sidePanel'],
  host_permissions: ['https://openrouter.ai/*', 'http://*/*', 'https://*/*'],
  commands: {
    'fill-form': {
      suggested_key: { default: 'Ctrl+Shift+F', mac: 'Command+Shift+F' },
      description: 'Fill the current application form',
    },
  },
  web_accessible_resources: [
    {
      resources: ['icons/*', 'src/sidepanel/index.html'],
      matches: ['http://*/*', 'https://*/*'],
    },
  ],
})
