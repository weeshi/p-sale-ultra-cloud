import { Request, Response, NextFunction } from 'express'
import { validateLicense, LicenseValidationResult } from '../services/licenseService'
import logger from '../config/logger'

// Extend Request to include license info
declare global {
  namespace Express {
    interface Request {
      license?: {
        valid: boolean
        tier?: string
        features?: string[]
        isTrial?: boolean
        trialDaysLeft?: number
      }
    }
  }
}

// Routes that skip license check (public endpoints)
const SKIP_LICENSE_ROUTES = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/setup',
  '/api/license/machine-id',
]

// Routes that skip license check (license management itself)
const LICENSE_ROUTE_PREFIX = '/api/license'

// كاش قصير للتحقق من الترخيص: فحص العتاد (CPU/MAC) + استعلام DB في كل طلب مكلف
const LICENSE_CACHE_TTL_MS = 60_000

interface CachedLicense {
  result: LicenseValidationResult
  expiresAt: number
}

const licenseCache = new Map<number, CachedLicense>()

/** إبطال كاش الترخيص (يُستخدم بعد التفعيل/الإلغاء وفي الاختبارات) */
export function clearLicenseCache(): void {
  licenseCache.clear()
}

async function validateLicenseCached(companyId: number): Promise<LicenseValidationResult> {
  const now = Date.now()
  const cached = licenseCache.get(companyId)
  if (cached && cached.expiresAt > now) return cached.result

  const result = await validateLicense(companyId)

  // لا نُخزّن أخطاء النظام مؤقتاً حتى لا يبقى النظام مقفلاً بعد زوال العطل
  if (result.reason !== 'VALIDATION_ERROR' && result.reason !== 'TRIAL_CHECK_ERROR') {
    licenseCache.set(companyId, { result, expiresAt: now + LICENSE_CACHE_TTL_MS })
  }

  return result
}

function requestPath(req: Request): string {
  const raw = (req.originalUrl || req.url || '').split('?')[0]
  return raw.replace(/\/+$/, '') || '/'
}

/** مسارات معفاة من فحص الترخيص (صحة النظام، الدخول/الإعداد، إدارة الترخيص) */
export function isLicenseExempt(req: Request): boolean {
  const path = requestPath(req)
  if (SKIP_LICENSE_ROUTES.includes(path)) return true
  if (path === LICENSE_ROUTE_PREFIX || path.startsWith(`${LICENSE_ROUTE_PREFIX}/`)) return true
  return false
}

export type LicenseEnforcement =
  | { ok: true; info?: Express.Request['license'] }
  | {
      ok: false
      status: number
      body: { error: string; code: string; message: string }
    }

/**
 * فرض الترخيص على الطلب الحالي.
 * يعتمد على req.companyId المُحقون من التوكن — لذلك يجب استدعاؤه بعد المصادقة.
 */
export async function enforceLicense(req: Request): Promise<LicenseEnforcement> {
  if (isLicenseExempt(req)) return { ok: true }

  const companyId = req.companyId
  // مسارات غير مصادَق عليها — تُعالج بـ authenticate وليس هنا
  if (!companyId) return { ok: true }

  try {
    const result = await validateLicenseCached(companyId)

    if (!result.valid) {
      logger.warn(`License check failed for company ${companyId}: ${result.reason}`)
      return {
        ok: false,
        status: 403,
        body: {
          error: 'License validation failed',
          code: result.reason ?? 'LICENSE_INVALID',
          message: getErrorMessage(result.reason),
        },
      }
    }

    const info = {
      valid: true,
      tier: result.license?.tier,
      features: result.features,
      isTrial: result.isTrial,
      trialDaysLeft: result.trialDaysLeft,
    }
    req.license = info
    return { ok: true, info }
  } catch (error) {
    logger.error('License middleware error:', error)
    return {
      ok: false,
      status: 503,
      body: {
        error: 'License system unavailable',
        code: 'LICENSE_SYSTEM_ERROR',
        message: 'تعذر التحقق من الترخيص، حاول لاحقاً أو تواصل مع المسؤول.',
      },
    }
  }
}

/**
 * checkLicense middleware
 *
 * Enforces license validation on all /api/* routes.
 * - Generates hardware fingerprint (cached 60s per company)
 * - Validates signature, hwHash, expiry, active status
 * - Falls back to trial mode (30 days from company creation)
 * - Returns 403 if license invalid/expired and trial exhausted
 *
 * ملاحظة (15.1): الفحص الفعلي مضمّن الآن داخل `authenticate` لأن `req.companyId`
 * لا يكون معروفاً قبل المصادقة. هذا الغلاف يبقى للاستخدام المباشر في المسارات.
 */
export async function checkLicense(req: Request, res: Response, next: NextFunction) {
  const result = await enforceLicense(req)
  if (!result.ok) {
    return res.status(result.status).json(result.body)
  }
  next()
}

function getErrorMessage(reason?: string): string {
  switch (reason) {
    case 'LICENSE_EXPIRED':
      return 'انتهت صلاحية الترخيص. يرجى التواصل مع المسؤول للتجديد.'
    case 'HARDWARE_MISMATCH':
      return 'الترخيص مرتبط بجهاز آخر. فشل التحقق من بصمة العتاد.'
    case 'TRIAL_EXPIRED':
      return 'انتهت الفترة التجريبية. يرجى تفعيل ترخيص صالح.'
    case 'COMPANY_NOT_FOUND':
      return 'الشركة غير موجودة.'
    default:
      return 'ترخيص غير صالح أو غير نشط.'
  }
}
