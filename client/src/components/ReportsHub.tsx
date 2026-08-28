import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, extractError } from '@/lib/api'
import { cachedRead } from '@/lib/offline'
import TabSelector from '@/components/TabSelector'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { printDocument } from '@/lib/print'
import { fmt, fmtDate, fmtMoney, toNum } from '@/lib/format'
import type {
  CustomersReportResponse,
  Item,
  LowStockItem,
  Party,
  ProfitReportResponse,
  SalesReportResponse,
  SerialsReportResponse,
  StockMovementsResponse,
  StockValuationResponse,
  Treasury,
  TreasuryReportResponse,
  Warehouse,
  WarrantyReportResponse,
} from '@/types'

type TabKey =
  | 'sales'
  | 'profit'
  | 'customers'
  | 'treasury'
  | 'serials'
  | 'warranties'
  | 'movements'
  | 'lowstock'
  | 'valuation'
  | 'dashboard'

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'sales', label: 'المبيعات', icon: '🧾' },
  { key: 'profit', label: 'الأرباح', icon: '💹' },
  { key: 'customers', label: 'العملاء', icon: '👥' },
  { key: 'treasury', label: 'الخزينة', icon: '💰' },
  { key: 'serials', label: 'السيريالات', icon: '🔢' },
  { key: 'warranties', label: 'الضمانات', icon: '🛡️' },
  { key: 'movements', label: 'حركة الأصناف', icon: '📈' },
  { key: 'lowstock', label: 'مخزون منخفض', icon: '⚠️' },
  { key: 'valuation', label: 'تقييم المخزون', icon: '💎' },
  { key: 'dashboard', label: 'لوحة المعلومات', icon: '📊' },
]

const PAYMENT_LABEL: Record<string, string> = { paid: 'مدفوع', partial: 'جزئي', unpaid: 'غير مدفوع' }
const RECEIPT_LABEL: Record<string, string> = { receipt: 'قبض', payment: 'صرف' }
const SERIAL_LABEL: Record<string, string> = {
  in_stock: 'في المخزن',
  sold: 'مباع',
  warranty: 'ضمان',
  returned: 'مرتجع',
  in_maintenance: 'صيانة',
  lost: 'مفقود',
}
const WARRANTY_STATUS: Record<string, string> = { active: 'نشط', expired: 'منتهي', claimed: 'مطالب به', void: 'ملغي' }
const WARRANTY_TYPE: Record<string, string> = { manufacturer: 'مصنع', store: 'متجر', extended: 'ممتد' }

function printReport(title: string, subtitle: string, headers: string[], rows: string[][], totals?: string): void {
  const head = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
  const html = `
  <div class="doc">
    <div class="head">
      <div>
        <h1>${title}</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px">نظام P-Sale Ultra Cloud</div>
      </div>
      <div class="meta">${subtitle}</div>
    </div>
    <table>
      <thead>${head}</thead>
      <tbody>${body}</tbody>
    </table>
    ${totals ?? ''}
    <div class="footer">تقرير — P-Sale Ultra Cloud</div>
  </div>`
  printDocument(title, html)
}

function SummaryCards({ items }: { items: Array<{ label: string; value: string; cls?: string }> }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
          <p className="text-xs text-slate-500">{s.label}</p>
          <p className={`mt-1 text-lg font-bold ${s.cls ?? 'text-slate-800'}`}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function useBaseData() {
  const { selectedBranchId } = useBranchFilter()
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [treasuries, setTreasuries] = useState<Treasury[]>([])

  useEffect(() => {
    const br = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
    Promise.all([
      cachedRead<{ items: Item[]; total: number }>('items:list', () =>
        api.get('/items?limit=300').then((r) => r.data), 'inventory'
      ),
      cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () =>
        api.get(`/warehouses${br}`).then((r) => r.data), 'warehouses'
      ),
      cachedRead<{ parties: Party[]; total: number }>('parties:list', () =>
        api.get('/parties?limit=500').then((r) => r.data), 'parties'
      ),
      cachedRead<Treasury[]>(`treasuries:list:${selectedBranchId ?? 'all'}`, () => api.get(`/treasury${br}`).then((r) => r.data), 'treasuries'
      ),
    ])
      .then(([i, w, p, t]) => {
        setItems(i.data.items ?? [])
        setWarehouses(w.data ?? [])
        setParties(p.data.parties ?? [])
        setTreasuries(t.data ?? [])
      })
      .catch(() => {})
  }, [selectedBranchId])

  return { items, warehouses, parties, treasuries }
}

