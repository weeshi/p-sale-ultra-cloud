# 📋 Master Todo — المخطط الرئيسي لاستكمال P-Sale Ultra Cloud

> **ملف حيوي قابل للتعديل والتحديث** — يعكس خطوات التنفيذ المتبقية (المراحل 8 → 11) حتى اكتمال النظام.
> الحالات: `⬜` لم تبدأ · `🔄` جارية · `✅` اكتملت · `⛔` ملغاة/مؤجلة.
> عند إكمال أي مهمة: حدّث الحالة + عمود الملاحظات + سطر "آخر تحديث" في الأسفل.

---

## 🧭 الوضع العام

| البند | الحالة |
|--------|--------|
| الـ Backend (المراحل 8-10) | ✅ **جاهز 100%** — المتبقي **Frontend فقط** |
| المرحلة 8 — المحاسبة | ✅ **8.1-8.10 مكتملة** |
| المرحلة 9 — الخزينة | ✅ **9.1-9.7 مكتملة** |
| المرحلة 10 — الإعدادات | ✅ **10.1-10.6 مكتملة** |
| المرحلة 11 — التلميع والنشر | ✅ **مكتملة** — 11.1 Unit + 11.2 Integration + 11.3 E2E + 11.4-11.9 (Docker/CI/Monitoring/Backup/SSL/Security) |
| تحسينات ما بعد الإطلاق | ✅ **مكتملة** — أكواد تلقائية (ITM/PTY) + Pagination + تصنيف محسّن (241 صنف + 41 براند) |
| **عزل الفروع — المرحلة A (واجهة المستخدم + القراءات)** | ✅ **مكتملة** — `BranchFilterContext`/`BranchFilterSelect` + ربط `branchId` في المبيعات/المشتريات/الجرد/لوحة المعلومات/كل تبويبات `ReportsHub`/صفحات وحدة المخزون + **عزل القراءات سيرفراً** عبر `resolveBranchScope` (انظر 11.10) — المتبقي 🟡: تحقق ملكية الموارد في خدمات الكتابة + `canViewAllBranches` |
| **الجرد التصحيحي (المراحل B–E)** | ✅ **مكتملة** — B: `GET /inventory/counts/:id` + `getCountById` (إصلاح 404) · C: migration `20260820000000_add_inventory_count_corrective` (`parent_count_id` self-relation + FK `created_by`/`posted_by` → users) · D: `POST /inventory/counts/:id/corrective` + `createCorrectiveCount` (من posted، من الرصيد الحي، تحقق ملكية الفرع) · E: عمود «منفذ الجرد» + زر «🔄 جرد تصحيحي» + عرض فرعي بادئ في `InventoryCounts.tsx` — ✅ **اختبار وحدة (2026-09-05)**: `inventoryCountCorrective.test.ts` — 5/5 (ترقيم CNT + بذر بنود من الرصيد الحي + رفض أصل غير موجود/غير مرحّل/فرع غريب + السماح بلا قيد فرع) → **72/72 في npm test** |
| **هيكل الخزائن بالفرع + إصلاح tsc** | ✅ **مكتملة** — إصلاح `purchaseService.ts:288` (`po.branchId` بدلاً من `branchId` غير المُعرَّف في `receivePurchaseOrder`) · `branchId` مُضاف إلى `Treasury` + `BankReconciliation` (migration `20260823140000_add_branch_to_treasury_reconciliation`) · `updatedAt` لـ `Treasury` · 2 خزينة لكل فرع (cash + bank) عبر seed (idempotent) · `treasury.ts` مع `resolveBranchScope` + تحقق ملكية الفرع · `Treasuries.tsx`/`Receipts.tsx`/`LocalPurchaseInvoice.tsx` مع فلتر فرع `useBranchFilter` · `LocalPurchaseInvoice.tsx` يمرر `branchId` في `offlineWrite` · المعاملات بالدولار تُحوَّل للدينار عبر `exchangeRate` — تحقق: `tsc` نظيف + `npm test` **58 ✅** + `vite build` ✅ + `pm2 restart` ✅ |
| **تحسينات المبيعات/المشتريات/الخزائن/العملاء (المراحل الخمس)** | ✅ **مكتملة** — **1)** `Sales.tsx`: `payType` ثلاثي (cash/credit/banking) + `bankingService` + select 7 خدمات مصرفية + فلترة يوم + 3 أعمدة (كاش/آجل/صكوك+مصرفي) + توجيه خزينة تلقائي. **2)** `LocalPurchaseInvoice.tsx`: نفس التعديلات. **3)** `Receipts.tsx`: إصلاح `.catch()` + `parties` parsing + `branchId`. **4)** `PartyProfile.tsx`: مودال بروفايل طرف كامل مُربط بـ `Parties.tsx` عبر زر "👁️". **5)** `PartyLedger.tsx`: إصلاح `parties` response + `.catch()` error display — تحقق: `tsc` نظيف + **58 ✅** + `vite build` ✅ + `pm2 restart` ✅ |
| **نظام الترخيص (License System)** | ✅ **مكتمل** — 12.1 ✅ (توليد مفاتيح Ed25519) + 12.2 ✅ (Prisma Schema + Migration) + 12.3 ✅ (License Service) + 12.4 ✅ (Offline Signing CLI **+ Web UI محلية**) + 12.5 ✅ (API Routes) + 12.6 ✅ (checkLicense Middleware) + 12.7 ✅ (App Integration) + 12.8 ✅ (Admin UI) + 12.9 ✅ (Unit Tests **67**) + 12.10 ✅ (Issuer Web UI للمدير) |
| **ترحيل الموردين من CustVend.DB** | ✅ **مكتملة** — أداة `server/scripts/migrate-custvend-vendors.ts` + سكربت npm `migrate:vendors`: فك CP1256 عبر `TextDecoder('windows-1256')` (مطابق لـ .NET)، مسح توقيع `80 00 00` عند rel6-8، 73 سجلاً فعلياً → **استُورد 65 مورداً** (`PTY-000006`..`PTY-000070`) بتخطّي 8 حسابات داخلية، ترانزاكشن واحدة + كشف تكرار بالاسم + `notes` بمرجع الرقم القديم — **Idempotent** (الإعادة: «استُورد 0 ∥ مكرر 65 ∥ داخلي 8») — تحقق: `tsc --noEmit` نظيف + `npm test` **67 ✅** |
| **النسخ الاحتياطي الخارجي المشفر** | ✅ **مكتملة (2026-08-29)** — `scripts/backup.ps1`/`backup.sh` يشفّران (openssl **AES-256-CBC + pbkdf2 iter 100000**) ويرفعان إلى **Google Drive عبر rclone** (`gdrive:p-sale-backups`) + استبقاء عن بُعد (30 يوم) + حذف `.enc` المحلي القديم + أداة استرداد `decrypt-backup.ps1` — تحقق حي: تشفير ← رفع ← تنزيل ← فك (hash مطابق + gzip سليم 487KB SQL) |
| **المرحلة 15 — إحكام البنية المعمارية (Architectural Hardening)** | ✅ **مكتملة (2026-10-25)** — 15.1 ✅ ترتيب Middleware في `app.ts` + ربط `checkLicense` داخل `authenticate` (مع كاش 60ث) · 15.2 ✅ توجيه كامل لخدمات الأعمال في `syncService.applyChange` + كيانات الكتالوج · 15.3 ✅ عزل `companyId` + فرض `branchId` في المسار العام · 15.4 ✅ جدول `SyncOperation` + `clientOpId` لمنع التكرار + مطابقة `queueId` · 15.5 ✅ توحيد `canViewAllBranches` و `branchId=all` · 15.6 ✅ `syncService.test.ts` (13 اختباراً) — تحقق: `tsc` نظيف (server+client) + **85 ✅** + تكامل **3 ✅** + بناء server/client ✅ + فحص حي |

