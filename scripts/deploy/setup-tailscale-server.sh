#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root, for example: sudo bash scripts/deploy/setup-tailscale-server.sh" >&2
  exit 1
fi

PEOS_ROOT_DIR="${PEOS_ROOT_DIR:-/srv/peos}"
PEOS_APP_DIR="${PEOS_APP_DIR:-${PEOS_ROOT_DIR}/app}"
PEOS_CONTENT_DIR="${PEOS_CONTENT_DIR:-${PEOS_ROOT_DIR}/content}"
PEOS_ENV_DIR="${PEOS_ENV_DIR:-/etc/peos}"
PEOS_ENV_FILE="${PEOS_ENV_FILE:-${PEOS_ENV_DIR}/peos.env}"
PEOS_SERVICE_NAME="${PEOS_SERVICE_NAME:-peos}"
PEOS_SERVICE_USER="${PEOS_SERVICE_USER:-peos}"
PEOS_SERVICE_GROUP="${PEOS_SERVICE_GROUP:-${PEOS_SERVICE_USER}}"
PEOS_REPO_URL="${PEOS_REPO_URL:-https://github.com/wuzw21/catos.git}"
PEOS_BRANCH="${PEOS_BRANCH:-master}"
PEOS_HOSTNAME="${PEOS_HOSTNAME:-peos-couple}"
PEOS_INSTALL_TAILSCALE="${PEOS_INSTALL_TAILSCALE:-1}"
PEOS_INSTALL_CODEX="${PEOS_INSTALL_CODEX:-1}"
PEOS_START_SERVICE="${PEOS_START_SERVICE:-1}"
PEOS_REPLACE_APP_DIR="${PEOS_REPLACE_APP_DIR:-0}"
PEOS_SYNC_REPO="${PEOS_SYNC_REPO:-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PACKAGE_MANAGER=""

log() {
  printf '\n==> %s\n' "$*"
}

as_service_user() {
  runuser -u "${PEOS_SERVICE_USER}" -- env HOME="/home/${PEOS_SERVICE_USER}" "$@"
}

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    PACKAGE_MANAGER="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PACKAGE_MANAGER="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PACKAGE_MANAGER="yum"
  else
    echo "This installer requires apt-get, dnf, or yum." >&2
    exit 1
  fi
}

ensure_service_user() {
  if ! getent group "${PEOS_SERVICE_GROUP}" >/dev/null 2>&1; then
    groupadd --system "${PEOS_SERVICE_GROUP}"
  fi

  if ! id -u "${PEOS_SERVICE_USER}" >/dev/null 2>&1; then
    useradd --system --create-home --home-dir "/home/${PEOS_SERVICE_USER}" --gid "${PEOS_SERVICE_GROUP}" --shell /bin/bash "${PEOS_SERVICE_USER}"
  else
    usermod -a -G "${PEOS_SERVICE_GROUP}" "${PEOS_SERVICE_USER}"
  fi
}

install_base_packages() {
  log "Installing base packages"
  case "${PACKAGE_MANAGER}" in
    apt)
      apt-get update
      apt-get install -y ca-certificates curl gnupg git sudo
      ;;
    dnf)
      dnf install -y ca-certificates curl gnupg2 git sudo
      ;;
    yum)
      yum install -y ca-certificates curl git sudo
      ;;
  esac
}

node_major_version() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
}

install_node_22() {
  if [ "$(node_major_version)" -ge 22 ]; then
    log "Node $(node --version) already satisfies Node 22+"
    return
  fi

  log "Installing Node.js 22"
  case "${PACKAGE_MANAGER}" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y nodejs
      ;;
    dnf)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      dnf install -y nodejs
      ;;
    yum)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      yum install -y nodejs
      ;;
  esac
}

install_tailscale() {
  if [ "${PEOS_INSTALL_TAILSCALE}" != "1" ]; then
    return
  fi

  if ! command -v tailscale >/dev/null 2>&1; then
    log "Installing Tailscale"
    curl -fsSL https://tailscale.com/install.sh | sh
  else
    log "Tailscale already installed"
  fi

  systemctl enable --now tailscaled
  if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
    tailscale up --authkey="${TAILSCALE_AUTHKEY}" --hostname="${PEOS_HOSTNAME}"
  else
    echo "Run this after setup to join the private network: sudo tailscale up --hostname=${PEOS_HOSTNAME}"
  fi
}

install_codex_cli() {
  if [ "${PEOS_INSTALL_CODEX}" != "1" ]; then
    return
  fi

  if command -v codex >/dev/null 2>&1 && [ "${PEOS_UPDATE_CODEX:-0}" != "1" ]; then
    log "Codex CLI already installed: $(codex --version 2>/dev/null || true)"
    return
  fi

  log "Installing Codex CLI"
  npm install -g @openai/codex
}

