# دليل التثبيت المحلي — Ubuntu 22.04/24.04 LTS

> **البيئة المستهدفة**: Ubuntu Desktop/Server 22.04 أو 24.04 LTS
> **قاعدة البيانات**: MariaDB 10.11+ (apt) أو MySQL 8.0+
> **تشغيل العمليات**: PM2 (systemd user service)
> **المنافذ**: API `3005` | Frontend `5175` | DB `3306`

---

## 1. المتطلبات المسبقة

```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# أدوات أساسية
sudo apt install -y curl git gnupg2 build-essential

# Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# التحقق
node -v   # v20.x.x
npm -v    # 10.x.x
```

### MariaDB
```bash
sudo apt install -y mariadb-server mariadb-client
sudo systemctl enable --now mariadb
sudo mysql_secure_installation
# اتبع التعليمات: ضع كلمة مرور root، احذف المستخدمين المجهولين، امنع تسجيل دخول root عن بعد
```

---

## 2. إعداد قاعدة البيانات

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE IF NOT EXISTS `psale_ultra` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'psale'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON `psale_ultra`.* TO 'psale'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 3. استنساخ المشروع وإعداد البيئة

```bash
cd /opt
sudo git clone https://github.com/weeshi/p-sale-ultra-cloud.git
sudo chown -R $USER:$USER p-sale-ultra-cloud
cd p-sale-ultra-cloud
```

### ملفات البيئة
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### `server/.env`
```ini
NODE_ENV=development
PORT=3005
HOST=0.0.0.0

DATABASE_URL="mysql://psale:StrongPassword123!@localhost:3306/psale_ultra?schema=public"

JWT_ACCESS_SECRET="dev-access-secret-change-me-32chars-min"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me-32chars-min"
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

CORS_ORIGIN=http://localhost:5175

SYNC_BATCH_SIZE=100
```

### `client/.env`
```ini
VITE_API_URL=http://localhost:3005
VITE_WS_URL=ws://localhost:3005
VITE_APP_NAME=P-Sale Ultra
```

---

## 4. تثبيت التبعيات والبناء

```bash
# Backend
cd server
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
cd ..

# Frontend
cd client
npm ci
npm run build
cd ..

# PM2 عالمي
sudo npm i -g pm2
```

---

## 5. تشغيل الخدمات عبر PM2

### `ecosystem.config.cjs` (موجود في الجذر)
```js
module.exports = {
  apps: [
    {
      name: 'psale-server',
      script: 'tsx',
      args: 'watch src/app.ts',
      cwd: '/opt/p-sale-ultra-cloud/server',
      env: { NODE_ENV: 'development', PORT: '3005' },
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'psale-client',
      script: 'npx',
      args: 'vite preview --port 5175 --host',
      cwd: '/opt/p-sale-ultra-cloud/client',
      env: { NODE_ENV: 'production' },
      watch: false,
      max_memory_restart: '300M'
    }
  ]
};
```

### بدء الخدمات
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### تمكين التشغيل التلقائي (systemd user)
```bash
# إنشاء خدمة systemd للمستخدم الحالي
pm2 startup systemd -u $USER --hp $HOME
# تنفيذ الأمر الذي يطبعه (مثال):
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

pm2 save
```

> هذا ينشئ `~/.config/systemd/user/pm2.service` ويُمكنه عبر `systemctl --user enable pm2`.

---

## 6. التحقق من الصحة

```bash
# API
curl http://localhost:3005/api/health

# Frontend
curl -I http://localhost:5175

# حالة PM2
pm2 status
pm2 logs psale-server --lines 50
pm2 logs psale-client --lines 50
```

---

## 7. النسخ الاحتياطي والاستعادة (Linux)

```bash
# نسخ احتياطي
bash scripts/backup.sh

# استعادة تفاعلية
bash scripts/restore-manager.sh

# استعادة مباشرة (مع تأكيد)
bash scripts/restore.sh backups/psale_psale_ultra_20260826_020000.sql.gz psale_ultra
```

### جدولة يومية (cron)
```bash
crontab -e
# أضف السطر التالي:
0 2 * * * /opt/p-sale-ultra-cloud/scripts/backup.sh >> /opt/p-sale-ultra-cloud/logs/backup-cron.log 2>&1
```

---

## 8. تحديث المشروع

```bash
cd /opt/p-sale-ultra-cloud
git pull
cd server && npm ci && npx prisma migrate deploy && cd ..
cd client && npm ci && npm run build && cd ..
pm2 restart all
```

---

## 9. استكشاف الأخطاء الشائعة

| المشكلة | الحل |
|----------|-------|
| `ECONNREFUSED 3306` | `sudo systemctl status mariadb` → `sudo systemctl start mariadb` |
| `Access denied for user 'psale'` | تحقق من `DATABASE_URL` وكلمة المرور في `server/.env` |
| `pm2: command not found` | `sudo npm i -g pm2` |
| `Port 3005 already in use` | `sudo lsof -i :3005` → `kill -9 <PID>` |
| `prisma migrate deploy` يفشل | تحقق من صلاحيات المستخدم `psale` على قاعدة البيانات |
| `npm ci` يفشل بـ `ENOSPC` | `echo fs.inotify.max_user_watches=524288 \| sudo tee -a /etc/sysctl.conf && sudo sysctl -p` |

---

## 10. ملفات مرجعية هامة

| الملف | الوصف |
|--------|-------|
| `scripts/linux/start.sh` | تشغيل + Health Check |
| `scripts/linux/stop.sh` | إيقاف الخدمات |
| `scripts/linux/restart.sh` | إعادة تشغيل + Health Check |
| `scripts/linux/status.sh` | حالة PM2 + Health Check |
| `ecosystem.config.cjs` | تكوين PM2 |
| `scripts/backup.sh` | نسخ احتياطي مضغوط |
| `scripts/restore.sh` | استعادة من ملف `.sql.gz` |
| `scripts/restore-manager.sh` | مساعد استعادة تفاعلي |

---

**🎉 تم التثبيت!** النظام جاهز على `http://localhost:5175` (الواجهة) و `http://localhost:3005/api` (API).