**ترتيب التنفيذ المقترح**: 8 (محاسبة) ← 9 (خزينة) ← 10 (إعدادات) ← 11 (تلميع ونشر).
لا يمكن تبديل الترتيب جزئياً: 8 → 9 (السندات تخلق قيوداً) → 10 (سعر الصرف يُفعَّل من الإعدادات). إن رغبت بتفعيل سعر الصرف مبكراً يمكن تقديم **10.4** قبل 9.

---

## 📌 المرحلة 8 — صفحات المحاسبة (Frontend فقط)

**Hub**: محور تبويبات `AccountingHub.tsx` (دليل الحسابات/دفتر اليومية/ميزان المراجعة/قائمة الدخل/الميزانية/دفاتر الأستاذ) + مسارات `/accounting/*` بدل `Placeholder`.

| # | المهمة | الواجهة + المسار | الـ API | ملاحظات | الحالة |
|---|--------|------------------|---------|---------|--------|
| 8.1 | **قائمة القيود (دفتر اليومية)** — فلاتر (فترة `from/to`، نوع `type`، ترقيم صفحات `page/limit`) + عرض | `JournalEntries.tsx` → `/accounting/journal` | `GET /api/journal` | `isPosted: true`؛ صفوف قابلة للتوسيع لعرض السطور (debit/credit/حساب). Offline-first عبر `cachedRead('journal', ...)` | ✅ |
| 8.2 | **تفاصيل قيد** — مودال/صفحة تعرض الرأس + السطور + منشئه + زر **عكس** | داخل `JournalEntries.tsx` | `GET /api/journal/:id` + `POST /api/journal/:id/reverse` | العكس عبر `reverseJournalEntry` (منطق جاهز). تأكيد قبل العكس (إلغاء لا رجعة فيه عملياً) | ✅ |
| 8.3 | **إنشاء قيد يدوي** — تاريخ/نوع/وصف + سطران على الأقل (حساب/مدين/دائن) + **تحقق توازن** قبل الإرسال | مودال ضمن `JournalEntries.tsx` | `POST /api/journal` | الأدوار المسموحة: admin/manager/accountant. تعطيل الزر إن `totalDebit !== totalCredit`. أنواع القيود من `shared/constants.ts` | ✅ |
| 8.4 | **ميزان المراجعة** — جدول (كود/اسم/مدين/دائن/الرصيد) + إجماليات + فلتر `asOf` | `TrialBalance.tsx` → `/accounting/trial-balance` | `GET /api/journal/reports/trial-balance?asOf=` | استدعاء `getTrialBalance` (منطق جاهز). زر طباعة/تصدير | ✅ |
| 8.5 | **قائمة الدخل** — فترة `from/to` + بنود الإيرادات/المصروفات + صافي الربح | `IncomeStatement.tsx` → `/accounting/income-statement` | `GET /api/journal/reports/income-statement?from=&to=` | استدعاء `getIncomeStatement:319`. افتراضياً بداية السنة → اليوم | ✅ |
| 8.6 | **الميزانية العمومية** — أصول/خصوم/حقوق ملكية + توازن | `BalanceSheet.tsx` → `/accounting/balance-sheet` | `GET /api/journal/reports/balance-sheet?asOf=` | استدعاء `getBalanceSheet:376` | ✅ |
| 8.7 | **دليل الحسابات** — شجرة (parent/children) + إنشاء/تعديل حساب + معالجة `409` عند تكرار الكود | `ChartOfAccounts.tsx` → `/accounting/accounts` | `GET /api/accounts` · `POST /api/accounts` · `PUT /api/accounts/:id` | `P2002 → 409 "كود الحساب مكرر"`. أنواع الحسابات من `shared/constants.ts` | ✅ |
| 8.8 | **دفتر أستاذ حساب** — اختيار حساب + فترة + حركات (مدين/دائن/رصيد تراكمي) | `AccountLedger.tsx` → `/accounting/accounts/:id/ledger` (و`/accounting/ledger`) | `GET /api/accounts/:id/ledger?from=&to=` | استدعاء `getAccountLedger:189` | ✅ |
| 8.9 | **كشف حساب طرف (عميل/مورد)** — اختيار طرف + فترة + أرصدة | `PartyLedger.tsx` → `/accounting/party-ledger` | `GET /api/accounts/party/:partyId/ledger?from=&to=` | استدعاء `getPartyLedger:232`. اختيار الطرف عبر `GET /api/parties` | ✅ |
| 8.10 | **الدمج** — `AccountingHub.tsx` (تبويبات 8.1-8.9) + مسارات في `App.tsx` + إزالة `Placeholder` للمحاسبة | `components/AccountingHub.tsx` | — | تحويل زر `/accounting` في `Layout.tsx` ليفتح المحور. Types جديدة في `types.ts` (JournalEntry/Line/TrialBalance/… بلا `any`) | ✅ |

**أنواع جديدة مطلوبة في `client/src/types.ts`** (م8): `JournalEntry`, `JournalLine`, `Account`, `TrialBalanceRow`, `IncomeStatementRow`, `BalanceSheetSection`, `LedgerRow`.

---

## 📌 المرحلة 9 — صفحات الخزينة (Frontend فقط)

**Hub**: `TreasuryHub.tsx` (خزائن/سندات قبض وصرف/كشف حركات) + مسارات `/treasury/*`.

| # | المهمة | الواجهة + المسار | الـ API | ملاحظات | الحالة |
|---|--------|------------------|---------|---------|--------|
| 9.1 | **إدارة الخزائن** — قائمة (cash/bank + عملة + رصيد + حساب مرتبط) + إنشاء | `Treasuries.tsx` → `/treasury` | `GET /api/treasury` · `POST /api/treasury` | إنشاء authorize admin/manager. عرض `account` المضمّن | ✅ |
| 9.2 | **قائمة سندات القبض والصرف** — فلاتر (فترة، نوع، خزينة، طرف، صفحات) + عدّاد RCV/PAY | `Receipts.tsx` → `/treasury/receipts` | `GET /api/treasury/receipts?from=&to=&type=&treasuryId=&partyId=&page=&limit=` | تبويب أو مفتاح `receipt/payment`. رموز `RCV/PAY` من SequenceService | ✅ |
| 9.3 | **تفاصيل سند** — مودال (طرف، خزينة، عملة، سعر صرف، طريقة دفع/شيك، قيد محاسبي مرتبط) | داخل `Receipts.tsx` | `GET /api/treasury/receipts/:id` | includes: party/treasury/journalEntry | ✅ |
| 9.4 | **إنشاء سند قبض/صرف** — نوع + طرف (اختياري) + خزينة + عملة/سعر صرف (مزدوج LYD/USD) + طريقة دفع/شيك + ربط فاتورة بيع/شراء | مودال ضمن `Receipts.tsx` | `POST /api/treasury/receipts` | الأدوار: admin/manager/accountant/cashier. اعرض سعر الصرف الحالي عبر `GET /api/exchange/rate/USD/LYD` كاقتراح. الربط `saleInvoiceId`/`purchaseInvoiceId` | ✅ |
| 9.5 | **طباعة سند** | `lib/print.ts` + زر داخل المودال | — | قالب طباعة RTL (سند قبض/صرف) مشابه لفواتير البيع | ✅ |
| 9.6 | **الدمج** — `TreasuryHub.tsx` + مسارات + إزالة `Placeholder` + أنواع (`Treasury`, `Receipt`) في `types.ts` | `components/TreasuryHub.tsx` | — | — | ✅ |
| 9.7 | **تسوية بنكية** | `BankReconciliation.tsx` → `/treasury/reconciliation` | `GET /api/treasury/reconciliations/:treasuryId/transactions?from=&to=` · `GET/POST /api/treasury/reconciliations` · `GET /api/treasury/reconciliations/:id` · `POST /api/treasury/reconciliations/:id/complete` | **Backend + Frontend مكتملان**: موديلا `BankReconciliation`/`BankReconciliationLine` (هجرة `add_bank_reconciliation`) + `reconciliationService` (getBankTransactions/createReconciliation/list/get/complete داخل ترانزاكشن + بادئة `RC`) + `syncService` (كيان `bankReconciliation` + إعادة توجيه create) + صفحة تسوية (اختيار خزينة بنكية + جلب السندات + مطابقة ✓ + رصيد/فرق + إغلاق) | ✅ |

