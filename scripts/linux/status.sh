#!/usr/bin/env bash
# P-Sale Ultra Cloud - Service Status (Linux)
# Usage: bash scripts/linux/status.sh
# First time? Run: chmod +x scripts/linux/*.sh

set -euo pipefail

HEALTH_TIMEOUT=5

echo "=== P-Sale Ultra Cloud - Service Status ==="
echo ""

# Check PM2
if ! command -v pm2 &>/dev/null; then
    echo "ERROR: pm2 not found. Install: npm install -g pm2"
    exit 1
fi

# PM2 status
echo "--- PM2 Processes ---"
pm2 status
echo ""

# Health checks
echo "--- Health Checks ---"
SERVER_OK=false
if SERVER_JSON=$(curl -sf --max-time "$HEALTH_TIMEOUT" "http://localhost:3005/api/health" 2>/dev/null); then
    SERVER_OK=true
    DB_STATUS=$(echo "$SERVER_JSON" | grep -o '"db":"[^"]*"' | cut -d'"' -f4)
    UPTIME=$(echo "$SERVER_JSON" | grep -o '"uptime":[0-9.]*' | cut -d':' -f2)
    UPTIME_INT=$(printf '%.0f' "$UPTIME" 2>/dev/null || echo "0")
    echo "OK  Server   : online (port 3005) - db: $DB_STATUS - uptime: ${UPTIME_INT}s"
else
    echo "!!  Server   : unreachable on port 3005"
fi

CLIENT_OK=false
if curl -sf -o /dev/null --max-time "$HEALTH_TIMEOUT" "http://localhost:5175" 2>/dev/null; then
    CLIENT_OK=true
    echo "OK  Client   : online (port 5175)"
else
    echo "!!  Client   : unreachable on port 5175"
fi

echo ""

# Summary
if [ "$SERVER_OK" = true ] && [ "$CLIENT_OK" = true ]; then
    echo "All services healthy."
elif [ "$SERVER_OK" = false ] && [ "$CLIENT_OK" = false ]; then
    echo "All services down. Start: bash scripts/linux/start.sh"
else
    echo "Partial outage. Restart: bash scripts/linux/restart.sh"
fi