prepare_directories() {
  log "Preparing directories"
  install -d -m 0755 -o "${PEOS_SERVICE_USER}" -g "${PEOS_SERVICE_GROUP}" "${PEOS_ROOT_DIR}"
  install -d -m 0755 -o "${PEOS_SERVICE_USER}" -g "${PEOS_SERVICE_GROUP}" "${PEOS_CONTENT_DIR}"
  install -d -m 0700 -o "${PEOS_SERVICE_USER}" -g "${PEOS_SERVICE_GROUP}" "/home/${PEOS_SERVICE_USER}/.codex"
  install -d -m 0750 -o root -g "${PEOS_SERVICE_GROUP}" "${PEOS_ENV_DIR}"
}

sync_repo() {
  if [ "${PEOS_SYNC_REPO}" != "1" ]; then
    log "Keeping existing app directory because PEOS_SYNC_REPO=${PEOS_SYNC_REPO}"
    if [ ! -f "${PEOS_APP_DIR}/package.json" ]; then
      echo "Missing ${PEOS_APP_DIR}/package.json; cannot skip repo sync." >&2
      exit 1
    fi
    chown -R "${PEOS_SERVICE_USER}:${PEOS_SERVICE_GROUP}" "${PEOS_APP_DIR}"
    return
  fi

  log "Installing app repository"
  if [ -d "${PEOS_APP_DIR}/.git" ]; then
    chown -R "${PEOS_SERVICE_USER}:${PEOS_SERVICE_GROUP}" "${PEOS_APP_DIR}"
    as_service_user git -C "${PEOS_APP_DIR}" fetch origin "${PEOS_BRANCH}"
    as_service_user git -C "${PEOS_APP_DIR}" checkout "${PEOS_BRANCH}"
    as_service_user git -C "${PEOS_APP_DIR}" pull --ff-only origin "${PEOS_BRANCH}"
  elif [ "${REPO_ROOT}" = "${PEOS_APP_DIR}" ]; then
    chown -R "${PEOS_SERVICE_USER}:${PEOS_SERVICE_GROUP}" "${PEOS_APP_DIR}"
  else
    if [ -e "${PEOS_APP_DIR}" ] && [ "${PEOS_REPLACE_APP_DIR}" != "1" ]; then
      cat >&2 <<EOF
${PEOS_APP_DIR} already exists but is not a git repository.
Move it away manually, or rerun with PEOS_REPLACE_APP_DIR=1 to replace it.
EOF
      exit 1
    fi
    rm -rf "${PEOS_APP_DIR}"
    as_service_user git clone --branch "${PEOS_BRANCH}" "${PEOS_REPO_URL}" "${PEOS_APP_DIR}"
  fi
}

install_app_dependencies() {
  log "Installing app dependencies and building web assets"
  as_service_user npm --prefix "${PEOS_APP_DIR}" ci
  as_service_user npm --prefix "${PEOS_APP_DIR}" run build:web
}