---

## 📌 المرحلة 10 — صفحات الإعدادات (Frontend فقط + تعديلات يسيرة)

**Hub**: `SettingsHub.tsx` (تبويبات: الشركة/المستخدمون/الفروع والمخازن/أسعار الصرف/سجل التدقيق) + مسارات `/settings/*`. إعدادات الكتالوج (فئات/ماركات/وحدات/خصائص) موجودة في `CatalogSettings.tsx` وتُدمج كتبويب اختياري.

| # | المهمة | الواجهة + المسار | الـ API | ملاحظات | الحالة |
|---|--------|------------------|---------|---------|--------|
| 10.1 | **بيانات الشركة** — الاسم/العنوان/الهاتف/الضريبة/الشعار/بداية السنة المالية | `CompanySettings.tsx` → `/settings/company` | `GET /api/settings/company` · `PUT /api/settings/company` | PUT authorize admin فقط | ✅ |
| 10.2 | **المستخدمون والصلاحيات** — قائمة (نشط/آخر دخول/فرع) + تعديل الدور والفرع والصلاحيات لكل وحدة (view/add/edit/delete/print) | `UsersSettings.tsx` → `/settings/users` | `GET /api/settings/users` · `PUT /api/settings/users/:id` | PUT يمسح ويعيد إنشاء `permissions` في ترانزاكشن (عبر `offlineWrite` بكيان `user`). لا إنشاء مستخدم حالياً — يُنشأ عبر setup (يلزم مناقشة إضافة `POST /users` لاحقاً) | ✅ |
| 10.3 | **الفروع والمخازن** — فروع (اسم/كود/رئيسي) + مخازن (اسم/كود/فرع/نوع) | `BranchesWarehouses.tsx` → `/settings/branches` | `GET /api/warehouses/branches` · `POST /api/warehouses/branches` · `GET /api/warehouses` · `POST /api/warehouses` | عمودان (فروع/مخازن) + مودال إنشاء لكل منهما عبر `offlineWrite` (كيانا `branch`/`warehouse`) | ✅ |
| 10.4 | **أسعار الصرف** — السعر الحالي + تحديث يدوي (USD→LYD) + سجل تاريخي + تحديث تلقائي | `ExchangeRates.tsx` → `/settings/exchange-rates` | `GET /api/exchange/rate/:from/:to` · `POST /api/exchange` · `GET /api/exchange/history/:from/:to` · `POST /api/exchange/update` | **نُقل السعر الافتراضي**: `LocalPurchaseInvoice.tsx` + `ImportOrderCreate.tsx` تقرآن الآن السعر الحي من `/exchange/rate/USD/LYD` عند الفتح (مع احتياطي 8.5) | ✅ |
| 10.5 | **سجل التدقيق** — جدول (مستخدم/جدول/إجراء/قبل/بعد/وقت) + فلتر جدول + صفحات | `AuditLogs.tsx` → `/settings/audit-logs` | `GET /api/settings/audit-logs?tableName=&page=&limit=` | includes user (username/fullName). صف قابل للتوسيع يعرض old/newValues (JSON) | ✅ |
| 10.6 | **الدمج** — `SettingsHub.tsx` + مسارات + إزالة `Placeholder` + أنواع (`Company`, `SystemUser`, `AuditLog`) في `types.ts` | `components/SettingsHub.tsx` | — | تبويبات: الشركة/المستخدمون/الفروع والمخازن/أسعار الصرف/سجل التدقيق + مسارات `/settings/*` | ✅ |

---

## 📌 المرحلة 11 — التلميع والنشر (Backend + Frontend + DevOps)

