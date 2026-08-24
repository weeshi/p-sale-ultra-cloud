# =====================================================================
# P-Sale Ultra Cloud — Restore MySQL backup (PowerShell / Windows)
# الاستخدام: powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -BackupFile <path.sql.gz> [-DbName psale_ultra]
# تنبيه: يستبدل قاعدة البيانات المستهدفة بالكامل!
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$DbName = ''
)
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$DbUser = 'root'; $DbPass = ''; $DbHost = 'localhost'; $DbPort = '3306'
$envFile = Join-Path $Root 'server\.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^DATABASE_URL="?mysql(2)?://([^:@]+)(?::([^@]+))?@([^:/]+)(?::(\d+))?/([^?"]+)') {
      if (-not $DbName) { $DbName = $Matches[6] }
      $DbUser = $Matches[2]
      $DbPass = if ($Matches[3]) { $Matches[3] } else { '' }
      $DbHost = $Matches[4]
      $DbPort = if ($Matches[5]) { $Matches[5] } else { '3306' }
    }
  }
}
if (-not $DbName) { $DbName = 'psale_ultra' }

$mysqlPath = (Get-Command 'mysql' -ErrorAction SilentlyContinue).Source
if (-not $mysqlPath) {
  $cands = @('C:\xampp\mysql\bin\mysql.exe') + @(Get-ChildItem -Path @('C:\wamp64\bin\mysql\*\bin\mysql.exe', 'C:\laragon\bin\mysql\*\bin\mysql.exe', 'C:\Program Files\MariaDB*\bin\mysql.exe', 'C:\Program Files\MySQL\*\bin\mysql.exe') -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $mysqlPath = $cands | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $mysqlPath) { Write-Error 'mysql غير موجود — أضف مسار XAMPP/bin (C:\xampp\mysql\bin) إلى PATH'; exit 1 }
}
if (-not (Test-Path $BackupFile)) { Write-Error "الملف غير موجود: $BackupFile"; exit 1 }

Write-Host "استعادة $BackupFile إلى $DbName@$DbHost`:$DbPort ..."
$env:MYSQL_PWD = $DbPass
if ($BackupFile -like '*.gz') {
  $stream = [IO.File]::OpenRead((Resolve-Path $BackupFile))
  $gzip = [IO.Compression.GzipStream]::new($stream, [IO.Compression.CompressionMode]::Decompress)
  $reader = [IO.StreamReader]::new($gzip)
  $sql = $reader.ReadToEnd()
  $reader.Dispose(); $gzip.Dispose(); $stream.Dispose()
} else {
  $sql = Get-Content -LiteralPath (Resolve-Path $BackupFile) -Raw
}
$sql | & $mysqlPath -h $DbHost -P $DbPort -u $DbUser $DbName
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host 'تمت الاستعادة بنجاح'
