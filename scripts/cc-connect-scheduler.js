const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { contentPath } = require("./lib/runtime-paths.js");
const { normalizeProfileId, sendCcConnectMessage } = require("./cc-connect-outbound.js");

const scheduleStorePath = contentPath("private", "cc-connect-scheduled-pushes.json");
const terminalStatuses = new Set(["sent", "failed", "cancelled"]);

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readScheduleStore() {
  if (!fs.existsSync(scheduleStorePath)) {
    return { version: 1, jobs: [] };
  }
  const raw = fs.readFileSync(scheduleStorePath, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  return {
    version: 1,
    ...parsed,
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
  };
}

function writeScheduleStore(store) {
  ensureDir(path.dirname(scheduleStorePath));
  const tmpPath = `${scheduleStorePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify({ version: 1, jobs: store.jobs || [] }, null, 2)}\n`);
  fs.renameSync(tmpPath, scheduleStorePath);
}

function randomId(prefix = "ccpush") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function normalizeClock(value) {
  const text = String(value || "").trim();
  if (!/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(text)) {
    throw new Error("time must be HH:mm or HH:mm:ss");
  }
  const [hourRaw, minuteRaw, secondRaw = "0"] = text.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new Error("time is out of range");
  }
  return `${padDatePart(hour)}:${padDatePart(minute)}:${padDatePart(second)}`;
}

function parseDateLike(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  return text;
}

function parseScheduledAt(input = {}) {
  if (input.delayMs !== undefined) {
    const delayMs = Number(input.delayMs);
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error("delayMs must be a non-negative number");
    }
    return new Date(Date.now() + Math.floor(delayMs)).toISOString();
  }

  const explicit = String(input.scheduledAt || input.at || "").trim();
  if (explicit) {
    const localMatch = explicit.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{1,2}(?::\d{1,2})?)$/);
    const parsed = localMatch
      ? new Date(`${localMatch[1]}T${normalizeClock(localMatch[2])}`)
      : new Date(explicit);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("scheduledAt must be a valid ISO or local date-time");
    }
    return parsed.toISOString();
  }

  if (input.time) {
    const date = input.date ? parseDateLike(input.date) : formatLocalDate();
    return new Date(`${date}T${normalizeClock(input.time)}`).toISOString();
  }

  throw new Error("scheduledAt, at, delayMs, or date+time is required");
}

function normalizeScheduledPushInput(input = {}) {
  const text = String(input.text || input.message || input.content || "").trim();
  if (!text) {
    throw new Error("message text is required");
  }

  return {
    userId: normalizeProfileId(input.userId || input.toUserId || input.recipient || input.to || "partner"),
    text,
    scheduledAt: parseScheduledAt(input),
    idempotencyKey: String(input.idempotencyKey || input.key || "").trim(),
    createdBy: String(input.createdBy || input.source || "agent").trim() || "agent",
  };
}

function publicScheduledPush(job = {}) {
  return {
    id: job.id || "",
    status: job.status || "scheduled",
    userId: job.userId || "",
    text: job.text || "",
    scheduledAt: job.scheduledAt || "",
    createdAt: job.createdAt || "",
    updatedAt: job.updatedAt || "",
    sentAt: job.sentAt || "",
    attempts: job.attempts || 0,
    nextAttemptAt: job.nextAttemptAt || "",
    lastError: job.lastError || "",
    idempotencyKey: job.idempotencyKey || "",
  };
}

function createScheduledCcConnectPush(input = {}) {
  const normalized = normalizeScheduledPushInput(input);
  const store = readScheduleStore();
  if (normalized.idempotencyKey) {
    const existing = store.jobs.find((job) =>
      job.idempotencyKey === normalized.idempotencyKey && !terminalStatuses.has(job.status)
    );
    if (existing) {
      return { created: false, job: publicScheduledPush(existing) };
    }
  }

  const timestamp = nowIso();
  const job = {
    id: randomId(),
    status: "scheduled",
    userId: normalized.userId,
    text: normalized.text,
    scheduledAt: normalized.scheduledAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    idempotencyKey: normalized.idempotencyKey,
    createdBy: normalized.createdBy,
  };
  store.jobs.push(job);
  writeScheduleStore(store);
  return { created: true, job: publicScheduledPush(job) };
}

