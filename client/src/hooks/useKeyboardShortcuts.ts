import { useEffect, useCallback, useRef } from 'react'

interface KeyboardShortcutsOptions {
  onNew?: () => void
  onSave?: () => void
  onEscape?: () => void
  enabled?: boolean
}

export function useKeyboardShortcuts({ onNew, onSave, onEscape, enabled = true }: KeyboardShortcutsOptions) {
  const savedRef = useRef(onSave)
  savedRef.current = onSave

  const newRef = useRef(onNew)
  newRef.current = onNew

  const escRef = useRef(onEscape)
  escRef.current = onEscape

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (isInput) return
      switch (e.key) {
        case 'F2':
          e.preventDefault()
          newRef.current?.()
          break
        case 'F8':
          e.preventDefault()
          savedRef.current?.()
          break
        case 'Escape':
          escRef.current?.()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}

export function useSearchKeyHandler(
  search: string,
  items: { id: number; barcode?: string | null; itemName: string; [k: string]: unknown }[],
  onAddExact: (item: typeof items[0]) => void,
  onAddFirst: () => void,
  onClear: () => void,
  searchInputRef: React.RefObject<HTMLInputElement | null>
) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      const code = search.trim()
      if (!code) return

      const exact = items.find((it) => it.barcode === code)
      if (exact) {
        onAddExact(exact)
        onClear()
        searchInputRef.current?.focus()
        return
      }
      if (onAddFirst) {
        onAddFirst()
      }
    },
    [search, items, onAddExact, onAddFirst, onClear, searchInputRef]
  )
}
