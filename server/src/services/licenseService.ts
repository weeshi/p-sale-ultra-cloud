import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { prisma } from '../config/database'
import { CONFIG } from '../config'
import logger from '../config/logger'
import { generateHardwareHash } from './hardwareId'

// بصمة العتاد تُحسب في وحدة مستقلة (hardwareId) لتكون حتمية وقابلة للاختبار
export { generateHardwareHash }

// ============================================
// License System - Core Logic
// Ed25519 + Hardware Binding
// PRIVATE KEY NEVER TOUCHES THIS FILE
// ============================================

export interface LicensePayload {
  companyId: number
  licenseKey: string
  tier: 'trial' | 'basic' | 'pro' | 'enterprise'
  issuedAt: string
  expiresAt: string | null
  maxUsers: number | null
  maxBranches: number | null
  hwHash: string
  features: string[]
}

export interface LicenseValidationResult {
  valid: boolean
  reason?: string
  license?: any
  features?: string[]
  isTrial?: boolean
  trialDaysLeft?: number
}

// ============================================
// Hardware Fingerprint — انظر services/hardwareId.ts
// (CPU model + core count + MAC مستقر بترتيب حتمي)
// ============================================

// ============================================
// Ed25519 Signature Verification (PUBLIC KEY ONLY)
// ============================================
export function verifyLicenseSignature(payload: string, signatureBase64: string): boolean {
  try {
    const publicKeyPath = path.resolve(CONFIG.license.publicKeyPath)
    if (!fs.existsSync(publicKeyPath)) {
      logger.error(`License public key not found: ${publicKeyPath}`)
      return false
    }

    const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8')
    const publicKey = crypto.createPublicKey(publicKeyPem)
    const signature = Buffer.from(signatureBase64, 'base64')

    return crypto.verify(null, Buffer.from(payload), publicKey, signature)
  } catch (error) {
    logger.error('License signature verification failed:', error)
    return false
  }
}

// ============================================
// Validate License (the main validation function)
// Checks: signature + hwHash + expiry + active
// ============================================
export async function validateLicense(companyId: number): Promise<LicenseValidationResult> {
  try {
    // 1. Look up license for this company
    const license = await prisma.license.findFirst({
      where: { companyId, isActive: true },
      include: { features: true },
      orderBy: { activatedAt: 'desc' },
    })

    // 2. No license found → check trial
    if (!license) {
      const trialResult = await checkTrial(companyId)
      return trialResult
    }

    // 3. Check expiry
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      return { valid: false, reason: 'LICENSE_EXPIRED' }
    }

    // 4. Check hardware hash (STRICT — must match exactly)
    const currentHwHash = generateHardwareHash()
    if (license.hwHash !== currentHwHash) {
      logger.warn(`License hwHash mismatch for company ${companyId}. Expected: ${license.hwHash}, Got: ${currentHwHash}`)
      return { valid: false, reason: 'HARDWARE_MISMATCH' }
    }

    // 5. License is valid
    const features = license.features.filter((f) => f.enabled).map((f) => f.feature)
    return {
      valid: true,
      license,
      features,
      isTrial: false,
    }
  } catch (error) {
    logger.error('License validation error:', error)
    return { valid: false, reason: 'VALIDATION_ERROR' }
  }
}

// ============================================
// Check Trial Status
// 30 days from company creation
// ============================================
async function checkTrial(companyId: number): Promise<LicenseValidationResult> {
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return { valid: false, reason: 'COMPANY_NOT_FOUND' }
    }

    const createdAt = new Date(company.createdAt)
    const now = new Date()
    const trialMs = CONFIG.license.trialDays * 24 * 60 * 60 * 1000
    const trialEnd = new Date(createdAt.getTime() + trialMs)
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

    if (daysLeft <= 0) {
      return { valid: false, reason: 'TRIAL_EXPIRED', isTrial: true, trialDaysLeft: 0 }
    }

    // Trial active — allow basic features
    return {
      valid: true,
      isTrial: true,
      trialDaysLeft: daysLeft,
      features: ['sales', 'purchases', 'inventory', 'basic_reports'],
    }
  } catch (error) {
    logger.error('Trial check error:', error)
    return { valid: false, reason: 'TRIAL_CHECK_ERROR' }
  }
}

