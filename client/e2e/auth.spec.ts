// ====================== اختبارات تسجيل الدخول ======================
// 1) الدخول ببيانات صحيحة → لوحة المعلومات
// 2) الدخول ببيانات خاطئة → رسالة خطأ

import { test, expect } from '@playwright/test'
import { env } from './env'
import { loginAsAdmin } from './helpers'

test.describe('تسجيل الدخول', () => {
  test('الدخول ببيانات صحيحة يفتح لوحة المعلومات', async ({ page }) => {
    await loginAsAdmin(page)

    // الترحيب باسم المستخدم ظاهر في لوحة المعلومات
    await expect(page.getByText(new RegExp(`مرحباً، ${env.adminUsername}`))).toBeVisible()
    // شريط التنقل الجانبي يعرض المبيعات والمحاسبة والإعدادات
    await expect(page.getByRole('link', { name: /المبيعات/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /المحاسبة/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /الإعدادات/ })).toBeVisible()
  })

  test('الدخول بكلمة مرور خاطئة يعرض رسالة خطأ', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('admin').fill(env.adminUsername)
    await page.getByPlaceholder('••••••••').fill('كلمة-مرور-خاطئة-123')
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click()

    // رسالة خطأ تظهر ولا ننتقل للوحة المعلومات
    await expect(page.getByText(/اسم المستخدم أو كلمة المرور غير صحيحة/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'P-Sale Ultra Cloud' })).toBeVisible()
  })

  test('تسجيل الخروج يعيد للشاشة الرئيسية', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByTitle('تسجيل الخروج').click()
    await expect(page.getByRole('heading', { name: 'P-Sale Ultra Cloud' })).toBeVisible()
  })
})