function periodParams(from: string, to: string): URLSearchParams {
  const params = new URLSearchParams()
  if (from) params.set('from', new Date(from + 'T00:00:00').toISOString())
  if (to) params.set('to', new Date(to + 'T23:59:59').toISOString())
  return params
}

function periodLabel(from: string, to: string): string {
  if (from || to) return `الفترة: ${from || '...'} ← ${to || '...'}`
  return 'الفترة: الكل'
}

function SalesReport() {
  const { selectedBranchId } = useBranchFilter()
  const { parties, items } = useBaseData()
  const [data, setData] = useState<SalesReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [partyId, setPartyId] = useState('')
  const [itemId, setItemId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = periodParams(from, to)
      if (partyId) params.set('partyId', partyId)
      if (itemId) params.set('itemId', itemId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const res = await cachedRead<SalesReportResponse>(`report-sales:${params.toString()}`, () =>
        api.get(`/reports/sales?${params.toString()}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [from, to, partyId, itemId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const s = data?.summary
  const rows = (data?.invoices ?? []).map((inv) => [
    inv.invoiceNumber,
    fmtDate(inv.invoiceDate),
    inv.party?.partyName ?? 'نقدي',
    inv.branch?.name ?? '—',
    fmt(inv.subtotal),
    fmt(inv.taxAmount),
    fmt(inv.discount),
    fmtMoney(inv.total),
    PAYMENT_LABEL[inv.paymentStatus] ?? inv.paymentStatus,
  ])

  const print = () =>
    printReport(
      'تقرير المبيعات',
      periodLabel(from, to),
      ['الرقم', 'التاريخ', 'العميل', 'الفرع', 'المجموع', 'الضريبة', 'الخصم', 'الإجمالي', 'الحالة'],
      rows,
      s
        ? `<table class="totals">
            <tr><td>عدد الفواتير</td><td>${fmt(s.count)}</td></tr>
            <tr><td>المجموع الفرعي</td><td>${fmtMoney(s.subtotal)}</td></tr>
            <tr><td>الضريبة</td><td>${fmtMoney(s.tax)}</td></tr>
            <tr><td>الخصم</td><td>${fmtMoney(s.discount)}</td></tr>
            <tr class="grand"><td>الإجمالي</td><td>${fmtMoney(s.total)}</td></tr>
            <tr><td>المدفوع</td><td>${fmtMoney(s.paid)}</td></tr>
          </table>`
        : ''
    )

  return (
    <div>
      <ReportHeader
        title="تقرير المبيعات"
        subtitle="فواتير البيع المسجلة حسب الفترة والفلاتر"
        onPrint={print}
        disabled={loading}
      />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Field label="من"><DateInput value={from} onChange={setFrom} /></Field>
        <Field label="إلى"><DateInput value={to} onChange={setTo} /></Field>
        <Field label="العميل">
          <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">الكل</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.partyName}</option>
            ))}
          </select>
        </Field>
        <Field label="الصنف">
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">الكل</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemName}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary w-full">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {s && (
        <SummaryCards
          items={[
            { label: 'عدد الفواتير', value: fmt(s.count) },
            { label: 'المجموع الفرعي', value: fmtMoney(s.subtotal) },
            { label: 'الضريبة', value: fmtMoney(s.tax) },
            { label: 'الخصم', value: fmtMoney(s.discount) },
            { label: 'الإجمالي', value: fmtMoney(s.total) },
            { label: 'المدفوع', value: fmtMoney(s.paid) },
          ]}
        />
      )}

      {loading ? (
        <LoadingText />
      ) : rows.length === 0 ? (
        <Empty text="لا توجد فواتير مطابقة" />
      ) : (
        <DataTable
          headers={['الرقم', 'التاريخ', 'العميل', 'الفرع', 'المجموع', 'الضريبة', 'الخصم', 'الإجمالي', 'الحالة']}
          rows={data!.invoices.map((inv) => [
            inv.invoiceNumber,
            fmtDate(inv.invoiceDate),
            inv.party?.partyName ?? 'نقدي',
            inv.branch?.name ?? '—',
            fmt(inv.subtotal),
            fmt(inv.taxAmount),
            fmt(inv.discount),
            <span key="t" className="font-semibold">{fmtMoney(inv.total)}</span>,
            <span key="p" className={`rounded-full px-2 py-0.5 text-xs ${PAYMENT_LABEL[inv.paymentStatus] ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {PAYMENT_LABEL[inv.paymentStatus] ?? inv.paymentStatus}
            </span>,
          ])}
        />
      )}
    </div>
  )
}