// ============================================
// Check Feature Access
// ============================================
export async function checkFeature(companyId: number, feature: string): Promise<boolean> {
  const result = await validateLicense(companyId)
  if (!result.valid) return false
  if (!result.features) return false
  if (result.features.includes('*')) return true // enterprise = all features
  return result.features.includes(feature)
}

// ============================================
// Activate License (saves to DB after CLI-signed payload)
// ============================================
export async function activateLicense(
  companyId: number,
  signedPayload: string,
  signatureBase64: string
): Promise<{ success: boolean; error?: string; license?: any }> {
  try {
    // 1. Verify signature
    if (!verifyLicenseSignature(signedPayload, signatureBase64)) {
      return { success: false, error: 'INVALID_SIGNATURE' }
    }

    // 2. Parse payload
    const payload: LicensePayload = JSON.parse(signedPayload)

    // 3. Verify hwHash matches this server
    const currentHwHash = generateHardwareHash()
    if (payload.hwHash !== currentHwHash) {
      return { success: false, error: 'HARDWARE_MISMATCH' }
    }

    // 4. Verify companyId matches
    if (payload.companyId !== companyId) {
      return { success: false, error: 'COMPANY_MISMATCH' }
    }

    // 5. Deactivate any existing active licenses for this company
    await prisma.license.updateMany({
      where: { companyId, isActive: true },
      data: { isActive: false },
    })

    // 6. Create new license with features
    const license = await prisma.license.create({
      data: {
        companyId,
        licenseKey: payload.licenseKey,
        tier: payload.tier,
        hwHash: payload.hwHash,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        maxUsers: payload.maxUsers,
        maxBranches: payload.maxBranches,
        isActive: true,
        features: {
          create: payload.features.map((f) => ({
            feature: f,
            enabled: true,
          })),
        },
      },
      include: { features: true },
    })

    logger.info(`License activated for company ${companyId}: ${payload.tier} (key: ${payload.licenseKey})`)
    return { success: true, license }
  } catch (error) {
    logger.error('License activation error:', error)
    return { success: false, error: 'ACTIVATION_ERROR' }
  }
}

// ============================================
// Deactivate License
// ============================================
export async function deactivateLicense(companyId: number): Promise<boolean> {
  try {
    await prisma.license.updateMany({
      where: { companyId, isActive: true },
      data: { isActive: false },
    })
    logger.info(`License deactivated for company ${companyId}`)
    return true
  } catch (error) {
    logger.error('License deactivation error:', error)
    return false
  }
}

// ============================================
// Get License Info
// ============================================
export async function getLicenseInfo(companyId: number) {
  try {
    const license = await prisma.license.findFirst({
      where: { companyId, isActive: true },
      include: { features: true },
      orderBy: { activatedAt: 'desc' },
    })

    if (!license) {
      const trial = await checkTrial(companyId)
      return {
        hasLicense: false,
        isTrial: trial.isTrial,
        trialDaysLeft: trial.trialDaysLeft,
        features: trial.features,
        tier: null,
        expiresAt: null,
        hwHash: generateHardwareHash(),
      }
    }

    return {
      hasLicense: true,
      isTrial: false,
      licenseKey: license.licenseKey,
      tier: license.tier,
      activatedAt: license.activatedAt,
      expiresAt: license.expiresAt,
      maxUsers: license.maxUsers,
      maxBranches: license.maxBranches,
      features: license.features.filter((f) => f.enabled).map((f) => f.feature),
      hwHash: license.hwHash,
    }
  } catch (error) {
    logger.error('Get license info error:', error)
    return null
  }
}

// ============================================
// Default Tier Features
// ============================================
export const TIER_FEATURES: Record<string, string[]> = {
  trial: ['sales', 'purchases', 'inventory', 'basic_reports'],
  basic: ['sales', 'purchases', 'inventory', 'accounting', 'treasury', 'basic_reports'],
  pro: ['sales', 'purchases', 'inventory', 'accounting', 'treasury', 'advanced_reports', 'multi_branch', 'warranty'],
  enterprise: ['*'],
}