| # | المهمة | التفاصيل | الحالة |
|---|--------|----------|--------|
| 11.1 | **Unit Tests (Server)** | Jest + Supertest: `accountingService` (قيد/توازن/عكس)، `sequenceService` (تزامن/عدم تكرار)، `treasuryService.createReceipt`، `transferService` (قواعد الحالة) | ✅ **33 اختباراً ناجحاً** — Jest + ts-jest + mocked prisma |
| 11.2 | **Integration Tests** | مصفوفة MySQL اختبارية (DB منفصلة) + اختبار رحلات كاملة: بيع←قيد←سند قبض، شراء استيراد←استلام←Landed Cost | ✅ **مكتمل** — `npm run test:integration`: `scripts/setup-integration-db.cjs` (DROP/CREATE `psale_ultra_test` + `prisma migrate deploy`) ثم `jest --config jest.integration.config.cjs`؛ `tests/integration/spine.integration.test.ts` (3 اختبارات): بيع ← قيدان (إيراد/تكلفة) + أرصدة، سند قبض على خزينة بنكية ← قيد + تسديد فاتورة + رصيد الخزينة، وتسوية بنكية (9.7) متوازنة ← إغلاق. Supertest على `app` مستورَد (guard `require.main === module` في app.ts) |
| 11.3 | **E2E (Playwright)** | سيناريو تسجيل دخول + إنشاء فاتورة بيع + طباعة؛ اختبار Offline (مزامنة عند العودة) | ✅ **مكتمل** — `@playwright/test` في client + `playwright.config.ts` (channel chrome بدل Chromium محجوب، بدون فيديو، webServer server/client + reuseExistingServer). `e2e/auth.spec.ts` (دخول خاطئ/صحيح) + `e2e/sales.spec.ts` (فاتورة نقدية + طباعة popup + تحقق INV عبر API) + `e2e/offline.spec.ts` (setOffline ثم مزامنة) — **5/5 ✅** و**10/10 مع repeat-each=2** عبر `npm run test:e2e`. **إصلاحات كشفها الاختبار**: `getPendingQueue` (IDBKeyRange.only(false) غير صالح) + `authLimiter` (رفع حد dev) + **2026-08-28**: تسمية الخزينة `الخزينة *` في `offline.spec.ts`+`sales.spec.ts` (تسمية `Sales.tsx:713` الحالية) + `getByTitle('تسجيل الخروج').first()` في `auth.spec.ts` (زرّا خروج: سطح مكتب + موبايل `lg:hidden`) — **الحالة: auth 3/3 + sales 1/1 + offline 1/1 ✅** |
| 11.4 | **Docker + Compose** | `Dockerfile` للـ server (Build multi-stage) + nginx لـ client/الـ PWA + `docker-compose.yml` (app + mysql:8 + nginx + volumes) | ✅ **الملفات جاهزة** (server/client Dockerfiles + nginx.conf + compose بمرحلة migrate) — لم تُجرَّب (لا Docker مثبّت محلياً) |
| 11.5 | **CI/CD** | GitHub Actions: typecheck + test (server) + build (client) عند كل PR/merge — `.github/workflows/ci.yml` | ✅ **مكتمل** — jobs منفصلة server (tsc + jest + build) وclient (tsc + vite build) على Node 20 مع caching |
| 11.6 | **Monitoring & Logging** | winston + health-check + تجميع أخطاء بسيط + مدة استجابة | ✅ **مكتمل** — `httpLogger` (طريقة/مسار/كود/زمن) بمستوى `http` في winston + `/api/health` موسّع (db ping + uptime + 503 عند انقطاع DB) + معالجة `unhandledRejection`/`uncaughtException` + `errorHandler` عبر logger بدل console |
| 11.7 | **Backup Strategy** | سكربت `mysqldump` دوري + جدولة + استعادة موثقة + اختبار استعادة | ✅ **مكتمل** — `scripts/backup.sh` + `backup.ps1` (تحليل DATABASE_URL + ضغط gzip + استبقاء 7 أيام + دليل بعيد اختياري) + `scripts/restore.sh` + `restore.ps1` |
| 11.8 | **Production Env & SSL** | `.env.production` + HTTPS (Caddy/nginx) + reverse-proxy `/socket.io → 3005` + strict headers | ✅ **مكتمل** — `server/.env.production` (مثال) + `deploy/Caddyfile` (Let's Encrypt تلقائي + headers) + `deploy/nginx-ssl.conf` (TLS termination + strict headers) + `trust proxy` في app.ts |
| 11.9 | **Security Audit** | مراجعة JWT، rate-limit، تعقيد كلمة المرور، صلاحيات أدنى، فحص الحزم | ✅ **مكتمل** — server `npm audit` = **0** (حُذف `uuid`+`xlsx` غير المستخدمين، ترقية `nodemailer ^9.0.5`) + client: **`react-router-dom ^7.18.2`** يصلح CVE-2025-68470 + `.gitignore` يمنع تسريب `.env` + `trust proxy` خلف الـ proxy. **موثَّق كمخاطرة مقبولة**: esbuild عبر vite 5 (dev-server فقط — لا يُشحن للإنتاج؛ الإصلاح يتطلب vite 8 الناشئ) |
| 11.10 | **Branch-Level Isolation Implementation** | عزل البيانات على مستوى **(User + Branch)** في وضع الأوفلاين: مفتاح كاش مركب `table:${table}:user:${userId}:branch:${branchId}` في IndexedDB، طابور `syncQueue` يحمل `userId`/`branchId` مع تحقق السيرفر من الهوية (لا ثقة بالعميل)، التحقق من ملكية الموارد في `saleService`/`purchaseService`/`inventoryService`، تسجيل الأحداث الأمنية (`BRANCH_ACCESS_DENIED`/`IDENTITY_TAMPERING`) في `AuditLog` مع فلتر في `AuditLogs`، سياسة احتفاظ الكاش (آخر 3 مستخدمين) | ✅ **منفَّذ في الكود (المرحلة 3 — العميل + السيرفر)**: Namespacing كامل في IndexedDB (`client/src/lib/session.ts` + `offline.ts` + `SyncContext` + `AuthContext`) + توقيع `syncQueue` باسكوب + تحقق `syncService.pushChanges` من التوكن (رفض التزوير/الفرع الغريب + `logSecurityEvent`) + عمود `event_type` (migration `20260819210000_add_audit_event_type`) + فلتر «الأحداث الأمنية» في `AuditLogs.tsx` + `pruneOldUserCaches` (آخر 3 مستخدمين) + **المرحلة A (الواجهة + القراءات)**: `BranchFilterContext`/`BranchFilterSelect` + ربط `selectedBranchId` (مفتاح كاش + `?branchId=`) في Sales/Purchases/InventoryCounts/Dashboard/ReportsHub (كل التبويبات)/StockMovements/StockValuation/LowStock + **`resolveBranchScope(req)`** في `middleware/auth.ts` يُجبر المستخدم المربوط بفرع على فرعه في `GET /warehouses`+`/sales`+`/purchases`+`/inventory/counts`+كل `/reports/*`. المتبقي 🟡: تحقق ملكية الموارد التفصيلي في خدمات الكتابة + التقارير الموحّدة `canViewAllBranches` |

---

## 📌 المرحلة 12 — نظام الترخيص (License System)

**النظام**: Ed25519 + Hardware Binding + Air-gapped Signing — لا مفاتيح خاصة في الإنتاج.

| # | المهمة | التفاصيل | الحالة |
|---|--------|----------|--------|
| 12.1 | **توليد مفاتيح Ed25519** | CLI `generate-license-keys.ts` → `.keys/private_key.pem` + `.keys/public_key.pem` + تحديث `.gitignore` | ✅ **مكتمل** |
| 12.2 | **Prisma Schema** | `License` (hwHash String إجباري) + `LicenseFeature` + Migration | ✅ **مكتمل** |
| 12.3 | **License Service** | `verifyLicense` (public key فقط)، `validateLicense` (hwHash + expiry)، `generateHardwareHash` (CPU+MAC)، `checkFeature`، `activateLicense`، `deactivateLicense`، trial logic | ✅ **مكتمل** |
| 12.4 | **Offline Signing CLI + Web UI** | `sign-license.ts` CLI (يتطلب `--companyId --hwHash --tier`) **أو** واجهة الويب المحلية `license-issuer` — كلاهما يقرأ Private Key من `.keys/` عبر `scripts/licenseLib.ts` المشتركة، يوقع، يخرج Base64 | ✅ **مكتمل** |
| 12.5 | **API Routes** | `/api/license` — activate (admin) + info (admin) + deactivate (admin) + verify (any) + features (any) + check/:feature (any) + all (superAdmin) + machine-id (public) — **بدون generate** | ✅ **مكتمل** |
| 12.6 | **Middleware** | `checkLicense` — يفرض التحقق على كل `/api/*` ما عدا health/auth/license — يcrop `req.license` | ✅ **مكتمل** |
| 12.7 | **App Integration** | تسجيل routes + middleware في `app.ts` + config `license.publicKeyPath` + `.env.example` | ✅ **مكتمل** |
| 12.8 | **Admin UI** | `LicenseSettings.tsx` في SettingsHub — Machine ID + حالة الترخيص + تفعيل/إلغاء + عرض الميزات + شريط تجريبي | ✅ **مكتمل** |
| 12.9 | **Unit Tests** | 9 اختبارات: generateHardwareHash + verifyLicenseSignature (valid/invalid/missing key) + TIER_FEATURES (4 tiers) | ✅ **مكتمل** — **67 إجمالي** |
| 12.10 | **Issuer Web UI للمدير** | `server/scripts/license-issuer/` — أداة ويب محلية (127.0.0.1:3333) توقّع تراخيص بدل CLI بنفس الأمان (المفتاح الخاص لا يغادر الجهاز): نموذج RTL عربي (companyId/hwHash/tier/expiry/حدود/ميزات تلقائية حسب المستوى/ملاحظات) + `POST /api/issue` (توقيع عبر `licenseLib.ts` — ناتج مطابق للـ CLI بايتاً) + `POST /api/verify` (تحقق بالمفتاح العام) + سجل إصدارات JSONL محلي `issued-licenses.log` + `npm run license:issuer` | ✅ **مكتمل** — تحقق حي: sign→verify صحيح + تالف يُرفض + 400s للتحقق + سجل مكتوب |

---

## 📌 المرحلة 15 — إحكام واستكمال البنية المعمارية (Architectural Hardening)

> **الهدف**: إغلاق الثغرات الهندسية المكتشفة في مراجعة الكود النهائية للوصول إلى جاهزية معمارية بنسبة **100%**.

| # | المهمة | الملفات المستهدفة | التشخيص الهندسي الدقيق (Root Cause) | خطة الحل المعتمدة | الحالة |
|---|--------|-------------------|--------------------------------------|-------------------|--------|
| **15.1** | **إصلاح ترتيب الـ Middleware في Express وربط `checkLicense`** | `server/src/app.ts` (الأسطر 58–116) · `server/src/middleware/auth.ts` · `server/src/middleware/license.ts` | 1) `httpLogger` (السطر 114) و `apiLimiter` (السطر 106) و `checkLicense` (السطر 104) مسجّلة **بعد** `app.use('/api/...', routes)`؛ وفي Express عندما يردّ المسار بـ `res.json()` يتوقف التسلسل فلا تعمل هذه الوسطاء.<br>2) `checkLicense` يحتاج `req.companyId` الذي يُحقن داخل `authenticate` (المستدعى داخل كل ملف route)، فحتى لو نُقل `checkLicense` قبل المسارات في `app.ts` سيكون `req.companyId === undefined` فيتخطى الفحص (`if (!req.companyId) return next()`). | 1) نقل `app.use(httpLogger)` و `app.use('/api', apiLimiter)` في `app.ts` لتعمل **قبل** تسجيل مسارات `/api/*`.<br>2) استدعاء `checkLicense` تلقائياً في نهاية `authenticate` بعد تعيين `req.companyId` (مع استخدام `req.originalUrl.split('?')[0]` لفحص المسارات المستثناة مثل `/api/license/*`). | ✅ |
| **15.2** | **استكمال توجيه خدمات الأعمال في `syncService.applyChange`** | `server/src/services/syncService.ts` (الأسطر 85–288) | العمليات المؤجلة أوفلاين لـ `saleInvoice`، `receipt`، `journalEntry`، `bankReconciliation`، و`stockMovement (damaged)` موجّهة لخدماتها، بينما الكيانات التالية تسقط في المسار الخام (`model.create`) فتتجاوز `SequenceService` والقيود المحاسبية وحركات المخزون:<br>• `purchaseInvoice` (`createDirectPurchase` أو `receivePurchaseOrder`)<br>• `purchaseOrder` (`createPurchaseOrder`)<br>• `quote` (`saleService.createQuote`)<br>• `stockTransfer` (`transferService.createTransfer`)<br>• `inventoryCount` (`inventoryService.createCount` أو `processCountItem`)<br>• `item` (`create` مع توليد `ITM-XXXXXX` + `openingStock` + `attributes`)<br>• `party` (`create` مع توليد `PTY-XXXXXX` + `currentBalance`)<br>• `categories`/`brands`/`units`/`attributes` من `CatalogSettings.tsx` غير مضافة في `entityMap`. | إضافة معالجات صريحة في `syncService.applyChange` توجه كل كيان من الكيانات أعلاه إلى خدمة الأعمال المقابلة (`purchaseService`, `saleService`, `transferService`, `inventoryService`, `sequenceService`) + إضافة `categories → category`, `brands → brand`, `units → unit`, `attributes → attribute` إلى `entityMap`. | ✅ |
| **15.3** | **عزل `companyId` في المسار العام للـ `syncService`** | `server/src/services/syncService.ts` (الأسطر 265–284) | في المسار العام لـ `update` و `delete`:<br>`model.findUnique({ where: { id } })` و `model.update({ where: { id } })` و `model.delete({ where: { id } })` لا تتحقق من `companyId`، مما قد يسمح نظرياً بتعديل/حذف سجل يتبع شركة أخرى إذا زُوّر `id`. | التحقق عبر `model.findFirst({ where: { id, companyId } })` (للجداول التي تملك `companyId`، أو `id === companyId` لجدول `company`) قبل أي `update` أو `delete`، ورمي خطأ عدم وجود/صلاحية عند التخالف. | ✅ |
| **15.4** | **مطابقة `queueId` ومنع التكرار (Idempotency) في المزامنة** | `client/src/contexts/SyncContext.tsx` (الأسطر 97–130) · `client/src/lib/db.ts` · `server/src/services/syncService.ts` | 1) **خلل تتبع أخطاء المزامنة**: `SyncContext` يرسل `id: item.recordId` (وهو `undefined` عند `create`)، ثم يفحص `failedIds.has(item.id)` (حيث `item.id` هو مفتاح `syncQueue` في IndexedDB)! النتيجة: إذا فشلت عملية `create` أوفلاين على السيرفر، يُرجع السيرفر `err.id = null` فيعتبرها العميل ناجحة (`markSynced`) ولا يظهرها في نافذة التعارضات `conflicts`!<br>2) **عدم التكرار (Idempotency)**: إذا انقطع الاتصال أثناء `/sync/full` بعد تنفيذ السيرفر وقبل وصول الرد للعميل، تعيد المحاولة التالية إرسال نفس عناصر الطابور فتتكرر الفواتير/السندات. | 1) إرسال `queueId: item.id` و `clientOpId: "${deviceId}:${item.id}:${item.createdAt}"` مع كل عنصر في `SyncContext.tsx`.<br>2) إرجاع `queueId` في مصفوفة `errors` من `syncService.pushChanges` ومطابقته في `SyncContext` مع `item.id` بدقة.<br>3) فحص `clientOpId` في `syncService.pushChanges` مقابل سجل العمليات المنفذة للجهاز في `SyncLog.tablesSynced` لتخطّي أي عملية سبق تنفيذها بنجاح (Idempotent Replay). | ✅ |
| **15.5** | **توحيد `canViewAllBranches` داخل `resolveBranchScope`** | `server/src/middleware/auth.ts` (الأسطر 87–93) · `server/src/routes/reports.ts` | دالة `resolveBranchScope(req)` تفحص `req.user?.isSuperAdmin || req.branchId == null` فقط ولا تفحص `req.user?.canViewAllBranches`، بينما `reports.ts` اضطر لكتابة دالة محلية `getEffectiveBranchId(req)` تدعم `branchId=all` و `canViewAllBranches`. | ترقية `resolveBranchScope(req)` في `middleware/auth.ts` ليدعم `canViewAllBranches` وقيمة `branchId=all` بشكل موحّد في كل مسارات القراءة (`/sales`, `/purchases`, `/treasury`, `/warehouses`, `/inventory/counts`, `/reports/*`). | ✅ |
| **15.6** | **اختبارات الوحدة والتكامل للمرحلة 15** | `server/src/services/syncService.test.ts` (جديد) | لا يوجد ملف اختبار وحدة مخصص لـ `syncService` يختبر: توجيه خدمات الأعمال، منع تزوير الهوية/الفرع، عزل `companyId`، وعدم تكرار العمليات (`clientOpId`). | إنشاء `syncService.test.ts` يغطي جميع مسارات `pushChanges` + التحقق من نجاح كامل حزمة الاختبارات (`tsc --noEmit` + `npm test` + `vite build`). | ✅ |

