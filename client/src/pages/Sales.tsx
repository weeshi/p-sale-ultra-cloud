import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal'
import Pagination, { DEFAULT_PAGE_SIZE, usePaginate } from '@/components/Pagination'
import SerialPicker from '@/components/SerialPicker'
import ShortcutBar from '@/components/ShortcutBar'
import { api, extractError } from '@/lib/api'
import { cachedRead, offlineWrite } from '@/lib/offline'
import { useBranchFilter } from '@/contexts/BranchFilterContext'
import { fmt, fmtDate, fmtMoney, toNum } from '@/lib/format'
import { invoiceText, mailLink, printInvoice, waLink } from '@/lib/print'
import { playAddSound } from '@/lib/sound'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { Item, Party, Quote, SaleInvoice, Treasury, Warehouse } from '@/types'

interface CartLine {
  item: Item
  quantity: number
  unitPrice: number
  discount: number
  serials: string[]
  returnAsDamaged: boolean
}

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

export default function Sales() {
  const navigate = useNavigate()
  const { selectedBranchId } = useBranchFilter()
  const [mode, setMode] = useState<'invoice' | 'quote'>('invoice')
  const [invoiceType, setInvoiceType] = useState<'sale' | 'return'>('sale')

  const [items, setItems] = useState<Item[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [treasuries, setTreasuries] = useState<Treasury[]>([])
  const [invoices, setInvoices] = useState<SaleInvoice[]>([])
  const [invLimit, setInvLimit] = useState(DEFAULT_PAGE_SIZE)

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [partyId, setPartyId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [treasuryId, setTreasuryId] = useState('')
  const [payType, setPayType] = useState<'cash' | 'credit' | 'banking'>('cash')
  const [bankingService, setBankingService] = useState('')
  const [taxRate, setTaxRate] = useState('0')
  const [headerDiscount, setHeaderDiscount] = useState('0')
  const [paidAmount, setPaidAmount] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [quoteValidUntil, setQuoteValidUntil] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offlineNote, setOfflineNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [serialPick, setSerialPick] = useState<number | null>(null)
  const [viewInvoice, setViewInvoice] = useState<SaleInvoice | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const branchQsFirst = selectedBranchId != null ? `?branchId=${selectedBranchId}` : ''
      const branchQs = selectedBranchId != null ? `&branchId=${selectedBranchId}` : ''
      const [itemsRes, partiesRes, whs, trs, salesRes] = await Promise.all([
        cachedRead<{ items: Item[]; total: number }>('items:list', () =>
          api.get('/items?limit=99999').then((r) => r.data), 'inventory'
        ),
        cachedRead<{ parties: Party[]; total: number }>('parties:list', () =>
          api.get('/parties?limit=99999').then((r) => r.data), 'parties'
        ),
        cachedRead<Warehouse[]>(`warehouses:list:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/warehouses${branchQsFirst}`).then((r) => r.data), 'warehouses'
        ),
        cachedRead<Treasury[]>(`treasuries:list:${selectedBranchId ?? 'all'}`, () => api.get(`/treasury${branchQsFirst}`).then((r) => r.data), 'treasuries'
        ),
        cachedRead<{ invoices: SaleInvoice[]; total: number }>(`sales:list:${selectedBranchId ?? 'all'}`, () =>
          api.get(`/sales?limit=99999${branchQs}`).then((r) => r.data), 'sales'
        ),
      ])
      setItems(itemsRes.data.items ?? [])
      setParties(partiesRes.data.parties ?? [])
      setWarehouses(whs.data ?? [])
      setTreasuries(trs.data ?? [])
      setInvoices(salesRes.data.invoices ?? [])
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [selectedBranchId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const today = new Date().toISOString().slice(0, 10)
  const todayInvoices = useMemo(
    () => invoices.filter((inv) => inv.invoiceDate?.slice(0, 10) === today && inv.invoiceType !== 'return'),
    [invoices, today]
  )
  const [todayInvPage, setTodayInvPage] = useState(1)
  const { paginated: paginatedTodayInvoices, total: totalTodayInvoices } = usePaginate(todayInvoices, invLimit, todayInvPage)
  const todayCashTotal = useMemo(() => todayInvoices.filter((i) => i.payType === 'cash').reduce((s, i) => s + toNum(i.paidAmount), 0), [todayInvoices])
  const todayCreditTotal = useMemo(() => todayInvoices.filter((i) => !i.payType || i.payType === 'credit').reduce((s, i) => s + (toNum(i.total) - toNum(i.paidAmount)), 0), [todayInvoices])
  const todayBankTotal = useMemo(() => todayInvoices.filter((i) => i.payType === 'banking').reduce((s, i) => s + toNum(i.paidAmount), 0), [todayInvoices])

  // اختيار أول مخزن تلقائياً (يتبع تغيّر الفرع)
  useEffect(() => {
    if (warehouses.length > 0) {
      setWarehouseId((prev) => {
        const exists = warehouses.some((w) => w.id === Number(prev))
        return exists ? prev : String(warehouses[0].id)
      })
    }
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (it.isActive === false) return false
      if (!q) return true
      const haystack = [it.itemCode, it.itemName, it.barcode, it.modelNumber]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [items, search])

  const availableStock = useCallback(
    (it: Item): number => {
      if (it.isService) return 1
      if (warehouseId) {
        const st = (it.stock ?? []).find((s) => s.warehouseId === Number(warehouseId))
        if (st) return toNum(st.quantity) - toNum(st.damagedStock)
      }
      return toNum(it.currentStock) - toNum(it.damagedStock)
    },
    [warehouseId]
  )

  const addToCart = (item: Item) => {
    const idx = cart.findIndex((l) => l.item.id === item.id)
    if (idx >= 0) {
      setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l)))
      return
    }
    const line: CartLine = {
      item,
      quantity: 1,
      unitPrice: toNum(item.salePrice),
      discount: 0,
      serials: [],
      returnAsDamaged: false,
    }
    const next = [...cart, line]
    setCart(next)
    if (item.trackSerial) setSerialPick(next.length - 1)
  }

  const updateLine = (idx: number, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity - l.discount, 0)
    const discount = toNum(headerDiscount)
    const tax = (subtotal - discount) * (toNum(taxRate) / 100)
    const total = subtotal - discount + tax
    const paid = paidAmount === '' ? (payType === 'credit' ? 0 : total) : toNum(paidAmount)
    return { subtotal, discount, tax, total, paid }
  }, [cart, headerDiscount, taxRate, paidAmount, payType])

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

  useKeyboardShortcuts({
    onNew: () => {
      resetForm()
      setMode('invoice')
      setInvoiceType('sale')
      searchRef.current?.focus()
    },
    onSave: () => {
      if (mode === 'invoice') handleSaveInvoice()
      else handleSaveQuote()
    },
    onEscape: () => {
      if (serialPick !== null) { setSerialPick(null); return }
      if (viewInvoice) { setViewInvoice(null); return }
      setSearch('')
    },
  })

  const isReturn = invoiceType === 'return'

  const validateCart = (): string | null => {
    if (cart.length === 0) return isReturn ? 'لا توجد أصناف في المرتجع' : 'لا توجد أصناف في الفاتورة'
    for (const l of cart) {
      if (!isReturn) {
        if (l.item.trackSerial && l.serials.length !== l.quantity) {
          return `الصنف «${l.item.itemName}» يتطلب ${l.quantity} رقم تسلسلي (المحدد: ${l.serials.length})`
        }
        if (availableStock(l.item) < l.quantity) {
          return `الكمية غير كافية للصنف «${l.item.itemName}»`
        }
      }
    }
    return null
  }

  const handleSaveInvoice = async () => {
    if (!warehouseId) {
      setError('المخزن مطلوب')
      return
    }
    if (isReturn && !partyId) {
      setError('العميل مطلوب للمرتجع')
      return
    }
    if (!isReturn && payType === 'cash' && !treasuryId) {
      setError('الخزينة مطلوبة للدفع النقدي')
      return
    }
    if (!isReturn && payType === 'banking' && !bankingService) {
      setError('اختر الخدمة المصرفية')
      return
    }
    if (!isReturn && payType === 'credit' && !partyId) {
      setError('العميل مطلوب للدفع الآجل')
      return
    }
    const err = validateCart()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError('')
    setOfflineNote('')
    const payload = {
      warehouseId: Number(warehouseId),
      treasuryId: !isReturn && payType !== 'credit' ? Number(treasuryId) : undefined,
      payType: !isReturn ? payType : undefined,
      bankingService: !isReturn && payType === 'banking' ? bankingService : undefined,
      partyId: partyId ? Number(partyId) : undefined,
      invoiceType: isReturn ? 'return' : undefined,
      invoiceDate: new Date(invoiceDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      taxRate: toNum(taxRate),
      discount: toNum(headerDiscount),
      paidAmount: totals.paid,
      notes: notes.trim() || undefined,
      items: cart.map((l) => ({
        itemId: l.item.id,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        serialNumbers: !isReturn && l.serials.length ? l.serials : undefined,
        returnAsDamaged: isReturn ? l.returnAsDamaged : undefined,
      })),
    }
    try {
      const res = await offlineWrite<SaleInvoice>('/sales', 'POST', payload, { entity: 'saleInvoice' })
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

  const handleSaveQuote = async () => {
    const err = validateCart()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError('')
    setOfflineNote('')
    const payload = {
      quoteDate: new Date(invoiceDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      partyId: partyId ? Number(partyId) : undefined,
      validUntil: quoteValidUntil ? new Date(quoteValidUntil).toISOString() : undefined,
      notes: notes.trim() || undefined,
      items: cart.map((l) => ({
        itemId: l.item.id,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
      })),
    }
    try {
      const res = await offlineWrite<Quote>('/sales/quotes', 'POST', payload, { entity: 'quote' })
      if (res.queued) {
        setOfflineNote('لا يوجد اتصال — حُفظ عرض السعر محلياً وستُزامن لاحقاً')
      } else {
        setError('')
        window.alert(`تم حفظ عرض السعر ${res.data.quoteNumber} بنجاح`)
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
    setTaxRate('0')
    setHeaderDiscount('0')
    setPaidAmount('')
    setQuoteValidUntil('')
    setNotes('')
    setSearch('')
  }

  const openInvoice = async (id: number) => {
    setViewLoading(true)
    try {
      const res = await api.get<SaleInvoice>(`/sales/${id}`)
      setViewInvoice(res.data)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setViewLoading(false)
    }
  }

  const shareWhatsApp = (inv: SaleInvoice) => {
    const phone = inv.party?.whatsapp || inv.party?.mobile
    const link = waLink(phone, invoiceText(inv))
    if (link) window.open(link, '_blank')
    else setError('لا يوجد رقم واتساب لهذا العميل')
  }

  const shareEmail = (inv: SaleInvoice) => {
    const link = mailLink(inv.party?.email, `فاتورة ${inv.invoiceNumber}`, invoiceText(inv))
    if (link) window.location.href = link
    else setError('لا يوجد بريد إلكتروني لهذا العميل')
  }

  return (
    <div className="p-6 pb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">شاشة البيع</h1>
          <p className="text-sm text-slate-500">نقطة بيع سريعة — فواتير وعروض أسعار</p>
        </div>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button
              onClick={() => setMode('invoice')}
              className={`px-4 py-2 text-sm font-medium ${mode === 'invoice' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              🧾 فاتورة بيع
            </button>
            <button
              onClick={() => { setMode('quote'); setInvoiceType('sale') }}
              className={`px-4 py-2 text-sm font-medium ${mode === 'quote' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              📋 عرض سعر
            </button>
            {mode === 'invoice' && (
              <>
                <span className="w-px bg-slate-300" />
                <button
                  onClick={() => setInvoiceType('sale')}
                  className={`px-3 py-2 text-sm font-medium ${invoiceType === 'sale' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  بيع
                </button>
                <button
                  onClick={() => setInvoiceType('return')}
                  className={`px-3 py-2 text-sm font-medium ${invoiceType === 'return' ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  مرتجع
                </button>
              </>
            )}
          </div>
          <button onClick={() => navigate('/sales/quotes')} className="btn-secondary">📑 عروض الأسعار</button>
        </div>
      </div>

      {offlineNote && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">📴 {offlineNote}</p>
      )}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* ===== المنتجات ===== */}
        <div className="lg:col-span-3">
          <div className="mb-3 flex gap-2">
            <input
              ref={searchRef}
              className="input"
              placeholder="🔍 امسح باركود أو ابحث باسم / كود / موديل ثم Enter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
            />
            <span className="hidden shrink-0 items-center rounded-lg bg-slate-100 px-3 text-xs text-slate-500 sm:flex">
              Enter: إضافة
            </span>
          </div>

          {loading ? (
            <p className="py-16 text-center text-slate-400">جارٍ تحميل الأصناف...</p>
          ) : filtered.length === 0 ? (
            <div className="card text-center text-slate-400">لا توجد أصناف مطابقة</div>
          ) : (
            <div className="grid max-h-[28rem] grid-cols-2 gap-2 overflow-y-auto pb-2 md:grid-cols-3">
              {filtered.map((it) => {
                const avail = availableStock(it)
                const out = !it.isService && avail <= 0
                return (
                  <button
                    key={it.id}
                    onClick={() => addToCart(it)}
                    disabled={out}
                    className={`card flex flex-col gap-1 p-3 text-right transition-colors ${
                      out
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:border-brand-400 hover:shadow-md'
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-800">{it.itemName}</span>
                    <span className="font-mono text-xs text-slate-400">{it.itemCode}{it.barcode ? ` · ${it.barcode}` : ''}</span>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-bold text-brand-700">{fmtMoney(it.salePrice)}</span>
                      {it.isService ? (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">خدمة</span>
                      ) : it.trackSerial ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">سيريال</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${out ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                          {out ? 'نفد' : `المخزون: ${fmt(avail, 0)}`}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ===== الفاتورة/السلة ===== */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="mb-3 text-lg font-bold text-slate-800">
              {mode === 'quote'
                ? '📋 عرض السعر'
                : isReturn
                  ? '↩️ فاتورة مرتجع'
                  : '🧾 الفاتورة الحالية'}
            </h2>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="label">العميل</label>
                <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                  <option value="">نقدي (بدون عميل)</option>
                  {parties
                    .filter((p) => p.partyType !== 'vendor')
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.partyName}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label">التاريخ</label>
                <input type="date" className="input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              {mode === 'quote' ? (
                <div>
                  <label className="label">صالحة حتى</label>
                  <input type="date" className="input" value={quoteValidUntil} onChange={(e) => setQuoteValidUntil(e.target.value)} />
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">المخزن *</label>
                    <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                      <option value="">— اختر —</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">السلة فارغة — اختر الأصناف من اليسار</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الصنف</th>
                      <th className="w-14">الكمية</th>
                      <th className="w-24">السعر</th>
                      <th className="w-20">الإجمالي</th>
                      {isReturn && <th className="w-20">كـ تالف</th>}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((l, i) => (
                      <tr key={l.item.id}>
                        <td>
                          <div className="text-xs font-medium text-slate-800">{l.item.itemName}</div>
                          {!isReturn && l.item.trackSerial && (
                            <button
                              onClick={() => setSerialPick(i)}
                              className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                l.serials.length === l.quantity
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {l.serials.length === l.quantity
                                ? `سيريال: ${l.serials.length} ✓`
                                : `اختيار سيريال (${l.serials.length}/${l.quantity})`}
                            </button>
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
                            value={l.unitPrice}
                            onChange={(e) => updateLine(i, { unitPrice: toNum(e.target.value) })}
                          />
                        </td>
                        <td className="text-xs font-semibold">{fmtMoney(l.unitPrice * l.quantity - l.discount)}</td>
                        {isReturn && (
                          <td>
                            <input
                              type="checkbox"
                              checked={l.returnAsDamaged}
                              onChange={(e) => updateLine(i, { returnAsDamaged: e.target.checked })}
                              className="h-4 w-4 accent-brand-700"
                              title="إعادة الصنف للمخزون كتالف (لا يُرجع للصالح)"
                            />
                          </td>
                        )}
                        <td>
                          <button
                            onClick={() => removeLine(i)}
                            className="rounded p-1 text-red-500 hover:bg-red-50"
                            title="حذف"
                          >
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
              {mode === 'invoice' && (
                <>
                  <div>
                    <label className="label">الضريبة %</label>
                    <input type="number" className="input" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">الخصم</label>
                    <input type="number" className="input" value={headerDiscount} onChange={(e) => setHeaderDiscount(e.target.value)} />
                  </div>
                </>
              )}
              <div className={mode === 'invoice' ? '' : 'col-span-2'}>
                <label className="label">ملاحظات</label>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي</span>
                <span>{fmtMoney(totals.subtotal)}</span>
              </div>
              {mode === 'invoice' && (
                <>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>الخصم</span>
                      <span>- {fmtMoney(totals.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>الضريبة</span>
                    <span>{fmtMoney(totals.tax)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-800">
                <span>الإجمالي</span>
                <span>{fmtMoney(totals.total)}</span>
              </div>
            </div>

            {mode === 'invoice' && !isReturn && (
              <div className="mt-3 rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 text-sm font-bold text-slate-700">💳 تفاصيل الدفع</h3>
                <div className="grid grid-cols-2 gap-2">
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
                      <label className="label">الخزينة *</label>
                      <select className="input" value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
                        <option value="">— اختر —</option>
                        {treasuries.filter((t) => t.treasuryType === 'cash').map((t) => (
                          <option key={t.id} value={t.id}>{t.treasuryName}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="label">المدفوع (دفعة جزئية)</label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {payType === 'cash'
                    ? `المبلغ المحصل (${fmtMoney(totals.paid)}) يُسجل في الخزينة النقدية.`
                    : payType === 'banking'
                      ? `المبلغ (${fmtMoney(totals.paid)}) يُوجه لخزينة المصرف عبر ${bankingService || '—'}`
                      : `المبلغ المتبقي (${fmtMoney(Math.max(0, totals.total - totals.paid))}) يُسجل كدين على العميل.`}
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {mode === 'invoice' ? (
                <button onClick={handleSaveInvoice} disabled={saving || cart.length === 0} className="btn-primary flex-1">
                  {saving ? 'جارٍ الحفظ...' : isReturn ? '↩️ حفظ المرتجع' : '💰 حفظ الفاتورة'}
                </button>
              ) : (
                <button onClick={handleSaveQuote} disabled={saving || cart.length === 0} className="btn-primary flex-1">
                  {saving ? 'جارٍ الحفظ...' : '💾 حفظ عرض السعر'}
                </button>
              )}
              <button onClick={resetForm} className="btn-secondary">تفريغ</button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== آخر فواتير اليوم ===== */}
      <div className="mt-6">
        <h2 className="mb-2 text-lg font-bold text-slate-800">آخر فواتير اليوم</h2>
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
          <div className="card text-center text-slate-400">لا توجد فواتير اليوم</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>العميل</th>
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
                      <td>{inv.party?.partyName ?? 'نقدي'}</td>
                      <td>{inv.warehouse?.name ?? '—'}</td>
                      <td className="font-semibold">{fmtMoney(inv.total)}</td>
                      <td className={isCash ? 'font-semibold text-green-700' : 'text-slate-300'}>
                        {isCash ? fmtMoney(inv.paidAmount) : '—'}
                      </td>
                      <td className={!payT || payT === 'credit' ? 'font-semibold text-amber-700' : 'text-slate-300'}>
                        {!payT || payT === 'credit' ? fmtMoney(Math.max(0, toNum(inv.total) - toNum(inv.paidAmount))) : '—'}
                      </td>
                      <td className={isBank ? 'font-semibold text-blue-700' : 'text-slate-300'}>
                        {isBank ? fmtMoney(inv.paidAmount) : '—'}
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

      {/* ===== نافذة اختيار الأرقام التسلسلية ===== */}
      <SerialPicker
        open={serialPick !== null}
        item={serialPick !== null ? cart[serialPick]?.item ?? null : null}
        warehouseId={warehouseId ? Number(warehouseId) : undefined}
        max={serialPick !== null ? cart[serialPick]?.quantity ?? 1 : 1}
        onClose={() => setSerialPick(null)}
        onConfirm={(serials) => {
          if (serialPick !== null) updateLine(serialPick, { serials })
          setSerialPick(null)
        }}
      />

      {/* ===== تفاصيل الفاتورة ===== */}
      <Modal open={viewInvoice !== null} title="تفاصيل الفاتورة" onClose={() => setViewInvoice(null)} wide>
        {viewLoading ? (
          <p className="py-6 text-center text-slate-400">جارٍ التحميل...</p>
        ) : viewInvoice ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800">{viewInvoice.invoiceNumber}</p>
                <p className="text-xs text-slate-500">{fmtDate(viewInvoice.invoiceDate)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${PAYMENT_STYLE[viewInvoice.paymentStatus] ?? ''}`}>
                {PAYMENT_LABEL[viewInvoice.paymentStatus] ?? viewInvoice.paymentStatus}
              </span>
            </div>
            <p className="mb-2 text-sm text-slate-600">
              العميل: <b>{viewInvoice.party?.partyName ?? 'نقدي'}</b>
              {viewInvoice.warehouse ? ` — المخزن: ${viewInvoice.warehouse.name}` : ''}
            </p>
            <div className="max-h-64 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewInvoice.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>{i.item?.itemName ?? '—'}</td>
                      <td>{fmt(i.quantity)}</td>
                      <td>{fmtMoney(i.unitPrice)}</td>
                      <td className="font-semibold">{fmtMoney(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-between rounded-lg bg-slate-50 p-3 text-sm">
              <div className="space-y-1 text-slate-600">
                <p>المجموع: {fmtMoney(viewInvoice.subtotal)}</p>
                {toNum(viewInvoice.taxAmount) > 0 && <p>الضريبة: {fmtMoney(viewInvoice.taxAmount)}</p>}
                {toNum(viewInvoice.discount) > 0 && <p>الخصم: {fmtMoney(viewInvoice.discount)}</p>}
              </div>
              <p className="text-lg font-bold text-brand-700">{fmtMoney(viewInvoice.total)}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => printInvoice(viewInvoice, undefined)} className="btn-primary flex-1">🖨️ طباعة</button>
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
