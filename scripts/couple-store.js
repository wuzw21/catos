const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { contentPath, relativeToContent, repoPath, repoRoot } = require("./lib/runtime-paths.js");

const storePath = contentPath("private", "couple-workspace.json");
const dailySummarySchemaPath = repoPath("schemas", "couple-daily-summary.schema.json");

const segmentDefinitions = [
  { key: "allDay", label: "全天" },
  { key: "morning", label: "上午" },
  { key: "noon", label: "中午" },
  { key: "afternoon", label: "下午" },
  { key: "evening", label: "晚上" },
];
const segmentStartTimes = {
  allDay: "10:00",
  morning: "09:00",
  noon: "12:30",
  afternoon: "15:00",
  evening: "19:30",
};

const validSegments = new Set(segmentDefinitions.map((item) => item.key));
const validVisibilities = new Set(["shared", "private"]);
const validCaptureModes = new Set(["save", "analysis", "todo"]);
const validStatuses = new Set(["todo", "done"]);
const validPriorities = new Set(["low", "normal", "high"]);
const validTodoBuckets = new Set(["today", "future"]);
const validScheduleItemTypes = new Set(["thing", "work", "date", "purchase", "reminder", "checkin", "habit"]);
const validImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxImageBytes = 5 * 1024 * 1024;
const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const quickWeekdayIndex = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const scheduleItemTypeLabels = {
  thing: "事情",
  work: "工作",
  date: "约会",
  purchase: "购买",
  reminder: "提醒",
  checkin: "打卡",
  habit: "习惯",
};
const relationshipInsightKindLabels = {
  preference: "偏好",
  wish: "心愿",
  purchase: "购买",
  promise: "承诺",
  care: "照顾",
  anniversary: "预案",
  memory: "回忆",
  gratitude: "感谢",
  repair: "修复",
  identity: "关系",
  goal: "目标",
  list: "清单",
};
const captureRouteDestinations = [
  { key: "capture", label: "Raw Capture", description: "只保存原始 markdown/photo，用于以后总结、检索和回看。" },
  { key: "schedule", label: "Schedule Item", description: "生成生活卡，支持事情、工作、约会、购买、提醒、打卡、习惯。" },
  { key: "memory", label: "Long-term Memory", description: "沉淀成偏好、心愿、购买、承诺、照顾、纪念、感谢、修复、关系资料。" },
  { key: "dailyStory", label: "Daily Story", description: "作为当天日总结素材，不直接生成生活卡。" },
];
const captureAgentPrompt = [
  "你是 PEOS 双人生活系统的 Capture Router。",
  "所有用户输入必须先作为 raw markdown/photo 保存，分析结果不能覆盖 raw。",
  "只能在以下目标中选择或组合：",
  ...captureRouteDestinations.map((item) => `- ${item.key}: ${item.label}。${item.description}`),
  "Schedule Item 的 itemType 只能是 thing/work/date/purchase/reminder/checkin/habit。",
  "Long-term Memory 的 kind 只能是 preference/wish/purchase/promise/care/anniversary/memory/gratitude/repair/identity/goal/list。",
  "必须解析相对日期：今天、明天、今晚、今天下午、周日、下周一、具体月日。",
  "如果一句话包含多个动作，要输出 relatedItems，并用 relatedGroupId 表示一改全动的关系。",
  "输出轻确认，不直接写入最终生活卡，除非用户确认。",
].join("\n");
const defaultLifeCardTitle = "今天有没有开开心心？";
const importantEventPattern = /答辩|考试|面试|汇报|演讲|提交|材料|ddl|deadline|截止|证件|面谈|复试|重要(?!的一件事)/i;
const anniversaryPattern = /纪念日|周年|生日|情人节|七夕|圣诞|跨年|节日|纪念/i;
const promisePattern = /答应|承诺|说好|我(?:会|来|去|周末|今晚|明天|下次|之后|以后)?[^。！？\n]{0,18}(?:帮你|给你|带你|陪你|替你|负责|弄|整理|修|买|订|处理|搞定)/;
const wishPattern = /想(?:要|去|吃|买|看|体验|喝|逛|试|拍|一起)?|好想|以后想|以后要|想一起/;
const preferencePattern = /喜欢|不喜欢|讨厌|雷区|边界|偏好|好闻|爱吃|不爱|不要太|别太|太吵|安静/;
const gratitudePattern = /谢谢|感谢|辛苦|帮我|帮了|照顾|做了|准备了/;
const repairPattern = /吵架|争执|生气|委屈|难过|不开心|冷战|道歉|修复/;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(dateText) {
  const parsed = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(dateText, offset) {
  const date = parseDate(normalizeDate(dateText)) || new Date();
  date.setDate(date.getDate() + offset);
  return formatDate(date);
}

function daysBetween(startDateText, endDateText) {
  const start = parseDate(normalizeDate(startDateText));
  const end = parseDate(normalizeDate(endDateText));
  if (!start || !end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function normalizeDate(dateText, fallback = formatDate()) {
  const value = String(dateText || "").trim();
  return parseDate(value) ? value : fallback;
}

function normalizeSegment(segment) {
  return validSegments.has(segment) ? segment : "allDay";
}

function normalizePriority(priority) {
  return validPriorities.has(priority) ? priority : "normal";
}

function normalizeTodoBucket(bucket) {
  return validTodoBuckets.has(bucket) ? bucket : "today";
}

function normalizeScheduleItemType(itemType, fallback = "thing") {
  return validScheduleItemTypes.has(itemType) ? itemType : fallback;
}

function inferScheduleItemType(payload, fallback = "thing") {
  if (validScheduleItemTypes.has(payload?.itemType)) {
    return payload.itemType;
  }

  const text = `${payload?.title || ""} ${payload?.detail || ""}`;
  if (/工作|会议|开会|项目|任务|需求|评审|复盘|周报|汇报|工位|加班|客户|面试/i.test(text)) return "work";
  if (/买|购|下单|采购|补货/.test(text)) return "purchase";
  if (/提醒|记得|别忘|ddl|截止|deadline/i.test(text)) return "reminder";
  if (/习惯|每天|每日|每周|周期|固定/.test(text)) return "habit";
  if (/打卡|签到|记录/.test(text)) return "checkin";
  if (/约|见|聚|电影|吃饭|吃|日料|餐厅|晚饭|午饭|晚餐|午餐|咖啡|看展|散步|一起/.test(text)) return "date";
  return fallback;
}

function sourceTypeForItemType(itemType) {
  const normalized = normalizeScheduleItemType(itemType, "thing");
  if (normalized === "checkin" || normalized === "habit") return "checkin";
  if (normalized === "purchase" || normalized === "thing" || normalized === "work") return "todo";
  return "schedule";
}

function normalizeDailyScore(value, fallback = 0) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(10, Math.round(score)));
}

function isArchived(item) {
  return Boolean(item?.archivedAt);
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(input, maxLength = 500) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\|/g, "/")
    .trim()
    .slice(0, maxLength);
}

function normalizeColor(input, fallback = "#ff5c9a") {
  const value = String(input || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value.slice(1).split("").map((part) => `${part}${part}`).join("")}`.toLowerCase();
  }
  return fallback;
}

function sanitizeMarkdown(input, maxLength = 20000) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\0/g, "")
    .trim()
    .slice(0, maxLength);
}

function sanitizeList(items, maxItems = 8, maxLength = 180) {
  return (Array.isArray(items) ? items : [])
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeDurationMin(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(5, Math.min(1440, Math.round(parsed)));
}

function normalizeDateTime(value) {
  const raw = sanitizeText(value, 40).replace(" ", "T");
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2}):?(\d{2})?(?::\d{2})?$/);
  if (!match) return "";
  const date = normalizeDate(match[1], "");
  if (!date) return "";
  const hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${date}T${pad(hour)}:${pad(minute)}`;
}

function dateTimeForSegment(date, segment) {
  return `${normalizeDate(date)}T${segmentStartTimes[normalizeSegment(segment)] || segmentStartTimes.allDay}`;
}

function addMinutesToDateTime(dateTime, minutes) {
  const normalized = normalizeDateTime(dateTime);
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setMinutes(parsed.getMinutes() + normalizeDurationMin(minutes, 30));
  return `${formatDate(parsed)}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function chineseNumberToInt(value) {
  const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return map[value] || 0;
}

function inferDurationMin(text) {
  const raw = String(text || "");
  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:个)?(?:小时|h|hour)/i);
  if (hourMatch) return normalizeDurationMin(Number(hourMatch[1]) * 60);
  const minuteMatch = raw.match(/(\d+)\s*(?:分钟|分|min)/i);
  if (minuteMatch) return normalizeDurationMin(minuteMatch[1]);
  const chineseHour = raw.match(/([一二两三四五六七八九十])\s*(?:个)?小时/);
  if (chineseHour) return normalizeDurationMin(chineseNumberToInt(chineseHour[1]) * 60);
  if (/半小时|半个小时/.test(raw)) return 30;
  if (/作业|论文|报告|方案|项目|复习|答辩|考试|整理照片|收拾|大扫除|改动|重构/.test(raw)) return 90;
  if (/买|下单|预约|订|发一句|提醒|带材料|拿|取/.test(raw)) return 20;
  return 0;
}

function inferClockTime(text, segment) {
  const raw = String(text || "");
  const match = raw.match(/([01]?\d|2[0-3])\s*(?:[:：点])\s*(\d{1,2})?/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if ((/下午|晚上|今晚|夜里/.test(raw) || ["afternoon", "evening"].includes(segment)) && hour < 12) {
    hour += 12;
  }
  if (minute < 0 || minute > 59) return "";
  return `${pad(hour)}:${pad(minute)}`;
}

function inferPlannedAt(text, date, segment, durationMin) {
  const normalizedDate = normalizeDate(date);
  const normalizedSegment = normalizeSegment(segment);
  const clock = inferClockTime(text, normalizedSegment);
  if (clock) return `${normalizedDate}T${clock}`;
  if (normalizedSegment !== "allDay" || durationMin) return dateTimeForSegment(normalizedDate, normalizedSegment);
  return "";
}

function inferDueAt(text, date, segment) {
  const raw = String(text || "");
  if (!/(?:ddl|deadline|截止|之前|前\b|前完成|前提交|到期)/i.test(raw)) return "";
  const clock = inferClockTime(raw, normalizeSegment(segment));
  return `${normalizeDate(date)}T${clock || "23:59"}`;
}

function normalizeLifeCardSteps(steps, participants = []) {
  return (Array.isArray(steps) ? steps : [])
    .map((step, index) => {
      const source = typeof step === "string" ? { title: step } : (step || {});
      const title = sanitizeText(source.title, 120);
      if (!title) return null;
      const ownerId = participants.includes(source.ownerId) ? source.ownerId : "";
      return {
        id: sanitizeText(source.id, 80) || `step-${index + 1}`,
        title,
        ownerId,
        estimateMin: normalizeDurationMin(source.estimateMin, 0),
        status: validStatuses.has(source.status) ? source.status : "todo",
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 8);
}

function inferLifeCardSteps(payload, participants = []) {
  const text = `${payload.title || ""} ${payload.detail || ""}`.trim();
  const clauses = splitCaptureClauses(text)
    .map((part) => cleanCaptureTitle(part))
    .filter((part) => part && part !== cleanCaptureTitle(payload.title || ""))
    .slice(0, 4);
  const durationMin = normalizeDurationMin(payload.durationMin, 0);
  let titles = clauses;

  if (!titles.length && (durationMin >= 75 || /作业|论文|报告|方案|项目|复习|答辩|考试|整理|收拾|改动|重构/.test(text))) {
    if (/作业|论文|报告|方案|项目|复习|答辩|考试/.test(text)) {
      titles = ["拆清楚要做什么", "完成主体部分", "检查并收尾"];
    } else if (/整理|收拾|照片|文件/.test(text)) {
      titles = ["先归类", "集中处理", "收尾确认"];
    } else {
      titles = ["定一下做法", "完成主要部分", "检查结果"];
    }
  }

  if (!titles.length) return [];
  const estimate = durationMin ? Math.max(10, Math.round(durationMin / titles.length)) : 0;
  return titles.map((title, index) => ({
    id: `step-${index + 1}`,
    title,
    ownerId: participants[index % Math.max(1, participants.length)] || "",
    estimateMin: estimate,
    status: "todo",
    sortOrder: index,
  }));
}

function normalizeLifeCardTimeBlocks(blocks, steps = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => {
      const startAt = normalizeDateTime(block?.startAt);
      const durationMin = normalizeDurationMin(block?.durationMin, 0);
      if (!startAt && !durationMin) return null;
      const endAt = normalizeDateTime(block?.endAt) || (startAt && durationMin ? addMinutesToDateTime(startAt, durationMin) : "");
      const stepId = steps.some((step) => step.id === block?.stepId) ? block.stepId : "";
      return {
        id: sanitizeText(block?.id, 80) || `block-${index + 1}`,
        stepId,
        startAt,
        endAt,
        durationMin,
        status: ["planned", "done", "skipped"].includes(block?.status) ? block.status : "planned",
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function inferLifeCardTimeBlocks(payload, steps = []) {
  const plannedAt = normalizeDateTime(payload.plannedAt);
  const durationMin = normalizeDurationMin(payload.durationMin, 0);
  if (!plannedAt && !durationMin) return [];
  const blockDuration = durationMin ? Math.min(durationMin, 90) : 30;
  return [{
    id: "block-1",
    stepId: steps[0]?.id || "",
    startAt: plannedAt || dateTimeForSegment(payload.date, payload.segment),
    endAt: addMinutesToDateTime(plannedAt || dateTimeForSegment(payload.date, payload.segment), blockDuration),
    durationMin: blockDuration,
    status: "planned",
  }];
}

function buildLifeCardPlanning(payload = {}, existing = {}) {
  const date = normalizeDate(payload.date || existing.date);
  const segment = normalizeSegment(payload.segment || existing.segment);
  const text = `${payload.title ?? existing.title ?? ""} ${payload.detail ?? existing.detail ?? ""}`.trim();
  const participants = Array.isArray(payload.participants) ? payload.participants : (Array.isArray(existing.participants) ? existing.participants : []);
  const durationMin = normalizeDurationMin(
    payload.durationMin,
    normalizeDurationMin(existing.durationMin, inferDurationMin(text))
  );
  const plannedAt = normalizeDateTime(payload.plannedAt) || normalizeDateTime(existing.plannedAt) || inferPlannedAt(text, date, segment, durationMin);
  const dueAt = normalizeDateTime(payload.dueAt) || normalizeDateTime(existing.dueAt) || inferDueAt(text, date, segment);
  const steps = normalizeLifeCardSteps(payload.steps, participants).length
    ? normalizeLifeCardSteps(payload.steps, participants)
    : (normalizeLifeCardSteps(existing.steps, participants).length
        ? normalizeLifeCardSteps(existing.steps, participants)
        : inferLifeCardSteps({ ...payload, title: payload.title ?? existing.title, detail: payload.detail ?? existing.detail, durationMin }, participants));
  const timeBlocks = normalizeLifeCardTimeBlocks(payload.timeBlocks, steps).length
    ? normalizeLifeCardTimeBlocks(payload.timeBlocks, steps)
    : (normalizeLifeCardTimeBlocks(existing.timeBlocks, steps).length
        ? normalizeLifeCardTimeBlocks(existing.timeBlocks, steps)
        : inferLifeCardTimeBlocks({ ...payload, date, segment, plannedAt, durationMin }, steps));

  return { plannedAt, dueAt, durationMin, steps, timeBlocks };
}

function publicPlanningFields(item) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const steps = normalizeLifeCardSteps(item.steps, participants);
  return {
    plannedAt: normalizeDateTime(item.plannedAt),
    dueAt: normalizeDateTime(item.dueAt),
    durationMin: normalizeDurationMin(item.durationMin, 0),
    steps,
    timeBlocks: normalizeLifeCardTimeBlocks(item.timeBlocks, steps),
  };
}

function lifeCardStepProgress(card) {
  const steps = Array.isArray(card.steps) ? card.steps : [];
  if (!steps.length) return { done: 0, total: 0, percent: 0 };
  const parentDone = Boolean(card.archivedAt || card.completion?.allDone);
  const done = parentDone ? steps.length : steps.filter((step) => step.status === "done").length;
  return {
    done,
    total: steps.length,
    percent: Math.round((done / steps.length) * 100),
  };
}

function rankScheduleItemCard(card, selectedDate) {
  const anchorDate = normalizeDate(selectedDate);
  const completed = Boolean(card.archivedAt || card.completion?.allDone || card.completion?.currentUserDone);
  if (completed) {
    return {
      rankScore: -1000,
      rankReason: "已完成",
      rankLane: "done",
    };
  }

  let score = 0;
  const reasons = [];
  const cardDate = normalizeDate(card.date, anchorDate);
  const plannedDate = normalizeDate(String(card.plannedAt || "").slice(0, 10), "");
  const dueDate = normalizeDate(String(card.dueAt || "").slice(0, 10), "");
  const dueDays = dueDate ? daysBetween(anchorDate, dueDate) : null;

  if (card.priority === "high") {
    score += 30;
    reasons.push("重要");
  } else if (card.priority === "low") {
    score -= 8;
  }

  if (plannedDate === anchorDate) {
    score += 38;
    reasons.push("这天有安排");
  } else if (cardDate === anchorDate) {
    score += 26;
    reasons.push("这天");
  }

  if (Number.isFinite(dueDays)) {
    if (dueDays < 0) {
      score += 80;
      reasons.unshift("已过期");
    } else if (dueDays === 0) {
      score += 64;
      reasons.unshift("今天截止");
    } else if (dueDays <= 3) {
      score += 42 - dueDays * 4;
      reasons.push(`${dueDays} 天后截止`);
    } else if (dueDays <= 7) {
      score += 16;
      reasons.push("本周截止");
    }
  }

  if (card.sourceType === "insight") {
    score += 14;
    reasons.push("后台建议");
  }
  if (card.itemType === "date" || card.itemType === "reminder") score += 8;
  if (card.itemType === "purchase") score += 4;
  if (card.stepProgress?.total) score += Math.min(10, card.stepProgress.total * 2);
  if (card.durationMin && card.durationMin <= 30) score += 4;

  const rankLane = Number.isFinite(dueDays) && dueDays < 0
    ? "overdue"
    : (plannedDate === anchorDate || cardDate === anchorDate)
        ? "today"
        : (Number.isFinite(dueDays) && dueDays <= 7)
            ? "soon"
            : "later";

  return {
    rankScore: score,
    rankReason: reasons[0] || (rankLane === "later" ? "后续" : "接下来"),
    rankLane,
  };
}

function sanitizeFilename(input) {
  const fallback = "image";
  const safe = String(input || fallback)
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || fallback;
}

function extensionForMimeType(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".png";
}

function createImageAsset(userId, payload, options = {}) {
  const date = normalizeDate(options.date);
  const dataUrl = String(payload.dataUrl || "");
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw new Error("valid image dataUrl is required");
  }

  const mimeType = match[1];
  if (!validImageMimeTypes.has(mimeType)) {
    throw new Error("unsupported image type");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxImageBytes) {
    throw new Error("image must be between 1 byte and 5MB");
  }

  const extension = extensionForMimeType(mimeType);
  const originalName = sanitizeFilename(payload.name || `${options.prefix || "image"}-${date}${extension}`);
  const baseName = originalName.replace(/\.(png|jpe?g|webp|gif)$/i, "");
  const assetId = makeId(options.idPrefix || "image");
  const filename = `${assetId}-${sanitizeFilename(baseName)}${extension}`;
  const assetDir = contentPath("private", "couple-assets", ...(options.pathParts || []), date);
  ensureDir(assetDir);
  const filePath = path.join(assetDir, filename);
  fs.writeFileSync(filePath, buffer);

  return {
    id: assetId,
    date,
    name: originalName,
    filename,
    mimeType,
    size: buffer.length,
    url: `/__content/${relativeToContent(filePath).split(path.sep).join("/")}`,
    createdBy: userId,
    createdAt: nowIso(),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function hashPassword(password, salt) {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${String(password || "")}`)
    .digest("hex");
}

