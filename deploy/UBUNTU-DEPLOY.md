# 🚀 دليل النشر الإنتاجي على Ubuntu — P-Sale Ultra Cloud

> **الهدف**: نشر النظام على سيرفر Ubuntu محلي (headless) مع:
> **Docker + Compose** للتشغيل، **Tailscale** للإدارة عن بُعد،
> **Cloudflare Tunnel** للنشر على الإنترنت بنطاق ثابت رغم الـ IP الديناميكي.
>
> **بيئة هذا الدليل**: مستخدم السيرفر `weeshi` · المستودع عام (clone مباشر بلا توكن).
> كل الأوامر تُنفَّذ على السيرفر إلا ما وُضّح أنه من اللابتوب.

---

## 0) أول اتصال (من لابتوبك — PowerShell)

**على شاشة السيرفر** (شاشة سوداء):
```bash
hostname -I          # عنوان IP الداخلي، مثال: 192.168.1.50
whoami               # weeshi
```

**من PowerShell على لابتوبك**:
```powershell
ssh weeshi@192.168.1.50
```

إن لم تعرف الـ IP، ابحث عنه من اللابتوب:
```powershell
arp -a
```
أو افحص المنفذ 22 على الشبكة (PowerShell 7):
```powershell
$subnet = '192.168.1'
1..254 | ForEach-Object -Parallel {
  if (Test-NetConnection -ComputerName "$using:subnet.$_" -Port 22 -InformationLevel Quiet -WarningAction SilentlyContinue) { "$using:subnet.$_" }
} -ThrottleLimit 64
```

> بعد تشغيل Tailscale (خطوة 2) لن تحتاج IP الشبكة المحلية أبداً.

---

## 1) تجهيز السيرفر (أمر واحد)

على **لابتوبك** داخل مجلد المشروع:
```powershell
scp .\scripts\linux\provision.sh weeshi@192.168.1.50:/tmp/
ssh weeshi@192.168.1.50 "sudo bash /tmp/provision.sh --deploy-user weeshi --with-firewall"
```

يُثبّت (بشكل Idempotent — إعادة تشغيله آمنة):
- Docker Engine + Buildx + **Compose v2** (مستودع Docker الرسمي)
- **Tailscale** (مستودع Tailscale الرسمي)
- **cloudflared** (مستودع Cloudflare الرسمي)
- تدوير سجلات الحاويات (`/etc/docker/daemon.json` → 10m × 3)
- مجلد النشر `/opt/psale` بملكية `weeshi`
- `ufw` يفتح **22/80/443 + tailscale0 فقط** (المنفذ 3005 يبقى خاصاً)

**تحقق**: في نهاية المخرجات ستظهر إصدارات Docker/Compose/Tailscale/cloudflared.

---

## 2) Tailscale (إدارة عن بُعد)

```bash
sudo tailscale up
```
يطبع رابطاً — افتحه في متصفح اللابتوب واعتمد الجهاز. بعدها:
```bash
tailscale ip -4        # مثال: 100.101.102.103
```
ومن الآن: `ssh weeshi@100.101.102.103` من أي مكان.

---

## 3) جلب المشروع

```bash
sudo mkdir -p /opt/psale
sudo chown -R weeshi:weeshi /opt/psale
git clone https://github.com/weeshi/p-sale-ultra-cloud.git /opt/psale
cd /opt/psale
git log --oneline -1     # تأكيد أنك على آخر نسخة
```

---

## 4) ملف الأسرار `.env`

```bash
cd /opt/psale
cp .env.example .env

# توليد أسرار قوية تلقائياً
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^MYSQL_PASSWORD=.*|MYSQL_PASSWORD=$(openssl rand -hex 16)|" .env

chmod 600 .env
grep -E '^(JWT_SECRET|MYSQL_)' .env | sed 's/=.*/=***/'
```

> ⚠️ **مهم**: أنشئ `.env` بـ **UTF-8 بلا BOM** وبنهايات أسطر **LF**.
> ملف `.env` بترميز UTF-16 لا يقرأه dotenv/Vite **بصمت** فتعود القيم الافتراضية
> (عطل حقيقي صادفناه: `client/.env` كان UTF-16 فلم يُقرأ `VITE_API_BASE_URL`).
> للتحقق: `file .env` يجب أن يطبع `ASCII text` أو `UTF-8 text` لا `UTF-16`.

---

## 5) التشغيل

```bash
cd /opt/psale
docker compose up -d --build      # أول مرة: 5–10 دقائق
docker compose ps                 # db (healthy) + server + web
docker compose logs -f migrate    # يجب أن ينتهي بـ "All migrations have been applied"
curl -s localhost:3005/api/health # {"status":"ok","db":"connected",...}
```

البنية:
| الخدمة | المنفذ | الوصف |
|---|---|---|
| `web` | 80 | حزمة PWA عبر nginx + وكيل `/api` و`/socket.io` |
| `server` | 3005 | API (Docker network + منفذ منشور للتشخيص) |
| `db` | داخلي | MySQL 8 + volume دائم |

> `mac_address` مثبَّت لخدمة `server` في `docker-compose.yml` **عن قصد**:
> بصمة الترخيص تعتمد على MAC، وبدونه يتغيّر MAC الحاوية عند كل إعادة بناء
> فيُبطل الترخيص بصمت.

