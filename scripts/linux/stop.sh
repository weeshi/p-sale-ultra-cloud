#!/usr/bin/env bash
# P-Sale Ultra Cloud - Stop Services (Linux)
# Usage: bash scripts/linux/stop.sh
# First time? Run: chmod +x scripts/linux/*.sh

set -euo pipefail

echo "=== P-Sale Ultra Cloud - Stopping Services ==="
echo ""

# Check PM2
if ! command -v pm2 &>/dev/null; then
    echo "ERROR: pm2 not found. Install: npm install -g pm2"
    exit 1
fi

# Check if anything is running
if ! pm2 jlist 2>/dev/null | grep -q '"status":"online"'; then
    echo "All services already stopped."
    exit 0
fi

# Stop both
echo "Stopping psale-server..."
pm2 stop psale-server --silent 2>/dev/null

echo "Stopping psale-client..."
pm2 stop psale-client --silent 2>/dev/null

# Verify
sleep 2
if pm2 jlist 2>/dev/null | grep -q '"status":"online"'; then
    echo ""
    echo "WARN  Some services may still be running. Check: pm2 status"
else
    echo ""
    echo "OK  All services stopped."
fi
