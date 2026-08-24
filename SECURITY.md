# 🔐 SECURITY.md — نموذج الأمن والعزل (Branch-Level Security & Isolation Model)

> **وثيقة معتمدة**: تُمثّل النموذج الأمني المتفق عليه للعزل بين الفروع في P-Sale Ultra Cloud.
> الاستناد: قسم «🔐 نموذج الأمن والعزل» في [`AGENTS.md`](./AGENTS.md) (القرار الحاسم #10).
> **أي تعديل جوهري على هذا النموذج يتطلب العودة إلى هذه المصفوفة التوثيقية قبل التنفيذ.**

---

## 1. مبدأ العزل (Isolation Principle)

النظام يعمل **Offline-First** و **Multi-Branch**، لذا يُطبَّق العزل على مستوى **(User + Branch)** وليس مستوى الشركة فقط:

```
مفتاح الكاش المركب في IndexedDB:
  table:${table}:user:${userId}:branch:${branchId}

أمثلة:
  table:saleInvoice:user:5:branch:3      ← فواتير فرع 3 التي رآها/أنشأها المستخدم 5
  table:stockMovement:user:1:branch:global  ← للمسؤولين/السوبر أدمن (global = كل الفروع)
```

### لماذا (User + Branch) لا (Branch) فقط؟
- **عزل بين المستخدمين على نفس الجهاز**: لو دخل المدير العام ثم سجّل خروجه ودخل مدير الفرع على نفس المتصفح، لا يرى مدير الفرع بيانات كاش المدير العام (كلٌّ في فضاء اسم خاص به).
- **توافرية أوفلاين**: **لا مسح للكاش عند تبديل المستخدم** — التبديل مجرد ترحيل إلى مفتاح كاش مختلف، فيعمل التطبيق فوراً دون انتظار إنترنت.
- **قابلية التدقيق**: كل عملية مرتبطة بـ `userId` و `branchId` يمكن تتبّعها.

### الجدول الزمني للبيانات
| الفئة | الكيانات | نطاق المزامنة/الكاش |
|-------|----------|-------------------|
| **مرجعية عالمية** | `item`, `party`, `account`, `exchangeRate`, `company`, `user` | الشركة كاملة (لكل المستخدمين: البيانات المرجعية مشتركة) |
| **مالية/مخزنية (فرع-حساسة)** | `saleInvoice`, `purchaseInvoice`, `receipt`, `stockMovement`, `stockTransfer`, `inventoryCount`, `warehouse`, `journalEntry`, `serial`, `treasury`, `bankReconciliation` | **فرع المستخدم فقط** (من `branchId` في التوكن — الخزائن معزولة بالفرع الآن) |
| **إدارية** | `auditLog` | الشركة كاملة (عرضها محصور بـ `admin`/`superadmin`) |

---

## 2. نموذج التهديدات (Threat Model)

> لكل تهديد: الوصف، الأثر، التصدي، والحد الزمني الموصى به للرفع.

### 2.1 تزوير طابور المزامنة (Sync Queue Injection / Tampering)
| | |
|---|---|
| **الوصف** | مسؤول فرع يعبث في `syncQueue` داخل DevTools (IndexedDB) ويحقن عمليات تستهدف مخازن/فروع/كبائن أخرى (تغيير `warehouseId`، `branchId`، أرقام، أسعار) |
| **الأثر** | فواتير بيع/مشتروات/حركات مخزون/سندات تعبّر حدود الفرع وتلوّث بيانات الفروع الأخرى |
| **التصدي** | 1) `syncQueue` يحمل `userId` و `branchId` لكل عملية. 2) السيرفر **يتجاهل** أي `userId`/`createdBy`/`branchId` مرسَلة من العميل ويستبدلها من **التوكن** الموثّق. 3) إن وُجد حقل هوية صريح في البيانات → يُسجَّل حدث `IDENTITY_TAMPERING` ويُتجاهل الحقل. 4) تحقق ملكية الموارد (§3) قبل التنفيذ. |
| **تحقق** | اختبار تكامل: حقنة بفرع أجنبي → `400/403` + سجل في `AuditLog` بنوع `BRANCH_ACCESS_DENIED` |

