# =====================================================================
# P-Sale Ultra Cloud — MySQL Backup (PowerShell / Windows local dev)
# - يقرأ server/.env ويستخرج DATABASE_URL
# - ينشئ نسخة mysqldump مضغوطة (gzip) في backups\
# - يستبقي آخر BACKUP_KEEP_DAYS (افتراضي 7) يوماً
# الاستخدام: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
# =====================================================================
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $Root 'backups' }
$KeepDays = if ($env:BACKUP_KEEP_DAYS) { [int]$env:BACKUP_KEEP_DAYS } else { 7 }
$LogFile = Join-Path $BackupDir 'backup.log'
$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'

function Log([string]$Msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Msg"
  Write-Host $line
  [IO.File]::AppendAllText($LogFile, $line + "`r`n", (New-Object System.Text.UTF8Encoding $true))
}

New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

# قراءة DATABASE_URL من server\.env
$envFile = Join-Path $Root 'server\.env'
$DbUser = 'root'; $DbPass = ''; $DbHost = 'localhost'; $DbPort = '3306'; $DbName = 'psale_ultra'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^DATABASE_URL="?mysql(2)?://([^:@]+)(?::([^@]+))?@([^:/]+)(?::(\d+))?/([^?"]+)') {
      $DbUser = $Matches[2]
      $DbPass = if ($Matches[3]) { $Matches[3] } else { '' }
      $DbHost = $Matches[4]
      $DbPort = if ($Matches[5]) { $Matches[5] } else { '3306' }
      $DbName = $Matches[6]
    }
  }
}

$mysqldumpPath = (Get-Command 'mysqldump' -ErrorAction SilentlyContinue).Source
if (-not $mysqldumpPath) {
  $cands = @('C:\xampp\mysql\bin\mysqldump.exe') + @(Get-ChildItem -Path @('C:\wamp64\bin\mysql\*\bin\mysqldump.exe', 'C:\laragon\bin\mysql\*\bin\mysqldump.exe', 'C:\Program Files\MariaDB*\bin\mysqldump.exe', 'C:\Program Files\MySQL\*\bin\mysqldump.exe') -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $mysqldumpPath = $cands | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $mysqldumpPath) {
    Log 'mysqldump غير موجود — أضف مسار XAMPP/bin (C:\xampp\mysql\bin) إلى PATH'
    exit 1
  }
}

$Out = Join-Path $BackupDir "psale_${DbName}_${Stamp}.sql.gz"
Log "بدء النسخ الاحتياطي لقاعدة $DbName@$DbHost`:$DbPort"

$env:MYSQL_PWD = $DbPass
$dump = & $mysqldumpPath -h $DbHost -P $DbPort -u $DbUser --single-transaction --routines --triggers --default-character-set=utf8mb4 $DbName 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  Log "فشل النسخ الاحتياطي: $dump"
  Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
  exit 1
}
[IO.Compression.GzipStream]::new(
  [IO.File]::Create($Out),
  [IO.Compression.CompressionLevel]::Optimal
) | ForEach-Object {
  $bytes = [Text.Encoding]::UTF8.GetBytes($dump)
  $_.Write($bytes, 0, $bytes.Length)
  $_.Dispose()
}
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

$size = [math]::Round((Get-Item $Out).Length / 1MB, 2)
Log "تم إنشاء: $Out (${size} MB)"

# استبقاء آخر KeepDays فقط
Get-ChildItem $BackupDir -Filter 'psale_*.sql.gz' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | ForEach-Object {
  Log "حذف قديم: $($_.FullName)"
  Remove-Item $_.FullName -Force
}

Log 'اكتمل النسخ الاحتياطي بنجاح'
