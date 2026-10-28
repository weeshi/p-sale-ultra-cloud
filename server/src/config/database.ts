import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'error' },
            { emit: 'stdout', level: 'query' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  })

  // خفض الضجيج: خطأ P2002 على حجوزات المزامنة متوقع في سباق التزامن (طلب خاسر) ولا يمثل خللاً
  const onError = (event: { message?: string }) => {
    const message = event?.message ?? ''
    if (message.includes('Unique constraint failed') && message.includes('sync_operations')) return
    console.error('[prisma]', message || event)
  }
  ;(client as unknown as { $on: (event: string, cb: (e: unknown) => void) => void }).$on('error', onError as never)

  return client
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