function listScheduledCcConnectPushes(filters = {}) {
  const status = String(filters.status || "").trim();
  const userId = normalizeProfileId(filters.userId || "");
  const store = readScheduleStore();
  const jobs = store.jobs
    .filter((job) => !status || job.status === status)
    .filter((job) => !userId || job.userId === userId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, Math.max(1, Math.min(200, Number(filters.limit || 100))));
  return jobs.map(publicScheduledPush);
}

function cancelScheduledCcConnectPush(id) {
  const targetId = String(id || "").trim();
  if (!targetId) {
    throw new Error("scheduled push id is required");
  }
  const store = readScheduleStore();
  const job = store.jobs.find((item) => item.id === targetId);
  if (!job) {
    throw new Error("scheduled push not found");
  }
  if (terminalStatuses.has(job.status)) {
    return { changed: false, job: publicScheduledPush(job) };
  }
  job.status = "cancelled";
  job.updatedAt = nowIso();
  writeScheduleStore(store);
  return { changed: true, job: publicScheduledPush(job) };
}

function updateScheduledPush(id, updater) {
  const store = readScheduleStore();
  const job = store.jobs.find((item) => item.id === id);
  if (!job) return null;
  updater(job);
  job.updatedAt = nowIso();
  writeScheduleStore(store);
  return job;
}

function dueScheduledPushes(limit = 10) {
  const nowMs = Date.now();
  return readScheduleStore().jobs
    .filter((job) => job.status === "scheduled")
    .filter((job) => {
      const dueMs = new Date(job.nextAttemptAt || job.scheduledAt).getTime();
      return Number.isFinite(dueMs) && dueMs <= nowMs;
    })
    .sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")))
    .slice(0, Math.max(1, Math.min(50, Number(limit || 10))));
}

async function processDueScheduledCcConnectPushes(options = {}) {
  const maxAttempts = Math.max(1, Math.min(10, Number(options.maxAttempts || process.env.PEOS_CC_CONNECT_SCHEDULED_PUSH_MAX_ATTEMPTS || 3)));
  const retryDelayMs = Math.max(10 * 1000, Number(options.retryDelayMs || process.env.PEOS_CC_CONNECT_SCHEDULED_PUSH_RETRY_MS || 5 * 60 * 1000));
  const due = dueScheduledPushes(options.limit || 10);
  const results = [];

  for (const job of due) {
    const claimed = updateScheduledPush(job.id, (item) => {
      item.status = "sending";
      item.attempts = Number(item.attempts || 0) + 1;
      item.lastAttemptAt = nowIso();
      delete item.nextAttemptAt;
    });
    if (!claimed) continue;

    try {
      const sent = await sendCcConnectMessage({
        userId: claimed.userId,
        text: claimed.text,
      });
      const completed = updateScheduledPush(claimed.id, (item) => {
        item.status = "sent";
        item.sentAt = nowIso();
        item.lastError = "";
        item.lastResult = {
          target: {
            userId: sent.target?.userId || "",
            project: sent.target?.project || "",
          },
          stdout: sent.stdout || "",
          stderr: sent.stderr || "",
        };
      });
      results.push({ ok: true, job: publicScheduledPush(completed || claimed) });
    } catch (error) {
      const failed = updateScheduledPush(claimed.id, (item) => {
        item.lastError = error.message;
        if (Number(item.attempts || 0) >= maxAttempts) {
          item.status = "failed";
        } else {
          item.status = "scheduled";
          item.nextAttemptAt = new Date(Date.now() + retryDelayMs).toISOString();
        }
      });
      results.push({ ok: false, error: error.message, job: publicScheduledPush(failed || claimed) });
    }
  }

  return results;
}

module.exports = {
  cancelScheduledCcConnectPush,
  createScheduledCcConnectPush,
  listScheduledCcConnectPushes,
  processDueScheduledCcConnectPushes,
  publicScheduledPush,
};
