import { useState } from 'react'
import Treasuries from '@/pages/Treasuries'
import Receipts from '@/pages/Receipts'
import BankReconciliation from '@/pages/BankReconciliation'

type TabKey = 'treasuries' | 'receipts' | 'reconciliation'

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'treasuries', label: 'الخزائن', icon: '🏦' },
  { key: 'receipts', label: 'سندات القبض والصرف', icon: '🧾' },
  { key: 'reconciliation', label: 'التسوية البنكية', icon: '🏦' },
]

export default function TreasuryHub() {
  const [tab, setTab] = useState<TabKey>('treasuries')

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

      {tab === 'treasuries' && <Treasuries />}
      {tab === 'receipts' && <Receipts />}
      {tab === 'reconciliation' && <BankReconciliation />}
    </div>
  )
}
