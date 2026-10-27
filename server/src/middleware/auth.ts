import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { CONFIG } from '../config'
import { prisma } from '../config/database'
import { enforceLicense } from './license'

export interface AuthUser {
   id: number
   companyId: number
   username: string
   role: string
   branchId: number | null
   isSuperAdmin: boolean
   canViewAllBranches?: boolean
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
      companyId?: number
      branchId?: number | null
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'غير مصرح بالدخول' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, CONFIG.jwt.secret) as AuthUser

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { company: true },
    })

     if (!user || !user.isActive) {
       return res.status(401).json({ error: 'المستخدم غير موجود أو غير نشط' })
     }

     // Fetch permissions and compute canViewAllBranches
     const permissions = await prisma.permission.findMany({
       where: { userId: user.id },
     })
     const canViewAllBranches = permissions.some(p => p.module === 'report_all_branches' && p.canView)

     req.user = {
       id: user.id,
       companyId: user.companyId,
       username: user.username,
       role: user.role,
       branchId: user.branchId,
       isSuperAdmin: user.isSuperAdmin,
       canViewAllBranches,
     }
    req.companyId = user.companyId
    req.branchId = user.branchId

    // فرض الترخيص بعد معرفة الشركة — لا يمكن فحصه قبل المصادقة (15.1)
    const license = await enforceLicense(req)
    if (!license.ok) {
      return res.status(license.status).json(license.body)
    }

    next()
  } catch (error) {
    return res.status(401).json({ error: 'توكن غير صالح أو منتهي' })
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'غير مصرح بالدخول' })
    }
    // السوبر أدمن يمر على أي مسار محمي بغض النظر عن الدور
    if (req.user.isSuperAdmin) return next()
    if (req.user.role === 'admin') return next()
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'لا تملك الصلاحية لهذا الإجراء' })
    }
    next()
  }
}

// نطاق الفرع الفعلي للقراءات:
// - سوبر أدمن أو مستخدم يملك canViewAllBranches → ?branchId (أو 'all' = كل الفروع)
// - مستخدم بلا فرع (عالمي) → ?branchId أو الكل
// - مستخدم مربوط بفرع → يُجبر على فرعه وحدَه (منع تجاوز العزل بتزوير المعامل)
export function resolveBranchScope(req: Request): number | undefined {
  const raw = req.query.branchId
  const wants = raw === undefined || raw === '' ? undefined : String(raw)
  const canSeeAll = Boolean(req.user?.isSuperAdmin || req.user?.canViewAllBranches)
  const ownBranch = req.branchId ?? undefined

  // 'all' صراحةً = كل الفروع (لمن يملك صلاحية عرض الكل فقط)
  if (wants === 'all') {
    return canSeeAll || ownBranch === undefined ? undefined : ownBranch
  }

  // الافتراضي الآمن: المستخدم المربوط بفرع يبقى على فرعه حتى لو كان يملك عرض الكل.
  // المستخدم العالمي (بلا فرع) يرى الكل افتراضياً.
  if (wants === undefined) {
    return ownBranch
  }

  const requested = Number(wants)
  if (!Number.isFinite(requested)) {
    return ownBranch
  }

  // مستخدم عالمي بلا فرع يختار أي فرع
  if (ownBranch === undefined) return requested
  // صاحب صلاحية عرض الكل يختار أي فرع
  if (canSeeAll) return requested
  // مستخدم مقيّد: يُجبر على فرعه (منع تزوير المعامل)
  return ownBranch
}

export function checkPermission(module: string, action: 'view' | 'add' | 'edit' | 'delete' | 'print') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'غير مصرح بالدخول' })
      if (req.user.isSuperAdmin) return next()
      if (req.user.role === 'admin') return next()

      const permission = await prisma.permission.findUnique({
        where: {
          userId_module: {
            userId: req.user.id,
            module,
          },
        },
      })

      const actionMap = {
        view: permission?.canView,
        add: permission?.canAdd,
        edit: permission?.canEdit,
        delete: permission?.canDelete,
        print: permission?.canPrint,
      }

      if (!actionMap[action]) {
        return res.status(403).json({ error: `لا تملك صلاحية ${action} لوحدة ${module}` })
      }

      next()
    } catch (error) {
      return res.status(500).json({ error: 'خطأ في التحقق من الصلاحيات' })
    }
  }
}