### 2.2 تسريب البيانات بين مستخدمين على نفس الجهاز (Cross-User Data Leakage)
| | |
|---|---|
| **الوصف** | بعد دخول المدير العام (فرع `global`) على جهاز فرع، يدخل مدير الفرع فيُحاول قراءة بيانات الفرع `global` من الكاش المحلي |
| **الأثر** | اطّلاع مدير فرع على مبيعات/أرباح/أسماء عملاء كل الفروع |
| **التصدي** | Namespacing بـ **User+Branch** في مفاتيح الكاش + `cachedRead` يقرأ دائماً من فضاء المستخدم الحالي فقط. لا مسح كاش (حفاظاً على الأوفلاين) بل **عزل منطقي**. |
| **تحقق** | اختبار E2E: تبديل مستخدم → كاش المستخدم الأول غير مرئي للثاني |

### 2.3 كتابة عبر حدود الفرع أونلاين (Cross-Branch Write)
| | |
|---|---|
| **الوصف** | محاولة من واجهة أو API مباشر بإنشاء/تعديل كيان ينتمي لفرع آخر عبر `saleService`/`purchaseService`/`inventoryService` |
| **الأثر** | تعديل مخزون/فاتورة فرع آخر بصلاحية مسؤول فرع آخر |
| **التصدي** | **تحقق ملكية الموارد (Resource Ownership)** في الخدمات: التحقق من أن `warehouseId` و `partyId` المرتبطة بفرع تتبع `branchId` التوكن قبل التنفيذ؛ عند المخالفة: رفض + `BRANCH_ACCESS_DENIED`. الاستثناء الوحيد: **`stockTransfer`** (تحويل مقصود بين فرعين) — يُسمح إذا كان **أحد** طرفَي التحويل (المصدر أو الهدف) تابعاً لفرع المستخدم المنفّذ. |
| **تحقق** | اختبارات وحدة على `saleService`/`inventoryService` بمعرّفات فروع مخالفة → متوقعة رفض |

### 2.4 تعدد المستخدمين متعددي الفروع (Multi-Branch Operator)
| | |
|---|---|
| **الوصف** | حساب يدير أكثر من فرع (مثلاً `branchId = null` أو مدير إقليمي) |
| **الأثر** | نقطة ارتباك في تحديد النطاق إن لم تُحسم السياسة |
| **التصدي (السياسة المعتمدة)** | الخيار المعتمد للبساطة: **حساب منفصل لكل فرع**. الخيار المرن المستقبلي: `branchId = null` + صلاحية `canViewAllBranches` + فلترة مخصّصة في `pullChanges` (يجرّب تعديلياً). يُفضَّل عدم تفعيل "حساب متعدد الفروع" إلا مع دور `admin`/`superadmin`. |

### 2.5 قيود محاسبية عابرة للفروع (JournalEntry — Entity معقّد)
| | |
|---|---|
| **الوصف** | القيد المحاسبي (`journalEntry`) يحمل `branchId` اختياري وقد يرتبط بفواتير فروع متعددة |
| **التصدي** | 1) عند الإنشاء عبر الخدمات، يُشتَق `journalEntry.branchId` من **فرد المصدر** (الفاتورة/السند) تلقائياً — لا يُقبل من العميل. 2) عند التحقق: `journalEntry.branchId` يجب أن يطابق فرع المستخدم، أو يكون `null` للأدمن/السوبر أدمن. 3) للمسؤول المالي (`accountant`): يرى قيود فرعه في القوائم العامة، والتقارير الموحّدة محصورة بصلاحية `canViewAllBranches`. |

### 2.6 مقبولة/معرَّفة المخاطر
| | |
|---|---|
| **الوصف** | تعديل DevTools مصدره متصفح (IndexedDB/JS) لا يصمد ضد تنفيذ سكربت خارجي ضد الـ API مباشرة |
| **الأثر** | منخفض — لأن **كل الحماية الحاسمة في السيرفر** (وكيل التوكن والتحقق من الملكية) مهما كان ملفّ المتصفح |
| **التصدي الأساسي** | قاعدة ثابتة: **العميل مكشوف دائماً — الأمان يُقرر في السيرفر حصراً** |

---

## 3. آلية التحقق من الموارد (Resource Ownership Enforcement)