function buildProfile(spec) {
  const password = process.env[spec.passwordEnvKey] || spec.defaultPassword;
  const salt = crypto.randomBytes(8).toString("hex");
  return {
    id: spec.id,
    login: spec.login,
    displayName: process.env[spec.nameEnvKey] || spec.displayName,
    avatar: spec.avatar,
    avatarUrl: "",
    color: spec.color,
    initials: spec.initials,
    passwordEnvKey: spec.passwordEnvKey,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
  };
}

function publicProfile(profile) {
  return {
    id: profile.id,
    login: profile.login,
    displayName: profile.displayName,
    avatar: profile.avatar,
    avatarUrl: profile.avatarUrl || "",
    color: profile.color,
    initials: profile.initials,
  };
}

function getDefaultProfiles() {
  return [
    buildProfile({
      id: "you",
      login: "you",
      displayName: "大猫",
      initials: "大",
      avatar: "pink-cat",
      color: "#ff5c9a",
      defaultPassword: "1314",
      passwordEnvKey: "PEOS_COUPLE_YOU_PASSWORD",
      nameEnvKey: "PEOS_COUPLE_YOU_NAME",
    }),
    buildProfile({
      id: "partner",
      login: "partner",
      displayName: "小猫",
      initials: "小",
      avatar: "violet-cat",
      color: "#8a6cff",
      defaultPassword: "5200",
      passwordEnvKey: "PEOS_COUPLE_PARTNER_PASSWORD",
      nameEnvKey: "PEOS_COUPLE_PARTNER_NAME",
    }),
  ];
}

function getWeekDays(dateText) {
  const selected = parseDate(normalizeDate(dateText)) || new Date();
  const monday = new Date(selected);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      id: formatDate(date),
      label: weekdayLabels[date.getDay()],
      shortLabel: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      isToday: formatDate(date) === formatDate(),
    };
  });
}

function getTimelineDays(dateText) {
  const selected = parseDate(normalizeDate(dateText)) || new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(selected);
    date.setDate(selected.getDate() + index);
    const id = formatDate(date);
    return {
      id,
      date: id,
      label: weekdayLabels[date.getDay()],
      shortLabel: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      isToday: id === formatDate(),
    };
  });
}

function getMonthDays(dateText) {
  const selected = parseDate(normalizeDate(dateText)) || new Date();
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  const today = formatDate();

  return Array.from({ length: last.getDate() }, (_, index) => {
    const date = new Date(first);
    date.setDate(index + 1);
    const id = formatDate(date);
    return {
      id,
      label: weekdayLabels[date.getDay()],
      shortLabel: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      dayNumber: index + 1,
      isToday: id === today,
      isFuture: id > today,
    };
  });
}

function getProfileIds(store) {
  return store.profiles.map((item) => item.id);
}

function normalizeOwnerId(store, ownerId, userId) {
  const profileIds = getProfileIds(store);
  return ownerId === "shared" ? "shared" : profileIds.includes(ownerId) ? ownerId : userId;
}

function normalizeParticipants(store, ownerId, participants, userId) {
  const profileIds = getProfileIds(store);
  if (ownerId === "shared") {
    return profileIds;
  }

  const source = Array.isArray(participants) ? participants : [ownerId || userId];
  const normalized = source.filter((id) => profileIds.includes(id));
  return [...new Set(normalized.length ? normalized : [userId])];
}

function resolveStatusTargetUserId(store, userId, targetUserId) {
  if (process.env.PEOS_COUPLE_ALLOW_CROSS_USER_STATUS === "1") {
    const profileIds = getProfileIds(store);
    return profileIds.includes(targetUserId) ? targetUserId : userId;
  }

  return userId;
}

function syncArchiveWithCompletion(item, userId) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const allDone = participants.length > 0 && participants.every((id) => item.statusByUser?.[id] === "done");
  if (allDone) {
    const timestamp = nowIso();
    item.archivedAt = item.archivedAt || timestamp;
    item.archivedBy = item.archivedBy || userId;
    item.updatedAt = timestamp;
    item.updatedBy = userId;
    return;
  }

  if (item.archivedAt) {
    item.archivedAt = "";
    item.archivedBy = "";
  }
}

function applyStepAwareStatusToggle(item, targetUserId, userId, payload = {}) {
  const currentStatus = validStatuses.has(item.statusByUser?.[targetUserId])
    ? item.statusByUser[targetUserId]
    : "todo";
  const requestedStatus = validStatuses.has(payload.status) ? payload.status : "";
  const steps = normalizeLifeCardSteps(item.steps, item.participants);

  if (steps.length) {
    const shouldUndo = requestedStatus === "todo" || currentStatus === "done" || item.archivedAt;
    if (shouldUndo) {
      const lastDoneIndex = steps.map((step) => step.status).lastIndexOf("done");
      if (lastDoneIndex >= 0) steps[lastDoneIndex] = { ...steps[lastDoneIndex], status: "todo" };
      item.steps = steps;
      item.statusByUser = { ...(item.statusByUser || {}), [targetUserId]: "todo" };
      syncArchiveWithCompletion(item, userId);
      return;
    }

    const nextTodoIndex = steps.findIndex((step) => step.status !== "done");
    if (nextTodoIndex >= 0) steps[nextTodoIndex] = { ...steps[nextTodoIndex], status: "done" };
    item.steps = steps;
    const allStepsDone = steps.every((step) => step.status === "done");
    item.statusByUser = { ...(item.statusByUser || {}), [targetUserId]: allStepsDone ? "done" : "todo" };
    syncArchiveWithCompletion(item, userId);
    return;
  }

  const nextStatus = requestedStatus || (currentStatus === "done" ? "todo" : "done");
  item.statusByUser = {
    ...(item.statusByUser || {}),
    [targetUserId]: nextStatus,
  };
  syncArchiveWithCompletion(item, userId);
}

function createScheduleItem(store, payload, userId) {
  const profileIds = store.profiles.map((item) => item.id);
  const date = normalizeDate(payload.date);
  const ownerId = normalizeOwnerId(store, payload.ownerId, userId);
  const normalizedParticipants = normalizeParticipants(store, ownerId, payload.participants, userId);
  const timestamp = nowIso();
  const item = {
    id: makeId("event"),
    date,
    segment: normalizeSegment(payload.segment),
    title: sanitizeText(payload.title, 160),
    detail: sanitizeText(payload.detail, 800),
    itemType: inferScheduleItemType(payload, "date"),
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    repeatRule: sanitizeText(payload.repeatRule, 120),
    ownerId,
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(normalizedParticipants.map((id) => [id, "todo"])),
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: "",
    archivedBy: "",
  };
  Object.assign(item, buildLifeCardPlanning({ ...payload, date, participants: normalizedParticipants }, item));

  if (!item.title) {
    throw new Error("schedule title is required");
  }

  return item;
}

function createTodoItem(store, payload, userId) {
  const date = normalizeDate(payload.date);
  const bucket = normalizeTodoBucket(payload.bucket);
  const ownerId = normalizeOwnerId(store, payload.ownerId, userId);
  const participants = normalizeParticipants(store, ownerId, payload.participants, userId);
  const timestamp = nowIso();
  const item = {
    id: makeId("todo"),
    date,
    bucket,
    title: sanitizeText(payload.title, 180),
    detail: sanitizeText(payload.detail, 800),
    itemType: inferScheduleItemType(payload, "thing"),
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    repeatRule: sanitizeText(payload.repeatRule, 120),
    priority: normalizePriority(payload.priority),
    ownerId,
    participants,
    statusByUser: Object.fromEntries(participants.map((id) => [id, "todo"])),
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: "",
    archivedBy: "",
  };
  Object.assign(item, buildLifeCardPlanning({ ...payload, date, participants }, item));

  if (!item.title) {
    throw new Error("todo title is required");
  }

  return item;
}

function createCheckinItem(store, payload, userId) {
  const participants = getProfileIds(store);
  const timestamp = nowIso();
  const item = {
    id: makeId("checkin"),
    title: sanitizeText(payload.title, 120),
    slot: sanitizeText(payload.slot, 80),
    itemType: inferScheduleItemType(payload, "checkin"),
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    repeatRule: sanitizeText(payload.repeatRule || "daily", 120),
    ownerId: "shared",
    participants,
    statusByDate: {},
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!item.title) {
    throw new Error("checkin title is required");
  }

  return item;
}

function createDeadlineItem(store, payload, userId) {
  const ownerId = normalizeOwnerId(store, payload.ownerId, userId);
  const participants = normalizeParticipants(store, ownerId, payload.participants, userId);
  const timestamp = nowIso();
  const item = {
    id: makeId("deadline"),
    date: normalizeDate(payload.date),
    title: sanitizeText(payload.title, 180),
    detail: sanitizeText(payload.detail, 500),
    itemType: inferScheduleItemType(payload, "reminder"),
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    repeatRule: sanitizeText(payload.repeatRule, 120),
    ownerId,
    participants,
    statusByUser: Object.fromEntries(participants.map((id) => [id, "todo"])),
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: "",
    archivedBy: "",
  };

  if (!item.title) {
    throw new Error("deadline title is required");
  }

  return item;
}

function createDefaultStore() {
  const profiles = getDefaultProfiles();

  return {
    version: 1,
    apiVersion: "couple-local-v1",
    revision: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    space: {
      id: "default",
      name: "我们的共同首页",
      theme: "pink-pixel-cat",
    },
    profiles,
    scheduleItems: [],
    todoItems: [],
    checkinItems: [],
    deadlineItems: [],
    diaryDays: {},
    dailySummaries: {},
    personalPages: {
      [profiles[0].id]: {
        userId: profiles[0].id,
        title: "大猫",
        bio: "记录自己的状态，也记录两个人一起推进的事。",
        likes: "可爱、温暖、简单直接。",
        longTermGoal: "长期稳定地成长，成为更可靠也更温柔的人。",
        identityGoal: "能照顾好自己，也能照顾好两个人的生活节奏。",
        notes: "",
        updatedAt: nowIso(),
      },
      [profiles[1].id]: {
        userId: profiles[1].id,
        title: "小猫",
        bio: "一起看生活卡，也保留自己的小空间。",
        likes: "轻松、清楚、好维护。",
        longTermGoal: "保持轻松、稳定、清楚的生活状态。",
        identityGoal: "成为能一起计划、一起完成、一起复盘的人。",
        notes: "",
        updatedAt: nowIso(),
      },
    },
    captures: [],
  };
}

