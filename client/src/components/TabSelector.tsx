import { useState, useRef, useEffect } from 'react'

export interface TabItem {
  key: string
  label: string
  icon: string
}

interface TabSelectorProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
}

export default function TabSelector({ tabs, active, onChange }: TabSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeTab = tabs.find((t) => t.key === active)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <>
      {/* Desktop: horizontal tabs */}
      <div className="hidden gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-2 lg:flex">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm transition-colors ${
              active === t.key
                ? 'border-b-2 border-brand-600 bg-brand-50 font-semibold text-brand-800'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: segmented (<=4) or dropdown (>4) */}
      {tabs.length <= 4 ? (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-2 lg:hidden">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm transition-colors ${
                active === t.key
                  ? 'border-b-2 border-brand-600 bg-brand-50 font-semibold text-brand-800'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="border-b border-slate-200 bg-white px-4 py-2 lg:hidden" ref={ref}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-800"
          >
            <span className="flex items-center gap-2">
              <span className="text-xl">{activeTab?.icon}</span>
              {activeTab?.label}
            </span>
            <span className={`text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}>
              ?
            </span>
          </button>
          {dropdownOpen && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-lg">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { onChange(t.key); setDropdownOpen(false) }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-right text-base transition-colors ${
                    active === t.key
                      ? 'bg-brand-50 font-semibold text-brand-800'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xl">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
