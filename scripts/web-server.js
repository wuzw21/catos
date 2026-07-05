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
const { sendCcConnectMessage } = require("./cc-connect-outbound.js");
const {
  cancelScheduledCcConnectPush,
  createScheduledCcConnectPush,
  listScheduledCcConnectPushes,
  processDueScheduledCcConnectPushes,
} = require("./cc-connect-scheduler.js");
const {
  acceptCaptureRoute: acceptCoupleCaptureRoute,
  addCapture: addCoupleCapture,
  addDiaryAsset: addCoupleDiaryAsset,
  analyzeCapture: analyzeCoupleCapture,
  analyzeCaptureWithAgent: analyzeCoupleCaptureWithAgent,
  archiveCaptureItem: archiveCoupleCaptureItem,
  archiveScheduleItem: archiveCoupleScheduleItem,
  archiveTodoItem: archiveCoupleTodoItem,
  businessDate: getCoupleBusinessDate,
  createLifeCardsFromConfirmation: createCoupleLifeCardsFromConfirmation,
  deleteDayTimelineBlock: deleteCoupleDayTimelineBlock,
  deleteCheckinItem: deleteCoupleCheckinItem,
  deleteDeadlineItem: deleteCoupleDeadlineItem,
  deleteScheduleItem: deleteCoupleScheduleItem,
  deleteTodoItem: deleteCoupleTodoItem,
  getState: getCoupleState,
  markCatWordsRead: markCoupleCatWordsRead,
  readAuthConfig: readCoupleAuthConfig,
  readPublicBootstrap: readCouplePublicBootstrap,
  readRevision: readCoupleRevision,
  rememberLifeCard: rememberCoupleLifeCard,
  refreshDailySummary: refreshCoupleDailySummary,
  reorderLifeCards: reorderCoupleLifeCards,
  toggleCheckinItem: toggleCoupleCheckinItem,
  toggleDeadlineItem: toggleCoupleDeadlineItem,
  toggleLifeCardStep: toggleCoupleLifeCardStep,
  toggleLifeCardTimer: toggleCoupleLifeCardTimer,
  toggleScheduleItem: toggleCoupleScheduleItem,
  toggleTodoItem: toggleCoupleTodoItem,
  updateDayContext: updateCoupleDayContext,
  updateDiaryDay: updateCoupleDiaryDay,
  updatePersonalPage: updateCouplePersonalPage,
  updateProfile: updateCoupleProfile,
  upsertDayTimelineBlock: upsertCoupleDayTimelineBlock,
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
const loginFailures = new Map();
const startNewDayQueueDir = path.join(rootDir, "tmp", "start-new-day-jobs");
const requireHttps = /^(1|true|yes)$/i.test(String(process.env.PEOS_REQUIRE_HTTPS || ""));
const loginRateLimitWindowMs = Number(process.env.PEOS_LOGIN_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const loginRateLimitLockMs = Number(process.env.PEOS_LOGIN_RATE_LIMIT_LOCK_MS || 15 * 60 * 1000);
const loginRateLimitMaxFailures = Number(process.env.PEOS_LOGIN_RATE_LIMIT_MAX_FAILURES || 6);
let ccConnectScheduleProcessorRunning = false;
const privateSecurityHeaders = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
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
  ".webmanifest": "application/manifest+json; charset=utf-8",
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CC-Connect-Token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...privateSecurityHeaders,
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CC-Connect-Token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    ...privateSecurityHeaders,
  });
  res.end(message);
}

function sendXml(res, statusCode, xml) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/xml; charset=utf-8",
    ...privateSecurityHeaders,
  });
  res.end(xml);
}

function sendRedirect(res, location) {
  res.writeHead(302, {
    "Cache-Control": "no-store",
    ...privateSecurityHeaders,
    Location: location,
  });
  res.end();
}

function isHttpsRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return Boolean(req.socket.encrypted || forwardedProto === "https");
}

function clientAddress(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  return forwardedFor || realIp || req.socket.remoteAddress || "unknown";
}

