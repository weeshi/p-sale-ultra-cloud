# دليل النشر على VPS Linux (إنتاج كامل)

> **البيئة المستهدفة**: Ubuntu 22.04/24.04 LTS VPS (2+ GB RAM, 2+ vCPU)
> **البنية**: Nginx (Reverse Proxy + SSL) → PM2 (Node.js API + Static Frontend) → MariaDB
> **المميزات المفعلة**: HTTPS، WebSocket، Background Sync، Real-time، Offline-First، Auto-start

---

## 1. مواصفات VPS الموصى بها

| المزود | الخطة الموصى بها | التكلفة التقريبية |
|--------|-----------------|------------------|
| **Hetzner** (CPX31) | 4 vCPU, 8 GB RAM, 160 GB NVMe | ~€13/شهر |
| **DigitalOcean** (Basic) | 2 vCPU, 4 GB RAM, 80 GB SSD | $24/شهر |
| **Contabo** (VPS M) | 6 vCPU, 16 GB RAM, 400 GB SSD | €8.99/شهر |
| **Vultr** (High Frequency) | 2 vCPU, 4 GB RAM, 80 GB NVMe | $24/شهر |

> **الحد الأدنى**: 2 GB RAM، 1 vCPU، 25 GB SSD — يعمل لكن قد يبطئ تحت الحمل.

---

## 2. إعداد الخادم الأولي

```bash
# تسجيل الدخول كـ root
ssh root@your-vps-ip

# تحديث النظام
apt update && apt upgrade -y

# إنشاء مستخدم غير جذر
adduser psale
usermod -aG sudo psale

# نسخ مفتاح SSH (من جهازك المحلي)
# ssh-copy-id psale@your-vps-ip

# تسجيل الدخول بالمستخدم الجديد
su - psale
```

### إعدادات أمان أساسية
```bash
# SSH Hardening
sudo nano /etc/ssh/sshd_config
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes
sudo systemctl reload sshd

# Firewall (UFW)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 3. تثبيت البرامج المطلوبة

### Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

### MariaDB 10.11+
```bash
sudo apt install -y mariadb-server mariadb-client
sudo systemctl enable --now mariadb
sudo mysql_secure_installation
```

### Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### PM2 + PM2 Logrotate
```bash
sudo npm i -g pm2 pm2-logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### Certbot (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### أدوات مساعدة
```bash
sudo apt install -y git curl unzip htop iotop ncdu
```

---

## 4. إعداد قاعدة البيانات

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE IF NOT EXISTS `psale_ultra` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'psale'@'localhost' IDENTIFIED BY 'VeryStrongPassword123!@#';
GRANT ALL PRIVILEGES ON `psale_ultra`.* TO 'psale'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### تحسينات MariaDB (اختياري لكن موصى به)
```bash
sudo tee /etc/mysql/mariadb.conf.d/99-psale.cnf > /dev/null <<'EOF'
[mysqld]
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
max_connections = 200
query_cache_type = 0
EOF
sudo systemctl restart mariadb
```

---

## 5. استنساخ المشروع وإعداد البيئة

```bash
cd /opt
sudo git clone https://github.com/weeshi/p-sale-ultra-cloud.git
sudo chown -R psale:psale p-sale-ultra-cloud
cd p-sale-ultra-cloud
```

### 5.1 متغيرات البيئة — Backend
```bash
cp server/.env.example server/.env
nano server/.env
```

```ini
# server/.env
NODE_ENV=production
PORT=3005
HOST=0.0.0.0

DATABASE_URL="mysql://psale:VeryStrongPassword123!@#@localhost:3306/psale_ultra?schema=public"

# JWT - استخدم مفاتيح قوية 32+ حرف (ولّدها عبر: openssl rand -base64 32)
JWT_ACCESS_SECRET="your-64-char-base64-access-secret-here"
JWT_REFRESH_SECRET="your-64-char-base64-refresh-secret-here"
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

CORS_ORIGIN=https://yourdomain.com
TRUST_PROXY=true

SYNC_BATCH_SIZE=100
SYNC_MAX_RETRIES=3

# اختياري: إعدادات البريد
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-smtp-password
SMTP_FROM="P-Sale <noreply@yourdomain.com>"
```

