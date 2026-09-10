// ============================================
// P-Sale Ultra Cloud — بيانات تجريبية (Seed)
// التشغيل: npm run db:seed  (في server/)
// آمن للتكرار: يتحقق من الوجود ولا يكرر البيانات
// ============================================

import '../src/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/config/database'
import { sequenceService } from '../src/services/sequenceService'
import { DEFAULT_EXCHANGE_RATE_USD_LYD, SEQUENCE_PREFIXES } from '../../shared/constants'
import { generateBarcode } from '../../shared/utils'

const DEMO_COMPANY = 'شركة الأفق للكمبيوتر والإلكترونيات'
const DEMO_ADMIN_USERNAME = 'admin'
const DEMO_ADMIN_PASSWORD = 'SuperAdmin123!'

// الدليل المحاسبي الافتراضي (مطابق لـ authService.setup)
const DEFAULT_ACCOUNTS = [
  { code: '1100', name: 'الأصول المتداولة', type: 'asset', terminal: false },
  { code: '1101', name: 'العملاء', type: 'asset' },
  { code: '1102', name: 'المخزون', type: 'asset' },
  { code: '1103', name: 'الخزينة', type: 'asset' },
  { code: '1104', name: 'البنوك', type: 'asset' },
  { code: '1105', name: 'سندات تحت التحصيل', type: 'asset' },
  { code: '1200', name: 'الأصول الثابتة', type: 'asset', terminal: false },
  { code: '1201', name: 'الأثاث والمعدات', type: 'asset' },
  { code: '2100', name: 'الالتزامات المتداولة', type: 'liability', terminal: false },
  { code: '2101', name: 'الموردون', type: 'liability' },
  { code: '2102', name: 'ضريبة القيمة المضافة', type: 'liability' },
  { code: '2103', name: 'مستحقات الموظفين', type: 'liability' },
  { code: '3000', name: 'رأس المال', type: 'equity' },
  { code: '3001', name: 'أرباح مرحلة', type: 'equity' },
  { code: '3002', name: 'أرباح السنة الحالية', type: 'equity' },
  { code: '4100', name: 'الإيرادات', type: 'revenue', terminal: false },
  { code: '4101', name: 'إيرادات المبيعات', type: 'revenue' },
  { code: '4102', name: 'إيرادات الصيانة', type: 'revenue' },
  { code: '5100', name: 'المصاريف', type: 'expense', terminal: false },
  { code: '5101', name: 'تكلفة المبيعات', type: 'expense' },
  { code: '5102', name: 'الرواتب والأجور', type: 'expense' },
  { code: '5103', name: 'الإيجار', type: 'expense' },
  { code: '5104', name: 'الكهرباء والماء', type: 'expense' },
  { code: '5105', name: 'الإنترنت والاتصالات', type: 'expense' },
  { code: '5106', name: 'مصاريف الشحن والجمارك', type: 'expense' },
  { code: '5107', name: 'مصاريف متنوعة', type: 'expense' },
]

const CATEGORIES = [
  { name: 'أجهزة كمبيوتر', icon: '🖥️' },
  { name: 'لابتوب', icon: '💻' },
  { name: 'ملحقات', icon: '🖱️' },
  { name: 'قطع غيار', icon: '⚙️' },
  { name: 'شبكات', icon: '📡' },
  { name: 'طابعات', icon: '🖨️' },
]

const BRANDS = [
  { name: 'HP', country: 'الولايات المتحدة' },
  { name: 'Dell', country: 'الولايات المتحدة' },
  { name: 'Lenovo', country: 'الصين' },
  { name: 'TP-Link', country: 'الصين' },
  { name: 'Canon', country: 'اليابان' },
  { name: 'Samsung', country: 'كوريا الجنوبية' },
]

const UNITS = [
  { name: 'قطعة', shortName: 'قطعة' },
  { name: 'صندوق', shortName: 'صندوق' },
  { name: 'متر', shortName: 'م' },
  { name: 'كرتونة', shortName: 'كرتونة' },
]

