#!/usr/bin/env bash
# =============================================================================
# P-Sale Ultra Cloud - Server Provisioning (Ubuntu 22.04 / 24.04 LTS)
# =============================================================================
# Installs everything the production host needs, idempotently:
#   1. Base packages (curl, gnupg, ca-certificates, jq, git, ufw)
#   2. Docker Engine + Buildx + Compose v2 plugin (official Docker repo)
#   3. Tailscale (official Tailscale repo) for remote admin over WireGuard
#   4. cloudflared (official Cloudflare repo) for the Cloudflare Tunnel
#   5. Docker log rotation (prevents the disk filling with container logs)
#   6. /opt/psale deployment directory owned by the deploy user
#
# Usage (on the Ubuntu server):
#   sudo bash scripts/linux/provision.sh
#   sudo bash scripts/linux/provision.sh --with-firewall
#   sudo bash scripts/linux/provision.sh --deploy-user weeshi
#
# Safe to re-run: every step checks before it installs.
# =============================================================================

set -euo pipefail

DEBIAN_FRONTEND=noninteractive
export DEBIAN_FRONTEND

DEPLOY_DIR="/opt/psale"
WITH_FIREWALL=false
DEPLOY_USER="${SUDO_USER:-}"
SSH_PORT="22"

OK="OK "
WARN="!! "
INFO="-- "

# ----------------------------- helpers ---------------------------------------
log_ok()   { echo "${OK} $*"; }
log_warn() { echo "${WARN} $*"; }
log_info() { echo "${INFO} $*"; }
step()     { echo ""; echo "=== $* ==="; }

have() { command -v "$1" >/dev/null 2>&1; }

usage() {
    cat <<'USAGE'
P-Sale Ultra Cloud - Server Provisioning (Ubuntu 22.04 / 24.04 LTS)

Installs, idempotently:
  1. Base packages (curl, gnupg, ca-certificates, jq, git, ufw)
  2. Docker Engine + Buildx + Compose v2 plugin (official Docker repo)
  3. Tailscale (official Tailscale repo) for remote admin over WireGuard
  4. cloudflared (official Cloudflare repo) for the Cloudflare Tunnel
  5. Docker log rotation (prevents container logs filling the disk)
  6. /opt/psale deployment directory owned by the deploy user

Usage:
  sudo bash scripts/linux/provision.sh
  sudo bash scripts/linux/provision.sh --with-firewall
  sudo bash scripts/linux/provision.sh --deploy-user weeshi
  sudo bash scripts/linux/provision.sh --ssh-port 2222 --with-firewall

Options:
  --with-firewall        Enable ufw allowing ONLY the SSH port, 80, 443 and tailscale0
  --deploy-user <name>   User added to the docker group and made owner of /opt/psale
  --ssh-port <port>      SSH port for the firewall rule (default: 22)
  -h, --help             Show this help

Safe to re-run: every step checks before it installs.
USAGE
}

# ----------------------------- arguments -------------------------------------
while [ $# -gt 0 ]; do
    case "$1" in
        --with-firewall) WITH_FIREWALL=true; shift ;;
        --deploy-user)   DEPLOY_USER="${2:-}"; shift 2 ;;
        --ssh-port)      SSH_PORT="${2:-22}"; shift 2 ;;
        -h|--help)
            usage
            exit 0
            ;;
        *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
    esac
done

# ----------------------------- preflight -------------------------------------
step "Preflight checks"

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: run with sudo (needs root for apt and systemd)."
    exit 1
fi

if [ ! -f /etc/os-release ]; then
    echo "ERROR: /etc/os-release not found - this script targets Ubuntu/Debian."
    exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
DISTRO_ID="${ID:-unknown}"
CODENAME="${VERSION_CODENAME:-}"
log_info "OS: ${PRETTY_NAME:-$DISTRO_ID} (codename: ${CODENAME:-unknown})"

case "$DISTRO_ID" in
    ubuntu|debian) ;;
    *) echo "ERROR: unsupported distribution '$DISTRO_ID' (Ubuntu/Debian only)."; exit 1 ;;
esac

ARCH="$(dpkg --print-architecture)"
log_info "Architecture: $ARCH"

if [ -z "$DEPLOY_USER" ] || [ "$DEPLOY_USER" = "root" ]; then
    log_warn "No deploy user detected - skipping docker group membership."
    DEPLOY_USER=""
else
    log_info "Deploy user: $DEPLOY_USER"
fi

if ! ping -c 1 -W 3 1.1.1.1 >/dev/null 2>&1 && ! curl -sf --max-time 5 -o /dev/null https://download.docker.com; then
    log_warn "Internet connectivity looks unavailable - the install steps below will fail."
fi

# ----------------------------- base packages ---------------------------------
step "Base packages"
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
    ca-certificates curl gnupg jq git openssl ufw apt-transport-https
log_ok "Base packages installed"

# ----------------------------- docker ----------------------------------------
step "Docker Engine + Compose v2"

