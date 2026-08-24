# =====================================================================
# P-Sale Ultra Cloud — مساعد الاستعادة (Restore Assistant)
# - يعرض النسخ الاحتياطية المتاحة للاختيار
# - يفحص سلامة النسخة (gzip + وجود جداول) قبل أي مسح
# - ينشئ نسخة أمان تلقائية للقاعدة الحالية قبل الاستعادة
# - يستعيد (عبر scripts\restore.ps1) إلى قاعدة الهدف (افتراضي: قاعدة التطبيق)
# - يتحقق من البيانات المستعادة ويحسبها
# - يطلب إيقاف التطبيق قبل الاستعادة على القاعدة الحية ثم يعرض إعادة تشغيله
#
# الاستخدام:
#   تفاعلي (قائمة اختيار):  powershell -File restore-manager.ps1
#   مباشر:                  powershell -File restore-manager.ps1 -BackupFile <ملف.sql.gz> [-DbName <قاعدة>] [-Force]
# =====================================================================
param(
  [string]$BackupFile = '',
  [string]$DbName = '',
  [switch]$Force,
  [int]$AppPort = 3005
)
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $Root 'backups'
$ServerDir = Join-Path $Root 'server'

# ---------- أدوات مساعدة ----------
function Get-DbConfig {
  $cfg = @{ user = 'root'; pass = ''; host = 'localhost'; port = 3306; db = 'psale_ultra' }
  $envFile = Join-Path $Root 'server\.env'
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^DATABASE_URL="?mysql(2)?://([^:@]+)(?::([^@]+))?@([^:/]+)(?::(\d+))?/([^?"]+)') {
        $cfg.user = $Matches[2]
        $cfg.pass = if ($Matches[3]) { $Matches[3] } else { '' }
        $cfg.host = $Matches[4]
        $cfg.port = if ($Matches[5]) { $Matches[5] } else { '3306' }
        $cfg.db = $Matches[6]
      }
    }
  }
  return $cfg
}

function Get-MysqlPath {
  $p = (Get-Command 'mysql' -ErrorAction SilentlyContinue).Source
  if ($p) { return $p }
  $cands = @('C:\xampp\mysql\bin\mysql.exe') + @(Get-ChildItem -Path @('C:\wamp64\bin\mysql\*\bin\mysql.exe', 'C:\laragon\bin\mysql\*\bin\mysql.exe', 'C:\Program Files\MariaDB*\bin\mysql.exe', 'C:\Program Files\MySQL\*\bin\mysql.exe') -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $p = $cands | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $p) { Write-Host 'mysql غير موجود — أضف مسار XAMPP/bin إلى PATH' -ForegroundColor Red; exit 1 }
  return $p
}

function Select-Backup {
  $cands = @(Get-ChildItem $BackupDir -Filter 'psale_*.sql.gz' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  if ($cands.Count -eq 0) { Write-Host "لا توجد نسخ احتياطية في: $BackupDir" -ForegroundColor Red; exit 1 }
  Write-Host ''
  Write-Host 'النسخ الاحتياطية المتاحة:' -ForegroundColor Cyan
  for ($i = 0; $i -lt $cands.Count; $i++) {
    $sizeMB = [math]::Round($cands[$i].Length / 1MB, 2)
    Write-Host ("  [{0}]  {1}  ({2} MB)  {3}" -f ($i + 1), $cands[$i].Name, $sizeMB, $cands[$i].LastWriteTime)
  }
  Write-Host ''
  $choice = Read-Host 'اختر رقم النسخة (Enter = الأحدث)'
  $idx = 0
  if ($choice -ne '') {
    if (-not [int]::TryParse($choice, [ref]$idx) -or $idx -lt 1 -or $idx -gt $cands.Count) {
      Write-Host 'اختيار غير صحيح — أُلغيت' -ForegroundColor Red; exit 1
    }
    $idx--
  }
  return $cands[$idx].FullName
}

function Test-BackupIntegrity {
  param([string]$Path)
  Write-Host ''
  Write-Host 'فحص سلامة النسخة (gzip + وجود جداول)...' -ForegroundColor Cyan
  $content = $null
  try {
    $stream = [IO.File]::OpenRead($Path)
    $gzip = [IO.Compression.GzipStream]::new($stream, [IO.Compression.CompressionMode]::Decompress)
    $reader = [IO.StreamReader]::new($gzip)
    $content = $reader.ReadToEnd()
    $reader.Dispose(); $gzip.Dispose(); $stream.Dispose()
  } catch {
    Write-Host "ملف النسخة تالف (لا يُقرأ كـ gzip): $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
  if ($content -notmatch 'CREATE TABLE') {
    Write-Host 'النسخة لا تحتوي على جداول — أُلغيت العملية حفاظاً على البيانات' -ForegroundColor Red
    exit 1
  }
  Write-Host 'النسخة سليمة ✓' -ForegroundColor Green
  return $content
}

# ---------- البداية ----------
$cfg = Get-DbConfig
if (-not $DbName) { $DbName = $cfg.db }
$isLiveDb = ($DbName -eq $cfg.db)

Write-Host '==============================================' -ForegroundColor Yellow
Write-Host '  P-Sale Ultra Cloud — مساعد الاستعادة' -ForegroundColor Yellow
Write-Host '==============================================' -ForegroundColor Yellow

# 1) نسخة أمان تلقائية للقاعدة الحالية قبل أي تغيير
Write-Host ''
Write-Host '1) إنشاء نسخة أمان للقاعدة الحالية قبل أي تغيير...' -ForegroundColor Cyan
$backupScript = Join-Path $Root 'scripts\backup.ps1'
if (Test-Path $backupScript) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'فشل إنشاء نسخة الأمان — أُلغيت العملية' -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host 'تحذير: سكربت النسخ الاحتياطي غير موجود — أُكمل بلا نسخة أمان' -ForegroundColor Yellow
}

# 2) اختيار النسخة
if (-not $BackupFile) {
  $BackupFile = Select-Backup
} else {
  try { $BackupFile = (Resolve-Path -LiteralPath $BackupFile -ErrorAction Stop).Path } catch {
    Write-Host "الملف غير موجود: $BackupFile" -ForegroundColor Red; exit 1
  }
}

# 3) فحص السلامة
$null = Test-BackupIntegrity -Path $BackupFile

Write-Host ''
Write-Host ("الهدف: قاعدة '{0}'@{1}:{2}" -f $DbName, $cfg.host, $cfg.port) -ForegroundColor Yellow
Write-Host ("النسخة: {0}" -f (Split-Path $BackupFile -Leaf)) -ForegroundColor Yellow
Write-Host '⚠️  هذه العملية تستبدل محتويات القاعدة المستهدفة بالكامل!' -ForegroundColor Red

# 4) التأكيد (تُتجاوز مع -Force)
if (-not $Force) {
  $ans = Read-Host 'هل تريد المتابعة؟ (Y/N)'
  if ($ans -notmatch '^[Yy]') { Write-Host 'أُلغيت' -ForegroundColor Yellow; exit 1 }
}

# 5) إيقاف التطبيق عند الاستعادة على القاعدة الحية
if ($isLiveDb) {
  $listener = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    if ($Force) {
      Write-Host "التطبيق يعمل على المنفذ $AppPort — مع -Force لا يمكن إيقافه تلقائياً؛ أُلغيت حفاظاً على البيانات" -ForegroundColor Red
      exit 1
    }
    Write-Host ''
    Write-Host ("التطبيق يعمل حالياً على المنفذ {0} — الاستعادة على قاعدة حية تتطلب إيقافه." -f $AppPort) -ForegroundColor Red
    Write-Host 'أغلق نافذة الخادم (npm run dev) ثم اضغط Enter للمتابعة، أو اكتب A للإلغاء' -ForegroundColor Yellow
    $ans = Read-Host
    if ($ans -match '^[Aa]') { Write-Host 'أُلغيت' -ForegroundColor Yellow; exit 1 }
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 500
    }
    if (Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue) {
      Write-Host 'المنفذ ما زال مشغولاً — أُلغيت حفاظاً على البيانات' -ForegroundColor Red
      exit 1
    }
    Write-Host 'التطبيق متوقف ✓' -ForegroundColor Green
  }
}

