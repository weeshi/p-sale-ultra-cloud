import { useState } from 'react'
import Transfers from '@/pages/Transfers'
import InventoryCounts from '@/pages/InventoryCounts'
import StockMovements from '@/pages/StockMovements'
import StockValuation from '@/pages/StockValuation'
import LowStock from '@/pages/LowStock'
import TabSelector from '@/components/TabSelector'

type TabKey = 'transfers' | 'counts' | 'movements' | 'valuation' | 'lowstock'

const TABS = [
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
      <TabSelector tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

      {tab === 'transfers' && <Transfers />}
      {tab === 'counts' && <InventoryCounts />}
      {tab === 'movements' && <StockMovements />}
      {tab === 'valuation' && <StockValuation />}
      {tab === 'lowstock' && <LowStock />}
    </div>
  )
}
