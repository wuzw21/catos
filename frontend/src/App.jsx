import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const itemTypeLabels = {
  thing: "事情",
  work: "工作",
  date: "约会",
  purchase: "购买",
  reminder: "提醒",
  checkin: "打卡",
  habit: "习惯",
};

const itemTypeOptions = Object.entries(itemTypeLabels);
const memoryLaneLabels = {
  profile: "资料",
  taste: "偏好",
  wish: "想要",
  promise: "承诺",
  time: "纪念",
  care: "照顾",
};
const memoryLaneOrder = ["profile", "taste", "wish", "promise", "time", "care"];
const legacyPages = new Set(["capture", "todos", "schedule", "timeline"]);
const defaultLifeCardTitle = "今天有没有开开心心？";
const segmentLabels = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  evening: "晚上",
  allDay: "全天",
};
const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];

function today() {
  return formatDate(new Date());
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(value, offset) {
  const date = parseDate(value) || new Date();
  date.setDate(date.getDate() + offset);
  return formatDate(date);
}

function addMonths(value, offset) {
  const date = parseDate(value) || new Date();
  const original = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(original, last));
  return formatDate(date);
}

function monthLabel(value) {
  return (value || today()).slice(0, 7);
}

function getCalendarDays(value) {
  const selected = parseDate(value) || new Date();
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const pads = Array.from({ length: offset }, (_, index) => ({ id: `pad-${index}`, isPad: true }));
  const days = Array.from({ length: last.getDate() }, (_, index) => {
    const date = new Date(first);
    date.setDate(index + 1);
    const id = formatDate(date);
    return {
      id,
      dayNumber: index + 1,
      isToday: id === today(),
    };
  });
  return [...pads, ...days];
}

function routeFromHash() {
  const raw = window.location.hash.replace(/^#/, "") || "dashboard";
  if (legacyPages.has(raw)) return "dashboard";
  return ["dashboard", "month", "daily-summary", "goals", "settings"].includes(raw) ? raw : "dashboard";
}

function shortDate(value) {
  return value ? value.slice(5).replace("-", "/") : "";
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function iconPath(name) {
  const icons = {
    check: <path d="M20 7 10 17l-4-4" />,
    undo: (
      <>
        <path d="M8 8H4v4" />
        <path d="M4 12a8 8 0 1 0 2.2-5.4" />
      </>
    ),
    edit: (
      <>
        <path d="M5 19h4" />
        <path d="m13.5 5.5 5 5L8 21H3v-5Z" />
      </>
    ),
    trash: (
      <>
        <path d="M5 7h14" />
        <path d="M9 7V5h6v2" />
        <path d="M8 7.5V19h8V7.5" />
      </>
    ),
    sparkle: (
      <>
        <path d="M12 3.5l1.6 4.4L18 9.5l-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6Z" />
        <path d="M18 13l.9 2.6L21.5 16l-2.6.9L18 19.5l-.9-2.6L14.5 16l2.6-.4Z" />
      </>
    ),
    bookmark: <path d="M7 5h10v14l-5-3-5 3Z" />,
    calendar: (
      <>
        <rect x="4" y="6" width="16" height="14" rx="3" />
        <path d="M8 4v4M16 4v4M4 10h16" />
      </>
    ),
    chevronLeft: <path d="m14 6-6 6 6 6" />,
    chevronRight: <path d="m10 6 6 6-6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    rows: (
      <>
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
      </>
    ),
    cards: (
      <>
        <rect x="5" y="5" width="6" height="6" rx="1.5" />
        <rect x="13" y="5" width="6" height="6" rx="1.5" />
        <rect x="5" y="13" width="6" height="6" rx="1.5" />
        <rect x="13" y="13" width="6" height="6" rx="1.5" />
      </>
    ),
    focus: (
      <>
        <path d="M12 4v3" />
        <path d="M12 17v3" />
        <path d="M4 12h3" />
        <path d="M17 12h3" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.8 19a5.2 5.2 0 0 1 10.4 0" />
        <path d="M15.5 6.5a3 3 0 0 1 0 5.8" />
        <path d="M15.5 14a5 5 0 0 1 4.7 5" />
      </>
    ),
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M9 11h6" />
        <path d="m12 15 3-3M12 15l-3-3" />
      </>
    ),
    star: <path d="m12 4 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8Z" />,
    circle: <circle cx="12" cy="12" r="7" />,
    image: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="m7 15 3-3 3 3 2-2 2 2" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
        <path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.6 6.6 8 8M16 16l1.4 1.4M17.4 6.6 16 8M8 16l-1.4 1.4" />
      </>
    ),
    refresh: (
      <>
        <path d="M18.5 7.5A8 8 0 0 0 6.7 6.7" />
        <path d="M5.5 6.5v4h4" />
        <path d="M5.5 16.5A8 8 0 0 0 17.3 17.3" />
        <path d="M18.5 17.5v-4h-4" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" />
        <path d="M14 9l4 3-4 3" />
        <path d="M18 12H10" />
      </>
    ),
    x: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    camera: (
      <>
        <path d="M5 8h4l2-2h2l2 2h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="13" r="3" />
      </>
    ),
  };
  return icons[name] || icons.check;
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPath(name)}
    </svg>
  );
}

