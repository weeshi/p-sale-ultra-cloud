// ====================== اختبار تجربة الجوال (Mobile E2E) ======================
// يعمل في مشروع "mobile-chrome" (محاكاة iPhone 13 عبر viewport هاتفي).
// - التحقق من عدم وجود تمرير أفقي في الصفحات الأساسية + التنقل عبر قائمة الهامبرغر
// - شريط «وضع عدم الاتصال» يظهر ويختفي على شاشة الهاتف

import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflowPx = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
  )
  expect(overflowPx, 'يجب ألا يوجد تمرير أفقي على الجوال').toBe(0)
}

test.describe('تجربة الجوال (PWA — Mobile)', () => {
  test('التنقل عبر قائمة الهامبرغر للصفحات الأساسية بلا تمرير أفقي', async ({ page }) => {
    await loginAsAdmin(page)

    const menuButton = page.getByTitle('القائمة')
    await expect(menuButton).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const pages: Array<{ nav: string; heading: string }> = [
      { nav: 'المبيعات', heading: 'شاشة البيع' },
      { nav: 'الأصناف', heading: 'الأصناف' },
      { nav: 'العملاء والموردون', heading: 'العملاء والموردون' },
      { nav: 'التقارير', heading: 'تقرير المبيعات' },
    ]

    for (const p of pages) {
      await menuButton.click()
      await page.getByRole('link', { name: p.nav }).first().click()
      await expect(page.getByRole('heading', { name: p.heading }).first()).toBeVisible({ timeout: 20_000 })
      await expectNoHorizontalOverflow(page)
    }
  })

  test('شريط عدم الاتصال يظهر ثم يختفي على الجوال دون فقدان التنقل', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByText(/وضع عدم الاتصال/)).not.toBeVisible()

    // قطع الشبكة ← يجب أن يظهر الشريط البرتقالي فوراً (حدث offline) مع بقاء الهيدر
    await page.context().setOffline(true)
    await expect
      .poll(async () => await page.getByText(/وضع عدم الاتصال/).count(), { timeout: 15_000, intervals: [500] })
      .toBeGreaterThan(0)

    const headerStillThere = await page.getByTitle('القائمة').count()
    expect(headerStillThere).toBeGreaterThan(0)

    // عودة الاتصال ← يختفي الشريط (حدث online)
    await page.context().setOffline(false)
    await expect
      .poll(async () => await page.getByText(/وضع عدم الاتصال/).count(), { timeout: 15_000, intervals: [500] })
      .toBe(0)
  })
})