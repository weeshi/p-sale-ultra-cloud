// ====================== أدوات مساعدة لاختبارات E2E ======================
// - apiRequest: استدعاءات الـ Backend مباشرة (لإنشاء بيانات اختبار / التحقق)
// - loginAsAdmin: تسجيل دخول عبر واجهة المستخدم (أقرب لسلوك المستخدم الحقيقي)
// - selectByLabel: اختيار قيمة من <select> عبر نص الـ label (النموذج لا يستخدم htmlFor)

import { expect, type Page } from '@playwright/test'
import { env } from './env'

// ============ استدعاءات الـ API ============

let cachedToken: string | null = null

export async function apiLogin(): Promise<string> {
  if (cachedToken) return cachedToken
  const res = await fetch(`${env.apiURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.adminUsername, password: env.adminPassword }),
  })
  if (!res.ok) throw new Error(`API login failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { accessToken: string }
  cachedToken = data.accessToken
  return cachedToken
}

export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const token = await apiLogin()
  const res = await fetch(`${env.apiURL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data: data as T }
}

// إنشاء صنف اختباري برصيد افتتاحي في المخزن المركزي — يرجع كوداً/اسماً فريداً
export async function ensureTestItem(): Promise<{ id: number; itemCode: string; itemName: string; salePrice: number }> {
  const itemName = `صنف اختبار ${Date.now()}`
  const salePrice = 100
  const { status, data } = await apiRequest<any>('POST', '/items', {
    itemName,
    purchasePrice: 50,
    salePrice,
    openingStock: 10,
  })
  if (status !== 201 || !data?.id) throw new Error(`فشل إنشاء صنف اختباري (${status}): ${JSON.stringify(data)}`)
  return { id: data.id, itemCode: data.itemCode, itemName, salePrice }
}

// حذف صنف اختباري بعد الاختبار (إزالة فعّالة عبر isActive=false)
export async function cleanupTestItem(id: number): Promise<void> {
  try {
    await apiRequest('DELETE', `/items/${id}`)
  } catch {
    // نتجاهل أخطاء التنظيف
  }
}

// البحث عن فاتورة برقم معيّن عبر الـ API
export async function findInvoiceByNumber<T>(invoiceNumber: string): Promise<T | null> {
  const { data } = await apiRequest<{ invoices: T[] }>('GET', '/sales?limit=100')
  return data?.invoices?.find((i: any) => i.invoiceNumber === invoiceNumber) ?? null
}

// البحث عن فاتورة بملاحظة فريدة (للتحقق من مزامنة الأوفلاين)
export async function findInvoiceByNote<T>(note: string): Promise<T | null> {
  const { data } = await apiRequest<{ invoices: T[] }>('GET', '/sales?limit=100')
  return data?.invoices?.find((i: any) => i.notes === note) ?? null
}

// ============ تسجيل الدخول عبر الواجهة ============

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login')
  await expect(page.getByPlaceholder('admin')).toBeVisible({ timeout: 15_000 })
  await page.getByPlaceholder('admin').fill(env.adminUsername)
  await page.getByPlaceholder('••••••••').fill(env.adminPassword)
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click()
  // بعد نجاح الدخول نصل إلى لوحة المعلومات
  await expect(page.getByRole('heading', { name: 'لوحة المعلومات' })).toBeVisible({ timeout: 20_000 })
}

// ============ اختيار من قائمة منسدلة عبر نص الـ label ============

export async function selectByLabel(page: Page, labelText: string, optionText: string): Promise<void> {
  const label = page.getByText(labelText, { exact: true }).first()
  const select = label.locator('..').locator('select')
  await select.selectOption({ label: optionText })
}

// تعبئة حقل إدخال عبر نص الـ label المجاور له
export async function fillByLabel(page: Page, labelText: string, value: string): Promise<void> {
  const label = page.getByText(labelText, { exact: true }).first()
  const input = label.locator('..').locator('input')
  await input.fill(value)
}
