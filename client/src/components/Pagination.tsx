import { useMemo } from 'react'

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 0] as const
export const DEFAULT_PAGE_SIZE = 25

interface PaginationProps {
  page: number
  total: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
}

export default function Pagination({ page, total, limit, onPageChange, onLimitChange }: PaginationProps) {
  const totalPages = useMemo(() => {
    if (limit === 0) return 1
    return Math.max(1, Math.ceil(total / limit))
  }, [total, limit])

  if (total === 0) return null

  const from = limit === 0 ? 1 : (page - 1) * limit + 1
  const to = limit === 0 ? total : Math.min(page * limit, total)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">عرض</span>
        <select
          className="input w-auto min-w-[80px]"
          value={limit}
          onChange={(e) => {
            const val = Number(e.target.value)
            onLimitChange(val)
            onPageChange(1)
          }}
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 0 ? 'الكل' : opt}
            </option>
          ))}
        </select>
        <span className="text-slate-500">من {total}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-slate-500">
          {from}–{to}
        </span>
        <button
          className="btn-secondary px-3 py-1"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹ السابق
        </button>
        <span className="px-2 font-medium text-slate-700">
          {page} / {totalPages}
        </span>
        <button
          className="btn-secondary px-3 py-1"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          التالي ›
        </button>
      </div>
    </div>
  )
}

export function usePaginate<T>(items: T[], limit: number, page: number) {
  const paginated = useMemo(() => {
    if (limit === 0) return items
    const start = (page - 1) * limit
    return items.slice(start, start + limit)
  }, [items, limit, page])

  return { paginated, total: items.length }
}
