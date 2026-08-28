import 'dotenv/config'
import fs from 'fs'
import { prisma } from '../src/config/database'
import { sequenceService } from '../src/services/sequenceService'
import { generateNumber } from '../../shared/utils'

const cp1256 = new TextDecoder('windows-1256')

function decodeCp1256(buf: Buffer, start: number, maxLen: number): string {
  const text = cp1256.decode(buf.subarray(start, start + maxLen))
  const nul = text.indexOf('\u0000')
  return (nul >= 0 ? text.slice(0, nul) : text).trim()
}

interface ParsedRecord {
  offset: number
  cvNo: number
  name: string
  cvType: number
  irad: number
  address: string
  tel: string
}

const INTERNAL_CVNOS = new Set([0x01, 0x02, 0x03, 0x04, 0x0b, 0x0c, 0x2e, 0x4b])

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 && args[idx + 1] !== undefined ? args[idx + 1] : undefined
  }
  return {
    file: get('file'),
    companyId: get('companyId') ? Number(get('companyId')) : undefined,
    dryRun: args.includes('--dry-run'),
  }
}

function parseData(buf: Buffer): ParsedRecord[] {
  const records: ParsedRecord[] = []
  for (let i = 0x800; i < buf.length - 120; i++) {
    if (buf[i + 6] !== 0x80 || buf[i + 7] !== 0x00 || buf[i + 8] !== 0x00) continue
    const special =
      buf[i] === 0x02 && buf[i + 1] === 0x00 && buf[i + 2] === 0x00 &&
      buf[i + 3] === 0x00 && buf[i + 4] === 0x81 && buf[i + 5] === 0x07
    const generic =
      !special && buf[i] === 0x00 && buf[i + 1] === 0x00 && buf[i + 2] === 0x00 &&
      buf[i + 3] === 0x00 && buf[i + 4] === 0x00 && buf[i + 5] === 0x00
    if (!special && !generic) continue

    const cvNo = buf[i + 9]
    const name = decodeCp1256(buf, i + 10, 30).trim()
    printable: {
      let count = 0
      for (let k = i + 10; k < i + 40; k++) {
        const b = buf[k]
        if (b === 0) break
        const validByte = (b >= 0x20 && b <= 0x7e) || (b >= 0x80 && b <= 0xfe)
        if (validByte) count++
        else break printable
      }
      if (count < 2 || cvNo === 0) break printable
      records.push({
        offset: i,
        cvNo,
        name,
        cvType: buf[i + 56],
        irad: buf[i + 57],
        address: decodeCp1256(buf, i + 58, 40).trim(),
        tel: decodeCp1256(buf, i + 98, 10).trim(),
      })
    }
  }
  return records
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

async function main() {
  const args = parseArgs()
  const file = args.file ?? 'D:\\ERP-Projects\\P-Sale Ultra\\Yr2026\\CustVend.DB'

  if (!fs.existsSync(file)) {
    console.error(`خطأ: ملف المصدر غير موجود: ${file}`)
    process.exit(1)
  }

  const buf = fs.readFileSync(file)
  const records = parseData(buf)

  const internal = records.filter((r) => INTERNAL_CVNOS.has(r.cvNo))
  const importable = records.filter((r) => !INTERNAL_CVNOS.has(r.cvNo))

  let companyId = args.companyId
  if (!companyId) {
    const company = await prisma.company.findFirst({ select: { id: true } })
    if (!company) {
      console.error('خطأ: لا توجد شركة في قاعدة البيانات')
      process.exit(1)
    }
    companyId = company.id
  }

  const existing = await prisma.party.findMany({
    where: { companyId },
    select: { partyName: true },
  })
  const existingNames = new Set(existing.map((p) => p.partyName))

  console.log('=== خطة ترحيل الموردين من CustVend.DB ===')
  console.log(`المصدر: ${file}`)
  console.log(`الشركة: #${companyId} — إجمالي السجلات المكتشفة: ${records.length}`)
  console.log('')
  console.log('سجلات داخلية/حسابات — ستُتخطى (8):')
  for (const r of internal.sort((a, b) => a.cvNo - b.cvNo)) {
    console.log(`  [${pad(r.cvNo, 2).toUpperCase()}] ${r.name}`)
  }
  console.log('')
  console.log('أطراف جاهزة للاستيراد كموردين (vendor):')
  const rows = importable
    .slice()
    .sort((a, b) => a.cvNo - b.cvNo)
    .map((r) => ({
      cvNo: pad(r.cvNo, 2).toUpperCase(),
      name: r.name,
      cvType: r.cvType.toString(16).padStart(2, '0'),
      irad: r.irad.toString(16).padStart(2, '0'),
      address: r.address || '-',
      tel: r.tel || '-',
      status: existingNames.has(r.name) ? 'مكرر-سيُتخطى' : 'سيُستورد',
    }))
  for (const row of rows) {
    console.log(
      `  [${row.cvNo}] ${row.name} | address:${row.address} | tel:${row.tel} | type:${row.cvType} irad:${row.irad} | ${row.status}`
    )
  }

  const dupCount = rows.filter((r) => r.status.startsWith('مكرر')).length
  console.log('')
  console.log(
    `الملخص: ${importable.length} طرف قابل للاستيراد | ${dupCount} موجود مسبقاً | ${internal.length} داخلي يُتخطى`
  )

  if (args.dryRun) {
    await prisma.$disconnect()
    console.log('')
    console.log('وضع التجربة (--dry-run): لم يُكتب أي شيء في قاعدة البيانات.')
    return
  }

  const vendorCountBefore = await prisma.party.count({ where: { companyId, partyType: 'vendor' } })

  console.log('')
  console.log('جارٍ التنفيذ داخل ترانزاكشن واحدة...')

  const result = await prisma.$transaction(
    async (tx) => {
      const imported: ParsedRecord[] = []
      const duplicates: ParsedRecord[] = []
      for (const rec of importable) {
        const dup = await tx.party.findFirst({
          where: { companyId, partyName: rec.name },
          select: { id: true },
        })
        if (dup) {
          duplicates.push(rec)
          continue
        }
        const seq = await sequenceService.next(companyId!, 'PTY', tx)
        const partyCode = generateNumber('PTY', seq)
        await tx.party.create({
          data: {
            companyId: companyId!,
            partyCode,
            partyName: rec.name,
            partyType: 'vendor',
            address: rec.address || null,
            phone: rec.tel || null,
            notes: `مستورد من CustVend.DB (الرقم القديم ${pad(rec.cvNo, 2).toUpperCase()})`,
          },
        })
        imported.push(rec)
      }
      return { imported, duplicates }
    },
    { timeout: 120000 }
  )

  const vendorCountAfter = await prisma.party.count({ where: { companyId, partyType: 'vendor' } })
  console.log('')
  console.log('=== تقرير الترحيل ===')
  console.log(`الشركة #${companyId}: عدد الموردين قبل = ${vendorCountBefore}`)
  console.log(`عدد الموردين الكلي الآن = ${vendorCountAfter}`)
  console.log('')
  console.log('المستوردون (جدد):')
  for (const r of result.imported) {
    console.log(`  + [${pad(r.cvNo, 2).toUpperCase()}] ${r.name}`)
  }
  console.log('')
  console.log('مستبعدون كأسماء مكررة:')
  for (const r of result.duplicates) {
    console.log(`  = [${pad(r.cvNo, 2).toUpperCase()}] ${r.name}`)
  }
  console.log('')
  console.log(
    `النتيجة: استُورد ${result.imported.length} | مكرر ${result.duplicates.length} | داخلي ${internal.length}`
  )

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('فشل الترحيل:', err)
  await prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})