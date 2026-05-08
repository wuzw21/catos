const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { repoRoot, contentRoot } = require("./lib/runtime-paths.js");

const { syncWebData } = require("./sync-web-data.js");
const { allowedStatuses, updateTodoStatus } = require("./update-todo-status.js");
const { updateWeeklySchedule } = require("./update-weekly-schedule.js");
const { updateHomeIndex } = require("./update-home-index.js");
const { linkTodayPlanToSchedule } = require("./link-today-plan-to-schedule.js");
const { updateDailyCheckin } = require("./update-daily-checkin.js");
const { updateCoreContribution } = require("./update-core-contribution.js");
const { ingestCapture } = require("./ingest-capture.js");
const { archiveCapture, archiveLatestCapture } = require("./archive-capture.js");
const { generateDailyLogWithCodex } = require("./daily-log-generator.js");
const { startNewDay } = require("./start-new-day.js");
const {
  addCapture: addCoupleCapture,
  addDiaryAsset: addCoupleDiaryAsset,
  archiveScheduleItem: archiveCoupleScheduleItem,
  archiveTodoItem: archiveCoupleTodoItem,
  deleteCheckinItem: deleteCoupleCheckinItem,
  deleteDeadlineItem: deleteCoupleDeadlineItem,
  deleteScheduleItem: deleteCoupleScheduleItem,
  deleteTodoItem: deleteCoupleTodoItem,
  getState: getCoupleState,
  readAuthConfig: readCoupleAuthConfig,
  readPublicBootstrap: readCouplePublicBootstrap,
  readRevision: readCoupleRevision,
  refreshDailySummary: refreshCoupleDailySummary,
  toggleCheckinItem: toggleCoupleCheckinItem,
  toggleScheduleItem: toggleCoupleScheduleItem,
  toggleTodoItem: toggleCoupleTodoItem,
  updateDiaryDay: updateCoupleDiaryDay,
  updatePersonalPage: updateCouplePersonalPage,
  updateProfile: updateCoupleProfile,
  upsertCheckinItem: upsertCoupleCheckinItem,
  upsertDeadlineItem: upsertCoupleDeadlineItem,
  upsertScheduleItem: upsertCoupleScheduleItem,
  upsertTodoItem: upsertCoupleTodoItem,
  verifyLogin: verifyCoupleLogin,
} = require("./couple-store.js");

const rootDir = repoRoot;
const port = Number(process.env.PORT || 2333);
const host = process.env.HOST || "127.0.0.1";
const backgroundJobs = new Map();
const startNewDayQueueDir = path.join(rootDir, "tmp", "start-new-day-jobs");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const legacyWebEntryPaths = new Set([
  "/web/cat.html",
  "/web/detail.html",
  "/web/diary.html",
  "/web/input.html",
  "/web/iterations.html",
  "/web/photos.html",
  "/web/schedule.html",
  "/web/system.html",
  "/web/todo.html",
]);

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(message);
}

