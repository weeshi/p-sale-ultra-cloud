import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { connectRealtime, disconnectRealtime, onRealtimeError, onRealtimeEvent, REALTIME_TRANSFER_EVENTS } from '@/lib/realtime'
import { useAuth } from '@/contexts/AuthContext'
import type { TransferNotificationPayload } from '@/types'

export type NotificationPriority = 'urgent' | 'important' | 'normal'

export interface RealtimeNotification {
  id: number
  event: string
  message: string
  time: number
  priority: NotificationPriority
  read: boolean
}

interface RealtimeContextValue {
  notifications: RealtimeNotification[]
  unreadCount: number
  dismiss: (id: number) => void
  markRead: (id: number) => void
  markAllRead: () => void
  clearAll: () => void
  filterByPriority: (p: NotificationPriority | 'all') => RealtimeNotification[]
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined)

let nextId = 1

function classifyEvent(event: string): NotificationPriority {
  if (event === 'connect_error') return 'urgent'
  if (event === 'transfer:received' || event === 'transfer:rejected') return 'urgent'
  if (event === 'transfer:created' || event === 'transfer:approved' || event === 'transfer:cancelled') return 'important'
  return 'normal'
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([])
  const lastAuthErrorAt = useRef(0)

  const push = (event: string, message: string) =>
    setNotifications((prev) => [
      { id: nextId++, event, message, time: Date.now(), priority: classifyEvent(event), read: false },
      ...prev,
    ].slice(0, 50))

  useEffect(() => {
    if (!user) return

    connectRealtime()

    const offs = REALTIME_TRANSFER_EVENTS.map((event) =>
      onRealtimeEvent(event, (data: TransferNotificationPayload) => {
        push(event, data?.message ?? event)
      })
    )

    const offError = onRealtimeError((err) => {
      const isAuthFailure = /توكن|مصرح|unauthorized|expired|invalid/i.test(err?.message ?? '')
      if (!isAuthFailure) return
      const now = Date.now()
      if (now - lastAuthErrorAt.current < 10000) return
      lastAuthErrorAt.current = now
      push('connect_error', 'انتهت صلاحية الجلسة — سجّل الدخول من جديد')
    })

    return () => {
      offs.forEach((off) => off())
      offError()
      disconnectRealtime()
    }
  }, [user])

  const unreadCount = notifications.filter((n) => !n.read).length

  const dismiss = (id: number) => setNotifications((prev) => prev.filter((n) => n.id !== id))

  const markRead = (id: number) =>
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))

  const clearAll = () => setNotifications([])

  const filterByPriority = (p: NotificationPriority | 'all') =>
    p === 'all' ? notifications : notifications.filter((n) => n.priority === p)

  return (
    <RealtimeContext.Provider value={{ notifications, unreadCount, dismiss, markRead, markAllRead, clearAll, filterByPriority }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider')
  return ctx
}