### ✅ نتائج التنفيذ والتحقق (2026-10-25)

| البند | ما نُفِّذ فعلياً | دليل التحقق |
|-------|------------------|-------------|
| **15.1** | `middleware/license.ts`: إضافة `enforceLicense(req)` + `isLicenseExempt(req)` + كاش تحقق `60ث` لكل شركة (`clearLicenseCache` يُستدعى عند التفعيل/الإلغاء). `middleware/auth.ts`: استدعاء `enforceLicense` بعد `req.companyId`. `app.ts`: `httpLogger` + `apiLimiter` **قبل** مسارات `/api/*`، وحُذف `app.use('/api', checkLicense)`. | تدفّق الطلب: `helmet → cors → compression → json → httpLogger → /api/health → apiLimiter → routes → notFound → errorHandler`. ترخيص enterprise فعّال على جهاز التطوير (`hwHash` مطابق) + `GET /api/items` و`/reports/dashboard` = 200. |
| **15.2** | `syncService.applyChange`: معالجات صريحة لـ `purchaseInvoice` (محلي + استلام أمر بـ `purchaseOrderId`)، `purchaseOrder`، `quote`، `stockTransfer` (+ `notifyTransfer`)، `inventoryCount` (إنشاء/إدخال بند بـ `countId`)، `item` (ترقيم ITM + خصائص + رصيد افتتاحي)، `party` (ترقيم PTY + رصيد)، وتحديث الصنف باستبدال الخصائص/الباقات. توسيع `entityMap` بصيغ الجمع والمفرد للكتالوج. تعديلات العميل: `ImportOrderReceive` يرسل `purchaseOrderId` + `recordId`، و`InventoryCounts` يرسل `countId` + `recordId`. | 6 اختبارات وحدة لتوجيه الخدمات (فاتورة محلية، استلام أمر، تحويل، بند جرد، صنف، طرف) — كلها خضراء. |
| **15.3** | المسار العام: `findFirst({ where: { id, companyId } })` قبل `update`/`delete`، وفرض `branchId` من التوكن للجداول المرتبطة بفرع، ومعالجة خاصة لجدول `company` (`id === companyId`). حماية إضافية في `purchaseService.receivePurchaseOrder` (فحص `po.companyId`). | اختباران: رفض تعديل/حذف سجل شركة أخرى + اختبار فرض الفرع. |
| **15.4** | موديل `SyncOperation` + migration `20261025120000_add_sync_operation` (`client_op_id` فريد)؛ `pushChanges` يتخطى العمليات المنفذة (`skippedCount`) ويسجّل المعرّف بعد النجاح + تنظيف > 30 يوم. `SyncContext` يرسل `queueId` و`clientOpId` ويطابق الأخطاء بـ `queueId` (إصلاح فقدان تعارضات الإنشاء). | فحص حي: نفس الدفعة مرتين → `records=1/skipped=0` ثم `records=0/skipped=1` وطرف واحد فقط في القاعدة (ثم حُذف). |
| **15.5** | `resolveBranchScope` يدعم `canViewAllBranches` و`branchId=all`، ويُجبر المستخدم المقيّد على فرعه، والسوبر أدمن بلا معامل = كل الفروع. حُذفت الدالة المحلية من `reports.ts`. | فحص حي: `?branchId=all` يعيد 4 مخازن و12 فاتورة، والافتراضي للسوبر أدمن = الكل. |
| **15.6** | `server/src/services/syncService.test.ts` — **13 اختباراً**. | `npm test` = **85/85 (12 Suites)** · `npm run test:integration` = **3/3** (شملت تطبيق الهجرة الجديدة) · `npm run build` ناجح (server + client/PWA). |

