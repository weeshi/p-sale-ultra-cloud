import { defineConfig, devices } from '@playwright/test'

// ====================== Playwright E2E — P-Sale Ultra Cloud ======================
// التشغيل:
//   1) شغّل الخوادم أولاً (أو دع Playwright يبدأها):
//        pm2 start ecosystem.config.cjs          (أو npm run dev في server و client)
//   2) نفّذ الاختبارات:
//        cd client
//        npx playwright test
//   3) تشغيل ملف واحد:
//        npx playwright test e2e/sales.spec.ts
//   4) واجهة التقرير التفاعلية بعد التشغيل:
//        npx playwright show-report
//
// ملاحظات:
//   - يستخدم متصفح Chrome/Edge المثبّت على النظام (channel) — لا حاجة لتنزيل Chromium.
//   - reuseExistingServer: true → إذا كانت الخوادم تعمل فعلاً (PM2) يُعاد استخدامها بدل إعادة تشغيلها.
//   - يتطلب MySQL شغّالاً + قاعدة psale_ultra مُهيأة (مستخدم admin موجود) — بيانات الدخول في e2e/env.ts.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['line']] : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5175',
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'cd ../server && npx tsx src/app.ts',
      url: 'http://localhost:3005/api/health',
      timeout: 90_000,
      reuseExistingServer: true,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5175',
      timeout: 90_000,
      reuseExistingServer: true,
      stdout: 'pipe',
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // محاكاة هاتف (iPhone 13) — تشغّل فقط الملفات المطابقة testMatch لضمان تخصيصها للجوال
      // (الأبعاد مستنسخة من devices['iPhone 13'] مع channel chrome بدل webkit غير المثبّت)
      name: 'mobile-chrome',
      testMatch: /mobile\.spec\.ts/,
      use: {
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['iPhone 13'].userAgent,
      },
    },
  ],
})
