import { useBranchFilter } from '@/contexts/BranchFilterContext'

// قائمة اختيار الفرع — تظهر للسوبر أدمن فقط (من canFilter)
export default function BranchFilterSelect() {
  const { branches, branchLoading, selectedBranchId, setSelectedBranchId, canFilter } = useBranchFilter()

  if (!canFilter) return null

  return (
    <div className="mb-2">
      <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">التصفية حسب الفرع</label>
      <select
        className="input py-1.5 text-xs"
        value={selectedBranchId ?? ''}
        onChange={(e) => setSelectedBranchId(e.target.value ? Number(e.target.value) : null)}
        title="تصفية البيانات حسب الفرع — الكل يعني إجمالي الشركة"
      >
        <option value="">جميع الفروع</option>
        {branchLoading && <option disabled>جارٍ التحميل...</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  )
}