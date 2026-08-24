// ====================== اختبارات المبيعات (E2E) ======================
// 1) إنشاء فاتورة بيع كاملة عبر الواجهة (صنف + مخزن + خزينة + حفظ)
// 2) عرض تفاصيل الفاتورة + طباعة (نافذة منبثقة تحمل رقم الفاتورة)

import { test, expect } from '@playwright/test'
import { env } from './env'
import { loginAsAdmin, ensureTestItem, cleanupTestItem, selectByLabel, findInvoiceByNumber } from './helpers'

let item: Awaited<ReturnType<typeof ensureTestItem>>

test.beforeAll(async () => {
  item = await ensureTestItem()
})

test.afterAll(async () => {
  if (item) await cleanupTestItem(item.id)
})

test.describe('شاشة البيع', () => {
  test('إنشاء فاتورة بيع نقدية كاملة + طباعتها', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: /المبيعات/ }).click()
    await expect(page.getByRole('heading', { name: 'شاشة البيع' })).toBeVisible()

    // ننتظر ظهور الصنف الاختباري في شبكة المنتجات
    const itemButton = page.getByRole('button', { name: item.itemName })
    await expect(itemButton).toBeVisible({ timeout: 20_000 })

    // اختيار المخزن المركزي (يحتوي رصيد الصنف) — النموذج يختار أول مخزن تلقائياً
    await selectByLabel(page, 'المخزن *', env.warehouseName)

    // إضافة الصنف للسلة
    await itemButton.click()
    await expect(page.getByText('السلة فارغة')).not.toBeVisible()

    // اختيار خزينة الدفع النقدي
    await selectByLabel(page, 'الخزينة/الحساب *', env.treasuryName)

    // حفظ الفاتورة
    await page.getByRole('button', { name: 'حفظ الفاتورة' }).click()

    // نافذة تفاصيل الفاتورة تظهر برقم INV
    await expect(page.getByText('تفاصيل الفاتورة')).toBeVisible({ timeout: 20_000 })
    const modalCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'تفاصيل الفاتورة' }) })
    const invoiceNumber = (await modalCard.getByText(/INV-\d+/).first().innerText()).trim()
    expect(invoiceNumber).toMatch(/INV-\d+/)

    // التحقق من وصول الفاتورة للـ Backend
    const synced = await findInvoiceByNumber<any>(invoiceNumber)
    expect(synced).not.toBeNull()
    expect(Number(synced.total)).toBeGreaterThan(0)

    // ==== الطباعة: نافذة منبثقة تحمل رقم الفاتورة ====
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'طباعة' }).click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    await expect(popup.locator('body')).toContainText(invoiceNumber, { timeout: 10_000 })
    await popup.close()

    // إغلاق نافذة التفاصيل
    await page.getByTitle('إغلاق').click()
    await expect(page.getByText('تفاصيل الفاتورة')).not.toBeVisible()

    // الفاتورة ظاهرة في قائمة "آخر الفواتير"
    await expect(page.getByText(invoiceNumber)).toBeVisible({ timeout: 15_000 })
  })
})
