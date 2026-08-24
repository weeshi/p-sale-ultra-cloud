# سجل التغييرات (Changelog)

تنسيق مبني على [Keep a Changelog](https://keepachangelog.com/ar/1.1.0/).
يُضاف كل تحديث جديد في **أعلى** هذا الملف.

---

## [0.1.8] - 2026-08-18 — تتبع المخزون التالف + ربط متوسط التكلفة

### ✨ الجديد (Added)
- **تتبع كامل للمخزون التالف (Damaged Stock)**:
  - Migration `20260818090000_add_damaged_stock` — حقل `damagedStock` في `Item` و `Stock`
  - مسار جديد `POST /api/items/:id/damaged` (`{warehouseId, quantity, notes}`) — يحوّل وحدات صالحة إلى تالفة دون تغيير الإجمالي
  - حركة مخزون جديدة من نوع `damaged` في `MOVEMENT_TYPES`
  - زر «تسجيل تالف ⚠️» في صفحة الأصناف + مودال (مخزن + كمية) — Offline-First عبر `syncService` (يعيد التوجيه إلى `inventoryService.registerDamaged`)
  - تقارير المخزون تعرض التالف/الصالح: تقييم المخزون + مخزون منخفض
- **متوسط التكلفة بطريقة «الامتصاص»** (طريقة المستخدم):
  - دالة `absorbedAverageCost` جديدة في `shared/utils.ts`
  - الصيغة: `(الإجمالي × التكلفة + الجديد × السعر) ÷ (الصالح + الجديد)` — تُحمَّل تكلفة التالف على الوحدات الصالحة
  - متناسقة: عند `damagedStock = 0` تعطي نفس نتيجة `weightedAverage` الحالية
- **تحسين صفحة الأصناف (Items.tsx)**:
  - فلتر «المخزن» في شريط الفلاتر — عمود المخزون يعرض الصالح الخاص بالمخزن المحدد
  - زر «إخفاء غير المتوفر» (يخفي الأصناف بصالح = 0)
  - عمود «تفعيل/تعطيل» (Select) — يتحكم في ظهور الصنف في شاشة المبيعات
  - عمود سعر الجملة بإضاءة خضراء مميّزة + إزالة عمود «النوع»
  - عمود «متوسط التكلفة» بدلاً من «سعر الشراء»

### 🔧 التحسينات (Changed)
- **منع بيع التالف**: `saleService` يتحقق من الكمية الصالحة (`quantity − damagedStock`)
- **التحويلات الداخلية**: `transferService` لا ينقل إلا الكمية الصالحة
- **شاشة المبيعات (Sales.tsx)**: يخفي الأصناف المعطّلة (`isActive === false`) + «نفد» عند صالح = 0
- **`syncService`**: حركات `damaged` المؤجلة تُنفَّذ عبر `inventoryService.registerDamaged`

### 🐛 تم الإصلاح (Fixed)
- (لا ثغرات جديدة — التحقق السلبي من تجاوز التالف للصالح يعيد 400)

### ✅ الاكتمال
- `npx tsc --noEmit` — **صفر أخطاء** (server + client)
- `npm run build` (client) — **ناجح** (PWA + SW)
- `npm test` — **53/53 ناجحة** (44 سابقة + 9 جديدة: صيغة الامتصاص + تسجيل التالف)
- `npm run test:integration` — **3/3 ناجحة** على MySQL

---

### ✨ الجديد (Added)
- **توليد أكواد تلقائية للأصناف والعملاء**:
  - أصناف: صيغة `ITM-000001` عبر `sequenceService.next('ITM')` + `generateNumber`
  - أطراف (عملاء/موردين): صيغة `PTY-000001` عبر `sequenceService.next('PTY')`
  - حقل الكود أصبح **للقراءة فقط** في نموذج الإنشاء (يُولَّد تلقائياً عند الحفظ)
  - لا يُسمح بتعديل الكود عند التعديل (`delete data.itemCode`/`partyCode` في PUT)
  - تسلسلات `ITM`/`PTY` تُزرع تلقائياً عبر `SEQUENCE_PREFIXES` في `authService.setup()`
  - تحديث 1327 صنف موجود بالصيغة الجديدة (`ITM-000001` → `ITM-001327`)
- **مزود Pagination موحد** (`components/Pagination.tsx`):
  - خيارات: 25 / 50 / 100 / 200 / الكل — الافتراضي 25
  - `usePaginate` hook لإعادة تعيين الصفحة عند تغيير الفلتر
  - مطبق على: Items, Parties, Quotes, Purchases, Transfers, StockMovements, Sales
- **تحسين التصنيف (الدورة الثانية)** — 241 صنف أُعيد تصنيفهم:
  - 41 براند جديد (ASTA, MSI, CUDY, WIWU, NETAC, AOC, CANYON, SAMSONITE, HONOR, OMEN...)
  - فئة جديدة: "فلاشات / بطاقات ذاكرة" (ID: 25)
  - فلترة regex محسّنة: شواحن، شبكات، شاشات، لابتوبات، أحبار

### 🔧 التحسينات (Changed)
- **`limit=99999`** في كل الصفحات — جلب كل البيانات من السيرفر مع Pagination client-side
- **E2E helper** — `ensureTestItem` لا يرسل `itemCode` بعد الآن (يستخدم الكود الآلي من الخادم)

### 🐛 تم الإصلاح (Fixed)
- **`routes/items.ts`**: حُذف `itemCode` من الحقول المطلوبة في POST (يُولَّد تلقائياً)
- **`routes/parties.ts`**: حُذف `partyCode` من الحقول المطلوبة في POST (يُولَّد تلقائياً)

### ✅ الاكتمال
- `npx tsc --noEmit` — **صفر أخطاء** (server + client)
- `npm run build` (client) — **ناجح** (PWA + SW)
- `npm test` — **44/44 ناجحة**

---

## [0.1.6] - 2026-08-07 — Phase 6: صفحات المشتريات (Purchase Pages)

### ✨ الجديد (Added)
- **`pages/PurchaseOrders.tsx`** — إدارة أوامر الشراء (استيراد بالدولار):
  - قائمة أوامر الشراء (رقم، تاريخ، مورد، وصول متوقع، الإجمالي بالدولار، الحالة)
  - إنشاء أمر شراء (USD) عبر مودال: مورد، سعر صرف، وصول متوقع، مخزن هدف، اعتماد بنكي (رقم/بنك)، تكاليف وصول (شحن/جمارك/تأمين/أخرى) + خصم، سلة أصناف مع كمية وسعر وحدة بالدولار وإجماليات حية
  - تفاصيل الأمر + **طباعة / واتساب / بريد** + زر **استلام** للمعالجة
  - حفظ عبر `offlineWrite` (Offline-First)
- **`pages/POReceive.tsx`** — استلام أمر شراء وتحويله لفاتورة شراء:
  - اختيار المخزن الهدف (يُسبق بقيمة الـ PO) + الخزينة + تاريخ الاستلام + المدفوع
  - تكاليف الوصول (شحن/جمارك/تأمين/أخرى) مع **معاينة حية لتوزيع الحصص** على الأصناف (بنفس منطق الخادم) + التكلفة النهائية للوحدة بالدينار
  - **إدخال الأرقام التسلسلية** للأصناف المتبعة (سطر لكل رقم، يفرض التطابق مع الكمية قبل الحفظ)
  - نتيجة الاستلام تعرض فاتورة الشراء مع **طباعة**
- **`pages/DirectPurchase.tsx`** — شراء مباشر بدون أمر شراء:
  - سلة أصناف، مورد/مخزن/خزينة، عملة (USD/LYD افتراضياً USD) + سعر صرف، شحن/جمارك/خصم، إدخال سيريالات سطرية، إجماليات حية بالعملة والـ LYD
  - حفظ عبر `offlineWrite` + قائمة آخر فواتير الشراء + تفاصيل مع طباعة/واتساب/بريد
- **`types.ts` موسّع** — PurchaseOrder، PurchaseOrderItem، PurchaseInvoice، PurchaseInvoiceItem، PurchaseOrdersResponse، PurchasesResponse
- **`lib/format.ts`**: `fmtUsd` — تنسيق المبالغ بالدولار
- **`lib/print.ts`**: `printPurchaseOrder` + `printPurchaseInvoice` + `purchaseOrderText` + `purchaseInvoiceText`

### 🔧 التحسينات (Changed)
- **Backend `purchaseService.receivePurchaseOrder`** — يدعم الآن `items: [{ itemId, serialNumbers }]` لتسجيل الأرقام التسلسلية المستلمة (كانت تسجَّل فقط في الشراء المباشر)؛ رُبطت بـ `PurchaseInvoiceItem` عبر `registerSerials`
- **`routes/purchases.ts`** — تمرير `items` (السيريالات) في مسار `/orders/:id/receive`
- **`App.tsx`**: ربط `/purchases` → إعادة توجيه لأوامر الشراء + مسارات `/purchases/orders` و `/purchases/orders/:id/receive` و `/purchases/direct`

### ✅ الاكتمال
- `npm run build` (client) — **نظيف**
- `npx tsc --noEmit` (server) — **نظيف**

---

## [0.1.5] - 2026-08-07 — Phase 5: صفحات المبيعات (Sales Pages)

### ✨ الجديد (Added)
- **`pages/Sales.tsx`** — شاشة بيع POS-like (غير touch):
  - بحث/مسح باركود (Enter يضيف الصنف فوراً) + اختصار لوحة مفاتيح **F2** لتركيز البحث
  - شبكة أصناف سريعة مع توفر المخزون لكل مخزن، سلة فواتير مع تعديل كمية/سعر وخصم سطري
  - اختيار عميل/مخزن/خزينة، ضريبة % وخصم عام، مبلغ مدفوع (يُملأ تلقائياً بالإجمالي)، إجماليات حية
  - **Serial Picker** للأصناف المتبعة بالسيريال (يُفرض تطابق عدد الأرقام مع الكمية قبل الحفظ)
  - حفظ عبر `offlineWrite` (Offline-First) + قائمة آخر الفواتير + نافذة تفاصيل مع **طباعة / واتساب / بريد**
  - وضع **عرض سعر** (Quote) بنفس الشاشة (تاريخ الصلاحية + حفظ عرض)
- **`pages/Quotes.tsx`** — إدارة عروض الأسعار: قائمة + تفاصيل + طباعة/مشاركة + **تحويل عرض إلى فاتورة** (اختيار مخزن/خزينة عبر مودال)
- **`components/SerialPicker.tsx`** — نافذة اختيار الأرقام التسلسلية المتاحة (حسب المخزن المحدد) مع بحث وحد أقصى للاختيار
- **`lib/print.ts`** — أدوات طباعة الفواتير/العروض (قالب HTML RTL جاهز للطباعة) + روابط مشاركة `wa.me` و `mailto`
- **`types.ts` موسّع** — Warehouse، Treasury، Serial، SaleInvoice، SaleInvoiceItem، Quote، QuoteItem، SalesResponse

### 🔧 التحسينات (Changed)
- `App.tsx`: ربط `/sales` بشاشة البيع الفعلية (كانت Placeholder) + إضافة `/sales/quotes`

### ✅ الاكتمال
- `npm run build` (client) — **نظيف**
- `npx tsc --noEmit` (server) — **نظيف**
- Server boot: `/api/health` → `{ "status": "ok" }`

---

## [0.1.4] - 2026-08-07 — Phase 4: صفحات الكتالوج (Catalog Pages)

### ✨ الجديد (Added)
- **`pages/Items.tsx`** — إدارة كتالوج الأصناف:
  - CRUD كامل (إنشاء/تعديل/حذف soft) عبر `offlineWrite` (Offline-First)
  - بحث بالاسم/الكود/الباركود + فلترة بالفئة/الماركة + عرض المخزون المنخفض فقط
  - خصائص ديناميكية (نص/قائمة)، توليد باركود، تحويل Decimal → رقم للعرض
  - قراءة عبر `cachedRead` — يعرض نسخة مخزنة عند انقطاع الاتصال مع تنبيه
- **`pages/Parties.tsx`** — إدارة العملاء والموردين: CRUD كامل، فلترة بالحالة (عميل/مورد)، حد الائتمان والرصيد، Offline-First
- **`components/CatalogSettings.tsx`** — تبويبات إدارة الفئات/الماركات/الوحدات/الخصائص (إضافة + قائمة حية) مع `onChanged` لتحديث قوائم الأصناف
- **`components/Modal.tsx`** — مودال عام قابل لإعادة الاستخدام
- **`lib/format.ts`** — أدوات: `toNum` (Decimal Prisma يصل نصاً) + `fmt` + `fmtMoney` + `fmtDate`
- **`types.ts` موسّع** — Item كامل، Category، Brand، Unit، Attribute، ItemAttribute، Account، ItemsResponse، PartiesResponse

### 🔧 التحسينات (Changed)
- `App.tsx`: ربط `/items` و `/parties` بالصفحات الفعلية (كانت Placeholder)

### ✅ الاكتمال
- `npm run build` (client) — **نظيف** (PWA يتولد كالمعتاد)
- **E2E عبر الـ proxy**: إنشاء فئة/ماركة/وحدة/صنف (بخصائص ومخزون افتتاحي)/عميل + توليد باركود + البحث بالباركود → كلها نجحت؛ حُذفت بيانات الاختبار من قاعدة البيانات

---

## [0.1.3] - 2026-08-07 — Phase 3: محرك الأوفلاين (Offline Engine)

### ✨ الجديد (Added)
- **`client/src/contexts/SyncContext.tsx`**: كشف الاتصال (online/offline عبر `navigator.onLine` + أحداث `online/offline`)، مزامنة تلقائية عند العودة للاتصال، عرض حالة المزامنة (pending/synced/lastSyncAt)، التعارضات مع `retry`/`discard`
- **`client/src/lib/offline.ts`**:
  - `offlineWrite()` — كتابة Offline-First: تُنفَّذ مباشرة عند الاتصال، وتُدرج في طابور IndexedDB عند غياب الاتصال
  - `cachedRead()` — قراءة Cache-First مع تحديث خلفي، وعرض كاش عند انقطاع الاتصال
  - `getDeviceId()` — معرف جهاز ثابت (crypto.randomUUID مع fallback) يُرسل مع المزامنة
- **`lib/db.ts` مطوَّر**: `enqueue(entity, action, data, recordId?)` + `markFailed` + `removeQueueItem` + طابور مرتب بـ `createdAt`
- **`Layout.tsx`**: شارة اتصال/انقطاع حية + عداد المعلّق + مودال مزامنة بتفاصيل التعارضات (إعادة/تجاهل)
- **`Dashboard.tsx`**: يستخدم `cachedRead` — يعرض بيانات مخزنة في وضع عدم الاتصال

### 🐛 تم الإصلاح (Fixed)
- **أخطاء الدفع أصبحت structured**: `syncService.pushChanges` كانت تُرجع أخطاء نصية `entity=... id=...: msg` يصعب مطابقتها — الآن `{entity, id, message}` وتُسجَّل JSON في `syncLog.errorMessage`، والـ client يطابقها بدقة
- استيراد ديناميكي غير ضروري في `SyncContext` (تقسيم الطابور) — استُبدل باستيراد ثابت

### ✅ الاكتمال
- `npm run build` (client) — نظيف
- `npx tsc --noEmit` (server) — نظيف
- **E2E مزامنة**: push أنشأ صنفاً (success) + pull سحب **30 سجلاً في 17 جدول**؛ وحالة الخطأ تُرجع `partial` مع أخطاء structured (حُذفت بيانات الاختبار)

---

## [0.1.2] - 2026-08-07 — Phase 2: الأساس الكامل للواجهة الأمامية (Frontend Core)

### ✨ الجديد (Added)
- **سكفولد Client كامل**: Vite 5 + React 18 + TypeScript + Tailwind CSS 3.4 + PWA (Workbox)
- **`client/vite.config.ts`**: منفذ **5175** + proxy `/api` → `http://localhost:3005` + VitePWA (manifest عربي RTL، navigates to `/`)
- **PWA جاهز**: `sw.js` + `manifest.webmanifest` يتولّدان من `npm run build` (7 precache entries)
- **طبقة API**: `client/src/lib/api.ts` — axios + JWT interceptor + `extractError` + `setTokens/clearTokens`
- **غلاف IndexedDB**: `client/src/lib/db.ts` — مخازن `syncQueue` / `cached` / `meta` + دوال `enqueue/getPendingQueue/markSynced/syncStats/cacheGet/cacheSet`
- **المصادقة**: `client/src/contexts/AuthContext.tsx` — login / logout / refreshUser عبر `auth/me`
- **واجهة التطبيق**: `components/Layout.tsx` — سايدبار RTL (10 وحدات) + مودال حالة المزامنة
- **الصفحات**: `Login.tsx` + `Setup.tsx` + `Dashboard.tsx` (إحصائيات + أحدث فواتير + تنبيهات مخزون + كشف أوفلاين) + `Placeholder.tsx`
- **`client/src/types.ts`**: أنواع مشتركة مع API (User, Company, Item, DashboardData, Paginated...)
- **`client/src/index.css`**: طبقات Tailwind جاهزة (`btn`/`input`/`card`/`table`) + خط Tajawal

### 🐛 تم الإصلاح (Fixed)
- تعارض منفذ 5173/5174 (مشغولان بمشاريع أخرى) — **اعتماد 5175** ثابت في vite.config.ts + `.env` + `.env.example`
- استيراد غير مستخدم في `Login.tsx` (TS6133) — حُذف حتى يمر الـ build
- اختبار `Invoke-WebRequest` على 5175 كان يفشل بسبب قيود PowerShell غير التفاعلي — تحققنا عبر لوج Vite + تسجيل دخول من خلال الـ proxy بنجاح

### ✅ الاكتمال
- `npm run build` (client) — **نظيف** مع توليد كامل لملفات PWA
- E2E: `POST http://localhost:5175/api/auth/login` عبر الـ proxy → JWT صحيح (role=admin)

---

## [0.1.1] - 2026-08-07 — Phase 1: قاعدة البيانات + اختبار التشغيل

### ✅ تم الإنجاز
- **MySQL جاهز**: database `psale_ultra` (utf8mb4) أُنشئت في XAMPP MariaDB 10.4.27
- **Migration**: `npx prisma migrate dev --name init` طُبق بنجاح — **41 جدول** في قاعدة البيانات
- **تشغيل فعلي**: server يتصل بقاعدة البيانات ويستمع على المنفذ
- **Smoke Test كامل**:
  - `GET /api/health` → `{ status: "ok" }` ✅
  - `POST /api/auth/setup` → شركة + فرع رئيسي + مخزن مركزي + 25 حساباً + مدير ✅
  - `POST /api/auth/login` → JWT access token (role=admin) ✅
  - `GET /api/reports/dashboard` (محمي) → يعمل بالتوكن ✅

### 🐛 تم الإصلاح
- **dotenv لم يُحمّل أبداً** — أُضيف `dotenv.config()` في `server/src/config/index.ts` (كانت قيم `.env` لا تُقرأ)
- **تعارض المنفذ 3000** — مشروع آخر (LYALINA) يستخدمه؛ **اعتماد PORT=3005 بشكل ثابت** في `.env` و `.env.example` و README
- **`DATABASE_URL`**: مطابقته مع البيئة الفعلية (root بدون كلمة مرور في XAMPP)
- **الإعداد الأولي**: المدير الآن يُربط تلقائياً بالفرع الرئيسي (`branchId`)

### 📄 توثيق
- **README.md** — دليل التثبيت والتشغيل (إنشاء DB، migrate، setup، API overview، أوامر مفيدة)
- **CHANGELOG.md** — هذا الملف
- **AGENTS.md** — تحديث حالة المراحل والقرارات

---

## [0.1.0] - 2026-08-07 — الأساس الكامل للـ Backend

### ✨ الإصدار الأول — Backend جاهز (TypeScript Clean)

أول نسخة قابلة للتشغيل من الخادم: قاعدة بيانات كاملة + منطق أعمال + REST API + WebSocket.

### 🆕 الجديد (Added)
- **هيكل Monorepo-lite**: `server/` + `client/` (فارغ) + `shared/`
- **Prisma Schema** (MySQL) — أكثر من 40 موديل:
  - الشركات، الفروع، المخازن، المستخدمون، الصلاحيات
  - الأصناف، الفئات، الماركات، الوحدات، الخصائص، الأطراف
  - المبيعات، عروض الأسعار، المشتريات، أوامر الشراء، الشحنات
  - التحويلات، الجرد، الأرقام التسلسلية، الضمان، الصيانة، RMA
  - الخزينة، السندات، القيود المحاسبية، دليل الحسابات
  - طابور المزامنة، سجل المزامنة، سجل التدقيق، الإشعارات
- **Shared Utils**: `generateNumber`، `generateBarcode`، `weightedAverage`، `toDecimal`
- **Shared Constants**: حالات السيريال، أنواع الحركات، أنواع القيود، الأدوار، حالات الدفع
- **11 خدمة أعمال**:
  - `authService` — تسجيل دخول، Refresh، إنشاء مستخدمين، إعداد أولي (Setup)
  - `saleService` — فواتير بيع/مرتجع، عروض أسعار، تحويل عرض، ضمان تلقائي، سيريال
  - `purchaseService` — أوامر شراء استيراد (USD)، استلام + Landed Cost، شراء مباشر
  - `inventoryService` — حركات مخزون، متوسط تكلفة موزون، جرد، سيريال
  - `accountingService` — قيود تلقائية، عكس قيد، دفتر أستاذ، ميزان مراجعة، قائمة دخل، ميزانية
  - `treasuryService` — سندات قبض/صرف، خزائن، عملات
  - `reportService` — 8 تقارير + Dashboard
  - `syncService` — Push/Pull/Status
  - `exchangeRateService` — جلب سعر صرف يومي
  - `notificationService` — Email/WhatsApp (stub جاهز)
  - `barcodeService` — توليد باركود/QR
- **17 ملف مسارات REST** مع middleware (auth/authorize/audit/rate-limit/error)
- **Socket.IO** مع company rooms و `emitSyncEvent`
- **Middleware** كاملة: JWT auth، أدوار، سجل تدقيق، معالجة أخطاء، معدل طلبات

### 🐛 تم الإصلاح (Fixed) — خلال مرحلة الترميز
- توازن الأقواس في `saleService` (TS1005) — قوس `}` مفقود في كتلة الضمان
- أخطاء Decimal → number في `accountingService` (عكس القيد، الأرصدة)
- أخطاء TS2322/TS2365/TS2362 في `inventoryService` و `reportService` (عمليات على Decimal)
- أخطاء `jsonwebtoken` v9 types في `authService` (expiresIn)
- تضارب `select` + `include` في `settings.ts` (المستخدمون)
- استيراد مفقود `./routes/transfers` — إنشاء `transfers.ts` جديد + نقل تحويلات المخزون إليه
- حقول غير موجودة في `purchaseService` (`totalLyd`، `unitPrice`) — مطابقتها مع الـ schema
- `rootDir` في `tsconfig` — تعديله ليشمل `shared/` + تحديث مسار التشغيل
- مقارنات Decimal في `processCountItem` و `stockMovementReport`

### 🔧 التحسينات (Changed)
- `tsconfig.json`: `rootDir: ".."` + `outDir: "./dist"` لدعم مجلد `shared/` المشترك
- `package.json`: `main` و `start` → `dist/server/src/app.js`
- `.env.example`: تصحيح الرابط إلى MySQL (كان PostgreSQL)
- بنية مسارات التحويلات موحدة تحت `/api/transfers`

### ✅ الاكتمال
- `npx tsc --noEmit` — **صفر أخطاء**
- `npm run build` — نجاح + إخراج صحيح (`dist/server/src/app.js` + `dist/shared/*`)

### 📄 توثيق
- إضافة `AGENTS.md` — دستور المشروع (الرؤية، القرارات الدستورية، Roadmap، قواعد التطوير، آلية التحديث الذاتي)
- إضافة `README.md` — دليل التثبيت والتشغيل وواجهة API
- إضافة `CHANGELOG.md` — هذا الملف

---

## [قبل الإصدار] — سجل سابق غير مهيكل

- مسح وتحليل المنظومة الأصلية P-Sale Ultra (Delphi/Paradox) من `D:\ERP-Projects\P-Sale Ultra`
- إعداد المخطط التفصيلي الكامل (DB + API + UI + الجدول الزمني)
- إنشاء المشروع وتثبيت الاعتماديات وتوليد Prisma Client

---

> التنسيق التقليدي للـ Changelog:
> - **Added** = إضافات جديدة
> - **Changed** = تغييرات على الوظائف الحالية
> - **Deprecated** = ميزات أصبحت قيد الإهمال
> - **Removed** = حذف
> - **Fixed** = إصلاح أخطاء
> - **Security** = إصلاحات أمنية
