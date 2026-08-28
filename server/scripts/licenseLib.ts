#!/usr/bin/env node
/**
 * licenseLib.ts — SHARED LICENSE SIGNING LIBRARY (air-gapped)
 *
 * Pure signing/verification helpers used by BOTH:
 *   - scripts/sign-license.ts        (the offline CLI)
 *   - scripts/license-issuer/server.ts (the local web UI)
 *
 * The private key lives ONLY on the admin's machine under .keys/
 * and is never transmitted anywhere. This file performs no I/O other
 * than reading the key files from disk.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const KEYS_DIR = path.resolve(__dirname, '../..', '.keys')
export const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private_key.pem')
export const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public_key.pem')

export const TIERS = ['trial', 'basic', 'pro', 'enterprise'] as const
export type Tier = (typeof TIERS)[number]

export interface LicenseSignOptions {
  companyId: number
  hwHash: string
  tier: string
  expiresAt: string | null
  features: string[]
  maxUsers: number | null
  maxBranches: number | null
  notes: string | null
}

export const TIER_FEATURES_DEFAULTS: Record<string, string[]> = {
  trial: ['sales', 'purchases', 'inventory', 'basic_reports'],
  basic: ['sales', 'purchases', 'inventory', 'accounting', 'treasury', 'basic_reports'],
  pro: ['sales', 'purchases', 'inventory', 'accounting', 'treasury', 'advanced_reports', 'multi_branch', 'warranty'],
  enterprise: ['*'],
}

export const TIER_LABELS_AR: Record<string, string> = {
  trial: 'تجريبي',
  basic: 'أساسي',
  pro: 'احترافي',
  enterprise: 'مؤسسي',
}

export function getDefaultFeatures(tier: string): string[] {
  return TIER_FEATURES_DEFAULTS[tier] || TIER_FEATURES_DEFAULTS.basic
}

export function keysExist(): { private: boolean; public: boolean } {
  return { private: fs.existsSync(PRIVATE_KEY_PATH), public: fs.existsSync(PUBLIC_KEY_PATH) }
}

export function buildLicensePayload(options: LicenseSignOptions): { payload: string; licenseKey: string } {
  const licenseKey = crypto.randomUUID()
  const payload = JSON.stringify({
    companyId: options.companyId,
    licenseKey,
    tier: options.tier,
    issuedAt: new Date().toISOString(),
    expiresAt: options.expiresAt,
    maxUsers: options.maxUsers,
    maxBranches: options.maxBranches,
    hwHash: options.hwHash,
    features: options.features.length > 0 ? options.features : getDefaultFeatures(options.tier),
  })
  return { payload, licenseKey }
}

export function signLicensePayload(payload: string): { base64: string; signature: string } {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(
      `Private key not found: ${PRIVATE_KEY_PATH}\n   Run: npx tsx server/scripts/generate-license-keys.ts`
    )
  }
  const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8')
  const privateKey = crypto.createPrivateKey(privateKeyPem)
  const signature = crypto.sign(null, Buffer.from(payload), privateKey)
  const base64 = Buffer.from(
    JSON.stringify({ payload, signature: signature.toString('base64') })
  ).toString('base64')
  return { base64, signature: signature.toString('base64') }
}

export function verifySignedLicense(base64: string): { valid: boolean; error?: string; payload?: any } {
  try {
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
    if (typeof decoded.payload !== 'string' || typeof decoded.signature !== 'string') {
      return { valid: false, error: 'بنية الترخيص غير صالحة' }
    }
    if (!fs.existsSync(PUBLIC_KEY_PATH)) {
      return { valid: false, error: `المفتاح العام غير موجود: ${PUBLIC_KEY_PATH}` }
    }
    const publicKey = crypto.createPublicKey(fs.readFileSync(PUBLIC_KEY_PATH, 'utf8'))
    const signature = Buffer.from(decoded.signature, 'base64')
    const valid = crypto.verify(null, Buffer.from(decoded.payload), publicKey, signature)
    return valid
      ? { valid: true, payload: JSON.parse(decoded.payload) }
      : { valid: false, error: 'التوقيع غير متطابق — لم يُوقَّع بالمفتاح الخاص المقابل' }
  } catch (e: any) {
    return { valid: false, error: e?.message || 'فشل التحقق من الترخيص' }
  }
}

export function decodeSignedLicense(base64: string): { payload: string; signature: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
    if (typeof decoded.payload !== 'string' || typeof decoded.signature !== 'string') return null
    return { payload: decoded.payload, signature: decoded.signature }
  } catch {
    return null
  }
}