if have docker && docker compose version >/dev/null 2>&1; then
    log_ok "Docker already installed: $(docker --version)"
    log_ok "Compose: $(docker compose version --short 2>/dev/null || echo present)"
else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${DISTRO_ID} ${CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y -qq \
        docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    log_ok "Docker installed: $(docker --version)"
fi

# Log rotation: without this a chatty container can fill the disk in weeks.
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
    cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
    log_ok "Docker log rotation configured (10m x 3 per container)"
else
    log_info "/etc/docker/daemon.json already exists - left untouched"
fi

systemctl enable --now docker >/dev/null 2>&1 || true
log_ok "Docker service enabled at boot"

if [ -n "$DEPLOY_USER" ]; then
    if id -nG "$DEPLOY_USER" | grep -qw docker; then
        log_ok "$DEPLOY_USER is already in the docker group"
    else
        usermod -aG docker "$DEPLOY_USER"
        log_ok "Added $DEPLOY_USER to the docker group (re-login required)"
    fi
fi

# ----------------------------- tailscale -------------------------------------
step "Tailscale (remote admin)"

if have tailscale; then
    log_ok "Tailscale already installed: $(tailscale version | head -1)"
else
    curl -fsSL "https://pkgs.tailscale.com/stable/${DISTRO_ID}/${CODENAME}.noarmor.gpg" \
        -o /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL "https://pkgs.tailscale.com/stable/${DISTRO_ID}/${CODENAME}.tailscale-keyring.list" \
        -o /etc/apt/sources.list.d/tailscale.list

    apt-get update -qq
    apt-get install -y -qq tailscale
    log_ok "Tailscale installed: $(tailscale version | head -1)"
fi

systemctl enable --now tailscaled >/dev/null 2>&1 || true
log_ok "tailscaled service enabled at boot"

# ----------------------------- cloudflared -----------------------------------
step "cloudflared (Cloudflare Tunnel)"

if have cloudflared; then
    log_ok "cloudflared already installed: $(cloudflared --version)"
else
    install -m 0755 -d /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
        -o /usr/share/keyrings/cloudflare-main.gpg
    chmod a+r /usr/share/keyrings/cloudflare-main.gpg

    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
        > /etc/apt/sources.list.d/cloudflared.list

    apt-get update -qq
    apt-get install -y -qq cloudflared
    log_ok "cloudflared installed: $(cloudflared --version)"
fi

# ----------------------------- deployment dir --------------------------------
step "Deployment directory"

if [ -d "$DEPLOY_DIR" ]; then
    log_ok "$DEPLOY_DIR already exists"
else
    mkdir -p "$DEPLOY_DIR"
    log_ok "Created $DEPLOY_DIR"
fi

if [ -n "$DEPLOY_USER" ]; then
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$DEPLOY_DIR"
    log_ok "Ownership: ${DEPLOY_USER}:${DEPLOY_USER}"
fi

# ----------------------------- firewall (opt-in) -----------------------------
step "Firewall"

if [ "$WITH_FIREWALL" = true ]; then
    ufw allow "${SSH_PORT}/tcp" >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    # Tailscale interface only (never expose the app port 3005 to the LAN)
    ufw allow in on tailscale0 >/dev/null 2>&1 || true
    ufw --force enable >/dev/null
    log_ok "ufw enabled: ${SSH_PORT}/tcp, 80/tcp, 443/tcp, tailscale0 (3005 stays private)"
else
    log_info "Firewall skipped (pass --with-firewall to enable 22/80/443 only)"
fi

# ----------------------------- summary ---------------------------------------
step "Summary"

printf '%-16s %s\n' "Docker"      "$(docker --version 2>/dev/null || echo MISSING)"
printf '%-16s %s\n' "Compose"     "$(docker compose version --short 2>/dev/null || echo MISSING)"
printf '%-16s %s\n' "Tailscale"   "$(tailscale version 2>/dev/null | head -1 || echo MISSING)"
printf '%-16s %s\n' "cloudflared" "$(cloudflared --version 2>/dev/null || echo MISSING)"
printf '%-16s %s\n' "Deploy dir"  "$DEPLOY_DIR"

echo ""
echo "=== Next steps (run as your normal user, not root) ==="
echo "1) Connect this machine to your tailnet:"
echo "     sudo tailscale up"
echo "   -> open the printed URL on your laptop and approve the machine."
echo ""
echo "2) Authorize the Cloudflare Tunnel (needs a browser on your laptop):"
echo "     cloudflared tunnel login"
echo "   -> open the printed URL, pick the zone (registered at Libyan Spider)."
echo ""
echo "3) Create the tunnel and route the hostname:"
echo "     cloudflared tunnel create psale"
echo "     cloudflared tunnel route dns psale psale.example.com"
echo ""
echo "4) Copy the project to $DEPLOY_DIR and start it:"
echo "     cp .env.example .env && nano .env    # set JWT secrets + DB passwords"
echo "     docker compose up -d --build"
echo ""
echo "Logs:    docker compose logs -f server"
echo "Health:  curl -s localhost:3005/api/health"