function ensureStoreShape(store) {
  const shaped = store && typeof store === "object" ? store : createDefaultStore();
  const defaultProfiles = getDefaultProfiles();
  shaped.version = shaped.version || 1;
  shaped.apiVersion = shaped.apiVersion || "couple-local-v1";
  shaped.revision = Number(shaped.revision) || 1;
  shaped.space = shaped.space || { id: "default", name: "我们的共同首页", theme: "pink-pixel-cat" };
  shaped.profiles = Array.isArray(shaped.profiles) && shaped.profiles.length ? shaped.profiles : defaultProfiles;
  shaped.profiles = shaped.profiles.map((profile) => {
    const fallback = defaultProfiles.find((item) => item.id === profile.id) || profile;
    const envName = profile.nameEnvKey ? String(process.env[profile.nameEnvKey] || "").trim() : "";
    const legacyName = profile.id === "you" && ["你", "成员 A"].includes(profile.displayName) ? "大猫" :
      profile.id === "partner" && ["猫", "成员 B"].includes(profile.displayName) ? "小猫" :
        profile.displayName;
    const legacyInitials = profile.id === "you" && ["Y", "A"].includes(profile.initials) ? "大" :
      profile.id === "partner" && ["C", "B"].includes(profile.initials) ? "小" :
        profile.initials;

    return {
      ...fallback,
      ...profile,
      displayName: envName || legacyName || fallback.displayName,
      initials: legacyInitials || fallback.initials,
      avatar: sanitizeText(profile.avatar || fallback.avatar || "pink-cat", 40),
      avatarUrl: sanitizeText(profile.avatarUrl || "", 500),
      color: normalizeColor(profile.color, fallback.color || "#ff5c9a"),
    };
  });
  shaped.scheduleItems = Array.isArray(shaped.scheduleItems) ? shaped.scheduleItems : [];
  shaped.todoItems = Array.isArray(shaped.todoItems) ? shaped.todoItems : [];
  shaped.checkinItems = Array.isArray(shaped.checkinItems) ? shaped.checkinItems : [];
  shaped.deadlineItems = Array.isArray(shaped.deadlineItems) ? shaped.deadlineItems : [];
  shaped.diaryDays = shaped.diaryDays && typeof shaped.diaryDays === "object" ? shaped.diaryDays : {};
  shaped.dailySummaries = shaped.dailySummaries && typeof shaped.dailySummaries === "object" ? shaped.dailySummaries : {};
  shaped.personalPages = shaped.personalPages && typeof shaped.personalPages === "object" ? shaped.personalPages : {};
  shaped.captures = Array.isArray(shaped.captures) ? shaped.captures : [];
  const profileIds = shaped.profiles.map((profile) => profile.id);
  shaped.personalPages = Object.fromEntries(
    shaped.profiles.map((profile) => {
      const current = shaped.personalPages[profile.id] || {};
      return [
        profile.id,
        {
          userId: profile.id,
          title: sanitizeText(current.title || profile.displayName, 60) || profile.displayName,
          bio: sanitizeText(current.bio || "", 220),
          likes: sanitizeText(current.likes || "", 220),
          longTermGoal: sanitizeText(current.longTermGoal || "", 500),
          identityGoal: sanitizeText(current.identityGoal || "", 500),
          notes: sanitizeText(current.notes || "", 1200),
          updatedAt: current.updatedAt || "",
        },
      ];
    })
  );
  shaped.checkinItems = shaped.checkinItems.map((item) => ({
    ...item,
    ownerId: "shared",
    participants: profileIds,
    statusByDate: item.statusByDate && typeof item.statusByDate === "object" ? item.statusByDate : {},
  }));
  shaped.updatedAt = shaped.updatedAt || nowIso();
  return shaped;
}

function readStore() {
  if (!fs.existsSync(storePath)) {
    const store = createDefaultStore();
    writeStore(store);
    return store;
  }

  const raw = fs.readFileSync(storePath, "utf8");
  return ensureStoreShape(JSON.parse(raw));
}

function writeStore(store) {
  ensureDir(path.dirname(storePath));
  const payload = ensureStoreShape(store);
  payload.revision = (Number(payload.revision) || 0) + 1;
  payload.updatedAt = nowIso();
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, storePath);
  return payload;
}

function readPublicBootstrap() {
  const store = readStore();
  return {
    apiVersion: store.apiVersion,
    space: store.space,
    profiles: store.profiles.map(publicProfile),
    storePath: relativeToContent(storePath),
  };
}

function readRevision() {
  const store = readStore();
  return {
    revision: store.revision,
    updatedAt: store.updatedAt,
  };
}

function readAuthConfig() {
  const store = readStore();
  const effectiveProfileHashes = store.profiles.map((profile) => {
    const envPassword = process.env[profile.passwordEnvKey];
    return envPassword ? hashPassword(envPassword, profile.passwordSalt) : profile.passwordHash;
  });
  const configuredSecret = String(process.env.PEOS_COUPLE_SESSION_SECRET || "").trim();
  const secretMaterial = [
    configuredSecret,
    store.createdAt,
    store.space?.id || "default",
    ...effectiveProfileHashes,
  ].join("|");

  return {
    issuer: store.space?.id || "default",
    profileIds: getProfileIds(store),
    secret: crypto.createHash("sha256").update(secretMaterial).digest("hex"),
  };
}

function verifyLogin(login, password) {
  const store = readStore();
  const normalizedLogin = String(login || "").trim();
  const profile = store.profiles.find((item) => item.login === normalizedLogin || item.id === normalizedLogin);

  if (!profile) {
    return null;
  }

  const envPassword = process.env[profile.passwordEnvKey];
  const expectedHash = envPassword
    ? hashPassword(envPassword, profile.passwordSalt)
    : profile.passwordHash;
  const actualHash = hashPassword(password, profile.passwordSalt);

  if (!crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash))) {
    return null;
  }

  return publicProfile(profile);
}

function getDiaryDaySnapshot(store, date) {
  const source = store.diaryDays[date] || {};
  const userDays = {};

  store.profiles.forEach((profile) => {
    const current = source.userDays?.[profile.id] || {};
    userDays[profile.id] = {
      userId: profile.id,
      mood: current.mood || "",
      energy: Number(current.energy) || 3,
      focus: current.focus || "",
      note: current.note || "",
      markdown: current.markdown ?? current.note ?? "",
      dailyScore: normalizeDailyScore(current.dailyScore, 0),
      happiestThing: current.happiestThing || "",
      smallAchievement: current.smallAchievement || "",
      images: Array.isArray(current.images) ? current.images.map(publicDiaryAsset).filter(Boolean) : [],
      updatedAt: current.updatedAt || "",
    };
  });

  return {
    date,
    userDays,
    sharedNotes: Array.isArray(source.sharedNotes) ? source.sharedNotes : [],
  };
}

function publicDiaryAsset(asset) {
  if (!asset || typeof asset !== "object") {
    return null;
  }

  return {
    id: asset.id || "",
    date: asset.date || "",
    name: asset.name || asset.filename || "image",
    filename: asset.filename || "",
    mimeType: asset.mimeType || "",
    size: Number(asset.size) || 0,
    url: asset.url || "",
    createdBy: asset.createdBy || "",
    createdAt: asset.createdAt || "",
  };
}

function publicPersonalPage(page, profile) {
  const source = page || {};
  return {
    userId: profile.id,
    title: source.title || profile.displayName,
    bio: source.bio || "",
    likes: source.likes || "",
    longTermGoal: source.longTermGoal || "",
    identityGoal: source.identityGoal || "",
    notes: source.notes || "",
    updatedAt: source.updatedAt || "",
  };
}

function publicCapture(capture) {
  return {
    id: capture.id || "",
    date: capture.date || "",
    text: capture.text || "",
    mode: validCaptureModes.has(capture.mode) ? capture.mode : "save",
    rawKind: capture.rawKind || "raw",
    rawFormat: capture.rawFormat || (capture.assets?.length ? "markdown+photo" : "markdown"),
    analysisIntent: capture.analysisIntent || "",
    visibility: validVisibilities.has(capture.visibility) ? capture.visibility : "shared",
    location: capture.location || "",
    assets: Array.isArray(capture.assets) ? capture.assets.map(publicDiaryAsset).filter(Boolean) : [],
    createdBy: capture.createdBy || "",
    createdAt: capture.createdAt || "",
  };
}

function publicSummaryThing(item) {
  return {
    id: item.id || "",
    kind: item.kind || "",
    title: item.title || "",
    detail: item.detail || "",
    ownerId: item.ownerId || "shared",
    participants: Array.isArray(item.participants) ? item.participants : [],
    doneUsers: Array.isArray(item.doneUsers) ? item.doneUsers : [],
    pendingUsers: Array.isArray(item.pendingUsers) ? item.pendingUsers : [],
  };
}

function timelineSideForItem(item, userId) {
  if (item.ownerId && item.ownerId !== "shared") {
    return item.ownerId === userId ? "self" : "other";
  }
  return item.createdBy === userId ? "self" : "other";
}

function publicTimelineEntry(item, type, userId, profileIds) {
  const publicItem =
    type === "schedule" ? publicScheduleItem(item, profileIds) :
      type === "todo" ? publicTodoItem(item, profileIds) :
        publicCapture(item);
  const label = type === "capture" ? "记录" : "生活卡";
  return {
    id: `${type}-${publicItem.id}`,
    type,
    label,
    date: publicItem.date,
    side: timelineSideForItem(publicItem, userId),
    title: type === "capture" ? publicItem.text : publicItem.title,
    detail: publicItem.detail || "",
    ownerId: publicItem.ownerId || "",
    participants: publicItem.participants || [],
    visibility: publicItem.visibility || "",
    createdBy: publicItem.createdBy || "",
    createdAt: publicItem.createdAt || "",
    archivedAt: publicItem.archivedAt || "",
    archivedBy: publicItem.archivedBy || "",
    statusByUser: publicItem.statusByUser || {},
    meta: type === "schedule"
      ? normalizeSegment(publicItem.segment)
      : type === "todo"
        ? normalizePriority(publicItem.priority)
        : publicItem.mode || "analysis",
  };
}

function buildTimelineDays(store, userId, selectedDate) {
  const profileIds = getProfileIds(store);
  const weekDays = getTimelineDays(selectedDate);
  const weekDates = new Set(weekDays.map((day) => day.id));
  const entries = [
    ...store.scheduleItems
      .filter((item) => weekDates.has(item.date))
      .map((item) => publicTimelineEntry(item, "schedule", userId, profileIds)),
    ...store.todoItems
      .filter((item) => weekDates.has(normalizeDate(item.date)))
      .map((item) => publicTimelineEntry(item, "todo", userId, profileIds)),
    ...store.captures
      .filter((item) => weekDates.has(item.date))
      .filter((item) => item.visibility === "shared" || item.createdBy === userId)
      .map((item) => publicTimelineEntry(item, "capture", userId, profileIds)),
  ]
    .filter((item) => item.date)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));

  const grouped = new Map(
    weekDays.map((day) => [
      day.id,
      {
        ...day,
        date: day.id,
        left: [],
        right: [],
      },
    ])
  );

  entries.forEach((entry) => {
    const group = grouped.get(entry.date);
    if (!group) return;
    (entry.side === "self" ? group.left : group.right).push(entry);
  });

  return weekDays.map((day) => grouped.get(day.id));
}

function publicDailySummary(summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  return {
    date: summary.date || "",
    title: summary.title || "",
    subtitle: summary.subtitle || "",
    narrative: summary.narrative || "",
    qualityScore: Number(summary.qualityScore) || 0,
    qualityLabel: summary.qualityLabel || "",
    qualityNote: summary.qualityNote || "",
    nextStep: summary.nextStep || "",
    illustration: summary.illustration || { type: "pixel", url: "", alt: "像素小猫日总结" },
    people: Array.isArray(summary.people) ? summary.people : [],
    completed: Array.isArray(summary.completed) ? summary.completed.map(publicSummaryThing) : [],
    missed: Array.isArray(summary.missed) ? summary.missed.map(publicSummaryThing) : [],
    moments: Array.isArray(summary.moments) ? summary.moments : [],
    memoryHooks: Array.isArray(summary.memoryHooks) ? summary.memoryHooks.map(publicRelationshipInsight) : [],
    locations: sanitizeList(summary.locations, 8, 80),
    photos: Array.isArray(summary.photos) ? summary.photos.map(publicDiaryAsset).filter(Boolean) : [],
    stats: summary.stats || { done: 0, total: 0, percent: 0 },
    sourceCounts: summary.sourceCounts || {},
    generatedBy: summary.generatedBy || "",
    generatedAt: summary.generatedAt || "",
    mode: summary.mode || "fallback",
  };
}

function publicScheduleItem(item, profileIds) {
  const participants = (Array.isArray(item.participants) ? item.participants : [])
    .filter((id) => profileIds.includes(id));
  const normalizedParticipants = participants.length ? participants : profileIds;
  return {
    id: item.id,
    date: item.date,
    segment: normalizeSegment(item.segment),
    title: item.title || "",
    detail: item.detail || "",
    itemType: normalizeScheduleItemType(item.itemType, "date"),
    sourceCaptureId: item.sourceCaptureId || "",
    relatedGroupId: item.relatedGroupId || "",
    parentItemId: item.parentItemId || "",
    repeatRule: item.repeatRule || "",
    ownerId: item.ownerId || "shared",
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(
      normalizedParticipants.map((id) => [
        id,
        validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo",
      ])
    ),
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    archivedAt: item.archivedAt || "",
    archivedBy: item.archivedBy || "",
    ...publicPlanningFields(item),
  };
}

function publicTodoItem(item, profileIds) {
  const participants = (Array.isArray(item.participants) ? item.participants : [])
    .filter((id) => profileIds.includes(id));
  const normalizedParticipants = participants.length ? participants : profileIds;
  return {
    id: item.id,
    date: normalizeDate(item.date),
    title: item.title || "",
    detail: item.detail || "",
    itemType: normalizeScheduleItemType(item.itemType, inferScheduleItemType(item, "thing")),
    sourceCaptureId: item.sourceCaptureId || "",
    relatedGroupId: item.relatedGroupId || "",
    parentItemId: item.parentItemId || "",
    repeatRule: item.repeatRule || "",
    priority: normalizePriority(item.priority),
    bucket: normalizeTodoBucket(item.bucket),
    ownerId: item.ownerId || "shared",
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(
      normalizedParticipants.map((id) => [
        id,
        validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo",
      ])
    ),
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    archivedAt: item.archivedAt || "",
    archivedBy: item.archivedBy || "",
    ...publicPlanningFields(item),
  };
}

function publicCheckinItem(item, profileIds, date) {
  const normalizedParticipants = profileIds;
  const dayStatus = item.statusByDate?.[date] || {};
  return {
    id: item.id,
    date: normalizeDate(date),
    title: item.title || "",
    slot: item.slot || "",
    itemType: normalizeScheduleItemType(item.itemType, item.repeatRule ? "habit" : "checkin"),
    sourceCaptureId: item.sourceCaptureId || "",
    relatedGroupId: item.relatedGroupId || "",
    parentItemId: item.parentItemId || "",
    repeatRule: item.repeatRule || "daily",
    ownerId: "shared",
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(
      normalizedParticipants.map((id) => [
        id,
        validStatuses.has(dayStatus[id]) ? dayStatus[id] : "todo",
      ])
    ),
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    archivedAt: item.archivedAt || "",
    archivedBy: item.archivedBy || "",
    ...publicPlanningFields(item),
  };
}

function publicDeadlineItem(item, profileIds) {
  const participants = (Array.isArray(item.participants) ? item.participants : [])
    .filter((id) => profileIds.includes(id));
  const normalizedParticipants = participants.length ? participants : profileIds;
  return {
    id: item.id,
    date: normalizeDate(item.date),
    title: item.title || "",
    detail: item.detail || "",
    itemType: normalizeScheduleItemType(item.itemType, "reminder"),
    sourceCaptureId: item.sourceCaptureId || "",
    relatedGroupId: item.relatedGroupId || "",
    parentItemId: item.parentItemId || "",
    repeatRule: item.repeatRule || "",
    ownerId: item.ownerId || "shared",
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(
      normalizedParticipants.map((id) => [
        id,
        validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo",
      ])
    ),
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    archivedAt: item.archivedAt || "",
    archivedBy: item.archivedBy || "",
    ...publicPlanningFields(item),
  };
}