const ATTRIBUTES = [
  { name: 'المعالج', type: 'text', options: null },
  { name: 'الذاكرة RAM', type: 'text', options: null },
  { name: 'السعة التخزينية', type: 'select', options: JSON.stringify(['256GB', '512GB', '1TB', '2TB']) },
  { name: 'اللون', type: 'select', options: JSON.stringify(['أسود', 'فضي', 'أبيض', 'رمادي']) },
  { name: 'الشاشة', type: 'select', options: JSON.stringify(['14 بوصة', '15.6 بوصة', '17 بوصة']) },
]

// [code, name, barcode, category, brand, unit, purchasePrice, salePrice, openingStock, trackSerial]
type ItemSeed = [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  boolean,
]

const ITEMS: ItemSeed[] = [
  ['PC-DELL-001', 'كمبيوتر مكتبي Dell', 'PC-DELL-001', 'أجهزة كمبيوتر', 'Dell', 'قطعة', 1800, 2400, 8, false],
  ['LT-HP-001', 'لابتوب HP ProBook', 'LT-HP-001', 'لابتوب', 'HP', 'قطعة', 2600, 3400, 5, false],
  ['LT-LEN-001', 'لابتوب Lenovo ThinkPad', 'LT-LEN-001', 'لابتوب', 'Lenovo', 'قطعة', 2900, 3800, 4, false],
  ['ACC-MOUSE-01', 'ماوس لاسلكي', 'ACC-MOUSE-01', 'ملحقات', 'HP', 'قطعة', 45, 75, 50, false],
  ['ACC-KBD-01', 'لوحة مفاتيح', 'ACC-KBD-01', 'ملحقات', 'Dell', 'قطعة', 60, 95, 40, false],
  ['ACC-CBL-01', 'كابل شبكة UTP', 'ACC-CBL-01', 'شبكات', 'TP-Link', 'متر', 3, 6, 200, false],
  ['PRN-CAN-01', 'طابعة Canon PIXMA', 'PRN-CAN-01', 'طابعات', 'Canon', 'قطعة', 750, 1050, 6, false],
  ['NTK-SW-01', 'سويتش TP-Link 8 منافذ', 'NTK-SW-01', 'شبكات', 'TP-Link', 'قطعة', 220, 320, 12, false],
  ['PC-SMS-01', 'هاتف Samsung Galaxy', 'PC-SMS-01', 'لابتوب', 'Samsung', 'قطعة', 1400, 1900, 3, true],
]

const PARTIES: Array<{ code: string; name: string; type: string; phone: string; creditLimit: number }> = [
  { code: 'CUST-001', name: 'شركة التقنية الحديثة', type: 'customer', phone: '0912345678', creditLimit: 5000 },
  { code: 'CUST-002', name: 'متجر الأهرام', type: 'customer', phone: '0923456789', creditLimit: 2000 },
  { code: 'CUST-003', name: 'مكتب النور للخدمات', type: 'customer', phone: '0934567890', creditLimit: 1000 },
  { code: 'VEND-001', name: 'مورد الصين للإلكترونيات', type: 'vendor', phone: '0911112222', creditLimit: 50000 },
  { code: 'VEND-002', name: 'شركة النيل للمعدات', type: 'vendor', phone: '0922223333', creditLimit: 30000 },
]

// ربط حساب محاسبي بكود حساب عبر معرّف مؤقت — يُعبأ بعد إنشاء الحسابات
const accountsByCode = new Map<string, { id: number }>()

async function main() {
  console.log('🌱 بدء بذر البيانات التجريبية...')

  const company = await ensureCompany()
  await ensureCatalog(company.id)
  const items = await ensureItems(company.id)
  await ensureParties(company.id)
  await ensureExchangeRate(company.id)
  await ensureSerials(company.id, items)

  console.log('✅ اكتمل البذر بنجاح')
}

