import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database'

export async function auditLog(
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'SECURITY_EVENT',
  tableName: string,
  recordId: number | undefined,
  oldValues?: unknown,
  newValues?: unknown,
  eventType?: string
) {
  const req = (global as any).currentRequest as Request
  try {
    await prisma.auditLog.create({
      data: {
        companyId: (req as any).companyId || 0,
        userId: (req as any).user?.id || null,
        action,
        tableName,
        recordId,
        eventType,
        oldValues: oldValues ? JSON.stringify(oldValues) : null,
        newValues: newValues ? JSON.stringify(newValues) : null,
        ipAddress: req?.ip || null,
      },
    })
  } catch (error) {
    console.error('Audit log error:', error)
  }
}

/** تسجيل حدث أمني (تزوير هوية / وصول فرع مرفوض) في سجل التدقيق */
export async function logSecurityEvent(
  eventType: 'IDENTITY_TAMPERING' | 'BRANCH_ACCESS_DENIED',
  message: string,
  actor?: { companyId: number; userId: number } | null
) {
  const req = (global as any).currentRequest as Request | undefined
  try {
    await prisma.auditLog.create({
      data: {
        companyId: actor?.companyId ?? req?.companyId ?? 0,
        userId: actor?.userId ?? (req as any)?.user?.id ?? null,
        action: 'SECURITY_EVENT',
        tableName: 'security',
        recordId: null,
        eventType,
        newValues: JSON.stringify({ message }),
        ipAddress: req?.ip || null,
      },
    })
  } catch (error) {
    console.error('Audit security log error:', error)
  }
}

export function auditMiddleware(
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  tableName: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    (global as any).currentRequest = req
    next()
  }
}