function loginFailureKey(req, login) {
  return `${clientAddress(req)}:${String(login || "").trim().toLowerCase() || "unknown"}`;
}

function pruneLoginFailures(now = Date.now()) {
  for (const [key, record] of loginFailures.entries()) {
    const expiredWindow = now - Number(record.firstAt || 0) > loginRateLimitWindowMs;
    const expiredLock = Number(record.lockedUntil || 0) && Number(record.lockedUntil) <= now;
    if (expiredWindow && (!record.lockedUntil || expiredLock)) {
      loginFailures.delete(key);
    }
  }
}

function loginRateLimitStatus(req, login) {
  pruneLoginFailures();
  const key = loginFailureKey(req, login);
  const record = loginFailures.get(key);
  if (record?.lockedUntil && record.lockedUntil > Date.now()) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((record.lockedUntil - Date.now()) / 1000),
    };
  }
  return { limited: false, key };
}

function recordLoginFailure(key) {
  const now = Date.now();
  const current = loginFailures.get(key);
  const record = current && now - current.firstAt <= loginRateLimitWindowMs
    ? current
    : { firstAt: now, count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= loginRateLimitMaxFailures) {
    record.lockedUntil = now + loginRateLimitLockMs;
  }
  loginFailures.set(key, record);
  return record;
}

function clearLoginFailures(req, login) {
  loginFailures.delete(loginFailureKey(req, login));
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

function shouldServeAppFallback(req, pathname) {
  if (pathname.startsWith("/__content/") || pathname.startsWith("/web/assets/")) {
    return false;
  }

  const extension = path.extname(pathname);
  if (extension && extension !== ".html") {
    return false;
  }

  const accept = String(req.headers.accept || "");
  return !accept || accept.includes("text/html") || accept.includes("*/*");
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

  setTimeout(async () => {
    try {
      const result = await Promise.resolve(runner());
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

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getCcConnectRequestToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();
  return String(req.headers["x-cc-connect-token"] || "").trim();
}

function verifyCcConnectRequest(req) {
  const expected = String(process.env.PEOS_CC_CONNECT_TOKEN || "").trim();
  if (!expected) {
    return { ok: false, statusCode: 503, error: "cc-connect token is not configured" };
  }
  const actual = getCcConnectRequestToken(req);
  if (!actual || !timingSafeEqualText(actual, expected)) {
    return { ok: false, statusCode: 401, error: "invalid cc-connect token" };
  }
  return { ok: true };
}

function sha1Hex(input) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function wechatSignature(token, timestamp, nonce) {
  return sha1Hex([token, timestamp, nonce].map((item) => String(item || "")).sort().join(""));
}

function verifyWechatRequest(url) {
  const token = String(process.env.PEOS_WECHAT_TOKEN || "").trim();
  if (!token) {
    return { ok: false, statusCode: 503, error: "wechat token is not configured" };
  }

  const timestamp = url.searchParams.get("timestamp") || "";
  const nonce = url.searchParams.get("nonce") || "";
  const signature = String(url.searchParams.get("signature") || "").toLowerCase();
  const expected = wechatSignature(token, timestamp, nonce);
  if (!signature || !timingSafeEqualText(signature, expected)) {
    return { ok: false, statusCode: 401, error: "invalid wechat signature" };
  }

  return { ok: true };
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractXmlField(xml, fieldName) {
  const pattern = new RegExp(`<${fieldName}>\\s*([\\s\\S]*?)\\s*</${fieldName}>`, "i");
  const match = String(xml || "").match(pattern);
  if (!match) return "";
  const rawValue = match[1].trim();
  const cdataMatch = rawValue.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return decodeXmlEntities(cdataMatch ? cdataMatch[1] : rawValue).trim();
}

function parseWechatMessageXml(xml) {
  return {
    toUserName: extractXmlField(xml, "ToUserName"),
    fromUserName: extractXmlField(xml, "FromUserName"),
    createTime: extractXmlField(xml, "CreateTime"),
    msgType: extractXmlField(xml, "MsgType"),
    content: extractXmlField(xml, "Content"),
    msgId: extractXmlField(xml, "MsgId"),
    event: extractXmlField(xml, "Event"),
    eventKey: extractXmlField(xml, "EventKey"),
    encrypted: Boolean(extractXmlField(xml, "Encrypt")),
  };
}

function xmlCdata(value) {
  return `<![CDATA[${String(value || "").replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function wechatTextReply(message, content) {
  if (!message?.fromUserName || !message?.toUserName) return "success";
  return [
    "<xml>",
    `<ToUserName>${xmlCdata(message.fromUserName)}</ToUserName>`,
    `<FromUserName>${xmlCdata(message.toUserName)}</FromUserName>`,
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>`,
    `<MsgType>${xmlCdata("text")}</MsgType>`,
    `<Content>${xmlCdata(content)}</Content>`,
    "</xml>",
  ].join("");
}

function parseWechatUserMap() {
  const raw = String(process.env.PEOS_WECHAT_USER_MAP || "").trim();
  if (!raw) return new Map();

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return new Map(Object.entries(parsed).map(([key, value]) => [String(key).trim(), String(value).trim()]));
    }
  } catch {
    // Fall through to the compact openid:userId list format.
  }

  return new Map(
    raw
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf(":");
        if (separatorIndex < 0) return null;
        return [
          entry.slice(0, separatorIndex).trim(),
          entry.slice(separatorIndex + 1).trim(),
        ];
      })
      .filter(Boolean)
  );
}

