# دليل النشر على استضافة cPanel المشتركة

> ⚠️ **تنبيه مهم**: استضافة cPanel المشتركة **غير مصممة لتطبيقات Node.js طويلة الأمد** (WebSocket، PM2، عمليات خلفية).
> هذا الدليل يغطي **نشر الواجهة الأمامية (Frontend) كملفات ثابتة فقط** مع توجيه API لخادم خارجي.
> للاستخدام الكامل (Offline-First، WebSocket، مزامنة، عمليات خلفية) **يجب استخدام VPS** (انظر `INSTALL_VPS_LINUX.md`).

---

## 1. المتطلبات على استضافة cPanel

| الميزة | مطلوبة؟ | ملاحظات |
|---------|--------|---------|
| **Node.js Selector (CloudLinux)** | نعم للـ API | متاح فقط في استضافات CloudLinux الحديثة |
| **قاعدة بيانات MySQL/MariaDB** | نعم | قياسية في كل cPanel |
| **SSH Access** | نعم | مطلوب لبناء المشروع |
| **SSL Certificate (Let's Encrypt)** | نعم | مجاني عبر cPanel |
| **Subdomain/Addon Domain** | نعم | للمنفذ الفرعي `api.yourdomain.com` |

> إذا لم تدعم استضافتك **Node.js Selector**، لا يمكنك تشغيل Backend عليها. الحل: **Backend على VPS رخيص** + **Frontend على cPanel**.

---

## 2. السيناريو الموصى به: Frontend على cPanel + Backend على VPS

### البنية
```
┌─────────────────────────────────────────────────────────────┐
│                    متصفح المستخدم                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  cPanel Shared Hosting (Static Files)                       │
│  https://app.yourdomain.com  →  client/dist/                │
└──────────────────────────┬──────────────────────────────────┘
                           │ API Calls (HTTPS)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  VPS / Cloud Server (Node.js + PM2 + MySQL)                 │
│  https://api.yourdomain.com  →  server/ (port 3005)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. إعداد قاعدة البيانات على cPanel

### 3.1 عبر cPanel → MySQL Databases
1. أنشئ قاعدة بيانات: `username_psale_ultra`
2. أنشئ مستخدم: `username_psale` مع كلمة مرور قوية
3. أضف المستخدم للقاعدة بصلاحيات **ALL PRIVILEGES**
4. دوّن: `DB_HOST` (عادة `localhost`)، `DB_NAME`، `DB_USER`، `DB_PASS`

### 3.2 استيراد الهيكل (Schema)
```bash
# على جهازك المحلي (مع قاعدة بيانات مطابقة)
cd server
npx prisma migrate deploy
# أو استورد من ملف backup
mysql -h localhost -u username_psale -p username_psale_ultra < backups/latest.sql.gz
```

---

## 4. بناء الواجهة الأمامية للإنتاج

### 4.1 محلياً (على جهازك)
```bash
cd client
cp .env.example .env.production
```

### 4.2 تحرير `client/.env.production`
```ini
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
VITE_APP_NAME=P-Sale Ultra
```

### 4.3 البناء
```bash
npm ci
npm run build
# الناتج في client/dist/
```

### 4.4 رفع الملفات
- عبر **File Manager** أو **SFTP** ارفع محتويات `client/dist/` إلى:
  - `public_html/` (إذا كان النطاق الرئيسي)
  - أو `public_html/app/` (إذا كان subdomain `app.yourdomain.com`)

---

## 5. إعداد Backend على VPS خارجي (موصى به)

انظر `INSTALL_VPS_LINUX.md` للتفاصيل الكاملة. ملخص سريع:

```bash
# على VPS (Ubuntu 22.04)
# 1. ثبت Node.js 20 + MariaDB + PM2 + Nginx
# 2. استنسخ المشروع
# 3. server/.env مع DATABASE_URL يشير لقاعدة cPanel (أو قاعدة محلية على VPS)
#    DATABASE_URL="mysql://user:pass@cpanel-host:3306/dbname?schema=public"
# 4. pm2 start ecosystem.config.cjs
# 5. Nginx reverse proxy لـ api.yourdomain.com → localhost:3005
# 6. SSL عبر Let's Encrypt (certbot)
```

> **ملاحظة**: إذا كانت قاعدة البيانات على cPanel، تأكد من السماح بالاتصالات الخارجية (Remote MySQL في cPanel) لعنوان IP الخاص بـ VPS.

---

## 6. بديل: تشغيل Backend على cPanel (إن توفر Node.js Selector)

### 6.1 تفعيل Node.js App
1. cPanel → **Setup Node.js App** → **Create Application**
2. إعدادات:
   - **Node.js Version**: 20.x
   - **Application Mode**: Production
   - **Application Root**: `~/psale-backend`
   - **Application URL**: `api.yourdomain.com`
   - **Startup File**: `src/app.ts` (أو `dist/app.js` بعد البناء)

### 6.2 رفع كود Backend
```bash
# محلياً
cd server
npm ci
npx prisma generate
npx prisma migrate deploy
# انسخ مجلد server كاملاً إلى ~/psale-backend على السيرفر (via SFTP)
```

### 6.3 متغيرات البيئة على cPanel
في واجهة Node.js App → **Environment Variables**:
```ini
NODE_ENV=production
PORT=3005
DATABASE_URL=mysql://user:pass@localhost:3306/dbname?schema=public
JWT_ACCESS_SECRET=your-32-char-secret
JWT_REFRESH_SECRET=your-32-char-secret
CORS_ORIGIN=https://app.yourdomain.com
```

### 6.4 مشاكل معروفة على cPanel Node.js
| المشكلة | الحل البديل |
|----------|-------------|
| **WebSocket لا يعمل** | ProxyPass غير مدعوم بشكل كامل → استخدم VPS |
| **عمليات خلفية (PM2/Sync) تموت** | العزل (CageFS) يقتل العمليات الطويلة → VPS |
| **ملفات مؤقتة تمحى** | `/tmp` ينظف دورياً → IndexedDB يعمل لكن Sync يفشل |
| **منفذ واحد فقط** | لا يمكنك تشغيل client + server معاً → فصلهما |

---

## 7. إعداد Nginx/Apache على cPanel للـ Frontend

### 7.1 عبر .htaccess (في `public_html/` أو `public_html/app/`)
```apache
# HTTPS Enforcement
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# SPA Fallback (React Router)
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [QSA,L]

# Cache Static Assets
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/* "access plus 1 year"
</IfModule>

# Security Headers
Header always set X-Content-Type-Options nosniff
Header always set X-Frame-Options DENY
Header always set Referrer-Policy strict-origin-when-cross-origin
```

### 7.2 تمكين Gzip/بروتوكول HTTP/2
في cPanel → **Optimize Website** → **Compress All Content**.

---

## 8. تحديث الواجهة على cPanel

```bash
# محلياً بعد أي تعديل
cd client
npm run build
# ارفع محتويات dist/ الجديدة واستبدل القديمة على السيرفر
```

> نصيحة: استخدم **GitHub Actions** أو **GitLab CI** لبناء ورفع تلقائي عند كل `push` لـ `main`.

---

## 9. قيود مهمة يجب معرفتها

| الميزة | تعمل على cPanel؟ | البديل |
|---------|-----------------|--------|
| **PWA / Service Worker** | ✅ نعم (ملفات ثابتة) | - |
| **Offline-First (IndexedDB)** | ✅ نعم | - |
| **Background Sync** | ⚠️ جزئي (يتطلب HTTPS + SW) | - |
| **WebSocket (Real-time)** | ❌ لا (ProxyPass محدود) | VPS + Socket.IO |
| **مزامنة تلقائية (Sync Queue)** | ❌ لا (عمليات خلفية تموت) | VPS + PM2 |
| **إشعارات فورية** | ❌ لا | VPS |
| **نسخ احتياطي مجدول** | ❌ لا (لا cron للـ Node) | VPS أو cPanel Cron لـ PHP script |
| **تشغيل تلقائي عند إعادة تشغيل السيرفر** | ❌ لا | VPS + systemd |

---

## 10. الخلاصة: متى تستخدم cPanel ومتى VPS؟

| السيناريو | الحل |
|------------|-------|
| **تجربة/عرض توضيحي (Demo)** | Frontend على cPanel + Backend على VPS رخيص ($5/شهر) |
| **إنتاج فعلي لمتجر حقيقي** | **VPS كامل** (DigitalOcean/Hetzner/Contabo $6-10/شهر) |
| **فريق داخلي صغير، شبكة محلية** | Windows/Ubuntu Local (انظر الأدلة الأخرى) |
| **ميزانية صفر، تجربة تقنية فقط** | cPanel للواجهة فقط، Backend على جهاز محلي مع ngrok |

---

**📌 الخلاصة**: للاستخدام الحقيقي لـ **P-Sale Ultra Cloud** (Offline-First، Real-time، Sync، Background Jobs)، **VPS هو الخيار الوحيد العملي**. العناوين أعلاه للواجهة الثابتة فقط.