```typescript
// وجهة التنفيذ (في الخدمات + syncService):
interface SecurityContext {
  companyId: number
  userId: number
  userBranchId: number | null   // null = مسؤول/سوبر أدمن (نطاق كامل أو حسب الصلاحية)
  userRole: string
  isSuperAdmin: boolean
  ipAddress: string
}

async function validateBranchScope(ctx: SecurityContext, entity: string, data: any) {
  // 1) تجاهل أي هوية مرسلة من العميل:
  if (data.userId || data.createdBy) await logSecurityEvent(ctx, 'IDENTITY_TAMPERING', data)

  // 2) تحقق النطاق حسب الكيان (من التوكن لا من البيانات):
  switch (entity) {
    case 'saleInvoice':        // warehouseId → warehouse.branchId === ctx.userBranchId
    case 'receipt':            // branchId === ctx.userBranchId
    case 'stockMovement':      // warehouseId → warehouse.branchId
    case 'inventoryCount':     // warehouseId → warehouse.branchId
    case 'purchaseInvoice':    // branchId || warehouseId → branch
    case 'warehouse':          // branchId === ctx.userBranchId
      ctx.userBranchId !== null && actualBranchId !== ctx.userBranchId
        ? await logSecurityEvent(ctx, 'BRANCH_ACCESS_DENIED', { ... })
        : proceed
    case 'stockTransfer':      // ONE of {from,to}.branchId matches (منفّذ التحويل)
    case 'journalEntry':       // branchId === ctx.userBranchId || null (for admin)
    case 'branch':             // admin/superadmin only
      // ...
  }
}
```

**جدول حقول الفرع لكل كيان**

| الكيان | حقل الفرع | القاعدة |
|--------|-----------|---------|
| `saleInvoice` | `warehouseId → warehouse.branchId` | يساوي فرع المستخدم |
| `receipt` | `branchId` | يساوي فرع المستخدم |
| `treasury` | `branchId` | يساوي فرع المستخدم (الخزائن LYD فقط — 2 لكل فرع: cash + bank) |
| `bankReconciliation` | `branchId` | يساوي فرع المستخدم |
| `stockMovement` | `warehouseId → warehouse.branchId` | يساوي فرع المستخدم |
| `stockTransfer` | `from|to .branchId` | **أحدهما** يساوي فرع المستخدم |
| `inventoryCount` | `warehouseId → warehouse.branchId` | يساوي فرع المستخدم |
| `purchaseInvoice` | `branchId` أو `warehouse.branchId` | أحدهما يساوي فرع المستخدم |
| `warehouse` | `branchId` | يساوي فرع المستخدم (أو `null` للأدمن) |
| `branch` | `id` | `admin`/`superadmin` فقط |
| `journalEntry` | `branchId` | يساوي فرع المستخدم (أو `null` للأدمن) |

---

## 4. سياسة التدقيق (Audit Policy)

### 4.1 الأحداث الأمنية المسجَّلة
| نوع الحدث (`eventType`) | متى يُسجَّل | المخزَّن في `newValues` |
|--------------------------|-------------|-------------------------|
| `BRANCH_ACCESS_DENIED` | رفض وصول كيان خارج نطاق فرع المستخدم | `{ entity, action, attemptedBranch, userBranch, reason }` |
| `IDENTITY_TAMPERING` | حضور `userId`/`createdBy` صريح في طابور العميل | `{ entity, action, clientUserId, clientCreatedBy, serverUserId }` |
| `QUEUE_INJECTION` | عمليات طابور ببنية غير متوقعة أو كيان غير معروف | `{ entity, action, reason }` |

### 4.2 آلية التسجيل
```typescript
async function logSecurityEvent(ctx: SecurityContext, eventType: 'BRANCH_ACCESS_DENIED' | 'IDENTITY_TAMPERING' | 'QUEUE_INJECTION', details: object) {
  await prisma.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'SECURITY_EVENT',
      tableName: 'sync_queue',            // أو اسم الكيان المستهدف
      newValues: JSON.stringify({ eventType, ip: ctx.ipAddress, deviceId, userBranchId, userRole, ...details, timestamp: new Date().toISOString() }),
      ipAddress: ctx.ipAddress,
    },
  })
  // (اختياري) تنبيه لحظي للسوبر أدمن عبر Socket.IO/Email
}
```