---

## 6) البذر الأولي + الترخيص

```bash
# بيانات أولية: شركة + admin + دليل حسابات + أصناف + خزائن + تتابعات
docker compose run --rm server npx tsx prisma/seed.ts

# بصمة العتاد (تُرسل للمدير لإصدار الترخيص)
curl -s localhost:3005/api/license/machine-id
```

**إصدار الترخيص** (على **لابتوبك**، المفتاح الخاص لا يغادر جهازك):
```powershell
npm run license:issuer        # من جذر المشروع → http://127.0.0.1:3333
```
ألصق `hwHash` + `companyId=1` + tier + تاريخ الانتهاء → انسخ Base64 → فعّله:

```bash
# على السيرفر
curl -s -X POST localhost:3005/api/license/activate \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"<BASE64>"}'
```
أو من واجهة الإعدادات في التطبيق.

> **بدون ترخيص**: النظام يعمل 30 يوماً تجريبية من تاريخ إنشاء الشركة فقط.

**غيّر كلمة مرور `admin` الافتراضية فوراً** (`SuperAdmin123!`).

---

## 7) Cloudflare Tunnel (النطاق من Libyan Spider)

```bash
cloudflared tunnel login            # يطبع رابطاً → افتحه باللابتوب واختر النطاق
cloudflared tunnel create psale
```

أنشئ ملف الإعداد:
```bash
TUNNEL_ID=$(cloudflared tunnel list -o json | jq -r '.[0].id')
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /home/weeshi/.cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: psale.<yourdomain.com>
    service: http://localhost:80
  - service: http_status:404
EOF

cloudflared tunnel route dns psale psale.<yourdomain.com>
sudo cloudflared service install     # تشغيل دائم + بدء تلقائي
sudo systemctl status cloudflared
```

> استبدل `<yourdomain.com>` بنطاقك. لا تحتاج فتح منافذ على الراوتر ولا IP ثابت.
> فعّل في Cloudflare: SSL/TLS = **Full**، و**Always Use HTTPS**.

**التحقق النهائي**: `https://psale.<yourdomain.com>` يفتح شاشة الدخول.

---

## 8) قائمة تحقق نهائية

```bash
docker compose ps                                  # الثلاثة Up
curl -s localhost:3005/api/health | jq .status     # "ok"
curl -sI https://psale.<domain> | head -1          # 200
tailscale status | head -3                         # جهازك online
sudo systemctl is-active cloudflared               # active
```

| # | البند | ✔ |
|---|---|---|
| 1 | SSH يعمل (محلياً ثم عبر Tailscale) | ☐ |
| 2 | `provision.sh` أنهى بدون أخطاء | ☐ |
| 3 | `.env` بترميز UTF-8 وأسرار مولّدة | ☐ |
| 4 | `docker compose ps` كل الخدمات Up | ☐ |
| 5 | الهجرات مطبقة (`migrate` انتهى بنجاح) | ☐ |
| 6 | الترخيص مفعّل ويطابق `machine-id` | ☐ |
| 7 | كلمة مرور admin مغيّرة | ☐ |
| 8 | `https://psale.<domain>` يعمل | ☐ |
| 9 | نسخة احتياطية مجدولة (انظر أدناه) | ☐ |

---

## 9) الصيانة

```bash
# تحديث النظام
cd /opt/psale && git pull && docker compose up -d --build

# نسخة احتياطية (داخل الحاوية)
docker compose exec db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  | gzip > ~/psale-$(date +%F).sql.gz

# نسخها إلى لابتوبك (PowerShell)
scp weeshi@100.101.102.103:~/psale-*.sql.gz .\backups\

# السجلات
docker compose logs -f server --tail 100
```

**جدولة يومية** (cron على السيرفر):
```bash
( crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/psale && docker compose exec -T db sh -c 'mysqldump -u root -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction \"\$MYSQL_DATABASE\"' | gzip > /home/weeshi/backups/psale-\$(date +\%F).sql.gz" ) | crontab -
```

---

## 10) أخطاء شائعة وحلولها

| العرض | السبب | الحل |
|---|---|---|
| `License validation failed` (403) | بصمة العتاد تغيّرت (MAC) | لا تُزل `mac_address` من compose؛ أعد إصدار الترخيص لنفس البصمة |
| صفحة بيضاء أو API على `localhost:3005` | حزمة الواجهة بُنيت بعنوان مطلق | أعد البناء داخل Docker (لا `.env` في `client/`) — الافتراضي `/api` |
| `.env` لا يؤثر | الملف UTF-16/BOM | أعد حفظه UTF-8 بلا BOM |
| `port 80 already in use` | خدمة أخرى (apache/nginx) | `sudo ss -lptn 'sport = :80'` ثم عطّلها |
| `migrate` يفشل | كلمة مرور DB لا تطابق | تحقق من `MYSQL_PASSWORD` في `.env` ثم `docker compose down -v` (يحذف البيانات!) |
| التطبيق يعمل محلياً لا خارجياً | Tunnel غير مثبت/النطاق غير موجّه | `sudo systemctl status cloudflared` + `cloudflared tunnel info psale` |
| إشعارات لحظية لا تصل | الوكيل لا يعكس WebSocket | تأكد من `client/nginx.conf` (`Upgrade`/`Connection`) — مضبوط مسبقاً |
