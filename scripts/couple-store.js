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

const validSegments = new Set(segmentDefinitions.map((item) => item.key));
const validVisibilities = new Set(["shared", "private"]);
const validCaptureModes = new Set(["analysis", "todo"]);
const validStatuses = new Set(["todo", "done"]);
const validPriorities = new Set(["low", "normal", "high"]);
const validTodoBuckets = new Set(["today", "future"]);
const validImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxImageBytes = 5 * 1024 * 1024;
const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

function getMonthDays(dateText) {
  const selected = parseDate(normalizeDate(dateText)) || new Date();
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);

  return Array.from({ length: last.getDate() }, (_, index) => {
    const date = new Date(first);
    date.setDate(index + 1);
    return {
      id: formatDate(date),
      label: weekdayLabels[date.getDay()],
      shortLabel: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      dayNumber: index + 1,
      isToday: formatDate(date) === formatDate(),
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
    ownerId,
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(normalizedParticipants.map((id) => [id, "todo"])),
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

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
    priority: normalizePriority(payload.priority),
    ownerId,
    participants,
    statusByUser: Object.fromEntries(participants.map((id) => [id, "todo"])),
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

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
    ownerId,
    participants,
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!item.title) {
    throw new Error("deadline title is required");
  }

  return item;
}

function createDefaultStore() {
  const profiles = getDefaultProfiles();
  const today = formatDate();
  const firstItem = createScheduleItem(
    { profiles },
    {
      date: today,
      segment: "evening",
      ownerId: "shared",
      title: "一起确认今天的安排",
      detail: "这是第一条共享日程，可以直接改掉。",
    },
    profiles[0].id
  );
  const firstTodo = createTodoItem(
    { profiles },
    {
      date: today,
      ownerId: "shared",
      title: "写下今天最重要的一件事",
      priority: "high",
      bucket: "today",
    },
    profiles[0].id
  );
  const firstCheckin = createCheckinItem(
    { profiles },
    {
      ownerId: "shared",
      title: "互相确认今天的状态",
      slot: "晚上",
    },
    profiles[0].id
  );

  return {
    version: 1,
    apiVersion: "couple-local-v1",
    revision: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    space: {
      id: "default",
      name: "我们的共同日程",
      theme: "pink-pixel-cat",
    },
    profiles,
    scheduleItems: [firstItem],
    todoItems: [firstTodo],
    checkinItems: [firstCheckin],
    deadlineItems: [],
    diaryDays: {},
    dailySummaries: {},
    personalPages: {
      [profiles[0].id]: {
        userId: profiles[0].id,
        title: "大猫",
        bio: "记录自己的状态，也记录两个人一起推进的事。",
        likes: "可爱、温暖、简单直接。",
        notes: "",
        updatedAt: nowIso(),
      },
      [profiles[1].id]: {
        userId: profiles[1].id,
        title: "小猫",
        bio: "一起看共享首页，也保留自己的小空间。",
        likes: "轻松、清楚、好维护。",
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
  shaped.space = shaped.space || { id: "default", name: "我们的共同日程", theme: "pink-pixel-cat" };
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
    notes: source.notes || "",
    updatedAt: source.updatedAt || "",
  };
}

function publicCapture(capture) {
  return {
    id: capture.id || "",
    date: capture.date || "",
    text: capture.text || "",
    mode: validCaptureModes.has(capture.mode) ? capture.mode : "analysis",
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
  };
}

function publicCheckinItem(item, profileIds, date) {
  const normalizedParticipants = profileIds;
  const dayStatus = item.statusByDate?.[date] || {};
  return {
    id: item.id,
    title: item.title || "",
    slot: item.slot || "",
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
  };
}

function publicDeadlineItem(item, profileIds) {
  const participants = (Array.isArray(item.participants) ? item.participants : [])
    .filter((id) => profileIds.includes(id));
  return {
    id: item.id,
    date: normalizeDate(item.date),
    title: item.title || "",
    detail: item.detail || "",
    ownerId: item.ownerId || "shared",
    participants: participants.length ? participants : profileIds,
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
  };
}

function getCompletionForDate(store, date, userId) {
  const scheduleItems = store.scheduleItems.filter(
    (item) => item.date === date && item.participants?.includes(userId)
  );
  const todoItems = store.todoItems.filter(
    (item) => item.date === date && item.bucket !== "future" && item.participants?.includes(userId)
  );
  const checkinItems = store.checkinItems.filter((item) => {
    const createdDate = String(item.createdAt || "").slice(0, 10);
    const isActive = !parseDate(createdDate) || createdDate <= date;
    return isActive;
  });
  const scheduleDone = scheduleItems.filter((item) => item.statusByUser?.[userId] === "done").length;
  const todoDone = todoItems.filter((item) => item.statusByUser?.[userId] === "done").length;
  const checkinDone = checkinItems.filter((item) => item.statusByDate?.[date]?.[userId] === "done").length;
  const done = scheduleDone + todoDone + checkinDone;
  const total = scheduleItems.length + todoItems.length + checkinItems.length;

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
      done: checkinDone,
      total: checkinItems.length,
    },
  };
}

function getMonthSummary(store, selectedDate) {
  const monthDays = getMonthDays(selectedDate);
  const totalsByUser = {};

  store.profiles.forEach((profile) => {
    totalsByUser[profile.id] = {
      done: 0,
      total: 0,
      percent: 0,
    };
  });

  const days = monthDays.map((day) => {
    const diarySource = store.diaryDays[day.id]?.userDays || {};
    const userStats = {};

    store.profiles.forEach((profile) => {
      const completion = getCompletionForDate(store, day.id, profile.id);
      userStats[profile.id] = completion;
      totalsByUser[profile.id].done += completion.done;
      totalsByUser[profile.id].total += completion.total;
    });

    return {
      ...day,
      userStats,
      eventCount: store.scheduleItems.filter((item) => item.date === day.id).length,
      todoCount: store.todoItems.filter((item) => item.date === day.id && item.bucket !== "future").length,
      captureCount: store.captures.filter((item) => item.date === day.id).length,
      summaryGenerated: Boolean(store.dailySummaries?.[day.id]),
      diaryCount: Object.values(diarySource).filter(
        (item) => item?.markdown || item?.note || item?.focus || item?.mood
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
    ? `完成了 ${facts.completed.slice(0, 3).map((item) => item.title).join("、")}`
    : "还没有明确完成项";
  const missedText = facts.missed.length
    ? `没做完的是 ${facts.missed.slice(0, 3).map((item) => item.title).join("、")}`
    : "没有明显遗漏项";
  const placeText = facts.locations.length ? `地点线索在 ${facts.locations.join("、")}` : "";
  const captureText = facts.captures.length
    ? `随手记留下了 ${facts.captures.length} 条现场记录`
    : "随手记还比较少";
  return [completedText, missedText, placeText || captureText]
    .filter(Boolean)
    .join("。") + "。";
}

function buildAgentPrompt(facts) {
  return [
    "你是双人共享工作台的每日总结助手。请基于输入事实生成一天的共享日记。",
    "只能使用输入事实，不允许编造。",
    "需要覆盖：完成了什么、没完成什么、地点/照片线索、每个人的状态、当天完成质量。",
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
  const scheduleThings = store.scheduleItems
    .filter((item) => item.date === date)
    .map((item) => summarizeThing("日程", item, item.statusByUser || {}));
  const todoThings = store.todoItems
    .filter((item) => item.date === date && normalizeTodoBucket(item.bucket) !== "future")
    .map((item) => summarizeThing("Todo", item, item.statusByUser || {}));
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
    },
  };
}

function buildDailySummary(store, date, userId, options = {}) {
  const facts = getDailySummaryFacts(store, date, options);
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

  const fallbackTitle = `${date.slice(5).replace("-", "/")} 自动日总结`;
  const completed = facts.completed_items.map(publicSummaryThing);
  const missed = facts.missed_items.map(publicSummaryThing);
  const photos = facts.photos.map(publicDiaryAsset).filter(Boolean);
  const narrative = sanitizeText(agent?.narrative || buildFallbackNarrative({
    completed,
    missed,
    locations: facts.locations,
    captures: facts.captures,
  }), 900);
  const label = sanitizeText(agent?.quality_label || qualityLabel(percent), 80);
  const qualityNote = sanitizeText(
    agent?.quality_note ||
      (facts.completion.total
        ? `完成质量 ${percent}%，共 ${facts.completion.done}/${facts.completion.total} 个状态点完成。`
        : "今天还没有足够的 Todo、日程或打卡数据。"),
    240
  );

  return {
    date,
    title: sanitizeText(agent?.title || fallbackTitle, 80),
    subtitle: facts.locations.length
      ? `地点：${facts.locations.join("、")}`
      : "由随手记、Todo、日程和打卡自动生成",
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
        const unfinished = Object.values(item.statusByUser || {}).some((status) => status !== "done");
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
    existing.ownerId = nextOwnerId;
    existing.participants = [...new Set(nextParticipants.length ? nextParticipants : [userId])];
    existing.statusByUser = Object.fromEntries(
      existing.participants.map((id) => [
        id,
        validStatuses.has(existing.statusByUser?.[id]) ? existing.statusByUser[id] : "todo",
      ])
    );
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
    item.updatedBy = userId;
    item.updatedAt = nowIso();

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
    existing.priority = normalizePriority(payload.priority || existing.priority);
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
    item.updatedBy = userId;
    item.updatedAt = nowIso();
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
    existing.ownerId = ownerId;
    existing.participants = participants;
    existing.updatedBy = userId;
    existing.updatedAt = nowIso();

    if (!existing.title) {
      throw new Error("deadline title is required");
    }

    return publicDeadlineItem(existing, profileIds);
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
    const mode = validCaptureModes.has(payload.mode) ? payload.mode : "analysis";
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
      notes: sanitizeText(payload.notes ?? current.notes, 1200),
      updatedAt: nowIso(),
    };
    store.personalPages = store.personalPages || {};
    store.personalPages[userId] = next;
    return publicPersonalPage(next, profile);
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
  toggleScheduleItem,
  toggleTodoItem,
  updatePersonalPage,
  updateDiaryDay,
  upsertCheckinItem,
  upsertDeadlineItem,
  upsertScheduleItem,
  upsertTodoItem,
  verifyLogin,
};