function IconButton({ icon, label, active, danger, primary, type = "button", onClick, disabled, className = "" }) {
  return (
    <button
      className={cx("icon-button", active && "is-active", primary && "is-primary", danger && "is-danger", className)}
      type={type}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}

function CatAvatar({ profile, className = "", image = true }) {
  if (!profile) return <span className={cx("cat-avatar", className)} aria-hidden="true" />;
  const style = {
    "--person": profile.color || "#ff6fa8",
    "--avatar": avatarColor(profile),
  };
  if (profile.avatarUrl && image) {
    return (
      <span className={cx("cat-avatar has-image", className)} style={style}>
        <img src={profile.avatarUrl} alt={profile.displayName || "头像"} />
      </span>
    );
  }
  return (
    <span className={cx("cat-avatar", `avatar-${profile.avatar || "pink-cat"}`, className)} style={style} aria-hidden="true">
      <span className="cat-face" />
    </span>
  );
}

function avatarColor(profile) {
  const colors = {
    "pink-cat": "#ff6fa8",
    "violet-cat": "#8c7cff",
    "mint-cat": "#25b99c",
    "yellow-cat": "#e3ac34",
  };
  return colors[profile?.avatar] || profile?.color || "#ff6fa8";
}

function AvatarPair({ profiles, ids, className = "" }) {
  const selected = ids?.length
    ? ids.map((id) => profiles.find((profile) => profile.id === id)).filter(Boolean)
    : profiles.slice(0, 2);
  return (
    <span className={cx("avatar-pair", selected.length > 1 && "is-pair", className)} aria-hidden="true">
      {selected.slice(0, 2).map((profile) => (
        <CatAvatar key={profile.id} profile={profile} />
      ))}
    </span>
  );
}

function ownerLabel(ownerId, currentUser) {
  if (ownerId === "shared") return "共同";
  return ownerId === currentUser?.id ? "我" : "对方";
}

function statusText(card) {
  const done = Number(card.completion?.done || 0);
  const total = Number(card.completion?.total || card.participants?.length || 0);
  if (!total) return "";
  if (done >= total) return "已完成";
  return `${done}/${total}`;
}

function summaryLine(card) {
  const time = primaryTimeLabel(card);
  const detail = cleanCardText(card.detail);
  if (!detail || detail === time || detail === card.repeatRule) return "";
  return detail;
}

function primaryTimeLabel(card) {
  const planned = formatCardPlannedLabel(card);
  return planned || card.timeLabel || card.repeatRule || segmentLabels[card.segment] || "全天";
}

function formatCardPlannedLabel(card) {
  const raw = String(card?.plannedAt || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  if (match[1] === card?.date) return `${match[2]}:${match[3]}`;
  return formatDateTimeShort(raw);
}

function formatDateTimeShort(value) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const date = match[1] === today() ? "今天" : shortDate(match[1]);
  return `${date} ${match[2]}:${match[3]}`;
}

function dateTimeLocalValue(value) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[1]}T${match[2]}:${match[3]}` : "";
}

function durationLabel(minutes) {
  const value = Number(minutes) || 0;
  if (!value) return "";
  if (value < 60) return `${value} 分钟`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function cardPlanParts(card) {
  const parts = [];
  if (card.rankReason && card.rankReason !== "后续") parts.push(card.rankReason);
  if (card.stepProgress?.total) parts.push(`${card.stepProgress.done}/${card.stepProgress.total}`);
  const duration = durationLabel(card.durationMin);
  if (duration) parts.push(duration);
  if (card.dueAt) parts.push(`${formatDateTimeShort(card.dueAt)} 截止`);
  return parts.slice(0, 4);
}

function dayProgressPercent(date) {
  if (date < today()) return 100;
  if (date > today()) return 0;
  const now = new Date();
  return Math.round(((now.getHours() * 60 + now.getMinutes()) / 1440) * 100);
}

function cleanCardText(value) {
  return String(value || "")
    .replace(/这是第[一1](?:条共享日程|张共享生活卡)，?可以直接改(?:掉)?。?/g, "")
    .trim();
}

function storyDisplayTitle(summary, date) {
  const title = cleanCardText(summary?.title || "");
  if (!title || /自动日总结|为什么值得记住/.test(title)) return date;
  return title;
}

function cleanStoryText(value) {
  const text = cleanCardText(value || "");
  if (!text || /还没有明确完成项|随手记还比较少|先补上|自动日总结/.test(text)) return "";
  return text;
}

function shortText(value, max = 52) {
  const text = cleanCardText(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function profileColor(profiles, id, fallback = "#ff6fa8") {
  return profiles.find((profile) => profile.id === id)?.color || fallback;
}

function isCompletedCard(card) {
  return Boolean(card?.archivedAt || card?.completion?.allDone || card?.completion?.currentUserDone);
}

function isDefaultPromptCard(card) {
  return cleanCardText(card?.title) === "今天有没有开开心心？" &&
    (!card?.itemType || card.itemType === "thing");
}

function makeDefaultLifeCard(date, currentUser) {
  const ownerId = currentUser?.id || "";
  return {
    id: `draft-life-card-${date}`,
    sourceType: "todo",
    sourceId: "",
    isDraft: true,
    itemType: "thing",
    itemTypeLabel: "事情",
    title: defaultLifeCardTitle,
    detail: "",
    date,
    segment: "allDay",
    timeLabel: "全天",
    ownerId,
    participants: ownerId ? [ownerId] : [],
    statusByUser: ownerId ? { [ownerId]: "todo" } : {},
    completion: {
      done: 0,
      total: ownerId ? 1 : 0,
      allDone: false,
      currentUserDone: false,
    },
    priority: "normal",
    bucket: date > today() ? "future" : "today",
    slot: "",
    sourceCaptureId: "",
    sourceCaptureSummary: "",
    repeatRule: "",
    plannedAt: "",
    dueAt: "",
    durationMin: 0,
    steps: [],
    timeBlocks: [],
    stepProgress: { done: 0, total: 0, percent: 0 },
    rankScore: 0,
    rankReason: "今天",
    rankLane: "today",
    archivedAt: "",
    archivedBy: "",
    createdBy: "system",
    updatedBy: "system",
    createdAt: "",
    updatedAt: "",
  };
}

function cardParticipantIds(card, profiles, currentUser) {
  const profileIds = new Set((profiles || []).map((profile) => profile.id));
  const participants = (Array.isArray(card?.participants) ? card.participants : []).filter((id) => profileIds.has(id));
  if (card?.ownerId === "shared") return participants.length ? participants : [...profileIds].slice(0, 2);
  if (participants.length > 1) return participants;
  return [card?.ownerId, participants[0], currentUser?.id].filter((id) => id && profileIds.has(id)).slice(0, 1);
}

function memoryOwnerIds(item, profiles, currentUser) {
  const profileIds = new Set((profiles || []).map((profile) => profile.id));
  if (item?.ownerId === "shared") return [...profileIds].slice(0, 2);
  return [item?.targetUserId, item?.ownerId, currentUser?.id].filter((id) => id && profileIds.has(id)).slice(0, 1);
}

function sourceLabel(source) {
  const labels = {
    capture: "随手记",
    insight: "后台分析",
    profile: "长期记忆",
    lifeCard: "猫猫的事",
    system: "系统",
  };
  return labels[source] || source || "";
}

function namesForIds(ids, profiles) {
  const byId = new Map((profiles || []).map((profile) => [profile.id, profile.displayName]));
  return (ids || []).map((id) => byId.get(id)).filter(Boolean).join("、");
}

function detailRows(rows) {
  return rows.filter((row) => row && row.value);
}

const detailBuilders = {
  lifeCard(card, context) {
    const { profiles, currentUser } = context;
    const itemType = card.itemType && itemTypeLabels[card.itemType] ? card.itemType : "thing";
    const participants = cardParticipantIds(card, profiles, currentUser);
    const title = cleanCardText(card.title || card.sourceCaptureSummary || "记录");
    const detail = summaryLine(card) || cleanCardText(card.detail || card.slot || "");
    const sourceSummary = cleanCardText(card.sourceCaptureSummary || "");
    const readOnly = card.readOnly || card.sourceType === "insight";
    return {
      type: "lifeCard",
      label: itemTypeLabels[itemType],
      title,
      body: detail,
      date: card.date,
      ownerIds: participants,
      chips: [
        { label: "时间", value: primaryTimeLabel(card) },
        { label: "归属", value: ownerLabel(card.ownerId, currentUser) },
        { label: "状态", value: statusText(card) || card.statusLabel },
      ].filter((item) => item.value),
      rows: detailRows([
        card.plannedAt ? { label: "开始", value: formatDateTimeShort(card.plannedAt) } : null,
        card.dueAt ? { label: "截止", value: formatDateTimeShort(card.dueAt) } : null,
        card.durationMin ? { label: "预计", value: durationLabel(card.durationMin) } : null,
        card.stepProgress?.total ? { label: "步骤", value: `${card.stepProgress.done}/${card.stepProgress.total}` } : null,
        card.repeatRule ? { label: "周期", value: card.repeatRule } : null,
        sourceSummary ? { label: "来源", value: sourceSummary, wide: true } : null,
        card.priority === "high" ? { label: "优先级", value: "重要" } : null,
        card.steps?.length ? { label: "拆解", value: card.steps.map((step) => step.title).join(" / "), wide: true } : null,
      ]),
      images: [],
      actions: [
        !readOnly ? { type: "edit-card", icon: "edit", label: "编辑", card } : null,
        card.date ? { type: "go-date", icon: "calendar", label: "打开日期", date: card.date, page: "month" } : null,
      ].filter(Boolean),
    };
  },
  memoryItem(item, context) {
    const { profiles, currentUser } = context;
    const ownerIds = memoryOwnerIds(item, profiles, currentUser);
    const lane = memoryLaneLabels[item.group] || item.kindLabel || "记忆";
    return {
      type: "memoryItem",
      label: item.kindLabel || lane,
      title: cleanCardText(item.title || lane),
      body: cleanCardText(item.detail || ""),
      date: item.suggestedDate || String(item.updatedAt || "").slice(0, 10),
      ownerIds,
      chips: [
        { label: "分组", value: lane },
        { label: "对象", value: namesForIds(ownerIds, profiles) },
        { label: "来源", value: sourceLabel(item.source) },
      ].filter((part) => part.value),
      rows: detailRows([
        item.actionable ? { label: "可行动", value: itemTypeLabels[item.itemType] || "提醒" } : null,
        item.suggestedDate ? { label: "建议日期", value: item.suggestedDate } : null,
      ]),
      images: [],
      actions: [
        item.suggestedDate ? { type: "go-date", icon: "calendar", label: "打开日期", date: item.suggestedDate, page: "month" } : null,
        { type: "go-page", icon: "bookmark", label: "长期记忆", page: "goals" },
      ].filter(Boolean),
    };
  },
  capture(capture, context) {
    const ownerIds = [capture.createdBy].filter(Boolean);
    const text = cleanCardText(capture.text || "");
    return {
      type: "capture",
      label: capture.rawKind === "raw" ? "Raw" : "随手记",
      title: shortText(text || "随手记", 42),
      body: text,
      date: capture.date,
      ownerIds,
      chips: [
        { label: "格式", value: capture.rawFormat || "markdown" },
        { label: "照片", value: capture.assets?.length ? `${capture.assets.length}` : "" },
        { label: "位置", value: capture.location },
      ].filter((part) => part.value),
      rows: detailRows([
        { label: "保存时间", value: capture.createdAt ? String(capture.createdAt).replace("T", " ").slice(0, 16) : "" },
      ]),
      images: capture.assets || [],
      actions: [
        capture.date ? { type: "go-date", icon: "calendar", label: "打开日期", date: capture.date, page: "month" } : null,
      ].filter(Boolean),
    };
  },
  summaryItem(payload, context) {
    const { item, status = "日总结" } = payload || {};
    const ownerIds = item?.participants?.length ? item.participants : [item?.ownerId, item?.targetUserId].filter(Boolean);
    const title = cleanCardText(item?.title || item?.text || item?.kindLabel || status);
    const body = cleanStoryText(item?.detail || item?.sourceText || item?.text || "");
    return {
      type: "summaryItem",
      label: item?.kindLabel || item?.kind || status,
      title: title || status,
      body,
      date: item?.date || context.selectedDate,
      ownerIds,
      chips: [
        item?.doneUsers?.length ? { label: "完成", value: namesForIds(item.doneUsers, context.profiles) } : null,
        item?.pendingUsers?.length ? { label: "待推进", value: namesForIds(item.pendingUsers, context.profiles) } : null,
        item?.location ? { label: "位置", value: item.location } : null,
      ].filter((part) => part && part.value),
      rows: detailRows([
        item?.sourceCaptureId ? { label: "来源", value: "随手记" } : null,
        item?.photoCount ? { label: "照片", value: `${item.photoCount}` } : null,
      ]),
      images: item?.assets || [],
      actions: [
        { type: "go-page", icon: "refresh", label: "日总结", page: "daily-summary" },
      ],
    };
  },
  daySummary(summary, context) {
    return {
      type: "daySummary",
      label: "日总结",
      title: storyDisplayTitle(summary, context.selectedDate),
      body: cleanStoryText(summary?.narrative || ""),
      date: context.selectedDate,
      ownerIds: context.profiles.map((profile) => profile.id).slice(0, 2),
      chips: [
        { label: "完成", value: summary?.stats ? `${summary.stats.done || 0}/${summary.stats.total || 0}` : "" },
        { label: "地点", value: summary?.locations?.slice(0, 2).join("、") },
        { label: "照片", value: summary?.photos?.length ? `${summary.photos.length}` : "" },
      ].filter((part) => part.value),
      rows: detailRows([
        cleanStoryText(summary?.nextStep) ? { label: "下一步", value: cleanStoryText(summary.nextStep), wide: true } : null,
        cleanStoryText(summary?.qualityNote) ? { label: "状态", value: cleanStoryText(summary.qualityNote), wide: true } : null,
      ]),
      images: summary?.photos || [],
      actions: [
        { type: "go-page", icon: "refresh", label: "日总结", page: "daily-summary" },
      ],
    };
  },
};

function buildDetail(type, payload, context = {}) {
  const builder = detailBuilders[type];
  return builder ? builder(payload, context) : null;
}

function lifeCardRow(card, context) {
  const detail = buildDetail("lifeCard", card, context);
  return {
    id: card.id,
    type: "lifeCard",
    payload: card,
    title: detail?.title || card.title,
    subtitle: [detail?.label, primaryTimeLabel(card)].filter(Boolean).join(" · "),
    ownerIds: detail?.ownerIds || [],
    detail,
  };
}

function memoryRow(item, context) {
  const detail = buildDetail("memoryItem", item, context);
  return {
    id: item.id,
    type: "memoryItem",
    payload: item,
    title: detail?.title || item.title,
    subtitle: [detail?.label, item.suggestedDate].filter(Boolean).join(" · "),
    ownerIds: detail?.ownerIds || [],
    detail,
  };
}

function captureRow(capture, context) {
  const detail = buildDetail("capture", capture, context);
  return {
    id: capture.id || `${capture.date}-${capture.createdAt}`,
    type: "capture",
    payload: capture,
    title: detail?.title || shortText(capture.text),
    subtitle: [detail?.label, capture.assets?.length ? `${capture.assets.length} 张` : ""].filter(Boolean).join(" · "),
    ownerIds: detail?.ownerIds || [],
    detail,
  };
}

function summaryRow(item, status, context) {
  const detail = buildDetail("summaryItem", { item, status }, context);
  return {
    id: item.id || item.title || item.text,
    type: "summaryItem",
    payload: { item, status },
    title: detail?.title || item.title || item.text,
    subtitle: detail?.label || status,
    ownerIds: detail?.ownerIds || [],
    detail,
  };
}

function sortCards(cards) {
  const segmentWeight = { morning: 0, noon: 1, afternoon: 2, evening: 3, allDay: 4 };
  const rank = (card) => {
    if (card.archivedAt) return 5;
    if (card.completion?.allDone) return 4;
    if (card.priority === "high") return 0;
    if (card.sourceType === "insight") return 1;
    if (card.priority === "low") return 3;
    return 2;
  };
  return [...cards].sort((a, b) =>
    (Number(b.rankScore || 0) - Number(a.rankScore || 0)) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    rank(a) - rank(b) ||
    (segmentWeight[a.segment] ?? 5) - (segmentWeight[b.segment] ?? 5) ||
    String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  );
}

function groupByDate(cards) {
  return cards.reduce((groups, card) => {
    const key = card.date || today();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
    return groups;
  }, new Map());
}

function useHashRoute() {
  const [page, setPage] = useState(routeFromHash);
  useEffect(() => {
    const onHash = () => setPage(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [page, setPage];
}

export function App() {
  const [page, setPage] = useHashRoute();
  const [selectedDate, setSelectedDate] = useState(today());
  const [bootstrap, setBootstrap] = useState(null);
  const [data, setData] = useState(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [filter, setFilter] = useState("open");
  const [expanded, setExpanded] = useState(() => new Set());
  const [editingCard, setEditingCard] = useState(null);
  const [detailRequest, setDetailRequest] = useState(null);
  const composingRef = useRef(false);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setData(null);
      setError(result.error || "需要先登录。");
      return null;
    }
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "request failed");
    }
    return result;
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const result = await request(`/api/couple/session?date=${encodeURIComponent(selectedDate)}`);
      if (!result) return;
      if (result.authenticated) {
        setData(result.state);
      } else {
        setBootstrap({ space: result.space, profiles: result.profiles || [] });
        setLogin((current) => current || result.profiles?.[0]?.login || "");
      }
    } catch (err) {
      setError(err.message);
    }
  }, [request, selectedDate]);

  const refreshState = useCallback(async (date = selectedDate) => {
    if (!data) return;
    const result = await request(`/api/couple/state?date=${encodeURIComponent(date)}`);
    if (!result) return;
    setData(result.state);
    setSelectedDate(result.state.selectedDate || date);
  }, [data, request, selectedDate]);

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!data) return undefined;
    const timer = window.setInterval(() => {
      if (!composingRef.current) refreshState(selectedDate).catch(() => {});
    }, 12000);
    return () => window.clearInterval(timer);
  }, [data, refreshState, selectedDate]);

  const profiles = data?.profiles || bootstrap?.profiles || [];
  const currentUser = data?.currentUser || null;
  const detailContext = useMemo(() => ({ profiles, currentUser, selectedDate }), [profiles, currentUser, selectedDate]);
  const activeDetail = useMemo(() => {
    if (!detailRequest) return null;
    return buildDetail(detailRequest.type, detailRequest.payload, detailContext);
  }, [detailRequest, detailContext]);

  function navigate(nextPage) {
    setPage(nextPage);
    window.location.hash = nextPage;
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/couple/login", {
        method: "POST",
        body: { login, password, date: selectedDate },
      });
      if (result) {
        setData(result.state);
        setPassword("");
      }
    } catch (err) {
      setError(err.message === "invalid login or password" ? "访问码不对。" : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await request("/api/couple/logout", { method: "POST", body: {} });
    setData(null);
    setConfirmation(null);
    loadSession();
  }

  async function chooseDate(date) {
    if (!date) return;
    setSelectedDate(date);
    setExpanded(new Set());
    if (data) {
      const result = await request(`/api/couple/state?date=${encodeURIComponent(date)}`);
      if (result) setData(result.state);
    }
  }

  function openDetail(type, payload) {
    setDetailRequest({ type, payload });
  }

  async function handleDetailAction(action) {
    if (!action) return;
    if (action.type === "edit-card" && action.card) {
      setDetailRequest(null);
      setEditingCard(action.card);
      return;
    }
    if (action.type === "go-date" && action.date) {
      await chooseDate(action.date);
      if (action.page) navigate(action.page);
      setDetailRequest(null);
      return;
    }
    if (action.type === "go-page" && action.page) {
      navigate(action.page);
      setDetailRequest(null);
    }
  }

  async function saveRawCapture(mode, assets = []) {
    const text = composerText.trim();
    if (!text) return;
    setBusy(true);
    try {
      const captureResult = await request("/api/couple/capture", {
        method: "POST",
        body: {
          date: selectedDate,
          text,
          mode: "save",
          visibility: "shared",
          assets,
          rawKind: "raw",
          rawFormat: assets.length ? "markdown+photo" : "markdown",
          analysisIntent: mode === "agent" ? "agent" : mode === "template" ? "template" : "",
        },
      });
      if (!captureResult) return;
      setData(captureResult.state);
      if (mode === "agent" || mode === "template") {
        const analyzed = await request("/api/couple/capture/analyze", {
          method: "POST",
          body: {
            captureId: captureResult.capture.id,
            text,
            date: selectedDate,
            ownerId: currentUser?.id || "",
            analysisMode: mode,
          },
        });
        setConfirmation(analyzed?.confirmation || null);
      } else {
        setConfirmation(null);
      }
      setComposerText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitConfirmation(event) {
    event.preventDefault();
    if (!confirmation) return;
    if (confirmation.decision !== "schedule") {
      setConfirmation(null);
      return;
    }
    setBusy(true);
    try {
      const result = await request("/api/couple/life-cards/from-confirmation", {
        method: "POST",
        body: {
          ...confirmation,
          ownerId: confirmation.ownerId || currentUser?.id || "",
          sourceCaptureId: confirmation.sourceCaptureId || confirmation.captureId,
        },
      });
      if (result) {
        setData(result.state);
        setSelectedDate(confirmation.date || selectedDate);
        setFilter("open");
        setConfirmation(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCard(card) {
    if (!currentUser || card.readOnly || card.sourceType === "insight") return;
    const wasCompleted = isCompletedCard(card);
    const endpoint = {
      schedule: "/api/couple/schedule/toggle",
      todo: "/api/couple/todos/toggle",
      checkin: "/api/couple/checkins/toggle",
      deadline: "/api/couple/deadlines/toggle",
    }[card.sourceType];
    if (!endpoint) return;
    const result = await request(endpoint, {
      method: "POST",
      body: { id: card.sourceId, targetUserId: currentUser.id, date: card.date, status: wasCompleted ? "todo" : "done" },
    });
    if (result) {
      setData(result.state);
      if (wasCompleted) setFilter("open");
    }
  }

  async function archiveCard(card) {
    if (!card || card.readOnly || card.sourceType === "insight" || card.isDraft) return;
    const endpoint = {
      schedule: "/api/couple/schedule/archive",
      todo: "/api/couple/todos/archive",
    }[card.sourceType];
    if (!endpoint) return;
    const result = await request(endpoint, {
      method: "POST",
      body: { id: card.sourceId, date: card.date },
    });
    if (result) setData(result.state);
  }

  async function deleteCard(card) {
    if (!card || card.readOnly || card.sourceType === "insight") return;
    if (card.isDraft) {
      setEditingCard(null);
      return;
    }
    const endpoint = {
      schedule: "/api/couple/schedule/delete",
      todo: "/api/couple/todos/delete",
      checkin: "/api/couple/checkins/delete",
      deadline: "/api/couple/deadlines/delete",
    }[card.sourceType];
    if (!endpoint) return;
    const result = await request(endpoint, {
      method: "POST",
      body: { id: card.sourceId, date: card.date },
    });
    if (result) {
      setData(result.state);
      setEditingCard(null);
    }
  }

  async function saveCardEdit(payload) {
    const card = editingCard;
    if (!card) return;
    const endpoint = {
      schedule: "/api/couple/schedule/upsert",
      todo: "/api/couple/todos/upsert",
      checkin: "/api/couple/checkins/upsert",
      deadline: "/api/couple/deadlines/upsert",
    }[card.sourceType];
    if (!endpoint) return;
    const ownerId = card.sourceType === "checkin" ? "shared" : payload.ownerId;
    const body = {
      id: card.sourceId,
      date: payload.date,
      title: payload.title,
      detail: payload.detail,
      slot: payload.detail,
      itemType: payload.itemType,
      segment: payload.segment || card.segment || "allDay",
      ownerId,
      participants: ownerId === "shared" ? profiles.map((profile) => profile.id) : [ownerId],
      sourceCaptureId: card.sourceCaptureId || "",
      repeatRule: payload.repeatRule || "",
      plannedAt: payload.plannedAt || "",
      dueAt: payload.dueAt || "",
      durationMin: payload.durationMin || 0,
      steps: payload.steps || card.steps || [],
      timeBlocks: payload.timeBlocks || card.timeBlocks || [],
      bucket: card.isDraft ? (payload.date > today() ? "future" : "today") : (card.bucket || (payload.date > selectedDate ? "future" : "today")),
      priority: card.priority || "normal",
    };
    const result = await request(endpoint, { method: "POST", body });
    if (result) {
      setData(result.state);
      setEditingCard(null);
    }
  }

  if (!data) {
    return (
      <LoginScreen
        bootstrap={bootstrap}
        profiles={profiles}
        login={login}
        setLogin={setLogin}
        password={password}
        setPassword={setPassword}
        error={error}
        busy={busy}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopNav page={page} navigate={navigate} profiles={profiles} currentUser={currentUser} logout={logout} />
      <main className="workspace">
        {page === "dashboard" && (
          <Dashboard
            data={data}
            profiles={profiles}
            currentUser={currentUser}
            selectedDate={selectedDate}
            chooseDate={chooseDate}
            composerText={composerText}
            setComposerText={setComposerText}
            confirmation={confirmation}
            submitConfirmation={submitConfirmation}
            dismissConfirmation={() => setConfirmation(null)}
            saveRawCapture={saveRawCapture}
            busy={busy}
            error={error}
            filter={filter}
            setFilter={setFilter}
            expanded={expanded}
            setExpanded={setExpanded}
            toggleCard={toggleCard}
            archiveCard={archiveCard}
            setEditingCard={setEditingCard}
            openDetail={openDetail}
            composingRef={composingRef}
          />
        )}
        {page === "month" && (
          <MonthPage
            data={data}
            profiles={profiles}
            currentUser={currentUser}
            selectedDate={selectedDate}
            chooseDate={chooseDate}
            setPage={navigate}
            toggleCard={toggleCard}
            archiveCard={archiveCard}
            setEditingCard={setEditingCard}
            openDetail={openDetail}
          />
        )}
        {page === "daily-summary" && (
          <DailySummaryPage data={data} profiles={profiles} currentUser={currentUser} request={request} setData={setData} selectedDate={selectedDate} openDetail={openDetail} />
        )}
        {page === "goals" && (
          <MemoryPage data={data} profiles={profiles} currentUser={currentUser} request={request} setData={setData} selectedDate={selectedDate} openDetail={openDetail} />
        )}
        {page === "settings" && (
          <SettingsPage data={data} currentUser={currentUser} profiles={profiles} request={request} setData={setData} selectedDate={selectedDate} />
        )}
      </main>
      {editingCard && (
        <CardEditor
          card={editingCard}
          profiles={profiles}
          onClose={() => setEditingCard(null)}
          onSave={saveCardEdit}
          onDelete={() => deleteCard(editingCard)}
        />
      )}
      {activeDetail ? (
        <DetailDrawer
          detail={activeDetail}
          profiles={profiles}
          onClose={() => setDetailRequest(null)}
          onAction={handleDetailAction}
        />
      ) : null}
    </div>
  );
}

function LoginScreen({ bootstrap, profiles, login, setLogin, password, setPassword, error, busy, onSubmit }) {
  const title = bootstrap?.space?.name && !/首页|日程/.test(bootstrap.space.name) ? bootstrap.space.name : "猫猫日记本";
  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="login-cats">
          <AvatarPair profiles={profiles} className="hero-pair" />
        </div>
        <p className="kicker">PEOS</p>
        <h1>{title}</h1>
      </section>
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="profile-choice">
          {profiles.map((profile) => (
            <button
              className={cx("profile-option", login === profile.login && "is-active")}
              key={profile.id}
              type="button"
              onClick={() => setLogin(profile.login)}
              style={{ "--person": profile.color }}
            >
              <CatAvatar profile={profile} />
              <span>{profile.displayName}</span>
            </button>
          ))}
        </div>
        <label className="quiet-field">
          <span>访问码</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoFocus autoComplete="current-password" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <IconButton icon="chevronRight" label="进入首页" type="submit" primary disabled={busy || !password} className="login-submit" />
      </form>
    </main>
  );
}

function TopNav({ page, navigate, profiles, currentUser, logout }) {
  const items = [
    ["dashboard", "猫猫日记本"],
    ["month", "月历"],
    ["daily-summary", "日总结"],
    ["goals", "长期记忆"],
    ["settings", "设置"],
  ];
  return (
    <header className="topbar">
      <button className="brand-mark" type="button" onClick={() => navigate("dashboard")}>
        <AvatarPair profiles={profiles} className="brand-cats" />
        <span>猫猫日记本</span>
      </button>
      <nav className="nav-tabs" aria-label="主导航">
        {items.map(([id, label]) => (
          <button key={id} className={cx(page === id && "is-active")} type="button" onClick={() => navigate(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="session-chip">
        <CatAvatar profile={currentUser} />
        <strong>{currentUser?.displayName || "成员"}</strong>
        <IconButton icon="logout" label="退出" onClick={logout} />
      </div>
    </header>
  );
}

function Dashboard(props) {
  const {
    data,
    profiles,
    currentUser,
    selectedDate,
    chooseDate,
    composerText,
    setComposerText,
    confirmation,
    submitConfirmation,
    dismissConfirmation,
    saveRawCapture,
    busy,
    error,
    filter,
    setFilter,
    expanded,
    setExpanded,
    toggleCard,
    archiveCard,
    setEditingCard,
    openDetail,
    composingRef,
  } = props;

  return (
    <section className="dashboard">
      <DateRail selectedDate={selectedDate} chooseDate={chooseDate} />
      <Composer
        text={composerText}
        setText={setComposerText}
        saveRawCapture={saveRawCapture}
        busy={busy}
        confirmation={confirmation}
        submitConfirmation={submitConfirmation}
        dismissConfirmation={dismissConfirmation}
        composingRef={composingRef}
      />
      {error ? <p className="form-error inline">{error}</p> : null}
      <LifeCardTimeline
        cards={data.scheduleItemCards || []}
        profiles={profiles}
        currentUser={currentUser}
        selectedDate={selectedDate}
        filter={filter}
        setFilter={setFilter}
        expanded={expanded}
        setExpanded={setExpanded}
        toggleCard={toggleCard}
        archiveCard={archiveCard}
        setEditingCard={setEditingCard}
        openDetail={openDetail}
        chooseDate={chooseDate}
      />
    </section>
  );
}

function DateRail({ selectedDate, chooseDate }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(selectedDate);
  useEffect(() => {
    setCursor(selectedDate);
  }, [selectedDate]);
  const days = useMemo(() => getCalendarDays(cursor), [cursor]);

  async function selectDate(date) {
    setOpen(false);
    await chooseDate(date);
  }

  return (
    <div className="date-rail">
      <IconButton icon="chevronLeft" label="上一天" onClick={() => chooseDate(addDays(selectedDate, -1))} />
      <button className={cx("date-pill", open && "is-open")} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="选择日期">
        <Icon name="calendar" />
        <span>
          <strong>{selectedDate === today() ? "今天" : shortDate(selectedDate)}</strong>
          <em>{selectedDate}</em>
        </span>
      </button>
      <IconButton icon="chevronRight" label="下一天" onClick={() => chooseDate(addDays(selectedDate, 1))} />
      {open ? (
        <div className="date-popover">
          <div className="date-popover-head">
            <IconButton icon="chevronLeft" label="上个月" onClick={() => setCursor(addMonths(cursor, -1))} />
            <strong>{monthLabel(cursor)}</strong>
            <IconButton icon="chevronRight" label="下个月" onClick={() => setCursor(addMonths(cursor, 1))} />
          </div>
          <div className="mini-month-grid">
            {weekLabels.map((label) => <span key={label}>{label}</span>)}
            {days.map((day) => day.isPad ? (
              <i key={day.id} aria-hidden="true" />
            ) : (
              <button
                key={day.id}
                className={cx(day.id === selectedDate && "is-active", day.isToday && "is-today")}
                type="button"
                onClick={() => selectDate(day.id)}
              >
                {day.dayNumber}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Composer({ text, setText, saveRawCapture, busy, confirmation, submitConfirmation, dismissConfirmation, composingRef }) {
  async function submit(mode) {
    await saveRawCapture(mode, []);
  }

  return (
    <section className="composer-band">
      <form className="composer" onSubmit={(event) => event.preventDefault()}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => {
            composingRef.current = true;
          }}
          onBlur={() => {
            window.setTimeout(() => {
              composingRef.current = false;
            }, 120);
          }}
          rows={1}
          aria-label="随手记"
          placeholder="写一句"
        />
        <div className="composer-actions">
          <IconButton icon="bookmark" label="随手记" disabled={busy || !text.trim()} onClick={() => submit("save")} />
          <IconButton icon="sparkle" label="交给 Agent" primary disabled={busy || !text.trim()} onClick={() => submit("agent")} />
        </div>
      </form>
      {confirmation ? (
        <form className="confirm-strip" onSubmit={submitConfirmation}>
          <div>
            <strong>
              {confirmation.analysisMode === "agent" ? "Agent" : "猫猫的事"}
              {" · "}
              {confirmation.isDefaultDraft ? "草稿" : confirmation.decision === "schedule" ? (itemTypeLabels[confirmation.itemType] || "事情") : confirmation.decision === "memory" ? "长期记忆" : "只记录"}
              {confirmation.date ? ` · ${confirmation.date}` : ""}
              {confirmation.segment && confirmation.segment !== "allDay" ? ` · ${segmentLabels[confirmation.segment]}` : ""}
              {confirmation.relatedItems?.length ? ` · +${confirmation.relatedItems.length}` : ""}
            </strong>
            {confirmation.title ? <span>{confirmation.title}</span> : null}
          </div>
          <div className="confirm-actions">
            <IconButton icon="check" label="确认" type="submit" primary />
            <IconButton icon="x" label="取消" onClick={dismissConfirmation} />
          </div>
        </form>
      ) : null}
    </section>
  );
}

function MonthPicker({ data, selectedDate, chooseDate, open, setOpen, setPage }) {
  const summary = data.monthSummary || { month: selectedDate.slice(0, 7), days: [] };
  const memoryCountByDate = useMemo(() => {
    return (data.memoryItems || []).reduce((counts, item) => {
      const date = item.suggestedDate || String(item.updatedAt || "").slice(0, 10);
      if (!date) return counts;
      counts[date] = (counts[date] || 0) + 1;
      return counts;
    }, {});
  }, [data.memoryItems]);
  const gridDays = useMemo(() => {
    const days = summary.days || [];
    const first = parseDate(days[0]?.id || selectedDate);
    const offset = first ? (first.getDay() + 6) % 7 : 0;
    return [...Array.from({ length: offset }, (_, index) => ({ id: `pad-${index}`, isPad: true })), ...days];
  }, [summary.days, selectedDate]);
  async function openDay(day) {
    await chooseDate(day.id);
    if (day.summaryGenerated) setPage?.("daily-summary");
  }
  return (
    <section className={cx("month-picker", !open && "is-collapsed")}>
      <div className="month-head">
        <IconButton icon="chevronLeft" label="上个月" onClick={() => chooseDate(addMonths(selectedDate, -1))} />
        <strong>{summary.month}</strong>
        <IconButton icon="chevronRight" label="下个月" onClick={() => chooseDate(addMonths(selectedDate, 1))} />
        <IconButton icon={open ? "chevronUp" : "chevronDown"} label={open ? "收起月视图" : "展开月视图"} onClick={() => setOpen(!open)} />
      </div>
      {open ? (
        <div className="month-grid" aria-label="月视图">
          {weekLabels.map((label) => <span className="month-weekday" key={label}>{label}</span>)}
          {gridDays.map((day) => {
            if (day.isPad) return <span key={day.id} className="month-pad" aria-hidden="true" />;
            const cardCount = Number(day.eventCount || 0) + Number(day.todoCount || 0);
            const memoryCount = Number(memoryCountByDate[day.id] || 0);
            const storyTitle = day.summaryTitle || (day.id === selectedDate && data.dailySummary ? storyDisplayTitle(data.dailySummary, day.id) : "");
            return (
              <button
                key={day.id}
                className={cx("month-cell", day.id === selectedDate && "is-active", day.isToday && "is-today", day.summaryGenerated && "has-story", (cardCount || memoryCount || day.summaryGenerated) && "has-card")}
                type="button"
                onClick={() => openDay(day)}
                aria-label={day.summaryGenerated ? `${day.id}，打开日总结` : day.id}
              >
                <span className="month-cell-top">
                  <b>{day.dayNumber}</b>
                  <span className="month-dots">
                    {cardCount ? <i className="card-dot" title="猫猫的事">{cardCount}</i> : null}
                    {memoryCount ? <i className="memory-dot" title="长期记忆">{memoryCount}</i> : null}
                    {day.summaryGenerated ? <i className="story-dot" /> : null}
                  </span>
                </span>
                {storyTitle ? <em className="month-story-title">{storyTitle}</em> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function MonthPage({ data, profiles, currentUser, selectedDate, chooseDate, setPage, toggleCard, archiveCard, setEditingCard, openDetail }) {
  const monthSummary = data.monthSummary || { month: selectedDate.slice(0, 7), days: [], totalsByUser: {} };
  const selectedDay = monthSummary.days?.find((day) => day.id === selectedDate) || null;
  const context = useMemo(() => ({ profiles, currentUser, selectedDate }), [profiles, currentUser, selectedDate]);
  const memoryCountByDate = useMemo(() => {
    return (data.memoryItems || []).reduce((counts, item) => {
      const date = item.suggestedDate || String(item.updatedAt || "").slice(0, 10);
      if (!date) return counts;
      counts[date] = (counts[date] || 0) + 1;
      return counts;
    }, {});
  }, [data.memoryItems]);
  const monthStats = useMemo(() => {
    const days = monthSummary.days || [];
    return {
      activeDays: days.filter((day) => Number(day.eventCount || 0) + Number(day.todoCount || 0) + Number(memoryCountByDate[day.id] || 0) + (day.summaryGenerated ? 1 : 0)).length,
      cards: days.reduce((sum, day) => sum + Number(day.eventCount || 0) + Number(day.todoCount || 0), 0),
      memories: days.reduce((sum, day) => sum + Number(memoryCountByDate[day.id] || 0), 0),
      stories: days.filter((day) => day.summaryGenerated).length,
    };
  }, [memoryCountByDate, monthSummary.days]);
  const selectedCards = useMemo(() => {
    return sortCards((data.scheduleItemCards || [])
      .filter((card) => card.date === selectedDate)
      .filter((card) => !isCompletedCard(card)));
  }, [data.scheduleItemCards, selectedDate]);
  const completedCards = useMemo(() => {
    return sortCards((data.scheduleItemCards || [])
      .filter((card) => card.date === selectedDate)
      .filter(isCompletedCard));
  }, [data.scheduleItemCards, selectedDate]);
  const selectedMemories = useMemo(() => {
    return (data.memoryItems || []).filter((item) => {
      const date = item.suggestedDate || String(item.updatedAt || "").slice(0, 10);
      return date === selectedDate;
    }).slice(0, 6);
  }, [data.memoryItems, selectedDate]);
  const memoryRows = useMemo(() => selectedMemories.map((item) => memoryRow(item, context)), [selectedMemories, context]);
  const peopleStats = profiles.map((profile) => ({
    profile,
    percent: Number(monthSummary.totalsByUser?.[profile.id]?.percent || 0),
  }));
  const selectedSummaryTitle = selectedDay?.summaryTitle || (data.dailySummary?.date === selectedDate ? storyDisplayTitle(data.dailySummary, selectedDate) : "");
  const selectedPulseRows = useMemo(() => {
    const source = selectedDay?.dailyPulses?.length
      ? selectedDay.dailyPulses
      : profiles.map((profile) => ({
          userId: profile.id,
          displayName: profile.displayName,
          color: profile.color,
          ...(data.diaryDay?.userDays?.[profile.id] || {}),
        }));
    return source.filter((pulse) => pulse.happiestThing || pulse.smallAchievement || pulse.dailyScore);
  }, [data.diaryDay, profiles, selectedDay]);

  return (
    <section className="month-page">
      <div className="page-head">
        <div>
          <p className="kicker">Month</p>
          <h1>月历</h1>
        </div>
        <IconButton icon="rows" label="回首页" onClick={() => setPage("dashboard")} />
      </div>
      <div className="month-layout">
        <MonthPicker data={data} selectedDate={selectedDate} chooseDate={chooseDate} open={true} setOpen={() => {}} setPage={setPage} />
        <aside className="month-inspector">
          <div className="month-legend" aria-label="月历标识">
            <span><i className="card-dot" />猫猫的事</span>
            <span><i className="memory-dot" />长期记忆</span>
            <span><i className="story-dot" />日总结</span>
          </div>
          <div className="month-stats">
            <span><b>{monthStats.activeDays}</b><em>有内容</em></span>
            <span><b>{monthStats.cards}</b><em>猫猫的事</em></span>
            <span><b>{monthStats.memories}</b><em>记忆</em></span>
            <span><b>{monthStats.stories}</b><em>日总结</em></span>
          </div>
          <div className="month-people">
            {peopleStats.map(({ profile, percent }) => (
              <span key={profile.id} style={{ "--person": profile.color }}>
                <CatAvatar profile={profile} />
                <b>{percent}%</b>
              </span>
            ))}
          </div>
          <div className="selected-day-head">
            <div>
              <strong>{selectedDate === today() ? "今天" : shortDate(selectedDate)}</strong>
              <span>{selectedDate}</span>
              {selectedSummaryTitle ? <button type="button" onClick={() => setPage("daily-summary")}>{selectedSummaryTitle}</button> : null}
            </div>
            {selectedDay ? (
              <div className="selected-day-signals">
                <em><Icon name="calendar" />{Number(selectedDay.eventCount || 0) + Number(selectedDay.todoCount || 0)}</em>
                <em><Icon name="sparkle" />{selectedMemories.length}</em>
                <em><Icon name="refresh" />{selectedDay.summaryGenerated ? 1 : 0}</em>
              </div>
            ) : null}
          </div>
          {selectedPulseRows.length ? (
            <div className="month-pulse-panel">
              {selectedPulseRows.map((pulse) => {
                const profile = profiles.find((item) => item.id === pulse.userId) || pulse;
                return (
                  <article key={pulse.userId} style={{ "--person": profile.color || pulse.color }}>
                    <CatAvatar profile={profile} />
                    <div>
                      <strong>{profile.displayName || "成员"}</strong>
                      {pulse.happiestThing ? <span><b>最开心</b>{pulse.happiestThing}</span> : null}
                      {pulse.smallAchievement ? <span><b>核心贡献</b>{pulse.smallAchievement}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          <div className="month-day-cards">
            {selectedCards.length ? selectedCards.slice(0, 5).map((card) => (
                <LifeCard
                  key={card.id}
                  card={card}
                  profiles={profiles}
                  currentUser={currentUser}
                  toggleCard={toggleCard}
                  archiveCard={archiveCard}
                  setEditingCard={setEditingCard}
                  openDetail={openDetail}
                />
              )) : <EmptyState profiles={profiles} />}
            {completedCards.length ? (
              <div className="month-completed">
                <Icon name="archive" />
                <span>{completedCards.length}</span>
              </div>
            ) : null}
          </div>
          <DynamicList title="记忆" rows={memoryRows} profiles={profiles} onOpen={(row) => openDetail(row.type, row.payload)} />
        </aside>
      </div>
    </section>
  );
}

function LifeCardTimeline({ cards, profiles, currentUser, selectedDate, filter, setFilter, expanded, setExpanded, toggleCard, archiveCard, setEditingCard, openDetail, chooseDate }) {
  const [scrubOffset, setScrubOffset] = useState(0);
  const dragState = useRef({ active: false, kind: "", startY: 0, scrollTop: 0, moved: false, blockClick: false, pointerId: null, direction: 0 });
  const lifeCards = useMemo(() => (cards || []).filter((card) => !isDefaultPromptCard(card)), [cards]);
  const profileIds = useMemo(() => new Set(profiles.map((profile) => profile.id)), [profiles]);
  const isSharedCard = (card) => card.ownerId === "shared" || (card.participants || []).length > 1;
  const isCurrentUserCard = (card) => card.ownerId === currentUser?.id || card.participants?.includes(currentUser?.id);
  const isTwoPersonBoardCard = (card) => {
    if (card.sourceType === "insight") return false;
    if (isSharedCard(card)) return true;
    return profileIds.has(card.ownerId) || (card.participants || []).some((id) => profileIds.has(id));
  };
  const filteredCards = useMemo(() => {
    const filtered = lifeCards.filter((card) => {
      const completed = isCompletedCard(card);
      const open = !completed;
      if (filter === "done") return completed;
      if (filter === "mine") return open && isCurrentUserCard(card);
      if (filter === "shared") return open && isTwoPersonBoardCard(card);
      if (filter === "all") return true;
      return open;
    });
    return sortCards(filtered);
  }, [lifeCards, currentUser?.id, filter, profileIds]);

  const visibleCards = filteredCards;
  const grouped = groupByDate(visibleCards);
  const dates = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
  const summary = useMemo(() => {
    const dayCards = lifeCards.filter((card) => card.date === selectedDate);
    const openCards = dayCards.filter((card) => !isCompletedCard(card));
    const doneCards = dayCards.filter(isCompletedCard);
    return {
      openCount: openCards.length,
      doneCount: doneCards.length,
      mineCount: openCards.filter(isCurrentUserCard).length,
      boardCount: openCards.filter(isTwoPersonBoardCard).length,
    };
  }, [lifeCards, currentUser?.id, profileIds, selectedDate]);
  const filters = [
    ["open", "circle", "未完成"],
    ["mine", "user", "自己"],
    ["shared", "users", "双人"],
    ["done", "archive", "已完成"],
  ];
  const startDragScroll = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("input, textarea, select, a, summary, label")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const isAxisDrag = Math.abs(x - 132) <= 34 || Boolean(event.target.closest(".timeline-node"));
    const canScroll = event.currentTarget.scrollHeight > event.currentTarget.clientHeight + 2;
    dragState.current = {
      active: true,
      kind: isAxisDrag ? "date" : "scroll",
      startY: event.clientY,
      scrollTop: event.currentTarget.scrollTop,
      moved: false,
      blockClick: false,
      pointerId: event.pointerId,
      direction: 0,
    };
    if (!isAxisDrag && !canScroll) {
      dragState.current.active = false;
      return;
    }
    event.currentTarget.classList.add(isAxisDrag ? "is-scrubbing" : "is-dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const dragScroll = (event) => {
    const drag = dragState.current;
    if (!drag.active) return;
    const delta = event.clientY - drag.startY;
    if (Math.abs(delta) > 4) {
      drag.moved = true;
      drag.blockClick = true;
    }
    if (drag.kind === "date") {
      setScrubOffset(Math.max(-140, Math.min(140, delta)));
      drag.direction = Math.abs(delta) >= 34 ? (delta > 0 ? 1 : -1) : 0;
    } else {
      event.currentTarget.scrollTop = drag.scrollTop - delta;
    }
    if (drag.moved) event.preventDefault();
  };
  const endDragScroll = (event) => {
    const drag = dragState.current;
    if (!drag.active) return;
    event.currentTarget.classList.remove("is-dragging");
    event.currentTarget.classList.remove("is-scrubbing");
    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    setScrubOffset(0);
    if (drag.kind === "date" && drag.direction) {
      chooseDate?.(addDays(selectedDate, drag.direction));
    }
    dragState.current = { ...drag, active: false, kind: "", pointerId: null, direction: 0 };
  };
  const stopDragClick = (event) => {
    if (!dragState.current.blockClick) return;
    dragState.current.blockClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <section className="life-section">
      <div className="life-toolbar">
        <div className="life-summary">
          <AvatarPair profiles={profiles} />
          <span className="life-counts">
            <b>待做 {summary.openCount}</b>
            <i>完成 {summary.doneCount}</i>
          </span>
        </div>
        <div className="tool-groups">
          <div className="icon-segment" aria-label="筛选">
            {filters.map(([id, icon, label]) => (
              <button
                key={id}
                className={cx("filter-button", filter === id && "is-active")}
                type="button"
                onClick={() => setFilter(id)}
                aria-label={label}
                title={label}
              >
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className="timeline-list"
        style={{ "--day-progress": `${dayProgressPercent(selectedDate)}%`, "--scrub-offset": `${scrubOffset}px` }}
        onPointerDown={startDragScroll}
        onPointerMove={dragScroll}
        onPointerUp={endDragScroll}
        onPointerCancel={endDragScroll}
        onClickCapture={stopDragClick}
      >
        {dates.length ? dates.map((date) => {
          const dayCards = grouped.get(date) || [];
          const isExpanded = expanded.has(date);
          const visible = isExpanded ? dayCards : dayCards.filter((card, index) => index < 4 || card.priority === "high" || card.sourceType === "insight");
          const hiddenCount = dayCards.length - visible.length;
          const openCount = dayCards.filter((card) => !isCompletedCard(card)).length;
          const hasHigh = dayCards.some((card) => card.priority === "high" || Number(card.rankScore || 0) >= 60);
          return (
            <section key={date} className={cx("timeline-day", date === selectedDate && "is-selected", date === today() && "is-today", hasHigh && "has-high")}>
              <button className="timeline-node" type="button" onClick={() => chooseDate?.(date)} aria-label={date === today() ? `今天 ${date}` : date}>
                <span>{openCount || dayCards.length}</span>
              </button>
              <button className="day-label" type="button" onClick={() => chooseDate?.(date)}>
                <strong>{date === today() ? "今天" : shortDate(date)}</strong>
                <span>{date}</span>
              </button>
              <div className="day-cards">
                {visible.map((card) => (
                  <LifeCard
                    key={card.id}
                    card={card}
                    profiles={profiles}
                    currentUser={currentUser}
                    toggleCard={toggleCard}
                    archiveCard={archiveCard}
                    setEditingCard={setEditingCard}
                    openDetail={openDetail}
                  />
                ))}
                {hiddenCount > 0 ? (
                  <button
                    className="fold-row"
                    type="button"
                    onClick={() => {
                      const next = new Set(expanded);
                      next.add(date);
                      setExpanded(next);
                    }}
                  >
                    <span>{hiddenCount} 张已折叠</span>
                    <Icon name="chevronDown" />
                  </button>
                ) : isExpanded && dayCards.length > 4 ? (
                  <button
                    className="fold-row"
                    type="button"
                    onClick={() => {
                      const next = new Set(expanded);
                      next.delete(date);
                      setExpanded(next);
                    }}
                  >
                    <span>收起</span>
                    <Icon name="chevronUp" />
                  </button>
                ) : null}
              </div>
            </section>
          );
        }) : <EmptyState profiles={profiles} />}
      </div>
    </section>
  );
}

function LifeCard({ card, profiles, currentUser, toggleCard, archiveCard, setEditingCard, openDetail }) {
  if (isDefaultPromptCard(card)) return null;
  const itemType = card.itemType && itemTypeLabels[card.itemType] ? card.itemType : "thing";
  const participants = cardParticipantIds(card, profiles, currentUser);
  const title = card.title || card.sourceCaptureSummary || "记录";
  const status = statusText(card);
  const summary = summaryLine(card);
  const readOnly = card.readOnly || card.sourceType === "insight";
  const isDraft = Boolean(card.isDraft);
  const isDone = isCompletedCard(card);
  const timeNote = primaryTimeLabel(card);
  const summaryText = summary && summary !== timeNote ? summary : "";
  const planParts = cardPlanParts(card);
  const isInsight = card.sourceType === "insight";
  const ownerColor = card.ownerId === "shared" ? "#ff6fa8" : profileColor(profiles, card.ownerId, avatarColor(currentUser));
  const secondColor = participants.length > 1 ? profileColor(profiles, participants[1], "#24b99a") : ownerColor;
  const displayedStatus = isDone
    ? (card.archivedAt && !card.completion?.allDone ? "已归档" : card.completion?.allDone ? "已完成" : "我已完成")
    : status;
  const openCard = () => {
    if (!readOnly) {
      setEditingCard(card);
      return;
    }
    openDetail?.("lifeCard", card);
  };
  const stopAction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const completeCard = (event) => {
    stopAction(event);
    toggleCard(card);
  };
  return (
    <article
      className={cx("life-card", `type-${itemType}`, isDone && "is-done", readOnly && "is-readonly", isInsight && "is-insight", isDraft && "is-draft")}
      style={{ "--owner-one": ownerColor, "--owner-two": secondColor }}
      onDoubleClick={() => {
        if (!readOnly) setEditingCard(card);
      }}
    >
      <span className="card-accent" aria-hidden="true" />
      {isDone ? (
        <span className="completion-ribbon" aria-label="已完成">
          <Icon name="check" />
        </span>
      ) : null}
      <div className="card-when" aria-label={timeNote || itemTypeLabels[itemType]}>
        <strong>{timeNote || itemTypeLabels[itemType]}</strong>
        {displayedStatus ? <span>{displayedStatus}</span> : null}
      </div>
      <div className="card-main">
        <button className="card-head card-open" type="button" onClick={openCard} aria-label={readOnly ? "查看猫猫的事" : "编辑猫猫的事"}>
          <div className="card-people">
            <AvatarPair profiles={profiles} ids={participants} />
          </div>
          <div className="card-copy">
            <div className="card-meta">
              <span className="type-pill">{itemTypeLabels[itemType]}</span>
              <span>{ownerLabel(card.ownerId, currentUser)}</span>
              {card.priority === "high" ? <span>重要</span> : null}
            </div>
            <strong>{title}</strong>
          </div>
        </button>
        {planParts.length ? (
          <div className="card-plan" aria-label="计划">
            {planParts.map((part) => <span key={part}>{part}</span>)}
          </div>
        ) : null}
        {card.stepProgress?.total ? (
          <div className="step-meter" aria-label={`步骤 ${card.stepProgress.done}/${card.stepProgress.total}`}>
            <span style={{ width: `${card.stepProgress.percent || 0}%` }} />
          </div>
        ) : null}
        {summaryText ? <p className="card-detail">{summaryText}</p> : null}
      </div>
      {!readOnly && !isDraft ? (
        <div className="card-actions">
          <button
            className={cx("complete-toggle", isDone && "is-done")}
            type="button"
            aria-label={isDone ? "恢复到待做" : "完成并归档"}
            aria-pressed={isDone}
            title={isDone ? "恢复到待做" : "完成并归档"}
            onClick={completeCard}
          >
            <Icon name={isDone ? "undo" : "check"} />
          </button>
          {!isDone && ["schedule", "todo"].includes(card.sourceType) ? (
            <IconButton icon="archive" label="归档" onClick={(event) => {
              stopAction(event);
              archiveCard?.(card);
            }} />
          ) : null}
          <IconButton icon="edit" label="编辑" onClick={(event) => {
            stopAction(event);
            setEditingCard(card);
          }} />
        </div>
      ) : isDraft ? (
        <div className="card-actions">
          <button
            className="complete-toggle"
            type="button"
            aria-label="保存为猫猫的事"
            aria-pressed="false"
            title="保存为猫猫的事"
            onClick={(event) => {
              stopAction(event);
              setEditingCard(card);
            }}
          >
            <Icon name="check" />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function CardEditor({ card, profiles, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: card.title || "",
    detail: card.detail || card.slot || "",
    date: card.date || today(),
    itemType: card.itemType || "thing",
    ownerId: card.ownerId || "shared",
    segment: card.segment || "allDay",
    repeatRule: card.repeatRule || "",
    plannedAt: dateTimeLocalValue(card.plannedAt),
    dueAt: dateTimeLocalValue(card.dueAt),
    durationMin: card.durationMin || "",
    stepsText: (card.steps || []).map((step) => step.title).filter(Boolean).join("\n"),
  });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSave({
      ...form,
      durationMin: Number(form.durationMin) || 0,
      steps: String(form.stepsText || "")
        .split("\n")
        .map((title, index) => ({ id: card.steps?.[index]?.id || `step-${index + 1}`, title: title.trim(), status: card.steps?.[index]?.status || "todo", sortOrder: index }))
        .filter((step) => step.title),
    });
  };
  const participants = form.ownerId === "shared" ? profiles.map((profile) => profile.id) : [form.ownerId];
  const ownerChoices = [
    { id: "shared", label: "共同" },
    ...profiles.map((profile) => ({ id: profile.id, label: profile.displayName })),
  ];
  const showDelete = !card.isDraft;
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <form className="edit-sheet" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <div className="edit-preview" style={{ "--type": "var(--pink)" }}>
            <AvatarPair profiles={profiles} ids={participants} />
          </div>
          <div className="sheet-icon-actions">
            {showDelete ? <IconButton icon="trash" label="删除" danger onClick={onDelete} /> : null}
            <IconButton icon="x" label="关闭" onClick={onClose} />
          </div>
        </div>
        <label className="edit-title-field">
          <textarea
            rows={2}
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            autoFocus
            aria-label="标题"
            placeholder="标题"
          />
        </label>
        <label className="quiet-field edit-detail-field">
          <span>细节</span>
          <textarea rows={4} value={form.detail} onChange={(event) => update("detail", event.target.value)} />
        </label>
        <div className="edit-grid">
          <label className="quiet-field">
            <span>日期</span>
            <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} />
          </label>
          <label className="quiet-field">
            <span>类型</span>
            <select value={form.itemType} onChange={(event) => update("itemType", event.target.value)}>
              {itemTypeOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="quiet-field">
            <span>归属</span>
            <select value={form.ownerId} onChange={(event) => update("ownerId", event.target.value)} disabled={card.sourceType === "checkin"}>
              {ownerChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </select>
          </label>
        </div>
        <details className="planning-fold">
          <summary>
            <Icon name="calendar" />
            <span>计划</span>
          </summary>
          <div className="edit-grid">
            <label className="quiet-field">
              <span>开始</span>
              <input type="datetime-local" value={form.plannedAt} onChange={(event) => update("plannedAt", event.target.value)} />
            </label>
            <label className="quiet-field">
              <span>截止</span>
              <input type="datetime-local" value={form.dueAt} onChange={(event) => update("dueAt", event.target.value)} />
            </label>
            <label className="quiet-field">
              <span>预计</span>
              <input type="number" min="0" step="5" value={form.durationMin} onChange={(event) => update("durationMin", event.target.value)} />
            </label>
          </div>
          <label className="quiet-field">
            <span>步骤</span>
            <textarea rows={3} value={form.stepsText} onChange={(event) => update("stepsText", event.target.value)} />
          </label>
        </details>
        <div className="sheet-actions">
          <IconButton icon="check" label="保存" type="submit" primary />
        </div>
      </form>
    </div>
  );
}

function EmptyState({ profiles }) {
  return (
    <div className="empty-line" aria-label="暂无内容">
      <AvatarPair profiles={profiles} />
    </div>
  );
}

function DynamicList({ title, rows, profiles, onOpen, className = "" }) {
  if (!rows?.length) return null;
  return (
    <section className={cx("dynamic-list", className)}>
      <div className="dynamic-list-head">
        <strong>{title}</strong>
        <span>{rows.length}</span>
      </div>
      <div className="dynamic-rows">
        {rows.map((row) => (
          <button className="dynamic-row" type="button" key={row.id || row.title} onClick={() => onOpen?.(row)}>
            <AvatarPair profiles={profiles} ids={row.ownerIds} />
            <span>
              <strong>{row.title}</strong>
              {row.subtitle ? <em>{row.subtitle}</em> : null}
            </span>
            <Icon name="chevronRight" />
          </button>
        ))}
      </div>
    </section>
  );
}

function RawCaptureShelf({ data, profiles, currentUser, selectedDate, openDetail }) {
  const context = useMemo(() => ({ profiles, currentUser, selectedDate }), [profiles, currentUser, selectedDate]);
  const rows = useMemo(() => (data.captures || []).slice(0, 8).map((capture) => captureRow(capture, context)), [data.captures, context]);
  return (
    <DynamicList
      title="随手记"
      rows={rows}
      profiles={profiles}
      className="raw-shelf"
      onOpen={(row) => openDetail(row.type, row.payload)}
    />
  );
}

function DetailDrawer({ detail, profiles, onClose, onAction }) {
  const ownerIds = detail.ownerIds?.length ? detail.ownerIds : profiles.map((profile) => profile.id).slice(0, 2);
  return (
    <div className="sheet-backdrop detail-backdrop" role="presentation" onClick={onClose}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={detail.title} onClick={(event) => event.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <div className="detail-head">
          <div className="detail-id">
            <AvatarPair profiles={profiles} ids={ownerIds} />
            <span>{detail.label}</span>
          </div>
          <div className="sheet-icon-actions">
            {(detail.actions || []).slice(0, 2).map((action) => (
              <IconButton key={`${action.type}-${action.label}`} icon={action.icon} label={action.label} onClick={() => onAction(action)} />
            ))}
            <IconButton icon="x" label="关闭" onClick={onClose} />
          </div>
        </div>
        <div className="detail-title-block">
          {detail.date ? <em>{detail.date}</em> : null}
          <h2>{detail.title}</h2>
          {detail.body ? <p>{detail.body}</p> : null}
        </div>
        {detail.chips?.length ? (
          <div className="detail-chips">
            {detail.chips.map((chip) => (
              <span key={`${chip.label}-${chip.value}`}>
                <b>{chip.label}</b>
                <em>{chip.value}</em>
              </span>
            ))}
          </div>
        ) : null}
        {detail.images?.length ? (
          <div className="detail-images">
            {detail.images.slice(0, 4).map((image) => <img key={image.id || image.url} src={image.url} alt={image.name || "照片"} />)}
          </div>
        ) : null}
        {detail.rows?.length ? (
          <div className="detail-rows">
            {detail.rows.map((row) => (
              <div key={`${row.label}-${row.value}`} className={cx(row.wide && "is-wide")}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function DailySummaryPage({ data, profiles, currentUser, request, setData, selectedDate, openDetail }) {
  const [pulse, setPulse] = useState(() => data.diaryDay?.userDays?.[currentUser?.id] || {});
  const summary = data.dailySummary;
  const title = storyDisplayTitle(summary, selectedDate);
  const narrative = cleanStoryText(summary?.narrative);
  const nextStep = cleanStoryText(summary?.nextStep);
  const titleIsDate = title === selectedDate;
  const context = useMemo(() => ({ profiles, currentUser, selectedDate }), [profiles, currentUser, selectedDate]);
  const selectedCards = useMemo(() => sortCards((data.scheduleItemCards || []).filter((card) => card.date === selectedDate)), [data.scheduleItemCards, selectedDate]);
  const selectedMemories = useMemo(() => (data.memoryItems || []).filter((item) => item.suggestedDate === selectedDate || String(item.updatedAt || "").slice(0, 10) === selectedDate).slice(0, 8), [data.memoryItems, selectedDate]);
  const completedRows = useMemo(() => (summary?.completed?.length ? summary.completed : selectedCards.filter(isCompletedCard)).slice(0, 8).map((item) => {
    if (item.sourceType) return lifeCardRow(item, context);
    return summaryRow(item, "完成", context);
  }), [summary?.completed, selectedCards, context]);
  const missedRows = useMemo(() => (summary?.missed?.length ? summary.missed : selectedCards.filter((card) => !isCompletedCard(card))).slice(0, 8).map((item) => {
    if (item.sourceType) return lifeCardRow(item, context);
    return summaryRow(item, "待推进", context);
  }), [summary?.missed, selectedCards, context]);
  const momentRows = useMemo(() => {
    const captures = data.captures?.length
      ? data.captures
      : (summary?.moments || []).map((item, index) => ({
          id: `moment-${index}`,
          text: item.text,
          date: selectedDate,
          createdBy: item.createdBy,
          location: item.location,
          assets: [],
          rawKind: "raw",
          rawFormat: item.photoCount ? "markdown+photo" : "markdown",
        }));
    return captures.slice(0, 8).map((capture) => captureRow(capture, context));
  }, [summary?.moments, data.captures, context, selectedDate]);
  const memoryRows = useMemo(() => {
    const hooks = summary?.memoryHooks?.length ? summary.memoryHooks : selectedMemories;
    return hooks.slice(0, 8).map((item) => item.group ? memoryRow(item, context) : summaryRow(item, "记忆", context));
  }, [summary?.memoryHooks, selectedMemories, context]);
  useEffect(() => {
    setPulse(data.diaryDay?.userDays?.[currentUser?.id] || {});
  }, [data.diaryDay, currentUser?.id]);

  async function refresh() {
    const result = await request("/api/couple/daily-summary/refresh", { method: "POST", body: { date: selectedDate } });
    if (result) setData(result.state);
  }

  async function savePulse(event) {
    event.preventDefault();
    const result = await request("/api/couple/status", {
      method: "POST",
      body: {
        date: selectedDate,
        dailyScore: pulse.dailyScore || 0,
        happiestThing: pulse.happiestThing || "",
        smallAchievement: pulse.smallAchievement || "",
      },
    });
    if (result) setData(result.state);
  }

  return (
    <section className="story-page">
      <div className="page-head">
        <div className="story-heading">
          <h1>{title}</h1>
          {!titleIsDate ? <span>{selectedDate}</span> : null}
        </div>
        <IconButton icon="sparkle" label="重新生成日总结" onClick={refresh} />
      </div>
      <form className="pulse-strip" onSubmit={savePulse}>
        <CatAvatar profile={currentUser} />
        <input type="number" min="1" max="10" value={pulse.dailyScore || ""} onChange={(event) => setPulse({ ...pulse, dailyScore: event.target.value })} aria-label="今日打分" placeholder="/10" />
        <input value={pulse.happiestThing || ""} onChange={(event) => setPulse({ ...pulse, happiestThing: event.target.value })} aria-label="最开心的事" placeholder="最开心的事" />
        <input value={pulse.smallAchievement || ""} onChange={(event) => setPulse({ ...pulse, smallAchievement: event.target.value })} aria-label="核心贡献" placeholder="核心贡献" />
        <IconButton icon="check" label="保存状态" type="submit" primary />
      </form>
      {summary ? (
        <article className="story-panel">
          <div className="story-visual">
            {summary.illustration?.type === "photo" && summary.illustration.url ? <img src={summary.illustration.url} alt={summary.illustration.alt || "当天照片"} /> : <AvatarPair profiles={data.profiles} className="story-cats" />}
          </div>
          <div className="story-copy">
            <div className="story-copy-head">
              <span>Agent 分析</span>
              <strong>{summary.mode === "agent" ? "Agent 回忆" : "本地回忆"}</strong>
            </div>
            {narrative ? <p>{narrative}</p> : null}
            <div className="story-meta">
              <span>完成 {summary.stats?.done || 0}/{summary.stats?.total || 0}</span>
              {summary.locations?.length ? <span>地点 {summary.locations.slice(0, 2).join("、")}</span> : null}
              {summary.photos?.length ? <span>照片 {summary.photos.length}</span> : null}
              {summary.memoryHooks?.length ? <span>记忆 {summary.memoryHooks.length}</span> : null}
            </div>
            <div className="story-grid">
              <StoryList title="完成" rows={completedRows.slice(0, 4)} profiles={profiles} onOpen={(row) => openDetail(row.type, row.payload)} />
              <StoryList title="待推进" rows={missedRows.slice(0, 4)} profiles={profiles} onOpen={(row) => openDetail(row.type, row.payload)} muted />
              <StoryList title="记忆" rows={memoryRows.slice(0, 4)} profiles={profiles} onOpen={(row) => openDetail(row.type, row.payload)} accent />
            </div>
            {nextStep ? <p className="next-step">{nextStep}</p> : null}
          </div>
        </article>
      ) : (
        <section className="story-panel story-panel-fallback">
          <div className="story-visual">
            <AvatarPair profiles={data.profiles} className="story-cats" />
          </div>
          <div className="story-copy">
            <div className="story-copy-head">
              <span>Agent 分析</span>
              <strong>待生成</strong>
            </div>
            <div className="story-meta">
              <span>完成 {selectedCards.filter(isCompletedCard).length}/{selectedCards.length}</span>
              <span>随手记 {data.captures?.length || 0}</span>
              <span>记忆 {selectedMemories.length}</span>
            </div>
            <div className="story-grid">
              <StoryList title="猫猫的事" rows={missedRows.slice(0, 4)} profiles={profiles} onOpen={(row) => openDetail(row.type, row.payload)} />
              <StoryList title="记忆" rows={memoryRows.slice(0, 4)} profiles={profiles} onOpen={(row) => openDetail(row.type, row.payload)} accent />
            </div>
          </div>
        </section>
      )}
      <DynamicList title="今天的随手记" rows={momentRows} profiles={profiles} className="raw-shelf story-capture-full" onOpen={(row) => openDetail(row.type, row.payload)} />
    </section>
  );
}

function StoryList({ title, rows, profiles, onOpen, muted, accent }) {
  if (!rows?.length) return null;
  return (
    <div className={cx("story-list", muted && "is-muted", accent && "is-accent")}>
      <strong>{title}</strong>
      {rows.map((row) => (
        <button key={row.id || row.title} type="button" onClick={() => onOpen?.(row)}>
          <AvatarPair profiles={profiles} ids={row.ownerIds} />
          <span>{row.title}</span>
        </button>
      ))}
    </div>
  );
}

function MemoryPage({ data, profiles, currentUser, request, setData, selectedDate, openDetail }) {
  const page = data.personalPages?.[currentUser?.id] || {};
  const [form, setForm] = useState(page);
  const memoryItems = data.memoryItems || [];
  const memoryGroups = useMemo(() => {
    return memoryItems.reduce((groups, item) => {
      const group = memoryLaneLabels[item.group] ? item.group : "care";
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
      return groups;
    }, {});
  }, [memoryItems]);
  useEffect(() => setForm(page), [page.userId, page.updatedAt]);

  async function save(event) {
    event.preventDefault();
    const result = await request("/api/couple/personal-page", {
      method: "POST",
      body: { date: selectedDate, ...form },
    });
    if (result) setData(result.state);
  }

  return (
    <section className="memory-page">
      <div className="page-head">
        <div>
          <h1>长期记忆</h1>
        </div>
      </div>
      <div className="memory-overview">
        {memoryLaneOrder.map((lane) => (
          <button key={lane} type="button" onClick={() => document.getElementById(`memory-lane-${lane}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <strong>{(memoryGroups[lane] || []).length}</strong>
            <span>{memoryLaneLabels[lane]}</span>
          </button>
        ))}
      </div>
      <div className="memory-shelves">
        {memoryLaneOrder.map((lane) => {
          const items = (memoryGroups[lane] || []).slice(0, 8);
          return (
            <section key={lane} id={`memory-lane-${lane}`} className="memory-lane">
              <div className="memory-lane-head">
                <strong>{memoryLaneLabels[lane]}</strong>
                <span>{items.length}</span>
              </div>
              <div className="memory-stack">
                {items.length ? items.map((item) => (
                  <MemoryItemCard key={item.id} item={item} profiles={profiles} currentUser={currentUser} onOpen={() => openDetail("memoryItem", item)} />
                )) : <EmptyState profiles={profiles} />}
              </div>
            </section>
          );
        })}
      </div>
      <details className="memory-editor">
        <summary>
          <CatAvatar profile={currentUser} />
          <strong>{currentUser?.displayName}</strong>
          <Icon name="edit" />
        </summary>
        <form className="memory-board" onSubmit={save}>
          {[
            ["identityGoal", "我们想成为什么样"],
            ["likes", "偏好和边界"],
            ["notes", "重要清单"],
            ["longTermGoal", "未来想做"],
          ].map(([key, label]) => (
            <label key={key} className="memory-block">
              <span>{label}</span>
              <textarea rows={4} value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            </label>
          ))}
          <div className="memory-save-row">
            <IconButton icon="check" label="保存长期记忆" type="submit" primary />
          </div>
        </form>
      </details>
    </section>
  );
}

