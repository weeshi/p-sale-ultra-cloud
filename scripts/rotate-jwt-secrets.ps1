<# 
.SYNOPSIS
    Rotate JWT secrets in server/.env safely with audit trail.
.DESCRIPTION
    Generates new strong keys (64 bytes base64), backs up current .env,
    updates the values, and logs the action to both the database (audit_logs)
    and a local log file. Run as Administrator or file owner.
    Recommended every 90 days or immediately if leak suspected.
.PARAMETER Force
    Skip confirmation prompt.
.PARAMETER Restart
    Restart PM2 server after rotation. Shows production warning.
.NOTES
    Output: server/.env (backed up to server/.env.bak.<timestamp>)
    After rotation WITHOUT -Restart: manually run "pm2 restart psale-server"
    After rotation WITH -Restart: server restarts automatically (warning shown).
#>

param(
    [string]$EnvPath = "C:\Users\Weeshi\p-sale-ultra-cloud\server\.env",
    [string]$ProjectRoot = "C:\Users\Weeshi\p-sale-ultra-cloud",
    [switch]$Force,
    [switch]$Restart
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProjectRoot "scripts\logs\jwt-rotation.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# ============================================================
# Local log helper
# ============================================================
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[$Timestamp] [$Level] $Message"
    $logDir = Split-Path $LogFile -Parent
    if (-not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    switch ($Level) {
        "ERROR" { Write-Host $line -ForegroundColor Red }
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        default { Write-Host $line }
    }
}

# ============================================================
# 1. Validate .env exists
# ============================================================
if (-not (Test-Path -LiteralPath $EnvPath)) {
    Write-Log "File not found: $EnvPath" "ERROR"
    exit 1
}

# ============================================================
# 2. Check write permissions
# ============================================================
$acl = Get-Acl -LiteralPath $EnvPath
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$hasWrite = $acl.Access | Where-Object {
    $_.IdentityReference.Value -eq $currentUser -and
    $_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Write
}
if (-not $hasWrite) {
    Write-Log "No write permission on $EnvPath. Run as Administrator or file owner." "ERROR"
    exit 1
}

# ============================================================
# 3. Read current secrets (for audit old_values)
# ============================================================
$envContent = Get-Content -LiteralPath $EnvPath -Raw
$oldJwtMatch = [regex]::Match($envContent, '(?m)^JWT_SECRET=(.+)$')
$oldRefreshMatch = [regex]::Match($envContent, '(?m)^JWT_REFRESH_SECRET=(.+)$')
$oldJwtValue = if ($oldJwtMatch.Success) { $oldJwtMatch.Groups[1].Value.Trim('"') } else { "NOT_SET" }
$oldRefreshValue = if ($oldRefreshMatch.Success) { $oldRefreshMatch.Groups[1].Value.Trim('"') } else { "NOT_SET" }
$oldJwtMasked = if ($oldJwtValue.Length -gt 8) { $oldJwtValue.Substring(0, 4) + "****" + $oldJwtValue.Substring($oldJwtValue.Length - 4) } else { "****" }
$oldRefreshMasked = if ($oldRefreshValue.Length -gt 8) { $oldRefreshValue.Substring(0, 4) + "****" + $oldRefreshValue.Substring($oldRefreshValue.Length - 4) } else { "****" }

# ============================================================
# 4. Generate new keys (64 bytes = 512-bit, base64)
# ============================================================
$bytes1 = [byte[]]::new(64)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes1)
$newJwtSecret = [Convert]::ToBase64String($bytes1)

$bytes2 = [byte[]]::new(64)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes2)
$newRefreshSecret = [Convert]::ToBase64String($bytes2)

$newJwtMasked = $newJwtSecret.Substring(0, 4) + "****" + $newJwtSecret.Substring($newJwtSecret.Length - 4)
$newRefreshMasked = $newRefreshSecret.Substring(0, 4) + "****" + $newRefreshSecret.Substring($newRefreshSecret.Length - 4)

# ============================================================
# 5. Backup current .env
# ============================================================
$backupTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$EnvPath.bak.$backupTimestamp"
Copy-Item -LiteralPath $EnvPath -Destination $backupPath -Force
Write-Log "Backup created: $backupPath"