### 5.2 متغيرات البيئة — Frontend
```bash
cp client/.env.example client/.env.production
nano client/.env.production
```

```ini
# client/.env.production
VITE_API_URL=https://yourdomain.com
VITE_WS_URL=wss://yourdomain.com
VITE_APP_NAME=P-Sale Ultra
```

---

## 6. البناء والتثبيت

```bash
# Backend
cd /opt/p-sale-ultra-cloud/server
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
cd ..

# Frontend
cd /opt/p-sale-ultra-cloud/client
npm ci
npm run build
cd ..
```

---

## 7. تكوين PM2 للإنتاج

### `ecosystem.config.cjs` (في جذر المشروع)
```js
module.exports = {
  apps: [
    {
      name: 'psale-server',
      script: 'node',
      args: 'dist/app.js',
      cwd: '/opt/p-sale-ultra-cloud/server',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: '3005'
      },
      error_file: '/var/log/pm2/psale-server-error.log',
      out_file: '/var/log/pm2/psale-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '800M',
      node_args: '--max-old-space-size=1024',
      watch: false,
      autorestart: true,
      restart_delay: 5000
    },
    {
      name: 'psale-client',
      script: 'npx',
      args: 'vite preview --port 5175 --host 0.0.0.0',
      cwd: '/opt/p-sale-ultra-cloud/client',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/pm2/psale-client-error.log',
      out_file: '/var/log/pm2/psale-client-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '300M',
      watch: false,
      autorestart: true
    }
  ]
};
```

> **ملاحظة**: للبناء الإنتاجي للـ server، أضف سكريبت `build` في `server/package.json`: `"build": "tsc"` ثم شغل `npm run build` قبل PM2. أو استخدم `tsx` مباشرة كما في التطوير.

### إنشاء مجلد السجلات
```bash
sudo mkdir -p /var/log/pm2
sudo chown psale:psale /var/log/pm2
```

### بدء الخدمات
```bash
cd /opt/p-sale-ultra-cloud
pm2 start ecosystem.config.cjs
pm2 save
```

### تمكين التشغيل التلقائي (systemd)
```bash
pm2 startup systemd -u psale --hp /home/psale
# نفّذ الأمر الذي يطبعه (مثال):
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u psale --hp /home/psale

pm2 save
```

### التحقق
```bash
pm2 status
pm2 logs psale-server --lines 100
pm2 logs psale-client --lines 50
curl http://localhost:3005/api/health
curl -I http://localhost:5175
```

---

## 8. تكوين Nginx (Reverse Proxy + SSL)

### 8.1 إنشاء موقع Nginx
```bash
sudo tee /etc/nginx/sites-available/psale > /dev/null <<'EOF'
# HTTP → HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    root /opt/p-sale-ultra-cloud/client/dist;
    index index.html;

    # SSL Certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()";

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    # Static Assets Caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Service Worker - لا تخزّن
    location /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires off;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Socket.IO WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # SPA Fallback (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # منع الوصول للملفات الحساسة
    location ~ /\.(env|git|htaccess) {
        deny all;
    }
}
EOF
```

### 8.2 تفعيل الموقع
```bash
sudo ln -s /etc/nginx/sites-available/psale /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 8.3 الحصول على شهادة SSL
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# اتبع التعليمات: أدخل بريد إلكتروني، وافق على الشروط، اختر Redirect
```

### 8.4 تجديد تلقائي
```bash
# Certbot يضيف cron تلقائياً، تحقق:
systemctl status certbot.timer
# أو أضف cron يدوياً للتأكد:
sudo crontab -e
# 0 3 * * * /usr/bin/certbot renew --quiet --nginx
```

