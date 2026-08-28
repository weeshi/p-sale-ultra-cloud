import { useState, useRef, useEffect } from 'react'
import { useRealtime, type NotificationPriority } from '@/contexts/RealtimeContext'

const PRIORITY_CONFIG: Record<NotificationPriority, { icon: string; label: string; color: string }> = {
  urgent: { icon: '🔴', label: 'عاجل', color: 'text-red-700 bg-red-50 border-red-200' },
  important: { icon: '🟠', label: 'مهم', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  normal: { icon: '🔵', label: 'عادي', color: 'text-blue-700 bg-blue-50 border-blue-200' },
}

const EVENT_ICON: Record<string, string> = {
  'connect_error': '⚠️',
  'transfer:created': '📦',
  'transfer:approved': '✅',
  'transfer:received': '📥',
  'transfer:rejected': '❌',
  'transfer:cancelled': '🚫',
}

export default function NotificationBell() {
  const { notifications, unreadCount, dismiss, markAllRead, clearAll, filterByPriority } = useRealtime()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<NotificationPriority | 'all'>('all')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = filterByPriority(filter)

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead() }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        title="الإشعارات"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">
              الإشعارات {unreadCount > 0 && <span className="text-red-600">({unreadCount} جديدة)</span>}
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                مسح الكل
              </button>
            )}
          </div>

          <div className="flex gap-1 border-b border-slate-100 px-3 py-2">
            {(['all', 'urgent', 'important', 'normal'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === p
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p === 'all' ? 'الكل' : PRIORITY_CONFIG[p].icon + ' ' + PRIORITY_CONFIG[p].label}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                {notifications.length === 0 ? 'لا توجد إشعارات' : 'لا إشعارات في هذا التصنيف'}
              </div>
            ) : (
              filtered.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-slate-50 px-4 py-3 transition-colors hover:bg-slate-50 ${
                    !n.read ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <span className="mt-0.5 text-lg">{EVENT_ICON[n.event] ?? PRIORITY_CONFIG[n.priority].icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_CONFIG[n.priority].color}`}>
                        {PRIORITY_CONFIG[n.priority].label}
                      </span>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{new Date(n.time).toLocaleString('ar')}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                    className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                    title="حذف"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 text-center">
            <span className="text-xs text-slate-400">آخر {notifications.length} إشعار</span>
          </div>
        </div>
      )}
    </div>
  )
}
