// أدوات تنسيق وعرض مشتركة — Prisma Decimal تصل كسلاسل نصية

export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : 0
}

export function fmt(n: unknown, decimals = 2): string {
  return new Intl.NumberFormat('ar-LY', { maximumFractionDigits: decimals }).format(toNum(n))
}

export function fmtMoney(n: unknown, decimals = 2): string {
  return `${fmt(n, decimals)} د.ل`
}

export function fmtUsd(n: unknown, decimals = 2): string {
  return `${fmt(n, decimals)} $`
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function toInputNum(v: unknown): string {
  const n = toNum(v)
  return n === 0 ? '' : String(n)
}