---

## 🔧 قرارات تقنية موحدة (طبّقها في كل مرحلة)

| القرار | التطبيق |
|--------|---------|
| **Offline-First للقراءات** | قوائم القيود/السندات/التقارير عبر `cachedRead(key, fetcher)` — لا `fetch` مباشر |
| **Offline-First للكتابة** | إنشاء قيد/سند عبر `offlineWrite(url, method, body, { entity })` — تُصطف دون اتصال |
| **طباعة** | عبر `client/src/lib/print.ts` (حسب قوالب فواتير البيع/الشراء) |
| **Modal موحد** | إعادة استخدام نمط `Modal` المستخدم في المراحل السابقة (خلفية `bg-black/40` + `.card`) |
| **لا `any` صريح** | كل الأنواع الجديدة في `client/src/types.ts` من شكل استجابة الـ API |
| **API client** | `api.get/post/put/delete` من `lib/api.ts` مع `extractError` |
| **أرقام المستندات** | جاهزة Backend عبر `sequenceService.next` (JRN/RCV/PAY/...) — لا تُولّد في الواجهة |
| **التحقق من التوازن** | فحص `totalDebit === totalCredit` قبل إرسال أي قيد (client + server يرفض أصلاً) |

---

## 📁 ملفات مرجعية (اقرأ قبل البدء)

| الملف | الغرض |
|--------|-------|
| `server/src/services/accountingService.ts` | دوال التقارير: getAccountLedger:189 · getPartyLedger:232 · getTrialBalance:272 · getIncomeStatement:319 · getBalanceSheet:376 |
| `server/src/routes/journal.ts` | GET / · GET /:id · POST / · POST /:id/reverse · reports/trial-balance · reports/income-statement · reports/balance-sheet |
| `server/src/routes/treasury.ts` | GET/POST / · GET/POST /receipts · GET /receipts/:id · GET/POST /reconciliations · GET /reconciliations/:id · GET /reconciliations/:treasuryId/transactions · POST /reconciliations/:id/complete |
| `server/src/services/treasuryService.ts` | `createReceipt` (RCV/PAY + عملة مزدوجة + قيد محاسبي) |
| `server/src/services/reconciliationService.ts` | `getBankTransactions`/`createReconciliation`/`list`/`get`/`complete` (RC + مطابقة + فرق) |
| `scripts/setup-integration-db.cjs` + `jest.integration.config.cjs` + `tests/integration/spine.integration.test.ts` | اختبار التكامل (11.2): إعادة تهيئة `psale_ultra_test` + رحلة بيع←قيد←سند قبض + تسوية بنكية |
| `server/src/routes/settings.ts` | company · units · categories · brands · attributes · users · audit-logs |
| `server/src/routes/accounts.ts` | دليل الحسابات + `/:id/ledger` + `/party/:partyId/ledger` |
| `server/src/routes/warehouses.ts` | `/branches` (GET/POST) + مخازن |
| `server/src/routes/exchange.ts` | rate/update/history |
| `client/src/pages/Purchases.tsx` / `InventoryHub.tsx` | نمط المحاور بتبويبات + مودالات (مرجع للنمط) |
| `client/src/types.ts` | تُضاف إليه أنواع المراحل 8-10 |
| `client/src/components/Placeholder.tsx` | يُستبدل بـ Hubs الفعلية عند إكمال كل مرحلة |

---

## ✅ قائمة فحص قبل إغلاق كل مرحلة

- [ ] `npx tsc --noEmit` نظيف في **server**
- [ ] `npx tsc --noEmit` نظيف في **client**
- [ ] `npm run build` في client ينجح (تحقق PWA precache)
- [ ] لا `any` صريح، لا استعلام DB في routes، لا أرقام مولّدة يدوياً
- [ ] مسارات جديدة مضافة في `App.tsx` + `Layout.tsx` (أو الـ Hub)
- [ ] تحديث `AGENTS.md` (قسم الإنجاز + Roadmap) + هذا الملف (الحالات + آخر تحديث)

---

## 📱 فحص الأجهزة الحقيقية (الجوال) — يُنفَّذ على هواتف فعلية

> **ملاحظة**: يُغطّي `e2e/mobile.spec.ts` (مشروع `mobile-chrome`) الأساس آلياً؛ يُستكمل يدوياً على أجهزة فعلية:

- [ ] **التثبيت**: Chrome Android → تثبيت PWA (أيقونة 192/512 + maskable) يُظهر مربع «تثبيت التطبيق»؛ iOS Safari → «مشاركة ← إضافة إلى الشاشة الرئيسية» تظهر أيقونة P-Sale (apple-touch-icon 180)
- [ ] **فتح التطبيق المثبّت** بملء الشاشة (standalone) مع شريط حالة مدمج (status-bar black-translucent)
- [ ] **أوفلاين**: تشغيل وضع الطيران بعد فتح الأوفلاين → شريط برتقالي «وضع عدم الاتصال» + عملية بيع تُحفظ محلياً وتُظهر نافذة «حُفظت محلياً» ثم تُزامن عند رجوع الشبكة تلقائياً
- [ ] **التنقل** بالهامبرغر عبر المبيعات/المشتريات/الأصناف/التقارير — بلا تمرير أفقي على شاشة 390px+ (الودجات تعمل باللمس، أهداف لا تقل عن 48px)
- [ ] **عرض التقارير**: تبويب «🌐 عرض كل الفروع» ظاهر لمستخدم السوبر أدمن فقط ويُحدّث الأرقام فوراً بضغطة زر
- [ ] **Safari (iOS)** خاصة: عدم قطع Background Sync — التحقق من المزامنة اليدوية عبر زر «مزامنة» بعد إعادة الاتصال

---

