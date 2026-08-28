/**
 * بحث متعدد الكلمات — يتحقق من وجود جميع الكلمات في النص
 * بغض النظر عن الترتيب أو حالة الأحرف.
 *
 * مثال: searchMatch("ADATA 2TB Flash", "2tb adata") → true
 *       searchMatch("ADATA Flash", "2tb kingston") → false
 */
export function searchMatch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const h = haystack.toLowerCase()
  const words = q.split(/\s+/)
  return words.every((w) => h.includes(w))
}

/**
 * بناء "حقل البحث" من عدة حقول — يجمعها بمسافة بعد تنظيفها
 */
export function buildSearchHaystack(...fields: (string | number | null | undefined)[]): string {
  return fields
    .filter(Boolean)
    .map((s) => String(s).trim())
    .join(' ')
}
