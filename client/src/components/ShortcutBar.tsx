interface ShortcutHint {
  key: string
  label: string
}

const SHORTCUTS: ShortcutHint[] = [
  { key: 'F2', label: 'جديد' },
  { key: 'F8', label: 'حفظ' },
  { key: 'Enter', label: 'مسح باركود' },
  { key: 'Esc', label: 'إلغاء' },
]

export default function ShortcutBar({ extra }: { extra?: ShortcutHint[] }) {
  const list = extra ? [...SHORTCUTS, ...extra] : SHORTCUTS
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex justify-center gap-4 border-t border-slate-200 bg-slate-50/90 px-4 py-1.5 text-[11px] text-slate-400 backdrop-blur-sm select-none print:hidden">
      {list.map((s) => (
        <span key={s.key}>
          <kbd className="mx-0.5 inline-block rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-[10px] font-semibold text-slate-500 shadow-sm">
            {s.key}
          </kbd>{' '}
          {s.label}
        </span>
      ))}
    </div>
  )
}
