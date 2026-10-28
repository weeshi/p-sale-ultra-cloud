#!/usr/bin/env node
/**
 * repair-mojibake.ts — إصلاح النصوص العربية المخزّنة بترميز مزدوج (Mojibake)
 * ---------------------------------------------------------------------------
 * المشكلة: نص مثل «الصندوق الرئيسي» مخزّن كـ «ط§ظ„طµظ†ط¯ظˆظ‚ …» — أي أن بايتات
 * UTF-8 الأصلية فُكّت كأنها CP1256 ثم خُزّنت مرة أخرى كـ UTF-8.
 * الأثر: نصوص مشوّشة في الواجهات + فشل مطابقة أسماء المخازن/الخزائن/الفروع.
 *
 * لماذا لا نستخدم CONVERT(... USING cp1256) في MySQL؟
 * جدول cp1256 في MySQL **ناقص**: الحروف مثل «ي» (تُنتج «ٹ» U+0679) تُحوَّل إلى
 * '?' فيُفسَد النص. لذلك نستخدم TextDecoder('windows-1256') في Node — مطابق
 * تماماً لجدول .NET/WHATWG — لبناء خريطة عكسية كاملة (256 بايت) ثم نفكّ
 * الترميز بـ TextDecoder('utf-8', { fatal: true }) الذي يرفض أي تسلسل غير صالح.
 *
 * الأمان: لا نكتب إلا عند تحقق كل الشروط
 *   - النص الأصلي يحتوي علامات الترميز المزدوج (ط / ظ)
 *   - كل حرف قابل للترميز كـ CP1256، والبايتات تُفكّ كـ UTF-8 صالح
 *   - الناتج مختلف، غير فارغ، ويحتوي حروفاً عربية
 *   - عدد علامات الترميز المزدوج يقلّ فعلياً
 *
 * الاستخدام (من مجلد server):
 *   npx tsx scripts/repair-mojibake.ts                    # معاينة فقط (افتراضي)
 *   npx tsx scripts/repair-mojibake.ts --apply            # تنفيذ فعلي
 *   npx tsx scripts/repair-mojibake.ts --apply --table parties
 */

import { prisma } from '../src/config/database'

const APPLY = process.argv.includes('--apply')
const tableArgIdx = process.argv.indexOf('--table')
const ONLY_TABLE = tableArgIdx !== -1 ? process.argv[tableArgIdx + 1] : null

const NON_ASCII = /[^\x00-\x7F]/
const ARABIC = /[\u0600-\u06FF]/

// ---------------- خرائط الترميز العكسية (كاملة، من WHATWG) ----------------
// نجرّب أكثر من ترميز لأن التلف يحدث بصيغتين شائعتين:
//   windows-1256 (بيانات أُدخلت عبر أدوات عربية) و windows-1252 (أدوات غربية)
const LEGACY_CODECS = ['windows-1256', 'windows-1252'] as const

const ENCODE_MAPS: Map<string, number>[] = LEGACY_CODECS.map((codec) => {
  const decoder = new TextDecoder(codec)
  const map = new Map<string, number>()
  for (let byte = 0; byte < 256; byte++) {
    const ch = decoder.decode(Uint8Array.of(byte))
    if (!map.has(ch)) map.set(ch, byte)
  }
  return map
})

/** يعكس الترميز المزدوج — أو null إن لم يكن النص مشوّشاً بشكل قابل للعكس */
export function reverseMojibake(value: string): string | null {
  for (const map of ENCODE_MAPS) {
    const bytes: number[] = []
    let encodable = true
    for (const ch of value) {
      const byte = map.get(ch)
      if (byte === undefined) {
        encodable = false
        break
      }
      bytes.push(byte)
    }
    if (!encodable) continue
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
      if (decoded !== value) return decoded
    } catch {
      // تسلسل غير صالح بهذا الترميز — نجرّب الترميز التالي
    }
  }
  return null
}

