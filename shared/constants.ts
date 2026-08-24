export const ACCOUNT_TYPES = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  REVENUE: 'revenue',
  EXPENSE: 'expense',
} as const

export const CURRENCIES = {
  LYD: 'LYD',
  USD: 'USD',
} as const

export const PARTY_TYPES = {
  CUSTOMER: 'customer',
  VENDOR: 'vendor',
  BOTH: 'both',
} as const

export const MOVEMENT_TYPES = {
  PURCHASE: 'purchase',
  SALE: 'sale',
  OPENING: 'opening',
  ADJUSTMENT: 'adjustment',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  RETURN: 'return',
  COUNT_ADJUSTMENT: 'count_adjustment',
  DAMAGED: 'damaged',
  RETURN_DAMAGED: 'return_damaged',
  DAMAGE_REVERSAL: 'damage_reversal',
  INVENTORY_ADJUSTMENT_GOOD: 'inventory_adjustment_good',
  INVENTORY_ADJUSTMENT_DAMAGED: 'inventory_adjustment_damaged',
} as const

export const SERIAL_STATUS = {
  IN_STOCK: 'in_stock',
  SOLD: 'sold',
  WARRANTY: 'warranty',
  RETURNED: 'returned',
  DAMAGED: 'damaged',
  IN_TRANSIT: 'in_transit',
} as const

export const PAYMENT_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
} as const

export const PAYMENT_METHODS = {
  CASH: 'cash',
  CHECK: 'check',
  TRANSFER: 'transfer',
  CARD: 'card',
} as const

export const INVOICE_TYPES = {
  SALE: 'sale',
  RETURN: 'return',
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchase_return',
} as const

export const JOURNAL_TYPES = {
  PURCHASE: 'purchase',
  SALE: 'sale',
  RECEIPT: 'receipt',
  PAYMENT: 'payment',
  ADJUSTING: 'adjusting',
  OPENING: 'opening',
  TRANSFER: 'transfer',
  RETURN: 'return',
  COGS: 'cogs',
  EXPENSE: 'expense',
} as const

export const TRANSFER_TYPES = {
  TRANSFER: 'transfer',
  BRANCH_REQUEST: 'branch_request',
  RETURN_TO_CENTRAL: 'return_to_central',
} as const

export const TRANSFER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  IN_TRANSIT: 'in_transit',
  RECEIVED: 'received',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const

export const PO_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  CONFIRMED: 'confirmed',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const

export const RMA_TYPES = {
  REPAIR: 'repair',
  REPLACE: 'replace',
  REFUND: 'refund',
  RETURN: 'return',
} as const

export const RMA_STATUS = {
  OPEN: 'open',
  RECEIVED: 'received',
  DIAGNOSED: 'diagnosed',
  REPAIRING: 'repairing',
  AWAITING_PARTS: 'awaiting_parts',
  REPAIRED: 'repaired',
  REPLACED: 'replaced',
  REFUNDED: 'refunded',
  CLOSED: 'closed',
} as const

export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  ACCOUNTANT: 'accountant',
  CASHIER: 'cashier',
  VIEWER: 'viewer',
} as const

export const USER_ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  accountant: 'محاسب',
  cashier: 'كاشير',
  viewer: 'مشاهد',
}

export const MODULES = {
  ITEMS: 'items',
  ACCOUNTS: 'accounts',
  PARTIES: 'parties',
  PURCHASES: 'purchases',
  SALES: 'sales',
  TREASURY: 'treasury',
  JOURNAL: 'journal',
  REPORTS: 'reports',
  WAREHOUSES: 'warehouses',
  TRANSFERS: 'transfers',
  INVENTORY: 'inventory',
  WARRANTY: 'warranty',
  RMA: 'rma',
  SETTINGS: 'settings',
  USERS: 'users',
} as const

// ============ الصلاحيات الافتراضية حسب الدور ============

export interface PermissionSet {
  canView: boolean
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  canPrint: boolean
}

const PERM_ALL: PermissionSet = { canView: true, canAdd: true, canEdit: true, canDelete: true, canPrint: true }
const PERM_MANAGE: PermissionSet = { canView: true, canAdd: true, canEdit: true, canDelete: false, canPrint: true }
const PERM_READ: PermissionSet = { canView: true, canAdd: false, canEdit: false, canDelete: false, canPrint: false }
const PERM_READ_PRINT: PermissionSet = { canView: true, canAdd: false, canEdit: false, canDelete: false, canPrint: true }
const PERM_NONE: PermissionSet = { canView: false, canAdd: false, canEdit: false, canDelete: false, canPrint: false }
const PERM_CASHIER: PermissionSet = { canView: true, canAdd: true, canEdit: false, canDelete: false, canPrint: true }

// ملاحظة أمنية: صلاحية الحذف (canDelete) محجوزة للأدمن فقط — كل الأدوار الأخرى وصفاتها بلا حذف
export const ROLE_PERMISSION_PRESETS: Record<string, (module: string) => PermissionSet> = {
  [ROLES.ADMIN]: () => PERM_ALL,
  [ROLES.MANAGER]: (m) => {
    if (m === MODULES.SETTINGS || m === MODULES.USERS) return PERM_READ
    if (m === MODULES.ACCOUNTS || m === MODULES.JOURNAL || m === MODULES.REPORTS) return PERM_READ_PRINT
    return PERM_MANAGE
  },
  [ROLES.ACCOUNTANT]: (m) => {
    if (m === MODULES.ACCOUNTS || m === MODULES.JOURNAL || m === MODULES.TREASURY) return PERM_MANAGE
    if (m === MODULES.ITEMS || m === MODULES.PARTIES || m === MODULES.PURCHASES || m === MODULES.SALES || m === MODULES.REPORTS) {
      return PERM_READ_PRINT
    }
    return PERM_READ
  },
  [ROLES.CASHIER]: (m) => (m === MODULES.SALES || m === MODULES.TREASURY ? PERM_CASHIER : PERM_NONE),
  [ROLES.VIEWER]: () => PERM_READ,
}

// يبني قائمة صلاحيات كاملة للوحدات المطلوبة وفق وصفة الدور (تُستخدم عند إنشاء مستخدم أو تغيير دوره)
export function buildRolePermissions(
  role: string,
  modules: string[] = Object.values(MODULES)
): Array<PermissionSet & { module: string }> {
  const preset = ROLE_PERMISSION_PRESETS[role] ?? (() => PERM_NONE)
  return modules.map((module) => ({ module, ...preset(module) }))
}

export const WAREHOUSE_TYPES = {
  CENTRAL: 'central',
  BRANCH: 'branch',
  DAMAGED: 'damaged',
  RETURNED: 'returned',
  DISPLAY: 'display',
} as const

export const DEFAULT_EXCHANGE_RATE_USD_LYD = 5.4

export const BARCODE_PREFIX = 'PSU'

// بادئات تسلسل أرقام المستندات (تُزرع عند إعداد الشركة في authService.setup)
export const SEQUENCE_PREFIXES = [
  'INV', // فاتورة بيع
  'RET', // مرتجع بيع
  'QOT', // عرض سعر
  'PO', // أمر شراء
  'PINV', // فاتورة شراء
  'RCV', // سند قبض
  'PAY', // سند صرف
  'TRN', // تحويل مخزون
  'CNT', // جرد مخزون
  'WRN', // ضمان
  'RMA', // صيانة
  'JRN', // قيد محاسبي
  'RC', // تسوية بنكية
  'ITM', // صنف (تلقائي)
  'PTY', // طرف/عميل/مورد (تلقائي)
] as const