function normalizeWechatUserId(message = {}) {
  const profileIds = readCoupleAuthConfig().profileIds || [];
  const mappedUserId = parseWechatUserMap().get(message.fromUserName);
  const raw = String(mappedUserId || process.env.PEOS_WECHAT_DEFAULT_USER || "you").trim();
  return profileIds.includes(raw) ? raw : (profileIds[0] || "you");
}

function createWechatCapture(message = {}) {
  const text = String(message.content || "").trim();
  if (!text) {
    throw new Error("wechat text message is required");
  }

  const userId = normalizeWechatUserId(message);
  const visibility = process.env.PEOS_WECHAT_DEFAULT_VISIBILITY === "private" ? "private" : "shared";
  const { result } = addCoupleCapture(userId, {
    date: getCoupleBusinessDate(),
    text,
    mode: "analysis",
    rawKind: "wechat-message",
    rawFormat: "markdown",
    analysisIntent: "agent",
    visibility,
    sourceType: "wechat",
    sourceId: message.msgId || `${message.fromUserName}:${message.createTime}`,
    sourceTitle: "WeChat",
  });

  return {
    userId,
    capture: result,
  };
}

function processWechatCapture(userId, capture, message = {}) {
  return processCcConnectCapture(userId, capture, {
    text: message.content,
    userId,
    analyze: process.env.PEOS_WECHAT_ANALYZE !== "0",
    autoAccept: process.env.PEOS_WECHAT_AUTO_ACCEPT !== "0",
    autoCreateSchedule: process.env.PEOS_WECHAT_AUTO_CREATE_SCHEDULE === "1",
    refreshDailySummary: process.env.PEOS_WECHAT_REFRESH_DAILY_SUMMARY === "1",
    useDailySummaryAgent: process.env.PEOS_WECHAT_DAILY_SUMMARY_AGENT === "1",
    model: process.env.PEOS_WECHAT_CAPTURE_AGENT_MODEL || process.env.PEOS_CAPTURE_AGENT_MODEL,
    reasoningEffort: process.env.PEOS_WECHAT_CAPTURE_AGENT_REASONING_EFFORT || process.env.PEOS_CAPTURE_AGENT_REASONING_EFFORT,
    includePrivate: capture.visibility === "private",
  });
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
  const today = getCoupleBusinessDate();
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

function clampClockPart(value, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

function parseClockTime(value, fallbackHour, fallbackMinute) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return {
      hour: clampClockPart(fallbackHour, 23, 22),
      minute: clampClockPart(fallbackMinute, 59, 0),
    };
  }
  return {
    hour: clampClockPart(match[1], 23, 22),
    minute: clampClockPart(match[2], 59, 0),
  };
}

