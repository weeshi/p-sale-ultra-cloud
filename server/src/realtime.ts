import http from 'http'
import { Server, type Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { CONFIG } from './config'
import logger from './config/logger'
import type { AuthUser } from './middleware/auth'

let io: Server | null = null

/**
 * مصادقة اتصالات Socket.IO عبر JWT:
 * يتحقق من التوكن في handshake.auth.token ويخزّن المستخدم الموثق في socket.data.user
 * الغرف تُشتق من التوكن الموثق فقط — لا تُقبل معاملات rooms من العميل (إزالة سطح الهجوم)
 */
function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  const auth = socket.handshake.auth as { token?: string } | undefined
  const token = auth?.token
  if (!token) return next(new Error('غير مصرح بالدخول'))
  try {
    const decoded = jwt.verify(token, CONFIG.jwt.secret) as AuthUser
    socket.data.user = decoded
    next()
  } catch {
    next(new Error('توكن غير صالح أو منتهي'))
  }
}

/**
 * تهيئة Socket.IO: غرف الشركة `company_{companyId}` + غرف الفروع `branch_{companyId}_{branchId}`
 * الانضمام تلقائي وصامت من التوكن الموثق — لا أحداث join/leave من العميل
 */
export function initRealtime(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (CONFIG.nodeEnv !== 'production' || !origin) return callback(null, true)
        if (CONFIG.frontendOrigins.includes(origin)) return callback(null, true)
        return callback(new Error('CORS origin not allowed'))
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  })

  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser | undefined
    if (!user) {
      socket.disconnect(true)
      return
    }

    socket.join(`company_${user.companyId}`)
    if (user.branchId) socket.join(`branch_${user.companyId}_${user.branchId}`)

    logger.info(`Socket connected (company ${user.companyId}, branch ${user.branchId}):`, socket.id)

    socket.on('disconnect', () => {
      logger.info('Socket disconnected:', socket.id)
    })
  })

  return io
}

/** إرسال حدث لكل مستخدمي الشركة */
export function emitCompany(companyId: number, event: string, data: unknown) {
  io?.to(`company_${companyId}`).emit(event, data)
}

/** إرسال حدث لغرفة فرع محدد */
export function emitBranch(companyId: number, branchId: number, event: string, data: unknown) {
  io?.to(`branch_${companyId}_${branchId}`).emit(event, data)
}

// توافق مع الواجهة القديمة (emitSyncEvent كانت في app.ts)
export const emitSyncEvent = emitCompany

export type TransferAction = 'created' | 'approved' | 'received' | 'cancelled' | 'rejected'

export interface TransferNotificationPayload {
  action: TransferAction
  transferId: number
  transferNumber: string
  transferType: string
  fromWarehouseId: number
  toWarehouseId: number
  fromWarehouseName: string | null
  toWarehouseName: string | null
  message: string
}

const ACTION_LABEL: Record<TransferAction, string> = {
  created: 'تم إنشاؤه',
  approved: 'تم اعتماده',
  received: 'تم استلامه',
  cancelled: 'تم إلغاؤه',
  rejected: 'تم رفضه',
}

// كائن التحويل الجاهز من الخدمة (مع from/toWarehouse.branchId) — يكفي للإشعار بلا استعلام DB
interface TransferLike {
  id: number
  companyId: number
  transferNumber: string
  transferType: string
  fromWarehouseId: number
  toWarehouseId: number
  fromWarehouse?: { name: string | null; branchId: number | null } | null
  toWarehouse?: { name: string | null; branchId: number | null } | null
}

/**
 * إشعار فوري بحركات التحويلات/الطلبات الداخلية
 * يستقبل كائن التحويل الجاهز (مع from/toWarehouse.branchId) — بلا استعلام DB إضافي
 * يُرسل إلى: غرفة الشركة + غرفتي فرع المخزن المصدر والهدف (إن وُجدتا)
 * (fire-and-forget — لا يحجب الاستجابة)
 */
export function notifyTransfer(transfer: TransferLike, action: TransferAction) {
  try {
    const payload: TransferNotificationPayload = {
      action,
      transferId: transfer.id,
      transferNumber: transfer.transferNumber,
      transferType: transfer.transferType,
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      fromWarehouseName: transfer.fromWarehouse?.name ?? null,
      toWarehouseName: transfer.toWarehouse?.name ?? null,
      message: `${transfer.transferNumber} — ${ACTION_LABEL[action] ?? action}`,
    }

    emitCompany(transfer.companyId, `transfer:${action}`, payload)

    const branchIds = new Set<number>()
    if (transfer.fromWarehouse?.branchId) branchIds.add(transfer.fromWarehouse.branchId)
    if (transfer.toWarehouse?.branchId) branchIds.add(transfer.toWarehouse.branchId)
    for (const branchId of branchIds) {
      emitBranch(transfer.companyId, branchId, `transfer:${action}`, payload)
    }
  } catch (err) {
    logger.error('notifyTransfer failed:', err)
  }
}
