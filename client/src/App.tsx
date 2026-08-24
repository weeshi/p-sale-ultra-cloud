import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Setup from '@/pages/Setup'
import Dashboard from '@/pages/Dashboard'
import Items from '@/pages/Items'
import Parties from '@/pages/Parties'
import Sales from '@/pages/Sales'
import Quotes from '@/pages/Quotes'
import Purchases from '@/pages/Purchases'
import LocalPurchaseInvoice from '@/pages/LocalPurchaseInvoice'
import ImportOrderCreate from '@/pages/ImportOrderCreate'
import ImportOrderReceive from '@/pages/ImportOrderReceive'
import Transfers from '@/pages/Transfers'
import TransferReceive from '@/pages/TransferReceive'
import InventoryCounts from '@/pages/InventoryCounts'
import StockMovements from '@/pages/StockMovements'
import StockValuation from '@/pages/StockValuation'
import LowStock from '@/pages/LowStock'
import InventoryHub from '@/components/InventoryHub'
import JournalEntries from '@/pages/JournalEntries'
import TrialBalance from '@/pages/TrialBalance'
import IncomeStatement from '@/pages/IncomeStatement'
import BalanceSheet from '@/pages/BalanceSheet'
import ChartOfAccounts from '@/pages/ChartOfAccounts'
import AccountLedger from '@/pages/AccountLedger'
import PartyLedger from '@/pages/PartyLedger'
import AccountingHub from '@/pages/AccountingHub'
import TreasuryHub from '@/components/TreasuryHub'
import Treasuries from '@/pages/Treasuries'
import Receipts from '@/pages/Receipts'
import BankReconciliation from '@/pages/BankReconciliation'
import SettingsHub from '@/components/SettingsHub'
import CompanySettings from '@/pages/CompanySettings'
import UsersSettings from '@/pages/UsersSettings'
import BranchesWarehouses from '@/pages/BranchesWarehouses'
import ExchangeRates from '@/pages/ExchangeRates'
import AuditLogs from '@/pages/AuditLogs'
import DangerZone from '@/pages/DangerZone'
import ReportsHub from '@/components/ReportsHub'
import { useAuth } from '@/contexts/AuthContext'

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">جارٍ التحميل...</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/sales/quotes" element={<Quotes />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/purchases/local" element={<LocalPurchaseInvoice />} />
        <Route path="/purchases/import" element={<ImportOrderCreate />} />
        <Route path="/purchases/import/:id/receive" element={<ImportOrderReceive />} />
        <Route path="/items" element={<Items />} />
        <Route path="/parties" element={<Parties />} />
        <Route path="/inventory" element={<InventoryHub />} />
        <Route path="/inventory/transfers" element={<Transfers />} />
        <Route path="/inventory/transfers/:id/receive" element={<TransferReceive />} />
        <Route path="/inventory/counts" element={<InventoryCounts />} />
        <Route path="/inventory/movements" element={<StockMovements />} />
        <Route path="/inventory/valuation" element={<StockValuation />} />
        <Route path="/inventory/low-stock" element={<LowStock />} />
        <Route path="/treasury" element={<TreasuryHub />} />
        <Route path="/treasury/treasuries" element={<Treasuries />} />
        <Route path="/treasury/receipts" element={<Receipts />} />
        <Route path="/treasury/reconciliation" element={<BankReconciliation />} />
        <Route path="/accounting" element={<AccountingHub />} />
        <Route path="/accounting/journal" element={<JournalEntries />} />
        <Route path="/accounting/trial-balance" element={<TrialBalance />} />
        <Route path="/accounting/income-statement" element={<IncomeStatement />} />
        <Route path="/accounting/balance-sheet" element={<BalanceSheet />} />
        <Route path="/accounting/accounts" element={<ChartOfAccounts />} />
        <Route path="/accounting/ledger" element={<AccountLedger />} />
        <Route path="/accounting/accounts/:id/ledger" element={<AccountLedger />} />
        <Route path="/accounting/party-ledger" element={<PartyLedger />} />
        <Route path="/reports" element={<ReportsHub />} />
        <Route path="/settings" element={<SettingsHub />} />
        <Route path="/settings/company" element={<CompanySettings />} />
        <Route path="/settings/users" element={<UsersSettings />} />
        <Route path="/settings/branches" element={<BranchesWarehouses />} />
        <Route path="/settings/exchange-rates" element={<ExchangeRates />} />
        <Route path="/settings/audit-logs" element={<AuditLogs />} />
        <Route path="/settings/danger-zone" element={<DangerZone />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
