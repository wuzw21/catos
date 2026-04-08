const http = require("http");
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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(message);
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

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
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
});
