#!/usr/bin/env bash
# P-Sale Ultra Cloud - Start Services (Linux)
# Usage: bash scripts/linux/start.sh
# First time? Run: chmod +x scripts/linux/*.sh

set -euo pipefail

HEALTH_TIMEOUT=5

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== P-Sale Ultra Cloud - Starting Services ==="
echo ""

# Check PM2
if ! command -v pm2 &>/dev/null; then
    echo "ERROR: pm2 not found. Install: npm install -g pm2"
    exit 1
fi

# Check ecosystem
ECOSYSTEM="$PROJECT_ROOT/ecosystem.config.cjs"
if [ ! -f "$ECOSYSTEM" ]; then
    echo "ERROR: ecosystem.config.cjs not found at $ECOSYSTEM"
    exit 1
fi

# Check if already running
if pm2 jlist 2>/dev/null | grep -q '"name":"psale-server"' && \
   pm2 jlist 2>/dev/null | grep -q '"name":"psale-client"'; then
    SERVER_STATUS=$(pm2 jlist 2>/dev/null | grep -o '"psale-server".*"status":"[^"]*"' | head -1 | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    CLIENT_STATUS=$(pm2 jlist 2>/dev/null | grep -o '"psale-client".*"status":"[^"]*"' | head -1 | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    if [ "$SERVER_STATUS" = "online" ] && [ "$CLIENT_STATUS" = "online" ]; then
        echo "OK  Server   : online (port 3005)"
        echo "OK  Client   : online (port 5175)"
        echo ""
        echo "All services already running."
        exit 0
    fi
fi

# Start services
echo "Starting services..."
pm2 start "$ECOSYSTEM" --silent 2>/dev/null

# Wait and verify (up to 10 seconds)
MAX_WAIT=10
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 1
    ELAPSED=$((ELAPSED + 1))
    if pm2 jlist 2>/dev/null | grep -q '"status":"online"'; then
        break
    fi
done

# Health check server
SERVER_OK=false
if curl -sf -o /dev/null --max-time "$HEALTH_TIMEOUT" "http://localhost:3005/api/health" 2>/dev/null; then
    SERVER_OK=true
fi

# Health check client
CLIENT_OK=false
if curl -sf -o /dev/null --max-time "$HEALTH_TIMEOUT" "http://localhost:5175" 2>/dev/null; then
    CLIENT_OK=true
fi

# Report
echo ""
echo "=== Service Status ==="

if [ "$SERVER_OK" = true ]; then
    echo "OK  Server   : online (port 3005)"
else
    echo "!!  Server   : started but health check failed"
fi

if [ "$CLIENT_OK" = true ]; then
    echo "OK  Client   : online (port 5175)"
else
    echo "!!  Client   : started but health check failed"
fi

echo ""
echo "Dashboard: pm2 monit"
echo "Logs:      pm2 logs"
