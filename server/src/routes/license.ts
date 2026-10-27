import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import {
  activateLicense,
  deactivateLicense,
  getLicenseInfo,
  generateHardwareHash,
  validateLicense,
  checkFeature,
} from '../services/licenseService'
import { prisma } from '../config/database'
import logger from '../config/logger'
import { clearLicenseCache } from '../middleware/license'

const router = Router()

// ============================================
// GET /api/license/machine-id — UNAUTHENTICATED
// Returns the server's hardware fingerprint
// Clients use this to send their ID for license generation
// ============================================
router.get('/machine-id', async (req, res) => {
  try {
    const hwHash = generateHardwareHash()
    res.json({ hwHash })
  } catch (error: any) {
    logger.error('Failed to generate machine ID:', error)
    res.status(500).json({ error: 'Failed to generate machine ID' })
  }
})

// ============================================
// All routes below require authentication
// ============================================
router.use(authenticate)

// ============================================
// POST /api/license/activate — admin only
// Activates a license from a CLI-signed Base64 string
// ============================================
router.post('/activate', authorize('admin'), async (req, res) => {
  try {
    const { licenseKey } = req.body

    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({ error: 'licenseKey (Base64 string) is required' })
    }

    // Decode the Base64 envelope
    let decoded: { payload: string; signature: string }
    try {
      decoded = JSON.parse(Buffer.from(licenseKey, 'base64').toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'Invalid license format' })
    }

    if (!decoded.payload || !decoded.signature) {
      return res.status(400).json({ error: 'Invalid license structure' })
    }

    const result = await activateLicense(req.companyId!, decoded.payload, decoded.signature)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    // إبطال كاش التحقق حتى يُطبَّق الترخيص الجديد فوراً
    clearLicenseCache()

    return res.json({
      message: 'License activated successfully',
      license: result.license,
    })
  } catch (error: any) {
    logger.error('License activation error:', error)
    return res.status(500).json({ error: 'Failed to activate license' })
  }
})

// ============================================
// GET /api/license/info — admin only
// Returns current license information
// ============================================
router.get('/info', authorize('admin'), async (req, res) => {
  try {
    const info = await getLicenseInfo(req.companyId!)
    return res.json(info)
  } catch (error: any) {
    logger.error('License info error:', error)
    return res.status(500).json({ error: 'Failed to get license info' })
  }
})

// ============================================
// POST /api/license/deactivate — admin only
// Deactivates the current license
// ============================================
router.post('/deactivate', authorize('admin'), async (req, res) => {
  try {
    const success = await deactivateLicense(req.companyId!)
    if (!success) {
      return res.status(500).json({ error: 'Failed to deactivate license' })
    }
    // إبطال كاش التحقق حتى يُطبَّق الإلغاء فوراً
    clearLicenseCache()
    return res.json({ message: 'License deactivated successfully' })
  } catch (error: any) {
    logger.error('License deactivation error:', error)
    return res.status(500).json({ error: 'Failed to deactivate license' })
  }
})

// ============================================
// GET /api/license/verify — any authenticated user
// Checks if the current license is valid
// ============================================
router.get('/verify', async (req, res) => {
  try {
    const result = await validateLicense(req.companyId!)
    return res.json({
      valid: result.valid,
      reason: result.reason,
      isTrial: result.isTrial,
      trialDaysLeft: result.trialDaysLeft,
      features: result.features,
    })
  } catch (error: any) {
    logger.error('License verify error:', error)
    return res.status(500).json({ error: 'Failed to verify license' })
  }
})

// ============================================
// GET /api/license/features — any authenticated user
// Returns list of enabled features
// ============================================
router.get('/features', async (req, res) => {
  try {
    const info = await getLicenseInfo(req.companyId!)
    return res.json({
      features: info?.features || [],
      tier: info?.tier,
      isTrial: info?.isTrial,
    })
  } catch (error: any) {
    logger.error('License features error:', error)
    return res.status(500).json({ error: 'Failed to get features' })
  }
})

// ============================================
// GET /api/license/check/:feature — any authenticated user
// Checks if a specific feature is enabled
// ============================================
router.get('/check/:feature', async (req, res) => {
  try {
    const { feature } = req.params
    const enabled = await checkFeature(req.companyId!, feature)
    return res.json({ feature, enabled })
  } catch (error: any) {
    logger.error('License feature check error:', error)
    return res.status(500).json({ error: 'Failed to check feature' })
  }
})

// ============================================
// GET /api/license/all — super admin only
// Lists all licenses across all companies
// ============================================
router.get('/all', authorize('admin'), async (req, res) => {
  try {
    // Only super admin can see all licenses
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' })
    }

    const licenses = await prisma.license.findMany({
      include: { features: true, company: { select: { id: true, name: true } } },
      orderBy: { activatedAt: 'desc' },
    })

    return res.json({ licenses })
  } catch (error: any) {
    logger.error('License list error:', error)
    return res.status(500).json({ error: 'Failed to list licenses' })
  }
})

export default router
