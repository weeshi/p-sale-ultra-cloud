import type { Request } from 'express'
import { validateLicense } from '../services/licenseService'
import { enforceLicense, clearLicenseCache, isLicenseExempt } from './license'

jest.mock('../services/licenseService', () => ({ validateLicense: jest.fn() }))
jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), http: jest.fn() },
}))

const mockValidate = validateLicense as jest.Mock

function req(originalUrl: string, companyId: number | null = 1): Request {
  return { originalUrl, url: originalUrl, companyId } as unknown as Request
}

const VALID = {
  valid: true,
  license: { tier: 'enterprise' },
  features: ['*'],
  isTrial: false,
}

describe('enforceLicense — فرض الترخيص على مستوى الطلب (15.1)', () => {
  let now: number

  beforeEach(() => {
    jest.clearAllMocks()
    clearLicenseCache()
    now = 1_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('المسارات المعفاة', () => {
    it.each([
      '/api/health',
      '/api/health?probe=1',
      '/api/auth/login',
      '/api/auth/refresh',
      '/api/auth/setup',
      '/api/license/machine-id',
      '/api/license/activate',
      '/api/license/verify',
      '/api/license/info',
    ])('%s معفى ولا يستدعي التحقق', async (url) => {
      const result = await enforceLicense(req(url))
      expect(result.ok).toBe(true)
      expect(mockValidate).not.toHaveBeenCalled()
    })

    it('يعامل المسار المنتهي بـ / كالمعفى', () => {
      expect(isLicenseExempt(req('/api/health/'))).toBe(true)
    })

    it('لا يُعفي مساراً يبدأ بنفس البادئة نصياً (/api/licensed-data)', () => {
      expect(isLicenseExempt(req('/api/licensed-data'))).toBe(false)
    })

    it('مسار أعمال ليس معفى', () => {
      expect(isLicenseExempt(req('/api/items?limit=1'))).toBe(false)
    })
  })

  describe('الطلبات غير المصادَق عليها', () => {
    it('بلا companyId: يمر دون تحقق (المصادقة تتولى الرفض)', async () => {
      const result = await enforceLicense(req('/api/items', null))
      expect(result.ok).toBe(true)
      expect(mockValidate).not.toHaveBeenCalled()
    })
  })

  describe('نتائج التحقق', () => {
    it('ترخيص صالح: يسمح ويضبط req.license', async () => {
      mockValidate.mockResolvedValue(VALID)
      const r = req('/api/items')
      const result = await enforceLicense(r)
      expect(result.ok).toBe(true)
      expect(r.license).toMatchObject({ valid: true, tier: 'enterprise' })
    })

    it('ترخيص منتهٍ: 403 مع الرمز LICENSE_EXPIRED', async () => {
      mockValidate.mockResolvedValue({ valid: false, reason: 'LICENSE_EXPIRED' })
      const result = await enforceLicense(req('/api/sales'))
      expect(result).toMatchObject({ ok: false, status: 403, body: { code: 'LICENSE_EXPIRED' } })
    })

    it('عدم تطابق العتاد: 403 مع HARDWARE_MISMATCH', async () => {
      mockValidate.mockResolvedValue({ valid: false, reason: 'HARDWARE_MISMATCH' })
      const result = await enforceLicense(req('/api/sales'))
      expect(result).toMatchObject({ ok: false, status: 403, body: { code: 'HARDWARE_MISMATCH' } })
    })

    it('انتهاء التجربة: 403 مع TRIAL_EXPIRED', async () => {
      mockValidate.mockResolvedValue({ valid: false, reason: 'TRIAL_EXPIRED', isTrial: true })
      const result = await enforceLicense(req('/api/reports/dashboard'))
      expect(result).toMatchObject({ ok: false, status: 403, body: { code: 'TRIAL_EXPIRED' } })
    })

    it('استثناء أثناء التحقق: 503 ولا يُخزَّن', async () => {
      mockValidate.mockRejectedValueOnce(new Error('db down'))
      const first = await enforceLicense(req('/api/items'))
      expect(first).toMatchObject({ ok: false, status: 503, body: { code: 'LICENSE_SYSTEM_ERROR' } })

      mockValidate.mockResolvedValueOnce(VALID)
      const second = await enforceLicense(req('/api/items'))
      expect(second.ok).toBe(true)
      expect(mockValidate).toHaveBeenCalledTimes(2)
    })

    it('VALIDATION_ERROR من الخدمة لا يُخزَّن في الكاش', async () => {
      mockValidate.mockResolvedValueOnce({ valid: false, reason: 'VALIDATION_ERROR' })
      await enforceLicense(req('/api/items'))

      mockValidate.mockResolvedValueOnce(VALID)
      const again = await enforceLicense(req('/api/items'))
      expect(again.ok).toBe(true)
      expect(mockValidate).toHaveBeenCalledTimes(2)
    })
  })

  describe('كاش 60 ثانية لكل شركة', () => {
    it('يعيد النتيجة من الكاش خلال 60 ثانية دون استدعاء الخدمة', async () => {
      mockValidate.mockResolvedValue(VALID)
      await enforceLicense(req('/api/items'))
      now += 59_000
      await enforceLicense(req('/api/items'))
      expect(mockValidate).toHaveBeenCalledTimes(1)
    })

    it('يعيد التحقق بعد انقضاء 60 ثانية', async () => {
      mockValidate.mockResolvedValue(VALID)
      await enforceLicense(req('/api/items'))
      now += 61_000
      await enforceLicense(req('/api/items'))
      expect(mockValidate).toHaveBeenCalledTimes(2)
    })

    it('الكاش منفصل لكل شركة', async () => {
      mockValidate.mockResolvedValue(VALID)
      await enforceLicense(req('/api/items', 1))
      await enforceLicense(req('/api/items', 2))
      expect(mockValidate).toHaveBeenCalledTimes(2)
    })

    it('clearLicenseCache يُبطل الكاش فوراً (بعد التفعيل/الإلغاء)', async () => {
      mockValidate.mockResolvedValueOnce(VALID)
      await enforceLicense(req('/api/items'))
      clearLicenseCache()
      mockValidate.mockResolvedValueOnce({ valid: false, reason: 'LICENSE_EXPIRED' })
      const result = await enforceLicense(req('/api/items'))
      expect(result).toMatchObject({ ok: false, status: 403 })
    })
  })
})