---

## 9. إعداد النسخ الاحتياطي التلقائي

### 9.1 سكريبت النسخ الاحتياطي
```bash
# الملف موجود في المشروع: scripts/backup.sh
# تأكد من صلاحيات التنفيذ
chmod +x /opt/p-sale-ultra-cloud/scripts/backup.sh
chmod +x /opt/p-sale-ultra-cloud/scripts/restore.sh
```

### 9.2 تكوين متغيرات النسخ الاحتياطي
```bash
nano /opt/p-sale-ultra-cloud/scripts/backup.sh
# عدل المتغيرات في بداية الملف:
# DB_NAME="psale_ultra"
# DB_USER="psale"
# DB_PASS="VeryStrongPassword123!@#"
# BACKUP_DIR="/opt/backups/psale"
# BACKUP_KEEP_DAYS=30
# OPTIONAL: RCLONE_REMOTE="gdrive:psale-backups"  # للنسخ السحابي
```

### 9.3 جدولة يومية (cron)
```bash
crontab -e
# أضف:
0 2 * * * /opt/p-sale-ultra-cloud/scripts/backup.sh >> /opt/p-sale-ultra-cloud/logs/backup-cron.log 2>&1
```

### 9.4 مجلد السجلات
```bash
mkdir -p /opt/p-sale-ultra-cloud/logs
```

---

## 10. المراقبة والصيانة

### 10.1 Health Check Endpoint
```bash
curl https://yourdomain.com/api/health
# يجب أن يعيد:
# {
#   "status": "ok",
#   "db": "connected",
#   "uptime": 3600,
#   "version": "1.0.0",
#   "timestamp": "2026-08-26T..."
# }
```

### 10.2 أوامر PM2 المفيدة
```bash
pm2 status              # حالة العمليات
pm2 monit               # مراقبة تفاعلية (CPU/Memory)
pm2 logs --lines 200    # آخر السجلات
pm2 restart all         # إعادة تشغيل كاملة
pm2 reload all          # إعادة تشغيل بدون انقطاع (cluster mode)
pm2 flush               # مسح السجلات
```

### 10.3 مراقبة مساحة القرص
```bash
# أضف cron للتنبيه عند امتلاء القرص
crontab -e
# 0 * * * * df -h / | awk 'NR==2 {gsub(/%/,"",$5); if($5>85) system("echo \"Disk usage > 85%\" | mail -s \"Disk Alert\" admin@yourdomain.com")}'
```

### 10.4 تحديث المشروع
```bash
cd /opt/p-sale-ultra-cloud
git pull
cd server && npm ci && npx prisma migrate deploy && cd ..
cd client && npm ci && npm run build && cd ..
pm2 reload all
```

---

## 11. استكشاف الأخطاء الشائعة

| المشكلة | التشخيص | الحل |
|----------|----------|-------|
| `502 Bad Gateway` | Nginx لا يصل لـ PM2 | `pm2 status` → `pm2 restart psale-server` → تحقق `curl localhost:3005/api/health` |
| `WebSocket connection failed` | Proxy headers ناقصة | تأكد من `proxy_set_header Upgrade/Connection` في Nginx |
| `CORS error` | Origin غير مسموح | أضف النطاق لـ `CORS_ORIGIN` في `server/.env` وأعد تشغيل server |
| `Database connection failed` | بيانات اعتماد خاطئة | تحقق `DATABASE_URL`، `mysql -u psale -p` يدوياً |
| `SSL certificate expired` | Certbot لم يجدد | `certbot renew --dry-run` → `systemctl status certbot.timer` |
| `PM2 process keeps restarting` | تسرب ذاكرة / خطأ غير معالج | `pm2 logs psale-server --err` → أصلح الكود أو زد `max_memory_restart` |
| `High CPU usage` | استعلامات بطيئة / لا فهارس | `pm2 monit` → `SHOW PROCESSLIST` في MySQL → أضف فهارس |

