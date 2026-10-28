import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, extractError } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import type { AuditLog, AuditLogsResponse } from '@/types'

const LIMIT = 50

const TABLE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'item', label: 'الأصناف' },
  { key: 'party', label: 'الأطراف' },
  { key: 'account', label: 'الحسابات' },
  { key: 'branch', label: 'الفروع' },
  { key: 'warehouse', label: 'المخازن' },
  { key: 'user', label: 'المستخدمون' },
  { key: 'saleInvoice', label: 'فواتير البيع' },
  { key: 'purchaseInvoice', label: 'فواتير الشراء' },
  { key: 'purchaseOrder', label: 'أوامر الشراء' },
  { key: 'receipt', label: 'السندات' },
  { key: 'treasury', label: 'الخزائن' },
  { key: 'journalEntry', label: 'قيود اليومية' },
  { key: 'stockTransfer', label: 'التحويلات' },
  { key: 'inventoryCount', label: 'الجرد' },
  { key: 'serial', label: 'الأرقام التسلسلية' },
  { key: 'warranty', label: 'الضمان' },
  { key: 'rma', label: 'الصيانة' },
  { key: 'company', label: 'الشركة' },
  { key: 'security', label: '🔐 الأحداث الأمنية' },
]

const SECURITY_EVENT_LABEL: Record<string, { label: string; cls: string }> = {
  IDENTITY_TAMPERING: { label: 'تزوير الهوية', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  BRANCH_ACCESS_DENIED: { label: 'وصول فرع مرفوض', cls: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  UNAUTHORIZED_SYNC_ATTEMPT: { label: 'مزامنة غير مصرح بها', cls: 'bg-red-100 text-red-800 ring-1 ring-red-300' },
}

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  INSERT: { label: 'إضافة', cls: 'bg-emerald-50 text-emerald-700' },
  UPDATE: { label: 'تعديل', cls: 'bg-amber-50 text-amber-700' },
  DELETE: { label: 'حذف', cls: 'bg-red-50 text-red-700' },
  SECURITY_EVENT: { label: 'أمني', cls: 'bg-red-600 text-white' },
}

function parseJson(s: string | null | undefined): Record<string, unknown> | null {
  if (!s) return null
  try {
    const parsed = JSON.parse(s)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [tableName, setTableName] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (tableName) params.set('tableName', tableName)
      const res = await api.get<AuditLogsResponse>(`/settings/audit-logs?${params.toString()}`)
      setLogs(res.data.logs)
      setTotal(res.data.total)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [page, tableName])

  useEffect(() => {
    load()
  }, [load])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / LIMIT)), [total])

  const resetAndLoad = () => {
    setPage(1)
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">سجل التدقيق</h1>
        <p className="text-sm text-slate-500">تتبع كل التغييرات التي تمت على النظام</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={tableName}
          onChange={(e) => {
            setTableName(e.target.value)
            resetAndLoad()
          }}
        >
          <option value="">كل الجداول</option>
          {TABLE_OPTIONS.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <span className="text-sm text-slate-400">{total} سجل</span>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-16 text-center text-slate-400">جارٍ تحميل السجلات...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المستخدم</th>
                <th>الإجراء</th>
                <th>الجدول</th>
                <th>رقم السجل</th>
                <th className="text-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">لا توجد سجلات</td>
                </tr>
              ) : (
                logs.map((l) => (
                  <AuditLogRow key={l.id} log={l} expanded={expanded === l.id} onToggle={() => setExpanded(expanded === l.id ? null : l.id)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            السابق
          </button>
          <span className="text-sm text-slate-500">صفحة {page} من {pageCount}</span>
          <button
            className="btn-secondary"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            التالي
          </button>
        </div>
      )}
    </div>
  )
}

function AuditLogRow({ log, expanded, onToggle }: { log: AuditLog; expanded: boolean; onToggle: () => void }) {
  const action = ACTION_LABEL[log.action] ?? { label: log.action, cls: 'bg-slate-100 text-slate-600' }
  const security = log.eventType ? SECURITY_EVENT_LABEL[log.eventType] : null
  const oldV = parseJson(log.oldValues)
  const newV = parseJson(log.newValues)
  const hasDetails = oldV || newV

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="text-xs text-slate-500">{fmtDate(log.createdAt)}</td>
        <td>
          <div className="text-sm font-medium text-slate-800">{log.user?.fullName ?? '—'}</div>
          {log.user?.username && <div className="text-xs text-slate-400">@{log.user.username}</div>}
        </td>
        <td>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${action.cls}`}>{action.label}</span>
        </td>
        <td className="text-sm text-slate-600">{log.tableName}</td>
        <td className="font-mono text-xs text-slate-500">{log.recordId ?? '—'}</td>
        <td className="text-right">
          <div className="flex items-center justify-end gap-2">
            {security && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${security.cls}`}>{security.label}</span>
            )}
            {hasDetails && (
              <button onClick={onToggle} className="text-sm text-brand-600 hover:underline">
                {expanded ? 'إخفاء' : 'عرض'}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {oldV && (
                <div>
                  <p className="mb-1 text-xs font-bold text-slate-500">قبل التغيير</p>
                  <pre className="max-h-48 overflow-y-auto rounded-lg bg-white p-2 text-[10px] text-slate-600">
                    {JSON.stringify(oldV, null, 2)}
                  </pre>
                </div>
              )}
              {newV && (
                <div>
                  <p className="mb-1 text-xs font-bold text-slate-500">بعد التغيير</p>
                  <pre className="max-h-48 overflow-y-auto rounded-lg bg-white p-2 text-[10px] text-slate-600">
                    {JSON.stringify(newV, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
