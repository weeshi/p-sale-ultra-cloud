/**
 * تفويض المزامنة (RBAC in Sync)
 * ----------------------------------------------------------------------------
 * مسار /sync/push كان يتحقق من المصادقة والفرع والشركة فقط، دون تطبيق قواعد
 * الأدوار الموجودة في مسارات REST — ما كان يسمح لكاشير بحقن قيد محاسبي أو
 * تعديل صنف عبر استدعاء الـ API مباشرة (تجاوز صلاحيات).
 *
 * هذه المصفوفة تطابق authorize() في المسارات:
 *   - saleInvoice  : POST /sales                    → admin, manager, accountant, cashier
 *   - quote        : POST /sales/quotes             → أي موظف (بلا authorize)
 *   - purchaseInvoice / purchaseOrder : /purchases  → admin, manager, accountant
 *   - stockTransfer / inventoryCount  : /transfers, /inventory → admin, manager
 *   - journalEntry : POST /journal                  → admin, manager, accountant
 *   - receipt      : POST /treasury/receipts        → admin, manager, accountant, cashier
 *   - treasury     : POST /treasury                 → admin, manager (+ accountant بقرار معماري)
 *   - bankReconciliation : /treasury/reconciliations → admin, manager, accountant
 *   - item         : POST/PUT /items                → admin, manager, accountant (الحذف: admin)
 *   - user         : /settings/users                → admin
 *   - company      : PUT /settings/company          → admin
 *   - branch       : /warehouses/branches           → admin
 *   - warehouse    : POST/PUT admin, manager — DELETE admin
 *   - catalog (category/brand/unit/attribute)       → admin
 *
 * الافتراضي: **المنع** — أي كيان أو إجراء غير مذكور صراحةً يُرفض لغير الأدمن.
 */

export type SyncAction = 'create' | 'update' | 'delete'

export interface SyncActorRole {
  role: string
  isSuperAdmin?: boolean
}

type RoleList = readonly string[]
type EntityRule = { create?: RoleList; update?: RoleList; delete?: RoleList }

// أدوار تشغيلية يمكنها الكتابة (المشاهد viewer للعرض فقط — لا يكتب شيئاً)
const ADMIN: RoleList = ['admin']
const ADMIN_MANAGER: RoleList = ['admin', 'manager']
const FINANCE: RoleList = ['admin', 'manager', 'accountant']
const SALES: RoleList = ['admin', 'manager', 'accountant', 'cashier']
const STAFF: RoleList = ['admin', 'manager', 'accountant', 'cashier']

export const SYNC_ENTITY_RBAC: Record<string, EntityRule> = {
  // المبيعات
  saleInvoice: { create: SALES, update: ADMIN_MANAGER, delete: ADMIN_MANAGER },
  quote: { create: STAFF, update: STAFF, delete: ADMIN_MANAGER },

  // المشتريات
  purchaseInvoice: { create: FINANCE, update: ADMIN_MANAGER, delete: ADMIN_MANAGER },
  purchaseOrder: { create: FINANCE, update: FINANCE, delete: ADMIN_MANAGER },

  // المخزون
  stockTransfer: { create: ADMIN_MANAGER, update: ADMIN_MANAGER, delete: ADMIN_MANAGER },
  inventoryCount: { create: ADMIN_MANAGER, update: ADMIN_MANAGER, delete: ADMIN_MANAGER },
  stockMovement: { create: FINANCE, delete: ADMIN },
  serial: { create: FINANCE, update: FINANCE, delete: ADMIN },

  // المحاسبة والخزينة
  journalEntry: { create: FINANCE, update: FINANCE, delete: ADMIN },
  account: { create: FINANCE, update: FINANCE, delete: ADMIN },
  receipt: { create: SALES, update: FINANCE, delete: FINANCE },
  treasury: { create: FINANCE, update: FINANCE, delete: ADMIN },
  bankReconciliation: { create: FINANCE, update: FINANCE, delete: ADMIN },

  // الملفات الأساسية
  item: { create: FINANCE, update: FINANCE, delete: ADMIN },
  party: { create: STAFF, update: STAFF, delete: FINANCE },

  // الإعدادات الحساسة
  user: { update: ADMIN },
  company: { update: ADMIN },
  branch: { create: ADMIN, update: ADMIN, delete: ADMIN },
  warehouse: { create: ADMIN_MANAGER, update: ADMIN_MANAGER, delete: ADMIN },
  exchangeRate: { create: ADMIN_MANAGER, update: ADMIN_MANAGER, delete: ADMIN },
  category: { create: ADMIN, update: ADMIN, delete: ADMIN },
  brand: { create: ADMIN, update: ADMIN, delete: ADMIN },
  unit: { create: ADMIN, update: ADMIN, delete: ADMIN },
  attribute: { create: ADMIN, update: ADMIN, delete: ADMIN },
}

// العميل يرسل أسماء الكتالوج بصيغة الجمع في بعض الشاشات
const ENTITY_ALIASES: Record<string, string> = {
  categories: 'category',
  brands: 'brand',
  units: 'unit',
  attributes: 'attribute',
  items: 'item',
  parties: 'party',
  sales: 'saleInvoice',
  purchases: 'purchaseInvoice',
  receipts: 'receipt',
  treasuries: 'treasury',
  journals: 'journalEntry',
  transfers: 'stockTransfer',
  counts: 'inventoryCount',
  quotes: 'quote',
  users: 'user',
  branches: 'branch',
  warehouses: 'warehouse',
}

export class SyncForbiddenError extends Error {
  code = 'FORBIDDEN'
  status = 403
  entity: string
  action: string

  constructor(entity: string, action: string, role: string) {
    super(`لا تملك صلاحية «${action}» على «${entity}» بدور «${role}» عبر المزامنة`)
    this.name = 'SyncForbiddenError'
    this.entity = entity
    this.action = action
  }
}

export function normalizeSyncEntity(entity: string): string {
  const raw = String(entity ?? '').trim()
  return ENTITY_ALIASES[raw] ?? raw
}

export function isSyncAllowed(actor: SyncActorRole, entity: string, action: string): boolean {
  if (!actor) return false
  if (actor.isSuperAdmin) return true
  if (actor.role === 'admin') return true

  const normalized = normalizeSyncEntity(entity)
  const rule = SYNC_ENTITY_RBAC[normalized]
  if (!rule) return false

  const allowed = rule[action as SyncAction]
  if (!allowed) return false
  return allowed.includes(actor.role)
}

export function assertSyncAllowed(actor: SyncActorRole, entity: string, action: string): void {
  if (isSyncAllowed(actor, entity, action)) return
  throw new SyncForbiddenError(normalizeSyncEntity(entity), action, actor?.role ?? 'unknown')
}
