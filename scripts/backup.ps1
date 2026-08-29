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
Get-ChildItem $BackupDir -Filter 'psale_*.sql.gz.enc' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | ForEach-Object {
  Log "حذف قديم (مشفّر): $($_.FullName)"
  Remove-Item $_.FullName -Force
}

# =====================================================================
# التشفير + الرفع الخارجي (اختياري — يعمل عند وجود backup-encryption.env)
# =====================================================================
$EncEnvFile = Join-Path $Root 'scripts\backup-encryption.env'
$Pass = $null; $RcloneRemote = $null; $RcloneDir = 'p-sale-backups'; $RcloneKeepDays = 30
if (Test-Path $EncEnvFile) {
  Get-Content $EncEnvFile | ForEach-Object {
    if ($_ -match '^\s*BACKUP_PASSPHRASE=(.*)$') { $Pass = $Matches[1].Trim('"').Trim("'") }
    elseif ($_ -match '^\s*RCLONE_REMOTE=(.*)$') { $RcloneRemote = $Matches[1].Trim('"').Trim("'") }
    elseif ($_ -match '^\s*RCLONE_REMOTE_DIR=(.*)$') { $RcloneDir = $Matches[1].Trim('"').Trim("'") }
    elseif ($_ -match '^\s*RCLONE_KEEP_DAYS=(.*)$') { $v = $Matches[1].Trim(); if ($v -match '^\d+$') { $RcloneKeepDays = [int]$v } }
  }

  if ($Pass) {
    $openssl = (Get-Command 'openssl' -ErrorAction SilentlyContinue).Source
    if (-not $openssl) {
      foreach ($p in @('C:\Program Files\Git\usr\bin\openssl.exe', 'C:\Program Files\OpenSSL-Win64\bin\openssl.exe')) {
        if (Test-Path $p) { $openssl = $p; break }
      }
    }
    if (-not $openssl) {
      Log 'openssl غير موجود — لا يمكن تشفير النسخة (أضف Git for Windows أو OpenSSL)'
      exit 1
    }
    $EncOut = "$Out.enc"
    & $openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass pass:$Pass -in $Out -out $EncOut 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Log "فشل تشفير النسخة: $EncOut"; exit 1 }
    Log "تم التشفير: $EncOut"

    if ($RcloneRemote) {
      $rclone = (Get-Command 'rclone' -ErrorAction SilentlyContinue).Source
      if (-not $rclone) {
        foreach ($p in @('C:\Program Files\rclone\rclone.exe', (Join-Path $env:USERPROFILE 'rclone\rclone.exe'))) {
          if (Test-Path $p) { $rclone = $p; break }
        }
      }
      if (-not $rclone) {
        Log 'rclone غير موجود — لن تُرفع النسخة المشفرة (ثبّت rclone أو أنشئ remote)'
      } else {
        $rclog = Join-Path $BackupDir 'rclone.log'
        $remotes = (& $rclone listremotes --log-file $rclog | Out-String).Trim()
        $target = "$RcloneRemote`:$RcloneDir"
        if ($remotes -notmatch [regex]::Escape("$RcloneRemote`:")) {
          Log "remote '$RcloneRemote' غير موجود في rclone — لن تُرفع النسخة (أنشئه بـ: rclone config)"
        } else {
          & $rclone copy $EncOut $target --log-file $rclog --log-level ERROR | Out-Null
          if ($LASTEXITCODE -ne 0) { Log "فشل رفع النسخة المشفرة إلى $target"; exit 1 }
          Log "تم رفع النسخة المشفرة إلى $target"

          # استبقاء آخر RcloneKeepDays على الـ remote
          $remoteFiles = (& $rclone lsf $target --files-only --include 'psale_*.sql.gz.enc' --log-file $rclog | Out-String) -split "`r?`n"
          foreach ($f in $remoteFiles) {
            if ($f -match 'psale_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.sql\.gz\.enc') {
              try {
                $ts = Get-Date -Year ([int]$Matches[1]) -Month ([int]$Matches[2]) -Day ([int]$Matches[3]) -Hour ([int]$Matches[4]) -Minute ([int]$Matches[5]) -Second ([int]$Matches[6])
                if ($ts -lt (Get-Date).AddDays(-$RcloneKeepDays)) {
                  Log "حذف قديم عن الـ Remote: $f"
                  & $rclone deletefile "$target/$f" --log-file $rclog --log-level ERROR | Out-Null
                }
              } catch { Log "تخطي ملف remote غير صالح التاريخ: $f" }
            }
          }
        }
      }
    } else {
      Log 'RCLONE_REMOTE غير معرّف — تم التشفير محلياً دون رفع'
    }
  } else {
    Log 'BACKUP_PASSPHRASE فارغ — سيُحفظ النسخ الاحتياطي دون تشفير'
  }
} else {
  Log 'لا يوجد scripts\backup-encryption.env — دون تشفير. انسخ backup-encryption.env.example وفعّل التشفير والرفع الخارجي'
}

Log 'اكتمل النسخ الاحتياطي بنجاح'