function sourceCaptureSummary(store, sourceCaptureId) {
  if (!sourceCaptureId) return "";
  const capture = store.captures.find((item) => item.id === sourceCaptureId);
  if (!capture) return "";
  return sanitizeText(capture.text, 120);
}

function resolveCaptureDate(text, fallbackDate) {
  const raw = String(text || "");
  const fallback = normalizeDate(fallbackDate);
  if (/后天/.test(raw)) return addDays(fallback, 2);
  if (/明天|明晚|明早/.test(raw)) return addDays(fallback, 1);
  if (/今天|今日|今晚|今早|今天下午|今天上午|今天晚上/.test(raw)) return fallback;

  const explicitDate = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (explicitDate) return normalizeDate(explicitDate[1], fallback);

  const monthDay = raw.match(/(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?/);
  if (monthDay) {
    const selected = parseDate(fallback) || new Date();
    const candidate = `${selected.getFullYear()}-${pad(monthDay[1])}-${pad(monthDay[2])}`;
    return parseDate(candidate) ? candidate : fallback;
  }

  const nextWeekDay = raw.match(/下周([一二三四五六日天])/);
  if (nextWeekDay) {
    const selected = parseDate(fallback) || new Date();
    const target = quickWeekdayIndex[nextWeekDay[1]] || 7;
    const currentWeekOffset = (selected.getDay() + 6) % 7;
    const targetWeekOffset = target - 1;
    const offset = 7 - currentWeekOffset + targetWeekOffset;
    return formatDate(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + offset));
  }

  if (/下周/.test(raw)) return addDays(fallback, 7);

  const weekDay = raw.match(/周([一二三四五六日天])/);
  if (weekDay) {
    const selected = parseDate(fallback) || new Date();
    const target = quickWeekdayIndex[weekDay[1]];
    const offset = (target - selected.getDay() + 7) % 7;
    return formatDate(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + offset));
  }

  return fallback;
}

function resolveCaptureSegment(text, fallbackSegment = "allDay") {
  const raw = String(text || "");
  if (/上午|早上|早晨|今早/.test(raw)) return "morning";
  if (/中午|午间/.test(raw)) return "noon";
  if (/下午/.test(raw)) return "afternoon";
  if (/晚上|今晚|夜里/.test(raw)) return "evening";
  if (/全天|整天|这天/.test(raw)) return "allDay";
  return normalizeSegment(fallbackSegment);
}