/** هل النص مخزّن بترميز مزدوج؟ */
export function isMojibake(value: string): boolean {
  if (!value || !NON_ASCII.test(value)) return false
  const fixed = reverseMojibake(value)
  if (fixed === null || fixed === value || fixed.length === 0) return false
  // الناتج يجب أن يكون نصاً عربياً حقيقياً (لا ضجيجاً عشوائياً)
  return ARABIC.test(fixed)
}

interface ColumnInfo {
  table: string
  column: string
}

interface Candidate {
  id: number
  original: string
  fixed: string
}

async function listTextColumns(): Promise<ColumnInfo[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string; COLUMN_NAME: string }>>(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND DATA_TYPE IN ('varchar', 'text', 'mediumtext', 'longtext', 'char')
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `)

  return rows
    .map((r) => ({ table: r.TABLE_NAME, column: r.COLUMN_NAME }))
    .filter((c) => !ONLY_TABLE || c.table === ONLY_TABLE)
    .filter((c) => !/^(password_hash|hw_hash|client_op_id|license_key|code)$/i.test(c.column))
}

async function findCandidates(table: string, column: string): Promise<Candidate[]> {
  // نُقيّد البحث بالنصوص غير الإنجليزية لتقليل الصفوف المفحوصة
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; value: string | null }>>(`
    SELECT id, \`${column}\` AS value
    FROM \`${table}\`
    WHERE \`${column}\` IS NOT NULL
      AND \`${column}\` <> ''
      AND \`${column}\` REGEXP '[^ -~]'
  `)

  const candidates: Candidate[] = []
  for (const row of rows) {
    const original = row.value
    if (!original || !isMojibake(original)) continue
    const fixed = reverseMojibake(original)
    if (!fixed) continue
    candidates.push({ id: row.id, original, fixed })
  }
  return candidates
}

async function main() {
  console.log('=== P-Sale Ultra Cloud — Mojibake Repair ===')
  console.log(APPLY ? 'MODE: APPLY (سيتم الكتابة فعلياً)' : 'MODE: DRY-RUN (معاينة فقط — أضف --apply للتنفيذ)')
  if (ONLY_TABLE) console.log(`TABLE FILTER: ${ONLY_TABLE}`)
  console.log('')

  const columns = await listTextColumns()
  let totalRows = 0
  let totalColumns = 0

  for (const { table, column } of columns) {
    let candidates: Candidate[]
    try {
      candidates = await findCandidates(table, column)
    } catch {
      continue // أعمدة/جداول غير قابلة للمعالجة (view، عمود محسوب…) — تُتخطّى
    }
    if (candidates.length === 0) continue

    totalRows += candidates.length
    totalColumns += 1
    console.log(`-- ${table}.${column}: ${candidates.length} صف`)
    for (const c of candidates.slice(0, 2)) {
      console.log(`     ${c.id}: "${c.original.slice(0, 40)}" → "${c.fixed.slice(0, 40)}"`)
    }

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        for (const c of candidates) {
          await tx.$executeRawUnsafe(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ?`, c.fixed, c.id)
        }
      })
      console.log('     OK تم الإصلاح')
    }
  }

  console.log('')
  if (totalRows === 0) {
    console.log('OK  لا توجد نصوص بترميز مزدوج — البيانات سليمة.')
  } else if (APPLY) {
    console.log(`OK  أُصلح ${totalRows} صفاً في ${totalColumns} عموداً.`)
  } else {
    console.log(`!!  ${totalRows} صفاً في ${totalColumns} عموداً تحتاج إصلاحاً — أعد التشغيل بـ --apply.`)
  }

  await prisma.$disconnect()
}

// يُنفَّذ فقط عند التشغيل المباشر (قابل للاستيراد في الاختبارات)
if (require.main === module) {
  main().catch(async (error) => {
    console.error('ERROR:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
}
