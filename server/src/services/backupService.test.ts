import { execFile } from 'child_process'
import fs from 'fs'
// load createBackup after setting process.platform in each test
let createBackup: typeof import('./backupService').createBackup

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}))
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
}))

const mockExecFile = execFile as unknown as jest.Mock
const mockFs = fs as jest.Mocked<typeof fs>

const REAL_PLATFORM = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p })
}

afterEach(() => {
  setPlatform(REAL_PLATFORM)
})

describe('BackupService.createBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // execFile promisified → يستدعي (file, args, options, cb)
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void
      cb(null)
    })
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue([
      'psale_psale_ultra_20260812_100000.sql.gz',
      'psale_psale_ultra_20260812_110000.sql.gz',
    ] as never)
    // أقدم mtime أكبر للملف الأحدث (من الطابع الزمني في الاسم)
    mockFs.statSync.mockImplementation((p: unknown) => {
      const name = String(p).split(/[\\\/]/).pop() || ''
      const ts = parseInt(name.replace(/\D/g, '') || '0', 10)
      return { mtimeMs: ts, size: 1024 } as never
    })
  })

  it('على Windows يشغّل PowerShell مع ExecutionPolicy Bypass من جذر المشروع', async () => {
    setPlatform('win32')
    jest.resetModules()
    // require after resetting modules so platform-dependent init runs for win32
    createBackup = require('./backupService').createBackup
    const result = await createBackup()

    expect(mockExecFile).toHaveBeenCalledWith(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', expect.stringContaining('scripts\\backup.ps1')],
      expect.objectContaining({ cwd: expect.stringMatching(/p-sale-ultra-cloud$/) }),
      expect.any(Function)
    )
    expect(result.filename).toBe('psale_psale_ultra_20260812_110000.sql.gz')
  })

  it('على Linux يشغّل bash script', async () => {
    setPlatform('linux')
    jest.resetModules()
    createBackup = require('./backupService').createBackup
    await createBackup()
    expect(mockExecFile).toHaveBeenCalledWith(
      'bash',
      [expect.stringContaining('backup.sh')],
      expect.objectContaining({ cwd: expect.stringMatching(/p-sale-ultra-cloud$/) }),
      expect.any(Function)
    )
  })

  it('يرفع خطأً عندما يفشل السكربت', async () => {
    setPlatform('win32')
    jest.resetModules()
    createBackup = require('./backupService').createBackup
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void
      cb(new Error('mysqldump not found'))
    })
    await expect(createBackup()).rejects.toThrow('فشل إنشاء النسخة الاحتياطية')
  })

  it('يرفع خطأً عند غياب ملفات النسخ رغم نجاح السكربت', async () => {
    setPlatform('win32')
    jest.resetModules()
    createBackup = require('./backupService').createBackup
    mockFs.readdirSync.mockReturnValue([] as never)
    await expect(createBackup()).rejects.toThrow('لم يُعثر على ملف النسخة')
  })

  it('يرجع أحدث ملف من حيث وقت التعديل', async () => {
    setPlatform('win32')
    jest.resetModules()
    createBackup = require('./backupService').createBackup
    mockFs.statSync.mockImplementation((p: unknown) =>
      (p as string).includes('100000') ? ({ mtimeMs: 1, size: 10 } as never) : ({ mtimeMs: 5, size: 20 } as never)
    )
    const result = await createBackup()
    expect(result.filename).toBe('psale_psale_ultra_20260812_110000.sql.gz')
    expect(result.sizeBytes).toBe(20)
  })
})