> **آخر تحديث**: 2026-10-28 — **المراجعة الثانية للمرحلة 15 (TDD) ✅**: **1)** نطاق الفرع: الافتراضي الآمن (المستخدم المربوط بفرع يبقى على فرعه حتى مع صلاحية عرض الكل، و`branchId=all` صراحةً فقط)؛ الواجهة ترسل `branchId=all` تلقائياً عبر `setAllBranchesByDefault` في `lib/api.ts`. **2)** منع التكرار بالحجز الذري المسبق (Claim-First): حجز `sync_operations` قبل التنفيذ، وP2002 = تخطٍّ، وتحرير الحجز عند الفشل المنطقي — اختبار تكامل `Promise.all` على MySQL يثبت طلباً واحداً فقط. **3)** المزامنة: تعديل المستخدمين للأدمن فقط ومقيّد بشركة المستهدف؛ فرع المستخدم المقيّد مفروض على كل كيان (ومخازن التحويل/الجرد يجب أن تتبع فرعه)؛ تحديث بند الجرد بدون `countId` مرفوض. **4)** `pushChanges(companyId, actor, deviceId, changes)` بهوية كاملة من التوكن. **الاختبارات**: وحدة **137 ✅ (14 Suites)** (+ `resolveBranchScope.test.ts` و`license.test.ts` و`syncService.test.ts` موسّع) · تكامل **5 ✅** · `tsc` نظيف (server+client) · بناء server/client ✅.
>
> **⚠️ مخاطر مفتوحة (تحتاج قراراً قبل الإنتاج)**:
> - **تفويض المزامنة بحسب الدور غير مكتمل**: مسار `/sync` يتحقق من المصادقة والفرع والشركة لكنه **لا يطبّق** قواعد `authorize()` الموجودة في مسارات REST لكل كيان (مثلاً كاشير قد يدفع `treasury`/`journalEntry`/`item` عبر المزامنة). يلزم مصفوفة صلاحيات كيان→أدوار تطابق `authorize()` في المسارات.
> - **نافذة انقطاع بين الحجز والتنفيذ**: إذا توقف الخادم بعد `syncOperation.create` وقبل انتهاء `applyChange` تبقى العملية محجوزة بلا تنفيذ (تُفقد بصمت). الحل المقترح: حالة `pending/done` مع مُنظِّف للحجوزات القديمة بعد التحقق.
> - **رسائل Prisma للسباق**: الطلب الخاسر في السباق يُسجّل `Unique constraint failed` في سجلات الخادم (متوقع، لكنه ضجيج). يُفضّل خفض مستوى السجل لهذا الخطأ.
> - **الواجهة/الفرع**: `branchId=all` يُرسل تلقائياً عبر طبقة API، وليس في كل موضع (~100 موضع يبني `?branchId=` يدوياً). الإصلاح الجذري: مساعد موحّد `branchQuery()` يُستبدل تدريجياً.
>
> **التحديث السابق**: 2026-10-25 — **المرحلة 15 (إحكام البنية المعمارية) مكتملة ✅**: **1)** `app.ts` — `httpLogger` و`apiLimiter` قبل المسارات، وحُذف `checkLicense` من `app.ts` ونُقل إلى `authenticate` عبر `enforceLicense(req)` بعد حقن `req.companyId`، مع **كاش تحقق 60ث** لكل شركة (`clearLicenseCache` عند التفعيل/الإلغاء) وفحص المسارات المعفاة بـ `originalUrl`. **2)** `syncService.applyChange` — توجيه صريح لـ `purchaseInvoice` (محلي/استلام بـ `purchaseOrderId`)، `purchaseOrder`، `quote`، `stockTransfer`، `inventoryCount` (إنشاء/بند بـ `countId`)، `item` (ITM + خصائص + رصيد افتتاحي)، `party` (PTY + رصيد) + كيانات الكتالوج بصيغ الجمع. **3)** عزل `companyId` في المسار العام (`findFirst {id, companyId}`) + فرض `branchId` من التوكن + حماية `po.companyId` في `receivePurchaseOrder`. **4)** **Idempotency**: جدول `sync_operations` (migration `20261025120000_add_sync_operation`، `client_op_id` فريد) + `clientOpId`/`queueId` من `SyncContext` + تخطي العمليات المنفذة (`skippedCount`) + إصلاح مطابقة أخطاء الإنشاء (`queueId`) + تنظيف >30 يوم. **5)** `resolveBranchScope` موحّد (`canViewAllBranches` + `branchId=all`) وحُذف التكرار من `reports.ts`. **6)** `syncService.test.ts` (13 اختباراً). **تحقق**: `tsc --noEmit` نظيف (server+client) + `npm test` **85 ✅** + `test:integration` **3 ✅** + `npm run build` (server+client/PWA) + **فحص حي**: ترخيص enterprise مطابق للعتاد، `/api/items` و`/reports/dashboard` 200، دفع نفس العملية مرتين → `skipped=1` وطرف واحد فقط، `?branchId=all` يعيد كل الفروع. **ملاحظة تشغيل**: قاعدة التطوير كانت تحتوي جدولي الترخيص دون سجل هجرة → `prisma migrate resolve --applied 20260827120000_add_license_system` ثم `migrate deploy` للهجرة الجديدة.
> **التحديث السابق**: 2026-10-25 — **توثيق المرحلة 15 (Architectural Hardening — إحكام واستكمال البنية المعمارية) ⬜**: تشخيص وتوثيق 6 مهام هندسية تفصيلية قبل التنفيذ: **15.1** ترتيب الـ Middleware في `app.ts` (`httpLogger` + `apiLimiter` قبل المسارات) وربط `checkLicense` داخل `authenticate` بعد تعيين `req.companyId`؛ **15.2** استكمال توجيه خدمات الأعمال في `syncService.applyChange` (`purchaseInvoice`, `purchaseOrder`, `quote`, `stockTransfer`, `inventoryCount`, `item`, `party` + كيانات الكتالوج)؛ **15.3** عزل `companyId` في المسار العام للـ `update/delete` داخل `syncService`؛ **15.4** إصلاح مطابقة `queueId` في `SyncContext` لعرض تعارضات الإنشاء الفاشلة + إضافة `clientOpId` لمنع تكرار التنفيذ (Idempotency)؛ **15.5** توحيد `canViewAllBranches` و `branchId=all` في `resolveBranchScope`؛ **15.6** اختبارات وحدة `syncService.test.ts`.
> **التحديث السابق**: 2026-08-29 — **النسخ الاحتياطي الخارجي المشفر (Google Drive) ✅**: **1)** `scripts/backup-encryption.env.example` (موثق) + ملف `backup-encryption.env` **مستبعد من git** (كلمة مرور AES + إعدادات rclone). **2)** `backup.ps1`/`backup.sh`: بعد إنشاء `*.sql.gz` يُنشآن نسخة `*.sql.gz.enc` عبر **openssl AES-256-CBC -pbkdf2 -iter 100000** ثم يرفعانها إلى **Google Drive عبر rclone** (`gdrive:p-sale-backups`) مع استبقاء عن بُعد `RCLONE_KEEP_DAYS` (30) وحذف `.enc` المحلي القديم ضمن الاستبقاء المحلي. **3)** أداة استرداد `scripts/decrypt-backup.ps1` (فك التشفير → `restore.ps1`). rclone v1.75.0 مثبّت في `C:\Users\Weeshi\rclone\` + remote `gdrive` مُفوض بحساب Google. **تحقق حي كامل**: تشفير ← رفع إلى gdrive ✓ ← تنزيل ← فك (hash مطابق + gzip سليم 487KB SQL مع CREATE TABLE/INSERT INTO) + كلمة مرور خاطئة تُرفض + `backup.sh` سليم صياغياً + خروج نظيف exit=0. **دروس مأخوذة**: ملفات `.ps1` الجديدة يجب حفظها **UTF-8+BOM** (وإلا يفسد PowerShell 5.1 العربي); استدعاء rclone داخل السكربت يستخدم **`--log-file`** لتجنّب NativeCommandError مع `$ErrorActionPreference='Stop'`; فلاتر rclone عبر **`--include`** لا `--filter` (الصيغة العارية `malformed rule`).
> **التحديث السابق**: 2026-08-28 — **ترحيل الموردين من CustVend.DB (Paradox) إلى Parties ✅**: أداة `server/scripts/migrate-custvend-vendors.ts` + سكربت npm `migrate:vendors` (server). تحليل ملف Paradox المصدري `D:\ERP-Projects\P-Sale Ultra\Yr2026\CustVend.DB` (12288 بايت، سجلات 113 بايت، المسح الحقيقي بتوقيع `80 00 00` عند rel6-8 لا الترويسة) — **73 سجلاً فعلياً**، فك CP1256 عبر `TextDecoder('windows-1256')` (يطابق .NET تماماً: `E4 DE CF C7` → «نقدا»). تخطّى 8 حسابات داخلية (`01` نقدا، `02` مصاريف محل، `03` رؤيا 1، `04` مخزن الرئيسي، `0B` إيراد صيانة، `0C` خدمات مصرفية، `2E` عمولة خارجية، `4B` رؤيا -فرع الحدائق) → **استُورد 65 طرفاً كـ `partyType='vendor'`** (`PTY-000006`..`PTY-000070`) في **ترانزاكشن واحدة** عبر `Party.create` بـ `sequenceService.next(companyId,'PTY',tx)` + `generateNumber`؛ `notes` = «مستورد من CustVend.DB (الرقم القديم XX)» + `address` (rel58) + `phone` (rel98). كشف التكرار بالاسم قبل الإدراج. **Idempotent**: الإعادة تُنتج «استُورد 0 ∥ مكرر 65 ∥ داخلي 8». **تحقق حي** (MySQL بـ `ORDER BY id DESC`): 65 مورداً بأسماء/عناوين/هواتف عربية صحيحة (عينات id 66-73 = PTY-000063..000070، timestamps 2026-08-28 19:34:24). ملاحظات: الفلاتر النصية تبدأ بنص عربي فاستخدم `LIKE '%CustVend.DB%'` لا `'CustVend.DB%'`؛ الفلاتر الحرفية العربية في `mysql -e` تفشل بـ `ERROR 1271 (HY000) Illegal mix of collations for operation 'in'`. تحقق: `tsc --noEmit` نظيف + `npm test` **67 ✅**.
> **التحديث السابق**: 2026-08-28 — **واجهة إصدار التراخيص للمدير (UI بدل CLI) — 12.10** ✅: أداة ويب محلية **`server/scripts/license-issuer/`** توقّع تراخيص من المتصفح بنفس نموذج أمان الـ CLI (المفتاح الخاص يبقى على جهاز المدير فقط، ربط `127.0.0.1` إجباري، **لا DB ولا شبكة**). **1)** `scripts/licenseLib.ts` — مكتبة توقيع/تحقق مشتركة (payload + Ed25519 sign/verify + defaults tiers) تُستهلكها الأداة **والـ CLI معاً** بعد إعادة هيكلة `sign-license.ts` ليستوردها (ناتج CLI متطابق بايتاً — تحقق حي). **2)** `license-issuer/server.ts` — خادم Express مصغّر (helmet + رفض أي host غير loopback إلّا بـ `--host` صريح) مع `/api/status` (حالة المفاتيح/metas) + `/api/issue` (تحقق + توقيع + **سجل إصدارات JSONL محلي** `issued-licenses.log` لتوثيق عمليات المدير) + `/api/verify` (تحقق بالمفتاح العام). **3)** واجهة RTL عربية أوفلاين كلياً (`public/index.html` — بلا CDN/تبعيات): خطوات العمل + نموذج (companyId/hwHash/tier→ميزات تلقائية قابلة للتعديل/انتهاء دائم أو تاريخ/مستخدمين وفروع/ميزات إضافية/ملاحظات) + زر «توقيع وإصدار» + نص Base64 + نسخ + تحقق فوري + «🛡️ التحقق من نص مُوقَّع». **4)** `npm run license:issuer` (server). **تحقق حي**: sign→verify ✅ + ترخيص ملوث يُرفض + `missing companyId` 400 و`bad tier` 400 برسائل عربية + السجل كُتب بصف واحد صالح مع الملاحظات العربية. تحقق: `tsc --noEmit` نظيف + `npm test` **67 ✅**.
> **التحديث السابق**: 2026-08-28 — **عرض كل الفروع + تلميع PWA الجوال (Mobile)** ✅: **1)** `BranchScopeBar.tsx` — شريط احترافي داخل التقارير الموحدة للسوبر أدمن بضغطة زر «🌐 عرض كل الفروع» (= إجمالي الشركة) + أزرار الفروع، مشترك مع `BranchFilterSelect` عبر سياق `useBranchFilter` — **إغلاق «المتبقي 🟡» في القرار #11**. **2)** PWA/Safari: **الأيقونات كانت مفقودة كلياً** (`pwa-192x192.png`/`pwa-512x512.png` غير موجودة رغم ذكرها في manifest → تعطيل التثبيت) — وُلّدت عبر System.Drawing (192/512/180) وأُضيف `apple-touch-icon` + `mobile-web-app-capable` + `apple-mobile-web-app-status-bar-style` + `viewport-fit=cover` في `index.html` + أيقونة 180 في manifest + `includeAssets`. **3)** مشروع Playwright جديد `mobile-chrome` (محاكاة iPhone 13: 390×844 ×3 + touch، `testMatch` للموال-file فقط) + `e2e/mobile.spec.ts` (تنقّل بالهامبرغر عبر 4 صفحات مع منع التمرير الأفقي + شريط الأوفلاين يظهر/يختفي) — **4/4 ✅ مع repeat-each=2**. تحقق: `tsc` نظيف + `vite build` ✅ (الأيقونات الأربع في dist/manifest).
> **التحديث السابق**: 2026-08-28 — **تقوية محرك عدم الاتصال (Offline Engine Hardening)** ✅: **1)** `client/src/lib/offline.ts` — `realOnline` ثلاثي الحالات (`boolean | null`) + `startConnectivityMonitor()` يفحص `/api/health` كل 30ث (مهلة 5ث) ويطلق أحداث `online`/`offline` اصطناعية (النظام حقيقي بدل `navigator.onLine` غير الموثوق) + `safeFetch` + `CACHED_READ_TIMEOUT_MS=5000` تُطبَّق فقط قبل أول تأكيد اتصال. **2)** `cachedRead` متسامح: أوفلاين → كاش قديم أي `cache_version`؛ فشل شبكة → رجوع للكاش؛ لا كاش → خطأ عربي. **3)** `session.ts` (`readStoredUser`/`setActiveScopeSync`/`getActiveScopeSync`) + `AuthContext.tsx` تهيئة نطاق مزامِنة في `useState` — إزالة سباق `user:null:branch:global`. **4)** `OfflineWarningBanner.tsx` برتقالي «وضع عدم الاتصال — بيانات مخزنة/قديمة». **5)** إصلاحات E2E: `الخزينة *` في `offline.spec.ts`+`sales.spec.ts` + `.first()` لزر الخروج في `auth.spec.ts`. تحقق: `tsc --noEmit` نظيف (server+client) + `vite build` ✅ (PWA v0.19.8) + **auth 3/3 + sales 1/1 + offline 1/1 ✅**.
> **التحديث السابق**: 2026-08-27 — **نظام الترخيص (License System) — المرحلة 12 مكتملة** ✅: Ed25519 + Hardware Binding + Air-gapped Signing. 12.1 ✅ (توليد مفاتيح) + 12.2 ✅ (Prisma Schema + Migration) + 12.3 ✅ (License Service) + 12.4 ✅ (Offline Signing CLI) + 12.5 ✅ (API Routes) + 12.6 ✅ (checkLicense Middleware) + 12.7 ✅ (App Integration) + 12.8 ✅ (Admin UI) + 12.9 ✅ (Unit Tests **67**). تحقق: `tsc` نظيف (server+client) + `npm test` **67 ✅** + `vite build` ✅.
> **التحديث السابق**: 2026-08-18 — **تحسينات ما بعد الإطلاق** ✅: 1. **أكواد تلقائية** (`ITM-XXXXXX`/`PTY-XXXXXX`) عبر SequenceService — حقل الكود للقراءة فقط في الواجهة، 1327 صنف مُحدّث بالصيغة الجديدة. 2. **Pagination موحد** (`Pagination.tsx`) — 25/50/100/200/الكل على 7 صفحات (Items/Parties/Quotes/Purchases/Transfers/StockMovements/Sales). 3. **تحسين التصنيف** — 241 صنف + 41 براند جديد + فئة "فلاشات/بطاقات ذاكرة". 4. **`limit=99999`** — جلب كل البيانات من السيرفر مع Pagination client-side. تحقق: `tsc --noEmit` نظيف + `vite build` ناجح + `npm test` 44 ✅.