function msUntilNextLocalClock(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function normalizeScheduledCcConnectPush(input = {}, index = 0) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (input.enabled === false) return null;
  const text = firstNonEmptyText([input.text, input.message, input.content]);
  if (!text) return null;
  const clock = parseClockTime(input.time, input.hour, input.minute);
  return {
    id: String(input.id || input.name || `scheduled-push-${index + 1}`).trim(),
    userId: input.userId || input.toUserId || input.recipient || "partner",
    text,
    hour: clock.hour,
    minute: clock.minute,
  };
}

function parseScheduledCcConnectPushes() {
  const pushes = [];
  const raw = String(process.env.PEOS_CC_CONNECT_SCHEDULED_PUSHES || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      entries.forEach((entry, index) => {
        const push = normalizeScheduledCcConnectPush(entry, index);
        if (push) pushes.push(push);
      });
    } catch (error) {
      console.error(`Invalid PEOS_CC_CONNECT_SCHEDULED_PUSHES: ${error.message}`);
    }
  }

  if (process.env.PEOS_CC_CONNECT_DAILY_DIARY_REMINDER === "1") {
    const clock = parseClockTime(
      process.env.PEOS_CC_CONNECT_DAILY_DIARY_REMINDER_TIME,
      process.env.PEOS_CC_CONNECT_DAILY_DIARY_REMINDER_HOUR || 22,
      process.env.PEOS_CC_CONNECT_DAILY_DIARY_REMINDER_MINUTE || 0
    );
    pushes.push({
      id: "daily-diary-reminder",
      userId: process.env.PEOS_CC_CONNECT_DAILY_DIARY_REMINDER_USER || "partner",
      text: process.env.PEOS_CC_CONNECT_DAILY_DIARY_REMINDER_TEXT || "记录今天的猫猫日记！",
      hour: clock.hour,
      minute: clock.minute,
    });
  }

  return pushes;
}

function getSinceRevision(url) {
  const parsed = Number(url.searchParams.get("since") || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function firstNonEmptyText(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const nested = firstNonEmptyText(value);
      if (nested) return nested;
    } else if (value && typeof value === "object") {
      const nested = firstNonEmptyText([
        value.text,
        value.content,
        value.message,
        value.value,
      ]);
      if (nested) return nested;
    }
  }
  return "";
}

function latestMessageText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const text = firstNonEmptyText([
      message?.text,
      message?.content,
      message?.message,
      message?.parts,
    ]);
    if (text) return text;
  }
  return "";
}

function extractCcConnectText(body = {}) {
  return firstNonEmptyText([
    body.text,
    body.content,
    body.message,
    body.input,
    body.query,
    body.prompt,
    body.data?.text,
    body.data?.content,
    body.data?.message,
    body.event?.text,
    body.event?.content,
    body.event?.message?.text,
    body.event?.message?.content,
    body.message?.text,
    body.message?.content,
    latestMessageText(body.messages),
    latestMessageText(body.conversation?.messages),
  ]);
}

function isCatOsHelpCommand(text) {
  return /^(?:\/help|help|帮助|\/帮助)$/i.test(String(text || "").trim());
}

function catOsHelpText() {
  return [
    "我是 CatOS 的 Reflection Agent。",
    "",
    "目标不是把日记写漂亮，而是让你更清楚地思考和复盘。",
    "",
    "规则：",
    "先理解，再解决。",
    "先挑战，再认同。",
    "保留“为什么当时这样想”。",
    "长期方向优先于短期效率。",
    "",
    "最终沉淀：",
    "Reflection / Decision / Progress / Insight / Next / 猫猫日记 100-200 字",
    "",
    "你可以这样发：",
    "今天很乱，我先倒一下...",
    "我今天做了一个决定，因为...",
    "我觉得这个 idea 能成，帮我挑战一下。",
    "最近一直拖延，帮我看模式。",
  ].join("\n");
}

