import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal'
import Pagination, { DEFAULT_PAGE_SIZE, usePaginate } from '@/components/Pagination'
import ShortcutBar from '@/components/ShortcutBar'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { fmt, fmtDate, fmtMoney, fmtUsd, toNum } from '@/lib/format'
import { mailLink, printPurchaseInvoice, purchaseInvoiceText, waLink } from '@/lib/print'
import { playAddSound } from '@/lib/sound'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { ExchangeRateResponse, Item, Party, PurchaseInvoice, Treasury, UnifiedPurchasesResponse, Warehouse } from '@/types'

const PAYMENT_LABEL: Record<string, string> = { paid: 'مدفوعة', partial: 'جزئي', unpaid: 'غير مدفوعة' }
const PAYMENT_STYLE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  unpaid: 'bg-red-100 text-red-700',
}

const BANKING_SERVICES = [
  'مصرف الوحدة',
  'مصرف التجارة والتنمية',
  'مصرف الجمهورية',
  'موبي كاش',
  'أدفعلي',
  'ونباي',
  'سداد',
] as const

interface CartLine {
  item: Item
  quantity: number
  usdPrice: number
  lydPrice: number
  serials: string
}

const defaultPrices = (item: Item, rate: number) => {
  const lyd = toNum(item.purchasePrice)
  const usd = toNum(item.purchasePriceUsd) || (lyd ? lyd / rate : 0)
  return { usd, lyd: lyd || usd * rate }
}

