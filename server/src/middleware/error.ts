import { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import logger from '../config/logger'

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز عدد الطلبات المسموح، حاول لاحقاً' },
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // في الإنتاج حد صارم (20 محاولة)؛ في التطوير/الاختبار حد واسع حتى لا تحجب اختبارات E2E
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات دخول كثيرة، حاول بعد 15 دقيقة' },
})

// سجل طلبات HTTP مع زمن الاستجابة (مستوى http في winston)
export function httpLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime()
  res.on('finish', () => {
    const [s, ns] = process.hrtime(start)
    const durationMs = (s * 1000 + ns / 1e6).toFixed(1)
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`)
  })
  next()
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error(`${req.method} ${req.originalUrl} ${err.stack || err.message}`)

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message })
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'السجل موجود مسبقاً (قيمة مكررة)' })
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'السجل غير موجود' })
    }
  }

  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'خطأ في الخادم' : err.message,
  })
}

export function notFound(req: Request, res: Response) {
  return res.status(404).json({ error: `المسار ${req.originalUrl} غير موجود` })
}