---

## 12. النسخ الاحتياطي والاستعادة (إنتاج)

```bash
# نسخ احتياطي يدوي
/opt/p-sale-ultra-cloud/scripts/backup.sh

# استعادة (مع تحقق سلامة)
/opt/p-sale-ultra-cloud/scripts/restore-manager.sh

# استعادة مباشرة لإنتاج (يتطلب إيقاف التطبيق)
sudo systemctl stop pm2-psale
/opt/p-sale-ultra-cloud/scripts/restore.sh /opt/backups/psale/psale_psale_ultra_20260826_020000.sql.gz psale_ultra
sudo systemctl start pm2-psale
```

---

## 13. تدوير مفاتيح JWT (أمان)

```bash
# سكريبت مدمج
cd /opt/p-sale-ultra-cloud
# إنشاء مفاتيح جديدة وتحديث .env + سجل تدقيق
./scripts/rotate-jwt-secrets.ps1 -Restart
# أو يدوياً:
openssl rand -base64 48  # للوصول
openssl rand -base64 48  # للتجديد
# حدّث server/.env ثم pm2 reload psale-server
```

---

## 14. قائمة تحقق ما قبل الإطلاق (Go-Live Checklist)

- [ ] `NODE_ENV=production` في `server/.env`
- [ ] مفاتيح JWT قوية وفريدة (32+ بايت base64)
- [ ] `CORS_ORIGIN` مقيد بالنطاق الدقيق (بدون `*`)
- [ ] `TRUST_PROXY=true` في `server/.env`
- [ ] قاعدة البيانات: مستخدم مخصص (ليس root)، كلمة مرور قوية
- [ ] Nginx: SSL/TLS صحيح، HSTS، Security Headers
- [ ] PM2: `instances: 'max'` للـ server، `autorestart: true`
- [ ] النسخ الاحتياطي: cron يومي يعمل، نسخة سحابية (rclone/S3)
- [ ] المراقبة: Health check endpoint يستجيب، سجلات PM2 تدور
- [ ] النسخ الاحتياطي للـ `.env` محفوظ في مكان آمن (خارج السيرفر)
- [ ] اختبار استعادة ناجح على بيئة تجريبية
- [ ] تجربة مستخدم كاملة: دخول → بيع → مزامنة → طباعة → خروج

---

## 15. ملفات مرجعية في المشروع

| الملف | الوصف |
|--------|-------|
| `ecosystem.config.cjs` | تكوين PM2 (production-ready) |
| `deploy/Caddyfile` | بديل لـ Nginx (HTTPS تلقائي) |
| `deploy/nginx-ssl.conf` | قالب Nginx مع SSL |
| `scripts/backup.sh` | نسخ احتياطي يومي مضغوط + rclone |
| `scripts/restore.sh` | استعادة من ملف `.sql.gz` |
| `scripts/restore-manager.sh` | مساعد استعادة تفاعلي مع تحقق سلامة |
| `scripts/rotate-jwt-secrets.ps1` | تدوير مفاتيح JWT مع سجل تدقيق |
| `server/.env.example` | قالب متغيرات البيئة |
| `client/.env.example` | قالب متغيرات الواجهة |

---

**🎉 تم النشر!** نظام P-Sale Ultra Cloud يعمل الآن بشكل كامل على:
- **الواجهة**: `https://yourdomain.com` (PWA قابل للتثبيت)
- **API**: `https://yourdomain.com/api` (REST + WebSocket)
- **Health**: `https://yourdomain.com/api/health`

جميع الميزات مفعلة: **Offline-First، Background Sync، Real-time Notifications، Multi-Branch، Dual-Currency، Serial Tracking، Assembly/Kits، Accounting، Treasury، Inventory، Reports**.