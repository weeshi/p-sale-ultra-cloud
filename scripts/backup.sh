#!/usr/bin/env bash
# =====================================================================
# P-Sale Ultra Cloud — MySQL Backup (Linux/Docker production)
# - يقرأ بيانات الاتصال من server/.env أو متغيرات MYSQL_*
# - ينشئ نسخة mysqldump مضغوطة في ../backups
# - يحتفظ بآخر BACKUP_KEEP_DAYS (افتراضي 7) نسخة يومية
# - نسخ اختياري إلى دليل خارجي عبر BACKUP_REMOTE_DIR
# الاستخدام: scripts/backup.sh
# =====================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-}"
LOG_FILE="$ROOT_DIR/backups/backup.log"
STAMP="$(date +%Y%m%d_%H%M%S)"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }

# قراءة DATABASE_URL من server/.env إن وُجدت
if [[ -f "$ROOT_DIR/server/.env" ]]; then
  set -a
  # يحفظ الملف من قيم SQLite/فراغات
  grep -E '^DATABASE_URL=' "$ROOT_DIR/server/.env" > /dev/null 2>&1 || true
  set +a
  source <(grep -E '^(DATABASE_URL|MYSQL_)' "$ROOT_DIR/server/.env" | sed 's/^/export /') 2>/dev/null || true
fi

# تحليل DATABASE_URL  mysql://user:pass@host:port/db
DB_USER="${MYSQL_USER:-root}"
DB_PASS="${MYSQL_PASSWORD:-}"
DB_HOST="${MYSQL_HOST:-localhost}"
DB_PORT="${MYSQL_PORT:-3306}"
DB_NAME="${MYSQL_DATABASE:-psale_ultra}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  URL="${DATABASE_URL#mysql://}"
  URL="${URL#mysql2://}"
  CREDS="${URL%%@*}"
  HOSTPORT="${URL#*@}"
  DB_NAME="${HOSTPORT#*/}"
  DB_NAME="${DB_NAME%%\?*}"
  DB_USER="${CREDS%%:*}"
  if [[ "$CREDS" == *:* ]]; then DB_PASS="${CREDS#*:}"; else DB_PASS=""; fi
  DB_HOST="${HOSTPORT%%:*}"
  REST="${HOSTPORT#*:}"
  DB_PORT="${REST%%/*}"
  [[ -z "$DB_PORT" || "$DB_PORT" == "$HOSTPORT" ]] && DB_PORT=3306
fi

MYSQLDUMP="mysqldump"
command -v "$MYSQLDUMP" >/dev/null 2>&1 || MYSQLDUMP="$(command -v mysql_config 2>/dev/null && dirname "$(command -v mysql)" | sed 's|/[^/]*$||')/mysqldump"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/psale_${DB_NAME}_${STAMP}.sql.gz"

log "بدء النسخ الاحتياطي لقاعدة $DB_NAME@$DB_HOST:$DB_PORT"
if ! MYSQL_PWD="$DB_PASS" "$MYSQLDUMP" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
     --single-transaction --routines --triggers --default-character-set=utf8mb4 \
     "$DB_NAME" | gzip -9 > "$OUT"; then
  log "فشل النسخ الاحتياطي"
  exit 1
fi

log "تم إنشاء: $OUT ($(du -h "$OUT" | cut -f1))"

# استبقاء آخر KEEP_DAYS يوم فقط
find "$BACKUP_DIR" -name 'psale_*.sql.gz' -mtime +"$KEEP_DAYS" -delete -print 2>/dev/null | while read -r f; do
  log "حذف قديم: $f"
done

# نسخ إلى دليل بعيد/مُركَّب اختياري
if [[ -n "$REMOTE_DIR" ]]; then
  mkdir -p "$REMOTE_DIR"
  cp "$OUT" "$REMOTE_DIR/"
  log "تم نسخ إلى $REMOTE_DIR"
fi

log "اكتمل النسخ الاحتياطي بنجاح"
