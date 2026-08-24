import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { connectRealtime, disconnectRealtime, onRealtimeError, onRealtimeEvent, REALTIME_TRANSFER_EVENTS } from '@/lib/realtime'
import { useAuth } from '@/contexts/AuthContext'
import type { TransferNotificationPayload } from '@/types'

export interface RealtimeNotification {
  id: number
  event: string
  message: string
  time: number
}

interface RealtimeContextValue {
  notifications: RealtimeNotification[]
  dismiss: (id: number) => void
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined)

let nextId = 1

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([])
  const lastAuthErrorAt = useRef(0)

  const push = (notification: RealtimeNotification) =>
    setNotifications((prev) => [notification, ...prev].slice(0, 20))

  useEffect(() => {
    if (!user) return

    connectRealtime()

    const offs = REALTIME_TRANSFER_EVENTS.map((event) =>
      onRealtimeEvent(event, (data: TransferNotificationPayload) => {
        push({ id: nextId++, event, message: data?.message ?? event, time: Date.now() })
      })
    )

    // فشل مصادقة الاتصال (توكن منتهي/غير صالح) → تحذير واضح بدل الفشل الصامت (مع منع التكرار)
    const offError = onRealtimeError((err) => {
      const isAuthFailure = /توكن|مصرح|unauthorized|expired|invalid/i.test(err?.message ?? '')
      if (!isAuthFailure) return
      const now = Date.now()
      if (now - lastAuthErrorAt.current < 10000) return
      lastAuthErrorAt.current = now
      push({
        id: nextId++,
        event: 'connect_error',
        message: 'انتهت صلاحية الجلسة — سجّل الدخول من جديد',
        time: now,
      })
    })

    return () => {
      offs.forEach((off) => off())
      offError()
      disconnectRealtime()
    }
  }, [user])

  const dismiss = (id: number) => setNotifications((prev) => prev.filter((n) => n.id !== id))

  return (
    <RealtimeContext.Provider value={{ notifications, dismiss }}>{children}</RealtimeContext.Provider>
  )
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider')
  return ctx
}