### 4.3 الوصول للمسؤولين
- **من داخل لوحة تحكم الموقع**: Settings → «سجل التدقيق» (`AuditLogs.tsx` + `GET /settings/audit-logs`) — **ليس** عبر تصفح ملفات النظام.
- **فلتر مخصص**: فلتر `eventType` حقيقي (`GET /settings/audit-logs?eventType=...`) يقرأ من عمود `event_type` ليعزل أحداث `BRANCH_ACCESS_DENIED` / `IDENTITY_TAMPERING` عن باقي السجل (يظهر كفلتر «🔐 الأحداث الأمنية» في واجهة `AuditLogs.tsx`).
- الصلاحية: العرض محصور بالسوبر أدمن/الأدمن (كما في صلاحيات إعدادات المستخدم). السوبر أدمن يرى **كل** أحداث الشركة.

### 4.4 مدة الاحتفاظ (Retention)
| نوع السجل | الافتراضي | قابلية التركيب |
|-----------|-----------|----------------|
| الأحداث الأمنية | **90 يوماً** | عبر متغير تكوين `SECURITY_LOG_RETENTION_DAYS` |
| سجل التدقيق العام | دائم (حتى تفريغ منطقة الخطر / تنظيف يدوي) | — |

### 4.5 تنبيهات
- عند تكرار أحداث `BRANCH_ACCESS_DENIED` من نفس `userId`/`ipAddress` (مثلاً ≥ 5 خلال 10 دقائق) → توصية بتفعيل تنبيه (WebSocket/Email) وتجميد الجلسة مؤقتاً للحساب المشبوه.

---

## 5. سياسة الاحتفاظ بالكاش المحلي (IndexedDB Retention Policy)

- **الحد الافتراضي**: الاحتفاظ بكاش **آخر 3 مستخدمين** فقط على الجهاز (`MAX_CACHED_USERS = 3` — ثابت في `client/src/lib/session.ts`).
- **الآلية**: `pruneOldUserCaches(maxUsers)` — يُستدعى بعد كل سحب مزامنة؛ يحذف أسماء الفضاء **الأقدم وصولاً** + مفاتيح الكاش القديمة غير المنسوبة بعد تجاوز الحد؛ يقرأ من مفاتيح `last_access:` المخزنة في `meta`.
- **الأساس المنطقي**: توازن بين الحجم (مساحة المتصفح) والأداء (تقليل إعادة السحب). المستخدمان الأحدث يبقيان جاهزين للتشغيل الفوري أوفلاين.
- **قابلية التكوين**: القيمة قابلة للضبط عبر متغير تكوين `MAX_CACHED_USERS`.

---

## 6. دليل المسؤول (Admin Guide)

### 6.1 تفعيل/تعطيل العزل
- العزل **مفعل افتراضياً** للشركات الجديدة.
- إعدادات الشركة: مفتاح `branchIsolationEnabled` في `CompanySettings`/`Settings`.
- **عند التفعيل على شركة قائمة**:
  1. تفعيل العلم في الإعدادات.
  2. يسجّل كل جهاز خروجاً، ثم تمام لأول مرة → يتم `clearOfflineData()` مرة واحدة ثم مزامنة كاملة لنطاق فرع المستخدم (بداية نظيفة).
- **عند التعطيل**: يعود النظام لسلوك "شركة كاملة" (التوافق الخلفي) دون مسح.

### 6.2 مراقبة الأحداث الأمنية
1. Settings ← «سجل التدقيق».
2. اختر فلتر النوع: `SECURITY_EVENT` أو `BRANCH_ACCESS_DENIED` / `IDENTITY_TAMPERING`.
3. راجع الأعمدة: المستخدم، IP، الكيان، الفرع المحاول/الفرع المخوَّل، الوقت.
4. عند تكرار مخالفات من حساب واحد → 6.4.

### 6.3 التعامل مع المستخدمين متعددي الفروع
| السيناريو | الإجراء الموصى به |
|-----------|-------------------|
| مسؤول يدير فرعين فعلياً | إنشاء **حساب منفصل لكل فرع** (الخيار المعتمد) |
| مدير إقليمي/سوبر أدمن | حساب بـ `branchId = null` + دور `admin`/`superadmin` (يرى كل الفروع) |
| محاسب مركزي | حساب `accountant` بصلاحية `canViewAllBranches` للتقارير الموحدة دون حذف |