# ============================================================
# 6. Update .env with new secrets
# ============================================================
$envContent = $envContent -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=`"$newJwtSecret`""
$envContent = $envContent -replace '(?m)^JWT_REFRESH_SECRET=.*$', "JWT_REFRESH_SECRET=`"$newRefreshSecret`""
Set-Content -LiteralPath $EnvPath -Value $envContent -Encoding UTF8
Write-Log "JWT secrets updated in $EnvPath"

# ============================================================
# 7. Parse DATABASE_URL from .env (same pattern as backup.ps1)
# ============================================================
$DbUser = 'root'; $DbPass = ''; $DbHost = 'localhost'; $DbPort = '3306'; $DbName = 'psale_ultra'
$envFile = Join-Path $ProjectRoot 'server\.env'
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

# ============================================================
# 8. Find mysql CLI (same search as backup.ps1 for mysqldump)
# ============================================================
$mysqlPath = (Get-Command 'mysql' -ErrorAction SilentlyContinue).Source
if (-not $mysqlPath) {
    $cands = @(
        'C:\xampp\mysql\bin\mysql.exe',
        'C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe'
    ) + @(
        Get-ChildItem -Path @(
            'C:\wamp64\bin\mysql\*\bin\mysql.exe',
            'C:\laragon\bin\mysql\*\bin\mysql.exe',
            'C:\Program Files\MariaDB*\bin\mysql.exe',
            'C:\Program Files\MySQL\*\bin\mysql.exe'
        ) -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    )
    $mysqlPath = $cands | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

# ============================================================
# 9. Insert audit log into database
# ============================================================
$auditSuccess = $false
if ($mysqlPath) {
    try {
        $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } | Select-Object -First 1).IPAddress
        if (-not $ipAddress) { $ipAddress = "127.0.0.1" }

        $q = [char]34
        $oldValuesJson = "$($q)jwt_secret$($q):$($q)$oldJwtMasked$($q),$($q)refresh_secret$($q):$($q)$oldRefreshMasked$($q)"
        $newValuesJson = "$($q)jwt_secret$($q):$($q)$newJwtMasked$($q),$($q)refresh_secret$($q):$($q)$newRefreshMasked$($q)"

        $sql = @"
INSERT INTO audit_logs (company_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, created_at)
VALUES (1, NULL, 'ROTATE_JWT', 'jwt_secrets', NULL, '$oldValuesJson', '$newValuesJson', '$ipAddress', NOW());
"@

        $env:MYSQL_PWD = $DbPass
        $result = & $mysqlPath -h $DbHost -P $DbPort -u $DbUser $DbName -e $sql 2>&1
        Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

        if ($LASTEXITCODE -eq 0) {
            $auditSuccess = $true
            Write-Log "Audit record inserted into audit_logs (action=ROTATE_JWT)"
        } else {
            Write-Log "MySQL insert failed: $result" "WARN"
        }
    } catch {
        Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
        Write-Log "DB audit failed: $($_.Exception.Message)" "WARN"
    }
} else {
    Write-Log "mysql CLI not found in PATH or common locations. Skipping DB audit." "WARN"
}

# ============================================================
# 10. Summary
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  JWT Secrets Rotation Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backup:      $backupPath"
Write-Host "DB Audit:    $(if ($auditSuccess) { 'Recorded in audit_logs' } else { 'Skipped (see warnings above)' })"
Write-Host "Local Log:   $LogFile"
Write-Host ""
Write-Host "New values (saved to .env):" -ForegroundColor Cyan
Write-Host "  JWT_SECRET:         $newJwtMasked"
Write-Host "  JWT_REFRESH_SECRET: $newRefreshMasked"
Write-Host ""

if ($Restart) {
    Write-Host "WARNING: Auto-restart enabled!" -ForegroundColor Yellow
    Write-Host "  In production, coordinate with your team before restarting." -ForegroundColor Yellow
    Write-Host ""
    pm2 restart psale-server 2>&1 | Out-Null
    Write-Log "Server restarted via pm2 restart psale-server (auto-restart enabled)"
    Write-Host "Server restarted." -ForegroundColor Green
} else {
    Write-Host "Next step (manual restart required):" -ForegroundColor Yellow
    Write-Host "  pm2 restart psale-server" -ForegroundColor White
    Write-Host ""
    Write-Host "To auto-restart in future, use: -Restart flag" -ForegroundColor DarkGray
}

Write-Host ""
Write-Log "Rotation completed by $currentUser"
