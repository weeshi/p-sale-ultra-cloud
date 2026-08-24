#!/usr/bin/env bash
# =====================================================================
# P-Sale Ultra Cloud — Restore MySQL backup (Linux/Docker production)
# الاستخدام: scripts/restore.sh <backup.sql.gz> [db_name]
# تنبيه: يستبدل قاعدة البيانات المستهدفة بالكامل!
# =====================================================================
set -euo pipefail

[[ $# -ge 1 ]] || { echo "الاستخدام: $0 <backup.sql.gz> [db_name]" >&2; exit 1; }
SRC="$1"
DB_NAME="${2:-psale_ultra}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT_DIR/server/.env" ]]; then
  source <(grep -E '^DATABASE_URL=' "$ROOT_DIR/server/.env" | sed 's/^/export /') 2>/dev/null || true
fi

DB_USER="${MYSQL_USER:-root}"
DB_PASS="${MYSQL_PASSWORD:-}"
DB_HOST="${MYSQL_HOST:-localhost}"
DB_PORT="${MYSQL_PORT:-3306}"
if [[ -n "${DATABASE_URL:-}" ]]; then
  URL="${DATABASE_URL#mysql://}"; URL="${URL#mysql2://}"
  CREDS="${URL%%@*}"; HOSTPORT="${URL#*@}"
  DB_NAME="${HOSTPORT#*/}"; DB_NAME="${DB_NAME%%\?*}"
  DB_USER="${CREDS%%:*}"
  [[ "$CREDS" == *:* ]] && DB_PASS="${CREDS#*:}"
  DB_HOST="${HOSTPORT%%:*}"; REST="${HOSTPORT#*:}"; DB_PORT="${REST%%/*}"
  [[ -z "$DB_PORT" || "$DB_PORT" == "$HOSTPORT" ]] && DB_PORT=3306
fi

echo "استعادة $SRC إلى $DB_NAME@$DB_HOST:$DB_PORT ..."
if [[ "$SRC" == *.gz ]]; then
  gunzip -c "$SRC" | MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
else
  MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" < "$SRC"
fi
echo "تمت الاستعادة بنجاح"
