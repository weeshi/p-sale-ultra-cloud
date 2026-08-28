// ====================== اختبار الأوفلاين (E2E) ======================
// سيناريو انقطاع الاتصال:
//   1) تحميل شاشة البيع أثناء الاتصال (يُخزَّن الكاش)
//   2) إنشاء فاتورة بيع بعد قطع الاتصال ← تُحفظ محلياً (طابور المزامنة)
//   3) عودة الاتصال ← مزامنة تلقائية ← الفاتورة تصل للـ Backend

import { test, expect } from '@playwright/test'
import { env } from './env'
import {
  loginAsAdmin,
  ensureTestItem,
  cleanupTestItem,
  selectByLabel,
  fillByLabel,
  findInvoiceByNote,
} from './helpers'

let item: Awaited<ReturnType<typeof ensureTestItem>>

test.beforeAll(async () => {
  item = await ensureTestItem()
})

test.afterAll(async () => {
  if (item) await cleanupTestItem(item.id)
})

test.describe('وضع عدم الاتصال (Offline-First)', () => {
  test('فاتورة بيع محفوظة دون اتصال تُزامن تلقائياً عند عودة الشبكة', async ({ page }) => {
    const uniqueNote = `E2E-offline-${Date.now()}`

    await loginAsAdmin(page)
    await page.getByRole('link', { name: /المبيعات/ }).click()
    await expect(page.getByRole('heading', { name: 'شاشة البيع' })).toBeVisible()

    const itemButton = page.getByRole('button', { name: item.itemName })
    await expect(itemButton).toBeVisible({ timeout: 20_000 })

    // تجهيز الفاتورة (أثناء الاتصال — لتعبئة الكاش)
    await selectByLabel(page, 'المخزن *', env.warehouseName)
    await itemButton.click()
    await expect(page.getByText('السلة فارغة')).not.toBeVisible()
    await selectByLabel(page, 'الخزينة *', env.treasuryName)
    await fillByLabel(page, 'ملاحظات', uniqueNote)

    // ==== قطع الاتصال ====
    await page.context().setOffline(true)

    // حفظ الفاتورة → يجب أن تُصفّ في الطابور المحلي
    await page.getByRole('button', { name: 'حفظ الفاتورة' }).click()
    await expect(page.getByText(/حُفظت الفاتورة محلياً/)).toBeVisible({ timeout: 15_000 })

    // لا توجد الفاتورة في الـ Backend بعد (لم تُزامن)
    const beforeSync = await findInvoiceByNote<any>(uniqueNote)
    expect(beforeSync).toBeNull()

    // ==== عودة الاتصال ====
    await page.context().setOffline(false)

    // المزامنة التلقائية تحدث بعد ~500ms — ننتظر وصول الفاتورة للـ Backend
    await expect
      .poll(async () => (await findInvoiceByNote<any>(uniqueNote)) !== null, { timeout: 30_000, intervals: [1_000] })
      .toBe(true)

    const syncedInvoice = await findInvoiceByNote<any>(uniqueNote)
    expect(syncedInvoice).not.toBeNull()
    expect(syncedInvoice!.invoiceNumber).toMatch(/INV-\d+/)
    expect(Number(syncedInvoice!.total)).toBe(item.salePrice)
  })
})
