import { BARCODE_PREFIX } from './constants'

export function toDecimal(value: number | string, precision = 3): number {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return Number(n.toFixed(precision))
}

export function round2(value: number): number {
  return Number(value.toFixed(2))
}

export function sum(arr: number[]): number {
  return arr.reduce((acc, v) => acc + (v || 0), 0)
}

export function weightedAverage(
  currentQty: number,
  currentCost: number,
  newQty: number,
  newCost: number
): number {
  const totalQty = currentQty + newQty
  if (totalQty === 0) return 0
  return (currentQty * currentCost + newQty * newCost) / totalQty
}

// متوسط تكلفة بامتصاص التالف: قيمة المخزون الفعلي (بما فيه التالف) تُوزّع على الكمية الصالحة فقط + الجديد
export function absorbedAverageCost(
  totalStock: number,
  damagedStock: number,
  currentCost: number,
  newQty: number,
  newCost: number
): number {
  const validQty = totalStock - damagedStock
  const totalAfter = validQty + newQty
  if (totalAfter <= 0) return 0
  return (totalStock * currentCost + newQty * newCost) / totalAfter
}

export function generateNumber(prefix: string, seq: number): string {
  const padded = String(seq).padStart(6, '0')
  return `${prefix}-${padded}`
}

export function generateBarcode(itemCode: string, id: number): string {
  const base = `${BARCODE_PREFIX}${itemCode}${id}`
  let sum = 0
  for (let i = 0; i < base.length; i++) {
    sum += base.charCodeAt(i) * (i + 1)
  }
  const checkDigit = sum % 10
  return base + checkDigit
}
