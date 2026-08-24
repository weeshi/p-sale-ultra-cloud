import { useState } from 'react'
import CompanySettings from '@/pages/CompanySettings'
import UsersSettings from '@/pages/UsersSettings'
import BranchesWarehouses from '@/pages/BranchesWarehouses'
import ExchangeRates from '@/pages/ExchangeRates'
import AuditLogs from '@/pages/AuditLogs'
import DangerZone from '@/pages/DangerZone'
import { useAuth } from '@/contexts/AuthContext'

type TabKey = 'company' | 'users' | 'branches' | 'exchange' | 'audit' | 'danger'

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'company', label: 'بيانات الشركة', icon: '🏢' },
  { key: 'users', label: 'المستخدمون والصلاحيات', icon: '👥' },
  { key: 'branches', label: 'الفروع والمخازن', icon: '🏬' },
  { key: 'exchange', label: 'أسعار الصرف', icon: '💱' },
  { key: 'audit', label: 'سجل التدقيق', icon: '📜' },
  { key: 'danger', label: 'منطقة الخطر', icon: '📛' },
]

export default function SettingsHub() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('company')

  const visibleTabs = user?.isSuperAdmin ? TABS : TABS.filter((t) => t.key !== 'danger')

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-2">
        {visibleTabs.map((t) => (
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

      {tab === 'company' && <CompanySettings />}
      {tab === 'users' && <UsersSettings />}
      {tab === 'branches' && <BranchesWarehouses />}
      {tab === 'exchange' && <ExchangeRates />}
      {tab === 'audit' && <AuditLogs />}
      {tab === 'danger' && <DangerZone />}
    </div>
  )
}
