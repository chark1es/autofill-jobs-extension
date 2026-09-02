import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names[0] ?? ''
          // CRXJS emits the content-script bootstrap as an asset. Keeping this
          // filename stable prevents a running unpacked extension from asking
          // for a deleted hash immediately after a rebuild.
          if (name.endsWith('-loader.js')) return 'assets/[name][extname]'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
