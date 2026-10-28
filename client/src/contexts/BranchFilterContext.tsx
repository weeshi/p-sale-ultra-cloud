import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setAllBranchesByDefault } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { useAuth } from '@/contexts/AuthContext'
import type { Branch } from '@/types'

interface BranchFilterValue {
  branches: Branch[]
  branchLoading: boolean
  selectedBranchId: number | null
  setSelectedBranchId: (id: number | null) => void
  canFilter: boolean
}

const BranchFilterContext = createContext<BranchFilterValue | undefined>(undefined)

export function BranchFilterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const canFilter = !!user?.isSuperAdmin || !!user?.canViewAllBranches
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchLoading, setBranchLoading] = useState(true)
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)

  // يُضبط أثناء التصيير (قبل جلب أي بيانات الأبناء) — "كل الفروع" = branchId=all صراحةً
  setAllBranchesByDefault(canFilter && selectedBranchId == null)

  // عند تغيير المستخدم: السوبر أدمن يبدأ بالكل (null)، وغيره يُقيَّد على فرعه
  useEffect(() => {
    if (user) {
      setSelectedBranchId(canFilter ? null : user.branchId ?? null)
    }
  }, [user, canFilter])

  // جلب قائمة الفروع بعد تسجيل الدخول فقط (قبل الدخول لا يوجد توكن → 401 في الكونسول)
  useEffect(() => {
    if (!user) return
    let mounted = true
    cachedRead<Branch[]>('branches:list', () => api.get('/warehouses/branches').then((r) => r.data), 'branches'
      )
      .then((res) => {
        if (mounted) setBranches(res.data ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setBranchLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [user])

  const value = useMemo(
    () => ({ branches, branchLoading, selectedBranchId, setSelectedBranchId, canFilter }),
    [branches, branchLoading, selectedBranchId, canFilter]
  )

  return <BranchFilterContext.Provider value={value}>{children}</BranchFilterContext.Provider>
}

export function useBranchFilter(): BranchFilterValue {
  const ctx = useContext(BranchFilterContext)
  if (!ctx) throw new Error('useBranchFilter must be used within BranchFilterProvider')
  return ctx
}