function sendRedirect(res, location) {
  res.writeHead(302, {
    "Cache-Control": "no-store",
    Location: location,
  });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function resolveStaticPath(pathname) {
  if (pathname.startsWith("/__content/")) {
    const contentRelativePath = pathname.replace(/^\/__content\//, "");
    const contentFilePath = path.join(contentRoot, decodeURIComponent(contentRelativePath));
    const normalizedContentFilePath = path.normalize(contentFilePath);

    if (!normalizedContentFilePath.startsWith(contentRoot)) {
      return null;
    }

    return normalizedContentFilePath;
  }

  const normalizedPath = pathname === "/" ? "/web/index.html" : pathname;
  const filePath = path.join(rootDir, decodeURIComponent(normalizedPath));
  const normalizedFilePath = path.normalize(filePath);

  if (!normalizedFilePath.startsWith(rootDir)) {
    return null;
  }

  if (fs.existsSync(normalizedFilePath) && fs.statSync(normalizedFilePath).isDirectory()) {
    const indexFile = path.join(normalizedFilePath, "index.html");
    return fs.existsSync(indexFile) ? indexFile : null;
  }

  return normalizedFilePath;
}

function createJob(runner) {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  backgroundJobs.set(jobId, {
    id: jobId,
    status: "running",
    createdAt: new Date().toISOString(),
    result: null,
    error: null,
  });

  setTimeout(() => {
    try {
      const result = runner();
      backgroundJobs.set(jobId, {
        ...backgroundJobs.get(jobId),
        status: "completed",
        completedAt: new Date().toISOString(),
        result,
      });
    } catch (error) {
      backgroundJobs.set(jobId, {
        ...backgroundJobs.get(jobId),
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error.message,
      });
    }
  }, 0);

  return jobId;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const [key, ...valueParts] = item.split("=");
      cookies[decodeURIComponent(key)] = decodeURIComponent(valueParts.join("="));
      return cookies;
    }, {});
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function signSessionPayload(payloadPart, secret) {
  return crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

function createSessionCookie(token, maxAgeSeconds) {
  const secure = process.env.PEOS_COOKIE_SECURE === "1" ? "; Secure" : "";
  return `peos_couple_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function createCoupleSession(userId) {
  const ttlMs = 1000 * 60 * 60 * 24 * 14;
  const authConfig = readCoupleAuthConfig();
  const payload = {
    v: 1,
    sid: crypto.randomBytes(16).toString("hex"),
    iss: authConfig.issuer,
    userId,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = signSessionPayload(payloadPart, authConfig.secret);

  return {
    token: `${payloadPart}.${signature}`,
    maxAgeSeconds: Math.floor(ttlMs / 1000),
  };
}

function verifyCoupleSessionToken(token) {
  const [payloadPart, signature] = String(token || "").split(".");
  if (!payloadPart || !signature) return null;

  const authConfig = readCoupleAuthConfig();
  const expectedSignature = signSessionPayload(payloadPart, authConfig.secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    return null;
  }

  if (payload?.v !== 1 || payload.iss !== authConfig.issuer) return null;
  if (!authConfig.profileIds.includes(payload.userId)) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;

  return {
    token,
    userId: payload.userId,
    createdAt: payload.iat,
    expiresAt: payload.exp,
  };
}

function getCoupleSessionToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1].trim();
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies.peos_couple_session || "";
}

function getCoupleSession(req) {
  return verifyCoupleSessionToken(getCoupleSessionToken(req));
}

function sendCoupleAuthRequired(res) {
  sendJson(res, 401, {
    ok: false,
    error: "login required",
  });
}

function getRequestDate(url) {
  return url.searchParams.get("date") || "";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clampWaitMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 25000;
  return Math.max(1000, Math.min(25000, Math.floor(parsed)));
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function addLocalDays(dateText, offset) {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function getDailySummaryCronTargetDate() {
  const targetMode = String(process.env.PEOS_COUPLE_DAILY_SUMMARY_CRON_TARGET || "yesterday").toLowerCase();
  const today = formatLocalDate();
  return targetMode === "today" ? today : addLocalDays(today, -1);
}

function msUntilNextDailySummaryRun() {
  const hour = Math.max(0, Math.min(23, Number(process.env.PEOS_COUPLE_DAILY_SUMMARY_HOUR || 4) || 4));
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function getSinceRevision(url) {
  const parsed = Number(url.searchParams.get("since") || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

async function waitForCoupleRevision(sinceRevision, timeoutMs) {
  const startedAt = Date.now();
  let revision = readCoupleRevision();

  while (revision.revision <= sinceRevision && Date.now() - startedAt < timeoutMs) {
    await sleep(700);
    revision = readCoupleRevision();
  }

  return revision;
}

function enqueueStartNewDayJob(payload) {
  ensureDir(startNewDayQueueDir);
  const queueId = `start-new-day-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queuePath = path.join(startNewDayQueueDir, `${queueId}.json`);
  writeJsonFile(queuePath, {
    id: queueId,
    status: "queued",
    createdAt: new Date().toISOString(),
    payload,
  });
  return {
    queueId,
    queuePath,
  };
}

function scheduleDailySummaryRefresh() {
  if (process.env.PEOS_COUPLE_DAILY_SUMMARY_CRON === "0") {
    return;
  }

  const delayMs = msUntilNextDailySummaryRun();
  const timer = setTimeout(() => {
    try {
      const targetDate = getDailySummaryCronTargetDate();
      const { result } = refreshCoupleDailySummary("system", {
        date: targetDate,
        useAgent: process.env.PEOS_COUPLE_DAILY_SUMMARY_AGENT === "1",
      });
      console.log(`Daily summary refreshed for ${targetDate} (${result.mode})`);
    } catch (error) {
      console.error(`Daily summary refresh failed: ${error.message}`);
    } finally {
      scheduleDailySummaryRefresh();
    }
  }, delayMs);
  timer.unref?.();
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Cache-Control": "no-store",
    });
    res.end();
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, port });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/couple/session") {
    const session = getCoupleSession(req);
    const bootstrap = readCouplePublicBootstrap();

    if (!session) {
      sendJson(res, 200, {
        ok: true,
        authenticated: false,
        ...bootstrap,
      });
      return true;
    }

    sendJson(res, 200, {
      ok: true,
      authenticated: true,
      state: getCoupleState(session.userId, { date: getRequestDate(url) }),
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/login") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const user = verifyCoupleLogin(body.login, body.password);

      if (!user) {
        sendJson(res, 401, {
          ok: false,
          error: "invalid login or password",
        });
        return true;
      }

      const session = createCoupleSession(user.id);
      sendJson(
        res,
        200,
        {
          ok: true,
          authenticated: true,
          sessionToken: session.token,
          state: getCoupleState(user.id, { date: body.date }),
        },
        {
          "Set-Cookie": createSessionCookie(session.token, session.maxAgeSeconds),
        }
      );
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/logout") {
    sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": createSessionCookie("", 0),
      }
    );
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/couple/state") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    const sinceRevision = getSinceRevision(url);
    const shouldWait = url.searchParams.get("wait") === "1" && sinceRevision > 0;

    if (shouldWait) {
      const latestRevision = await waitForCoupleRevision(sinceRevision, clampWaitMs(url.searchParams.get("timeoutMs")));
      if (latestRevision.revision <= sinceRevision) {
        sendJson(res, 200, {
          ok: true,
          changed: false,
          revision: latestRevision.revision,
          updatedAt: latestRevision.updatedAt,
        });
        return true;
      }
    }

    const nextState = getCoupleState(session.userId, { date: getRequestDate(url) });
    sendJson(res, 200, {
      ok: true,
      changed: sinceRevision ? nextState.revision > sinceRevision : true,
      state: nextState,
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/schedule/upsert") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = upsertCoupleScheduleItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/schedule/toggle") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = toggleCoupleScheduleItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/schedule/archive") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = archiveCoupleScheduleItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/schedule/delete") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = deleteCoupleScheduleItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        deleted: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/todos/upsert") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = upsertCoupleTodoItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/todos/toggle") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = toggleCoupleTodoItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/todos/archive") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = archiveCoupleTodoItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/todos/delete") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = deleteCoupleTodoItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        deleted: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/checkins/upsert") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = upsertCoupleCheckinItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/checkins/toggle") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = toggleCoupleCheckinItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/checkins/delete") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = deleteCoupleCheckinItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        deleted: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/deadlines/upsert") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = upsertCoupleDeadlineItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        item: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/deadlines/delete") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = deleteCoupleDeadlineItem(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        deleted: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/diary") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = updateCoupleDiaryDay(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        diaryDay: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/status") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = updateCoupleDiaryDay(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        statusDay: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/diary/asset") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = addCoupleDiaryAsset(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        ...result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/capture") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = addCoupleCapture(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        capture: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/daily-summary/refresh") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = refreshCoupleDailySummary(session.userId, {
        date: body.date,
        useAgent: body.useAgent === true,
      });
      sendJson(res, 200, {
        ok: true,
        dailySummary: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/personal-page") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = updateCouplePersonalPage(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        personalPage: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/profile") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = updateCoupleProfile(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        profile: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === "GET" && jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const job = backgroundJobs.get(jobId);
    if (!job) {
      sendJson(res, 404, { ok: false, error: "job not found" });
      return true;
    }
    sendJson(res, 200, { ok: true, job });
    return true;
  }

  const todoMatch = url.pathname.match(/^\/api\/todos\/([^/]+)\/status$/);
  if (req.method === "POST" && todoMatch) {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const todoId = decodeURIComponent(todoMatch[1]);
      const nextStatus = body.status;

      if (!allowedStatuses.has(nextStatus)) {
        sendJson(res, 400, {
          ok: false,
          error: `invalid status: ${nextStatus || ""}`,
          allowed: [...allowedStatuses],
        });
        return true;
      }

      const updatedTodo = updateTodoStatus(todoId, nextStatus);
      syncWebData();
      sendJson(res, 200, { ok: true, todo: updatedTodo });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  const scheduleMatch = url.pathname.match(/^\/api\/schedules\/weekly\/([^/]+)$/);
  if (req.method === "POST" && scheduleMatch) {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const weekId = decodeURIComponent(scheduleMatch[1]);
      const updatedWeek = updateWeeklySchedule(weekId, body);
      syncWebData();
      sendJson(res, 200, { ok: true, week: updatedWeek });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/home-index") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const updatedHomeIndex = updateHomeIndex(body);
      syncWebData();
      sendJson(res, 200, { ok: true, homeIndex: updatedHomeIndex });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/today-plan/schedule") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const result = linkTodayPlanToSchedule(body);
      syncWebData();
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/daily-checkin") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const updatedCheckin = updateDailyCheckin(body);
      syncWebData();
      sendJson(res, 200, { ok: true, dailyCheckin: updatedCheckin });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/core-contribution") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const updatedContribution = updateCoreContribution(body);
      syncWebData();
      sendJson(res, 200, { ok: true, coreContribution: updatedContribution });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/capture") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const capture = ingestCapture(body);
      syncWebData();
      sendJson(res, 200, { ok: true, capture });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/archive-capture") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const archive = archiveCapture(body);
      syncWebData();
      sendJson(res, 200, { ok: true, archive });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/capture-deposit-latest") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const jobId = createJob(() => {
        const archive = archiveLatestCapture(body);
        syncWebData();
        return archive;
      });
      sendJson(res, 202, { ok: true, jobId });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  const logRegenerateMatch = url.pathname.match(/^\/api\/logs\/daily\/([^/]+)\/regenerate$/);
  if (req.method === "POST" && logRegenerateMatch) {
    try {
      const dateKey = decodeURIComponent(logRegenerateMatch[1]);
      const jobId = createJob(() => {
        const generated = generateDailyLogWithCodex(dateKey);
        syncWebData();
        return generated;
      });
      sendJson(res, 202, { ok: true, jobId });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/start-new-day") {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const queued = enqueueStartNewDayJob(body);
      const jobId = createJob(() => {
        writeJsonFile(queued.queuePath, {
          id: queued.queueId,
          status: "running",
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          payload: body,
        });
        try {
          const result = startNewDay(body);
          syncWebData();
          writeJsonFile(queued.queuePath, {
            id: queued.queueId,
            status: "completed",
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            payload: body,
            result,
          });
          return {
            ...result,
            queueId: queued.queueId,
            queuedFile: path.relative(rootDir, queued.queuePath),
          };
        } catch (error) {
          writeJsonFile(queued.queuePath, {
            id: queued.queueId,
            status: "failed",
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            failedAt: new Date().toISOString(),
            payload: body,
            error: error.message,
          });
          throw error;
        }
      });
      sendJson(res, 202, {
        ok: true,
        jobId,
        queueId: queued.queueId,
        queuedFile: path.relative(rootDir, queued.queuePath),
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(req, res, url);
    if (!handled) {
      sendJson(res, 404, { ok: false, error: "not found" });
    }
    return;
  }

  if (!["GET", "HEAD"].includes(req.method)) {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  if (legacyWebEntryPaths.has(url.pathname)) {
    sendRedirect(res, `/web/index.html${url.search}${url.hash}`);
    return;
  }

  if (url.pathname.startsWith("/__content/") && !getCoupleSession(req)) {
    sendText(res, 401, "Login required");
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Personal Evolution OS server: http://${host}:${port}/web/index.html`);
  scheduleDailySummaryRefresh();
});
