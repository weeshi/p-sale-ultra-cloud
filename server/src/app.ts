import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import http from 'http'
import { CONFIG } from './config'
import { prisma } from './config/database'
import logger from './config/logger'
import { apiLimiter, authLimiter, errorHandler, httpLogger, notFound } from './middleware/error'
import { initRealtime } from './realtime'

// استيراد المسارات
import authRoutes from './routes/auth'
import itemRoutes from './routes/items'
import partyRoutes from './routes/parties'
import accountRoutes from './routes/accounts'
import saleRoutes from './routes/sales'
import purchaseRoutes from './routes/purchases'
import treasuryRoutes from './routes/treasury'
import journalRoutes from './routes/journal'
import reportRoutes from './routes/reports'
import syncRoutes from './routes/sync'
import warehouseRoutes from './routes/warehouses'
import transferRoutes from './routes/transfers'
import inventoryRoutes from './routes/inventory'
import warrantyRoutes from './routes/warranty'
import barcodeRoutes from './routes/barcode'
import notificationRoutes from './routes/notifications'
import exchangeRoutes from './routes/exchange'
import settingsRoutes from './routes/settings'

const app = express()
const server = http.createServer(app)
initRealtime(server)

// خلف reverse proxy في الإنتاج: يثق بترويسات X-Forwarded-For ليحسب req.ip والـ rate-limit بشكل صحيح
if (CONFIG.nodeEnv === 'production') {
  app.set('trust proxy', 1)
}

// وسائط عامة
app.use(helmet())
app.use(
  cors({
    origin(origin, callback) {
      if (CONFIG.nodeEnv !== 'production' || !origin) return callback(null, true)
      if (CONFIG.frontendOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('CORS origin not allowed'))
    },
    credentials: true,
  })
)
app.use(compression())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// مسارات عامة
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      status: 'ok',
      db: 'connected',
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'dev',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      db: 'disconnected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  }
})

// المسارات
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/items', itemRoutes)
app.use('/api/parties', partyRoutes)
app.use('/api/accounts', accountRoutes)
app.use('/api/sales', saleRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/treasury', treasuryRoutes)
app.use('/api/journal', journalRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/warehouses', warehouseRoutes)
app.use('/api/transfers', transferRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/warranty', warrantyRoutes)
app.use('/api/barcode', barcodeRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/exchange', exchangeRoutes)
app.use('/api/settings', settingsRoutes)

app.use('/api', apiLimiter)

// WebSocket للتحديثات اللحظية — يعالج initRealtime الاتصالات وغرف الشركة/الفروع

// إشعارات المزامنة اللحظية (توافق مع الواجهة السابقة)
export { emitSyncEvent } from './realtime'

// معالجة الأخطاء
app.use(httpLogger)
app.use(notFound)
app.use(errorHandler)

// مرونة العملية: لا تُسقِط الخادم عند خطأ غير معالج
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason)
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err)
})

// بدء الخادم
async function startServer() {
  try {
    await prisma.$connect()
    logger.info('Database connected successfully')

    server.listen(CONFIG.port, () => {
      logger.info(`P-Sale Ultra Cloud server running on port ${CONFIG.port}`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// بدء الخادم عند التشغيل المباشر فقط (وليس عند استيراد app في اختبارات التكامل)
if (require.main === module) {
  startServer()
}

export default app
