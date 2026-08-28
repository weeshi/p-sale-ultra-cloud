import { useBranchFilter } from '@/contexts/BranchFilterContext'

// شريط نطاق الفروع — يظهر للسوبر أدمن فقط (canFilter)
// يمكّن المدير العام من رؤية شاملة لكل الفروع بضغطة زر عبر «عرض كل الفروع»
export default function BranchScopeBar() {
  const { branches, branchLoading, selectedBranchId, setSelectedBranchId, canFilter } = useBranchFilter()

  if (!canFilter) return null

  const all = selectedBranchId == null

  return (
    <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-brand-800">
          {all ? '👁️ عرض كل الفروع — رؤية شاملة لإجمالي الشركة' : '🎯 عرض تقارير فرع واحد'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedBranchId(null)}
          className={all ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'}
          title="إظهار تقارير جميع الفروع معاً (إجمالي الشركة)"
        >
          🌐 عرض كل الفروع
        </button>
        {branchLoading && <span className="text-xs text-slate-400">جارٍ تحميل الفروع...</span>}
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedBranchId(b.id)}
            className={
              selectedBranchId === b.id
                ? 'inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700'
                : 'inline-flex items-center justify-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100'
            }
            title={`عرض تقارير فرع ${b.name} فقط`}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  )
}