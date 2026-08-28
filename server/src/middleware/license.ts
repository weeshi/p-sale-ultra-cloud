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

/**
 * checkLicense middleware
 *
 * Enforces license validation on all /api/* routes.
 * - Generates hardware fingerprint on every request
 * - Validates signature, hwHash, expiry, active status
 * - Falls back to trial mode (30 days from company creation)
 * - Returns 403 if license invalid/expired and trial exhausted
 *
 * MUST run AFTER authenticate middleware (needs req.companyId)
 */
export async function checkLicense(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip for public routes
    if (SKIP_LICENSE_ROUTES.includes(req.path)) {
      return next()
    }

    // Skip for license management routes (activate needs to work without license)
    if (req.path.startsWith(LICENSE_ROUTE_PREFIX)) {
      return next()
    }

    // Skip if no company (unauthenticated routes handled elsewhere)
    if (!req.companyId) {
      return next()
    }

    // Validate license for this company
    const result: LicenseValidationResult = await validateLicense(req.companyId)

    if (!result.valid) {
      const statusCode = result.reason === 'HARDWARE_MISMATCH' ? 403 : 403
      logger.warn(`License check failed for company ${req.companyId}: ${result.reason}`)

      return res.status(statusCode).json({
        error: 'License validation failed',
        code: result.reason,
        message: getErrorMessage(result.reason),
      })
    }

    // Attach license info to request for downstream use
    req.license = {
      valid: true,
      tier: result.license?.tier,
      features: result.features,
      isTrial: result.isTrial,
      trialDaysLeft: result.trialDaysLeft,
    }

    next()
  } catch (error) {
    logger.error('License middleware error:', error)
    // Fail open for critical system routes, fail closed for business routes
    return res.status(503).json({
      error: 'License system unavailable',
      code: 'LICENSE_SYSTEM_ERROR',
    })
  }
}

function getErrorMessage(reason?: string): string {
  switch (reason) {
    case 'LICENSE_EXPIRED':
      return 'Your license has expired. Please contact your administrator to renew.'
    case 'HARDWARE_MISMATCH':
      return 'License is bound to a different server. Hardware verification failed.'
    case 'TRIAL_EXPIRED':
      return 'Trial period has expired. Please activate a valid license.'
    case 'COMPANY_NOT_FOUND':
      return 'Company not found.'
    default:
      return 'Invalid or inactive license.'
  }
}
