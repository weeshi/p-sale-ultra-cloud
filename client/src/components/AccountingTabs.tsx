import { NavLink } from 'react-router-dom'

const TABS: Array<{ to: string; label: string; icon: string; end?: boolean }> = [
  { to: '/accounting/journal', label: 'دفتر اليومية', icon: '📒' },
  { to: '/accounting/trial-balance', label: 'ميزان المراجعة', icon: '⚖️' },
  { to: '/accounting/income-statement', label: 'قائمة الدخل', icon: '📊' },
  { to: '/accounting/balance-sheet', label: 'الميزانية العمومية', icon: '⚖️' },
  { to: '/accounting/accounts', label: 'دليل الحسابات', icon: '🗂️' },
  { to: '/accounting/ledger', label: 'دفاتر الأستاذ', icon: '📓' },
  { to: '/accounting/party-ledger', label: 'كشف حساب طرف', icon: '👤' },
]

export default function AccountingTabs() {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-2">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm transition-colors ${
              isActive
                ? 'border-b-2 border-brand-600 bg-brand-50 font-semibold text-brand-800'
                : 'text-slate-600 hover:bg-slate-50'
            }`
          }
        >
          <span>{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
