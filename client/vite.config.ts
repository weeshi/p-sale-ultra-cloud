import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'P-Sale Ultra Cloud',
        short_name: 'P-Sale',
        description: 'نظام إدارة المبيعات والمخازن والمحاسبة',
        theme_color: '#065f46',
        background_color: '#f8fafc',
        display: 'standalone',
        dir: 'rtl',
        lang: 'ar',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        navigationPreload: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // الكتابة (POST/PUT/PATCH/DELETE) على /api/* — تُعاد تلقائياً عند عودة الاتصال حتى لو أُغلق المتصفح
            urlPattern: ({ request, url }) =>
              url.pathname.startsWith('/api/') && request.method !== 'GET',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'psale-queue',
                options: {
                  maxRetentionTime: 60 * 24 * 60, // 60 يوماً بالدقائق
                },
              },
            },
          },
          {
            // القراءة (GET) على /api/* — NetworkFirst مع مهلة قصيرة ثم الكاش
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5175,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    watch: {
      // منع إعادة تحميل الصفحة (refresh loop) عند كتابة Playwright/Build داخل جذر المشروع
      ignored: ['**/dist/**', '**/playwright-report/**', '**/test-results/**', '**/coverage/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
