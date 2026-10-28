import {
  assertSyncAllowed,
  isSyncAllowed,
  normalizeSyncEntity,
  SyncForbiddenError,
} from './syncAuthorization'

// =====================================================================
// مصفوفة تفويض المزامنة (RBAC in Sync) — يجب أن تطابق authorize() في REST
// الافتراضي: منع (deny by default) — أي كيان/إجراء غير مصرّح به صراحةً يُرفض
// =====================================================================

const ADMIN = { role: 'admin', isSuperAdmin: false }
const SUPER = { role: 'admin', isSuperAdmin: true }
const MANAGER = { role: 'manager', isSuperAdmin: false }
const ACCOUNTANT = { role: 'accountant', isSuperAdmin: false }
const CASHIER = { role: 'cashier', isSuperAdmin: false }
const VIEWER = { role: 'viewer', isSuperAdmin: false }

describe('syncAuthorization — مصفوفة الأدوار', () => {
  describe('الكاشير (حصر الصلاحيات في المبيعات والسندات)', () => {
    it.each(['saleInvoice', 'quote', 'receipt', 'party'])('مسموح: %s create', (entity) => {
      expect(isSyncAllowed(CASHIER, entity, 'create')).toBe(true)
    })

    it.each([
      ['journalEntry', 'create'],
      ['journalEntry', 'update'],
      ['item', 'create'],
      ['item', 'update'],
      ['treasury', 'create'],
      ['purchaseOrder', 'create'],
      ['purchaseInvoice', 'create'],
      ['stockTransfer', 'create'],
      ['inventoryCount', 'create'],
      ['stockMovement', 'create'],
      ['user', 'update'],
      ['branch', 'create'],
      ['warehouse', 'create'],
      ['exchangeRate', 'create'],
      ['category', 'create'],
      ['bankReconciliation', 'create'],
    ])('ممنوع: %s %s', (entity, action) => {
      expect(isSyncAllowed(CASHIER, entity, action)).toBe(false)
    })

    it('assertSyncAllowed يرفع SyncForbiddenError برمز FORBIDDEN وحالة 403', () => {
      try {
        assertSyncAllowed(CASHIER, 'journalEntry', 'create')
        throw new Error('كان يجب أن يُرفض')
      } catch (err: any) {
        expect(err).toBeInstanceOf(SyncForbiddenError)
        expect(err.code).toBe('FORBIDDEN')
        expect(err.status).toBe(403)
        expect(err.entity).toBe('journalEntry')
        expect(err.action).toBe('create')
        expect(err.message).toContain('لا تملك صلاحية')
      }
    })
  })

  describe('المحاسب (العمليات المالية دون الإعدادات الحساسة)', () => {
    it.each([
      ['journalEntry', 'create'],
      ['journalEntry', 'update'],
      ['receipt', 'create'],
      ['bankReconciliation', 'create'],
      ['purchaseInvoice', 'create'],
      ['saleInvoice', 'create'],
      ['party', 'create'],
      ['treasury', 'create'],
    ])('مسموح: %s %s', (entity, action) => {
      expect(isSyncAllowed(ACCOUNTANT, entity, action)).toBe(true)
    })

    it.each([
      ['user', 'update'],
      ['branch', 'create'],
      ['branch', 'delete'],
      ['company', 'update'],
      ['category', 'create'],
      ['brand', 'create'],
      ['unit', 'create'],
      ['attribute', 'create'],
      ['warehouse', 'delete'],
      ['item', 'delete'],
    ])('ممنوع: %s %s', (entity, action) => {
      expect(isSyncAllowed(ACCOUNTANT, entity, action)).toBe(false)
    })
  })

  describe('المدير (إدارة تشغيلية بلا إعدادات حساسة)', () => {
    it.each([
      ['journalEntry', 'create'],
      ['item', 'create'],
      ['item', 'update'],
      ['stockTransfer', 'create'],
      ['inventoryCount', 'create'],
      ['warehouse', 'create'],
      ['warehouse', 'update'],
      ['purchaseOrder', 'create'],
      ['treasury', 'create'],
    ])('مسموح: %s %s', (entity, action) => {
      expect(isSyncAllowed(MANAGER, entity, action)).toBe(true)
    })

    it.each([
      ['user', 'update'],
      ['branch', 'create'],
      ['branch', 'delete'],
      ['company', 'update'],
      ['warehouse', 'delete'],
      ['item', 'delete'],
      ['category', 'create'],
    ])('ممنوع: %s %s', (entity, action) => {
      expect(isSyncAllowed(MANAGER, entity, action)).toBe(false)
    })
  })

  describe('الأدمن والسوبر أدمن', () => {
    it.each([
      ['journalEntry', 'create'],
      ['item', 'delete'],
      ['user', 'update'],
      ['branch', 'delete'],
      ['company', 'update'],
      ['anythingUnknown', 'create'],
    ])('مسموح للأدمن: %s %s', (entity, action) => {
      expect(isSyncAllowed(ADMIN, entity, action)).toBe(true)
    })

    it('السوبر أدمن يمر حتى لو كان دوره غير admin', () => {
      expect(isSyncAllowed({ role: 'cashier', isSuperAdmin: true }, 'journalEntry', 'create')).toBe(true)
    })
  })

  describe('المشاهد (عرض فقط — لا يكتب شيئاً)', () => {
    it.each([
      ['saleInvoice', 'create'],
      ['quote', 'create'],
      ['party', 'create'],
      ['receipt', 'create'],
    ])('ممنوع: %s %s', (entity, action) => {
      expect(isSyncAllowed(VIEWER, entity, action)).toBe(false)
    })
  })

  describe('الافتراضي والأسماء المستعارة', () => {
    it('كيان غير معروف يُرفض لغير الأدمن (deny by default)', () => {
      expect(isSyncAllowed(CASHIER, 'mysteryEntity', 'create')).toBe(false)
      expect(isSyncAllowed(MANAGER, 'mysteryEntity', 'delete')).toBe(false)
    })

    it('إجراء غير معروف يُرفض', () => {
      expect(isSyncAllowed(CASHIER, 'saleInvoice', 'approve')).toBe(false)
    })

    it('صيغ الجمع في الكتالوج تُطبَّع إلى المفرد', () => {
      expect(normalizeSyncEntity('categories')).toBe('category')
      expect(normalizeSyncEntity('brands')).toBe('brand')
      expect(normalizeSyncEntity('units')).toBe('unit')
      expect(normalizeSyncEntity('attributes')).toBe('attribute')
      expect(normalizeSyncEntity('item')).toBe('item')
    })

    it('الكتالوج (بصيغة الجمع) للأدمن فقط', () => {
      expect(isSyncAllowed(ADMIN, 'categories', 'create')).toBe(true)
      expect(isSyncAllowed(MANAGER, 'categories', 'create')).toBe(false)
      expect(isSyncAllowed(CASHIER, 'brands', 'create')).toBe(false)
    })

    it('تعديل السندات مقصور على من يملك صلاحية مالية', () => {
      expect(isSyncAllowed(CASHIER, 'receipt', 'update')).toBe(false)
      expect(isSyncAllowed(ACCOUNTANT, 'receipt', 'update')).toBe(true)
    })

    it('الحذف محصور بالأدمن في الكيانات المالية الحساسة', () => {
      expect(isSyncAllowed(MANAGER, 'journalEntry', 'delete')).toBe(false)
      expect(isSyncAllowed(ADMIN, 'journalEntry', 'delete')).toBe(true)
      expect(isSyncAllowed(ACCOUNTANT, 'saleInvoice', 'delete')).toBe(false)
    })
  })
})
