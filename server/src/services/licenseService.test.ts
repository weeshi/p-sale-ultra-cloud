import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { prisma } from '../config/database'
import { generateHardwareHash, verifyLicenseSignature, TIER_FEATURES } from './licenseService'

// Mock the entire licenseService module's prisma and fs dependencies
jest.mock('../config/database', () => ({
  prisma: {
    license: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('../config', () => ({
  CONFIG: {
    license: {
      publicKeyPath: './.keys/public_key.pem',
      trialDays: 30,
    },
  },
}))

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

// Generate test key pair
const testKeys = crypto.generateKeyPairSync('ed25519')
const testPrivateKey = testKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const testPublicKey = testKeys.publicKey.export({ type: 'spki', format: 'pem' }) as string

describe('LicenseService', () => {
  describe('generateHardwareHash', () => {
    it('returns a 64-character hex string', () => {
      const hash = generateHardwareHash()
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('returns consistent hash for same machine', () => {
      const hash1 = generateHardwareHash()
      const hash2 = generateHardwareHash()
      expect(hash1).toBe(hash2)
    })
  })

  describe('verifyLicenseSignature', () => {
    const testPayload = JSON.stringify({
      companyId: 1,
      licenseKey: 'test-key-123',
      tier: 'pro',
      hwHash: 'abc123',
    })

    it('returns true for valid signature', () => {
      const signature = crypto.sign(null, Buffer.from(testPayload), testKeys.privateKey)
      const sigBase64 = signature.toString('base64')

      jest.spyOn(fs, 'existsSync').mockReturnValue(true)
      jest.spyOn(fs, 'readFileSync').mockReturnValue(testPublicKey)

      const result = verifyLicenseSignature(testPayload, sigBase64)
      expect(result).toBe(true)

      jest.restoreAllMocks()
    })

    it('returns false for invalid signature', () => {
      const wrongKeys = crypto.generateKeyPairSync('ed25519')
      const signature = crypto.sign(null, Buffer.from(testPayload), wrongKeys.privateKey)
      const sigBase64 = signature.toString('base64')

      jest.spyOn(fs, 'existsSync').mockReturnValue(true)
      jest.spyOn(fs, 'readFileSync').mockReturnValue(testPublicKey)

      const result = verifyLicenseSignature(testPayload, sigBase64)
      expect(result).toBe(false)

      jest.restoreAllMocks()
    })

    it('returns false when public key file missing', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false)

      const result = verifyLicenseSignature(testPayload, 'somesig')
      expect(result).toBe(false)

      jest.restoreAllMocks()
    })
  })

  describe('TIER_FEATURES', () => {
    it('trial has basic features only', () => {
      expect(TIER_FEATURES.trial).toContain('sales')
      expect(TIER_FEATURES.trial).toContain('purchases')
      expect(TIER_FEATURES.trial).not.toContain('accounting')
      expect(TIER_FEATURES.trial).not.toContain('treasury')
    })

    it('basic includes accounting and treasury', () => {
      expect(TIER_FEATURES.basic).toContain('accounting')
      expect(TIER_FEATURES.basic).toContain('treasury')
      expect(TIER_FEATURES.basic).not.toContain('multi_branch')
    })

    it('pro includes multi_branch and warranty', () => {
      expect(TIER_FEATURES.pro).toContain('multi_branch')
      expect(TIER_FEATURES.pro).toContain('warranty')
      expect(TIER_FEATURES.pro).toContain('advanced_reports')
    })

    it('enterprise includes wildcard', () => {
      expect(TIER_FEATURES.enterprise).toContain('*')
    })
  })
})
