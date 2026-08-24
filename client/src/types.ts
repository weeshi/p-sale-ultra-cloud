export interface User {
  id: number
  username: string
  fullName: string
  email?: string | null
  phone?: string | null
  role: string
  companyId: number
  companyName?: string
  branchId?: number | null
  branchName?: string | null
  isSuperAdmin?: boolean
  permissions?: Record<string, { view: boolean; add: boolean; edit: boolean; delete: boolean; print: boolean }>
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export type TransferAction = 'created' | 'approved' | 'received' | 'cancelled' | 'rejected'

export interface TransferNotificationPayload {
  action: TransferAction
  transferId: number
  transferNumber: string
  transferType: string
  fromWarehouseId: number
  toWarehouseId: number
  fromWarehouseName: string | null
  toWarehouseName: string | null
  message: string
}

export interface Company {
  id: number
  name: string
  address?: string | null
  phone?: string | null
  mobile?: string | null
  taxNumber?: string | null
  logo?: string | null
  fiscalYearStart?: number
}

export interface Party {
  id: number
  partyCode: string
  partyName: string
  partyType: 'customer' | 'vendor'
  address?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  whatsapp?: string | null
  taxNumber?: string | null
  creditLimit?: number
  openingBalance?: number
  currentBalance?: number
  accountId?: number | null
  account?: Account | null
  notes?: string | null
  isActive?: boolean
}

export interface Category {
  id: number
  name: string
  parentId?: number | null
  icon?: string | null
  children?: Category[]
  _count?: { items: number }
}

export interface Brand {
  id: number
  name: string
  logo?: string | null
  country?: string | null
}

export interface Unit {
  id: number
  name: string
  shortName: string
}

export interface Attribute {
  id: number
  name: string
  type: 'text' | 'number' | 'select' | 'multi-select'
  options?: string | string[] | null
  isFilterable?: boolean
}

export interface Account {
  id: number
  accountCode: string
  accountName: string
  accountType?: string
  parentId?: number | null
  isTerminal?: boolean
  openingBalance?: number | string
  currentBalance?: number | string
  isActive?: boolean
  children?: Account[]
}

export interface ItemAttribute {
  id: number
  itemId: number
  attributeId: number
  value: string
  attribute?: Attribute
}

export interface Item {
  id: number
  itemCode: string
  itemName: string
  barcode?: string | null
  modelNumber?: string | null
  categoryId?: number | null
  brandId?: number | null
  unitId?: number | null
  description?: string | null
  image?: string | null
  purchasePrice?: number
  purchasePriceUsd?: number
  salePrice?: number
  wholesalePrice?: number
  costPrice?: number
  currentStock?: number
  damagedStock?: number
  openingStock?: number
  minStock?: number
  reorderLevel?: number
  location?: string | null
  trackSerial: boolean
  isBundle?: boolean
  isActive?: boolean
  isService?: boolean
  taxRate?: number
  category?: Category | null
  brand?: Brand | null
  unit?: Unit | null
  attributes?: ItemAttribute[]
  serials?: Serial[]
  stock?: Array<{ warehouseId: number; quantity: number; damagedStock?: number; warehouse?: Warehouse | null }>
}

export interface ItemsResponse {
  items: Item[]
  total: number
  page: number
  limit: number
}

export interface PartiesResponse {
  parties: Party[]
  total: number
}

export interface DashboardStats {
  salesToday: number
  salesThisMonth: number
  purchasesThisMonth: number
  lowStockCount: number
  treasuryBalance: number
  invoiceCountToday: number
  totalReceivables: number
  overdueCount: number
}

export interface DashboardData {
  stats: DashboardStats
  lowStockItems: Array<{
    itemCode: string
    itemName: string
    warehouse: string
    quantity: number
    minStock: number
  }>
  recentInvoices: Array<{
    id: number
    invoiceNumber: string
    invoiceDate: string
    partyName?: string | null
    total: number
    paymentStatus: string
  }>
}

export interface Paginated<T> {
  items: T[]
  total: number
}

export interface ApiError {
  error?: string
  message?: string
}

export interface Branch {
  id: number
  name: string
  code: string
  isMain?: boolean
  address?: string | null
  phone?: string | null
  warehouses?: Warehouse[]
}

export interface Warehouse {
  id: number
  name: string
  code: string
  type?: string
  branchId?: number | null
  address?: string | null
  isActive?: boolean
  branch?: Branch | null
}

export interface Treasury {
  id: number
  treasuryName: string
  treasuryType: string
  currency: string
  currentBalance?: number | string
  openingBalance?: number | string
  accountId?: number | null
  account?: Account | null
  bankName?: string | null
  accountNumber?: string | null
  iban?: string | null
  isActive?: boolean
  branchId?: number | null
  companyId?: number
}

export interface Serial {
  id: number
  itemId: number
  warehouseId?: number | null
  serialNumber: string
  status: string
  costPrice?: number
  salePrice?: number
  warrantyMonths?: number | null
  warrantyEndsAt?: string | null
  soldAt?: string | null
  saleItemId?: number | null
  notes?: string | null
  item?: Item | null
  warehouse?: Warehouse | null
}

export interface SaleInvoiceItem {
  id: number
  invoiceId: number
  itemId: number
  quantity: number
  unitPrice: number
  costPrice?: number
  discount?: number
  total: number
  item?: Item | null
  serials?: Serial[]
}

export interface SaleInvoice {
  id: number
  invoiceNumber: string
  invoiceDate: string
  invoiceType: string
  subtotal: number
  taxRate: number
  taxAmount: number
  discount: number
  total: number
  paidAmount: number
  paymentStatus: string
  payType?: string | null
  bankingService?: string | null
  status: string
  notes?: string | null
  partyId?: number | null
  warehouseId?: number | null
  treasuryId?: number | null
  branchId?: number | null
  createdBy?: number | null
  party?: Party | null
  warehouse?: Warehouse | null
  branch?: Branch | null
  treasury?: Treasury | null
  items?: SaleInvoiceItem[]
  journalEntry?: unknown | null
}

export interface SalesResponse {
  invoices: SaleInvoice[]
  total: number
}

export interface PurchaseOrderItem {
  id: number
  purchaseOrderId: number
  itemId: number
  quantity: number
  unitPriceUsd: number
  unitPriceLyd: number
  discount?: number
  totalUsd: number
  totalLyd: number
  receivedQty?: number
  item?: Item | null
}

export interface PurchaseOrder {
  id: number
  poNumber: string
  poDate: string
  partyId: number
  currency: string
  exchangeRate: number
  status: string
  subtotal: number
  shippingCost: number
  customsCost: number
  insuranceCost: number
  otherCosts: number
  discount: number
  totalAmount: number
  totalAmountUsd: number
  advancePaid?: number
  lcNumber?: string | null
  lcBank?: string | null
  expectedArrival?: string | null
  actualArrival?: string | null
  targetWarehouseId?: number | null
  notes?: string | null
  createdBy?: number | null
  party?: Party | null
  items?: PurchaseOrderItem[]
  shipments?: Array<{ id: number; shipmentNumber: string; status: string; arrivalDate?: string | null }>
}

export interface PurchaseOrdersResponse {
  orders: PurchaseOrder[]
  total: number
}

export interface PurchaseInvoiceItem {
  id: number
  invoiceId: number
  itemId: number
  quantity: number
  unitPrice: number
  unitPriceUsd: number
  landedCost: number
  unitCost: number
  discount?: number
  total: number
  item?: Item | null
  serials?: Serial[]
}

export interface PurchaseInvoice {
  id: number
  invoiceNumber: string
  invoiceDate: string
  partyId: number
  warehouseId?: number | null
  treasuryId?: number | null
  purchaseOrderId?: number | null
  currency: string
  exchangeRate: number
  subtotal: number
  taxRate?: number
  taxAmount?: number
  discount?: number
  shippingCost?: number
  customsCost?: number
  total: number
  paidAmount?: number
  paymentStatus: string
  payType?: string | null
  bankingService?: string | null
  status?: string
  notes?: string | null
  createdBy?: number | null
  party?: Party | null
  warehouse?: Warehouse | null
  treasury?: Treasury | null
  items?: PurchaseInvoiceItem[]
}

export interface PurchasesResponse {
  invoices: PurchaseInvoice[]
  total: number
}

export interface QuoteItem {
  id: number
  quoteId: number
  itemId: number
  quantity: number
  unitPrice: number
  discount?: number
  total: number
  item?: Item | null
}

export interface Quote {
  id: number
  quoteNumber: string
  quoteDate: string
  partyId?: number | null
  branchId?: number | null
  validUntil?: string | null
  status: string
  subtotal: number
  taxRate: number
  taxAmount: number
  discount: number
  total: number
  notes?: string | null
  saleInvoiceId?: number | null
  createdBy?: number | null
  party?: Party | null
  items?: QuoteItem[]
}

export interface StockTransferItem {
  id: number
  transferId: number
  itemId: number
  quantity: number
  unitCost: number
  receivedQty?: number | null
  item?: Item | null
}

export interface StockTransfer {
  id: number
  companyId: number
  transferNumber: string
  transferDate: string
  fromWarehouseId: number
  toWarehouseId: number
  status: string
  transferType: string
  requestedBy?: number | null
  approvedBy?: number | null
  receivedBy?: number | null
  approvedAt?: string | null
  receivedAt?: string | null
  notes?: string | null
  fromWarehouse?: Warehouse | null
  toWarehouse?: Warehouse | null
  items?: StockTransferItem[]
}

export interface TransfersResponse {
  transfers: StockTransfer[]
  total: number
}

export type PurchaseTrack = 'import' | 'local' | 'internal'

export interface UnifiedPurchase {
  key: string
  type: PurchaseTrack
  number: string
  date: string
  partyId: number | null
  partyName: string
  direction: string
  warehouseId: number | null
  warehouseName: string
  total: number
  totalUsd: number
  currency: string
  status: string
  notes?: string | null
  raw: PurchaseOrder | PurchaseInvoice | StockTransfer
}

export interface UnifiedPurchasesResponse {
  purchases: UnifiedPurchase[]
  total: number
}

export interface InventoryCountItem {
  id: number
  countId: number
  itemId: number
  systemQty: number
  countedQty: number
  countedGoodQty: number
  countedDamagedQty: number
  difference: number
  unitCost?: number | null
  varianceValue?: number | null
  item?: Item | null
}

export interface InventoryCount {
  id: number
  companyId: number
  countNumber: string
  countDate: string
  warehouseId: number
  status: string
  notes?: string | null
  parentCountId?: number | null
  createdBy?: number | null
  postedBy?: number | null
  postedAt?: string | null
  createdAt?: string
  warehouse?: Warehouse | null
  parentCount?: Pick<InventoryCount, 'id' | 'countNumber'> | null
  creator?: Pick<User, 'id' | 'username' | 'fullName'> | null
  poster?: Pick<User, 'id' | 'username' | 'fullName'> | null
  items?: InventoryCountItem[]
}

export interface StockMovement {
  id: number
  companyId: number
  movementDate: string
  movementType: string
  referenceType?: string | null
  referenceId?: number | null
  itemId: number
  warehouseId?: number | null
  quantity: number
  unitCost?: number | null
  totalCost?: number | null
  balanceAfter?: number | null
  notes?: string | null
  createdBy?: number | null
  item?: Item | null
  warehouse?: Warehouse | null
}

export interface StockMovementSummary {
  itemId: number
  itemCode: string
  itemName: string
  in: number
  out: number
  net: number
  damaged: number
}

export interface StockMovementsResponse {
  movements: StockMovement[]
  summary: StockMovementSummary[]
}

export interface StockValuationItem {
  itemId: number
  itemCode: string
  itemName: string
  warehouseName: string
  quantity: number
  damagedStock?: number
  validStock?: number
  costPrice: number
  totalValue: number
}

export interface StockValuationResponse {
  items: StockValuationItem[]
  totalValue: number
}

export interface LowStockItem {
  itemId: number
  itemCode: string
  itemName: string
  warehouse: string
  quantity: number
  minStock: number
}

export interface JournalLine {
  id: number
  journalEntryId: number
  lineNumber: number
  accountId: number
  description?: string | null
  debit: number
  credit: number
  partyId?: number | null
  currency: string
  currencyAmount?: number | null
  account?: Account | null
}

export interface JournalEntry {
  id: number
  companyId: number
  entryNumber: number
  entryDate: string
  entryType: string
  referenceType?: string | null
  referenceId?: number | null
  branchId?: number | null
  description?: string | null
  totalDebit: number
  totalCredit: number
  currency: string
  exchangeRate: number
  isPosted: boolean
  isReversed: boolean
  reversedById?: number | null
  createdBy?: number | null
  createdAt?: string
  lines?: JournalLine[]
  creator?: { id: number; username: string; fullName: string } | null
}

export interface JournalEntriesResponse {
  entries: JournalEntry[]
  total: number
}

export interface JournalLineInput {
  accountId: string
  description: string
  debit: string
  credit: string
}

export interface TrialBalanceRow {
  accountCode: string
  accountName: string
  accountType: string
  debit: number
  credit: number
}

export interface TrialBalanceResponse {
  accounts: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  balanced: boolean
}

export interface IncomeStatementRow {
  code: string
  name: string
  amount: number
}

export interface IncomeStatementResponse {
  revenues: IncomeStatementRow[]
  expenses: IncomeStatementRow[]
  totalRevenue: number
  totalExpense: number
  netIncome: number
}

export interface BalanceSheetSectionRow {
  code: string
  name: string
  balance: number
}

export interface BalanceSheetResponse {
  assets: BalanceSheetSectionRow[]
  liabilities: BalanceSheetSectionRow[]
  equity: BalanceSheetSectionRow[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  balanced: boolean
}

export interface LedgerRow {
  entryNumber: string
  entryDate: string
  description: string
  debit: number | string
  credit: number | string
  balance: number
  referenceType?: string | null
  referenceId?: number | null
}

export interface AccountLedgerResponse {
  account: Account | null
  openingBalance: number
  lines: LedgerRow[]
  closingBalance: number
}

export interface PartyLedgerResponse {
  party: Party | null
  openingBalance: number
  lines: LedgerRow[]
  closingBalance: number
}

export interface Receipt {
  id: number
  receiptNumber: string
  receiptDate: string
  receiptType: 'receipt' | 'payment'
  partyId?: number | null
  party?: Party | null
  treasuryId?: number | null
  treasury?: Treasury | null
  branchId?: number | null
  currency: 'LYD' | 'USD'
  exchangeRate: number | string
  amount: number | string
  amountUsd: number | string
  paymentMethod: string
  checkNumber?: string | null
  checkDate?: string | null
  bankName?: string | null
  referenceNo?: string | null
  saleInvoiceId?: number | null
  purchaseInvoiceId?: number | null
  journalEntryId?: number | null
  journalEntry?: JournalEntry | null
  notes?: string | null
  createdBy?: number | null
  createdAt?: string
}

export interface ReceiptsResponse {
  receipts: Receipt[]
  total: number
}

export interface ExchangeRateResponse {
  from: string
  to: string
  rate: number | string
}

export interface BankReconciliationLine {
  id: number
  reconciliationId: number
  receiptId: number
  isMatched: boolean
  note?: string | null
  createdAt?: string
  receipt?: Receipt & { party?: Party | null }
}

export interface BankReconciliation {
  id: number
  reconNumber: string
  statementDate: string
  openingBalance: number | string
  statementBalance: number | string
  systemBalance: number | string
  difference: number | string
  status: 'draft' | 'matched' | 'completed'
  notes?: string | null
  createdBy?: number | null
  createdAt?: string
  treasury?: Treasury | null
  lines?: BankReconciliationLine[]
  _count?: { lines: number }
}

export interface BankReconciliationListResponse {
  reconciliations: BankReconciliation[]
}

export interface BankTransactionRow extends Receipt {
  signed: number
  runningBalance: number
}

export interface BankTransactionsResponse {
  treasury: Treasury
  openingBalance: number
  currentBalance: number
  closingSystemBalance: number
  totalReceipts: number
  totalPayments: number
  transactions: BankTransactionRow[]
}

export interface Permission {
  id?: number
  module: string
  canView: boolean
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  canPrint: boolean
}

export interface SystemUser {
  id: number
  username: string
  fullName: string
  email?: string | null
  phone?: string | null
  role: string
  branchId?: number | null
  isActive?: boolean
  isSuperAdmin?: boolean
  lastLoginAt?: string | null
  branch?: { name: string } | null
  permissions: Permission[]
}

export interface AuditLog {
  id: number
  userId?: number | null
  action: string
  tableName: string
  eventType?: string | null
  recordId?: number | null
  oldValues?: string | null
  newValues?: string | null
  ipAddress?: string | null
  createdAt: string
  user?: { username: string; fullName: string } | null
}

export interface AuditLogsResponse {
  logs: AuditLog[]
  total: number
}

export interface ExchangeRateEntry {
  id: number
  fromCurrency: string
  toCurrency: string
  rate: number | string
  isAuto: boolean
  rateDate: string
}

export interface SalesReportSummary {
  count: number
  subtotal: number
  tax: number
  discount: number
  total: number
  paid: number
}

export interface SalesReportResponse {
  invoices: SaleInvoice[]
  summary: SalesReportSummary
}

export interface ProfitReportItem {
  itemId: number
  quantity: number
  revenue: number
  cost: number
  profit: number
  margin: number
  itemName?: string
}

export interface ProfitReportResponse {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  margin: number
  items: ProfitReportItem[]
  invoiceCount: number
}

export interface CustomersReportResponse {
  parties: Party[]
  summary: { debit: number; credit: number }
}

export interface TreasuryReportResponse {
  receipts: Receipt[]
  summary: { receipts: number; payments: number; balance: number }
}

export interface SerialsReportResponse {
  serials: Serial[]
  byStatus: Record<string, number>
}

export interface Warranty {
  id: number
  warrantyNumber: string
  serialId: number
  saleInvoiceId?: number | null
  partyId?: number | null
  startDate: string
  endDate: string
  warrantyType: string
  status: string
  notes?: string | null
  createdAt?: string
  serial?: Serial | null
  party?: Party | null
}

export interface WarrantyReportResponse {
  warranties: Warranty[]
  expiringSoon: Warranty[]
}
