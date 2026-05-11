#!/usr/bin/env bash
set -euo pipefail

PEOS_SSH_TARGET="${PEOS_SSH_TARGET:-root@39.106.104.33}"
PEOS_SSH_KEY="${PEOS_SSH_KEY:-${HOME}/.ssh/aliyun-peos.pem}"
PEOS_REMOTE_ROOT="${PEOS_REMOTE_ROOT:-/srv/peos}"
PEOS_REMOTE_APP_DIR="${PEOS_REMOTE_APP_DIR:-${PEOS_REMOTE_ROOT}/app}"
PEOS_REMOTE_TMP="${PEOS_REMOTE_TMP:-/tmp/peos-sync}"
PEOS_SERVICE_NAME="${PEOS_SERVICE_NAME:-peos}"
PEOS_SERVICE_USER="${PEOS_SERVICE_USER:-peos}"
PEOS_SERVICE_GROUP="${PEOS_SERVICE_GROUP:-peos}"
PEOS_RUN_NPM_CI="${PEOS_RUN_NPM_CI:-1}"
PEOS_RUN_CHECK="${PEOS_RUN_CHECK:-1}"
PEOS_WITH_CODEX="${PEOS_WITH_CODEX:-0}"
PEOS_VERIFY_URL="${PEOS_VERIFY_URL:-https://catandcat.cn/web/index.html}"
PEOS_KEEP_BACKUPS="${PEOS_KEEP_BACKUPS:-3}"
PEOS_DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy/sync-to-server.sh [options]

Options:
  --dry-run       Show the files that would be uploaded, but do not upload.
  --skip-npm-ci   Skip npm ci on the server.
  --skip-check    Skip the server health check after restart.
  --with-codex    Also run the Codex exec check after restart.

Environment:
  PEOS_SSH_TARGET=root@39.106.104.33
  PEOS_SSH_KEY=~/.ssh/aliyun-peos.pem
  PEOS_REMOTE_ROOT=/srv/peos
  PEOS_VERIFY_URL=https://catandcat.cn/web/index.html
EOF
}

for arg in "$@"; do
  case "${arg}" in
    --dry-run) PEOS_DRY_RUN=1 ;;
    --skip-npm-ci) PEOS_RUN_NPM_CI=0 ;;
    --skip-check) PEOS_RUN_CHECK=0 ;;
    --with-codex) PEOS_WITH_CODEX=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Run this script from inside the git repository." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/peos-sync.XXXXXX")"
FILE_LIST="${WORK_DIR}/files.txt"
ARCHIVE_PATH="${WORK_DIR}/peos-app.tar.gz"
trap 'rm -rf "${WORK_DIR}"' EXIT

{
  git ls-files
  git ls-files --others --exclude-standard
} | awk '
  NF && !seen[$0]++ &&
  $0 !~ /^node_modules\// &&
  $0 !~ /^\.git\// &&
  $0 !~ /^tmp\// &&
  $0 !~ /^content-private\// &&
  $0 !~ /^content-local\// &&
  $0 !~ /^content-demo-private\// &&
  $0 !~ /^web\/assets\// &&
  $0 !~ /(^|\/)\.DS_Store$/ &&
  $0 !~ /(^|\/)\._/ &&
  $0 !~ /^(assets|dimensions|explorations|inbox|iterations|lists|logs|metrics|notes|photos|plans|private|profile|schedules|tasks|todos)\// &&
  $0 != "soul.md" {
    print
  }
' | sort > "${FILE_LIST}"

if [ ! -s "${FILE_LIST}" ]; then
  echo "No files selected for deployment." >&2
  exit 1
fi

echo "Selected $(wc -l < "${FILE_LIST}" | tr -d ' ') file(s) for deployment."

if [ "${PEOS_DRY_RUN}" = "1" ]; then
  sed -n '1,240p' "${FILE_LIST}"
  exit 0
fi

COPYFILE_DISABLE=1 tar -czf "${ARCHIVE_PATH}" -T "${FILE_LIST}"
echo "Created archive: ${ARCHIVE_PATH}"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)
if [ -n "${PEOS_SSH_KEY}" ]; then
  SSH_OPTS+=(-i "${PEOS_SSH_KEY}")
fi

ssh "${SSH_OPTS[@]}" "${PEOS_SSH_TARGET}" "mkdir -p '${PEOS_REMOTE_TMP}'"
scp "${SSH_OPTS[@]}" "${ARCHIVE_PATH}" "${PEOS_SSH_TARGET}:${PEOS_REMOTE_TMP}/peos-app.tar.gz"

