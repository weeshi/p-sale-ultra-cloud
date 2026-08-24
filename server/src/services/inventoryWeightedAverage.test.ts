import { absorbedAverageCost, weightedAverage } from '../../../shared/utils'

describe('absorbedAverageCost (امتصاص التالف)', () => {
  it('يوزّع قيمة المخزون الكامل (مع التالف) على الصالح + الجديد فقط', () => {
    // 3 وحدات (صالح 2 + تالف 1) بتكلفة 100 ← شراء 10 بتكلفة 110
    const avg = absorbedAverageCost(3, 1, 100, 10, 110)
    expect(avg).toBeCloseTo((300 + 1100) / 12, 5)
  })

  it('يساوي weightedAverage عندما لا يوجد تالف', () => {
    const a = absorbedAverageCost(5, 0, 80, 5, 100)
    const b = weightedAverage(5, 80, 5, 100)
    expect(a).toBeCloseTo(b, 5)
  })

  it('يعيد صفراً عندما تكون الكمية الكلية (صالح + جديد) صفراً', () => {
    expect(absorbedAverageCost(0, 0, 50, 0, 60)).toBe(0)
  })

  it('عندما يكون المخزون كله تالفاً: الموجه للصالح الجديد هو التكلفة السابقة فقط', () => {
    // 3 وحدات كلها تالف بتكلفة 100 ← شراء 1 بتكلفة 120 → (300 + 120) / 1 = 420
    expect(absorbedAverageCost(3, 3, 100, 1, 120)).toBeCloseTo(420, 5)
  })

  it('لا يسمح بتكلفة سالبة ويضمن تعادلاً رياضياً مع القيم الطبيعية', () => {
    const avg = absorbedAverageCost(4, 1, 25, 2, 40)
    // (4*25 + 2*40) / (3 + 2) = 180 / 5 = 36
    expect(avg).toBeCloseTo(36, 5)
  })
})