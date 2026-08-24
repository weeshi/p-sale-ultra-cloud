import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { prisma } from '../config/database'
import { authenticate, authorize } from '../middleware/auth'
import { authService } from '../services/authService'
import { cleanupService } from '../services/cleanupService'
import { createBackup } from '../services/backupService'
import { buildRolePermissions } from '../../../shared/constants'

const router = Router()
router.use(authenticate)

// منطقة الخطر متاحة للسوبر أدمن فقط
function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: 'منطقة الخطر متاحة للسوبر أدمن فقط' })
    return false
  }
  return true
}

// حد أقصى: طلب تفريغ واحد لكل ساعة لكل عنوان IP
const resetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم استنفاد محاولات تفريغ قاعدة البيانات — انتظر ساعة قبل المحاولة مجدداً' },
})

// ============ الشركة ============

// بيانات الشركة
router.get('/company', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    })
    return res.json(company)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تحديث الشركة
router.put('/company', authorize('admin'), async (req, res) => {
  try {
    const { name, address, phone, mobile, taxNumber, logo, fiscalYearStart } = req.body
    const company = await prisma.company.update({
      where: { id: req.companyId },
      data: { name, address, phone, mobile, taxNumber, logo, fiscalYearStart },
    })
    return res.json(company)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ الوحدات ============

router.get('/units', async (req, res) => {
  try {
    const units = await prisma.unit.findMany({ where: { companyId: req.companyId } })
    return res.json(units)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

router.post('/units', authorize('admin'), async (req, res) => {
  try {
    const { name, shortName } = req.body
    if (!name) return res.status(400).json({ error: 'اسم الوحدة مطلوب' })
    const unit = await prisma.unit.create({
      data: { companyId: req.companyId!, name, shortName: shortName || name },
    })
    return res.status(201).json(unit)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ الفئات ============

router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { companyId: req.companyId },
      include: { children: true, _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    })
    return res.json(categories)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

router.post('/categories', authorize('admin'), async (req, res) => {
  try {
    const { name, parentId, icon } = req.body
    if (!name) return res.status(400).json({ error: 'اسم الفئة مطلوب' })
    const category = await prisma.category.create({
      data: { companyId: req.companyId!, name, parentId, icon },
    })
    return res.status(201).json(category)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ الماركات ============

router.get('/brands', async (req, res) => {
  try {
    const brands = await prisma.brand.findMany({
      where: { companyId: req.companyId },
      orderBy: { name: 'asc' },
    })
    return res.json(brands)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

router.post('/brands', authorize('admin'), async (req, res) => {
  try {
    const { name, logo, country } = req.body
    if (!name) return res.status(400).json({ error: 'اسم الماركة مطلوب' })
    const brand = await prisma.brand.create({
      data: { companyId: req.companyId!, name, logo, country },
    })
    return res.status(201).json(brand)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ الخصائص ============

router.get('/attributes', async (req, res) => {
  try {
    const attributes = await prisma.attribute.findMany({
      where: { companyId: req.companyId },
      include: { values: true },
      orderBy: { name: 'asc' },
    })
    return res.json(attributes)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

router.post('/attributes', authorize('admin'), async (req, res) => {
  try {
    const { name, type, options, isFilterable } = req.body
    if (!name) return res.status(400).json({ error: 'اسم الخاصية مطلوب' })
    const attribute = await prisma.attribute.create({
      data: {
        companyId: req.companyId!,
        name,
        type: type || 'text',
        options: options ? JSON.stringify(options) : null,
        isFilterable: isFilterable ?? true,
      },
    })
    return res.status(201).json(attribute)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ المستخدمون ============

router.get('/users', authorize('admin'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { companyId: req.companyId },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        branchId: true,
        isActive: true,
        isSuperAdmin: true,
        lastLoginAt: true,
        branch: { select: { name: true } },
        permissions: true,
      },
    })
    return res.json(users)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// إنشاء مستخدم (مدير فقط — صلاحيات افتراضية حسب الدور عند عدم إرسالها)
router.post('/users', authorize('admin'), async (req, res) => {
  try {
    const { username, password, fullName, email, phone, role, branchId, permissions } = req.body
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور والاسم الكامل والدور مطلوبة' })
    }
    const result = await authService.createUser({
      companyId: req.companyId!,
      username,
      password,
      fullName,
      email,
      phone,
      role,
      branchId: branchId ? Number(branchId) : undefined,
      permissions: Array.isArray(permissions) && permissions.length > 0 ? permissions : buildRolePermissions(role),
    })
    return res.status(201).json(result)
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
})

router.put('/users/:id', authorize('admin'), async (req, res) => {
  try {
    const { fullName, email, phone, role, branchId, isActive, isSuperAdmin, permissions } = req.body

    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: Number(req.params.id) } })
      if (!target || target.companyId !== req.companyId) {
        throw new Error('المستخدم غير موجود')
      }

      // منع إنشاء سوبر أدمن ثانٍ للشركة
      const nextIsSuperAdmin = isSuperAdmin === true
      if (nextIsSuperAdmin && !target.isSuperAdmin) {
        const existing = await tx.user.count({
          where: { companyId: req.companyId, isSuperAdmin: true },
        })
        if (existing > 0) throw new Error('الشركة تملك سوبر أدمن بالفعل')
      }

      // منع إسقاط السوبر أدمن الوحيد للشركة
      if (isSuperAdmin === false && target.isSuperAdmin) {
        const superAdmins = await tx.user.count({
          where: { companyId: req.companyId, isSuperAdmin: true },
        })
        if (superAdmins <= 1) throw new Error('لا يمكن إزالة السوبر أدمن الوحيد للشركة')
      }

      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          fullName,
          email,
          phone,
          role,
          branchId,
          isActive,
          ...(isSuperAdmin !== undefined
            ? {
                isSuperAdmin: nextIsSuperAdmin,
                superAdminKey: nextIsSuperAdmin ? req.companyId : null,
              }
            : {}),
        },
      })

      if (permissions) {
        await tx.permission.deleteMany({ where: { userId: updated.id } })
        if (permissions.length > 0) {
          await tx.permission.createMany({
            data: permissions.map((p: any) => ({
              userId: updated.id,
              module: p.module,
              canView: p.canView,
              canAdd: p.canAdd,
              canEdit: p.canEdit,
              canDelete: p.canDelete,
              canPrint: p.canPrint,
            })),
          })
        }
      }

      return updated
    })

    return res.json(user)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ منطقة الخطر (Super Admin فقط) ============

// نسخة احتياطية إجبارية قبل التفريغ — تُعاد مباشرة كملف للتنزيل
router.post('/backup-before-reset', authorize('admin'), async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  try {
    const backup = await createBackup()
    return res.download(backup.path, backup.filename)
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// تفريغ قاعدة البيانات (كلمة مرور السوبر أدمن مطلوبة + مرة واحدة لكل ساعة)
router.post('/reset-database', resetRateLimiter, authorize('admin'), async (req, res) => {
  if (!requireSuperAdmin(req, res)) return
  try {
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ error: 'كلمة المرور مطلوبة للتأكيد' })

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' })

    const result = await cleanupService.resetDatabase(req.companyId!, req.user!.id)
    return res.json({ success: true, message: 'تم تفريغ قاعدة البيانات بنجاح', result })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

// ============ سجل التدقيق ============

router.get('/audit-logs', async (req, res) => {
  try {
    const { tableName, eventType, page = 1, limit = 50 } = req.query
    const where: any = { companyId: req.companyId }
    if (tableName) where.tableName = String(tableName)
    if (eventType) where.eventType = String(eventType)

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditLog.count({ where }),
    ])

    return res.json({ logs, total })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
})

export default router