function MemoryItemCard({ item, profiles, currentUser, onOpen }) {
  const ids = memoryOwnerIds(item, profiles, currentUser);
  return (
    <button className={cx("memory-card", `memory-${item.group || "care"}`)} type="button" onClick={onOpen}>
      <div className="memory-card-head">
        <AvatarPair profiles={profiles} ids={ids} />
        <span>{item.kindLabel}</span>
        {item.actionable ? <Icon name="sparkle" /> : null}
      </div>
      <strong>{item.title}</strong>
      {item.detail ? <p>{item.detail}</p> : null}
      {item.suggestedDate ? (
        <em>{item.suggestedDate}</em>
      ) : null}
    </button>
  );
}

function SettingsPage({ currentUser, profiles, request, setData, selectedDate }) {
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [form, setForm] = useState(() => ({
    displayName: currentUser?.displayName || "",
    initials: currentUser?.initials || "",
    color: currentUser?.color || "#ff6fa8",
    avatar: currentUser?.avatar || "pink-cat",
  }));
  const fileRef = useRef(null);
  useEffect(() => {
    setForm({
      displayName: currentUser?.displayName || "",
      initials: currentUser?.initials || "",
      color: currentUser?.color || "#ff6fa8",
      avatar: currentUser?.avatar || "pink-cat",
    });
    setAvatarPreviewUrl("");
  }, [currentUser]);

  async function chooseAvatarFile(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    setForm((current) => ({ ...current, avatar: "custom" }));
    setAvatarPreviewUrl(await readFileAsDataUrl(file));
  }

  async function save(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0] || null;
    const avatarAsset = file ? { name: file.name, dataUrl: await readFileAsDataUrl(file) } : null;
    const result = await request("/api/couple/profile", {
      method: "POST",
      body: { date: selectedDate, ...form, avatarAsset },
    });
    if (result) setData(result.state);
  }

  const preview = {
    ...currentUser,
    ...form,
    avatarUrl: form.avatar === "custom" ? avatarPreviewUrl || currentUser?.avatarUrl || "" : "",
  };
  return (
    <section className="settings-page">
      <div className="page-head">
        <div>
          <p className="kicker">Settings</p>
          <h1>设置</h1>
        </div>
      </div>
      <form className="settings-grid" onSubmit={save}>
        <div className="settings-preview">
          <CatAvatar profile={preview} />
          <strong>{form.displayName}</strong>
          <IconButton icon="check" label="保存设置" type="submit" primary />
        </div>
        <label className="quiet-field">
          <span>昵称</span>
          <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        </label>
        <label className="quiet-field">
          <span>短标记</span>
          <input maxLength={2} value={form.initials} onChange={(event) => setForm({ ...form, initials: event.target.value })} />
        </label>
        <label className="quiet-field">
          <span>颜色</span>
          <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
        </label>
        <label className="quiet-field">
          <span>头像</span>
          <select
            value={form.avatar}
            onChange={(event) => {
              const avatar = event.target.value;
              setForm({ ...form, avatar });
              if (avatar !== "custom") {
                setAvatarPreviewUrl("");
                if (fileRef.current) fileRef.current.value = "";
              }
            }}
          >
            <option value="pink-cat">粉色小猫</option>
            <option value="violet-cat">紫色小猫</option>
            <option value="mint-cat">薄荷小猫</option>
            <option value="yellow-cat">奶黄小猫</option>
            <option value="custom">自定义头像</option>
          </select>
        </label>
        <label className="upload-row">
          <Icon name="camera" />
          <span>上传头像</span>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseAvatarFile} />
        </label>
      </form>
      <div className="member-list">
        {profiles.map((profile) => (
          <span key={profile.id} style={{ "--person": profile.color }}>
            <CatAvatar profile={profile} />
            <b>{profile.displayName}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
