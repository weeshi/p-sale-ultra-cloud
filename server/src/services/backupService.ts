import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execFileAsync = promisify(execFile)

// جذر المشروع (server/src/services → ../../../)
const PROJECT_ROOT = path.resolve(__dirname, '../../../')

export interface BackupResult {
  filename: string
  path: string
  sizeBytes: number
}

// تشغيل سكربت النسخ الاحتياطي (حسب المنصة) ثم إرجاع أحدث ملف backup_*.sql.gz
export async function createBackup(): Promise<BackupResult> {
  const isWin = process.platform === 'win32'
  // `path` الافتراضي في Node مُجمّع حسب نظام التشغيل (لا يتأثر بتجاوز process.platform)،
  // لذا نختار المكوّن win32/posix صراحةً لحساب المسارات حسب المنصة الفعلية في زمن التنفيذ
  const pp = isWin ? path.win32 : path.posix
  const scriptsDir = pp.join(PROJECT_ROOT, 'scripts')
  const backupDir = pp.join(PROJECT_ROOT, 'backups')
  const script = pp.join(scriptsDir, isWin ? 'backup.ps1' : 'backup.sh')

  if (!fs.existsSync(script)) {
    throw new Error(`سكربت النسخ الاحتياطي غير موجود: ${script}`)
  }

  try {
    if (isWin) {
      await execFileAsync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
        { cwd: PROJECT_ROOT, windowsHide: true, timeout: 5 * 60 * 1000 }
      )
    } else {
      await execFileAsync('bash', [script], {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        timeout: 5 * 60 * 1000,
      })
    }
  } catch (error: any) {
    const detail = error?.message || String(error)
    throw new Error(`فشل إنشاء النسخة الاحتياطية: ${detail}`)
  }

  const candidates = fs.existsSync(backupDir)
    ? fs.readdirSync(backupDir).filter((f) => f.endsWith('.sql.gz'))
    : []

  if (candidates.length === 0) {
    throw new Error('اكتمل تشغيل النسخ الاحتياطي لكن لم يُعثر على ملف النسخة (backup_*.sql.gz)')
  }

  const latest = candidates
    .map((f) => ({ f, time: fs.statSync(pp.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)[0]

  return {
    filename: latest.f,
    path: pp.join(backupDir, latest.f),
    sizeBytes: fs.statSync(pp.join(backupDir, latest.f)).size,
  }
}
