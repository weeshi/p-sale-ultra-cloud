// =====================================================================
// إعداد قاعدة بيانات اختبار التكامل (psale_ultra_test)
// DROP/CREATE + prisma migrate deploy قبل تشغيل jest.integration
// التشغيل: npm run test:integration  (يستدعي هذا السكربت أولاً)
// =====================================================================
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const mysql = require('mysql2/promise')

const serverDir = path.resolve(__dirname, '..')

const envPath = path.join(serverDir, '.env.test')
if (!fs.existsSync(envPath)) {
  console.error('الملف .env.test غير موجود')
  process.exit(1)
}
const envContent = fs.readFileSync(envPath, 'utf8')
const match = envContent.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)
if (!match) {
  console.error('لم يُعثر على DATABASE_URL في .env.test')
  process.exit(1)
}
const databaseUrl = match[1].trim()

// mysql://root@localhost:3306/psale_ultra_test
const parsed = /^mysql:\/\/([^:@/]+)(?::([^@/]+))?@([^:/]+)(?::(\d+))?\/([^?]+)/.exec(databaseUrl)
if (!parsed) {
  console.error('DATABASE_URL غير صالح:', databaseUrl)
  process.exit(1)
}
const [, user, password, host, port, dbName] = parsed

async function main() {
  const conn = await mysql.createConnection({
    host,
    port: Number(port || 3306),
    user,
    password,
    multipleStatements: true,
  })
  await conn.query(
    `DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  )
  await conn.end()
  console.log(`✔ قاعدة \`${dbName}\` أُعيدت تهيئتها (DROP/CREATE)`)

  execSync('npx prisma migrate deploy', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })
  console.log('✔ تم تطبيق الهجرات على قاعدة الاختبار')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
