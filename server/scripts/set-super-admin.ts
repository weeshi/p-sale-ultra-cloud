/**
 * أداة يدوية لمرة واحدة: تعيين أول مستخدم في كل شركة (أو شركة محددة) سوبر أدمن.
 *
 * الاستخدام (من مجلد server/):
 *   npx tsx scripts/set-super-admin.ts            # كل الشركات بلا سوبر أدمن
 *   npx tsx scripts/set-super-admin.ts 1          # شركة محددة بالمعرف
 */
import { prisma } from '../src/config/database'

async function main() {
  const companyIdArg = Number(process.argv[2])

  const companies = companyIdArg
    ? await prisma.company.findMany({ where: { id: companyIdArg } })
    : await prisma.company.findMany()

  if (companies.length === 0) {
    console.log('لا توجد شركات مطابقة.')
    return
  }

  let done = 0
  for (const company of companies) {
    const existingSuper = await prisma.user.findFirst({
      where: { companyId: company.id, isSuperAdmin: true },
    })
    if (existingSuper) {
      console.log(`- شركة ${company.id} (${company.name}): لديها سوبر أدمن مسبقاً (${existingSuper.username}) — تم التخطي`)
      continue
    }

    const firstUser = await prisma.user.findFirst({
      where: { companyId: company.id },
      orderBy: [{ id: 'asc' }],
    })
    if (!firstUser) {
      console.log(`- شركة ${company.id} (${company.name}): بلا مستخدمين — تم التخطي`)
      continue
    }

    await prisma.user.update({
      where: { id: firstUser.id },
      data: { isSuperAdmin: true, superAdminKey: company.id },
    })
    console.log(`✔ شركة ${company.id} (${company.name}): عُيّن ${firstUser.username} (id=${firstUser.id}) سوبر أدمن`)
    done += 1
  }

  console.log(done > 0 ? `\nتم تعيين ${done} سوبر أدمن بنجاح.` : '\nلا شيء يحتاج تعديل.')
}

main()
  .catch((e) => {
    console.error('فشل التنفيذ:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