function cleanCaptureTitle(text) {
  return sanitizeText(text, 160)
    .replace(/^(?:todo|待办|安排|生活卡)\s*[:：]\s*/i, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{1,2}\s*(?:月|[./-])\s*\d{1,2}\s*日?/g, "")
    .replace(/今天|今日|今晚|今早|明天|明晚|明早|后天/g, "")
    .replace(/下周[一二三四五六日天]|周[一二三四五六日天]/g, "")
    .replace(/全天|整天|这天|上午|早上|早晨|今早|中午|午间|下午|晚上|今晚|夜里/g, "")
    .replace(/^(她说|他说|小猫说|大猫说|记得|别忘了?|提醒我|帮我|顺便|然后|还有|要)\s*/g, "")
    .replace(/[，,。；;：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCompletedCaptureStatement(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;

  const donePattern = /(?:写完了|做完了|完成了|弄完了|搞定了|交了|交完了|提交了|处理完了|整理完了|买好了|订好了|已经[^。！？\n]{0,24}(?:写完|做完|完成|弄完|搞定|提交|处理完|整理完))/;
  const futurePattern = /(?:还没|没做完|未完成|待完成|要做|要写|要买|要订|需要|准备|计划|安排|提醒|记得|别忘|明天|后天|下周|周[一二三四五六日天])/;

  return donePattern.test(raw) && !futurePattern.test(raw.replace(/(?:写完了|做完了|完成了|弄完了|搞定了|交了|交完了|提交了|处理完了|整理完了|买好了|订好了)/g, ""));
}

function splitCaptureClauses(text) {
  return sanitizeText(text, 1200)
    .split(/(?:[，,。；;、\n]+|然后|顺便|还有|以及)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function inferCaptureDecision(text) {
  const raw = String(text || "");
  if (isCompletedCaptureStatement(raw)) {
    return "capture";
  }
  if (/偏好|边界|喜欢|不喜欢|讨厌|雷区|好闻|安静|太吵|重要的是|长期|目标|以后要|未来想|记住|答应|承诺|说好|帮你|我来|下次带你|谢谢|感谢|吵架|争执|生气|委屈|想吃|想买|想去|好想/.test(raw)) {
    return "memory";
  }
  if (/今天|明天|周[一二三四五六日天]|上午|中午|下午|晚上|今晚|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:月|[./-])\s*\d{1,2}|提醒|买|约|打卡|习惯|答辩|考试|面试|ddl|截止/i.test(raw)) {
    return "schedule";
  }
  return "capture";
}

function isTemplateScheduleMatch(text) {
  const raw = String(text || "");
  if (!raw.trim() || isCompletedCaptureStatement(raw)) return false;
  return /todo|待办|安排|生活卡|今天|明天|后天|周[一二三四五六日天]|下周|上午|中午|下午|晚上|今晚|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:月|[./-])\s*\d{1,2}|提醒|记得|别忘|买|约|打卡|习惯|答辩|考试|面试|ddl|deadline|截止|开会|会议|作业|任务|提交|整理|处理|预约|带/i.test(raw);
}

function analyzeRelatedScheduleItems(text, primaryTitle, base) {
  const primaryKey = cleanCaptureTitle(primaryTitle || "");
  return splitCaptureClauses(text)
    .map((part) => {
      const title = cleanCaptureTitle(part);
      const itemType = inferScheduleItemType({ title, detail: part }, "thing");
      const date = resolveCaptureDate(part, base.date);
      const segment = resolveCaptureSegment(part, base.segment);
      const planning = buildLifeCardPlanning({
        title,
        detail: part,
        itemType,
        date,
        segment,
        ownerId: base.ownerId,
        participants: [base.ownerId].filter(Boolean),
        priority: /重要|必须|ddl|deadline|截止|答辩|考试|面试/i.test(part) ? "high" : "normal",
      });
      return {
        title,
        detail: sanitizeText(part, 360),
        itemType,
        date,
        segment,
        ownerId: base.ownerId,
        repeatRule: itemType === "habit" ? "daily" : "",
        priority: /重要|必须|ddl|deadline|截止|答辩|考试|面试/i.test(part) ? "high" : "normal",
        ...planning,
      };
    })
    .filter((item) => item.title && item.title !== primaryKey)
    .filter((item) => item.itemType !== "thing" || /记得|别忘|提醒|准备|带|订|预约|买|下单|处理|整理|帮/.test(item.detail))
    .slice(0, 4);
}

function analyzeCapture(userId, payload = {}) {
  const store = readStore();
  const capture = payload.captureId
    ? store.captures.find((item) => item.id === payload.captureId)
    : null;
  const text = sanitizeText(capture?.text || payload.text, 1200);
  if (!text) {
    throw new Error("capture text is required");
  }

  const selectedDate = normalizeDate(payload.date || capture?.date);
  const ownerId = normalizeOwnerId(store, payload.ownerId || userId, userId);
  const analysisMode = payload.analysisMode === "agent" ? "agent" : "template";
  const templateMatched = analysisMode === "template" ? isTemplateScheduleMatch(text) : true;
  const decision = analysisMode === "template"
    ? "schedule"
    : inferCaptureDecision(text);
  const clauses = splitCaptureClauses(text);
  const scheduleClause = templateMatched
    ? (clauses.find((part) => isTemplateScheduleMatch(part)) || clauses[0] || text)
    : "";
  const itemType = inferScheduleItemType({ title: scheduleClause, detail: scheduleClause }, "thing");
  const date = templateMatched ? resolveCaptureDate(scheduleClause || text, selectedDate) : selectedDate;
  const segment = templateMatched ? resolveCaptureSegment(scheduleClause || text, "allDay") : "allDay";
  const title = templateMatched
    ? (cleanCaptureTitle(scheduleClause) || cleanCaptureTitle(text) || shortText(text, 80))
    : defaultLifeCardTitle;
  const detail = templateMatched ? sanitizeText(text === title ? "" : text, 800) : "";
  const priority = /重要|必须|ddl|deadline|截止|答辩|考试|面试/i.test(text) ? "high" : "normal";
  const planning = templateMatched
    ? buildLifeCardPlanning({
        title,
        detail,
        itemType,
        date,
        segment,
        ownerId,
        participants: [ownerId].filter(Boolean),
        priority,
      })
    : { plannedAt: "", dueAt: "", durationMin: 0, steps: [], timeBlocks: [] };
  const base = {
    captureId: capture?.id || sanitizeText(payload.captureId, 80),
    sourceCaptureId: capture?.id || sanitizeText(payload.captureId, 80),
    text,
    decision,
    itemType,
    date,
    segment,
    ownerId,
    title,
    detail,
    repeatRule: itemType === "habit" ? "daily" : "",
    priority,
    ...planning,
  };

  return {
    ...base,
    analysisMode,
    templateMatched,
    isDefaultDraft: analysisMode === "template" && !templateMatched,
    analyzer: analysisMode === "agent" ? "agent-route-prompt" : "template-rules",
    routeDestinations: captureRouteDestinations,
    agentPrompt: analysisMode === "agent" ? captureAgentPrompt : "",
    relatedItems: decision === "schedule" && templateMatched ? analyzeRelatedScheduleItems(text, title, base) : [],
  };
}

function shortText(input, maxLength = 64) {
  const text = sanitizeText(input, maxLength + 20).replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function captureVisibleToUser(capture, userId) {
  return capture.visibility === "shared" || capture.createdBy === userId;
}

function inferCaptureTargetUserId(store, capture) {
  const text = capture.text || "";
  const profileIds = getProfileIds(store);
  const partner = store.profiles.find((profile) => profile.id !== capture.createdBy) || store.profiles[1];

  if (partner && (text.includes(partner.displayName) || /她|女朋友|对象|老婆|小猫/.test(text))) {
    return partner.id;
  }
  const creator = store.profiles.find((profile) => profile.id === capture.createdBy);
  if (creator && (text.includes(creator.displayName) || /我|自己/.test(text))) {
    return creator.id;
  }
  return profileIds.includes(capture.createdBy) ? capture.createdBy : (partner?.id || profileIds[0] || "");
}

function insightId(kind, sourceId, text = "") {
  const digest = crypto
    .createHash("sha1")
    .update(`${kind}:${sourceId}:${text}`)
    .digest("hex")
    .slice(0, 10);
  return `${kind}-${digest}`;
}

function hasItemFromCapture(store, captureId) {
  if (!captureId) return false;
  return [
    ...store.scheduleItems,
    ...store.todoItems,
    ...store.checkinItems,
    ...store.deadlineItems,
  ].some((item) => item.sourceCaptureId === captureId);
}

function firstProfileOtherThan(store, userId) {
  return store.profiles.find((profile) => profile.id !== userId) || store.profiles[0] || null;
}

function recentVisibleCaptures(store, userId, selectedDate, days = 365) {
  const today = normalizeDate(selectedDate);
  const startDate = addDays(today, -days);
  return store.captures
    .filter((capture) => captureVisibleToUser(capture, userId))
    .filter((capture) => capture.date >= startDate && capture.date <= today)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function nextUsefulEveningDate(store, selectedDate) {
  const start = normalizeDate(selectedDate);
  const candidates = Array.from({ length: 14 }, (_, offset) => addDays(start, offset));
  const scored = candidates.map((dateText) => {
    const date = parseDate(dateText);
    const day = date?.getDay() ?? 0;
    const weekendScore = day === 5 ? 0 : day === 6 ? 1 : day === 0 ? 2 : 4;
    const eveningLoad = store.scheduleItems.filter(
      (item) => !isArchived(item) && item.date === dateText && normalizeSegment(item.segment) === "evening"
    ).length;
    return {
      date: dateText,
      score: weekendScore + eveningLoad * 2,
    };
  });
  scored.sort((a, b) => a.score - b.score || a.date.localeCompare(b.date));
  return scored[0]?.date || start;
}

function extractMonthDay(text) {
  const normalized = String(text || "");
  const monthDay = normalized.match(/(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?/);
  if (!monthDay) return null;
  const month = Number(monthDay[1]);
  const day = Number(monthDay[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function nextAnnualDate(month, day, selectedDate) {
  const base = parseDate(normalizeDate(selectedDate)) || new Date();
  let candidate = `${base.getFullYear()}-${pad(month)}-${pad(day)}`;
  if (!parseDate(candidate)) return "";
  if (candidate < normalizeDate(selectedDate)) {
    candidate = `${base.getFullYear() + 1}-${pad(month)}-${pad(day)}`;
  }
  return parseDate(candidate) ? candidate : "";
}

function publicRelationshipInsight(insight) {
  return {
    id: insight.id || "",
    kind: insight.kind || "care",
    kindLabel: relationshipInsightKindLabels[insight.kind] || "建议",
    title: sanitizeText(insight.title, 120),
    detail: sanitizeText(insight.detail, 360),
    date: normalizeDate(insight.date),
    segment: normalizeSegment(insight.segment),
    itemType: normalizeScheduleItemType(insight.itemType, "reminder"),
    ownerId: insight.ownerId || "shared",
    participants: Array.isArray(insight.participants) ? insight.participants : [],
    sourceCaptureId: sanitizeText(insight.sourceCaptureId, 80),
    sourceText: sanitizeText(insight.sourceText, 180),
    targetUserId: sanitizeText(insight.targetUserId, 80),
    priority: normalizePriority(insight.priority),
    score: Number(insight.score) || 0,
    readOnly: true,
    actionable: insight.actionable !== false,
    createdAt: insight.createdAt || "",
  };
}

function makeInsight(store, payload) {
  const profileIds = getProfileIds(store);
  const ownerId = normalizeOwnerId(store, payload.ownerId || "shared", profileIds[0] || "shared");
  const participants = normalizeParticipants(store, ownerId, payload.participants || profileIds, profileIds[0] || "");
  return publicRelationshipInsight({
    id: payload.id || insightId(payload.kind || "care", payload.sourceCaptureId || payload.title, payload.detail || ""),
    kind: payload.kind || "care",
    title: payload.title,
    detail: payload.detail,
    date: payload.date,
    segment: payload.segment || "allDay",
    itemType: payload.itemType || "reminder",
    ownerId,
    participants,
    sourceCaptureId: payload.sourceCaptureId || "",
    sourceText: payload.sourceText || "",
    targetUserId: payload.targetUserId || "",
    priority: payload.priority || "normal",
    score: payload.score || 0,
    actionable: payload.actionable !== false,
    createdAt: payload.createdAt || nowIso(),
  });
}

function buildCaptureInsights(store, userId, selectedDate) {
  const today = normalizeDate(selectedDate);
  const relaxedDate = nextUsefulEveningDate(store, today);
  const insights = [];

  recentVisibleCaptures(store, userId, today).forEach((capture) => {
    const text = sanitizeText(capture.text, 600);
    if (!text) return;
    const ageDays = Math.max(0, daysBetween(capture.date, today));
    const targetUserId = inferCaptureTargetUserId(store, capture);
    const target = store.profiles.find((profile) => profile.id === targetUserId);
    const targetName = target?.displayName || "对方";
    const sourceText = shortText(text, 120);
    const alreadyScheduled = hasItemFromCapture(store, capture.id);
    const shouldSuggestCard = capture.mode === "analysis";

    if (promisePattern.test(text) && !alreadyScheduled && ageDays >= 1) {
      insights.push(makeInsight(store, {
        kind: "promise",
        title: `兑现一下：${shortText(text, 28)}`,
        detail: `这条承诺来自 ${ageDays || 1} 天前的记录。先安排一个很小的动作，比继续记着更可靠。`,
        date: today,
        segment: "evening",
        itemType: "thing",
        ownerId: capture.createdBy || userId,
        participants: [capture.createdBy || userId].filter(Boolean),
        sourceCaptureId: capture.id,
        sourceText,
        targetUserId,
        priority: "high",
        score: 96 - Math.min(ageDays, 30),
        actionable: shouldSuggestCard,
        createdAt: capture.createdAt,
      }));
    }

    if (wishPattern.test(text) && !alreadyScheduled) {
      insights.push(makeInsight(store, {
        kind: "wish",
        title: `${targetName}提过：${shortText(text, 30)}`,
        detail: `这是从记录里长出来的心愿线索。可以做成低预算、不太累的安排：咖啡、散步、简单晚饭，重点是她说过的话被认真记住。`,
        date: relaxedDate,
        segment: "evening",
        itemType: /买|护手霜|礼物|下单|购买/.test(text) ? "purchase" : "date",
        ownerId: "shared",
        participants: getProfileIds(store),
        sourceCaptureId: capture.id,
        sourceText,
        targetUserId,
        priority: ageDays > 7 ? "high" : "normal",
        score: 82 - Math.min(ageDays, 20),
        actionable: shouldSuggestCard,
        createdAt: capture.createdAt,
      }));
    }

    if (preferencePattern.test(text)) {
      insights.push(makeInsight(store, {
        kind: "preference",
        title: `记住：${shortText(text, 32)}`,
        detail: `这条更适合沉进长期记忆。之后生成约会、礼物和餐厅建议时，后端会优先避开雷区、保留偏好。`,
        date: today,
        segment: "allDay",
        itemType: "reminder",
        ownerId: "shared",
        participants: getProfileIds(store),
        sourceCaptureId: capture.id,
        sourceText,
        targetUserId,
        priority: "normal",
        score: 58 - Math.min(ageDays, 20),
        actionable: false,
        createdAt: capture.createdAt,
      }));
    }

    if (gratitudePattern.test(text)) {
      insights.push(makeInsight(store, {
        kind: "gratitude",
        title: "认真谢谢一次",
        detail: `${targetName}最近做过的事不要只说“谢谢”。可以具体说出是哪件事、它帮你少扛了什么。`,
        date: today,
        segment: "evening",
        itemType: "reminder",
        ownerId: userId,
        participants: [userId],
        sourceCaptureId: capture.id,
        sourceText,
        targetUserId,
        priority: "normal",
        score: 66 - Math.min(ageDays, 20),
        actionable: shouldSuggestCard,
        createdAt: capture.createdAt,
      }));
    }

    if (repairPattern.test(text)) {
      insights.push(makeInsight(store, {
        kind: "repair",
        title: "轻一点修复",
        detail: "这类记录先不讲道理。更有效的是承认感受、说清补救动作，再给一点安静空间。",
        date: today,
        segment: "evening",
        itemType: "reminder",
        ownerId: userId,
        participants: [userId],
        sourceCaptureId: capture.id,
        sourceText,
        targetUserId,
        priority: "high",
        score: 92 - Math.min(ageDays, 20),
        actionable: shouldSuggestCard,
        createdAt: capture.createdAt,
      }));
    }
  });

  return insights;
}

function buildCareInsights(store, userId, selectedDate) {
  const today = normalizeDate(selectedDate);
  const profileIds = getProfileIds(store);
  const partner = firstProfileOtherThan(store, userId);
  const partnerId = partner?.id || profileIds.find((id) => id !== userId) || "";
  const insights = [];

  if (partnerId) {
    const weekEnd = addDays(today, 6);
    const partnerEveningLoad = store.scheduleItems.filter((item) =>
      !isArchived(item) &&
      item.date >= today &&
      item.date <= weekEnd &&
      normalizeSegment(item.segment) === "evening" &&
      (item.ownerId === partnerId || item.ownerId === "shared" || item.participants?.includes(partnerId))
    );
    if (partnerEveningLoad.length >= 3) {
      insights.push(makeInsight(store, {
        kind: "care",
        title: `${partner?.displayName || "对方"}这周晚上偏满`,
        detail: "建议不要再塞复杂约会。准备一顿简单晚饭、奶茶、早睡提醒，比额外安排更像被照顾到。",
        date: today,
        segment: "evening",
        itemType: "reminder",
        ownerId: userId,
        participants: [userId],
        targetUserId: partnerId,
        priority: "high",
        score: 88,
      }));
    }

    const tomorrow = addDays(today, 1);
    const importantTomorrow = [
      ...store.scheduleItems,
      ...store.todoItems,
      ...store.deadlineItems,
    ].find((item) =>
      !isArchived(item) &&
      normalizeDate(item.date) >= today &&
      normalizeDate(item.date) <= tomorrow &&
      (item.ownerId === partnerId || item.ownerId === "shared" || item.participants?.includes(partnerId)) &&
      importantEventPattern.test(`${item.title || ""} ${item.detail || ""}`)
    );

    if (importantTomorrow) {
      insights.push(makeInsight(store, {
        kind: "care",
        title: `${partner?.displayName || "对方"}明天有重要事`,
        detail: "今晚可以发一句具体鼓励，明早再提醒材料、证件或时间。动作要小，但要准。",
        date: today,
        segment: "evening",
        itemType: "reminder",
        ownerId: userId,
        participants: [userId],
        targetUserId: partnerId,
        priority: "high",
        score: 94,
      }));
    }
  }

  return insights;
}

function readMarkdownTableRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line))
    .slice(1)
    .map((line) => line.split("|").slice(1, -1).map((cell) => sanitizeText(cell, 160)))
    .filter((cells) => cells.some(Boolean));
}

function buildAnniversaryInsights(store, selectedDate, captureInsights) {
  const today = normalizeDate(selectedDate);
  const recentWish = captureInsights.find((insight) => insight.kind === "wish" || insight.kind === "preference");
  const wishDetail = recentWish?.sourceText ? `最近的线索是：${recentWish.sourceText}` : "最近没有明确心愿线索，先准备轻量、不累的版本。";
  const candidates = [];

  store.deadlineItems.forEach((item) => {
    if (!anniversaryPattern.test(`${item.title || ""} ${item.detail || ""}`)) return;
    candidates.push({
      id: `deadline-${item.id}`,
      date: normalizeDate(item.date),
      title: item.title || "纪念日",
      detail: item.detail || "",
    });
  });

  store.scheduleItems.forEach((item) => {
    if (!anniversaryPattern.test(`${item.title || ""} ${item.detail || ""}`)) return;
    candidates.push({
      id: `schedule-${item.id}`,
      date: normalizeDate(item.date),
      title: item.title || "纪念日",
      detail: item.detail || "",
    });
  });

  readMarkdownTableRows(contentPath("lists", "memorial-days.md")).forEach((cells, index) => {
    const [rawDate, title, detail] = cells;
    const monthDay = extractMonthDay(rawDate);
    const date = monthDay ? nextAnnualDate(monthDay.month, monthDay.day, today) : normalizeDate(rawDate, "");
    if (!date) return;
    candidates.push({
      id: `memorial-${index}-${date}`,
      date,
      title: title || "纪念日",
      detail: detail || "",
    });
  });

  const captureAnniversaries = store.captures
    .filter((capture) => anniversaryPattern.test(capture.text || ""))
    .map((capture) => {
      const monthDay = extractMonthDay(capture.text);
      const date = monthDay ? nextAnnualDate(monthDay.month, monthDay.day, today) : "";
      return date ? {
        id: `capture-${capture.id}`,
        date,
        title: shortText(capture.text, 34) || "纪念日",
        detail: capture.text,
        sourceCaptureId: capture.id,
      } : null;
    })
    .filter(Boolean);

  candidates.push(...captureAnniversaries);

  return candidates
    .filter((candidate) => candidate.date >= today)
    .map((candidate) => ({
      ...candidate,
      daysUntil: daysBetween(today, candidate.date),
    }))
    .filter((candidate) => candidate.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 2)
    .map((candidate) => makeInsight(store, {
      id: insightId("anniversary", candidate.id, candidate.date),
      kind: "anniversary",
      title: `提前预案：${shortText(candidate.title, 28)}`,
      detail: `${candidate.daysUntil} 天后就是这件事。${wishDetail} 建议先定一个小预案：预约、礼物、回忆卡片各一项。`,
      date: today,
      segment: "allDay",
      itemType: "reminder",
      ownerId: "shared",
      participants: getProfileIds(store),
      sourceCaptureId: candidate.sourceCaptureId || "",
      sourceText: candidate.detail || candidate.title,
      priority: candidate.daysUntil <= 3 ? "high" : "normal",
      score: 90 - candidate.daysUntil,
    }));
}

function buildOnThisDayInsights(store, userId, selectedDate) {
  const today = normalizeDate(selectedDate);
  const monthDay = today.slice(5);
  return store.captures
    .filter((capture) => captureVisibleToUser(capture, userId))
    .filter((capture) => capture.date && capture.date.slice(5) === monthDay && capture.date.slice(0, 4) !== today.slice(0, 4))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 1)
    .map((capture) => makeInsight(store, {
      kind: "memory",
      title: `以前的今天：${shortText(capture.text, 28)}`,
      detail: `${capture.date} 留下过这条记录。适合放进今天的 Daily Story，晚上可以一起翻一下。`,
      date: today,
      segment: "evening",
      itemType: "reminder",
      ownerId: "shared",
      participants: getProfileIds(store),
      sourceCaptureId: capture.id,
      sourceText: capture.text,
      targetUserId: inferCaptureTargetUserId(store, capture),
      priority: "normal",
      score: 72,
      createdAt: capture.createdAt,
    }));
}

function dedupeInsights(insights) {
  const seen = new Set();
  return insights.filter((insight) => {
    const key = insight.sourceCaptureId
      ? `${insight.kind}:${insight.sourceCaptureId}`
      : `${insight.kind}:${insight.title}:${insight.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRelationshipInsights(store, userId, selectedDate) {
  const captureInsights = buildCaptureInsights(store, userId, selectedDate);
  return dedupeInsights([
    ...captureInsights,
    ...buildCareInsights(store, userId, selectedDate),
    ...buildAnniversaryInsights(store, selectedDate, captureInsights),
    ...buildOnThisDayInsights(store, userId, selectedDate),
  ])
    .sort((a, b) => b.score - a.score || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 24);
}

function publicInsightScheduleItemCard(store, insight, userId) {
  const profileIds = getProfileIds(store);
  const participants = insight.participants?.length ? insight.participants.filter((id) => profileIds.includes(id)) : profileIds;
  const itemType = normalizeScheduleItemType(insight.itemType, "reminder");
  const card = {
    id: `insight-${insight.id}`,
    sourceType: "insight",
    sourceId: insight.id,
    itemType,
    itemTypeLabel: scheduleItemTypeLabels[itemType] || "提醒",
    title: insight.title || "",
    detail: insight.detail || "",
    date: normalizeDate(insight.date),
    segment: normalizeSegment(insight.segment),
    timeLabel: relationshipInsightKindLabels[insight.kind] || "建议",
    ownerId: insight.ownerId || "shared",
    participants,
    statusByUser: Object.fromEntries(participants.map((id) => [id, "todo"])),
    completion: {
      done: 0,
      total: participants.length,
      allDone: false,
      currentUserDone: false,
    },
    statusLabel: "后台建议",
    priority: insight.priority || "normal",
    bucket: "",
    slot: "",
    sourceCaptureId: insight.sourceCaptureId || "",
    sourceCaptureSummary: insight.sourceText || sourceCaptureSummary(store, insight.sourceCaptureId),
    repeatRule: "",
    archivedAt: "",
    archivedBy: "",
    createdBy: "system",
    updatedBy: "system",
    createdAt: insight.createdAt || "",
    updatedAt: "",
    readOnly: true,
    insightKind: insight.kind || "care",
    plannedAt: "",
    dueAt: "",
    durationMin: 0,
    steps: [],
    timeBlocks: [],
    stepProgress: { done: 0, total: 0, percent: 0 },
  };
  return {
    ...card,
    ...rankScheduleItemCard(card, card.date),
  };
}

function buildMemoryHints(store, relationshipInsights) {
  const byUser = Object.fromEntries(store.profiles.map((profile) => [profile.id, []]));
  const shared = [];

  relationshipInsights
    .filter((insight) => ["preference", "wish", "promise", "anniversary", "memory", "gratitude", "repair"].includes(insight.kind))
    .forEach((insight) => {
      const hint = {
        id: insight.id,
        kind: insight.kind,
        kindLabel: insight.kindLabel,
        title: insight.title,
        detail: insight.sourceText || insight.detail,
        sourceCaptureId: insight.sourceCaptureId,
      };
      const targetUserId = byUser[insight.targetUserId] ? insight.targetUserId : "";
      if (targetUserId) {
        byUser[targetUserId].push(hint);
      } else {
        shared.push(hint);
      }
    });

  Object.keys(byUser).forEach((userId) => {
    byUser[userId] = byUser[userId].slice(0, 5);
  });

  return {
    shared: shared.slice(0, 6),
    byUser,
  };
}

function memoryGroupForKind(kind) {
  if (kind === "identity" || kind === "goal" || kind === "list") return "profile";
  if (kind === "preference") return "taste";
  if (kind === "wish" || kind === "purchase") return "wish";
  if (kind === "promise") return "promise";
  if (kind === "anniversary" || kind === "memory") return "time";
  return "care";
}

function publicMemoryItem(input) {
  const kind = input.kind || "memory";
  return {
    id: input.id || insightId(kind, input.sourceCaptureId || input.title || kind, input.detail || ""),
    kind,
    kindLabel: relationshipInsightKindLabels[kind] || "记忆",
    group: input.group || memoryGroupForKind(kind),
    title: sanitizeText(input.title, 120),
    detail: sanitizeText(input.detail, 360),
    ownerId: input.ownerId || "shared",
    targetUserId: sanitizeText(input.targetUserId, 80),
    source: input.source || "system",
    sourceCaptureId: sanitizeText(input.sourceCaptureId, 80),
    actionable: Boolean(input.actionable),
    suggestedDate: input.suggestedDate ? normalizeDate(input.suggestedDate) : "",
    itemType: normalizeScheduleItemType(input.itemType, "reminder"),
    score: Number(input.score) || 0,
    updatedAt: input.updatedAt || input.createdAt || "",
  };
}

function buildMemoryItems(store, userId, selectedDate, relationshipInsights) {
  const items = [];

  relationshipInsights.forEach((insight) => {
    const kind = insight.kind === "wish" && normalizeScheduleItemType(insight.itemType, "date") === "purchase"
      ? "purchase"
      : insight.kind;
    items.push(publicMemoryItem({
      id: `insight-memory-${insight.id}`,
      kind,
      title: insight.title,
      detail: insight.sourceText || insight.detail,
      ownerId: insight.ownerId,
      targetUserId: insight.targetUserId,
      source: insight.sourceCaptureId ? "capture" : "insight",
      sourceCaptureId: insight.sourceCaptureId,
      actionable: insight.actionable,
      suggestedDate: insight.date,
      itemType: insight.itemType,
      score: insight.score,
      createdAt: insight.createdAt,
    }));
  });

  store.profiles.forEach((profile) => {
    const page = store.personalPages?.[profile.id] || {};
    [
      ["identity", "我们想成为什么样", page.identityGoal],
      ["preference", "偏好和边界", page.likes],
      ["list", "重要清单", page.notes],
      ["goal", "未来想做", page.longTermGoal],
    ].forEach(([kind, fallbackTitle, value]) => {
      const detail = sanitizeText(value, 360);
      if (!detail) return;
      items.push(publicMemoryItem({
        id: `profile-memory-${profile.id}-${kind}`,
        kind,
        title: fallbackTitle,
        detail,
        ownerId: profile.id,
        targetUserId: profile.id,
        source: "profile",
        actionable: false,
        score: profile.id === userId ? 54 : 50,
        updatedAt: page.updatedAt || "",
      }));
    });
  });

  store.todoItems
    .filter((item) => normalizeScheduleItemType(item.itemType, "thing") === "purchase")
    .filter((item) => !isArchived(item))
    .forEach((item) => {
      items.push(publicMemoryItem({
        id: `purchase-memory-${item.id}`,
        kind: "purchase",
        title: item.title,
        detail: item.detail || sourceCaptureSummary(store, item.sourceCaptureId),
        ownerId: item.ownerId,
        source: "lifeCard",
        sourceCaptureId: item.sourceCaptureId,
        actionable: true,
        suggestedDate: item.date || selectedDate,
        itemType: "purchase",
        score: item.priority === "high" ? 86 : 62,
        updatedAt: item.updatedAt || item.createdAt,
      }));
    });

  return dedupeInsights(items)
    .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 36);
}

function publicScheduleItemCard(store, publicItem, sourceType, userId, options = {}) {
  const itemType = normalizeScheduleItemType(publicItem.itemType, options.itemType || "thing");
  const participants = Array.isArray(publicItem.participants) ? publicItem.participants : [];
  const doneUsers = participants.filter((id) => publicItem.statusByUser?.[id] === "done");
  const date = normalizeDate(options.date || publicItem.date);
  const card = {
    id: `${sourceType}-${publicItem.id}`,
    sourceType,
    sourceId: publicItem.id,
    itemType,
    itemTypeLabel: scheduleItemTypeLabels[itemType] || "事情",
    title: publicItem.title || "",
    detail: publicItem.detail || publicItem.slot || "",
    date,
    segment: normalizeSegment(publicItem.segment),
    timeLabel: options.timeLabel || (publicItem.segment ? segmentDefinitions.find((item) => item.key === normalizeSegment(publicItem.segment))?.label : ""),
    ownerId: publicItem.ownerId || "shared",
    participants,
    statusByUser: publicItem.statusByUser || {},
    completion: {
      done: doneUsers.length,
      total: participants.length,
      allDone: Boolean(participants.length && doneUsers.length === participants.length),
      currentUserDone: publicItem.statusByUser?.[userId] === "done",
    },
    priority: publicItem.priority || "",
    bucket: publicItem.bucket || "",
    slot: publicItem.slot || "",
    sourceCaptureId: publicItem.sourceCaptureId || "",
    sourceCaptureSummary: sourceCaptureSummary(store, publicItem.sourceCaptureId),
    relatedGroupId: publicItem.relatedGroupId || "",
    parentItemId: publicItem.parentItemId || "",
    repeatRule: publicItem.repeatRule || "",
    plannedAt: publicItem.plannedAt || "",
    dueAt: publicItem.dueAt || "",
    durationMin: normalizeDurationMin(publicItem.durationMin, 0),
    steps: normalizeLifeCardSteps(publicItem.steps, participants),
    timeBlocks: normalizeLifeCardTimeBlocks(publicItem.timeBlocks, normalizeLifeCardSteps(publicItem.steps, participants)),
    archivedAt: publicItem.archivedAt || "",
    archivedBy: publicItem.archivedBy || "",
    createdBy: publicItem.createdBy || "",
    updatedBy: publicItem.updatedBy || "",
    createdAt: publicItem.createdAt || "",
    updatedAt: publicItem.updatedAt || "",
  };
  card.stepProgress = lifeCardStepProgress(card);
  return {
    ...card,
    ...rankScheduleItemCard(card, options.selectedDate || date),
  };
}

function buildScheduleItemCards(store, userId, selectedDate, relationshipInsights = null) {
  const profileIds = getProfileIds(store);
  const today = normalizeDate(selectedDate);
  const dateWindowEnd = (() => {
    const date = parseDate(today) || new Date();
    date.setDate(date.getDate() + 90);
    return formatDate(date);
  })();
  const segmentWeight = Object.fromEntries(segmentDefinitions.map((item, index) => [item.key, index]));
  const includeDatedItem = (item) => {
    const date = normalizeDate(item.date);
    return date >= today && date <= dateWindowEnd;
  };

  const scheduleCards = store.scheduleItems
    .filter(includeDatedItem)
    .map((item) => publicScheduleItemCard(store, publicScheduleItem(item, profileIds), "schedule", userId, {
      itemType: "date",
      selectedDate: today,
    }));
  const todoCards = store.todoItems
    .filter((item) => normalizeTodoBucket(item.bucket) === "future" || includeDatedItem(item))
    .map((item) => publicScheduleItemCard(store, publicTodoItem(item, profileIds), "todo", userId, {
      itemType: "thing",
      selectedDate: today,
    }));
  const checkinCards = getCheckinItemsForSummary(store, today)
    .map((item) => publicScheduleItemCard(store, publicCheckinItem(item, profileIds, today), "checkin", userId, {
      date: today,
      itemType: "checkin",
      timeLabel: item.slot || "每日",
      selectedDate: today,
    }));
  const deadlineCards = store.deadlineItems
    .filter(includeDatedItem)
    .map((item) => publicScheduleItemCard(store, publicDeadlineItem(item, profileIds), "deadline", userId, {
      itemType: "reminder",
      selectedDate: today,
    }));
  const insightCards = (relationshipInsights || buildRelationshipInsights(store, userId, selectedDate))
    .filter((insight) => insight.actionable !== false)
    .filter((insight) => ["promise", "wish", "care", "anniversary", "memory", "gratitude", "repair"].includes(insight.kind))
    .slice(0, 4)
    .map((insight) => publicInsightScheduleItemCard(store, insight, userId));

  return [...scheduleCards, ...todoCards, ...checkinCards, ...deadlineCards, ...insightCards]
    .sort((a, b) => {
      const doneSort = Number(Boolean(a.archivedAt || a.completion?.allDone || a.completion?.currentUserDone)) -
        Number(Boolean(b.archivedAt || b.completion?.allDone || b.completion?.currentUserDone));
      if (doneSort !== 0) return doneSort;
      const rankSort = Number(b.rankScore || 0) - Number(a.rankScore || 0);
      if (rankSort !== 0) return rankSort;
      const dateSort = a.date.localeCompare(b.date);
      if (dateSort !== 0) return dateSort;
      const segmentSort = (segmentWeight[a.segment] ?? 9) - (segmentWeight[b.segment] ?? 9);
      if (segmentSort !== 0) return segmentSort;
      const insightSort = Number(a.sourceType === "insight") - Number(b.sourceType === "insight");
      if (insightSort !== 0) return insightSort;
      const typeSort = a.itemType.localeCompare(b.itemType);
      if (typeSort !== 0) return typeSort;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
}

function createLifeCardsFromConfirmation(userId, payload = {}) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const sourceCaptureId = sanitizeText(payload.sourceCaptureId || payload.captureId, 80);
    const relatedGroupId = sanitizeText(payload.relatedGroupId || sourceCaptureId || makeId("related"), 80);
    const selectedDate = normalizeDate(payload.date);

    const createOne = (input, parentItemId = "") => {
      const itemType = normalizeScheduleItemType(input.itemType, "thing");
      const sourceType = sourceTypeForItemType(itemType);
      const ownerId = sourceType === "checkin" ? "shared" : normalizeOwnerId(store, input.ownerId || payload.ownerId || userId, userId);
      const body = {
        date: normalizeDate(input.date || selectedDate),
        segment: normalizeSegment(input.segment || payload.segment || "allDay"),
        title: sanitizeText(input.title, 180),
        detail: sanitizeText(input.detail, 800),
        slot: sanitizeText(input.slot || input.detail, 80),
        itemType,
        sourceCaptureId,
        relatedGroupId,
        parentItemId: sanitizeText(parentItemId, 80),
        repeatRule: sanitizeText(input.repeatRule || (itemType === "habit" ? "daily" : ""), 120),
        ownerId,
        participants: normalizeParticipants(store, ownerId, input.participants, userId),
        bucket: input.bucket || (normalizeDate(input.date || selectedDate) > selectedDate ? "future" : "today"),
        priority: input.priority || "normal",
        plannedAt: input.plannedAt || payload.plannedAt || "",
        dueAt: input.dueAt || payload.dueAt || "",
        durationMin: input.durationMin || payload.durationMin || 0,
        steps: Array.isArray(input.steps) ? input.steps : payload.steps,
        timeBlocks: Array.isArray(input.timeBlocks) ? input.timeBlocks : payload.timeBlocks,
      };

      if (!body.title) return null;

      let created;
      let publicItem;
      if (sourceType === "checkin") {
        created = createCheckinItem(store, body, userId);
        store.checkinItems.push(created);
        publicItem = publicCheckinItem(created, profileIds, body.date);
      } else if (sourceType === "todo") {
        created = createTodoItem(store, body, userId);
        store.todoItems.push(created);
        publicItem = publicTodoItem(created, profileIds);
      } else {
        created = createScheduleItem(store, body, userId);
        store.scheduleItems.push(created);
        publicItem = publicScheduleItem(created, profileIds);
      }

      return {
        raw: created,
        card: publicScheduleItemCard(store, publicItem, sourceType, userId),
      };
    };

    const primary = createOne({
      date: payload.date,
      segment: payload.segment,
      title: payload.title,
      detail: payload.detail,
      itemType: payload.itemType,
      ownerId: payload.ownerId,
      repeatRule: payload.repeatRule,
      priority: payload.priority,
      plannedAt: payload.plannedAt,
      dueAt: payload.dueAt,
      durationMin: payload.durationMin,
      steps: payload.steps,
      timeBlocks: payload.timeBlocks,
    });

    if (!primary) {
      throw new Error("life card title is required");
    }

    const relatedCards = (Array.isArray(payload.relatedItems) ? payload.relatedItems : [])
      .slice(0, 4)
      .map((item) => createOne(item, primary.raw.id))
      .filter(Boolean);

    return [primary.card, ...relatedCards.map((item) => item.card)];
  });
}

function getCompletionForDate(store, date, userId) {
  const scheduleItems = store.scheduleItems.filter(
    (item) => !isArchived(item) && item.date === date && item.participants?.includes(userId)
  );
  const todoItems = store.todoItems.filter(
    (item) => !isArchived(item) && item.date === date && item.bucket !== "future" && item.participants?.includes(userId)
  );
  const checkinItems = store.checkinItems.filter((item) => {
    const createdDate = String(item.createdAt || "").slice(0, 10);
    const isActive = !parseDate(createdDate) || createdDate <= date;
    return isActive;
  });
  const scheduleDone = scheduleItems.filter((item) => item.statusByUser?.[userId] === "done").length;
  const todoDone = todoItems.filter((item) => item.statusByUser?.[userId] === "done").length;
  const checkinDone = checkinItems.filter((item) => item.statusByDate?.[date]?.[userId] === "done").length;
  const dailyPulse = store.diaryDays[date]?.userDays?.[userId] || {};
  const dailyPulseDone = [
    normalizeDailyScore(dailyPulse.dailyScore, 0) > 0,
    Boolean(sanitizeText(dailyPulse.happiestThing, 200)),
    Boolean(sanitizeText(dailyPulse.smallAchievement, 200)),
  ].filter(Boolean).length;
  const dailyPulseTotal = 3;
  const done = scheduleDone + todoDone + checkinDone + dailyPulseDone;
  const total = scheduleItems.length + todoItems.length + checkinItems.length + dailyPulseTotal;

  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    schedule: {
      done: scheduleDone,
      total: scheduleItems.length,
    },
    todos: {
      done: todoDone,
      total: todoItems.length,
    },
    checkins: {
      done: checkinDone + dailyPulseDone,
      total: checkinItems.length + dailyPulseTotal,
    },
  };
}

function getMonthSummary(store, selectedDate) {
  const monthDays = getMonthDays(selectedDate);
  const totalsByUser = {};
  const emptyCompletion = {
    done: 0,
    total: 0,
    percent: 0,
    schedule: { done: 0, total: 0 },
    todos: { done: 0, total: 0 },
    checkins: { done: 0, total: 0 },
  };

  store.profiles.forEach((profile) => {
    totalsByUser[profile.id] = {
      done: 0,
      total: 0,
      percent: 0,
    };
  });

  const days = monthDays.map((day) => {
    const diarySource = store.diaryDays[day.id]?.userDays || {};
    const dailySummary = store.dailySummaries?.[day.id];
    const userStats = {};
    const dailyPulses = store.profiles.map((profile) => {
      const pulse = diarySource[profile.id] || {};
      return {
        userId: profile.id,
        displayName: profile.displayName,
        color: profile.color,
        dailyScore: normalizeDailyScore(pulse.dailyScore, 0),
        happiestThing: sanitizeText(pulse.happiestThing, 160),
        smallAchievement: sanitizeText(pulse.smallAchievement, 160),
      };
    }).filter((pulse) => pulse.dailyScore || pulse.happiestThing || pulse.smallAchievement);

    store.profiles.forEach((profile) => {
      const completion = day.isFuture ? emptyCompletion : getCompletionForDate(store, day.id, profile.id);
      userStats[profile.id] = completion;
      if (!day.isFuture) {
        totalsByUser[profile.id].done += completion.done;
        totalsByUser[profile.id].total += completion.total;
      }
    });

    return {
      ...day,
      userStats,
      eventCount: store.scheduleItems.filter((item) => !isArchived(item) && item.date === day.id).length,
      todoCount: store.todoItems.filter((item) => !isArchived(item) && item.date === day.id).length,
      captureCount: store.captures.filter((item) => item.date === day.id).length,
      summaryGenerated: Boolean(dailySummary),
      summaryTitle: sanitizeText(dailySummary?.title, 80),
      dailyPulses,
      diaryCount: Object.values(diarySource).filter(
        (item) => item?.markdown || item?.note || item?.focus || item?.mood ||
          item?.dailyScore || item?.happiestThing || item?.smallAchievement
      ).length,
    };
  });

  Object.keys(totalsByUser).forEach((userId) => {
    const stat = totalsByUser[userId];
    stat.percent = stat.total ? Math.round((stat.done / stat.total) * 100) : 0;
  });

  return {
    month: normalizeDate(selectedDate).slice(0, 7),
    days,
    totalsByUser,
  };
}

function getCheckinItemsForSummary(store, date) {
  return store.checkinItems.filter((item) => {
    const createdDate = String(item.createdAt || "").slice(0, 10);
    return !parseDate(createdDate) || createdDate <= date;
  });
}

function summarizeThing(kind, item, statusByUser) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const doneUsers = participants.filter((id) => statusByUser?.[id] === "done");
  const pendingUsers = participants.filter((id) => statusByUser?.[id] !== "done");

  return {
    id: item.id || "",
    kind,
    title: item.title || "",
    detail: item.detail || item.slot || "",
    ownerId: item.ownerId || "shared",
    participants,
    doneUsers,
    pendingUsers,
  };
}

function qualityLabel(percent) {
  if (percent >= 90) return "高质量完成";
  if (percent >= 75) return "稳定推进";
  if (percent >= 50) return "有推进";
  if (percent > 0) return "轻量推进";
  return "等待开始";
}

function buildFallbackNarrative(facts) {
  const completedText = facts.completed.length
    ? `值得记住的是，完成了 ${facts.completed.slice(0, 3).map((item) => item.title).join("、")}`
    : "这一天还没有明确完成项，但记录和状态仍保留了当天的线索";
  const missedText = facts.missed.length
    ? `需要顺手带到明天的是 ${facts.missed.slice(0, 3).map((item) => item.title).join("、")}`
    : "没有明显遗漏项";
  const placeText = facts.locations.length ? `共同瞬间出现在 ${facts.locations.join("、")}` : "";
  const captureText = facts.captures.length
    ? `记录留下了 ${facts.captures.length} 条现场线索`
    : "记录还比较少";
  const insightText = facts.relationshipInsights?.length
    ? `后端还记住了 ${facts.relationshipInsights.slice(0, 2).map((item) => item.title).join("、")}`
    : "";
  return [completedText, missedText, placeText || captureText, insightText]
    .filter(Boolean)
    .join("。") + "。";
}

function buildAgentPrompt(facts) {
  return [
    "你是双人共享工作台的 Daily Story 助手。请基于输入事实生成一天的 AI 回忆页。",
    "只能使用输入事实，不允许编造。",
    "风格克制具体，不要使用固定标题或报表口吻。",
    "需要覆盖：今日标题、共同瞬间、完成/延期事项、照片地点、每个人的状态、明日建议。",
    "输出必须严格符合给定 JSON schema。",
    "",
    "输入事实 JSON：",
    JSON.stringify(facts, null, 2),
  ].join("\n");
}

function generateAgentNarrative(facts, options = {}) {
  if (!fs.existsSync(dailySummarySchemaPath)) {
    throw new Error(`schema not found: ${dailySummarySchemaPath}`);
  }

  const outputPath = path.join(os.tmpdir(), `couple-daily-summary-${facts.date}-${Date.now()}.json`);
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "-C",
    repoRoot,
    "--output-schema",
    dailySummarySchemaPath,
    "-o",
    outputPath,
    buildAgentPrompt(facts),
  ];

  if (options.model) {
    args.splice(1, 0, "--model", options.model);
  }

  const result = spawnSync("codex", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      OTEL_SDK_DISABLED: "true",
    },
    timeout: Number(options.timeoutMs || 120000),
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((stderr || stdout || "codex exec failed").trim());
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error("codex output file was not created");
  }

  return JSON.parse(fs.readFileSync(outputPath, "utf8").trim());
}

function getDailySummaryFacts(store, date, options = {}) {
  const profileIds = getProfileIds(store);
  const publicProfiles = store.profiles.map(publicProfile);
  const relationshipInsights = buildRelationshipInsights(store, options.userId || profileIds[0] || "", date).slice(0, 8);
  const scheduleThings = store.scheduleItems
    .filter((item) => item.date === date)
    .map((item) => summarizeThing(scheduleItemTypeLabels[normalizeScheduleItemType(item.itemType, "date")] || "生活卡", item, item.statusByUser || {}));
  const todoThings = store.todoItems
    .filter((item) => item.date === date && normalizeTodoBucket(item.bucket) !== "future")
    .map((item) => summarizeThing(scheduleItemTypeLabels[normalizeScheduleItemType(item.itemType, "thing")] || "事情", item, item.statusByUser || {}));
  const checkinThings = getCheckinItemsForSummary(store, date)
    .map((item) => summarizeThing("打卡", item, item.statusByDate?.[date] || {}));
  const things = [...todoThings, ...scheduleThings, ...checkinThings];
  const completed = things.filter((item) => item.participants.length && item.pendingUsers.length === 0);
  const missed = things.filter((item) => item.pendingUsers.length > 0);
  const captures = store.captures
    .filter((item) => item.date === date)
    .filter((item) => options.includePrivate || item.visibility === "shared")
    .map(publicCapture)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const photos = captures.flatMap((capture) => capture.assets || []);
  const locations = [...new Set(captures.map((capture) => sanitizeText(capture.location, 80)).filter(Boolean))];
  const people = store.profiles.map((profile) => {
    const day = store.diaryDays[date]?.userDays?.[profile.id] || {};
    const stat = getCompletionForDate(store, date, profile.id);
    return {
      userId: profile.id,
      displayName: profile.displayName,
      color: profile.color,
      done: stat.done,
      total: stat.total,
      percent: stat.percent,
      mood: day.mood || "",
      energy: Number(day.energy) || 3,
      focus: day.focus || "",
      dailyScore: normalizeDailyScore(day.dailyScore, 0),
      happiestThing: day.happiestThing || "",
      smallAchievement: day.smallAchievement || "",
    };
  });
  const stats = people.reduce(
    (acc, person) => ({
      done: acc.done + person.done,
      total: acc.total + person.total,
      percent: 0,
    }),
    { done: 0, total: 0, percent: 0 }
  );
  stats.percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  return {
    date,
    profiles: publicProfiles,
    profileIds,
    completion: stats,
    completed_items: completed.map(publicSummaryThing),
    missed_items: missed.map(publicSummaryThing),
    captures: captures.map((capture) => ({
      text: capture.text,
      mode: capture.mode,
      location: capture.location,
      createdBy: capture.createdBy,
      photoCount: capture.assets.length,
    })),
    locations,
    photos: photos.map(publicDiaryAsset).filter(Boolean),
    status_by_user: people,
    source_counts: {
      todos: todoThings.length,
      schedules: scheduleThings.length,
      checkins: checkinThings.length,
      captures: captures.length,
      photos: photos.length,
      locations: locations.length,
      dailyPulses: people.filter((person) => person.dailyScore || person.happiestThing || person.smallAchievement).length,
      relationshipInsights: relationshipInsights.length,
    },
    relationshipInsights,
  };
}

function buildDailySummary(store, date, userId, options = {}) {
  const facts = getDailySummaryFacts(store, date, { ...options, userId });
  const percent = facts.completion.percent;
  let agent = null;
  let mode = "fallback";

  if (options.useAgent || process.env.PEOS_COUPLE_DAILY_SUMMARY_AGENT === "1") {
    try {
      agent = generateAgentNarrative(facts, {
        model: options.model || process.env.PEOS_COUPLE_DAILY_SUMMARY_MODEL,
        timeoutMs: options.timeoutMs,
      });
      mode = "agent";
    } catch (error) {
      mode = "fallback";
    }
  }

  const fallbackTitle = `${date.slice(5).replace("-", "/")} 的共同回忆`;
  const completed = facts.completed_items.map(publicSummaryThing);
  const missed = facts.missed_items.map(publicSummaryThing);
  const photos = facts.photos.map(publicDiaryAsset).filter(Boolean);
  const narrative = sanitizeText(agent?.narrative || buildFallbackNarrative({
    completed,
    missed,
    locations: facts.locations,
    captures: facts.captures,
    relationshipInsights: facts.relationshipInsights,
  }), 900);
  const label = sanitizeText(agent?.quality_label || qualityLabel(percent), 80);
  const qualityNote = sanitizeText(
    agent?.quality_note ||
      (facts.completion.total
        ? `完成质量 ${percent}%，共 ${facts.completion.done}/${facts.completion.total} 个状态点完成。`
        : "今天还没有足够的生活卡或打卡数据。"),
    240
  );

  return {
    date,
    title: sanitizeText(agent?.title || fallbackTitle, 80),
    subtitle: facts.locations.length
      ? `地点：${facts.locations.join("、")}`
      : "由记录、生活卡、照片、地点和每日状态生成",
    narrative,
    qualityScore: percent,
    qualityLabel: label,
    qualityNote,
    nextStep: sanitizeText(
      agent?.next_step ||
        (missed.length
          ? `先补上：${missed.slice(0, 2).map((item) => item.title).join("、")}`
          : "保持今天的节奏，明天先写下最重要的一件事。"),
      240
    ),
    illustration: photos[0]
      ? { type: "photo", url: photos[0].url, alt: photos[0].name || "当天照片" }
      : { type: "pixel", url: "", alt: "像素小猫日总结" },
    people: facts.status_by_user,
    completed: completed.slice(0, 10),
    missed: missed.slice(0, 10),
    moments: facts.captures.slice(0, 8),
    memoryHooks: facts.relationshipInsights.slice(0, 6),
    locations: facts.locations,
    photos: photos.slice(0, 8),
    stats: facts.completion,
    sourceCounts: facts.source_counts,
    generatedBy: userId,
    generatedAt: nowIso(),
    mode,
  };
}

function getState(userId, options = {}) {
  const store = readStore();
  const selectedDate = normalizeDate(options.date);
  const weekDays = getWeekDays(selectedDate);
  const monthDays = getMonthDays(selectedDate);
  const weekDates = new Set(weekDays.map((item) => item.id));
  const profileIds = store.profiles.map((item) => item.id);
  const visibleCaptures = store.captures
    .filter((item) => item.date === selectedDate)
    .filter((item) => item.visibility === "shared" || item.createdBy === userId)
    .map(publicCapture)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const relationshipInsights = buildRelationshipInsights(store, userId, selectedDate);

  return {
    apiVersion: store.apiVersion,
    revision: store.revision,
    updatedAt: store.updatedAt,
    today: formatDate(),
    selectedDate,
    weekDays,
    monthDays,
    monthSummary: getMonthSummary(store, selectedDate),
    segments: segmentDefinitions,
    space: store.space,
    currentUser: store.profiles.map(publicProfile).find((profile) => profile.id === userId),
    profiles: store.profiles.map(publicProfile),
    scheduleItems: store.scheduleItems
      .filter((item) => weekDates.has(item.date))
      .map((item) => publicScheduleItem(item, profileIds))
      .sort((a, b) => {
        const dateSort = a.date.localeCompare(b.date);
        if (dateSort !== 0) return dateSort;
        const segmentSort = segmentDefinitions.findIndex((item) => item.key === a.segment) -
          segmentDefinitions.findIndex((item) => item.key === b.segment);
        if (segmentSort !== 0) return segmentSort;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      }),
    todoItems: store.todoItems
      .map((item) => publicTodoItem(item, profileIds))
      .filter((item) => {
        const inWeek = weekDates.has(item.date);
        const unfinished = !item.archivedAt && Object.values(item.statusByUser || {}).some((status) => status !== "done");
        return inWeek || unfinished;
      })
      .sort((a, b) => {
        const priorityWeight = { high: 0, normal: 1, low: 2 };
        const dateSort = a.date.localeCompare(b.date);
        if (dateSort !== 0) return dateSort;
        const prioritySort = (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
        if (prioritySort !== 0) return prioritySort;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      }),
    checkinItems: store.checkinItems
      .map((item) => publicCheckinItem(item, profileIds, selectedDate))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    deadlineItems: store.deadlineItems
      .map((item) => publicDeadlineItem(item, profileIds))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt))),
    diaryDay: getDiaryDaySnapshot(store, selectedDate),
    dailySummary: publicDailySummary(store.dailySummaries[selectedDate]),
    scheduleItemCards: buildScheduleItemCards(store, userId, selectedDate, relationshipInsights),
    relationshipInsights,
    memoryHints: buildMemoryHints(store, relationshipInsights),
    memoryItems: buildMemoryItems(store, userId, selectedDate, relationshipInsights),
    timelineDays: buildTimelineDays(store, userId, selectedDate),
    personalPages: Object.fromEntries(
      store.profiles.map((profile) => [
        profile.id,
        publicPersonalPage(store.personalPages?.[profile.id], profile),
      ])
    ),
    captures: visibleCaptures,
  };
}

function mutateStore(mutator) {
  const store = readStore();
  const result = mutator(store);
  const updated = writeStore(store);
  return {
    result,
    store: updated,
  };
}

function upsertScheduleItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = store.profiles.map((item) => item.id);
    const existing = store.scheduleItems.find((item) => item.id === payload.id);

    if (!existing) {
      const created = createScheduleItem(store, payload, userId);
      store.scheduleItems.push(created);
      return publicScheduleItem(created, profileIds);
    }

    const nextOwnerId =
      payload.ownerId === "shared"
        ? "shared"
        : profileIds.includes(payload.ownerId)
          ? payload.ownerId
          : existing.ownerId;
    const nextParticipants =
      nextOwnerId === "shared"
        ? profileIds
        : (Array.isArray(payload.participants) ? payload.participants : existing.participants)
            .filter((id) => profileIds.includes(id));

    existing.date = normalizeDate(payload.date, existing.date);
    existing.segment = normalizeSegment(payload.segment || existing.segment);
    existing.title = sanitizeText(payload.title ?? existing.title, 160);
    existing.detail = sanitizeText(payload.detail ?? existing.detail, 800);
    existing.itemType = inferScheduleItemType(payload, normalizeScheduleItemType(existing.itemType, "date"));
    existing.sourceCaptureId = sanitizeText(payload.sourceCaptureId ?? existing.sourceCaptureId, 80);
    existing.relatedGroupId = sanitizeText(payload.relatedGroupId ?? existing.relatedGroupId, 80);
    existing.parentItemId = sanitizeText(payload.parentItemId ?? existing.parentItemId, 80);
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule, 120);
    existing.ownerId = nextOwnerId;
    existing.participants = [...new Set(nextParticipants.length ? nextParticipants : [userId])];
    existing.statusByUser = Object.fromEntries(
      existing.participants.map((id) => [
        id,
        validStatuses.has(existing.statusByUser?.[id]) ? existing.statusByUser[id] : "todo",
      ])
    );
    Object.assign(existing, buildLifeCardPlanning({ ...payload, date: existing.date, segment: existing.segment, participants: existing.participants }, existing));
    existing.updatedBy = userId;
    existing.updatedAt = nowIso();

    if (!existing.title) {
      throw new Error("schedule title is required");
    }

    return publicScheduleItem(existing, profileIds);
  });
}

function toggleScheduleItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = store.profiles.map((item) => item.id);
    const item = store.scheduleItems.find((entry) => entry.id === payload.id);
    if (!item) {
      throw new Error("schedule item not found");
    }

    const targetUserId = resolveStatusTargetUserId(store, userId, payload.targetUserId);
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    applyStepAwareStatusToggle(item, targetUserId, userId, payload);
    item.updatedBy = userId;
    item.updatedAt = nowIso();

    return publicScheduleItem(item, profileIds);
  });
}

function archiveScheduleItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const item = store.scheduleItems.find((entry) => entry.id === payload.id);
    if (!item) {
      throw new Error("schedule item not found");
    }

    const timestamp = nowIso();
    item.archivedAt = item.archivedAt || timestamp;
    item.archivedBy = item.archivedBy || userId;
    item.updatedBy = userId;
    item.updatedAt = timestamp;

    return publicScheduleItem(item, profileIds);
  });
}

function deleteScheduleItem(userId, payload) {
  return mutateStore((store) => {
    const index = store.scheduleItems.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      throw new Error("schedule item not found");
    }
    const [removed] = store.scheduleItems.splice(index, 1);
    return {
      id: removed.id,
      deletedBy: userId,
    };
  });
}

function upsertTodoItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const existing = store.todoItems.find((item) => item.id === payload.id);

    if (!existing) {
      const created = createTodoItem(store, payload, userId);
      store.todoItems.push(created);
      return publicTodoItem(created, profileIds);
    }

    const ownerId = normalizeOwnerId(store, payload.ownerId ?? existing.ownerId, userId);
    const participants = normalizeParticipants(store, ownerId, payload.participants || existing.participants, userId);
    existing.date = normalizeDate(payload.date, existing.date);
    existing.bucket = normalizeTodoBucket(payload.bucket || existing.bucket);
    existing.title = sanitizeText(payload.title ?? existing.title, 180);
    existing.detail = sanitizeText(payload.detail ?? existing.detail, 800);
    existing.itemType = inferScheduleItemType(payload, normalizeScheduleItemType(existing.itemType, "thing"));
    existing.sourceCaptureId = sanitizeText(payload.sourceCaptureId ?? existing.sourceCaptureId, 80);
    existing.relatedGroupId = sanitizeText(payload.relatedGroupId ?? existing.relatedGroupId, 80);
    existing.parentItemId = sanitizeText(payload.parentItemId ?? existing.parentItemId, 80);
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule, 120);
    existing.priority = normalizePriority(payload.priority || existing.priority);
    existing.ownerId = ownerId;
    existing.participants = participants;
    existing.statusByUser = Object.fromEntries(
      participants.map((id) => [
        id,
        validStatuses.has(existing.statusByUser?.[id]) ? existing.statusByUser[id] : "todo",
      ])
    );
    Object.assign(existing, buildLifeCardPlanning({ ...payload, date: existing.date, participants }, existing));
    existing.updatedBy = userId;
    existing.updatedAt = nowIso();

    if (!existing.title) {
      throw new Error("todo title is required");
    }

    return publicTodoItem(existing, profileIds);
  });
}

function toggleTodoItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const item = store.todoItems.find((entry) => entry.id === payload.id);
    if (!item) {
      throw new Error("todo item not found");
    }

    const targetUserId = resolveStatusTargetUserId(store, userId, payload.targetUserId);
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    applyStepAwareStatusToggle(item, targetUserId, userId, payload);
    item.updatedBy = userId;
    item.updatedAt = nowIso();
    return publicTodoItem(item, profileIds);
  });
}

function archiveTodoItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const item = store.todoItems.find((entry) => entry.id === payload.id);
    if (!item) {
      throw new Error("todo item not found");
    }

    const timestamp = nowIso();
    item.archivedAt = item.archivedAt || timestamp;
    item.archivedBy = item.archivedBy || userId;
    item.updatedBy = userId;
    item.updatedAt = timestamp;

    return publicTodoItem(item, profileIds);
  });
}

function deleteTodoItem(userId, payload) {
  return mutateStore((store) => {
    const index = store.todoItems.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      throw new Error("todo item not found");
    }
    const [removed] = store.todoItems.splice(index, 1);
    return {
      id: removed.id,
      deletedBy: userId,
    };
  });
}

function upsertCheckinItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const existing = store.checkinItems.find((item) => item.id === payload.id);

    if (!existing) {
      const created = createCheckinItem(store, payload, userId);
      store.checkinItems.push(created);
      return publicCheckinItem(created, profileIds, normalizeDate(payload.date));
    }

    existing.title = sanitizeText(payload.title ?? existing.title, 120);
    existing.slot = sanitizeText(payload.slot ?? existing.slot, 80);
    existing.itemType = inferScheduleItemType(payload, normalizeScheduleItemType(existing.itemType, "checkin"));
    existing.sourceCaptureId = sanitizeText(payload.sourceCaptureId ?? existing.sourceCaptureId, 80);
    existing.relatedGroupId = sanitizeText(payload.relatedGroupId ?? existing.relatedGroupId, 80);
    existing.parentItemId = sanitizeText(payload.parentItemId ?? existing.parentItemId, 80);
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule ?? "daily", 120);
    existing.ownerId = "shared";
    existing.participants = profileIds;
    existing.statusByDate = existing.statusByDate || {};
    existing.updatedBy = userId;
    existing.updatedAt = nowIso();

    if (!existing.title) {
      throw new Error("checkin title is required");
    }

    return publicCheckinItem(existing, profileIds, normalizeDate(payload.date));
  });
}

function toggleCheckinItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const date = normalizeDate(payload.date);
    const item = store.checkinItems.find((entry) => entry.id === payload.id);
    if (!item) {
      throw new Error("checkin item not found");
    }

    const targetUserId = resolveStatusTargetUserId(store, userId, payload.targetUserId);
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    item.statusByDate = item.statusByDate || {};
    item.statusByDate[date] = item.statusByDate[date] || {};
    const currentStatus = validStatuses.has(item.statusByDate[date][targetUserId])
      ? item.statusByDate[date][targetUserId]
      : "todo";
    item.statusByDate[date][targetUserId] = validStatuses.has(payload.status)
      ? payload.status
      : currentStatus === "done"
        ? "todo"
        : "done";
    item.updatedBy = userId;
    item.updatedAt = nowIso();

    return publicCheckinItem(item, profileIds, date);
  });
}

function deleteCheckinItem(userId, payload) {
  return mutateStore((store) => {
    const index = store.checkinItems.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      throw new Error("checkin item not found");
    }
    const [removed] = store.checkinItems.splice(index, 1);
    return {
      id: removed.id,
      deletedBy: userId,
    };
  });
}

function upsertDeadlineItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const existing = store.deadlineItems.find((item) => item.id === payload.id);

    if (!existing) {
      const created = createDeadlineItem(store, payload, userId);
      store.deadlineItems.push(created);
      return publicDeadlineItem(created, profileIds);
    }

    const ownerId = normalizeOwnerId(store, payload.ownerId ?? existing.ownerId, userId);
    const participants = normalizeParticipants(store, ownerId, payload.participants || existing.participants, userId);
    existing.date = normalizeDate(payload.date, existing.date);
    existing.title = sanitizeText(payload.title ?? existing.title, 180);
    existing.detail = sanitizeText(payload.detail ?? existing.detail, 500);
    existing.itemType = inferScheduleItemType(payload, normalizeScheduleItemType(existing.itemType, "reminder"));
    existing.sourceCaptureId = sanitizeText(payload.sourceCaptureId ?? existing.sourceCaptureId, 80);
    existing.relatedGroupId = sanitizeText(payload.relatedGroupId ?? existing.relatedGroupId, 80);
    existing.parentItemId = sanitizeText(payload.parentItemId ?? existing.parentItemId, 80);
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule, 120);
    existing.ownerId = ownerId;
    existing.participants = participants;
    existing.statusByUser = Object.fromEntries(
      participants.map((id) => [
        id,
        validStatuses.has(existing.statusByUser?.[id]) ? existing.statusByUser[id] : "todo",
      ])
    );
    existing.updatedBy = userId;
    existing.updatedAt = nowIso();

    if (!existing.title) {
      throw new Error("deadline title is required");
    }

    return publicDeadlineItem(existing, profileIds);
  });
}

function toggleDeadlineItem(userId, payload) {
  return mutateStore((store) => {
    const profileIds = getProfileIds(store);
    const item = store.deadlineItems.find((entry) => entry.id === payload.id);
    if (!item) {
      throw new Error("deadline item not found");
    }

    const targetUserId = resolveStatusTargetUserId(store, userId, payload.targetUserId);
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    const currentStatus = validStatuses.has(item.statusByUser?.[targetUserId])
      ? item.statusByUser[targetUserId]
      : "todo";
    const nextStatus = validStatuses.has(payload.status)
      ? payload.status
      : currentStatus === "done"
        ? "todo"
        : "done";
    item.statusByUser = {
      ...(item.statusByUser || {}),
      [targetUserId]: nextStatus,
    };
    syncArchiveWithCompletion(item, userId);
    item.updatedBy = userId;
    item.updatedAt = nowIso();

    return publicDeadlineItem(item, profileIds);
  });
}

function deleteDeadlineItem(userId, payload) {
  return mutateStore((store) => {
    const index = store.deadlineItems.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      throw new Error("deadline item not found");
    }
    const [removed] = store.deadlineItems.splice(index, 1);
    return {
      id: removed.id,
      deletedBy: userId,
    };
  });
}

function updateDiaryDay(userId, payload) {
  return mutateStore((store) => {
    const date = normalizeDate(payload.date);
    const current = store.diaryDays[date] || { date, userDays: {}, sharedNotes: [] };
    const userDay = current.userDays[userId] || { userId, energy: 3, images: [] };
    current.userDays[userId] = {
      ...userDay,
      mood: sanitizeText(payload.mood ?? userDay.mood, 40),
      energy: Math.max(1, Math.min(5, Number(payload.energy ?? userDay.energy) || 3)),
      focus: sanitizeText(payload.focus ?? userDay.focus, 160),
      note: sanitizeText(payload.note ?? userDay.note, 1200),
      markdown: sanitizeMarkdown(payload.markdown ?? userDay.markdown ?? userDay.note, 20000),
      dailyScore: normalizeDailyScore(payload.dailyScore ?? userDay.dailyScore, 0),
      happiestThing: sanitizeText(payload.happiestThing ?? userDay.happiestThing, 220),
      smallAchievement: sanitizeText(payload.smallAchievement ?? userDay.smallAchievement, 220),
      images: Array.isArray(userDay.images) ? userDay.images.map(publicDiaryAsset).filter(Boolean) : [],
      updatedAt: nowIso(),
    };
    store.diaryDays[date] = current;
    return getDiaryDaySnapshot(store, date);
  });
}

function addDiaryAsset(userId, payload) {
  return mutateStore((store) => {
    const date = normalizeDate(payload.date);
    const asset = createImageAsset(userId, payload, {
      date,
      idPrefix: "image",
      prefix: "diary",
    });

    const current = store.diaryDays[date] || { date, userDays: {}, sharedNotes: [] };
    const userDay = current.userDays[userId] || { userId, energy: 3, images: [] };
    current.userDays[userId] = {
      ...userDay,
      images: [...(Array.isArray(userDay.images) ? userDay.images : []), asset],
      updatedAt: nowIso(),
    };
    store.diaryDays[date] = current;

    return {
      asset: publicDiaryAsset(asset),
      diaryDay: getDiaryDaySnapshot(store, date),
      markdown: `![${asset.name}](${asset.url})`,
    };
  });
}

function addCapture(userId, payload) {
  return mutateStore((store) => {
    const text = sanitizeText(payload.text, 1200);
    if (!text) {
      throw new Error("capture text is required");
    }

    const date = normalizeDate(payload.date);
    const visibility = validVisibilities.has(payload.visibility) ? payload.visibility : "shared";
    const mode = validCaptureModes.has(payload.mode) ? payload.mode : "save";
    const assetPayloads = [
      ...(Array.isArray(payload.assets) ? payload.assets : []),
      payload.dataUrl ? { name: payload.name, dataUrl: payload.dataUrl } : null,
    ].filter(Boolean);
    const assets = assetPayloads.slice(0, 3).map((asset) =>
      createImageAsset(userId, asset, {
        date,
        idPrefix: "capture-image",
        pathParts: ["captures"],
        prefix: "capture",
      })
    );
    const capture = {
      id: makeId("capture"),
      date,
      text,
      mode,
      rawKind: sanitizeText(payload.rawKind || "raw", 40),
      rawFormat: sanitizeText(payload.rawFormat || (assets.length ? "markdown+photo" : "markdown"), 40),
      analysisIntent: sanitizeText(payload.analysisIntent || "", 80),
      visibility,
      location: sanitizeText(payload.location, 160),
      assets,
      createdBy: userId,
      createdAt: nowIso(),
    };
    store.captures.unshift(capture);
    store.captures = store.captures.slice(0, 300);
    return capture;
  });
}

function updatePersonalPage(userId, payload) {
  return mutateStore((store) => {
    const profile = store.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw new Error("profile not found");
    }

    const current = store.personalPages?.[userId] || {};
    const next = {
      userId,
      title: sanitizeText(payload.title ?? current.title ?? profile.displayName, 60) || profile.displayName,
      bio: sanitizeText(payload.bio ?? current.bio, 220),
      likes: sanitizeText(payload.likes ?? current.likes, 220),
      longTermGoal: sanitizeText(payload.longTermGoal ?? current.longTermGoal, 500),
      identityGoal: sanitizeText(payload.identityGoal ?? current.identityGoal, 500),
      notes: sanitizeText(payload.notes ?? current.notes, 1200),
      updatedAt: nowIso(),
    };
    store.personalPages = store.personalPages || {};
    store.personalPages[userId] = next;
    return publicPersonalPage(next, profile);
  });
}

function updateProfile(userId, payload = {}) {
  return mutateStore((store) => {
    const profile = store.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw new Error("profile not found");
    }

    const currentName = profile.displayName;
    const nextName = sanitizeText(payload.displayName ?? profile.displayName, 40) || profile.displayName;
    profile.displayName = nextName;
    profile.initials = sanitizeText(payload.initials ?? profile.initials ?? nextName.slice(0, 1), 2) ||
      nextName.slice(0, 1);
    profile.color = normalizeColor(payload.color, profile.color || "#ff5c9a");

    const avatar = sanitizeText(payload.avatar ?? profile.avatar ?? "pink-cat", 40);
    profile.avatar = avatar || "pink-cat";
    if (payload.avatarAsset?.dataUrl) {
      const asset = createImageAsset(userId, payload.avatarAsset, {
        date: formatDate(),
        idPrefix: "avatar",
        pathParts: ["avatars", userId],
        prefix: "avatar",
      });
      profile.avatar = "custom";
      profile.avatarUrl = asset.url;
    } else if (payload.avatar !== undefined && profile.avatar !== "custom") {
      profile.avatarUrl = "";
    } else if (payload.avatarUrl !== undefined) {
      profile.avatarUrl = sanitizeText(payload.avatarUrl, 500);
    } else {
      profile.avatarUrl = sanitizeText(profile.avatarUrl || "", 500);
    }

    const personalPage = store.personalPages?.[userId];
    if (personalPage && (!personalPage.title || personalPage.title === currentName)) {
      personalPage.title = nextName;
      personalPage.updatedAt = nowIso();
    }

    return publicProfile(profile);
  });
}

function refreshDailySummary(userId, payload = {}) {
  return mutateStore((store) => {
    const date = normalizeDate(payload.date);
    const summary = buildDailySummary(store, date, userId || "system", {
      includePrivate: payload.includePrivate === true,
      useAgent: payload.useAgent === true,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
    });
    store.dailySummaries = store.dailySummaries || {};
    store.dailySummaries[date] = summary;
    return publicDailySummary(summary);
  });
}

module.exports = {
  addCapture,
  addDiaryAsset,
  analyzeCapture,
  archiveScheduleItem,
  archiveTodoItem,
  createLifeCardsFromConfirmation,
  deleteCheckinItem,
  deleteDeadlineItem,
  deleteScheduleItem,
  deleteTodoItem,
  getState,
  readAuthConfig,
  readPublicBootstrap,
  readRevision,
  refreshDailySummary,
  segmentDefinitions,
  toggleCheckinItem,
  toggleDeadlineItem,
  toggleScheduleItem,
  toggleTodoItem,
  updatePersonalPage,
  updateProfile,
  updateDiaryDay,
  upsertCheckinItem,
  upsertDeadlineItem,
  upsertScheduleItem,
  upsertTodoItem,
  verifyLogin,
};
