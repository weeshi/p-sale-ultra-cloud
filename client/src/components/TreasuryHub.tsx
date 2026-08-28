import { useState } from 'react'
import Treasuries from '@/pages/Treasuries'
import Receipts from '@/pages/Receipts'
import BankReconciliation from '@/pages/BankReconciliation'
import TabSelector from '@/components/TabSelector'

type TabKey = 'treasuries' | 'receipts' | 'reconciliation'

const TABS = [
  { key: 'treasuries', label: 'الخزائن', icon: '🏦' },
  { key: 'receipts', label: 'سندات القبض والصرف', icon: '🧾' },
  { key: 'reconciliation', label: 'التسوية البنكية', icon: '🏦' },
]

export default function TreasuryHub() {
  const [tab, setTab] = useState<TabKey>('treasuries')

  return (
    <div>
      <TabSelector tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

      {tab === 'treasuries' && <Treasuries />}
      {tab === 'receipts' && <Receipts />}
      {tab === 'reconciliation' && <BankReconciliation />}
    </div>
  )
}
