import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { useRealtime } from '@/contexts/RealtimeContext'
import OfflineWarningBanner from '@/components/OfflineWarningBanner'
import WarningModal from '@/components/WarningModal'
import BranchFilterSelect from '@/components/BranchFilterSelect'
import { clearAllCacheVersions } from '@/lib/cacheVersion'
import { useState } from 'react'

const NAV_ITEMS = [
  { to: '/', label: 'لوحة المعلومات', icon: '📊', end: true },
  { to: '/sales', label: 'المبيعات', icon: '🧾' },
  { to: '/purchases', label: 'المشتريات', icon: '📦' },
  { to: '/items', label: 'الأصناف', icon: '🏷️' },
  { to: '/parties', label: 'العملاء والموردون', icon: '👥' },
  { to: '/inventory', label: 'المخزون', icon: '🏭' },
  { to: '/treasury', label: 'الخزينة', icon: '💰' },
  { to: '/accounting', label: 'المحاسبة', icon: '📒' },
  { to: '/reports', label: 'التقارير', icon: '📈' },
  { to: '/settings', label: 'الإعدادات', icon: '⚙️' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { online, syncing, pending, synced, lastSyncAt, conflicts, syncNow, retry, discard, storageLevel, storagePercent, setShowWarningModal } = useSync()
  const { notifications, dismiss } = useRealtime()
  const navigate = useNavigate()
  const [syncOpen, setSyncOpen] = useState(false)

  const openSync = () => {
    if (!syncOpen) syncNow()
    setSyncOpen(true)
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-l border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
          <span className="text-2xl">🛒</span>
          <div>
            <h1 className="font-extrabold text-brand-800">P-Sale Ultra</h1>
            <p className="text-xs text-slate-500">إدارة المبيعات والمخازن</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-50 font-semibold text-brand-800'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

<div className="border-t border-slate-200 p-3">
            <BranchFilterSelect />

            <button
            onClick={openSync}
            className="mb-2 flex w-full items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 hover:bg-slate-200"
            title="حالة المزامنة"
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
              />
              {syncing ? 'مزامنة...' : online ? 'متصل' : 'غير متصل'}
            </span>
            {pending > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                {pending}
              </span>
            )}
          </button>

          {/* زر تحذير — تعليمات تنظيف المتصفح والإنترنت (سطح المكتب) */}
          <button
            onClick={() => setShowWarningModal(true)}
            className={`mb-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              storageLevel === 'critical'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
            title="تعليمات مهمة"
          >
            <span className="flex items-center gap-1.5">
              {storageLevel === 'critical' ? '🚨' : '⚠️'} تحذير — تعليمات مهمة
            </span>
            {storagePercent > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 ${
                  storageLevel === 'critical' ? 'bg-white/25' : 'bg-red-100'
                }`}
              >
                {Math.round(storagePercent)}%
              </span>
            )}
          </button>

          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-700">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-500">{user?.branchName || user?.companyName}</p>
            </div>
            <button
              onClick={() => {
                logout()
                navigate('/login')
              }}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
              title="تسجيل الخروج"
            >
              ⏻
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-50">
        {/* هيدر الموبايل */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛒</span>
            <div>
              <h1 className="text-sm font-extrabold text-brand-800">P-Sale Ultra</h1>
              <p className="text-[10px] text-slate-500">{user?.branchName || user?.companyName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-40">
              <BranchFilterSelect />
            </div>
            <span
              className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
              title={online ? 'متصل' : 'غير متصل'}
            />
            <button
              onClick={() => setShowWarningModal(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                storageLevel === 'critical'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
              title="تعليمات مهمة"
            >
              {storageLevel === 'critical' ? '🚨' : '⚠️'} تحذير
            </button>
          </div>
        </header>

        {/* إشعارات لحظية */}
        {notifications.length > 0 && (
          <div className="pointer-events-none fixed left-4 top-4 z-50 flex w-80 flex-col gap-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="pointer-events-auto flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
              >
                <span className="text-lg">{n.event === 'connect_error' ? '⚠️' : '🔔'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{n.message}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(n.time).toLocaleTimeString('ar')}
                  </p>
                </div>
                <button
                  onClick={() => dismiss(n.id)}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="إغلاق"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {syncOpen && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
            onClick={() => setSyncOpen(false)}
          >
            <div className="card w-[26rem] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold">حالة المزامنة</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {online ? 'متصل' : 'غير متصل'}
                </span>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <p>⏳ عمليات معلقة: <b className="text-slate-900">{pending}</b></p>
                <p>✅ عمليات مزامنة: <b className="text-slate-900">{synced}</b></p>
                <p>
                  🕒 آخر مزامنة:{' '}
                  <b className="text-slate-900">
                    {lastSyncAt ? new Date(lastSyncAt).toLocaleString('ar') : 'لم تتم بعد'}
                  </b>
                </p>
              </div>

              {conflicts.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-bold text-red-700">
                    ⚠️ تعارضات — {conflicts.length}
                  </h4>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {conflicts.map((c) => (
                      <div key={c.id} className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-red-800">
                            {c.entity} (id: {c.recordId}) — {c.action}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => retry(c.id!)}
                              className="rounded bg-brand-600 px-2 py-0.5 text-white hover:bg-brand-700"
                            >
                              إعادة
                            </button>
                            <button
                              onClick={() => discard(c.id!)}
                              className="rounded bg-slate-300 px-2 py-0.5 text-slate-700 hover:bg-slate-400"
                            >
                              تجاهل
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-red-600">{c.error}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={async () => {
                    await clearAllCacheVersions()
                    await syncNow()
                    window.location.reload()
                  }}
                  disabled={syncing || !online}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {syncing ? 'جارٍ المزامنة...' : '🔄 تحديث قسري'}
                </button>
                <button
                  onClick={() => syncNow()}
                  disabled={syncing || !online}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {syncing ? 'جارٍ المزامنة...' : 'مزامنة الآن'}
                </button>
                <button onClick={() => setSyncOpen(false)} className="btn-secondary flex-1">
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}
        <Outlet />
      </main>
      <OfflineWarningBanner />
      <WarningModal />
    </div>
  )
}