async function ensureCompany() {
  const existing = await prisma.company.findFirst()
  if (existing) {
    console.log(`ℹ️  شركة موجودة مسبقاً: ${existing.name} (id=${existing.id})`)
    return existing
  }

  console.log('⚙️  إنشاء شركة جديدة...')
  const company = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: DEMO_COMPANY } })

    const mainBranch = await tx.branch.create({
      data: { companyId: company.id, name: 'الفرع الرئيسي', code: 'MAIN', isMain: true },
    })

    const centralWarehouse = await tx.warehouse.create({
      data: { companyId: company.id, name: 'المخزن المركزي', code: 'CW', type: 'central', branchId: mainBranch.id },
    })

    for (const acc of DEFAULT_ACCOUNTS) {
      await tx.account.create({
        data: {
          companyId: company.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          isTerminal: acc.terminal !== false,
        },
      })
    }
    const accounts = await tx.account.findMany({ where: { companyId: company.id } })
    for (const a of accounts) accountsByCode.set(a.accountCode, { id: a.id })

    // إنشاء خزينة (كاش + مصرف) لكل فرع
    const cashAccount = accountsByCode.get('1103')
    const bankAccount = accountsByCode.get('1104')
    const branches = await tx.branch.findMany({ where: { companyId: company.id } })
    for (const branch of branches) {
      const cashExists = await tx.treasury.findFirst({
        where: { companyId: company.id, branchId: branch.id, treasuryType: 'cash' },
      })
      if (!cashExists) {
        await tx.treasury.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            treasuryName: `صندوق ${branch.name}`,
            treasuryType: 'cash',
            currency: 'LYD',
            accountId: cashAccount?.id,
          },
        })
      }
      const bankExists = await tx.treasury.findFirst({
        where: { companyId: company.id, branchId: branch.id, treasuryType: 'bank' },
      })
      if (!bankExists) {
        await tx.treasury.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            treasuryName: `حساب ${branch.name}`,
            treasuryType: 'bank',
            currency: 'LYD',
            accountId: bankAccount?.id,
            bankName: 'البنك التجاري الوطني',
            accountNumber: '1234567890',
          },
        })
      }
    }

    for (const prefix of SEQUENCE_PREFIXES) {
      await sequenceService.ensure(company.id, prefix, tx)
    }

    const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10)
    await tx.user.create({
      data: {
        companyId: company.id,
        username: DEMO_ADMIN_USERNAME,
        passwordHash,
        fullName: 'مدير النظام',
        role: 'admin',
        branchId: mainBranch.id,
        isSuperAdmin: true,
        superAdminKey: company.id,
      },
    })

    return company
  })

  console.log(`✅ الشركة: ${company.name} (id=${company.id})`)
  return company
}

async function ensureCatalog(companyId: number) {
  for (const c of CATEGORIES) {
    const exists = await prisma.category.findFirst({ where: { companyId, name: c.name } })
    if (!exists) await prisma.category.create({ data: { companyId, name: c.name, icon: c.icon } })
  }
  for (const b of BRANDS) {
    const exists = await prisma.brand.findFirst({ where: { companyId, name: b.name } })
    if (!exists) await prisma.brand.create({ data: { companyId, name: b.name, country: b.country } })
  }
  for (const u of UNITS) {
    const exists = await prisma.unit.findFirst({ where: { companyId, name: u.name } })
    if (!exists) await prisma.unit.create({ data: { companyId, name: u.name, shortName: u.shortName } })
  }
  for (const a of ATTRIBUTES) {
    const exists = await prisma.attribute.findFirst({ where: { companyId, name: a.name } })
    if (!exists) await prisma.attribute.create({ data: { companyId, name: a.name, type: a.type, options: a.options } })
  }
  console.log('ℹ️  الكتالوج (فئات/ماركات/وحدات/خصائص) جاهز')
}

