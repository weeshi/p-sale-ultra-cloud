import { type ReactNode } from 'react'

export interface DataListColumn<T> {
  key: string
  label: string
  render: (item: T) => ReactNode
  mobileHidden?: boolean
  mobileLabel?: string
}

interface DataListProps<T> {
  data: T[]
  columns: DataListColumn<T>[]
  onRowClick?: (item: T) => void
  emptyText?: string
  keyFn?: (item: T) => string | number
}

export default function DataList<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  emptyText = '·«  ÊÃœ »Ì«‰« ',
  keyFn,
}: DataListProps<T>) {
  if (data.length === 0) {
    return <div className="card py-12 text-center text-slate-400">{emptyText}</div>
  }

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden card overflow-x-auto p-0 lg:block">
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => (
              <tr
                key={keyFn ? keyFn(item) : idx}
                onClick={() => onRowClick?.(item)}
                className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
              >
                {columns.map((col) => (
                  <td key={col.key}>{col.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {data.map((item, idx) => (
          <div
            key={keyFn ? keyFn(item) : idx}
            onClick={() => onRowClick?.(item)}
            className={`card rounded-2xl p-4 ${
              onRowClick ? 'cursor-pointer active:bg-slate-50' : ''
            }`}
          >
            {columns
              .filter((col) => !col.mobileHidden)
              .map((col, ci) => {
                const isFirst = ci === 0
                return (
                  <div
                    key={col.key}
                    className={`flex items-center justify-between py-1.5 ${
                      ci > 0 ? 'border-t border-slate-100' : ''
                    }`}
                  >
                    <span className={`text-sm text-slate-500 ${isFirst ? 'hidden' : ''}`}>
                      {col.mobileLabel ?? col.label}
                    </span>
                    <span
                      className={`${
                        isFirst
                          ? 'text-base font-bold text-slate-800'
                          : 'text-sm font-medium text-slate-700'
                      }`}
                    >
                      {col.render(item)}
                    </span>
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </>
  )
}
