import type { Request } from 'express'
import { resolveBranchScope } from './auth'

jest.mock('../config/database', () => ({ prisma: {} }))

type Actor = { isSuperAdmin?: boolean; canViewAllBranches?: boolean; branchId: number | null }

function req(actor: Actor, query: Record<string, unknown> = {}): Request {
  return {
    user: {
      id: 1,
      companyId: 1,
      username: 'u',
      role: 'manager',
      branchId: actor.branchId,
      isSuperAdmin: !!actor.isSuperAdmin,
      canViewAllBranches: !!actor.canViewAllBranches,
    },
    branchId: actor.branchId,
    query,
  } as unknown as Request
}

const SUPER_GLOBAL: Actor = { isSuperAdmin: true, branchId: null }
const SUPER_IN_BRANCH: Actor = { isSuperAdmin: true, branchId: 2 }
const VIEW_ALL_IN_BRANCH: Actor = { canViewAllBranches: true, branchId: 2 }
const BRANCH_USER: Actor = { branchId: 2 }
const GLOBAL_USER: Actor = { branchId: null }

describe('resolveBranchScope — القرار المعتمد (Safe Default)', () => {
  describe('مستخدم مربوط بفرع يملك صلاحية عرض الكل (canViewAllBranches)', () => {
    it('بلا معامل: يبقى مقيّداً بفرعه (الافتراضي الآمن)', () => {
      expect(resolveBranchScope(req(VIEW_ALL_IN_BRANCH))).toBe(2)
    })
    it('branchId=all صراحةً: يرى كل الفروع', () => {
      expect(resolveBranchScope(req(VIEW_ALL_IN_BRANCH, { branchId: 'all' }))).toBeUndefined()
    })
    it('branchId=رقم آخر: مسموح له بالاختيار', () => {
      expect(resolveBranchScope(req(VIEW_ALL_IN_BRANCH, { branchId: '7' }))).toBe(7)
    })
  })

  describe('سوبر أدمن مربوط بفرع (لا يُعامل كاستثناء من الافتراضي الآمن)', () => {
    it('بلا معامل: مقيّد بفرعه', () => {
      expect(resolveBranchScope(req(SUPER_IN_BRANCH))).toBe(2)
    })
    it('branchId=all: كل الفروع', () => {
      expect(resolveBranchScope(req(SUPER_IN_BRANCH, { branchId: 'all' }))).toBeUndefined()
    })
  })

  describe('سوبر أدمن عالمي (بلا فرع)', () => {
    it('بلا معامل: كل الفروع', () => {
      expect(resolveBranchScope(req(SUPER_GLOBAL))).toBeUndefined()
    })
    it('branchId=all: كل الفروع', () => {
      expect(resolveBranchScope(req(SUPER_GLOBAL, { branchId: 'all' }))).toBeUndefined()
    })
    it('branchId=رقم: الفرع المحدد', () => {
      expect(resolveBranchScope(req(SUPER_GLOBAL, { branchId: '5' }))).toBe(5)
    })
  })

  describe('مستخدم مقيّد بفرع (بلا canViewAllBranches)', () => {
    it('بلا معامل: فرعه', () => {
      expect(resolveBranchScope(req(BRANCH_USER))).toBe(2)
    })
    it('تزوير branchId=رقم آخر: يُجبر على فرعه', () => {
      expect(resolveBranchScope(req(BRANCH_USER, { branchId: '7' }))).toBe(2)
    })
    it('branchId=all: لا يُسمح له بكل الفروع ويبقى على فرعه', () => {
      expect(resolveBranchScope(req(BRANCH_USER, { branchId: 'all' }))).toBe(2)
    })
  })

  describe('مستخدم عالمي بلا فرع وبلا صلاحيات خاصة', () => {
    it('بلا معامل: كل الفروع', () => {
      expect(resolveBranchScope(req(GLOBAL_USER))).toBeUndefined()
    })
    it('branchId=رقم: مسموح', () => {
      expect(resolveBranchScope(req(GLOBAL_USER, { branchId: '3' }))).toBe(3)
    })
    it('branchId=all: كل الفروع', () => {
      expect(resolveBranchScope(req(GLOBAL_USER, { branchId: 'all' }))).toBeUndefined()
    })
  })

  describe('مدخلات غير سليمة', () => {
    it('قيمة نصية غير رقمية لمستخدم مقيّد: يبقى على فرعه', () => {
      expect(resolveBranchScope(req(BRANCH_USER, { branchId: 'abc' }))).toBe(2)
    })
    it('قيمة نصية غير رقمية لمستخدم عالمي: كل الفروع (لا NaN)', () => {
      expect(resolveBranchScope(req(GLOBAL_USER, { branchId: 'abc' }))).toBeUndefined()
    })
    it('سلسلة فارغة تُعامل كغياب المعامل', () => {
      expect(resolveBranchScope(req(VIEW_ALL_IN_BRANCH, { branchId: '' }))).toBe(2)
      expect(resolveBranchScope(req(GLOBAL_USER, { branchId: '' }))).toBeUndefined()
    })
  })
})