function normalizeCcConnectUserId(body = {}) {
  const profileIds = readCoupleAuthConfig().profileIds || [];
  const raw = String(
    body.userId ||
    body.user_id ||
    body.createdBy ||
    body.actorId ||
    body.senderUserId ||
    body.sender?.userId ||
    body.sender?.id ||
    body.from?.userId ||
    body.from?.id ||
    body.metadata?.userId ||
    process.env.PEOS_CC_CONNECT_DEFAULT_USER ||
    "you"
  ).trim();

  const aliases = new Map([
    ["大猫", "you"],
    ["damao", "you"],
    ["me", "you"],
    ["小猫", "partner"],
    ["xiaomao", "partner"],
    ["cat", "partner"],
  ]);
  const normalized = aliases.get(raw) || raw;
  return profileIds.includes(normalized) ? normalized : (profileIds[0] || "you");
}

function normalizeCcConnectVisibility(value) {
  return value === "private" ? "private" : "shared";
}

function ccConnectRouteCanAutoAccept(confirmation, payload = {}) {
  const decision = confirmation?.decision || "capture";
  if (decision === "memory" || decision === "dailyStory") return payload.autoAccept !== false;
  if (decision === "schedule") return payload.autoCreateSchedule === true;
  return false;
}

function ccConnectReplyText(result) {
  const title = result.confirmation?.title || result.capture?.text || "这条消息";
  if (result.accepted?.decision === "schedule") return `已记录并生成猫猫的事：${title}`;
  if (result.accepted?.decision === "memory") return `已记录，并沉淀成长期记忆：${title}`;
  if (result.accepted?.decision === "dailyStory") return `已记录，会进入今天的猫猫日记：${title}`;
  if (result.confirmation?.decision === "schedule") return `已记录，并整理出待确认的猫猫的事：${title}`;
  if (result.confirmation?.decision === "capture") return `已记录为事件线索：${title}`;
  return `已记录并完成后台整理：${title}`;
}

