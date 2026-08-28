import { useState } from 'react'
import CompanySettings from '@/pages/CompanySettings'
import UsersSettings from '@/pages/UsersSettings'
import BranchesWarehouses from '@/pages/BranchesWarehouses'
import ExchangeRates from '@/pages/ExchangeRates'
import AuditLogs from '@/pages/AuditLogs'
import DangerZone from '@/pages/DangerZone'
import LicenseSettings from '@/pages/LicenseSettings'
import { useAuth } from '@/contexts/AuthContext'
import TabSelector from '@/components/TabSelector'

type TabKey = 'company' | 'users' | 'branches' | 'exchange' | 'audit' | 'license' | 'danger'

const ALL_TABS = [
  { key: 'company', label: 'بيانات الشركة', icon: '🏢' },
  { key: 'users', label: 'المستخدمون والصلاحيات', icon: '👥' },
  { key: 'branches', label: 'الفروع والمخازن', icon: '🏬' },
  { key: 'exchange', label: 'أسعار الصرف', icon: '💱' },
  { key: 'license', label: 'الترخيص', icon: '🔑' },
  { key: 'audit', label: 'سجل التدقيق', icon: '📜' },
  { key: 'danger', label: 'منطقة الخطر', icon: '📛' },
]

export default function SettingsHub() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabKey>('company')

  const visibleTabs = user?.isSuperAdmin ? ALL_TABS : ALL_TABS.filter((t) => t.key !== 'danger')

  return (
    <div>
      <TabSelector tabs={visibleTabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

      {tab === 'company' && <CompanySettings />}
      {tab === 'users' && <UsersSettings />}
      {tab === 'branches' && <BranchesWarehouses />}
      {tab === 'exchange' && <ExchangeRates />}
      {tab === 'license' && <LicenseSettings />}
      {tab === 'audit' && <AuditLogs />}
      {tab === 'danger' && <DangerZone />}
    </div>
  )
}
