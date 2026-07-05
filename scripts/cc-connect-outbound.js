const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const defaultTimeoutMs = 30 * 1000;

function normalizeProfileId(value) {
  const raw = String(value || "").trim();
  const aliases = new Map([
    ["大猫", "you"],
    ["damao", "you"],
    ["me", "you"],
    ["小猫", "partner"],
    ["xiaomao", "partner"],
    ["cat", "partner"],
  ]);
  return aliases.get(raw) || raw;
}

function parseJsonEnv(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    throw new Error(`${name} must be a JSON object: ${error.message}`);
  }
}

function envForUser(prefix, userId) {
  const normalized = String(userId || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  return `${prefix}_${normalized}`;
}

function normalizeTargetEntry(entry) {
  if (!entry) return {};
  if (typeof entry === "string") return { session: entry };
  if (typeof entry !== "object" || Array.isArray(entry)) return {};
  return {
    project: entry.project,
    session: entry.session || entry.sessionKey || entry.session_key,
    dataDir: entry.dataDir || entry.data_dir,
  };
}

function resolveCcConnectTarget(input = {}) {
  const userId = normalizeProfileId(input.userId || input.toUserId || input.recipient || "partner");
  const targetMap = {
    ...parseJsonEnv("PEOS_CC_CONNECT_OUTBOUND_TARGETS"),
    ...parseJsonEnv("PEOS_CC_CONNECT_OUTBOUND_MAP"),
  };
  const mapped = normalizeTargetEntry(targetMap[userId]);
  const target = {
    userId,
    project: input.project || mapped.project || process.env.PEOS_CC_CONNECT_PROJECT || "",
    session: input.session || input.sessionKey || mapped.session || process.env[envForUser("PEOS_CC_CONNECT_SESSION", userId)] || "",
    dataDir: resolvePathFromHome(input.dataDir || mapped.dataDir || process.env.PEOS_CC_CONNECT_DATA_DIR || ""),
  };

  if (!target.session) {
    throw new Error(`No CC Connect outbound session configured for user ${userId}`);
  }

  return target;
}

function ccConnectBinary() {
  return String(process.env.PEOS_CC_CONNECT_BIN || "cc-connect").trim() || "cc-connect";
}

function compactOutput(value, maxLength = 4000) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function buildCcConnectSendArgs(target) {
  const args = ["send", "--stdin"];
  if (target.project) args.push("--project", target.project);
  if (target.session) args.push("--session", target.session);
  if (target.dataDir) args.push("--data-dir", target.dataDir);
  return args;
}

function sendCcConnectMessage(input = {}) {
  const text = String(input.text || input.message || "").trim();
  if (!text) {
    throw new Error("message text is required");
  }

  const target = resolveCcConnectTarget(input);
  const args = buildCcConnectSendArgs(target);
  const timeoutMs = Math.max(1000, Number(input.timeoutMs || process.env.PEOS_CC_CONNECT_SEND_TIMEOUT_MS || defaultTimeoutMs));
  const command = ccConnectBinary();

  if (input.dryRun === true) {
    return Promise.resolve({
      ok: true,
      dryRun: true,
      command,
      args,
      target,
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: input.cwd || process.cwd(),
      env: {
        ...process.env,
        HOME: process.env.HOME || os.homedir(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`cc-connect send timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        ok: code === 0,
        code,
        target,
        stdout: compactOutput(stdout.trim()),
        stderr: compactOutput(stderr.trim()),
      };
      if (code === 0) {
        resolve(result);
        return;
      }
      const message = result.stderr || result.stdout || `cc-connect send failed with exit code ${code}`;
      const error = new Error(message);
      error.result = result;
      reject(error);
    });

    child.stdin.end(text);
  });
}

function resolvePathFromHome(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("~/")) return text;
  return path.join(os.homedir(), text.slice(2));
}

module.exports = {
  normalizeProfileId,
  resolveCcConnectTarget,
  resolvePathFromHome,
  sendCcConnectMessage,
};
