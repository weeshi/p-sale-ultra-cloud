import { io, type Socket } from 'socket.io-client'
import { API_ORIGIN, getAccessToken } from '@/lib/api'
import type { TransferNotificationPayload } from '@/types'

type Handler = (data: TransferNotificationPayload) => void
type ErrorHandler = (err: Error) => void

let socket: Socket | null = null

// سجل المُرتَبِطين (بحيث لا نفقد الاشتراكات عند إعادة الاتصال)
const registry = new Map<string, Set<Handler>>()
const errorHandlers = new Set<ErrorHandler>()

function bindAllHandlers() {
  if (!socket) return
  for (const [event, handlers] of registry) {
    for (const h of handlers) socket.on(event, h)
  }
  for (const h of errorHandlers) socket.on('connect_error', h)
}

/**
 * الاتصال بالخادم — الغرف (company/branch) تُشتق من التوكن تلقائياً على الخادم
 * لا يُرسل أي room-id من العميل (إزالة سطح الهجوم)
 */
export function connectRealtime() {
  disconnectRealtime()
  // الاتصال بأصل الخادم (وليس أصل الصفحة): في التطوير/preview الواجهة على 5175
  // والخادم على 3005، فالاتصال النسبي 'ws://localhost:5175/socket.io' يفشل دائماً.
  socket = io(API_ORIGIN, {
    transports: ['websocket', 'polling'],
    auth: { token: getAccessToken() ?? undefined },
  })
  bindAllHandlers()
  return socket
}

export function disconnectRealtime() {
  socket?.disconnect()
  socket = null
}

/** الاشتراك في حدث لحظي — يعيد دالة إلغاء الاشتراك */
export function onRealtimeEvent(event: string, cb: Handler): () => void {
  const set = registry.get(event) ?? new Set()
  set.add(cb)
  registry.set(event, set)
  socket?.on(event, cb)
  return () => {
    set.delete(cb)
    socket?.off(event, cb)
  }
}

/** الاشتراك في أخطاء الاتصال (مثل انتهاء صلاحية التوكن) — يعيد دالة إلغاء الاشتراك */
export function onRealtimeError(cb: ErrorHandler): () => void {
  errorHandlers.add(cb)
  socket?.on('connect_error', cb)
  return () => {
    errorHandlers.delete(cb)
    socket?.off('connect_error', cb)
  }
}

export const REALTIME_TRANSFER_EVENTS = [
  'transfer:created',
  'transfer:approved',
  'transfer:received',
  'transfer:cancelled',
  'transfer:rejected',
] as const
