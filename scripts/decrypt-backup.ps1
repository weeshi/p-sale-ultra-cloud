# =====================================================================
# P-Sale Ultra Cloud — فك تشفير نسخة احتياطية (.sql.gz.enc → .sql.gz)
# - يقرأ كلمة المرور من scripts/backup-encryption.env (BACKUP_PASSPHRASE)
# - الاستخدام:
#   powershell -ExecutionPolicy Bypass -File scripts\decrypt-backup.ps1 -File <path.enc>
#   powershell -ExecutionPolicy Bypass -File scripts\decrypt-backup.ps1 -File <path.enc> -OutDir <dir>
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$OutDir
)
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $File)) { Write-Error "الملف غير موجود: $File"; exit 1 }
if (-not $File.EndsWith('.enc')) { Write-Warning "الملف لا ينتهي بـ .enc — قد لا يكون نسخة مشفرة: $File" }

$Pass = $null
$EncEnvFile = Join-Path $Root 'scripts\backup-encryption.env'
if (Test-Path $EncEnvFile) {
  Get-Content $EncEnvFile | ForEach-Object {
    if ($_ -match '^\s*BACKUP_PASSPHRASE=(.*)$') { $Pass = $Matches[1].Trim('"').Trim("'") }
  }
}
if (-not $Pass) {
  Write-Host "لم يُعثر على BACKUP_PASSPHRASE في $EncEnvFile" -ForegroundColor Red
  Write-Host 'انقل backup-encryption.env.example إلى backup-encryption.env واملأ كلمة المرور نفسها المستخدمة في التشفير.'
  exit 1
}

$openssl = (Get-Command 'openssl' -ErrorAction SilentlyContinue).Source
if (-not $openssl) {
  foreach ($p in @('C:\Program Files\Git\usr\bin\openssl.exe', 'C:\Program Files\OpenSSL-Win64\bin\openssl.exe')) {
    if (Test-Path $p) { $openssl = $p; break }
  }
}
if (-not $openssl) { Write-Error 'openssl غير موجود (ثبّت Git for Windows أو OpenSSL)'; exit 1 }

$base = [IO.Path]::GetFileName($File)
if ($base.EndsWith('.enc')) { $base = $base.Substring(0, $base.Length - 4) }
if (-not $base.EndsWith('.sql.gz')) { $base = "$base.sql.gz" }
if ($OutDir) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null } else { $OutDir = Split-Path -Parent $File }
$OutFile = Join-Path $OutDir $base

Write-Host "فك تشفير: $File"
Write-Host "إلى:      $OutFile"
& $openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass pass:$Pass -in $File -out $OutFile 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "فشل فك التشفير (كلمة مرور خاطئة أو ملف تالف؟)"; Remove-Item $OutFile -Force -ErrorAction SilentlyContinue; exit 1 }

$size = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
Write-Host "تم فك التشفير بنجاح: $OutFile (${size} MB)" -ForegroundColor Green
Write-Host 'الاستعادة بعد ذلك: powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -BackupFile <path.sql.gz>'