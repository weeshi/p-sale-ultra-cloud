# P-Sale Ultra Cloud 🛒💾

نظام **إدارة مبيعات ومخازن ومحاسبة** حديث متعدد الفروع (PWA) — إعادة بناء كاملة لمنظومة **P-Sale Ultra** الكلاسيكية (Delphi/Paradox, 2013) لمتجر كمبيوتر وإلكترونيات.

> **Offline-First** | **Multi-Branch** | **Dual-Currency (LYD/USD)** | **Serial/IMEI Tracking** | **ضمان وصيانة**

---

## ✨ المميزات الرئيسية

- 📱 **PWA** — تثبيت كتطبيق، يعمل أوفلاين بالكامل، مزامنة ثنائية الاتجاه
- 🏬 **فروع متعددة** — مخازن مركزية/فرعية، تحويلات مخزون (STO) بين الفروع
- 💵 **عملة مزدوجة** — دينار ليبي (LYD) أساسي + دولار (USD) للاستيراد، تحديث سعر صرف يومي تلقائي
- 🔢 **أرقام تسلسلية/IMEI** — تتبع كامل، باركود/QR توليد ومسح
- 🔢 **أكواد تلقائية** — أصناف (`ITM-000001`) وعملاء (`PTY-000001`) بأكواد فريدة تلقائية
- ⚠️ **تتبع المخزون التالف** — تسجيل كمية تالفة لكل مخزن، الكمية الصالحة فقط قابلة للبيع/التحويل، متوسط التكلفة يمتص قيمة التالف في الوحدات الصالحة، تفعيل/إخفاء صنف من المبيعات
- 📄 **Pagination ذكي** — تصفح القوائم (25/50/100/200/الكل) مع فلاتر بحث
- 🛡️ **ضمان + صيانة + RMA** — تلقائي عند البيع، إدارة مرتجعات
- 📦 **استيراد من الصين** — أوامر شراء بالدولار، توزيع Landed Cost، أسعار تحويل للفروع
- 🧾 **محاسبة كاملة** — قيود تلقائية لكل معاملة، ميزان، قائمة دخل، ميزانية، دفتر أستاذ
- 🔗 **واجهة REST + WebSocket** — تحديثات لحظية (Socket.IO)
- 🔐 **أدوار وصلاحيات** — Admin / Manager / Accountant / Cashier + صلاحيات تفصيلية

---

## 🧰 المتطلبات

