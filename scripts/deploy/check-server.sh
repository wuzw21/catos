#!/usr/bin/env bash
set -euo pipefail

WITH_CODEX=0
REQUIRE_TAILSCALE=0
for arg in "$@"; do
  case "${arg}" in
    --with-codex) WITH_CODEX=1 ;;
    --require-tailscale) REQUIRE_TAILSCALE=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/deploy/check-server.sh [--with-codex] [--require-tailscale]

Checks the local PEOS server deployment. Run on the server, usually with sudo.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      exit 2
      ;;
  esac
done

PEOS_ROOT_DIR="${PEOS_ROOT_DIR:-/srv/peos}"
PEOS_APP_DIR="${PEOS_APP_DIR:-${PEOS_ROOT_DIR}/app}"
PEOS_CONTENT_DIR="${PEOS_CONTENT_DIR:-${PEOS_ROOT_DIR}/content}"
PEOS_ENV_FILE="${PEOS_ENV_FILE:-/etc/peos/peos.env}"
PEOS_SERVICE_NAME="${PEOS_SERVICE_NAME:-peos}"
PEOS_SERVICE_USER="${PEOS_SERVICE_USER:-peos}"
PEOS_BASE_URL="${PEOS_BASE_URL:-http://127.0.0.1:2333}"
PEOS_EXPECT_CODEX_PROVIDER="${PEOS_EXPECT_CODEX_PROVIDER:-mirror}"

failures=0

pass() {
  printf 'ok - %s\n' "$*"
}

fail() {
  printf 'not ok - %s\n' "$*" >&2
  failures=$((failures + 1))
}

check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "command exists: $1"
  else
    fail "missing command: $1"
  fi
}

check_path() {
  if [ -e "$1" ]; then
    pass "path exists: $1"
  else
    fail "missing path: $1"
  fi
}

check_cmd node
check_cmd npm
check_cmd git
check_cmd curl
check_cmd codex

if command -v tailscale >/dev/null 2>&1; then
  pass "command exists: tailscale"
else
  fail "missing command: tailscale"
fi

check_path "${PEOS_APP_DIR}/package.json"
check_path "${PEOS_CONTENT_DIR}/private/couple-workspace.json"
check_path "${PEOS_ENV_FILE}"

if [ -r "${PEOS_ENV_FILE}" ]; then
  if grep -Eq 'CHANGE_ME_' "${PEOS_ENV_FILE}"; then
    fail "${PEOS_ENV_FILE} still contains CHANGE_ME placeholders"
  else
    pass "${PEOS_ENV_FILE} has no CHANGE_ME placeholders"
  fi
else
  fail "${PEOS_ENV_FILE} is not readable by this user"
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "${PEOS_SERVICE_NAME}.service"; then
    pass "systemd service is active: ${PEOS_SERVICE_NAME}"
  else
    fail "systemd service is not active: ${PEOS_SERVICE_NAME}"
    systemctl status "${PEOS_SERVICE_NAME}.service" --no-pager -l || true
  fi
fi

if health_json="$(curl -fsS -H 'X-Forwarded-Proto: https' "${PEOS_BASE_URL}/api/health" 2>/dev/null)"; then
  if HEALTH_JSON="${health_json}" node -e 'const data = JSON.parse(process.env.HEALTH_JSON); process.exit(data.ok && data.port === 2333 ? 0 : 1)' >/dev/null 2>&1; then
    pass "health endpoint returned ok on ${PEOS_BASE_URL}"
  else
    fail "health endpoint returned unexpected payload: ${health_json}"
  fi
else
  fail "health endpoint is not reachable: ${PEOS_BASE_URL}/api/health"
fi

if command -v tailscale >/dev/null 2>&1; then
  if tailscale ip -4 >/dev/null 2>&1; then
    pass "Tailscale has an IPv4 address: $(tailscale ip -4 | head -n 1)"
  elif [ "${REQUIRE_TAILSCALE}" = "1" ]; then
    fail "Tailscale is installed but not joined; run: sudo tailscale up"
  else
    echo "skip - Tailscale is installed but not joined; domain deployment does not require it"
  fi
fi

if [ "${WITH_CODEX}" = "1" ]; then
  if id "${PEOS_SERVICE_USER}" >/dev/null 2>&1; then
    if runuser -u "${PEOS_SERVICE_USER}" -- env HOME="/home/${PEOS_SERVICE_USER}" OTEL_SDK_DISABLED=true codex exec --ephemeral --skip-git-repo-check -C "${PEOS_APP_DIR}" "Return exactly: pong" </dev/null >/tmp/peos-codex-check.out 2>/tmp/peos-codex-check.err; then
      pass "Codex exec works for ${PEOS_SERVICE_USER}"
      if [ -n "${PEOS_EXPECT_CODEX_PROVIDER}" ]; then
        if grep -hEq "provider: ${PEOS_EXPECT_CODEX_PROVIDER}([[:space:]]|$)" /tmp/peos-codex-check.out /tmp/peos-codex-check.err; then
          pass "Codex provider is ${PEOS_EXPECT_CODEX_PROVIDER}"
        else
          fail "Codex provider is not ${PEOS_EXPECT_CODEX_PROVIDER}; output: $(grep -hE 'provider: ' /tmp/peos-codex-check.out /tmp/peos-codex-check.err | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g')"
        fi
      fi
    else
      fail "Codex exec failed for ${PEOS_SERVICE_USER}; stderr: $(tr '\n' ' ' </tmp/peos-codex-check.err | sed 's/[[:space:]]\+/ /g')"
    fi
  else
    fail "service user does not exist: ${PEOS_SERVICE_USER}"
  fi
else
  echo "skip - Codex exec check not requested; rerun with --with-codex"
fi

if [ "${failures}" -gt 0 ]; then
  echo
  echo "${failures} deployment check(s) failed." >&2
  exit 1
fi

echo
echo "All deployment checks passed."
