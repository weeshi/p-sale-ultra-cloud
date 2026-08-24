import { Link } from 'react-router-dom'
import AccountingTabs from '@/components/AccountingTabs'

const PAGES: Array<{ to: string; label: string; desc: string; icon: string }> = [
  { to: '/accounting/journal', label: 'دفتر اليومية', desc: 'القيود: قائمة، تفاصيل، عكس وإنشاء يدوي', icon: '📒' },
  { to: '/accounting/trial-balance', label: 'ميزان المراجعة', desc: 'أرصدة الحسابات حتى تاريخ مع توازن', icon: '⚖️' },
  { to: '/accounting/income-statement', label: 'قائمة الدخل', desc: 'الإيرادات والمصروفات وصافي الربح', icon: '📊' },
  { to: '/accounting/balance-sheet', label: 'الميزانية العمومية', desc: 'الأصول والخصوم وحقوق الملكية', icon: '🏛️' },
  { to: '/accounting/accounts', label: 'دليل الحسابات', desc: 'الشجرة المحاسبية — إنشاء وتعديل', icon: '🗂️' },
  { to: '/accounting/ledger', label: 'دفاتر الأستاذ', desc: 'حركات حساب واحد مع رصيد تراكمي', icon: '📓' },
  { to: '/accounting/party-ledger', label: 'كشف حساب طرف', desc: 'حركات وأرصدة عملاء وموردين', icon: '👤' },
]

export default function AccountingHub() {
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">المحاسبة</h1>
        <p className="text-sm text-slate-500">دفتر اليومية والتقارير المالية ودليل الحسابات</p>
      </div>

      <AccountingTabs />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PAGES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            className="card group transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{p.icon}</span>
              <div>
                <div className="font-bold text-slate-800 group-hover:text-brand-700">{p.label}</div>
                <div className="mt-1 text-sm text-slate-500">{p.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
