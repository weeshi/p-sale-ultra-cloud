# دليل التثبيت المحلي — Windows (XAMPP + PM2)

> **البيئة المستهدفة**: Windows 10/11 Pro/Enterprise
> **قاعدة البيانات**: MariaDB (عبر XAMPP)
> **تشغيل العمليات**: PM2 (Windows Service)
> **المنافذ**: API `3005` | Frontend `5175` | DB `3306`

---

## 1. المتطلبات المسبقة

| البرنامج | الإصدار الأدنى | رابط التحميل |
|----------|---------------|-------------|
| **Node.js** | 20.x LTS | https://nodejs.org/ |
| **XAMPP** | 8.2+ (MariaDB 10.6+) | https://www.apachefriends.org/ |
| **Git** | 2.40+ | https://git-scm.com/ |
| **PM2** | 5.x (عالمي) | `npm i -g pm2` |
| **PM2 Windows Startup** | 1.x | `npm i -g pm2-windows-startup` |

> ⚠️ **مهم**: ثبّت Node.js **قبل** XAMPP لتجنب تضارب `PATH`.

---

## 2. إعداد قاعدة البيانات (XAMPP / MariaDB)

### 2.1 تشغيل MySQL
1. افتح **XAMPP Control Panel** → Start **MySQL**
2. تأكد من المنفذ `3306` (الافتراضي)
3. اختبر الاتصال:
   ```cmd
   C:\xampp\mysql\bin\mysql.exe -u root -p
   -- ادخل بدون كلمة مرور (افتراضي XAMPP)
   ```

### 2.2 إنشاء قاعدة البيانات والمستخدم
```sql
-- في mysql shell أو phpMyAdmin
CREATE DATABASE IF NOT EXISTS `psale_ultra` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'psale'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON `psale_ultra`.* TO 'psale'@'localhost';
FLUSH PRIVILEGES;
```

---

## 3. استنساخ المشروع وإعداد البيئة

```cmd
cd C:\
git clone https://github.com/weeshi/p-sale-ultra-cloud.git
cd p-sale-ultra-cloud
```

### 3.1 ملفات البيئة
```cmd
copy server\.env.example server\.env
copy client\.env.example client\.env
```

### 3.2 تحرير `server/.env`
```ini
# Server
NODE_ENV=development
PORT=3005
HOST=0.0.0.0

# Database (MariaDB via XAMPP)
DATABASE_URL="mysql://psale:StrongPassword123!@localhost:3306/psale_ultra?schema=public"

# JWT (غيرها في الإنتاج!)
JWT_ACCESS_SECRET="dev-access-secret-change-me-32chars-min"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me-32chars-min"
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# CORS
CORS_ORIGIN=http://localhost:5175

# Sync / Offline
SYNC_BATCH_SIZE=100
```

### 3.3 تحرير `client/.env`
```ini
VITE_API_URL=http://localhost:3005
VITE_WS_URL=ws://localhost:3005
VITE_APP_NAME=P-Sale Ultra
```

---

## 4. تثبيت التبعيات والبناء

### 4.1 Backend
```cmd
cd server
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
cd ..
```

### 4.2 Frontend
```cmd
cd client
npm ci
npm run build
cd ..
```

---

## 5. تشغيل الخدمات عبر PM2

### 5.1 ملف التكوين `ecosystem.config.cjs` (موجود في الجذر)
```js
module.exports = {
  apps: [
    {
      name: 'psale-server',
      script: 'tsx',
      args: 'watch src/app.ts',
      cwd: 'C:\\p-sale-ultra-cloud\\server',
      env: { NODE_ENV: 'development', PORT: '3005' },
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'psale-client',
      script: 'npx',
      args: 'vite preview --port 5175 --host',
      cwd: 'C:\\p-sale-ultra-cloud\\client',
      env: { NODE_ENV: 'production' },
      watch: false,
      max_memory_restart: '300M'
    }
  ]
};
```

### 5.2 بدء الخدمات
```cmd
pm2 start ecosystem.config.cjs
pm2 save
```

### 5.3 تسجيل التشغيل التلقائي مع Windows
```cmd
pm2-startup install
pm2 save
```
> هذا ينشئ مهمة في `Task Scheduler` تشغّل PM2 عند تسجيل دخول المستخدم.

---

## 6. التحقق من الصحة (Health Check)

```cmd
# API
curl http://localhost:3005/api/health
# يجب أن يعيد: {"status":"ok","db":"connected","uptime":...}

# Frontend
curl -I http://localhost:5175
# يجب أن يعيد: HTTP/1.1 200 OK
```

### واجهة PM2
```cmd
pm2 status
pm2 logs psale-server
pm2 logs psale-client
```

---

## 7. النسخ الاحتياطي والاستعادة (Windows)

### 7.1 نسخ احتياطي يدوي
```cmd
scripts\backup.ps1
```
> ينتج ملف `backups/psale_psale_ultra_YYYYMMDD_HHMMSS.sql.gz`

### 7.2 استعادة
```cmd
scripts\restore-manager.ps1
```
> يعرض قائمة النسخ، يفحص السلامة، ينشئ نسخة أمان قبل الاستعادة.

### 7.3 جدولة يومية (Task Scheduler)
مهمة `PSaleUltraDailyBackup` مسجلة تلقائياً عند تشغيل `scripts/win/start.ps1` — يومياً 02:00 صباحاً.

---

## 8. استكشاف الأخطاء الشائعة

| المشكلة | الحل |
|----------|-------|
| `ECONNREFUSED 3306` | تأكد أن MySQL يعمل في XAMPP |
| `Access denied for user 'psale'` | تحقق من `DATABASE_URL` وكلمة المرور |
| `pm2: command not found` | `npm i -g pm2` ثم أعد تشغيل التيرمينال |
| `Port 3005 already in use` | `netstat -ano \| findstr :3005` → `taskkill /PID <pid> /F` |
| ترميز عربي مكسور في `.ps1` | احفظ الملفات بـ **UTF-8 with BOM** (Notepad++ → Encoding → UTF-8-BOM) |

---

## 9. تحديث المشروع

```cmd
cd C:\p-sale-ultra-cloud
git pull
cd server && npm ci && npx prisma migrate deploy && cd ..
cd client && npm ci && npm run build && cd ..
pm2 restart all
```

---

## 10. ملفات مرجعية هامة

| الملف | الوصف |
|--------|-------|
| `scripts/win/start.ps1` | تشغيل + Health Check |
| `scripts/win/stop.ps1` | إيقاف الخدمات |
| `scripts/win/restart.ps1` | إعادة تشغيل + Health Check |
| `scripts/win/status.ps1` | حالة PM2 + Health Check |
| `manage.cmd` | واجهة نصية موحدة (1-6) |
| `ecosystem.config.cjs` | تكوين PM2 |
| `installation.txt` | دليل تثبيت مختصر بالعربية |

---

**🎉 تم التثبيت!** النظام جاهز على `http://localhost:5175` (الواجهة) و `http://localhost:3005/api` (API).