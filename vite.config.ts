import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Netlify's static server doesn't know the .webmanifest extension and was
      // serving it as application/octet-stream, which fails Chrome's manifest
      // parse and silently downgrades "install" to a plain bookmark shortcut
      // (Chrome badge, opens in a browser tab instead of standalone). Author
      // Magic's working manifest is named manifest.json for the same reason —
      // .json is a MIME type Netlify recognizes out of the box. Matching that.
      manifestFilename: 'manifest.json',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'The Grimoire',
        short_name: 'Grimoire',
        description: 'Track, store, plan and reference your tomes.',
        theme_color: '#120708',
        background_color: '#120708',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,png,ico,woff2}'],
      },
    }),
  ],
})