export default function LocalPurchaseInvoice() {
  const navigate = useNavigate()
  const { selectedBranchId } = useBranchFilter()

  const [items, setItems] = useState<Item[]>([])
  const [vendors, setVendors] = useState<Party[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [treasuries, setTreasuries] = useState<Treasury[]>([])
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [partyId, setPartyId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [treasuryId, setTreasuryId] = useState('')
  const [payType, setPayType] = useState<'cash' | 'credit' | 'banking'>('cash')
  const [bankingService, setBankingService] = useState('')
  const [currency, setCurrency] = useState('LYD')
  const [exchangeRate, setExchangeRate] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [discount, setDiscount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineNote, setOfflineNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const br = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const [itemsRes, vendorsRes, whs, trs, invRes] = await Promise.all([
        cachedRead<{ items: Item[]; total: number }>('items:list', () =>
          api.get('/items?limit=99999').then((r) => r.data), 'inventory'
        ),
        cachedRead<{ parties: Party[]; total: number }>('parties:list', () =>
          api.get('/parties?limit=99999').then((r) => r.data), 'parties'
        ),
        cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () => api.get(`/warehouses${br}`).then((r) => r.data), 'warehouses'
        ),
        cachedRead<Treasury[]>(`treasuries:list:${selectedBranchId ?? 'all'}`, () => api.get(`/treasury${br}`).then((r) => r.data), 'treasuries'
        ),
        cachedRead<UnifiedPurchasesResponse>('purchases:local', () =>
          api.get('/purchases?type=local&limit=99999').then((r) => r.data), 'purchases'
        ),
      ])
      setItems(itemsRes.data.items ?? [])
      setVendors((vendorsRes.data.parties ?? []).filter((p) => p.partyType === 'vendor'))
      setWarehouses(whs.data ?? [])
      setTreasuries(trs.data ?? [])
      setInvoices(
        (invRes.data.purchases ?? [])
          .filter((p) => p.type === 'local')
          .map((p) => p.raw as PurchaseInvoice)
      )
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [selectedBranchId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    api
      .get<ExchangeRateResponse>('/exchange/rate/USD/LYD')
      .then((r) => setExchangeRate(String(toNum(r.data.rate))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(String(warehouses[0].id))
  }, [warehouses, warehouseId])

  // اختيار الخزينة تلقائياً عند تغيير نوع الدفع
  useEffect(() => {
    if (payType === 'cash') {
      const cashT = treasuries.find((t) => t.treasuryType === 'cash')
      if (cashT) setTreasuryId(String(cashT.id))
    } else if (payType === 'banking') {
      const bankT = treasuries.find((t) => t.treasuryType === 'bank')
      if (bankT) setTreasuryId(String(bankT.id))
    } else {
      setTreasuryId('')
    }
  }, [payType, treasuries])

  const today = new Date().toISOString().slice(0, 10)
  const todayInvoices = useMemo(
    () => invoices.filter((inv) => inv.invoiceDate?.slice(0, 10) === today),
    [invoices, today]
  )
  const [todayInvPage, setTodayInvPage] = useState(1)
  const [invLimit, setInvLimit] = useState(DEFAULT_PAGE_SIZE)
  const { paginated: paginatedTodayInvoices, total: totalTodayInvoices } = usePaginate(todayInvoices, invLimit, todayInvPage)
  const todayCashTotal = useMemo(() => todayInvoices.filter((i) => i.payType === 'cash').reduce((s, i) => s + toNum(i.paidAmount), 0), [todayInvoices])
  const todayCreditTotal = useMemo(() => todayInvoices.filter((i) => !i.payType || i.payType === 'credit').reduce((s, i) => s + (toNum(i.total) - toNum(i.paidAmount)), 0), [todayInvoices])
  const todayBankTotal = useMemo(() => todayInvoices.filter((i) => i.payType === 'banking').reduce((s, i) => s + toNum(i.paidAmount), 0), [todayInvoices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (!q) return true
      const haystack = [it.itemCode, it.itemName, it.barcode, it.modelNumber]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [items, search])

  const addToCart = (item: Item) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id)
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l))
      }
      const { usd, lyd } = defaultPrices(item, toNum(exchangeRate) || 8.5)
      return [...prev, { item, quantity: 1, usdPrice: usd, lydPrice: lyd, serials: '' }]
    })
  }

  const updateLine = (idx: number, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const serialCount = (l: CartLine): number =>
    l.serials
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean).length

  const totals = useMemo(() => {
    const subtotalUsd = cart.reduce((s, l) => s + l.usdPrice * l.quantity, 0)
    const subtotalLyd = cart.reduce((s, l) => s + l.lydPrice * l.quantity, 0)
    const isUsd = currency === 'USD'
    const rate = toNum(exchangeRate) || 8.5
    const toLyd = (v: number) => (isUsd ? v * rate : v)
    const toUsd = (v: number) => (isUsd ? v : v / rate)
    const discountVal = toNum(discount)
    const totalLyd = subtotalLyd - toLyd(discountVal)
    const totalUsd = subtotalUsd - toUsd(discountVal)
    return { subtotalUsd, subtotalLyd, totalLyd, totalUsd }
  }, [cart, discount, currency, exchangeRate])

  const validate = (): string | null => {
    if (!warehouseId) return 'المخزن مطلوب'
    if (!partyId) return 'المورد مطلوب'
    if (cart.length === 0) return 'لا توجد أصناف في الفاتورة'
    for (const l of cart) {
      if (l.item.trackSerial && serialCount(l) !== l.quantity) {
        return `الصنف «${l.item.itemName}» يتطلب ${l.quantity} رقم تسلسلي (المُدخل: ${serialCount(l)})`
      }
    }
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError('')
    setOfflineNote('')
    const payload = {
      partyId: Number(partyId),
      warehouseId: Number(warehouseId),
      treasuryId: treasuryId ? Number(treasuryId) : undefined,
      payType,
      bankingService: payType === 'banking' ? bankingService : undefined,
      invoiceDate: new Date(invoiceDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      currency,
      exchangeRate: toNum(exchangeRate),
      discount: toNum(discount),
      paidAmount: paidAmount === '' ? undefined : toNum(paidAmount),
      notes: notes.trim() || undefined,
      items: cart.map((l) => ({
        itemId: l.item.id,
        quantity: l.quantity,
        unitPrice: currency === 'USD' ? l.usdPrice : l.lydPrice,
        unitPriceUsd: l.usdPrice,
        unitPriceLyd: l.lydPrice,
        serialNumbers:
          l.item.trackSerial && serialCount(l) > 0
            ? l.serials.split('\n').map((s) => s.trim()).filter(Boolean)
            : undefined,
      })),
    }
    try {
      const res = await offlineWrite<PurchaseInvoice>('/purchases', 'POST', payload, { entity: 'purchaseInvoice' })
      if (res.queued) {
        setOfflineNote('لا يوجد اتصال — حُفظت الفاتورة محلياً وستُزامن لاحقاً')
      } else {
        setViewInvoice(res.data)
      }
      resetForm()
      await loadAll()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setCart([])
    setPartyId('')
    setTreasuryId('')
    setPayType('cash')
    setBankingService('')
    setDiscount('')
    setPaidAmount('')
    setNotes('')
    setSearch('')
  }

  useKeyboardShortcuts({
    onNew: () => {
      resetForm()
      searchRef.current?.focus()
    },
    onSave: handleSave,
    onEscape: () => {
      if (viewInvoice) { setViewInvoice(null); return }
      setSearch('')
    },
  })

  const handleSearchKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      const code = search.trim()
      if (!code) return
      const exact = items.find((it) => it.barcode === code)
      if (exact) {
        addToCart(exact)
        playAddSound()
        setSearch('')
        searchRef.current?.focus()
        return
      }
      if (filtered.length > 0) {
        addToCart(filtered[0])
        playAddSound()
        setSearch('')
      }
    },
    [search, items, filtered, addToCart]
  )

  const openInvoice = async (invId: number) => {
    setViewLoading(true)
    try {
      const res = await api.get<PurchaseInvoice>(`/purchases/${invId}`)
      setViewInvoice(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setViewLoading(false)
    }
  }

  const shareWhatsApp = (inv: PurchaseInvoice) => {
    const phone = inv.party?.whatsapp || inv.party?.mobile
    const link = waLink(phone, purchaseInvoiceText(inv))
    if (link) window.open(link, '_blank')
    else setError('لا يوجد رقم واتساب لهذا المورد')
  }

  const shareEmail = (inv: PurchaseInvoice) => {
    const link = mailLink(inv.party?.email, `فاتورة شراء ${inv.invoiceNumber}`, purchaseInvoiceText(inv))
    if (link) window.location.href = link
    else setError('لا يوجد بريد إلكتروني لهذا المورد')
  }

  const money = (n: number) => (currency === 'USD' ? fmtUsd(n) : fmtMoney(n))

  return (
    <div className="p-6 pb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">فاتورة شراء محلية</h1>
          <p className="text-sm text-slate-500">شراء من السوق المحلي بدون أمر استيراد</p>
        </div>
        <button onClick={() => navigate('/purchases/import')} className="btn-secondary">📦 أوامر الاستيراد</button>
      </div>

      {offlineNote && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <input
            ref={searchRef}
            className="input mb-3"
            placeholder="🔍 امسح باركود أو ابحث عن صنف لإضافته ثم Enter"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
          />
          {loading ? (
            <p className="py-16 text-center text-slate-400">جارٍ تحميل الأصناف...</p>
          ) : filtered.length === 0 ? (
            <div className="card text-center text-slate-400">لا توجد أصناف مطابقة</div>
          ) : (
            <div className="grid max-h-[30rem] grid-cols-2 gap-2 overflow-y-auto pb-2 md:grid-cols-3">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  onClick={() => addToCart(it)}
                  className="card flex flex-col gap-1 p-3 text-right transition-colors hover:border-brand-400 hover:shadow-md"
                >
                  <span className="text-sm font-semibold text-slate-800">{it.itemName}</span>
                  <span className="font-mono text-xs text-slate-400">{it.itemCode}</span>
                  {it.trackSerial ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">سيريال</span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {fmtUsd(defaultPrices(it, toNum(exchangeRate) || 8.5).usd)} / {fmtMoney(defaultPrices(it, toNum(exchangeRate) || 8.5).lyd)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="mb-3 text-lg font-bold text-slate-800">🧾 فاتورة الشراء</h2>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="label">المورد *</label>
                <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                  <option value="">— اختر —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.partyName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">التاريخ</label>
                <input type="date" className="input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div>
                <label className="label">المخزن *</label>
                <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">— اختر —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">نوع الدفع</label>
                <select
                  className="input"
                  value={payType}
                  onChange={(e) => {
                    setPayType(e.target.value as 'cash' | 'credit' | 'banking')
                    setPaidAmount('')
                    setBankingService('')
                  }}
                >
                  <option value="cash">نقدي</option>
                  <option value="credit">آجل (دين)</option>
                  <option value="banking">مصرفي / صك</option>
                </select>
              </div>
              {payType === 'banking' ? (
                <div>
                  <label className="label">الخدمة المصرفية *</label>
                  <select className="input" value={bankingService} onChange={(e) => setBankingService(e.target.value)}>
                    <option value="">— اختر —</option>
                    {BANKING_SERVICES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ) : payType === 'cash' ? (
                <div>
                  <label className="label">الخزينة</label>
                  <select className="input" value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
                    <option value="">—</option>
                    {treasuries.filter((t) => t.treasuryType === 'cash').map((t) => (
                      <option key={t.id} value={t.id}>{t.treasuryName}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="label">العملة</label>
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="LYD">دينار (د.ل)</option>
                  <option value="USD">دولار ($)</option>
                </select>
              </div>
              <div>
                <label className="label">سعر الصرف</label>
                <input type="number" className="input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
              </div>
            </div>

            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">السلة فارغة — اختر الأصناف من اليسار</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الصنف</th>
                      <th className="w-14">الكمية</th>
                      <th className="w-20">سعر $</th>
                      <th className="w-20">سعر د.ل</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((l, i) => (
                      <tr key={l.item.id}>
                        <td>
                          <div className="text-xs font-medium text-slate-800">{l.item.itemName}</div>
                          {l.item.trackSerial && (
                            <textarea
                              className="input mt-1 min-h-[56px] font-mono text-[10px]"
                              placeholder="سيريالات (سطر لكل رقم)"
                              value={l.serials}
                              onChange={(e) => updateLine(i, { serials: e.target.value })}
                            />
                          )}
                          {l.item.trackSerial && (
                            <p className={`mt-0.5 text-[10px] ${serialCount(l) === l.quantity ? 'text-green-600' : 'text-amber-600'}`}>
                              سيريال: {serialCount(l)}/{l.quantity}
                            </p>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            className="input px-2 py-1"
                            value={l.quantity}
                            onChange={(e) => updateLine(i, { quantity: Math.max(1, toNum(e.target.value)) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input px-2 py-1"
                            value={l.usdPrice}
                            onChange={(e) => updateLine(i, { usdPrice: toNum(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input px-2 py-1"
                            value={l.lydPrice}
                            onChange={(e) => updateLine(i, { lydPrice: toNum(e.target.value) })}
                          />
                        </td>
                        <td>
                          <button onClick={() => removeLine(i)} className="rounded p-1 text-red-500 hover:bg-red-50" title="حذف">
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="label">الخصم ({currency})</label>
                <input type="number" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div>
                <label className="label">ملاحظات</label>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي (د.ل)</span>
                <span>{fmtMoney(totals.subtotalLyd)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي ($)</span>
                <span>{fmtUsd(totals.subtotalUsd)}</span>
              </div>
              {toNum(discount) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>الخصم ({currency})</span>
                  <span>{money(toNum(discount))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-800">
                <span>الإجمالي الفعلي (د.ل)</span>
                <span>{fmtMoney(totals.totalLyd)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>مرجعي ($)</span>
                <span>{fmtUsd(totals.totalUsd)}</span>
              </div>
            </div>

            <div className="mt-3">
              <label className="label">المدفوع</label>
              <input type="number" className="input" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={handleSave} disabled={saving || cart.length === 0} className="btn-primary flex-1">
                {saving ? 'جارٍ الحفظ...' : '💰 حفظ فاتورة الشراء'}
              </button>
              <button onClick={resetForm} className="btn-secondary">تفريغ</button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== آخر فواتير الشراء المحلية ===== */}
      <div className="mt-6">
        <h2 className="mb-2 text-lg font-bold text-slate-800">آخر فواتير الشراء اليوم</h2>
        {todayInvoices.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
              <p className="text-xs text-green-600">💵 كاش</p>
              <p className="text-lg font-bold text-green-700">{fmtMoney(todayCashTotal)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-xs text-amber-600">📋 آجل</p>
              <p className="text-lg font-bold text-amber-700">{fmtMoney(todayCreditTotal)}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
              <p className="text-xs text-blue-600">🏦 صكوك + مصرفي</p>
              <p className="text-lg font-bold text-blue-700">{fmtMoney(todayBankTotal)}</p>
            </div>
          </div>
        )}
        {todayInvoices.length === 0 ? (
          <div className="card text-center text-slate-400">لا توجد فواتير شراء اليوم</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>المورد</th>
                  <th>المخزن</th>
                  <th>الإجمالي</th>
                  <th>كاش</th>
                  <th>آجل</th>
                  <th>مصرفي</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTodayInvoices.map((inv) => {
                  const payT = inv.payType || 'credit'
                  const isCash = payT === 'cash'
                  const isBank = payT === 'banking'
                  return (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs">{inv.invoiceNumber}</td>
                      <td>{inv.party?.partyName ?? '—'}</td>
                      <td>{inv.warehouse?.name ?? '—'}</td>
                      <td className="font-semibold">{fmtMoney(inv.total)}</td>
                      <td className={isCash ? 'font-semibold text-green-700' : 'text-slate-300'}>
                        {isCash ? fmtMoney(toNum(inv.paidAmount)) : '—'}
                      </td>
                      <td className={!payT || payT === 'credit' ? 'font-semibold text-amber-700' : 'text-slate-300'}>
                        {!payT || payT === 'credit' ? fmtMoney(Math.max(0, toNum(inv.total) - toNum(inv.paidAmount))) : '—'}
                      </td>
                      <td className={isBank ? 'font-semibold text-blue-700' : 'text-slate-300'}>
                        {isBank ? fmtMoney(toNum(inv.paidAmount)) : '—'}
                      </td>
                      <td>
                        <button onClick={() => openInvoice(inv.id)} className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50">
                          عرض
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={todayInvPage} total={totalTodayInvoices} limit={invLimit} onPageChange={setTodayInvPage} onLimitChange={setInvLimit} />
      </div>

      {/* ===== تفاصيل فاتورة الشراء ===== */}
      <Modal open={viewInvoice !== null} title="تفاصيل فاتورة الشراء" onClose={() => setViewInvoice(null)} wide>
        {viewLoading ? (
          <p className="py-6 text-center text-slate-400">جارٍ التحميل...</p>
        ) : viewInvoice ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800">{viewInvoice.invoiceNumber}</p>
                <p className="text-xs text-slate-500">{fmtDate(viewInvoice.invoiceDate)} — {viewInvoice.currency} @ {fmt(viewInvoice.exchangeRate, 4)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${PAYMENT_STYLE[viewInvoice.paymentStatus] ?? ''}`}>
                {PAYMENT_LABEL[viewInvoice.paymentStatus] ?? viewInvoice.paymentStatus}
              </span>
            </div>
            <p className="mb-2 text-sm text-slate-600">
              المورد: <b>{viewInvoice.party?.partyName ?? '—'}</b>
              {viewInvoice.warehouse ? ` — المخزن: ${viewInvoice.warehouse.name}` : ''}
            </p>
            <div className="max-h-64 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>سعر $</th>
                    <th>سعر د.ل</th>
                    <th>تكلفة الوحدة</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewInvoice.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>{i.item?.itemName ?? '—'}</td>
                      <td>{fmt(i.quantity)}</td>
                      <td>{fmtUsd(i.unitPriceUsd)}</td>
                      <td>{fmtMoney(i.unitPrice)}</td>
                      <td>{fmtMoney(i.unitCost)}</td>
                      <td className="font-semibold">{fmtMoney(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي</span>
                <span>{viewInvoice.currency === 'USD' ? fmtUsd(viewInvoice.subtotal) : fmtMoney(viewInvoice.subtotal)}</span>
              </div>
              {toNum(viewInvoice.shippingCost) > 0 && (
                <div className="flex justify-between text-slate-600"><span>الشحن</span><span>{fmtMoney(viewInvoice.shippingCost)}</span></div>
              )}
              {toNum(viewInvoice.customsCost) > 0 && (
                <div className="flex justify-between text-slate-600"><span>الجمارك</span><span>{fmtMoney(viewInvoice.customsCost)}</span></div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-800">
                <span>الإجمالي</span><span>{fmtMoney(viewInvoice.total)}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => printPurchaseInvoice(viewInvoice, undefined)} className="btn-primary flex-1">🖨️ طباعة</button>
              <button onClick={() => shareWhatsApp(viewInvoice)} className="btn-secondary">💬 واتساب</button>
              <button onClick={() => shareEmail(viewInvoice)} className="btn-secondary">✉️ بريد</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ShortcutBar />
    </div>
  )
}
