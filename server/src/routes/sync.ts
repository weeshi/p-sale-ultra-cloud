import { Request, Router } from 'express'
import { authenticate } from '../middleware/auth'
import { syncService, type SyncActor } from '../services/syncService'

const router = Router()
router.use(authenticate)

// هوية المنفّذ من التوكن فقط — لا تُقبل من حمولة العميل
function actorOf(req: Request): SyncActor {
  return {
    userId: req.user!.id,
    branchId: req.branchId ?? null,
    isSuperAdmin: !!req.user?.isSuperAdmin,
    role: req.user!.role,
  }
}

// دفع التغييرات المحلية إلى السيرفر
router.post('/push', async (req, res) => {
  try {
    const { deviceId, changes } = req.body
    if (!deviceId || !changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'deviceId و changes مطلوبان' })
    }
    const result = await syncService.pushChanges(req.companyId!, actorOf(req), deviceId, changes)
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// سحب التحديثات من السيرفر
router.post('/pull', async (req, res) => {
  try {
    const { deviceId, lastSyncAt } = req.body
    if (!deviceId) return res.status(400).json({ error: 'deviceId مطلوب' })
    const result = await syncService.pullChanges(
      req.companyId!,
      deviceId,
      lastSyncAt ? new Date(lastSyncAt) : undefined
    )
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// مزامنة كاملة (دفع + سحب)
router.post('/full', async (req, res) => {
  try {
    const { deviceId, lastSyncAt, changes } = req.body
    if (!deviceId) return res.status(400).json({ error: 'deviceId مطلوب' })

    let pushResult = {
      status: 'success',
      recordsCount: 0,
      skippedCount: 0,
      errors: [] as Array<{ entity: string; id: number | null; queueId: number | null; message: string }>,
    }
    if (changes && Array.isArray(changes) && changes.length > 0) {
      pushResult = await syncService.pushChanges(req.companyId!, actorOf(req), deviceId, changes)
    }

    const pullResult = await syncService.pullChanges(
      req.companyId!,
      deviceId,
      lastSyncAt ? new Date(lastSyncAt) : undefined
    )

    return res.json({ push: pushResult, pull: pullResult })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// حالة المزامنة
router.get('/status', async (req, res) => {
  try {
    const { deviceId } = req.query
    const status = await syncService.getSyncStatus(
      req.companyId!,
      deviceId ? String(deviceId) : undefined
    )
    return res.json(status)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