### 6.4 معالجة حساب مخترَق/مشبوه
1. عطّل الحساب (`UsersSettings` — `isActive = false`).
2. راجع أحداث `BRANCH_ACCESS_DENIED` / `IDENTITY_TAMPERING` المرتبطة بـ `userId` (في سجل التدقيق).
3. دوّر أسرار JWT: `scripts/rotate-jwt-secrets.ps1` (مع `-Restart` بعد إفراغ الجلسات).
4. راجع فواتير/حركات الفترة المشبوهة وأجرِ قيد تصحيحي إن لزم.
5. عند رصد محاولات خارجية على كثير من الحسابات: تفعيل `authLimiter`/`apiLimiter` الأشد ومراجعة الـ proxy/جيل الهجوم.

---

## 7. حالة التنفيذ (Implementation Status)

> **شفافية**: هذه الوثيقة توثّق النموذج الأمني المعتمد. التفاصيل الكودية للتسلّم النهائي قابلة للتفعيل وفق الجدول الآتي:

| المكوّن | الوضع |
|---------|-------|
| إدارة الفروع/المخازن **CRUD** (تعديل/حذف بقيود + ربط/فك ربط) | ✅ **منفَّذ** (`warehouses.ts`) |
| `updated_at` لسلخ تعديلات المزامنة للفروع/المخازن | ✅ **منفَّذ** (migration `20260819200000_add_updated_at_branch_warehouse`) |
| Namespacing `table:user:branch` في `IndexedDB` + مفتاح `cachedRead` المركّب | ✅ **منفَّذ** (`client/src/lib/session.ts` + `offline.ts`) |
| `syncQueue` تحمل `userId`/`branchId` + التحقق السيرويدي من التوكن | ✅ **منفَّذ** (`db.ts.enqueue(scope)` + `pushChanges` تتحقق من التوكن وترفض التزوير) |
| عمود `event_type` في `AuditLog` + أحداث `BRANCH_ACCESS_DENIED`/`IDENTITY_TAMPERING` + فلتر `eventType` | ✅ **منفَّذ** (migration `20260819210000_add_audit_event_type` + `middleware/audit.ts.logSecurityEvent` + `AuditLogs.tsx`) |
| سياسة الاحتفاظ بآخر 3 مستخدمين (`MAX_CACHED_USERS` + `pruneOldUserCaches`) | ✅ **منفَّذ** (يُستدعى بعد كل pull في `SyncContext`) |
| **عزل القراءات (GET)** — `resolveBranchScope(req)` في `middleware/auth.ts` يُجبر المستخدم المربوط بفرع على فرعه | ✅ **منفَّذ** (`GET /warehouses` + `GET /sales` + `GET /purchases` + `GET /inventory/counts` + `GET /treasury` + `GET /treasury/receipts` + كل مسارات `/reports/*`؛ السوبر أدمن/العالمي = `?branchId` أو الكل) |
| **عزل الخزائن بالفرع** — `branchId` على `Treasury`/`BankReconciliation` + 2 خزينة لكل فرع (cash + bank) + `resolveBranchScope` في GET + تحقق ملكية الفرع في receipts | ✅ **منفَّذ** (migration `20260823140000_add_branch_to_treasury_reconciliation` + `treasury.ts` + `Treasuries.tsx`/`Receipts.tsx`/`LocalPurchaseInvoice.tsx` مع `useBranchFilter`) |
| **تحقق ملكية الفرع في الجرد التصحيحي** — `createCorrectiveCount` يرفض إنشاء تصحيحي من جرد أصلي لا يتبع فرع المستخدم | ✅ **منفَّذ** (`POST /inventory/counts/:id/corrective` يدعم `allowedBranchId` من التوكن) |
| تفعيل/تعطيل العزل عبر إعداد الشركة (`branchIsolationEnabled`) | 🟡 **معتمد/مخطّط** (الاسم مكوّن `global`/فرع-حساب) |
| تحقق ملكية الموارد في `saleService`/`purchaseService`/`inventoryService` | 🟡 **معتمد/مخطّط** (الآن: رفض كل كيان خارج نطاق فرع المستخدم) |
| التقارير الموحّدة بصلاحية `canViewAllBranches` | 🟡 **معتمد/مخطّط** |

---

*آخر تحديث: 2026-08-24 — خزائن LYD فقط معزولة بالفرع + تحسينات المبيعات/المشتريات/الخزائن/العملاء (المراحل الخمس مكتملة) — إصلاحات Receipts/PartyLedger — PartyProfile مُربط بـ Parties*