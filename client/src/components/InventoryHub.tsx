import { useState } from 'react'
import Transfers from '@/pages/Transfers'
import InventoryCounts from '@/pages/InventoryCounts'
import StockMovements from '@/pages/StockMovements'
import StockValuation from '@/pages/StockValuation'
import LowStock from '@/pages/LowStock'

type TabKey = 'transfers' | 'counts' | 'movements' | 'valuation' | 'lowstock'

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'transfers', label: 'التحويلات', icon: '🔁' },
  { key: 'counts', label: 'الجرد', icon: '📋' },
  { key: 'movements', label: 'الحركات', icon: '📈' },
  { key: 'valuation', label: 'تقييم المخزون', icon: '💎' },
  { key: 'lowstock', label: 'مخزون منخفض', icon: '⚠️' },
]

export default function InventoryHub() {
  const [tab, setTab] = useState<TabKey>('transfers')

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm transition-colors ${
              tab === t.key
                ? 'border-b-2 border-brand-600 bg-brand-50 font-semibold text-brand-800'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'transfers' && <Transfers />}
      {tab === 'counts' && <InventoryCounts />}
      {tab === 'movements' && <StockMovements />}
      {tab === 'valuation' && <StockValuation />}
      {tab === 'lowstock' && <LowStock />}
    </div>
  )
}