| المتطلب | الإصدار الموصى به |
|----------|-------------------|
| [Node.js](https://nodejs.org) | ≥ 18.x (يعمل 20.x أفضل) |
| [MySQL](https://www.mysql.com) | 8.0+ (XAMPP/WAMP/MariaDB تعمل أيضاً) |
| npm | ≥ 9 |

---

## 🚀 التثبيت والتشغيل

### 1) تحميل وتثبيت الاعتماديات

```bash
# من جذر المشروع
cd server
npm install
```

### 2) إعداد قاعدة البيانات

1. شغّل MySQL (من XAMPP/WAMP أو الخدمة النظامية).
2. أنشئ قاعدة البيانات:
   ```sql
   CREATE DATABASE psale_ultra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

### 3) إعداد ملف البيئة

```bash
# انسخ ملف المثال
cp .env.example .env
```

عدّل قيم `DATABASE_URL` و `JWT_SECRET`:

```ini
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/psale_ultra"
JWT_SECRET="ضع-مفتاح-سري-قوي-هنا"
```

### 4) ترحيل قاعدة البيانات (Migrations)

```bash
npx prisma migrate dev --name init
npx prisma generate
```

> هذا ينشئ كل الجداول (~40 موديل) تلقائياً من `server/prisma/schema.prisma`.

### 5) تشغيل الخادم

```bash
# تطوير (مع إعادة تحميل تلقائية)
npm run dev
```

الخادم يعمل على: **http://localhost:3005**
الواجهة الأمامية (تطوير): **http://localhost:5175**

تحقق من صحته: http://localhost:3005/api/health → `{ "status": "ok", ... }`

### 6) الإعداد الأولي للنظام (Setup)

لا يوجد مستخدمون بعد — أنشئ الشركة + الفرع الرئيسي + دليل الحسابات + المدير:

```
POST /api/auth/setup
Content-Type: application/json

{
  "companyName": "متجر التقنية",
  "adminUsername": "admin",
  "adminPassword": "كلمة-مرور-قوية",
  "adminFullName": "مدير النظام"
}
```

> ⚠️ هذه العملية تُنفَّذ مرة واحدة فقط (تتعطل إذا وُجد أي مستخدم).

ثم سجّل الدخول:

```
POST /api/auth/login
{
  "username": "admin",
  "password": "كلمة-مرور-قوية"
}
```

---

## 🔨 البناء للإنتاج

```bash
npm run build          # ترميز TypeScript → dist/
npm run start          # تشغيل الإنتاج (node dist/server/src/app.js)
```

> ملاحظة: بنية الإخراج بعد البناء: `server/dist/server/src/app.js` و `server/dist/shared/*` (لأن `shared/` خارج مجلد server).

---

## 📚 واجهة API — نظرة عامة

الكل تحت البادئة `/api` ويتطلب `Authorization: Bearer <token>` (عدا `auth/login` و `auth/setup`).

| الوحدة | المسار | الوظيفة |
|--------|--------|---------|
| المصادقة | `/api/auth` | Login, Refresh, Setup, Users |
| الأصناف | `/api/items` | CRUD، خصائص، سيريال، باركود، كود تلقائي ITM، **تسجيل تالف `POST /:id/damaged`** |
| الأطراف | `/api/parties` | عملاء/موردين، كود تلقائي PTY |
| المبيعات | `/api/sales` | فواتير، مرتجعات، عروض أسعار، تحويل عرض |
| المشتريات | `/api/purchases` | أوامر شراء، استلام، فواتير مباشرة |
| الخزينة | `/api/treasury` | سندات قبض/صرف |
| القيود | `/api/journal` | دفتر اليومية، عكس قيد، ميزان، قوائم مالية |
| التقارير | `/api/reports` | مبيعات، مخزون، أرباح، ضمان، Dashboard |
| التحويلات | `/api/transfers` | تحويلات مخزون بين الفروع |
| الجرد | `/api/inventory` | جرد، ترحيل، تقييم مخزون |
| الضمان | `/api/warranty` | ضمانات، صيانة، RMA |
| الباركود | `/api/barcode` | توليد/مسح |
| المزامنة | `/api/sync` | Push/Pull/Status |
| الإعدادات | `/api/settings` | شركة، وحدات، فئات، ماركات، مستخدمون، صلاحيات |
| سعر الصرف | `/api/exchange` | تحديث/تحويل |
| الإشعارات | `/api/notifications` | Email/WhatsApp |

---

## 🗂️ هيكل المشروع

```
p-sale-ultra-cloud/
├── server/                 # Backend
│   ├── src/
│   │   ├── config/         # الإعدادات + database + logger
│   │   ├── middleware/     # auth, audit, error, rate-limit
│   │   ├── routes/         # 19 مسار REST
│   │   ├── services/       # 13 خدمة أعمال
│   │   └── app.ts          # نقطة الدخول + Socket.IO
│   ├── prisma/schema.prisma
│   └── package.json
├── client/                 # Frontend (React PWA)
├── shared/                 # أنواع وأدوات مشتركة
├── scripts/
│   ├── win/                # سكربتات إدارة Windows
│   │   ├── start.ps1       # تشغيل الخدمات
│   │   ├── stop.ps1        # إيقاف الخدمات
│   │   ├── restart.ps1     # إعادة تشغيل
│   │   └── status.ps1      # حالة الخدمات + health check
│   ├── linux/              # سكربتات إدارة Linux
│   │   ├── start.sh
│   │   ├── stop.sh
│   │   ├── restart.sh
│   │   └── status.sh
│   ├── rotate-jwt-secrets.ps1  # تدوير مفاتيح JWT
│   ├── backup.ps1          # نسخ احتياطي Windows
│   └── backup.sh           # نسخ احتياطي Linux
├── manage.cmd              # واجهة إدارة نصية (Windows)
├── FAQ-index.html          # الأسئلة الشائعة
├── ecosystem.config.cjs    # إعدادات PM2
├── AGENTS.md               # دستور المشروع (للمطورين/الذكاء الاصطناعي)
└── README.md
```

---

## 🧪 أوامر مفيدة

```bash
npm run dev              # تطوير
npm run build            # بناء
npm run start            # إنتاج
npx tsc --noEmit         # فحص الأنواع (يجب أن يمر نظيفاً)
npx prisma migrate dev   # إنشاء ترحيل
npx prisma studio        # واجهة إدارة قاعدة البيانات
npx prisma generate      # توليد Client بعد تعديل schema
```

### الاختبارات

```bash
# في server/
npm test                       # وحدات (Jest — 44 اختباراً)
npm run test:integration       # تكامل على MySQL اختباري (psale_ultra_test)
npm run db:seed                # بذر بيانات تجريبية (آمن التكرار — لا يكرر الموجود)

# في client/
npm run test:e2e               # E2E (Playwright — يستخدم متصفح Chrome المثبت)
npm run test:e2e:headed        # E2E بواجهة مرئية
npm run test:e2e:report        # فتح تقرير Playwright
```

> بيانات الدخول بعد البذر: المستخدم `admin` / كلمة المرور `SuperAdmin123!`.

---

## 🔒 ملاحظات أمنية للإنتاج

- غيّر كل المفاتيح السرية في `.env` (JWT + refresh)
- استخدم HTTPS عبر proxy (Nginx/Caddy)
- فعّل `NODE_ENV=production`
- استخدم MySQL مدير وصول/باسورد قوي
- انسخ قاعدة البيانات دورياً (mysqldump أو Prisma backup)
- **عزل البيانات (Offline)**: يدعم النظام عزل البيانات على مستوى **المستخدم والفرع** في وضع الأوفلاين (IndexedDB مقسَّم بأسماء فضاء `table:${table}:user:${userId}:branch:${branchId}` لكل User+Branch) — التبديل بين المستخدمين لا يمسح الكاش (توافر أوفلاين فوري)؛ ويُحتفظ بكاش آخر 3 مستخدمين فقط. طابور المزامنة موسوم بالهوية ويُتحقق منها في السيرفر من التوكن (لا ثقة بالعميل). يتطلب اتصالاً بالإنترنت **مرة واحدة على الأقل** للمستخدمين الجدد لتحميل بياناتهم الأساسية قبل أول عملية عمل أوفلاين. التفاصيل الكاملة في [SECURITY.md](./SECURITY.md)

---

## 📄 سجل التغييرات

انظر [CHANGELOG.md](./CHANGELOG.md) لتفاصيل كل إصدار.

---

## 🗺️ خارطة الطريق

- ✅ **v0.1.0** — Backend كامل + Schema + TypeScript Clean
- ✅ **v0.2.0** — Frontend PWA (React + Vite + Tailwind + Offline Engine)
- ✅ **v0.3.0** — صفحات الأصناف/المبيعات/المشتريات/المخزون
- ✅ **v0.4.0** — المحاسبة/الخزينة/الإعدادات (8.1-10.6)
- ✅ **v1.0.0** — إطلاق أول + نشر + تدريب (Docker/CI/Security)
- ✅ **v1.1.0** — تحسينات ما بعد الإطلاق (أكواد تلقائية + Pagination + تصنيف محسّن)

---

## 📜 الترخيص

مشروع خاص — جميع الحقوق محفوظة. لاحظ أن هذا النظام لا يستخدم أي كود من المنظومة الأصلية (Delphi/Paradox)؛ إنه إعادة بناء هندسي كاملة بنفس منطق العمل.

---

Made with ❤️ للمتجر — P-Sale Ultra Cloud