random_secret() {
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

write_env_file_if_missing() {
  if [ -f "${PEOS_ENV_FILE}" ]; then
    log "Keeping existing ${PEOS_ENV_FILE}"
    chown root:"${PEOS_SERVICE_GROUP}" "${PEOS_ENV_FILE}"
    chmod 0640 "${PEOS_ENV_FILE}"
    return
  fi

  log "Creating ${PEOS_ENV_FILE}"
  local tmp_file
  tmp_file="$(mktemp)"
  cat > "${tmp_file}" <<EOF
HOST=0.0.0.0
PORT=2333
NODE_ENV=production
TZ=Asia/Shanghai
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PEOS_CONTENT_ROOT=${PEOS_CONTENT_DIR}
PEOS_COOKIE_SECURE=0
PEOS_REQUIRE_HTTPS=0

PEOS_COUPLE_SESSION_SECRET=${PEOS_COUPLE_SESSION_SECRET:-$(random_secret)}
PEOS_COUPLE_YOU_NAME=${PEOS_COUPLE_YOU_NAME:-you}
PEOS_COUPLE_PARTNER_NAME=${PEOS_COUPLE_PARTNER_NAME:-partner}
PEOS_COUPLE_YOU_PASSWORD=${PEOS_COUPLE_YOU_PASSWORD:-CHANGE_ME_YOU_PASSWORD}
PEOS_COUPLE_PARTNER_PASSWORD=${PEOS_COUPLE_PARTNER_PASSWORD:-CHANGE_ME_PARTNER_PASSWORD}

PEOS_LOGIN_RATE_LIMIT_MAX_FAILURES=6
PEOS_LOGIN_RATE_LIMIT_WINDOW_MS=600000
PEOS_LOGIN_RATE_LIMIT_LOCK_MS=900000

PEOS_COUPLE_DAILY_SUMMARY_CRON=1
PEOS_COUPLE_DAILY_SUMMARY_HOUR=4
PEOS_COUPLE_DAILY_SUMMARY_CRON_TARGET=yesterday
PEOS_COUPLE_DAILY_SUMMARY_AGENT=1

CODEX_HOME=/home/${PEOS_SERVICE_USER}/.codex
OTEL_SDK_DISABLED=true
EOF
  install -m 0640 -o root -g "${PEOS_SERVICE_GROUP}" "${tmp_file}" "${PEOS_ENV_FILE}"
  rm -f "${tmp_file}"
}

env_has_placeholders() {
  grep -Eq 'CHANGE_ME_' "${PEOS_ENV_FILE}"
}

initialize_content() {
  log "Initializing persistent content"
  if [ ! -f "${PEOS_CONTENT_DIR}/private/couple-workspace.json" ]; then
    as_service_user bash -lc "cd '${PEOS_APP_DIR}' && PEOS_CONTENT_ROOT='${PEOS_CONTENT_DIR}' node scripts/init-content-root.js '${PEOS_CONTENT_DIR}'"
  else
    echo "Content already initialized: ${PEOS_CONTENT_DIR}/private/couple-workspace.json"
  fi
}

install_systemd_service() {
  log "Installing systemd service"
  local template_path="${PEOS_APP_DIR}/deploy/peos.service.template"
  if [ ! -f "${template_path}" ]; then
    template_path="${REPO_ROOT}/deploy/peos.service.template"
  fi
  if [ ! -f "${template_path}" ]; then
    echo "Missing service template: deploy/peos.service.template" >&2
    exit 1
  fi

  sed \
    -e "s|{{PEOS_SERVICE_USER}}|${PEOS_SERVICE_USER}|g" \
    -e "s|{{PEOS_SERVICE_GROUP}}|${PEOS_SERVICE_GROUP}|g" \
    -e "s|{{PEOS_APP_DIR}}|${PEOS_APP_DIR}|g" \
    -e "s|{{PEOS_ENV_FILE}}|${PEOS_ENV_FILE}|g" \
    -e "s|{{PEOS_ROOT_DIR}}|${PEOS_ROOT_DIR}|g" \
    "${template_path}" > "/etc/systemd/system/${PEOS_SERVICE_NAME}.service"

  systemctl daemon-reload
  systemctl enable "${PEOS_SERVICE_NAME}.service"
}

configure_ufw_if_active() {
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi
  if ! ufw status | grep -q '^Status: active'; then
    echo "UFW is installed but inactive; leaving firewall rules unchanged."
    return
  fi

  log "Adding UFW rules for Tailscale-only port 2333 access"
  ufw allow OpenSSH || ufw allow 22/tcp
  ufw allow in on tailscale0 to any port 2333 proto tcp
  ufw deny in to any port 2333 proto tcp
}

maybe_start_service() {
  if env_has_placeholders; then
    cat >&2 <<EOF

${PEOS_ENV_FILE} still contains CHANGE_ME placeholders.
Edit it before starting the service:
  sudo nano ${PEOS_ENV_FILE}
  sudo systemctl restart ${PEOS_SERVICE_NAME}

EOF
    return
  fi

  if [ "${PEOS_START_SERVICE}" = "1" ]; then
    log "Starting ${PEOS_SERVICE_NAME}"
    systemctl restart "${PEOS_SERVICE_NAME}.service"
  else
    echo "PEOS_START_SERVICE=0, service installed but not started."
  fi
}

print_next_steps() {
  cat <<EOF

Setup complete.

Next manual steps:
  1. Join Tailscale if not already joined:
     sudo tailscale up --hostname=${PEOS_HOSTNAME}

  2. Log in Codex as the service user:
     sudo -u ${PEOS_SERVICE_USER} -H codex login

  3. Verify the deployment:
     sudo bash ${PEOS_APP_DIR}/scripts/deploy/check-server.sh --with-codex

  4. Open from phones on the same Tailnet:
     http://<tailscale-server-name>:2333/web/index.html

EOF
}

main() {
  detect_package_manager
  install_base_packages
  install_node_22
  ensure_service_user
  prepare_directories
  install_tailscale
  install_codex_cli
  sync_repo
  install_app_dependencies
  write_env_file_if_missing
  initialize_content
  install_systemd_service
  configure_ufw_if_active
  maybe_start_service
  print_next_steps
}

main "$@"
