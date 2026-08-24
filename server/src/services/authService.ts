import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'
import { CONFIG } from '../config'
import { sequenceService } from './sequenceService'
import { SEQUENCE_PREFIXES } from '../../../shared/constants'

// خدمة المصادقة: تسجيل الدخول والتوكنات
export class AuthService {
  /**
   * تسجيل الدخول
   */
  async login(username: string, password: string, deviceId?: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { company: true, branch: true },
    })

    if (!user) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
    }

    if (!user.isActive) {
      throw new Error('الحساب معطل، تواصل مع مدير النظام')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
    }

    // تحديث آخر دخول
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // الحصول على الصلاحيات
    const permissions = await prisma.permission.findMany({
      where: { userId: user.id },
    })

    const permissionMap = permissions.reduce((acc, p) => {
      acc[p.module] = {
        view: p.canView,
        add: p.canAdd,
        edit: p.canEdit,
        delete: p.canDelete,
        print: p.canPrint,
      }
      return acc
    }, {} as Record<string, any>)

    const accessToken = jwt.sign(
      {
        id: user.id,
        companyId: user.companyId,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        isSuperAdmin: user.isSuperAdmin,
      },
      CONFIG.jwt.secret,
      { expiresIn: CONFIG.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
    )

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      CONFIG.jwt.refreshSecret,
      { expiresIn: CONFIG.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
    )

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company.name,
        branchId: user.branchId,
        branchName: user.branch?.name,
        isSuperAdmin: user.isSuperAdmin,
        permissions: permissionMap,
      },
    }
  }

  /**
   * تحديث التوكن
   */
  async refreshToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, CONFIG.jwt.refreshSecret) as any
      if (decoded.type !== 'refresh') throw new Error('توكن غير صالح')

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      })

      if (!user || !user.isActive) throw new Error('المستخدم غير موجود')

      const accessToken = jwt.sign(
        {
          id: user.id,
          companyId: user.companyId,
          username: user.username,
          role: user.role,
          branchId: user.branchId,
          isSuperAdmin: user.isSuperAdmin,
        },
        CONFIG.jwt.secret,
        { expiresIn: CONFIG.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
      )

      return { accessToken }
    } catch (error) {
      throw new Error('توكن التحديث غير صالح أو منتهي')
    }
  }

  /**
   * إنشاء مستخدم جديد
   */
  async createUser(data: {
    companyId: number
    username: string
    password: string
    fullName: string
    email?: string
    phone?: string
    role: string
    branchId?: number
    isSuperAdmin?: boolean
    permissions?: Array<{
      module: string
      canView: boolean
      canAdd: boolean
      canEdit: boolean
      canDelete: boolean
      canPrint: boolean
    }>
  }) {
    const { permissions = [], ...userData } = data
    const passwordHash = await bcrypt.hash(data.password, 10)

    return prisma.$transaction(async (tx) => {
      const isSuperAdmin = data.isSuperAdmin === true
      if (isSuperAdmin) {
        const existing = await tx.user.count({
          where: { companyId: userData.companyId, isSuperAdmin: true },
        })
        if (existing > 0) throw new Error('الشركة تملك سوبر أدمن بالفعل')
      }

      const user = await tx.user.create({
        data: {
          companyId: userData.companyId,
          username: userData.username,
          passwordHash,
          fullName: userData.fullName,
          email: userData.email,
          phone: userData.phone,
          role: userData.role,
          branchId: userData.branchId,
          isSuperAdmin,
          superAdminKey: isSuperAdmin ? userData.companyId : null,
        },
      })

      if (permissions.length > 0) {
        await tx.permission.createMany({
          data: permissions.map((p) => ({
            userId: user.id,
            ...p,
          })),
        })
      }

      const { passwordHash: _removed, ...safeUser } = user
      return safeUser
    })
  }

  /**
   * تحديث كلمة المرور
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('المستخدم غير موجود')

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new Error('كلمة المرور الحالية غير صحيحة')

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    })

    return { success: true }
  }

  /**
   * إعداد شركة + مستخدم مدير أول (للإعداد الأولي)
   */
  async setup(data: {
    companyName: string
    adminUsername: string
    adminPassword: string
    adminFullName: string
  }) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.user.count()
      if (existing > 0) throw new Error('النظام مهيأ مسبقاً')

      const company = await tx.company.create({
        data: { name: data.companyName },
      })

      // فرع رئيسي
      const mainBranch = await tx.branch.create({
        data: {
          companyId: company.id,
          name: 'الفرع الرئيسي',
          code: 'MAIN',
          isMain: true,
        },
      })

      // مخزن مركزي
      await tx.warehouse.create({
        data: {
          companyId: company.id,
          name: 'المخزن المركزي',
          code: 'CW',
          type: 'central',
        },
      })

      // الدليل المحاسبي الافتراضي
      const defaultAccounts = [
        { code: '1100', name: 'الأصول المتداولة', type: 'asset', terminal: false },
        { code: '1101', name: 'العملاء', type: 'asset' },
        { code: '1102', name: 'المخزون', type: 'asset' },
        { code: '1103', name: 'الخزينة', type: 'asset' },
        { code: '1104', name: 'البنوك', type: 'asset' },
        { code: '1105', name: 'سندات تحت التحصيل', type: 'asset' },
        { code: '1200', name: 'الأصول الثابتة', type: 'asset', terminal: false },
        { code: '1201', name: 'الأثاث والمعدات', type: 'asset' },
        { code: '2100', name: 'الالتزامات المتداولة', type: 'liability', terminal: false },
        { code: '2101', name: 'الموردون', type: 'liability' },
        { code: '2102', name: 'ضريبة القيمة المضافة', type: 'liability' },
        { code: '2103', name: 'مستحقات الموظفين', type: 'liability' },
        { code: '3000', name: 'رأس المال', type: 'equity' },
        { code: '3001', name: 'أرباح مرحلة', type: 'equity' },
        { code: '3002', name: 'أرباح السنة الحالية', type: 'equity' },
        { code: '4100', name: 'الإيرادات', type: 'revenue', terminal: false },
        { code: '4101', name: 'إيرادات المبيعات', type: 'revenue' },
        { code: '4102', name: 'إيرادات الصيانة', type: 'revenue' },
        { code: '5100', name: 'المصاريف', type: 'expense', terminal: false },
        { code: '5101', name: 'تكلفة المبيعات', type: 'expense' },
        { code: '5102', name: 'الرواتب والأجور', type: 'expense' },
        { code: '5103', name: 'الإيجار', type: 'expense' },
        { code: '5104', name: 'الكهرباء والماء', type: 'expense' },
        { code: '5105', name: 'الإنترنت والاتصالات', type: 'expense' },
        { code: '5106', name: 'مصاريف الشحن والجمارك', type: 'expense' },
        { code: '5107', name: 'مصاريف متنوعة', type: 'expense' },
      ]

      for (const acc of defaultAccounts) {
        await tx.account.create({
          data: {
            companyId: company.id,
            accountCode: acc.code,
            accountName: acc.name,
            accountType: acc.type,
            isTerminal: acc.terminal !== false,
          },
        })
      }

      // خزينة افتراضية
      const cashAccount = await tx.account.findFirst({
        where: { companyId: company.id, accountCode: '1103' },
      })
      await tx.treasury.create({
        data: {
          companyId: company.id,
          treasuryName: 'الصندوق الرئيسي',
          treasuryType: 'cash',
          currency: 'LYD',
          accountId: cashAccount?.id,
        },
      })

      // بذر التسلسلات الافتراضية (أرقام فواتير/مستندات لكل شركة)
      for (const prefix of SEQUENCE_PREFIXES) {
        await sequenceService.ensure(company.id, prefix, tx)
      }

      // مستخدم المدير (سوبر أدمن — مسؤول منطقة الخطر، واحد لكل شركة)
      const passwordHash = await bcrypt.hash(data.adminPassword, 10)
      const admin = await tx.user.create({
        data: {
          companyId: company.id,
          username: data.adminUsername,
          passwordHash,
          fullName: data.adminFullName,
          role: 'admin',
          branchId: mainBranch.id,
          isSuperAdmin: true,
          superAdminKey: company.id,
        },
      })

      return { company, admin }
    })
  }
}

export const authService = new AuthService()