function ProfitReport() {
  const { selectedBranchId } = useBranchFilter()
  const { items } = useBaseData()
  const [data, setData] = useState<ProfitReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = periodParams(from, to)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const res = await cachedRead<ProfitReportResponse>(`report-profit:${params.toString()}`, () =>
        api.get(`/reports/profit?${params.toString()}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [from, to, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const rows = (data?.items ?? []).map((it) => [
    String(it.itemId),
    items.find((i) => i.id === it.itemId)?.itemName ?? `#${it.itemId}`,
    fmt(it.quantity),
    fmtMoney(it.revenue),
    fmtMoney(it.cost),
    fmtMoney(it.profit),
    `${fmt(it.margin)}%`,
  ])

  const print = () =>
    printReport(
      'تقرير الأرباح',
      periodLabel(from, to),
      ['الرقم', 'الصنف', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش'],
      rows,
      data
        ? `<table class="totals">
            <tr><td>عدد الفواتير</td><td>${fmt(data.invoiceCount)}</td></tr>
            <tr><td>الإيرادات</td><td>${fmtMoney(data.totalRevenue)}</td></tr>
            <tr><td>التكاليف</td><td>${fmtMoney(data.totalCost)}</td></tr>
            <tr class="grand"><td>صافي الربح</td><td>${fmtMoney(data.totalProfit)}</td></tr>
            <tr><td>الهامش</td><td>${fmt(data.margin)}%</td></tr>
          </table>`
        : ''
    )

  return (
    <div>
      <ReportHeader title="تقرير الأرباح" subtitle="إجمالي الربح حسب الصنف والفترة" onPrint={print} disabled={loading} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="من"><DateInput value={from} onChange={setFrom} /></Field>
        <Field label="إلى"><DateInput value={to} onChange={setTo} /></Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary w-full">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {data && (
        <SummaryCards
          items={[
            { label: 'الفواتير', value: fmt(data.invoiceCount) },
            { label: 'الإيرادات', value: fmtMoney(data.totalRevenue), cls: 'text-green-700' },
            { label: 'التكاليف', value: fmtMoney(data.totalCost), cls: 'text-red-700' },
            { label: 'صافي الربح', value: fmtMoney(data.totalProfit), cls: toNum(data.totalProfit) >= 0 ? 'text-green-700' : 'text-red-700' },
            { label: 'الهامش', value: `${fmt(data.margin)}%` },
          ]}
        />
      )}

      {loading ? (
        <LoadingText />
      ) : rows.length === 0 ? (
        <Empty text="لا توجد بيانات في هذه الفترة" />
      ) : (
        <DataTable
          headers={['الرقم', 'الصنف', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش']}
          rows={data!.items.map((it) => [
            String(it.itemId),
            items.find((i) => i.id === it.itemId)?.itemName ?? `#${it.itemId}`,
            fmt(it.quantity),
            fmtMoney(it.revenue),
            fmtMoney(it.cost),
            <span key="p" className={`font-semibold ${toNum(it.profit) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtMoney(it.profit)}</span>,
            `${fmt(it.margin)}%`,
          ])}
        />
      )}
    </div>
  )
}

function CustomersReport() {
  const [data, setData] = useState<CustomersReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [type, setType] = useState<'customer' | 'vendor'>('customer')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cachedRead<CustomersReportResponse>(`report-customers:${type}`, () =>
        api.get(`/reports/customers?type=${type}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => {
    load()
  }, [load])

  const rows = (data?.parties ?? []).map((p) => [
    p.partyCode,
    p.partyName,
    p.mobile ?? '—',
    toNum(p.currentBalance) >= 0 ? fmtMoney(p.currentBalance) : fmtMoney(Math.abs(toNum(p.currentBalance))),
    toNum(p.currentBalance) >= 0 ? 'مدين' : 'دائن',
  ])

  const print = () =>
    printReport(
      type === 'customer' ? 'تقرير العملاء' : 'تقرير الموردين',
      'الأرصدة الحالية',
      ['الكود', 'الاسم', 'الهاتف', 'الرصيد', 'الاتجاه'],
      rows,
      data
        ? `<table class="totals">
            <tr><td>إجمالي المدين</td><td>${fmtMoney(data.summary.debit)}</td></tr>
            <tr><td>إجمالي الدائن</td><td>${fmtMoney(data.summary.credit)}</td></tr>
          </table>`
        : ''
    )

  return (
    <div>
      <ReportHeader
        title={type === 'customer' ? 'تقرير العملاء' : 'تقرير الموردين'}
        subtitle="أرصدة الأطراف الحالية"
        onPrint={print}
        disabled={loading}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          <button
            onClick={() => setType('customer')}
            className={`px-4 py-2 text-sm ${type === 'customer' ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-600'}`}
          >
            العملاء
          </button>
          <button
            onClick={() => setType('vendor')}
            className={`px-4 py-2 text-sm ${type === 'vendor' ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-600'}`}
          >
            الموردون
          </button>
        </div>
        <button onClick={load} className="btn-secondary">🔄 تحديث</button>
      </div>

      {error && <ErrorBanner text={error} />}

      {data && (
        <SummaryCards
          items={[
            { label: 'عدد الأطراف', value: fmt(data.parties.length) },
            { label: 'إجمالي المدين', value: fmtMoney(data.summary.debit), cls: 'text-red-700' },
            { label: 'إجمالي الدائن', value: fmtMoney(data.summary.credit), cls: 'text-green-700' },
          ]}
        />
      )}

      {loading ? (
        <LoadingText />
      ) : rows.length === 0 ? (
        <Empty text="لا توجد أطراف" />
      ) : (
        <DataTable
          headers={['الكود', 'الاسم', 'الهاتف', 'الرصيد', 'الاتجاه']}
          rows={data!.parties.map((p) => [
            p.partyCode,
            p.partyName,
            p.mobile ?? '—',
            <span key="b" className={`font-semibold ${toNum(p.currentBalance) >= 0 ? 'text-red-700' : 'text-green-700'}`}>
              {fmtMoney(Math.abs(toNum(p.currentBalance)))}
            </span>,
            toNum(p.currentBalance) >= 0 ? 'مدين' : 'دائن',
          ])}
        />
      )}
    </div>
  )
}

function TreasuryReport() {
  const { selectedBranchId } = useBranchFilter()
  const { treasuries } = useBaseData()
  const [data, setData] = useState<TreasuryReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [treasuryId, setTreasuryId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = periodParams(from, to)
      if (treasuryId) params.set('treasuryId', treasuryId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const res = await cachedRead<TreasuryReportResponse>(`report-treasury:${params.toString()}`, () =>
        api.get(`/reports/treasury?${params.toString()}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [from, to, treasuryId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const rows = (data?.receipts ?? []).map((r) => [
    r.receiptNumber,
    fmtDate(r.receiptDate),
    RECEIPT_LABEL[r.receiptType] ?? r.receiptType,
    r.party?.partyName ?? '—',
    r.treasury?.treasuryName ?? '—',
    `${fmt(r.amount)} ${r.currency ?? 'LYD'}`,
  ])

  const print = () =>
    printReport(
      'تقرير الخزينة',
      periodLabel(from, to),
      ['الرقم', 'التاريخ', 'النوع', 'الطرف', 'الخزينة', 'المبلغ'],
      rows,
      data
        ? `<table class="totals">
            <tr><td>القبض</td><td>${fmtMoney(data.summary.receipts)}</td></tr>
            <tr><td>الصرف</td><td>${fmtMoney(data.summary.payments)}</td></tr>
            <tr class="grand"><td>الصافي</td><td>${fmtMoney(data.summary.balance)}</td></tr>
          </table>`
        : ''
    )

  return (
    <div>
      <ReportHeader title="تقرير الخزينة" subtitle="سندات القبض والصرف حسب الفترة والخزينة" onPrint={print} disabled={loading} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Field label="من"><DateInput value={from} onChange={setFrom} /></Field>
        <Field label="إلى"><DateInput value={to} onChange={setTo} /></Field>
        <Field label="الخزينة">
          <select className="input" value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
            <option value="">الكل</option>
            {treasuries.map((t) => (
              <option key={t.id} value={t.id}>{t.treasuryName}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary w-full">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {data && (
        <SummaryCards
          items={[
            { label: 'القبض', value: fmtMoney(data.summary.receipts), cls: 'text-green-700' },
            { label: 'الصرف', value: fmtMoney(data.summary.payments), cls: 'text-red-700' },
            { label: 'الصافي', value: fmtMoney(data.summary.balance), cls: toNum(data.summary.balance) >= 0 ? 'text-green-700' : 'text-red-700' },
          ]}
        />
      )}

      {loading ? (
        <LoadingText />
      ) : rows.length === 0 ? (
        <Empty text="لا توجد سندات مطابقة" />
      ) : (
        <DataTable
          headers={['الرقم', 'التاريخ', 'النوع', 'الطرف', 'الخزينة', 'المبلغ']}
          rows={data!.receipts.map((r) => [
            r.receiptNumber,
            fmtDate(r.receiptDate),
            <span key="t" className={`rounded-full px-2 py-0.5 text-xs ${r.receiptType === 'receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {RECEIPT_LABEL[r.receiptType] ?? r.receiptType}
            </span>,
            r.party?.partyName ?? '—',
            r.treasury?.treasuryName ?? '—',
            <span key="a" className={`font-semibold ${r.receiptType === 'receipt' ? 'text-green-700' : 'text-red-700'}`}>
              {fmt(r.amount)} {r.currency ?? 'LYD'}
            </span>,
          ])}
        />
      )}
    </div>
  )
}

function SerialsReport() {
  const { selectedBranchId } = useBranchFilter()
  const { items, warehouses } = useBaseData()
  const [data, setData] = useState<SerialsReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [itemId, setItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (itemId) params.set('itemId', itemId)
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const res = await cachedRead<SerialsReportResponse>(`report-serials:${params.toString()}`, () =>
        api.get(`/reports/serials?${params.toString()}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [status, itemId, warehouseId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const rows = (data?.serials ?? []).map((s) => [
    s.serialNumber,
    s.item?.itemName ?? `#${s.itemId}`,
    s.warehouse?.name ?? '—',
    SERIAL_LABEL[s.status] ?? s.status,
    s.warrantyEndsAt ? fmtDate(s.warrantyEndsAt) : '—',
  ])

  const print = () =>
    printReport(
      'تقرير الأرقام التسلسلية',
      Object.entries(data?.byStatus ?? {})
        .map(([k, v]) => `${SERIAL_LABEL[k] ?? k}: ${v}`)
        .join(' — '),
      ['الرقم التسلسلي', 'الصنف', 'المخزن', 'الحالة', 'نهاية الضمان'],
      rows
    )

  const statusCards = data
    ? Object.entries(data.byStatus).map(([k, v]) => ({
        label: SERIAL_LABEL[k] ?? k,
        value: fmt(v),
      }))
    : []

  return (
    <div>
      <ReportHeader title="تقرير الأرقام التسلسلية" subtitle="حالة السيريالات حسب المخازن" onPrint={print} disabled={loading} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
        <Field label="الحالة">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(SERIAL_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="الصنف">
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">الكل</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemName}</option>
            ))}
          </select>
        </Field>
        <Field label="المخزن">
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">الكل</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary w-full">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {statusCards.length > 0 && <SummaryCards items={statusCards} />}

      {loading ? (
        <LoadingText />
      ) : rows.length === 0 ? (
        <Empty text="لا توجد سيريالات مطابقة" />
      ) : (
        <DataTable
          headers={['الرقم التسلسلي', 'الصنف', 'المخزن', 'الحالة', 'نهاية الضمان']}
          rows={data!.serials.map((s) => [
            <span key="sn" className="font-mono text-xs">{s.serialNumber}</span>,
            s.item?.itemName ?? `#${s.itemId}`,
            s.warehouse?.name ?? '—',
            <span key="st" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {SERIAL_LABEL[s.status] ?? s.status}
            </span>,
            s.warrantyEndsAt ? fmtDate(s.warrantyEndsAt) : '—',
          ])}
        />
      )}
    </div>
  )
}

function WarrantiesReport() {
  const { selectedBranchId } = useBranchFilter()
  const [data, setData] = useState<WarrantyReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const qs = params.toString()
      const res = await cachedRead<WarrantyReportResponse>(`report-warranties:${qs}`, () =>
        api.get(`/reports/warranties${qs ? `?${qs}` : ''}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [status, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const daysLeft = (w: { endDate: string }) => {
    const d = Math.ceil((new Date(w.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return d
  }

  const rows = (data?.warranties ?? []).map((w) => [
    w.warrantyNumber,
    w.serial?.serialNumber ?? `#${w.serialId}`,
    w.serial?.item?.itemName ?? '—',
    w.party?.partyName ?? '—',
    WARRANTY_TYPE[w.warrantyType] ?? w.warrantyType,
    fmtDate(w.startDate),
    fmtDate(w.endDate),
    WARRANTY_STATUS[w.status] ?? w.status,
    `${fmt(daysLeft(w))} يوم`,
  ])

  const print = () =>
    printReport(
      'تقرير الضمانات',
      `الضمانات: ${fmt(data?.warranties.length ?? 0)} — تنتهي قريباً (30 يوم): ${fmt(data?.expiringSoon.length ?? 0)}`,
      ['الرقم', 'السيريال', 'الصنف', 'العميل', 'النوع', 'البداية', 'النهاية', 'الحالة', 'المتبقي'],
      rows
    )

  return (
    <div>
      <ReportHeader title="تقرير الضمانات" subtitle="ضمانات السيريالات وتواريخ انتهائها" onPrint={print} disabled={loading} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Field label="الحالة">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(WARRANTY_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {data && data.expiringSoon.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⏳ <b>{fmt(data.expiringSoon.length)}</b> ضمان تنتهي خلال 30 يوماً
        </div>
      )}

      {data && (
        <SummaryCards
          items={[
            { label: 'إجمالي الضمانات', value: fmt(data.warranties.length) },
            { label: 'تنتهي قريباً', value: fmt(data.expiringSoon.length), cls: data.expiringSoon.length > 0 ? 'text-amber-700' : 'text-green-700' },
          ]}
        />
      )}

      {loading ? (
        <LoadingText />
      ) : rows.length === 0 ? (
        <Empty text="لا توجد ضمانات" />
      ) : (
        <DataTable
          headers={['الرقم', 'السيريال', 'الصنف', 'العميل', 'النوع', 'البداية', 'النهاية', 'الحالة', 'المتبقي']}
          rows={data!.warranties.map((w) => {
            const dl = daysLeft(w)
            return [
              w.warrantyNumber,
              <span key="sn" className="font-mono text-xs">{w.serial?.serialNumber ?? `#${w.serialId}`}</span>,
              w.serial?.item?.itemName ?? '—',
              w.party?.partyName ?? '—',
              WARRANTY_TYPE[w.warrantyType] ?? w.warrantyType,
              fmtDate(w.startDate),
              fmtDate(w.endDate),
              <span key="st" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {WARRANTY_STATUS[w.status] ?? w.status}
              </span>,
              <span key="dl" className={dl <= 30 && dl > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'}>{fmt(dl)} يوم</span>,
            ]
          })}
        />
      )}
    </div>
  )
}

function MovementsReport() {
  const { selectedBranchId } = useBranchFilter()
  const { items, warehouses } = useBaseData()
  const [data, setData] = useState<StockMovementsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [itemId, setItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = periodParams(from, to)
      if (itemId) params.set('itemId', itemId)
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const res = await cachedRead<StockMovementsResponse>(`report-movements:${params.toString()}`, () =>
        api.get(`/reports/stock-movements?${params.toString()}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [from, to, itemId, warehouseId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const summaryRows = (data?.summary ?? []).map((s) => [
    s.itemCode,
    s.itemName,
    fmt(s.in),
    fmt(s.out),
    fmt(s.net),
  ])

  const print = () =>
    printReport(
      'تقرير حركة الأصناف',
      periodLabel(from, to),
      ['الكود', 'الصنف', 'وارد', 'صادر', 'صافي'],
      summaryRows
    )

  const totals = (data?.summary ?? []).reduce(
    (acc, s) => ({ in: acc.in + s.in, out: acc.out + s.out, net: acc.net + s.net }),
    { in: 0, out: 0, net: 0 }
  )

  return (
    <div>
      <ReportHeader title="تقرير حركة الأصناف" subtitle="ملخص وارد وصادر الأصناف حسب الفترة" onPrint={print} disabled={loading} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Field label="من"><DateInput value={from} onChange={setFrom} /></Field>
        <Field label="إلى"><DateInput value={to} onChange={setTo} /></Field>
        <Field label="الصنف">
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">الكل</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.itemName}</option>
            ))}
          </select>
        </Field>
        <Field label="المخزن">
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">الكل</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary w-full">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {data && data.summary.length > 0 && (
        <SummaryCards
          items={[
            { label: 'وارد', value: fmt(totals.in), cls: 'text-green-700' },
            { label: 'صادر', value: fmt(totals.out), cls: 'text-red-700' },
            { label: 'صافي', value: fmt(totals.net) },
          ]}
        />
      )}

      {loading ? (
        <LoadingText />
      ) : summaryRows.length === 0 ? (
        <Empty text="لا توجد حركات مطابقة" />
      ) : (
        <DataTable
          headers={['الكود', 'الصنف', 'وارد', 'صادر', 'صافي']}
          rows={data!.summary.map((s) => [
            <span key="c" className="font-mono text-xs">{s.itemCode}</span>,
            s.itemName,
            <span key="i" className="font-semibold text-green-700">{fmt(s.in)}</span>,
            <span key="o" className="font-semibold text-red-700">{fmt(s.out)}</span>,
            <span key="n" className={`font-semibold ${s.net >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{fmt(s.net)}</span>,
          ])}
        />
      )}
    </div>
  )
}

function LowStockReport() {
  const { selectedBranchId } = useBranchFilter()
  const { warehouses } = useBaseData()
  const [items, setItems] = useState<LowStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warehouseId, setWarehouseId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const qs = params.toString()
      const res = await cachedRead<LowStockItem[]>(`report-lowstock:${qs}`, () =>
        api.get(`/reports/low-stock${qs ? `?${qs}` : ''}`).then((r) => r.data), 'reports'
      )
      setItems(res.data ?? [])
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [warehouseId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const shortageTotal = items.reduce((s, it) => s + Math.max(0, toNum(it.minStock) - toNum(it.quantity)), 0)

  const print = () =>
    printReport(
      'تقرير المخزون المنخفض',
      `الأصناف تحت الحد الأدنى: ${fmt(items.length)} — العجز التقديري: ${fmt(shortageTotal)}`,
      ['الكود', 'الصنف', 'المخزن', 'الكمية', 'الحد الأدنى'],
      items.map((it) => [it.itemCode, it.itemName, it.warehouse, fmt(it.quantity), fmt(it.minStock)])
    )

  return (
    <div>
      <ReportHeader title="تقرير المخزون المنخفض" subtitle="أصناف بلغت أو انخفضت عن الحد الأدنى" onPrint={print} disabled={loading} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Field label="المخزن">
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">الكل</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {items.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ <b>{fmt(items.length)}</b> صنف تحت الحد الأدنى — العجز التقديري: <b>{fmt(shortageTotal)}</b>
        </div>
      )}

      {loading ? (
        <LoadingText />
      ) : items.length === 0 ? (
        <Empty text="🎉 لا توجد أصناف تحت الحد الأدنى" />
      ) : (
        <DataTable
          headers={['الكود', 'الصنف', 'المخزن', 'الكمية', 'الحد الأدنى']}
          rows={items.map((it) => [
            <span key="c" className="font-mono text-xs">{it.itemCode}</span>,
            it.itemName,
            it.warehouse,
            <span key="q" className="font-semibold text-red-700">{fmt(it.quantity)}</span>,
            fmt(it.minStock),
          ])}
        />
      )}
    </div>
  )
}

function ValuationReport() {
  const { selectedBranchId } = useBranchFilter()
  const { warehouses } = useBaseData()
  const [data, setData] = useState<StockValuationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warehouseId, setWarehouseId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (selectedBranchId != null) params.set('branchId', String(selectedBranchId))
      const qs = params.toString()
      const res = await cachedRead<StockValuationResponse>(`report-valuation:${qs}`, () =>
        api.get(`/reports/stock-valuation${qs ? `?${qs}` : ''}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [warehouseId, selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const items = data?.items ?? []
  const totalValue = items.reduce((s, it) => s + toNum(it.totalValue), 0)

  const print = () =>
    printReport(
      'تقرير تقييم المخزون',
      `القيمة الإجمالية: ${fmtMoney(totalValue)}`,
      ['الكود', 'الصنف', 'المخزن', 'الكمية', 'متوسط التكلفة', 'القيمة'],
      items.map((it) => [it.itemCode, it.itemName, it.warehouseName, fmt(it.quantity), fmtMoney(it.costPrice), fmtMoney(it.totalValue)])
    )

  return (
    <div>
      <ReportHeader title="تقرير تقييم المخزون" subtitle="قيمة المخزون = الكمية × متوسط التكلفة" onPrint={print} disabled={loading} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Field label="المخزن">
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">الكل</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end"><button onClick={load} className="btn-secondary">🔄 تحديث</button></div>
      </div>

      {error && <ErrorBanner text={error} />}

      {data && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-brand-800">القيمة الإجمالية للمخزون</span>
            <span className="text-xl font-extrabold text-brand-900">{fmtMoney(totalValue)}</span>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingText />
      ) : items.length === 0 ? (
        <Empty text="لا يوجد مخزون" />
      ) : (
        <DataTable
          headers={['الكود', 'الصنف', 'المخزن', 'الكمية', 'متوسط التكلفة', 'القيمة']}
          rows={items.map((it) => [
            <span key="c" className="font-mono text-xs">{it.itemCode}</span>,
            it.itemName,
            it.warehouseName,
            fmt(it.quantity),
            fmtMoney(it.costPrice),
            <span key="v" className="font-semibold text-slate-800">{fmtMoney(it.totalValue)}</span>,
          ])}
        />
      )}
    </div>
  )
}

function DashboardReport() {
  const { selectedBranchId } = useBranchFilter()
  const [data, setData] = useState<{
    stats: {
      salesToday: number
      salesThisMonth: number
      purchasesThisMonth: number
      lowStockCount: number
      treasuryBalance: number
      invoiceCountToday: number
    }
    lowStockItems: Array<{ itemCode: string; itemName: string; warehouse: string; quantity: number; minStock: number }>
    recentInvoices: Array<{ id: number; invoiceNumber: string; invoiceDate: string; partyName?: string | null; total: number; paymentStatus: string }>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const res = await cachedRead(`report-dashboard:${selectedBranchId ?? 'all'}`, () =>
        api.get(`/reports/dashboard${qs}`).then((r) => r.data), 'reports'
      )
      setData(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [selectedBranchId])

  useEffect(() => {
    load()
  }, [load])

  const print = () => {
    const rows = (data?.recentInvoices ?? []).map((inv) => [
      inv.invoiceNumber,
      fmtDate(inv.invoiceDate),
      inv.partyName ?? '—',
      fmtMoney(inv.total),
      PAYMENT_LABEL[inv.paymentStatus] ?? inv.paymentStatus,
    ])
    printReport(
      'لوحة المعلومات',
      'ملخص الأداء الحالي',
      ['الرقم', 'التاريخ', 'العميل', 'الإجمالي', 'الحالة'],
      rows
    )
  }

  const s = data?.stats

  return (
    <div>
      <ReportHeader title="لوحة المعلومات" subtitle="ملخص الأداء التشغيلي لحظياً" onPrint={print} disabled={loading} />
      <div className="mb-4 flex items-end"><button onClick={load} className="btn-secondary">🔄 تحديث</button></div>

      {error && <ErrorBanner text={error} />}

      {s && (
        <SummaryCards
          items={[
            { label: 'مبيعات اليوم', value: fmtMoney(s.salesToday) },
            { label: 'مبيعات الشهر', value: fmtMoney(s.salesThisMonth) },
            { label: 'مشتريات الشهر', value: fmtMoney(s.purchasesThisMonth) },
            { label: 'الخزينة', value: fmtMoney(s.treasuryBalance) },
            { label: 'فواتير اليوم', value: fmt(s.invoiceCountToday) },
            { label: 'أصناف منخفضة', value: fmt(s.lowStockCount), cls: s.lowStockCount > 0 ? 'text-amber-700' : 'text-green-700' },
          ]}
        />
      )}

      {loading ? (
        <LoadingText />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="mb-3 font-bold text-slate-800">أحدث الفواتير</h2>
            {(data?.recentInvoices ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد فواتير بعد</p>
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="table">
                  <thead>
                    <tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th></tr>
                  </thead>
                  <tbody>
                    {data!.recentInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="font-mono text-xs">{inv.invoiceNumber}</td>
                        <td>{fmtDate(inv.invoiceDate)}</td>
                        <td>{inv.partyName ?? '—'}</td>
                        <td>{fmtMoney(inv.total)}</td>
                        <td>
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            {PAYMENT_LABEL[inv.paymentStatus] ?? inv.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3 font-bold text-slate-800">تنبيهات المخزون</h2>
            {(data?.lowStockItems ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">المخزون جيد ✅</p>
            ) : (
              <ul className="space-y-2">
                {data!.lowStockItems.map((it, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
                    <span>
                      {it.itemName} <span className="text-xs text-slate-500">({it.warehouse})</span>
                    </span>
                    <span className="font-semibold text-amber-700">
                      {fmt(it.quantity)} / الحد الأدنى {fmt(it.minStock)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
}

function ReportHeader({
  title,
  subtitle,
  onPrint,
  disabled,
}: {
  title: string
  subtitle: string
  onPrint: () => void
  disabled: boolean
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">{title}</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <button onClick={onPrint} disabled={disabled} className="btn-secondary disabled:opacity-50">
        🖨️ طباعة
      </button>
    </div>
  )
}

function ErrorBanner({ text }: { text: string }) {
  return <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{text}</p>
}

function LoadingText() {
  return <p className="py-16 text-center text-slate-400">جارٍ تحميل البيانات...</p>
}

function Empty({ text }: { text: string }) {
  return <div className="card text-center text-slate-400">{text}</div>
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {r.map((c, ci) => (
                <td key={ci}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ReportsHub() {
  const [tab, setTab] = useState<TabKey>('sales')

  return (
    <div>
      <TabSelector tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

      <div className="p-4 lg:p-6">
        {tab === 'sales' && <SalesReport />}
        {tab === 'profit' && <ProfitReport />}
        {tab === 'customers' && <CustomersReport />}
        {tab === 'treasury' && <TreasuryReport />}
        {tab === 'serials' && <SerialsReport />}
        {tab === 'warranties' && <WarrantiesReport />}
        {tab === 'movements' && <MovementsReport />}
        {tab === 'lowstock' && <LowStockReport />}
        {tab === 'valuation' && <ValuationReport />}
        {tab === 'dashboard' && <DashboardReport />}
      </div>
    </div>
  )
}
