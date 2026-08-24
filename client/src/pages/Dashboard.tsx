import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import { useAuth } from '@/contexts/AuthContext'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { useSync } from '@/contexts/SyncContext'
import type { DashboardData } from '@/types'

const fmt = (n: number) => new Intl.NumberFormat('ar-LY', { maximumFractionDigits: 2 }).format(n)

interface KpiCard {
  label: string
  value: string
  sub?: string
  icon: string
  color: string
  bg: string
  border: string
}

export default function Dashboard() {
  const { user } = useAuth()
  const { online } = useSync()
  const { selectedBranchId } = useBranchFilter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const branchParam = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
        const res = await cachedRead<DashboardData>(`dashboard:${selectedBranchId ?? 'all'}`, () =>
          api.get<DashboardData>(`/reports/dashboard${branchParam}`).then((r) => r.data), 'dashboard'
        )
        if (mounted) {
          setData(res.data)
          setFromCache(res.fromCache)
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [selectedBranchId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">جارٍ التحميل...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="card text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  const s = data?.stats
  const kpis: KpiCard[] = s
    ? [
        {
          label: 'مبيعات اليوم',
          value: `${fmt(s.salesToday)} د.ل`,
          sub: `${s.invoiceCountToday} فاتورة`,
          icon: '💵',
          color: 'text-green-700',
          bg: 'bg-green-50',
          border: 'border-green-200',
        },
        {
          label: 'الخزينة المتاحة',
          value: `${fmt(s.treasuryBalance)} د.ل`,
          icon: '💰',
          color: 'text-emerald-700',
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
        },
        {
          label: 'ديون العملاء',
          value: `${fmt(s.totalReceivables)} د.ل`,
          sub: s.overdueCount > 0 ? `${s.overdueCount} متأخرة` : 'الكل آجل',
          icon: '📋',
          color: s.overdueCount > 0 ? 'text-red-700' : 'text-amber-700',
          bg: s.overdueCount > 0 ? 'bg-red-50' : 'bg-amber-50',
          border: s.overdueCount > 0 ? 'border-red-200' : 'border-amber-200',
        },
        {
          label: 'أصناف منخفضة',
          value: `${s.lowStockCount}`,
          icon: '⚠️',
          color: s.lowStockCount > 0 ? 'text-orange-700' : 'text-slate-500',
          bg: s.lowStockCount > 0 ? 'bg-orange-50' : 'bg-slate-50',
          border: s.lowStockCount > 0 ? 'border-orange-200' : 'border-slate-200',
        },
        {
          label: 'مبيعات الشهر',
          value: `${fmt(s.salesThisMonth)} د.ل`,
          icon: '📈',
          color: 'text-blue-700',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
        },
        {
          label: 'مشتريات الشهر',
          value: `${fmt(s.purchasesThisMonth)} د.ل`,
          icon: '📦',
          color: 'text-purple-700',
          bg: 'bg-purple-50',
          border: 'border-purple-200',
        },
      ]
    : []

  return (
    <div className="p-6 pb-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">لوحة المعلومات</h1>
          <p className="text-sm text-slate-500">مرحباً، {user?.fullName} 👋</p>
        </div>
        {(!online || fromCache) && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
            📴 وضع عدم الاتصال — بيانات مخزنة
          </span>
        )}
      </div>

      {/* ===== بطاقات KPI ===== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl border ${k.border} ${k.bg} p-4 transition-shadow hover:shadow-md`}>
            <div className="mb-2 text-2xl">{k.icon}</div>
            <p className="text-[11px] font-medium text-slate-500">{k.label}</p>
            <p className={`text-lg font-extrabold ${k.color}`}>{k.value}</p>
            {k.sub && <p className="mt-0.5 text-[10px] text-slate-400">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* ===== جداول ===== */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">أحدث الفواتير</h2>
            <Link to="/sales" className="text-sm font-medium text-brand-700 hover:underline">
              كل الفواتير ←
            </Link>
          </div>
          {data && data.recentInvoices.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد فواتير بعد</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>العميل</th>
                  <th>التاريخ</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-mono text-xs">{inv.invoiceNumber}</td>
                    <td>{inv.partyName || '—'}</td>
                    <td>{new Date(inv.invoiceDate).toLocaleDateString('ar')}</td>
                    <td>{fmt(inv.total)} د.ل</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        inv.paymentStatus === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : inv.paymentStatus === 'partial'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}>
                        {inv.paymentStatus === 'paid' ? 'مدفوع' : inv.paymentStatus === 'partial' ? 'جزئي' : 'غير مدفوع'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold text-slate-800">تنبيهات المخزون</h2>
          {data && data.lowStockItems.length === 0 ? (
            <p className="text-sm text-slate-400">المخزون جيد ✅</p>
          ) : (
            <ul className="space-y-2">
              {data?.lowStockItems.map((it, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <span>
                    {it.itemName} <span className="text-xs text-slate-500">({it.warehouse})</span>
                  </span>
                  <span className="font-semibold text-amber-700">
                    {fmt(it.quantity)} / الحد الأدنى {fmt(it.minStock)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
