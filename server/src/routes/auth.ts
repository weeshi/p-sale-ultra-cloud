import { Router } from 'express'
import { authService } from '../services/authService'
import { authenticate, authorize } from '../middleware/auth'
import { buildRolePermissions } from '../../../shared/constants'

const router = Router()

// تسجيل الدخول
router.post('/login', async (req, res) => {
  try {
    const { username, password, deviceId } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' })
    }
    const result = await authService.login(username, password, deviceId)
    return res.json(result)
  } catch (error: any) {
    return res.status(401).json({ error: error.message })
  }
})

// تحديث التوكن
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      return res.status(400).json({ error: 'توكن التحديث مطلوب' })
    }
    const result = await authService.refreshToken(refreshToken)
    return res.json(result)
  } catch (error: any) {
    return res.status(401).json({ error: error.message })
  }
})

// الإعداد الأولي
router.post('/setup', async (req, res) => {
  try {
    const { companyName, adminUsername, adminPassword, adminFullName } = req.body
    if (!companyName || !adminUsername || !adminPassword) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' })
    }
    const result = await authService.setup({
      companyName,
      adminUsername,
      adminPassword,
      adminFullName,
    })
    return res.status(201).json(result)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// المستخدم الحالي
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await req.user
    return res.json({ user })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء مستخدم (مدير فقط — صلاحيات افتراضية حسب الدور عند عدم إرسالها)
router.post('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await authService.createUser({
      ...req.body,
      companyId: req.companyId!,
      permissions:
        Array.isArray(req.body.permissions) && req.body.permissions.length > 0
          ? req.body.permissions
          : buildRolePermissions(req.body.role || 'viewer'),
    })
    return res.status(201).json(result)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

// تغيير كلمة المرور
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' })
    }
    const result = await authService.changePassword(req.user!.id, currentPassword, newPassword)
    return res.json(result)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

export default router