function publicCcConnectSendResult(result = {}) {
  const target = result.target || {};
  return {
    ok: result.ok === true,
    dryRun: result.dryRun === true,
    code: result.code,
    target: {
      userId: target.userId || "",
      project: target.project || "",
      sessionConfigured: Boolean(target.session),
      dataDirConfigured: Boolean(target.dataDir),
    },
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function processCcConnectCapture(userId, capture, payload = {}) {
  const confirmation = payload.analyze === false
    ? null
    : await analyzeCoupleCaptureWithAgent(userId, {
        captureId: capture.id,
        date: capture.date,
        ownerId: userId,
        model: payload.model,
        reasoningEffort: payload.reasoningEffort,
        timeoutMs: payload.timeoutMs,
      });
  let accepted = null;
  if (confirmation && ccConnectRouteCanAutoAccept(confirmation, payload)) {
    const { result } = acceptCoupleCaptureRoute(userId, {
      ...confirmation,
      sourceCaptureId: capture.id,
      captureId: capture.id,
      date: confirmation.date || capture.date,
    });
    accepted = {
      decision: result.decision,
      cards: result.cards || [],
      capture: result.capture,
    };
  }

  let dailySummary = null;
  if (payload.refreshDailySummary === true) {
    const { result } = refreshCoupleDailySummary(userId, {
      date: capture.date,
      includePrivate: payload.includePrivate === true,
      useAgent: payload.useDailySummaryAgent === true,
      requireAgent: payload.requireDailySummaryAgent === true,
      model: payload.dailySummaryModel,
      reasoningEffort: payload.dailySummaryReasoningEffort,
      timeoutMs: payload.dailySummaryTimeoutMs,
    });
    dailySummary = result;
  }

  const result = {
    capture,
    confirmation,
    accepted,
    dailySummary,
  };
  return {
    ...result,
    reply: ccConnectReplyText(result),
  };
}

function createCcConnectCapture(body = {}) {
  const text = extractCcConnectText(body);
  if (!text) {
    throw new Error("message text is required");
  }

  const userId = normalizeCcConnectUserId(body);
  const date = body.date || body.selectedDate || getCoupleBusinessDate();
  const { result } = addCoupleCapture(userId, {
    date,
    text,
    mode: body.analyze === false ? "save" : "analysis",
    rawKind: "cc-connect-message",
    rawFormat: "markdown",
    analysisIntent: body.analyze === false ? "" : "agent",
    visibility: normalizeCcConnectVisibility(body.visibility),
    location: body.location || body.metadata?.location || "",
    sourceType: "cc-connect",
    sourceId: body.messageId || body.message_id || body.id || body.eventId || body.event_id || "",
  });

  return {
    userId,
    capture: result,
  };
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

function scheduleCcConnectPush(push) {
  const delayMs = msUntilNextLocalClock(push.hour, push.minute);
  const timer = setTimeout(async () => {
    try {
      const result = await sendCcConnectMessage({
        userId: push.userId,
        text: push.text,
      });
      console.log(`CC Connect scheduled push sent: ${push.id} -> ${result.target.userId}`);
    } catch (error) {
      console.error(`CC Connect scheduled push failed (${push.id}): ${error.message}`);
    } finally {
      scheduleCcConnectPush(push);
    }
  }, delayMs);
  timer.unref?.();
}

function scheduleCcConnectPushes() {
  const pushes = parseScheduledCcConnectPushes();
  for (const push of pushes) {
    scheduleCcConnectPush(push);
  }
  if (pushes.length > 0) {
    console.log(`Scheduled ${pushes.length} CC Connect push job(s)`);
  }
}

async function runCcConnectScheduleProcessor() {
  if (ccConnectScheduleProcessorRunning) return;
  ccConnectScheduleProcessorRunning = true;
  try {
    const results = await processDueScheduledCcConnectPushes();
    for (const result of results) {
      if (result.ok) {
        console.log(`CC Connect scheduled queue sent: ${result.job.id} -> ${result.job.userId}`);
      } else {
        console.error(`CC Connect scheduled queue failed: ${result.job.id} -> ${result.error}`);
      }
    }
  } catch (error) {
    console.error(`CC Connect scheduled queue processor failed: ${error.message}`);
  } finally {
    ccConnectScheduleProcessorRunning = false;
  }
}

function scheduleCcConnectQueueProcessor() {
  if (process.env.PEOS_CC_CONNECT_SCHEDULED_QUEUE === "0") {
    return;
  }
  const intervalMs = Math.max(5000, Number(process.env.PEOS_CC_CONNECT_SCHEDULED_QUEUE_INTERVAL_MS || 30 * 1000));
  runCcConnectScheduleProcessor();
  const timer = setInterval(runCcConnectScheduleProcessor, intervalMs);
  timer.unref?.();
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CC-Connect-Token",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Cache-Control": "no-store",
      ...privateSecurityHeaders,
    });
    res.end();
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, port });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/integrations/wechat") {
    const auth = verifyWechatRequest(url);
    if (!auth.ok) {
      sendText(res, auth.statusCode, auth.error);
      return true;
    }

    sendText(res, 200, url.searchParams.get("echostr") || "");
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/wechat") {
    const auth = verifyWechatRequest(url);
    if (!auth.ok) {
      sendText(res, auth.statusCode, auth.error);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const message = parseWechatMessageXml(bodyText);
      if (message.encrypted) {
        sendText(res, 400, "encrypted wechat messages are not supported; use plaintext mode");
        return true;
      }

      if (message.msgType === "event" && message.event.toLowerCase() === "subscribe") {
        sendXml(res, 200, wechatTextReply(message, "已经连接到猫猫日记。发一段文字，我会在后台整理。"));
        return true;
      }

      if (message.msgType !== "text") {
        sendXml(res, 200, wechatTextReply(message, "已收到。目前微信入口先支持文字消息记录。"));
        return true;
      }

      if (isCatOsHelpCommand(message.content)) {
        sendXml(res, 200, wechatTextReply(message, catOsHelpText()));
        return true;
      }

      const { userId, capture } = createWechatCapture(message);
      const jobId = createJob(() => processWechatCapture(userId, capture, message));
      console.log(`Queued WeChat capture ${capture.id} as ${jobId}`);
      sendXml(res, 200, wechatTextReply(message, "已收到，我会在后台整理进猫猫日记。"));
    } catch (error) {
      sendText(res, 400, error.message);
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/cc-connect/message") {
    const auth = verifyCcConnectRequest(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, error: auth.error });
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const text = extractCcConnectText(body);
      if (isCatOsHelpCommand(text)) {
        const userId = normalizeCcConnectUserId(body);
        sendJson(res, 200, {
          ok: true,
          userId,
          command: "help",
          reply: catOsHelpText(),
        });
        return true;
      }
      const { userId, capture } = createCcConnectCapture(body);
      const runCapture = () => processCcConnectCapture(userId, capture, body);

      if (body.async === false) {
        const result = await runCapture();
        sendJson(res, 200, {
          ok: true,
          userId,
          ...result,
          state: body.includeState === true ? getCoupleState(userId, { date: capture.date }) : undefined,
        });
        return true;
      }

      const jobId = createJob(runCapture);
      sendJson(res, 202, {
        ok: true,
        status: "queued",
        jobId,
        userId,
        capture,
        reply: "已收到，我会在服务器后台整理进猫猫日记。",
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/cc-connect/send") {
    const auth = verifyCcConnectRequest(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, error: auth.error });
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const result = await sendCcConnectMessage({
        userId: body.userId || body.toUserId || body.recipient || body.to,
        text: firstNonEmptyText([body.text, body.message, body.content]),
        project: body.project,
        session: body.session || body.sessionKey,
        dataDir: body.dataDir,
        timeoutMs: body.timeoutMs,
        dryRun: body.dryRun === true,
      });
      sendJson(res, 200, {
        ok: true,
        ...publicCcConnectSendResult(result),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
        result: error.result ? publicCcConnectSendResult(error.result) : undefined,
      });
    }
    return true;
  }

  if (url.pathname === "/api/integrations/cc-connect/schedule") {
    const auth = verifyCcConnectRequest(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, error: auth.error });
      return true;
    }

    if (req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        jobs: listScheduledCcConnectPushes({
          status: url.searchParams.get("status") || "",
          userId: url.searchParams.get("userId") || "",
          limit: url.searchParams.get("limit") || 100,
        }),
      });
      return true;
    }

    if (req.method === "POST") {
      try {
        const bodyText = await readBody(req);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const result = createScheduledCcConnectPush({
          userId: body.userId || body.toUserId || body.recipient || body.to,
          text: firstNonEmptyText([body.text, body.message, body.content]),
          scheduledAt: body.scheduledAt || body.at,
          date: body.date,
          time: body.time,
          delayMs: body.delayMs,
          idempotencyKey: body.idempotencyKey || body.key,
          createdBy: body.createdBy || "cc-connect-api",
        });
        sendJson(res, result.created ? 201 : 200, {
          ok: true,
          ...result,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/cc-connect/schedule/cancel") {
    const auth = verifyCcConnectRequest(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, error: auth.error });
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const result = cancelScheduledCcConnectPush(body.id);
      sendJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/integrations/cc-connect/schedule/run-due") {
    const auth = verifyCcConnectRequest(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, error: auth.error });
      return true;
    }

    try {
      const results = await processDueScheduledCcConnectPushes();
      sendJson(res, 200, {
        ok: true,
        results,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
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
      const rateLimit = loginRateLimitStatus(req, body.login);
      if (rateLimit.limited) {
        sendJson(
          res,
          429,
          {
            ok: false,
            error: "too many login attempts",
          },
          {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          }
        );
        return true;
      }
      const user = verifyCoupleLogin(body.login, body.password);

      if (!user) {
        recordLoginFailure(rateLimit.key);
        sendJson(res, 401, {
          ok: false,
          error: "invalid login or password",
        });
        return true;
      }

      clearLoginFailures(req, body.login);
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

  if (req.method === "POST" && url.pathname === "/api/couple/deadlines/toggle") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = toggleCoupleDeadlineItem(session.userId, body);
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

  if (req.method === "POST" && url.pathname === "/api/couple/capture/archive") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = archiveCoupleCaptureItem(session.userId, body);
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

  if (req.method === "POST" && url.pathname === "/api/couple/cat-words/read") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = markCoupleCatWordsRead(session.userId, body);
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

  if (req.method === "POST" && url.pathname === "/api/couple/capture/analyze") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      if (body.analysisMode === "agent") {
        const jobId = createJob(async () => {
          const confirmation = await analyzeCoupleCaptureWithAgent(session.userId, body);
          return {
            confirmation,
            state: getCoupleState(session.userId, { date: body.date || confirmation.date }),
          };
        });
        sendJson(res, 202, {
          ok: true,
          jobId,
          status: "running",
        });
        return true;
      }
      const confirmation = analyzeCoupleCapture(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        confirmation,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/life-cards/from-confirmation") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = createCoupleLifeCardsFromConfirmation(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        cards: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/capture/route") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = acceptCoupleCaptureRoute(session.userId, body);
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

  if (req.method === "POST" && url.pathname === "/api/couple/life-cards/step-toggle") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = toggleCoupleLifeCardStep(session.userId, body);
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

  if (req.method === "POST" && url.pathname === "/api/couple/life-cards/timer-toggle") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = toggleCoupleLifeCardTimer(session.userId, body);
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

  if (req.method === "POST" && url.pathname === "/api/couple/life-cards/reorder") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = reorderCoupleLifeCards(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        order: result,
        state: getCoupleState(session.userId, { date: body.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/life-cards/remember") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = rememberCoupleLifeCard(session.userId, body);
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

  if (req.method === "POST" && url.pathname === "/api/couple/day-timeline/upsert") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = upsertCoupleDayTimelineBlock(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        block: result,
        state: getCoupleState(session.userId, { date: body.date || result.date }),
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/day-timeline/delete") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = deleteCoupleDayTimelineBlock(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        deleted: result,
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
      const refreshPayload = {
        date: body.date,
        includePrivate: body.includePrivate === true,
        useAgent: body.useAgent !== false,
        requireAgent: body.requireAgent === true,
        model: body.model,
        reasoningEffort: body.reasoningEffort,
        timeoutMs: body.timeoutMs,
      };
      const runRefresh = () => {
        const { result } = refreshCoupleDailySummary(session.userId, refreshPayload);
        return {
          dailySummary: result,
          state: getCoupleState(session.userId, { date: body.date || result.date }),
        };
      };
      if (body.async === true) {
        const jobId = createJob(runRefresh);
        sendJson(res, 202, {
          ok: true,
          jobId,
          status: "running",
        });
        return true;
      }

      const result = runRefresh();
      sendJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/couple/day-context") {
    const session = getCoupleSession(req);
    if (!session) {
      sendCoupleAuthRequired(res);
      return true;
    }

    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const { result } = updateCoupleDayContext(session.userId, body);
      sendJson(res, 200, {
        ok: true,
        dayContext: result,
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

  if (requireHttps && !isHttpsRequest(req)) {
    if (["GET", "HEAD"].includes(req.method)) {
      sendRedirect(res, `https://${req.headers.host || `localhost:${port}`}${req.url}`);
    } else {
      sendText(res, 403, "HTTPS required");
    }
    return;
  }

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
    if (!shouldServeAppFallback(req, url.pathname)) {
      sendText(res, 404, "Not Found");
      return;
    }

    const appFilePath = resolveStaticPath("/web/index.html");
    if (!appFilePath || !fs.existsSync(appFilePath) || !fs.statSync(appFilePath).isFile()) {
      sendText(res, 404, "Not Found");
      return;
    }

    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[".html"],
      ...privateSecurityHeaders,
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(appFilePath).pipe(res);
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    ...privateSecurityHeaders,
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
  scheduleCcConnectPushes();
  scheduleCcConnectQueueProcessor();
});