async function ensureItems(companyId: number) {
  const results: Array<{ id: number; itemCode: string; trackSerial: boolean }> = []
  const centralWarehouse = await prisma.warehouse.findFirst({ where: { companyId, type: 'central' } })
  if (!centralWarehouse) throw new Error('المخزن المركزي غير موجود')

  for (const [code, name, barcode, catName, brandName, unitName, purchasePrice, salePrice, openingStock, trackSerial] of ITEMS) {
    const existing = await prisma.item.findFirst({ where: { companyId, itemCode: code } })
    if (existing) {
      results.push({ id: existing.id, itemCode: existing.itemCode, trackSerial: existing.trackSerial })
      continue
    }

    const category = await prisma.category.findFirst({ where: { companyId, name: catName } })
    const brand = await prisma.brand.findFirst({ where: { companyId, name: brandName } })
    const unit = await prisma.unit.findFirst({ where: { companyId, name: unitName } })

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          companyId,
          itemCode: code,
          itemName: name,
          barcode: generateBarcode(barcode, Date.now() % 100000),
          categoryId: category?.id,
          brandId: brand?.id,
          unitId: unit?.id,
          purchasePrice,
          salePrice,
          openingStock,
          currentStock: openingStock,
          minStock: 2,
          reorderLevel: 5,
          trackSerial,
          inventoryAccountId: accountsByCode.get('1102')?.id,
          cogsAccountId: accountsByCode.get('5101')?.id,
          salesAccountId: accountsByCode.get('4101')?.id,
        },
      })

      if (openingStock > 0) {
        await tx.stock.create({
          data: { companyId, itemId: created.id, warehouseId: centralWarehouse.id, quantity: openingStock },
        })
      }

      return created
    })

    results.push({ id: item.id, itemCode: item.itemCode, trackSerial: item.trackSerial })
    console.log(`   + صنف: ${name} (${code}) — مخزون ${openingStock}`)
  }

  console.log(`ℹ️  الأصناف جاهزة (${results.length})`)
  return results
}

async function ensureParties(companyId: number) {
  const customerAccount = accountsByCode.get('1101')
  const vendorAccount = accountsByCode.get('2101')

  for (const p of PARTIES) {
    const existing = await prisma.party.findFirst({ where: { companyId, partyCode: p.code } })
    if (existing) continue
    await prisma.party.create({
      data: {
        companyId,
        partyCode: p.code,
        partyName: p.name,
        partyType: p.type,
        phone: p.phone,
        creditLimit: p.creditLimit,
        accountId: p.type === 'vendor' ? vendorAccount?.id : customerAccount?.id,
      },
    })
    console.log(`   + طرف: ${p.name} (${p.code})`)
  }

  console.log(`ℹ️  الأطراف جاهزة (${PARTIES.length})`)
}

async function ensureExchangeRate(companyId: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const existing = await prisma.exchangeRate.findFirst({
    where: { companyId, fromCurrency: 'USD', toCurrency: 'LYD', rateDate: today },
  })
  if (existing) return
  await prisma.exchangeRate.create({
    data: {
      companyId,
      fromCurrency: 'USD',
      toCurrency: 'LYD',
      rate: DEFAULT_EXCHANGE_RATE_USD_LYD,
      isAuto: false,
      rateDate: today,
    },
  })
  console.log(`ℹ️  سعر الصرف USD/LYD = ${DEFAULT_EXCHANGE_RATE_USD_LYD} (اليوم)`)
}

async function ensureSerials(companyId: number, items: Array<{ id: number; itemCode: string; trackSerial: boolean }>) {
  const centralWarehouse = await prisma.warehouse.findFirst({ where: { companyId, type: 'central' } })
  if (!centralWarehouse) return

  for (const item of items) {
    if (!item.trackSerial) continue
    const count = await prisma.serial.count({ where: { companyId, itemId: item.id } })
    if (count > 0) continue

    for (let i = 1; i <= 3; i++) {
      await prisma.serial.create({
        data: {
          companyId,
          itemId: item.id,
          warehouseId: centralWarehouse.id,
          serialNumber: `SER-${item.itemCode}-${i}`,
          status: 'in_stock',
        },
      })
    }
    console.log(`   + سيريالات للصنف ${item.itemCode} (3 قطع)`)
  }
}

main()
  .catch((e) => {
    console.error('❌ فشل البذر:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