# 6) تنفيذ الاستعادة
Write-Host ''
Write-Host '2) تنفيذ الاستعادة...' -ForegroundColor Cyan
$mysqlPath = Get-MysqlPath
$q = '`' + $DbName + '`'
& $mysqlPath -h $cfg.host -P $cfg.port -u $cfg.user -e ("CREATE DATABASE IF NOT EXISTS " + $q + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
if ($LASTEXITCODE -ne 0) { Write-Host 'فشل إنشاء/التحقق من قاعدة الهدف' -ForegroundColor Red; exit 1 }

$restoreScript = Join-Path $Root 'scripts\restore.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $restoreScript -BackupFile $BackupFile -DbName $DbName
if ($LASTEXITCODE -ne 0) { Write-Host 'فشلت الاستعادة' -ForegroundColor Red; exit 1 }

# 7) التحقق من البيانات المستعادة
Write-Host ''
Write-Host '3) التحقق من البيانات المستعادة...' -ForegroundColor Cyan
$env:MYSQL_PWD = $cfg.pass
$tables = (& $mysqlPath -h $cfg.host -P $cfg.port -u $cfg.user -N -e ("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" + $DbName + "'") 2>$null | Out-String).Trim()
$users = (& $mysqlPath -h $cfg.host -P $cfg.port -u $cfg.user -N -e ("SELECT COUNT(*) FROM " + $q + ".users;") 2>$null | Out-String).Trim()
$super = (& $mysqlPath -h $cfg.host -P $cfg.port -u $cfg.user -N -e ("SELECT COUNT(*) FROM " + $q + ".users WHERE is_super_admin=1;") 2>$null | Out-String).Trim()
$seq = (& $mysqlPath -h $cfg.host -P $cfg.port -u $cfg.user -N -e ("SELECT GROUP_CONCAT(prefix,'=',current_value) FROM " + $q + ".sequences;") 2>$null | Out-String).Trim()
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '============= نتيجة الاستعادة =============' -ForegroundColor Green
Write-Host ("  عدد الجداول: {0}" -f $tables)
Write-Host ("  عدد المستخدمين: {0}" -f $users)
Write-Host ("  السوبر أدمن: {0}" -f $super)
Write-Host ("  التسلسلات: {0}" -f $seq)
Write-Host '===========================================' -ForegroundColor Green

# 8) إعادة تشغيل التطبيق
if ($isLiveDb -and -not (Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue)) {
  $ans = Read-Host 'هل أعيد تشغيل التطبيق الآن؟ (Y/N)'
  if ($ans -match '^[Yy]') {
    Start-Process powershell -WorkingDirectory $ServerDir -ArgumentList '-NoProfile', '-Command', 'npm run dev'
    Write-Host 'تم إرسال أمر تشغيل الخادم ✓' -ForegroundColor Green
  }
}

Write-Host ''
Write-Host 'اكتملت الاستعادة بنجاح' -ForegroundColor Green