REMOTE_COMMAND=$(cat <<REMOTE_ENV
PEOS_REMOTE_ROOT='${PEOS_REMOTE_ROOT}' \
PEOS_REMOTE_APP_DIR='${PEOS_REMOTE_APP_DIR}' \
PEOS_REMOTE_TMP='${PEOS_REMOTE_TMP}' \
PEOS_SERVICE_NAME='${PEOS_SERVICE_NAME}' \
PEOS_SERVICE_USER='${PEOS_SERVICE_USER}' \
PEOS_SERVICE_GROUP='${PEOS_SERVICE_GROUP}' \
PEOS_RUN_NPM_CI='${PEOS_RUN_NPM_CI}' \
PEOS_RUN_CHECK='${PEOS_RUN_CHECK}' \
PEOS_WITH_CODEX='${PEOS_WITH_CODEX}' \
PEOS_VERIFY_URL='${PEOS_VERIFY_URL}' \
PEOS_KEEP_BACKUPS='${PEOS_KEEP_BACKUPS}' \
bash -s
REMOTE_ENV
)

ssh "${SSH_OPTS[@]}" "${PEOS_SSH_TARGET}" "${REMOTE_COMMAND}" <<'REMOTE_SCRIPT'
set -euo pipefail

log() {
  printf '\n==> %s\n' "$*"
}

as_service_user() {
  runuser -u "${PEOS_SERVICE_USER}" -- env HOME="/home/${PEOS_SERVICE_USER}" "$@"
}

rollback() {
  if [ -n "${BACKUP_DIR:-}" ] && [ -d "${BACKUP_DIR}" ]; then
    echo "Rolling back to ${BACKUP_DIR}" >&2
    rm -rf "${PEOS_REMOTE_APP_DIR}"
    mv "${BACKUP_DIR}" "${PEOS_REMOTE_APP_DIR}"
    chown -R "${PEOS_SERVICE_USER}:${PEOS_SERVICE_GROUP}" "${PEOS_REMOTE_APP_DIR}"
    systemctl restart "${PEOS_SERVICE_NAME}.service" || true
  fi
}

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="${PEOS_REMOTE_ROOT}/app.next-${TIMESTAMP}"
BACKUP_DIR="${PEOS_REMOTE_ROOT}/app.prev-${TIMESTAMP}"
ARCHIVE_PATH="${PEOS_REMOTE_TMP}/peos-app.tar.gz"

if [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "Missing uploaded archive: ${ARCHIVE_PATH}" >&2
  exit 1
fi

log "Preparing release ${RELEASE_DIR}"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${RELEASE_DIR}"
find "${RELEASE_DIR}" -name '._*' -delete
chown -R "${PEOS_SERVICE_USER}:${PEOS_SERVICE_GROUP}" "${RELEASE_DIR}"

if [ "${PEOS_RUN_NPM_CI}" = "1" ]; then
  log "Installing dependencies"
  as_service_user npm --prefix "${RELEASE_DIR}" ci
fi

log "Building web assets"
as_service_user npm --prefix "${RELEASE_DIR}" run build:web

log "Swapping release"
if [ -d "${PEOS_REMOTE_APP_DIR}" ]; then
  mv "${PEOS_REMOTE_APP_DIR}" "${BACKUP_DIR}"
fi
mv "${RELEASE_DIR}" "${PEOS_REMOTE_APP_DIR}"
chown -R "${PEOS_SERVICE_USER}:${PEOS_SERVICE_GROUP}" "${PEOS_REMOTE_APP_DIR}"
chmod +x "${PEOS_REMOTE_APP_DIR}"/scripts/deploy/*.sh 2>/dev/null || true

if ! systemctl restart "${PEOS_SERVICE_NAME}.service"; then
  rollback
  exit 1
fi

log "Waiting for service health"
HEALTH_OK=0
for _ in $(seq 1 30); do
  if curl -fsS -H 'X-Forwarded-Proto: https' http://127.0.0.1:2333/api/health >/tmp/peos-sync-health.json 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [ "${HEALTH_OK}" != "1" ]; then
  echo "Service did not become healthy after restart." >&2
  journalctl -u "${PEOS_SERVICE_NAME}.service" --no-pager -n 80 >&2 || true
  rollback
  exit 1
fi

if [ "${PEOS_RUN_CHECK}" = "1" ]; then
  log "Running deployment check"
  CHECK_ARGS=()
  if [ "${PEOS_WITH_CODEX}" = "1" ]; then
    CHECK_ARGS+=(--with-codex)
  fi
  if ! PEOS_BASE_URL=http://127.0.0.1:2333 bash "${PEOS_REMOTE_APP_DIR}/scripts/deploy/check-server.sh" "${CHECK_ARGS[@]}"; then
    rollback
    exit 1
  fi
fi

if [ -n "${PEOS_VERIFY_URL}" ]; then
  log "Verifying public URL"
  curl -fsS -o /tmp/peos-sync-verify.html -w 'public_http=%{http_code}\n' "${PEOS_VERIFY_URL}"
fi

log "Cleaning old backups"
mapfile -t BACKUPS < <(find "${PEOS_REMOTE_ROOT}" -maxdepth 1 -type d -name 'app.prev-*' | sort -r)
INDEX=0
for backup in "${BACKUPS[@]}"; do
  INDEX=$((INDEX + 1))
  if [ "${INDEX}" -gt "${PEOS_KEEP_BACKUPS}" ]; then
    rm -rf "${backup}"
  fi
done

echo "Deployed to ${PEOS_REMOTE_APP_DIR}"
REMOTE_SCRIPT
