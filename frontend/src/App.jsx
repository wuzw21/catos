import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { DayPicker } from "react-day-picker";
import { Toaster, toast } from "sonner";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Archive,
  Bookmark,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Cloud,
  Ellipsis,
  Focus,
  GripVertical,
  Image,
  LayoutGrid,
  List,
  LogOut,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Square,
  Star,
  Sun,
  Trash2,
  Undo2,
  User,
  Users,
  X,
} from "lucide-react";
import "react-day-picker/style.css";

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
const itemTypeIds = Object.keys(itemTypeLabels);
const priorityOptions = [
  { id: "high", label: "重要", hint: "先冒出来", icon: "star" },
  { id: "normal", label: "普通", hint: "按时间排", icon: "circle" },
  { id: "low", label: "轻松", hint: "不催", icon: "cloud" },
];
const repeatEditorOptions = [
  { id: "", label: "一次", hint: "只做这次" },
  { id: "daily", label: "每天", hint: "每天出现" },
  { id: "workday", label: "工作日", hint: "周一到周五" },
  { id: "weekly", label: "每周", hint: "每周一次" },
  { id: "monthly", label: "每月", hint: "每月一次" },
  { id: "yearly", label: "每年", hint: "纪念日" },
];
const avatarOptions = ["pink-cat", "violet-cat", "mint-cat", "yellow-cat", "custom"];
const editorStepSchema = z.object({
  id: z.string().optional().default(""),
  title: z.string().default(""),
  ownerId: z.string().optional().default(""),
  estimateMin: z.coerce.number().min(0, "分钟不能小于 0").optional().default(0),
  status: z.enum(["todo", "done"]).optional().default("todo"),
});
const cardEditorSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(120, "标题太长了"),
  detail: z.string().optional().default(""),
  date: z.string().min(1, "需要日期"),
  itemType: z.string().refine((value) => itemTypeIds.includes(value), "类型不对"),
  ownerId: z.string().min(1, "需要归属"),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  segment: z.string().optional().default("allDay"),
  repeatRule: z.string().optional().default(""),
  plannedAt: z.string().optional().default(""),
  dueAt: z.string().optional().default(""),
  durationMin: z.coerce.number().min(0, "预计不能小于 0").optional().default(0),
  tags: z.string().max(240, "标签太长了").optional().default(""),
  steps: z.array(editorStepSchema).default([]),
});
const personalPageSchema = z.object({
  userId: z.string().optional().default(""),
  identityGoal: z.string().max(1200, "内容太长了").optional().default(""),
  likes: z.string().max(1200, "内容太长了").optional().default(""),
  notes: z.string().max(1600, "内容太长了").optional().default(""),
  longTermGoal: z.string().max(1200, "内容太长了").optional().default(""),
  updatedAt: z.string().optional().default(""),
  updatedBy: z.string().optional().default(""),
}).passthrough();
const profileFormSchema = z.object({
  displayName: z.string().trim().min(1, "昵称不能为空").max(16, "昵称太长了"),
  initials: z.string().trim().min(1, "短标记不能为空").max(2, "短标记最多 2 个字"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色格式不对"),
  avatar: z.string().refine((value) => avatarOptions.includes(value), "头像不对"),
});
const memoryLaneLabels = {
  profile: "资料",
  taste: "偏好",
  wish: "想要",
  promise: "承诺",
  time: "纪念",
  care: "照顾",
};
const memoryKindLabels = {
  preference: "偏好",
  wish: "心愿",
  purchase: "购买",
  promise: "承诺",
  care: "照顾",
  anniversary: "纪念",
  memory: "回忆",
  gratitude: "感谢",
  repair: "修复",
  identity: "资料",
  goal: "目标",
  list: "清单",
};
const captureDecisionLabels = {
  schedule: { label: "生活卡", icon: "cards", hint: "会进入时间轴" },
  capture: { label: "随手记", icon: "camera", hint: "只保留原文" },
  memory: { label: "长期记忆", icon: "bookmark", hint: "会沉淀成偏好、纪念或承诺" },
  dailyStory: { label: "日总结素材", icon: "sparkle", hint: "会留给日记整理" },
};
const relationLabels = {
  parent: "父级",
  child: "子项",
  group: "同组",
  source: "同源",
  related: "相关",
};
const memoryLaneOrder = ["profile", "taste", "wish", "promise", "time", "care"];
const memorySurfaceDefs = [
  { key: "plans", title: "想做想去", icon: "calendar", caption: "地方和愿望" },
  { key: "profile", title: "资料", icon: "bookmark", caption: "偏好和边界" },
  { key: "dates", title: "纪念日", icon: "star", caption: "日子和承诺" },
];
const legacyPages = new Set(["capture", "todos", "schedule", "timeline"]);
const defaultLifeCardTitle = "今天有没有开开心心？";
const dailyCheckinTitle = "一起确认明天的安排";
const defaultPromptTitleKeys = new Set([
  defaultLifeCardTitle,
  "写下今天最重要的一件事",
  "互相确认今天的状态",
  "一起确认今天的安排",
  dailyCheckinTitle,
].map(normalizedPromptKey));
const lowSignalStoryKeys = new Set(["做别的事"].map(normalizedPromptKey));
const badStoryTextPattern = /值得记住的是|今天最清楚留下来(?:的)?是|今天最值得记住的是|今天的页面很轻|记录留下了\s*\d+\s*条现场线索|完成了\s*今天有没有开开心心|需要顺手带到明天的是\s*今天有没有开开心心|还没有明确完成项|没有明确贡献记录|没有太多具体安排|没有谁完成了什么|没有具体安排|信息不足|数据不足|记录较少|记录里|记录显示|没有显示|随手记还比较少|先补上|自动日总结|每日状态对象|doneUsers|pendingUsers|createdBy|updatedBy|statusUpdatedBy|actorId|targetUserId|status_by_user|source_counts/;
const fallbackDailyTitles = ["轻轻的一页", "小猫留光日", "慢慢亮起来", "把今天收好", "软软小片刻", "今天有小光"];
const segmentLabels = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  evening: "晚上",
  allDay: "全天",
};
const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];
const dayRolloverHour = 3;
const deepNightNoticeText = "夜已深了，猫猫要早点休息哦！";

function today() {
  return businessDate();
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function businessDate(date = new Date()) {
  const shifted = new Date(date);
  if (shifted.getHours() < dayRolloverHour) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return formatDate(shifted);
}

function clockLabel(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function stableIndex(key, size) {
  if (!size) return 0;
  let hash = 0;
  String(key).split("").forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  });
  return hash % size;
}

function useMinuteNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const catNoticeLines = {
  morning: [
    "猫猫今天从一小口水开始。",
    "先把最轻的一件事放到手边。",
    "猫猫醒了，今天也慢慢来。",
  ],
  noon: [
    "猫猫要记得吃饭，事情可以排队。",
    "午间暂停一下，给自己留一点空白。",
    "现在适合补一点能量，再继续推进。",
  ],
  afternoon: [
    "下午的猫猫适合只抓一件重点。",
    "把乱乱的事收成一小步就很好。",
    "今天还长，猫猫不要急。",
  ],
  evening: [
    "晚上适合把今天最值得记住的事留下。",
    "猫猫可以慢慢收尾，不用把全部都做完。",
    "先记一笔，剩下的明天也会在。",
  ],
  night: [
    "猫猫今天已经很努力了，可以开始收灯。",
    "夜里适合只留下重要的，不追新的。",
    "猫猫把最后一件小事放好，就准备休息。",
  ],
};

const catMoodWeather = ["软绵绵", "小晴天", "微风", "热乎乎", "安静雨", "月亮亮"];
const catNoticeDetails = {
  morning: "慢慢开始。",
  noon: "先吃饭。",
  afternoon: "只抓重点。",
  evening: "轻轻收尾。",
  night: "收灯就好。",
  deepNight: "月亮值班，睡醒再看。",
};
const catNoticeKindMeta = {
  future: { title: "未来", icon: "calendar", detail: "一起慢慢靠近。" },
  wish: { title: "想去", icon: "bookmark", detail: "还在小口袋里。" },
  fragment: { title: "小碎片", icon: "camera", detail: "先好好藏着。" },
  time: { title: "回忆", icon: "sparkle", detail: "轻轻翻到这一页。" },
};
const catNoticeTemplates = {
  future: [
    (text) => `未来的我们会遇见「${text}」。`,
    (text) => `把「${text}」放进下一站。`,
    (text) => `猫猫未来的小格子里有「${text}」。`,
  ],
  wish: [
    (text) => `猫猫想去的「${text}」，我还记得。`,
    (text) => `以前说过的「${text}」，还亮着。`,
    (text) => `等一个舒服的日子，去靠近「${text}」。`,
  ],
  fragment: [
    (text) => `小碎片掉出来了：${text}`,
    (text) => `今天先把「${text}」放进口袋。`,
    (text) => `猫猫的小纸条写着：${text}`,
  ],
  time: [
    (text) => `翻到「${text}」。`,
    (text) => `这页叫「${text}」。`,
    (text) => `「${text}」亮了一下。`,
  ],
};
const fallbackCatNoticeCandidates = [
  { kind: "future", text: "一个不用赶路的小约会", line: "未来留一格给慢慢散步。" },
  { kind: "wish", text: "想去的地方", line: "猫猫想去的地方，我会记得。" },
  { kind: "fragment", text: "今天的小碎片", line: "今天的小碎片也值得被抱一下。" },
  { kind: "time", text: "共同回忆", line: "共同回忆会自己发光。" },
];

function catNoticePeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour < dayRolloverHour) return "deepNight";
  if (hour >= 22) return "night";
  if (hour < 11) return "morning";
  if (hour < 14) return "noon";
  if (hour < 18) return "afternoon";
  return "evening";
}

function cleanNoticeBit(value, max = 22) {
  const text = cleanStoryText(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(todo|待办|提醒)[:：\s]*/i, "")
    .replace(/^(今天|今日|把)\s*/g, "")
    .replace(/^["“”'「」]+|["“”'「」]+$/g, "")
    .trim();
  if (!text || /^\d{1,4}$/.test(text)) return "";
  return shortText(text, max);
}

function noticeFromCandidate(candidate, key) {
  const meta = catNoticeKindMeta[candidate.kind] || catNoticeKindMeta.fragment;
  const templates = catNoticeTemplates[candidate.kind] || catNoticeTemplates.fragment;
  const text = candidate.line || templates[stableIndex(`${key}:${candidate.id || candidate.text}`, templates.length)](candidate.text);
  return {
    kind: candidate.kind,
    icon: candidate.icon || meta.icon,
    title: candidate.title || meta.title,
    text,
    detail: candidate.detail || meta.detail,
    isLong: text.length > 25,
  };
}

function buildCatNoticeCandidates(data, dateKey) {
  const futureCards = (data?.scheduleItemCards || [])
    .filter((card) => card.date >= dateKey)
    .filter((card) => !isArchivedCard(card) && !isDefaultPromptCard(card))
    .filter((card) => card.date > dateKey || !isCompletedCard(card))
    .slice(0, 10)
    .map((card) => {
      const text = cleanNoticeBit(card.title || card.sourceCaptureSummary || card.detail);
      const label = card.date > dateKey ? shortDate(card.date) : "今天";
      return text ? {
        id: card.id,
        kind: "future",
        text,
        detail: `${label} · ${card.itemTypeLabel || "猫猫的事"}`,
      } : null;
    })
    .filter(Boolean);
  const pagePlans = Object.values(data?.personalPages || {})
    .flatMap((page) => [page.longTermGoal, page.identityGoal])
    .map((value, index) => {
      const text = cleanNoticeBit(value);
      return text ? { id: `page-plan-${index}`, kind: "future", text, detail: "长期记忆" } : null;
    })
    .filter(Boolean);
  const wishes = (data?.memoryItems || [])
    .filter((item) => item.group === "wish" || ["wish", "purchase"].includes(item.kind) || /想去|想吃|想买|想看|好想|以后/.test(`${item.title || ""}${item.detail || ""}`))
    .map((item) => {
      const text = cleanNoticeBit(item.title || item.detail);
      return text ? { id: item.id, kind: "wish", text, detail: item.kindLabel || "长期记忆" } : null;
    })
    .filter(Boolean)
    .slice(0, 10);
  const captures = (data?.captures || [])
    .map((capture) => {
      const text = cleanNoticeBit(capture.text);
      return text ? { id: capture.id, kind: "fragment", text, detail: "随手记" } : null;
    })
    .filter(Boolean)
    .slice(0, 8);
  const storyTitles = (data?.monthSummary?.days || [])
    .filter((day) => day.summaryTitle)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))
    .slice(0, 8)
    .map((day) => {
      const text = cleanNoticeBit(day.summaryTitle, 10);
      return text ? { id: `story-${day.id}`, kind: "time", text, detail: shortDate(day.id) } : null;
    })
    .filter(Boolean);
  return [...futureCards, ...pagePlans, ...wishes, ...captures, ...storyTitles];
}

function buildCatNotice(date = new Date(), variant = 0, data = null) {
  const period = catNoticePeriod(date);
  const dateKey = businessDate(date);
  const isNightLocked = period === "deepNight" || period === "night";
  const key = isNightLocked ? `${dateKey}:${period}` : `${dateKey}:${period}:${variant}`;
  const lines = catNoticeLines[period] || catNoticeLines.evening;
  const candidates = isNightLocked ? [] : buildCatNoticeCandidates(data, dateKey);
  const candidate = candidates.length
    ? candidates[stableIndex(`${key}:candidate`, candidates.length)]
    : fallbackCatNoticeCandidates[stableIndex(`${key}:fallback`, fallbackCatNoticeCandidates.length)];
  const dynamicNotice = !isNightLocked ? noticeFromCandidate(candidate, key) : null;
  const text = period === "deepNight" ? deepNightNoticeText : dynamicNotice?.text || lines[stableIndex(key, lines.length)];
  const weather = catMoodWeather[stableIndex(`${key}:weather`, catMoodWeather.length)];
  return {
    period,
    kind: dynamicNotice?.kind || period,
    icon: dynamicNotice?.icon || (period === "deepNight" || period === "night" ? "moon" : "sparkle"),
    text,
    time: clockLabel(date),
    date: dateKey,
    weather,
    isNightLocked,
    isLong: Boolean(dynamicNotice?.isLong || text.length > 25),
    title: dynamicNotice?.title || (period === "deepNight" ? "晚安" : period === "night" ? "收灯" : "猫猫的话"),
    detail: dynamicNotice?.detail || catNoticeDetails[period] || catNoticeDetails.evening,
  };
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

function nextWeekendDate(value) {
  const date = parseDate(value) || new Date();
  const day = date.getDay();
  const offset = day === 0 || day === 6 ? 0 : 6 - day;
  date.setDate(date.getDate() + offset);
  return formatDate(date);
}

function localDateTimeValue(date, time = "09:00") {
  return `${date || today()}T${time}`;
}

function redateDateTime(value, date) {
  const raw = dateTimeLocalValue(value);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})$/);
  return match ? `${date}T${match[1]}:${match[2]}` : "";
}

function daysBetween(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
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
  if (raw === "cat-words") return "cat-note";
  return ["dashboard", "month", "daily-summary", "cat-note", "goals", "settings"].includes(raw) ? raw : "dashboard";
}

function shortDate(value) {
  return value ? value.slice(5).replace("-", "/") : "";
}

function detailDateLabel(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function reorder(list, startIndex, endIndex) {
  const next = Array.from(list || []);
  const [removed] = next.splice(startIndex, 1);
  if (!removed) return next;
  next.splice(endIndex, 0, removed);
  return next;
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

const icons = {
  archive: Archive,
  bookmark: Bookmark,
  calendar: Calendar,
  camera: Camera,
  cards: LayoutGrid,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  circle: Circle,
  clock: Clock,
  cloud: Cloud,
  edit: Pencil,
  focus: Focus,
  grip: GripVertical,
  image: Image,
  logout: LogOut,
  moon: Moon,
  more: Ellipsis,
  plus: Plus,
  refresh: RefreshCw,
  rows: List,
  send: Send,
  settings: Settings,
  sparkle: Sparkles,
  star: Star,
  stop: Square,
  sun: Sun,
  trash: Trash2,
  undo: Undo2,
  user: User,
  users: Users,
  x: X,
};

function Icon({ name, ...props }) {
  const Component = icons[name] || Check;
  return <Component aria-hidden="true" strokeWidth={1.9} {...props} />;
}

function IconButton({ icon, label, active, danger, primary, type = "button", onClick, disabled, className = "" }) {
  const button = (
    <button
      className={cx("icon-button", active && "is-active", primary && "is-primary", danger && "is-danger", className)}
      type={type}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
  if (disabled) return button;
  return (
    <Tooltip.Provider delayDuration={220}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip-content" sideOffset={7}>
            {label}
            <Tooltip.Arrow className="tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

const EMPTY_SELECT_VALUE = "__peos_empty__";

function EditorSelect({ value, onValueChange, options, disabled, ariaLabel, placeholder = "选择" }) {
  const selected = options.find((option) => option.id === value);
  const displayValue = value === "" ? EMPTY_SELECT_VALUE : value ?? "";
  return (
    <Select.Root
      value={displayValue}
      onValueChange={(nextValue) => onValueChange(nextValue === EMPTY_SELECT_VALUE ? "" : nextValue)}
      disabled={disabled}
    >
      <Select.Trigger className="editor-select-trigger" aria-label={ariaLabel}>
        <Select.Value placeholder={selected?.label || placeholder} />
        <Select.Icon asChild>
          <Icon name="chevronDown" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="editor-select-content" position="popper" sideOffset={6}>
          <Select.Viewport className="editor-select-viewport">
            {options.map((option) => (
              <Select.Item className="editor-select-item" key={option.id || "shared"} value={option.id === "" ? EMPTY_SELECT_VALUE : option.id}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Icon name="check" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
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
      {selected.slice(0, 2).map((profile, index) => (
        <CatAvatar key={profile.id} profile={profile} className={index === 0 ? "is-front" : "is-back"} />
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

function repeatRuleLabel(rule) {
  const text = String(rule || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  const time = normalized.match(/@(\d{1,2}:\d{2})/)?.[1] || "";
  if (/^daily(?:@|$)/.test(normalized) || /^每天/.test(text)) return ["每天", time].filter(Boolean).join(" ");
  if (/^weekly(?:@|$)/.test(normalized) || /^每周/.test(text)) return ["每周", time].filter(Boolean).join(" ");
  if (/^monthly(?:@|$)/.test(normalized) || /^每月/.test(text)) return ["每月", time].filter(Boolean).join(" ");
  if (/^yearly(?:@|$)/.test(normalized) || /^每年/.test(text)) return ["每年", time].filter(Boolean).join(" ");
  if (/^workday/.test(normalized)) return ["工作日", time].filter(Boolean).join(" ");
  return text;
}

function summaryLine(card) {
  const time = primaryTimeLabel(card);
  const repeat = repeatRuleLabel(card.repeatRule);
  const detail = cleanCardText(card.detail);
  if (!detail || detail === time || detail === card.repeatRule || detail === repeat) return "";
  return detail;
}

function primaryTimeLabel(card) {
  const planned = formatCardPlannedLabel(card);
  const due = formatCardDueLabel(card);
  return planned || due || card.timeLabel || repeatRuleLabel(card.repeatRule) || segmentLabels[card.segment] || "全天";
}

function formatCardPlannedLabel(card) {
  const raw = String(card?.plannedAt || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  if (match[1] === card?.date) return `${match[2]}:${match[3]}`;
  return lifeCardDateTimeLabel(raw, card?.date);
}

function formatCardDueLabel(card) {
  const raw = String(card?.dueAt || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const label = lifeCardDateTimeLabel(raw, card?.date);
  return label ? `截止 ${label}` : "";
}

function formatDateTimeShort(value) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const date = match[1] === today() ? "今天" : shortDate(match[1]);
  return `${date} ${match[2]}:${match[3]}`;
}

function lifeCardDateTimeLabel(value, cardDate = "") {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  if (match[1] === cardDate) return `${match[2]}:${match[3]}`;
  return `${shortDate(match[1])} ${match[2]}:${match[3]}`;
}

function compactDateTime(value) {
  return formatDateTimeShort(value) || String(value || "").replace("T", " ").slice(0, 16);
}

function summaryModeLabel(mode) {
  return mode === "agent" ? "Agent" : "本地";
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

function compactDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (!value) return "";
  if (value < 60) return `${value}秒`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}时${rest}分` : `${hours}时`;
}

function stepOwnerMeta(step, profiles, participants = []) {
  const ownerId = step?.ownerId || "";
  const owner = profiles.find((profile) => profile.id === ownerId);
  const shared = !ownerId || participants.length > 1 && !owner;
  return {
    color: owner?.color || (shared ? "#ff6fa8" : "#8d6d7a"),
    label: owner?.displayName || "共同",
    initials: owner?.initials || (owner?.displayName || "共").slice(0, 1),
    shared,
  };
}

function timerTotalSeconds(card, nowMs = Date.now()) {
  const entries = Array.isArray(card?.timeEntries) ? card.timeEntries : [];
  return entries.reduce((total, entry) => {
    const duration = Number(entry.durationSec) || 0;
    if (entry.stoppedAt) return total + duration;
    const startedAt = Date.parse(entry.startedAt || "");
    if (!Number.isFinite(startedAt)) return total + duration;
    return total + duration + Math.max(0, Math.round((nowMs - startedAt) / 1000));
  }, 0);
}

function cardPlanParts(card) {
  const parts = [];
  if (card.rankReason && card.rankReason !== "后续") parts.push(card.rankReason);
  if (card.stepProgress?.total) parts.push(`${card.stepProgress.done}/${card.stepProgress.total}`);
  const duration = durationLabel(card.durationMin);
  if (duration) parts.push(duration);
  if (card.dueAt) parts.push(`${lifeCardDateTimeLabel(card.dueAt, card.date)} 截止`);
  return parts.slice(0, 4);
}

function lifeCardAgeNotice(card, anchorDate = today()) {
  if (!card || isArchivedCard(card) || isCompletedCard(card)) return null;
  const dueDate = String(card.dueAt || "").slice(0, 10);
  const plannedDate = String(card.plannedAt || "").slice(0, 10);
  const cardDate = String(card.date || "").slice(0, 10);
  const createdDate = String(card.createdAt || "").slice(0, 10);
  const baseDate = dueDate || plannedDate || cardDate || createdDate;
  if (!baseDate) return null;
  const ageDays = daysBetween(baseDate, anchorDate);
  if (ageDays < 7) return null;
  if (dueDate && dueDate < anchorDate) {
    return {
      level: "strong",
      label: "已过期",
      text: ageDays >= 14 ? `过期 ${ageDays} 天了，建议处理或归档。` : `过期 ${ageDays} 天了。`,
    };
  }
  if (ageDays >= 14) {
    return {
      level: "strong",
      label: "拖久了",
      text: `放了 ${ageDays} 天，建议拆一步、改日期或归档。`,
    };
  }
  return {
    level: "soft",
    label: "搁置中",
    text: `已经 ${ageDays} 天，记得看一眼。`,
  };
}

function dayProgressPercent(date) {
  if (date < today()) return 100;
  if (date > today()) return 0;
  const now = new Date();
  const shiftedMinutes = ((now.getHours() - dayRolloverHour + 24) % 24) * 60 + now.getMinutes();
  return Math.round((shiftedMinutes / 1440) * 100);
}

function cleanCardText(value) {
  return String(value || "")
    .replace(/这是第[一1](?:条共享日程|张共享生活卡)，?可以直接改(?:掉)?。?/g, "")
    .trim();
}

function displayCardTitle(value) {
  const text = cleanCardText(value);
  if (/^(?:互相确认今天的状态|一起确认今天的安排)$/.test(text)) return dailyCheckinTitle;
  return text;
}

function lifeCardSurfaceText(value, fallback = "") {
  const text = cleanCardText(value)
    .replace(/(?:今天|今日)(?:的)?/g, "")
    .replace(/^[\s.。·、，,：:\-]+|[\s.。·、，,：:\-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text || fallback;
}

function normalizedPromptKey(value) {
  return String(value || "").replace(/[？?。!！\s]/g, "").trim();
}

function isDefaultPromptText(value) {
  return defaultPromptTitleKeys.has(normalizedPromptKey(value));
}

function isGenericStoryTitle(value) {
  const text = cleanCardText(value || "");
  if (!text) return true;
  return isDefaultPromptText(text) ||
    lowSignalStoryKeys.has(normalizedPromptKey(text)) ||
    /自动日总结|为什么值得记住/.test(text) ||
    /^\d{1,2}[/-]\d{1,2}\s*的共同回忆$/.test(text) ||
    /^\d{4}-\d{2}-\d{2}$/.test(text) ||
    /^\d{1,2}\s*月\s*\d{1,2}\s*日(?:的)?(?:共同回忆|日总结)?$/.test(text) ||
    /^(共同回忆|日记|今日|今天|日总结|Daily Story)$/i.test(text);
}

function storyDisplayTitle(summary, date) {
  const candidates = [
    summary?.title,
    summary?.analysis?.diary?.title,
    summary?.analysis?.keyMoment?.title,
    summary?.analysis?.keyMoment?.text,
    ...(summary?.people || []).flatMap((person) => [person.happiestThing, person.smallAchievement]),
    ...(summary?.moments || []).map((item) => item.text),
    ...(summary?.completed || []).map((item) => item.title),
  ];
  const picked = candidates
    .map((item) => cleanNoticeBit(item, 12))
    .find((item) => item && !isGenericStoryTitle(item));
  return picked || fallbackDailyTitles[stableIndex(date, fallbackDailyTitles.length)];
}

function cleanStoryText(value) {
  const text = cleanCardText(value || "");
  if (!text || isDefaultPromptText(text) || lowSignalStoryKeys.has(normalizedPromptKey(text)) || badStoryTextPattern.test(text) || /^完成\s*\d+\s*\/\s*\d+$/.test(text)) return "";
  return text;
}

function shortText(value, max = 52) {
  const text = cleanCardText(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function normalizeEditableTags(value, maxItems = 12) {
  const parts = Array.isArray(value)
    ? value
    : String(value || "").split(/[#,，、\s]+/);
  return [...new Set(parts
    .map((part) => String(part || "").replace(/^#+/, "").trim())
    .filter(Boolean)
  )].slice(0, maxItems);
}

function tagsInputValue(tags) {
  return normalizeEditableTags(tags).join(" ");
}

function profileColor(profiles, id, fallback = "#ff6fa8") {
  return profiles.find((profile) => profile.id === id)?.color || fallback;
}

function isCompletedCard(card) {
  return Boolean(card?.completion?.allDone);
}

function isArchivedCard(card) {
  return Boolean(card?.archivedAt);
}

function isDailyCheckinCard(card) {
  const tags = Array.isArray(card?.tags) ? card.tags : [];
  return Boolean(
    card?.itemType === "checkin" &&
    (card?.repeatRule === "daily@03:00" || tags.includes("daily-checkin-card") || card?.title === "一起打卡！")
  );
}

function isRoutineLifeCard(card) {
  if (!card) return false;
  return isDailyCheckinCard(card) ||
    card.sourceType === "checkin" ||
    card.itemType === "habit" ||
    (card.itemType === "checkin" && Boolean(card.repeatRule));
}

function canCurrentUserCompleteCard(card, currentUser) {
  const userId = currentUser?.id || "";
  if (!card || !userId) return false;
  const participants = Array.isArray(card.participants) ? card.participants : [];
  return card.ownerId === "shared" || card.ownerId === userId || participants.includes(userId);
}

function completionTargetUserId(card, currentUser) {
  const userId = currentUser?.id || "";
  if (!card || !userId) return "";
  if (canCurrentUserCompleteCard(card, currentUser)) return userId;
  const participants = Array.isArray(card.participants) ? card.participants : [];
  if (card.ownerId && card.ownerId !== "shared") return card.ownerId;
  return participants.find((id) => id && id !== userId) || participants[0] || "";
}

function isCardDoneForUser(card, userId) {
  if (!card || !userId) return isCompletedCard(card);
  return card.statusByUser?.[userId] === "done" || (!card.statusByUser?.[userId] && isCompletedCard(card));
}

function userDisplayName(id, profiles, fallback = "对方") {
  return profiles.find((profile) => profile.id === id)?.displayName || fallback;
}

function proxyActionMeta(card, currentUser, profiles) {
  const targetUserId = completionTargetUserId(card, currentUser);
  const isProxy = Boolean(targetUserId && targetUserId !== currentUser?.id);
  const targetName = isProxy ? userDisplayName(targetUserId, profiles, "对方") : "";
  return { targetUserId, isProxy, targetName };
}

function statusRowsForCard(card, profiles, currentUser = null) {
  const participants = Array.isArray(card?.participants) ? card.participants : [];
  const statusByUser = card?.statusByUser || {};
  const updatedBy = card?.statusUpdatedBy || {};
  return participants
    .map((id) => {
      const name = participantShortName(id, profiles, currentUser, id);
      const done = statusByUser[id] === "done";
      const actor = updatedBy[id] && updatedBy[id] !== id ? userDisplayName(updatedBy[id], profiles, updatedBy[id]) : "";
      return `${name}：${done ? "已完成" : "待完成"}${actor ? `（${actor}代点）` : ""}`;
    })
    .filter(Boolean);
}

function stepOwnerIds(step, participants = []) {
  if (step?.ownerId) return [step.ownerId].filter(Boolean);
  return participants.length ? participants : [];
}

function participantShortName(id, profiles, currentUser = null, fallback = "对方") {
  if (id && id === currentUser?.id) return "我";
  return userDisplayName(id, profiles, fallback);
}

function stepOwnerLabel(step, profiles, participants = [], currentUser = null) {
  const ids = stepOwnerIds(step, participants);
  if (!step?.ownerId && ids.length > 1) return "共同";
  const id = ids[0] || "";
  if (!id) return "共同";
  return id === currentUser?.id ? "我" : userDisplayName(id, profiles, "对方");
}

function stepStateLabel(step, profiles, participants = [], currentUser = null) {
  if (step?.status === "done") return "已完成";
  const ids = stepOwnerIds(step, participants);
  if (!step?.ownerId && ids.length > 1) {
    return `待${ids.map((id) => participantShortName(id, profiles, currentUser)).join("、")}完成`;
  }
  const id = ids[0] || "";
  if (!id || id === currentUser?.id) return "待我完成";
  return `待${userDisplayName(id, profiles, "对方")}完成`;
}

function timeOnlyLabel(value) {
  const match = String(value || "").match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function completionTimeLabel(value, selectedDate) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return compactDateTime(value);
  return match[1] === selectedDate ? `${match[2]}:${match[3]}` : `${shortDate(match[1])} ${match[2]}:${match[3]}`;
}

function taskDateLabel(date, selectedDate) {
  if (!date) return "";
  if (date === selectedDate) return "当天";
  if (date === today()) return "今天";
  return shortDate(date);
}

function isDefaultPromptCard(card) {
  return isDefaultPromptText(card?.title) && (!card?.itemType || card.itemType === "thing");
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

function memorySurfaceKey(item) {
  const kind = item?.kind || "";
  if (kind === "wish" || kind === "goal" || kind === "purchase" || item?.itemType === "date") return "plans";
  if (kind === "anniversary" || kind === "memory" || kind === "gratitude" || kind === "promise") return "dates";
  return "profile";
}

function memorySurfaceDef(key) {
  return memorySurfaceDefs.find((item) => item.key === key) || memorySurfaceDefs[1];
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

function actorName(id, profiles, fallback = "系统") {
  return namesForIds([id].filter(Boolean), profiles) || fallback;
}

function lifeCardAudit(card, profiles) {
  const createdAt = compactDateTime(card?.createdAt);
  const updatedAt = compactDateTime(card?.updatedAt);
  const createdBy = actorName(card?.createdBy, profiles);
  const updatedBy = actorName(card?.updatedBy, profiles);
  const edited = Boolean(updatedAt && (card?.updatedBy !== card?.createdBy || card?.updatedAt !== card?.createdAt));
  return {
    created: createdAt ? `创建 ${createdAt}` : "",
    editor: edited ? `${updatedBy}编辑` : createdBy,
  };
}

function detailRows(rows) {
  return rows.filter((row) => row && row.value);
}

function captureDecisionMeta(decision) {
  return captureDecisionLabels[decision] || captureDecisionLabels.capture;
}

function memoryKindText(kinds, fallback = "") {
  const values = (Array.isArray(kinds) ? kinds : [kinds])
    .map((kind) => memoryKindLabels[kind] || "")
    .filter(Boolean);
  return values.length ? [...new Set(values)].join(" · ") : fallback;
}

function lifeCardDisplayTitle(card, fallback = "记录") {
  if (isDailyCheckinCard(card)) return "打卡";
  return lifeCardSurfaceText(displayCardTitle(card?.title || card?.sourceCaptureSummary || fallback), fallback);
}

function compactCheckinItemTitle(value) {
  const text = cleanCardText(value || "")
    .replace(/^确定/, "")
    .replace(/^进行/, "")
    .replace(/^完成(?:今日)?/, "")
    .replace(/^今日/, "")
    .trim();
  if (/体育锻炼|运动|锻炼/.test(text)) return "运动";
  return shortText(text || value, 12);
}

function dailyCheckinItems(card) {
  return (Array.isArray(card?.steps) ? card.steps : [])
    .map((step) => compactCheckinItemTitle(step?.title || step))
    .filter(Boolean);
}

function dailyCheckinSummary(card, fallback = "打卡") {
  const items = dailyCheckinItems(card);
  if (!items.length) return fallback;
  const visible = items.slice(0, 3);
  return `${visible.join(" · ")}${items.length > visible.length ? ` +${items.length - visible.length}` : ""}`;
}

function dailyCheckinProgressText(card) {
  const participants = Array.isArray(card?.participants) ? card.participants : [];
  if (!participants.length) return statusText(card) || "";
  const done = participants.filter((id) => isCardDoneForUser(card, id)).length;
  if (done === participants.length) return "都打卡了";
  if (!done) return "还没打卡";
  return `${done}/${participants.length} 已打卡`;
}

function completionSummaryForCard(card, profiles, currentUser = null) {
  const participants = Array.isArray(card?.participants) ? card.participants : [];
  if (!participants.length) return statusText(card) || card?.statusLabel || "";
  const updatedBy = card?.statusUpdatedBy || {};
  const isCheckin = isDailyCheckinCard(card) || card?.itemType === "checkin";
  return participants
    .map((id) => {
      const name = userDisplayName(id, profiles, participantShortName(id, profiles, currentUser, id));
      const done = isCardDoneForUser(card, id);
      const actor = updatedBy[id] && updatedBy[id] !== id ? userDisplayName(updatedBy[id], profiles, updatedBy[id]) : "";
      return `${name}${done ? (isCheckin ? "已打卡" : "已完成") : (isCheckin ? "未打卡" : "未完成")}${actor ? `（${actor}代点）` : ""}`;
    })
    .join(" · ");
}

function nextUpPeopleLabel(card, profiles, currentUser = null) {
  const participants = cardParticipantIds(card, profiles, currentUser);
  if (!participants.length) return statusText(card) || "";
  const pending = participants.filter((id) => !isCardDoneForUser(card, id));
  if (!pending.length) return "都完成了";
  return pending
    .map((id) => id === currentUser?.id ? "等我" : `等${participantShortName(id, profiles, currentUser, "对方")}`)
    .join(" · ");
}

function lifeCardUpsertEndpoint(card) {
  return {
    schedule: "/api/couple/schedule/upsert",
    todo: "/api/couple/todos/upsert",
    deadline: "/api/couple/deadlines/upsert",
  }[card?.sourceType] || "";
}

function canPatchLifeCard(card) {
  return Boolean(card && !card.readOnly && !card.isDraft && lifeCardUpsertEndpoint(card));
}

function lifeCardPatchPayload(card, profiles, patch = {}) {
  const nextDate = patch.date || card.date || today();
  const ownerId = patch.ownerId || card.ownerId || "shared";
  const fallbackParticipants = ownerId === "shared"
    ? (Array.isArray(card.participants) && card.participants.length ? card.participants : profiles.map((profile) => profile.id))
    : [ownerId];
  const participants = Array.isArray(patch.participants) && patch.participants.length
    ? patch.participants
    : fallbackParticipants;
  const plannedAt = patch.plannedAt !== undefined
    ? patch.plannedAt
    : patch.date && card.plannedAt
      ? redateDateTime(card.plannedAt, nextDate)
      : card.plannedAt || "";
  const dueAt = patch.dueAt !== undefined
    ? patch.dueAt
    : patch.date && card.dueAt
      ? redateDateTime(card.dueAt, nextDate)
      : card.dueAt || "";
  return {
    id: card.sourceId,
    date: nextDate,
    title: patch.title ?? card.title ?? "",
    detail: patch.detail ?? card.detail ?? card.slot ?? "",
    slot: patch.slot ?? card.slot ?? card.detail ?? "",
    itemType: patch.itemType || card.itemType || "thing",
    segment: patch.segment || card.segment || "allDay",
    ownerId,
    participants,
    sourceCaptureId: card.sourceCaptureId || "",
    relatedGroupId: card.relatedGroupId || "",
    parentItemId: card.parentItemId || "",
    relationIds: card.relationIds || [],
    linkedMemoryIds: card.linkedMemoryIds || [],
    repeatRule: patch.repeatRule ?? card.repeatRule ?? "",
    plannedAt,
    dueAt,
    durationMin: patch.durationMin ?? card.durationMin ?? 0,
    tags: normalizeEditableTags(patch.tags ?? card.tags ?? []),
    memoryKinds: card.memoryKinds || [],
    steps: patch.steps || card.steps || [],
    timeBlocks: patch.timeBlocks || card.timeBlocks || [],
    bucket: patch.bucket || card.bucket || (nextDate > today() ? "future" : "today"),
    priority: patch.priority || card.priority || "normal",
    manualOrder: patch.manualOrder ?? card.manualOrder ?? 0,
  };
}

function compactLifeCardRow(card, context, activeId = "") {
  const itemType = card.itemType && itemTypeLabels[card.itemType] ? card.itemType : "thing";
  return {
    id: card.id,
    title: cleanCardText(lifeCardDisplayTitle(card)),
    subtitle: [shortDate(card.date), primaryTimeLabel(card), itemTypeLabels[itemType]].filter(Boolean).join(" · "),
    ownerIds: cardParticipantIds(card, context.profiles, context.currentUser),
    active: card.id === activeId,
    action: { type: "open-detail", detailType: "lifeCard", payload: card },
  };
}

function contextLifeCard(context, sourceType, sourceId) {
  const cards = Array.isArray(context.cards) ? context.cards : [];
  const typedId = `${sourceType}-${sourceId}`;
  return cards.find((item) =>
    item.id === typedId ||
    (item.sourceType === sourceType && item.sourceId === sourceId)
  );
}

function relationLifeCardRow(link, context, activeId = "") {
  const card = contextLifeCard(context, link.sourceType, link.sourceId);
  if (card) {
    const row = compactLifeCardRow(card, context, activeId);
    const relation = relationLabels[link.relationType] || "相关";
    return {
      ...row,
      subtitle: [relation, row.subtitle].filter(Boolean).join(" · "),
    };
  }
  return {
    id: `${link.sourceType || "card"}-${link.sourceId || link.title}`,
    title: lifeCardSurfaceText(link.title || "相关生活卡", "相关生活卡"),
    subtitle: [relationLabels[link.relationType] || "相关", shortDate(link.date), itemTypeLabels[link.itemType]].filter(Boolean).join(" · "),
    ownerIds: [],
    active: false,
    action: null,
  };
}

function memoryLinkRow(item, context) {
  const row = memoryRow(item, context);
  return {
    ...row,
    subtitle: [memoryKindLabels[item.kind] || row.subtitle, item.suggestedDate ? shortDate(item.suggestedDate) : ""].filter(Boolean).join(" · "),
    action: { type: "open-detail", detailType: "memoryItem", payload: item },
  };
}

function lifeCardDetailSections(card, context) {
  const cards = Array.isArray(context.cards) ? context.cards.filter((item) => !isDefaultPromptCard(item)) : [];
  const relationRows = (Array.isArray(card.relations) ? card.relations : [])
    .map((item) => relationLifeCardRow(item, context, card.id))
    .filter((row) => row.title)
    .slice(0, 8);
  const memoryRows = (Array.isArray(card.memoryLinks) ? card.memoryLinks : [])
    .map((item) => memoryLinkRow(item, context))
    .filter((row) => row.title)
    .slice(0, 6);
  if (!cards.length && !relationRows.length && !memoryRows.length) return [];
  const anchorDate = card.date || context.selectedDate || today();
  const sameDayCards = sortCards(cards
    .filter((item) => !isArchivedCard(item))
    .filter((item) => item.date === anchorDate));
  const futureTodoCards = sortCards(cards
    .filter((item) => !isArchivedCard(item) && !isCompletedCard(item))
    .filter((item) => item.sourceType === "todo")
    .filter((item) => String(item.date || "") > anchorDate || item.bucket === "future")
    .filter((item) => item.id !== card.id))
    .slice(0, 5);
  return [
    memoryRows.length ? {
      title: "长期记忆",
      rows: memoryRows,
    } : null,
    relationRows.length ? {
      title: "关联",
      rows: relationRows,
    } : null,
    sameDayCards.length ? {
      title: shortDate(anchorDate) || "同日",
      rows: sameDayCards.map((item) => compactLifeCardRow(item, context, card.id)),
    } : null,
    futureTodoCards.length ? {
      title: "接下来",
      rows: futureTodoCards.map((item) => compactLifeCardRow(item, context, card.id)),
    } : null,
  ].filter(Boolean);
}

const detailBuilders = {
  lifeCard(card, context) {
    const { profiles, currentUser } = context;
    const itemType = card.itemType && itemTypeLabels[card.itemType] ? card.itemType : "thing";
    const participants = cardParticipantIds(card, profiles, currentUser);
    const title = lifeCardDisplayTitle(card);
    const readOnly = card.readOnly || card.sourceType === "insight";
    const stepStatus = card.stepProgress?.total ? `${card.stepProgress.done}/${card.stepProgress.total}` : "";
    const isDone = isCompletedCard(card);
    const isArchived = isArchivedCard(card);
    const { targetUserId, isProxy, targetName } = proxyActionMeta(card, currentUser, profiles);
    const targetDone = targetUserId ? isCardDoneForUser(card, targetUserId) : isDone;
    const timerActive = Boolean(card.timeTracking?.currentUserActive);
    const isDailyCheckin = isDailyCheckinCard(card);
    const detail = lifeCardSurfaceText(isDailyCheckin ? dailyCheckinSummary(card) : summaryLine(card) || cleanCardText(card.detail || card.slot || ""), "");
    const peerCheckinCards = card.sourceType === "checkin"
      ? (Array.isArray(context.cards) ? context.cards : [])
          .filter((item) => item.sourceType === "checkin" && item.date === card.date)
      : [];
    const rawSteps = card.sourceType === "checkin"
      ? (peerCheckinCards.length ? peerCheckinCards : [card]).map((item) => ({
          id: `checkin-item-${item.sourceId || item.id}`,
          title: displayCardTitle(item.title || item.sourceCaptureSummary || "打卡项"),
          ownerId: "",
          status: item.completion?.allDone ? "done" : "todo",
        }))
      : (Array.isArray(card.steps) ? card.steps : []);
    const steps = rawSteps
      .map((step) => {
        const ownerIds = stepOwnerIds(step, participants);
        const state = isDailyCheckin ? "打卡项" : stepStateLabel(step, profiles, participants, currentUser);
        const owner = isDailyCheckin ? "" : stepOwnerLabel(step, profiles, participants, currentUser);
        return {
          id: step.id || step.title,
          title: cleanCardText(step.title || ""),
          done: isDailyCheckin ? false : step.status === "done",
          ownerIds: isDailyCheckin ? [] : ownerIds,
          owner,
          state,
          hint: durationLabel(step.estimateMin),
          action: !isDailyCheckin && !readOnly && card.sourceType !== "checkin" && (!step.ownerId || step.ownerId === currentUser?.id || step.ownerId === targetUserId)
            ? { type: "toggle-step", card, step }
            : null,
        };
      })
      .filter((step) => step.title);
    const hasMemory = Boolean(memoryKindText(card.memoryKinds) || card.memoryLinks?.length);
    const participantLine = namesForIds(participants, profiles);
    const completionLine = completionSummaryForCard(card, profiles, currentUser);
    const statusValue = isDailyCheckin ? dailyCheckinProgressText(card) : stepStatus || statusText(card) || card.statusLabel;
    const timeValue = primaryTimeLabel(card);
    const repeatValue = card.repeatRule ? repeatRuleLabel(card.repeatRule) : "";
    const canQuickPatch = canPatchLifeCard(card) && !isArchived && !isDailyCheckin;
    const quickMoveDate = card.date === today() ? addDays(card.date, 1) : today();
    const quickMoveLabel = card.date === today() ? "明天" : "本日";
    const primaryActionLabel = isDailyCheckin || itemType === "checkin"
      ? (targetDone ? "取消打卡" : isProxy ? `帮${targetName}打卡` : isDailyCheckin ? "我打卡" : "打卡")
      : (targetDone ? "取消" : isProxy ? `帮${targetName}完成` : "完成");
    return {
      type: "lifeCard",
      label: itemTypeLabels[itemType],
      title,
      body: detail,
      date: detailDateLabel(card.date),
      ownerIds: participants,
      chips: (isDailyCheckin
        ? [
            { label: "参与", value: participantLine },
            { label: "状态", value: statusValue },
          ]
        : [
            { label: "时间", value: timeValue },
            { label: "状态", value: statusValue },
            repeatValue ? { label: "周期", value: repeatValue } : null,
            card.priority === "high" ? { label: "重要", value: "已标记" } : null,
          ]).filter((item) => item && item.value),
      rows: detailRows([
        completionLine && participants.length > 1 ? { label: isDailyCheckin ? "打卡情况" : "双人进度", value: completionLine, wide: true } : null,
        card.nextStep?.title && !steps.length ? { label: "下一步", value: card.nextStep.title, wide: true } : null,
      ]),
      moreRows: detailRows([
        { label: "类型", value: itemTypeLabels[itemType] },
        { label: "参与", value: participantLine || ownerLabel(card.ownerId, currentUser) },
        isDailyCheckin ? { label: "刷新", value: repeatValue || timeValue } : null,
        card.plannedAt ? { label: "开始", value: lifeCardDateTimeLabel(card.plannedAt, card.date) } : null,
        card.dueAt ? { label: "截止", value: lifeCardDateTimeLabel(card.dueAt, card.date) } : null,
        card.durationMin ? { label: "预计", value: durationLabel(card.durationMin) } : null,
        card.stepProgress?.total ? { label: "步骤", value: `${card.stepProgress.done}/${card.stepProgress.total}` } : null,
        repeatValue ? { label: "周期", value: repeatValue } : null,
        card.priority === "high" ? { label: "优先级", value: "重要" } : null,
      ]),
      steps,
      stepsLabel: isDailyCheckin ? "打卡项" : "步骤",
      sections: [],
      moreSections: lifeCardDetailSections(card, context),
      images: [],
      actions: [
        !readOnly && !isArchived && targetUserId ? { type: "toggle-card", icon: targetDone ? "undo" : "check", label: primaryActionLabel, card } : null,
        !readOnly && !isArchived && !card.isDraft && card.sourceType !== "checkin" && !isDailyCheckin ? { type: "timer-card", icon: timerActive ? "stop" : "clock", label: timerActive ? "停止" : "计时", card } : null,
        canQuickPatch ? { type: "set-card-priority", icon: "star", label: card.priority === "high" ? "普通" : "重要", card, priority: card.priority === "high" ? "normal" : "high" } : null,
        !isDailyCheckin && !readOnly && ["schedule", "todo"].includes(card.sourceType) ? { type: "archive-card", icon: isArchived ? "undo" : "archive", label: isArchived ? "恢复" : "归档", card } : null,
        !readOnly ? { type: "edit-card", icon: "edit", label: "编辑", card } : null,
      ].filter(Boolean),
      moreActions: [
        canQuickPatch ? { type: "move-card-date", icon: "calendar", label: quickMoveLabel, card, date: quickMoveDate } : null,
        !readOnly && !card.isDraft ? { type: "remember-card", icon: "bookmark", label: hasMemory ? "已记" : "记忆", card } : null,
        card.date ? { type: "go-date", icon: "calendar", label: "月历", date: card.date, page: "month" } : null,
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
      date: detailDateLabel(item.source === "profile" ? "" : item.suggestedDate),
      ownerIds,
      chips: [
        { label: "分组", value: lane },
        { label: "对象", value: namesForIds(ownerIds, profiles) },
        { label: "来源", value: sourceLabel(item.source) },
      ].filter((part) => part.value),
      rows: detailRows([
        item.actionable ? { label: "可行动", value: itemTypeLabels[item.itemType] || "提醒" } : null,
        item.source !== "profile" && item.suggestedDate ? { label: "建议日期", value: item.suggestedDate } : null,
      ]),
      images: [],
      actions: [
        item.source !== "profile" && item.suggestedDate ? { type: "go-date", icon: "calendar", label: "打开日期", date: item.suggestedDate, page: "month" } : null,
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
      date: detailDateLabel(capture.date),
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
    const actorIds = [...new Set([
      ...Object.values(item?.statusUpdatedBy || {}),
      item?.updatedBy,
      item?.createdBy,
    ].filter(Boolean))];
    const ownerIds = item?.doneUsers?.length
      ? item.doneUsers
      : actorIds.length
        ? actorIds
        : item?.participants?.length ? item.participants : [item?.ownerId, item?.targetUserId].filter(Boolean);
    const title = cleanCardText(item?.title || item?.text || item?.kindLabel || status);
    const body = cleanStoryText(item?.detail || item?.sourceText || item?.text || "");
    return {
      type: "summaryItem",
      label: item?.kindLabel || item?.kind || status,
      title: title || status,
      body,
      date: detailDateLabel(item?.date),
      ownerIds,
      chips: [
        item?.doneUsers?.length ? { label: "完成", value: namesForIds(item.doneUsers, context.profiles) } : null,
        item?.pendingUsers?.length ? { label: "待推进", value: namesForIds(item.pendingUsers, context.profiles) } : null,
        actorIds.length ? { label: "操作", value: namesForIds(actorIds, context.profiles) } : null,
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
      date: detailDateLabel(context.selectedDate),
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
  const manualOrder = (card) => Number(card.manualOrder || 0);
  const lifecycleRank = (card) => isArchivedCard(card) ? 2 : isCompletedCard(card) ? 1 : 0;
  const routineRank = (card) => isRoutineLifeCard(card) ? 0 : 1;
  return [...cards].sort((a, b) => {
    const timeA = cardTimelineSlot(a);
    const timeB = cardTimelineSlot(b);
    return String(a.date || "").localeCompare(String(b.date || "")) ||
    timeA.bucket - timeB.bucket ||
    timeA.minutes - timeB.minutes ||
    routineRank(a) - routineRank(b) ||
    (timeA.bucket === timeB.bucket && timeA.minutes === timeB.minutes && (manualOrder(a) || manualOrder(b)) ? (manualOrder(a) || 1000000) - (manualOrder(b) || 1000000) : 0) ||
    lifecycleRank(a) - lifecycleRank(b) ||
    Number(a.sourceType === "insight") - Number(b.sourceType === "insight") ||
    String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  });
}

function dateTimeSortParts(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    date: match[1],
    minutes: Number(match[2]) * 60 + Number(match[3]),
  };
}

function timeLabelMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesLabel(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function hasExplicitAllDay(card) {
  const text = `${card?.title || ""} ${card?.detail || ""} ${card?.slot || ""} ${card?.timeLabel || ""} ${card?.repeatRule || ""}`;
  return card?.segment === "allDay" ||
    card?.sourceType === "checkin" ||
    card?.itemType === "habit" ||
    Boolean(card?.repeatRule) ||
    /全天|整天|每天|每日/.test(text);
}

function cardTimelineSlot(card) {
  const date = String(card?.date || today());
  const planned = dateTimeSortParts(card?.plannedAt);
  if (planned?.date === date) return { group: "timed", label: minutesLabel(planned.minutes), bucket: 1, minutes: planned.minutes };
  const labelMinutes = timeLabelMinutes(card?.timeLabel);
  if (labelMinutes !== null) return { group: "timed", label: minutesLabel(labelMinutes), bucket: 1, minutes: labelMinutes };
  const due = dateTimeSortParts(card?.dueAt);
  if (due?.date === date) return { group: "deadline", label: `截止 ${minutesLabel(due.minutes)}`, bucket: 2, minutes: due.minutes };
  if (hasExplicitAllDay(card)) return { group: "all-day", label: "全天", bucket: 0, minutes: 0 };
  const segmentMinutes = { morning: 9 * 60, noon: 12 * 60 + 30, afternoon: 15 * 60, evening: 19 * 60 + 30 };
  if (Object.prototype.hasOwnProperty.call(segmentMinutes, card?.segment)) return { group: "segment", label: segmentLabels[card.segment], bucket: 1, minutes: segmentMinutes[card.segment] };
  return { group: "unscheduled", label: "待安排", bucket: 3, minutes: 0 };
}

function groupCardsByTimelineSlot(cards) {
  const groups = [];
  cards.forEach((card) => {
    const slot = cardTimelineSlot(card);
    const key = `${slot.group}-${slot.label}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.cards.push(card);
      return;
    }
    groups.push({ key, slot, cards: [card] });
  });
  return groups;
}

function isPriorityPinnedCard(card) {
  return !isArchivedCard(card) && !isCompletedCard(card) && (
    isRoutineLifeCard(card) ||
    card?.priority === "high" ||
    card?.rankLane === "overdue" ||
    lifeCardAgeNotice(card)?.level === "strong"
  );
}

function priorityPinLabel(card) {
  if (isRoutineLifeCard(card)) return isDailyCheckinCard(card) ? "日常" : card?.itemType === "habit" ? "习惯" : "打卡";
  if (card?.rankLane === "overdue" || lifeCardAgeNotice(card)?.level === "strong") return "已过期";
  return "重要";
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

function errorMessage(err, fallback = "操作失败") {
  return err?.message || fallback;
}

export function App() {
  const [page, setPage] = useHashRoute();
  const [selectedDate, setSelectedDate] = useState(today());
  const now = useMinuteNow();
  const [bootstrap, setBootstrap] = useState(null);
  const [data, setData] = useState(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [agentJob, setAgentJob] = useState(null);
  const [filter, setFilter] = useState("all");
  const [timelineScope, setTimelineScope] = useState("today");
  const [expanded, setExpanded] = useState(() => new Set());
  const [editingCard, setEditingCard] = useState(null);
  const [detailRequest, setDetailRequest] = useState(null);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const composingRef = useRef(false);
  const confirmResolverRef = useRef(null);

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

  const waitForJob = useCallback(async (jobId) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const result = await request(`/api/jobs/${encodeURIComponent(jobId)}`);
      const job = result?.job;
      if (job?.status === "completed") return job.result;
      if (job?.status === "failed") {
        throw new Error(job.error || "Agent 分析失败");
      }
      await new Promise((resolve) => window.setTimeout(resolve, attempt < 8 ? 650 : 1200));
    }
    throw new Error("Agent 分析超时");
  }, [request]);

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
  const catNotice = useMemo(() => buildCatNotice(now, 0, data), [now, data]);
  const showDeepNightNotice = data && catNotice.period === "deepNight" && page !== "cat-note";
  const detailContext = useMemo(() => ({
    profiles,
    currentUser,
    selectedDate,
    cards: data?.scheduleItemCards || [],
  }), [profiles, currentUser, selectedDate, data?.scheduleItemCards]);
  const activeDetail = useMemo(() => {
    if (!detailRequest) return null;
    return buildDetail(detailRequest.type, detailRequest.payload, detailContext);
  }, [detailRequest, detailContext]);

  function navigate(nextPage) {
    setPage(nextPage);
    window.location.hash = nextPage;
  }

  const resolveConfirm = useCallback((accepted) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmRequest(null);
    resolver?.(accepted);
  }, []);

  const askConfirmation = useCallback((options = {}) => new Promise((resolve) => {
    if (confirmResolverRef.current) confirmResolverRef.current(false);
    confirmResolverRef.current = resolve;
    setConfirmRequest({
      title: options.title || "确认操作？",
      body: options.body || "",
      confirmLabel: options.confirmLabel || "确认",
      cancelLabel: options.cancelLabel || "取消",
      tone: options.tone || "default",
      icon: options.icon || "check",
    });
  }), []);

  useEffect(() => () => {
    if (confirmResolverRef.current) confirmResolverRef.current(false);
  }, []);

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
        toast.success("已进入猫猫日记本");
      }
    } catch (err) {
      const message = err.message === "invalid login or password" ? "访问码不对。" : errorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await request("/api/couple/logout", { method: "POST", body: {} });
      setData(null);
      setConfirmation(null);
      toast.success("已退出");
      loadSession();
    } catch (err) {
      toast.error(errorMessage(err, "退出失败"));
    }
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

  function refreshDetailCardFromState(state, card) {
    if (!state || !card?.id) return;
    const nextCard = state.scheduleItemCards?.find((item) => item.id === card.id);
    if (!nextCard) return;
    setDetailRequest((current) => current?.type === "lifeCard" && current.payload?.id === card.id
      ? { type: "lifeCard", payload: nextCard }
      : current);
  }

  function startAgentJob(jobId, meta = {}) {
    if (!jobId) return;
    setAgentJob({
      id: jobId,
      status: "running",
      captureId: meta.captureId || "",
      text: meta.text || "",
      date: meta.date || selectedDate,
      startedAt: Date.now(),
    });
    waitForJob(jobId)
      .then((result) => {
        if (result?.state) {
          setData(result.state);
          setSelectedDate(result.state.selectedDate || selectedDate);
        }
        setConfirmation(result?.confirmation || null);
        setAgentJob(null);
        toast.success(result?.confirmation ? "Agent 分析完成" : "Agent 已更新日记本");
      })
      .catch((err) => {
        setAgentJob({
          id: jobId,
          status: "failed",
          captureId: meta.captureId || "",
          text: meta.text || "",
          date: meta.date || selectedDate,
          error: err.message,
        });
        toast.error(errorMessage(err, "Agent 分析失败"));
      });
  }

  async function retryAgentJob(job = agentJob) {
    if (!job?.captureId) return;
    setBusy(true);
    setError("");
    try {
      const analyzed = await request("/api/couple/capture/analyze", {
        method: "POST",
        body: {
          captureId: job.captureId,
          text: job.text || "",
          date: job.date || selectedDate,
          ownerId: currentUser?.id || "",
          analysisMode: "agent",
        },
      });
      if (analyzed?.jobId) {
        startAgentJob(analyzed.jobId, {
          captureId: job.captureId,
          text: job.text,
          date: job.date || selectedDate,
        });
      } else {
        setConfirmation(analyzed?.confirmation || null);
        setAgentJob(null);
      }
    } catch (err) {
      setAgentJob((current) => ({
        ...(current || job),
        status: "failed",
        error: err.message,
      }));
      toast.error(errorMessage(err, "Agent 重试失败"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDetailAction(action) {
    if (!action) return;
    if (action.type === "toggle-card" && action.card) {
      await toggleCard(action.card);
      return;
    }
    if (action.type === "archive-card" && action.card) {
      await archiveCard(action.card);
      return;
    }
    if (action.type === "move-card-date" && action.card && action.date) {
      await moveCardDate(action.card, action.date);
      return;
    }
    if (action.type === "set-card-priority" && action.card && action.priority) {
      await setCardPriority(action.card, action.priority);
      return;
    }
    if (action.type === "timer-card" && action.card) {
      await toggleCardTimer(action.card);
      return;
    }
    if (action.type === "remember-card" && action.card) {
      await rememberCard(action.card);
      return;
    }
    if (action.type === "toggle-step" && action.card && action.step) {
      await toggleCardStep(action.card, action.step);
      return;
    }
    if (action.type === "edit-card" && action.card) {
      setDetailRequest(null);
      setEditingCard(action.card);
      return;
    }
    if (action.type === "open-detail" && action.detailType && action.payload) {
      setDetailRequest({ type: action.detailType, payload: action.payload });
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
    const text = composerText.trim() || (assets.length ? "图片随手记" : "");
    if (!text) return false;
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
      if (!captureResult) return false;
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
        if (mode === "agent" && analyzed?.jobId) {
          setConfirmation(null);
          toast.message("Agent 正在分析", { description: "完成后会自动更新页面。" });
          startAgentJob(analyzed.jobId, {
            captureId: captureResult.capture.id,
            text,
            date: selectedDate,
          });
        } else {
          setConfirmation(analyzed?.confirmation || null);
        }
      } else {
        setConfirmation(null);
        toast.success("已保存随手记");
      }
      setComposerText("");
      return true;
    } catch (err) {
      const message = errorMessage(err, "保存失败");
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitConfirmation(event, routeOverride) {
    event?.preventDefault?.();
    const route = routeOverride || confirmation;
    if (!route) return;
    setBusy(true);
    try {
      const result = await request("/api/couple/capture/route", {
        method: "POST",
        body: {
          ...route,
          ownerId: route.ownerId || currentUser?.id || "",
          sourceCaptureId: route.sourceCaptureId || route.captureId,
        },
      });
      if (result) {
        setData(result.state);
        setSelectedDate(route.date || selectedDate);
        if (route.decision === "schedule") setFilter("all");
        setConfirmation(null);
        toast.success(route.decision === "schedule" ? "已加入生活卡" : "已保存");
      }
    } catch (err) {
      const message = errorMessage(err, "保存失败");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCardStep(card, step) {
    if (!currentUser || !card || !step || card.readOnly || card.sourceType === "insight" || card.sourceType === "checkin") return;
    const targetUserId = step.ownerId || currentUser.id;
    const isProxy = Boolean(targetUserId && targetUserId !== currentUser.id);
    if (isProxy) {
      const targetName = actorName(targetUserId, profiles, "对方");
      const actionText = step.status === "done" ? "取消完成" : "完成";
      const accepted = await askConfirmation({
        title: `帮 ${targetName} ${actionText}这一步？`,
        body: `这会把 ${targetName} 的这一步记为由 ${currentUser?.displayName || "你"} 操作。`,
        confirmLabel: `确认${actionText}`,
        cancelLabel: "先不动",
        tone: "proxy",
        icon: "users",
      });
      if (!accepted) return;
    }
    const result = await request("/api/couple/life-cards/step-toggle", {
      method: "POST",
      body: {
        sourceType: card.sourceType,
        id: card.sourceId,
        stepId: step.id,
        targetUserId,
        proxyConfirmed: isProxy,
        date: card.date,
      },
    });
    if (result) {
      setData(result.state);
      refreshDetailCardFromState(result.state, card);
      toast.success(step.status === "done" ? "已恢复步骤" : "已完成步骤");
    }
  }

  async function toggleCardTimer(card) {
    if (!currentUser || !card || card.readOnly || card.sourceType === "insight" || card.isDraft) return;
    const result = await request("/api/couple/life-cards/timer-toggle", {
      method: "POST",
      body: {
        sourceType: card.sourceType,
        id: card.sourceId,
        date: card.date,
      },
    });
    if (result) {
      setData(result.state);
      refreshDetailCardFromState(result.state, card);
      toast.success(card.timeTracking?.currentUserActive ? "已停止计时" : "已开始计时");
    }
  }

  async function toggleCard(card) {
    if (!currentUser || card.readOnly || card.sourceType === "insight") return;
    const targetUserId = completionTargetUserId(card, currentUser);
    if (!targetUserId) return;
    const isProxy = targetUserId !== currentUser.id;
    const wasCompleted = isCardDoneForUser(card, targetUserId);
    if (isProxy) {
      const targetName = actorName(targetUserId, profiles, "对方");
      const actionText = wasCompleted ? "取消完成" : "完成";
      const accepted = await askConfirmation({
        title: `帮 ${targetName} ${actionText}这张卡？`,
        body: `这会把 ${targetName} 的完成状态记为由 ${currentUser?.displayName || "你"} 操作。`,
        confirmLabel: `确认${actionText}`,
        cancelLabel: "先不动",
        tone: "proxy",
        icon: "users",
      });
      if (!accepted) return;
    }
    const endpoint = {
      schedule: "/api/couple/schedule/toggle",
      todo: "/api/couple/todos/toggle",
      checkin: "/api/couple/checkins/toggle",
      deadline: "/api/couple/deadlines/toggle",
    }[card.sourceType];
    if (!endpoint) return;
    const result = await request(endpoint, {
      method: "POST",
      body: { id: card.sourceId, targetUserId, proxyConfirmed: isProxy, date: card.date, status: wasCompleted ? "todo" : "done" },
    });
    if (result) {
      setData(result.state);
      refreshDetailCardFromState(result.state, card);
      if (wasCompleted) setFilter("all");
      toast.success(isDailyCheckinCard(card) || card.itemType === "checkin" ? (wasCompleted ? "已取消打卡" : "已打卡") : (wasCompleted ? "已恢复待办" : "已完成"));
    }
  }

  async function saveLifeCardPatch(card, patch = {}, options = {}) {
    const endpoint = lifeCardUpsertEndpoint(card);
    if (!endpoint) return null;
    const body = lifeCardPatchPayload(card, profiles, patch);
    const result = await request(endpoint, { method: "POST", body });
    if (result) {
      setData(result.state);
      refreshDetailCardFromState(result.state, card);
      if (options.selectDate) setSelectedDate(body.date);
      if (options.message) toast.success(options.message);
    }
    return result;
  }

  async function moveCardDate(card, date, options = {}) {
    if (!canPatchLifeCard(card) || !date) return;
    const label = date === today() ? "本日" : date === addDays(today(), 1) ? "明天" : shortDate(date);
    const result = await saveLifeCardPatch(card, { date }, {
      selectDate: options.selectDate,
      message: options.silent ? "" : `已移到${label}`,
    });
    if (result && options.selectDate) setTimelineScope("today");
  }

  async function moveCardsDate(cards, date) {
    const movable = (cards || []).filter(canPatchLifeCard);
    if (!movable.length || !date) return;
    let moved = 0;
    for (const card of movable) {
      // Keep the local state synced after each backend write; the card list is small here.
      const result = await saveLifeCardPatch(card, { date }, { silent: true, selectDate: moved === movable.length - 1 });
      if (result) moved += 1;
    }
    if (moved) {
      setTimelineScope("today");
      setFilter("all");
      toast.success(`已顺延 ${moved} 张生活卡`);
    }
  }

  async function setCardPriority(card, priority) {
    if (!canPatchLifeCard(card)) return;
    await saveLifeCardPatch(card, { priority }, {
      message: priority === "high" ? "已设为重要" : "已恢复普通",
    });
  }

  async function archiveCard(card, options = {}) {
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
    if (result) {
      setData(result.state);
      refreshDetailCardFromState(result.state, card);
      if (isArchivedCard(card)) setFilter("all");
      if (!options.silent) toast.success(isArchivedCard(card) ? "已恢复归档" : "已归档");
    }
  }

  async function archiveCards(cards) {
    const archivable = (cards || []).filter((card) => ["schedule", "todo"].includes(card.sourceType) && !isArchivedCard(card));
    if (!archivable.length) return;
    let archived = 0;
    for (const card of archivable) {
      await archiveCard(card, { silent: true });
      archived += 1;
    }
    toast.success(`已归档 ${archived} 张生活卡`);
  }

  async function rememberCard(card) {
    if (!card || card.readOnly || card.sourceType === "insight" || card.isDraft) return;
    const result = await request("/api/couple/life-cards/remember", {
      method: "POST",
      body: {
        sourceType: card.sourceType,
        id: card.sourceId,
        date: card.date,
      },
    });
    if (result) {
      setData(result.state);
      refreshDetailCardFromState(result.state, card);
      toast.success("已写入记忆");
    }
  }

  async function deleteCard(card) {
    if (!card || card.readOnly || card.sourceType === "insight") return;
    if (card.isDraft) {
      setEditingCard(null);
      return;
    }
    const accepted = await askConfirmation({
      title: "删除这张生活卡？",
      body: lifeCardDisplayTitle(card, "这张卡"),
      confirmLabel: "删除",
      cancelLabel: "保留",
      tone: "danger",
      icon: "trash",
    });
    if (!accepted) return;
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
      toast.success("已删除");
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
      tags: normalizeEditableTags(payload.tags),
      steps: payload.steps || card.steps || [],
      timeBlocks: payload.timeBlocks || card.timeBlocks || [],
      bucket: card.isDraft ? (payload.date > today() ? "future" : "today") : (card.bucket || (payload.date > selectedDate ? "future" : "today")),
      priority: payload.priority || card.priority || "normal",
      manualOrder: card.manualOrder || 0,
      relatedGroupId: card.relatedGroupId || "",
      parentItemId: card.parentItemId || "",
    };
    const result = await request(endpoint, { method: "POST", body });
    if (result) {
      setData(result.state);
      setEditingCard(null);
      toast.success(card.isDraft ? "已创建生活卡" : "已保存修改");
    }
  }

  async function reorderCards(date, orderedCards) {
    const order = (orderedCards || [])
      .filter((card) => card && !card.readOnly && card.sourceType !== "insight" && !card.isDraft)
      .map((card, index) => ({
        sourceType: card.sourceType,
        sourceId: card.sourceId,
        manualOrder: (index + 1) * 1000,
      }));
    if (!date || !order.length) return;
    const result = await request("/api/couple/life-cards/reorder", {
      method: "POST",
      body: { date, order },
    });
    if (result) {
      setData(result.state);
      toast.success("顺序已更新");
    }
  }

  if (!data) {
    return (
      <>
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
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: "peos-toast" }} />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <TopNav page={page} navigate={navigate} profiles={profiles} currentUser={currentUser} now={now} logout={logout} />
        <main className="workspace">
          {showDeepNightNotice ? <NightNoticeBanner notice={catNotice} onOpen={() => navigate("cat-note")} /> : null}
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
              agentJob={agentJob}
              submitConfirmation={submitConfirmation}
              dismissConfirmation={() => setConfirmation(null)}
              retryAgentJob={retryAgentJob}
              clearAgentJob={() => setAgentJob(null)}
              saveRawCapture={saveRawCapture}
              busy={busy}
              error={error}
              filter={filter}
              setFilter={setFilter}
              timelineScope={timelineScope}
              setTimelineScope={setTimelineScope}
              expanded={expanded}
              setExpanded={setExpanded}
              toggleCard={toggleCard}
              archiveCard={archiveCard}
              toggleStep={toggleCardStep}
              toggleTimer={toggleCardTimer}
              moveCardsDate={moveCardsDate}
              archiveCards={archiveCards}
              setCardPriority={setCardPriority}
              setEditingCard={setEditingCard}
              openDetail={openDetail}
              reorderCards={reorderCards}
              composingRef={composingRef}
            />
          )}
          {page === "month" && (
            <MonthPage
              data={data}
              selectedDate={selectedDate}
              chooseDate={chooseDate}
              setPage={navigate}
            />
          )}
          {page === "daily-summary" && (
            <DailySummaryPage data={data} profiles={profiles} currentUser={currentUser} request={request} setData={setData} selectedDate={selectedDate} chooseDate={chooseDate} openDetail={openDetail} />
          )}
          {page === "cat-note" && (
            <CatNoticePage profiles={profiles} currentUser={currentUser} now={now} data={data} request={request} setData={setData} setSelectedDate={setSelectedDate} />
          )}
          {page === "goals" && (
            <MemoryPage data={data} profiles={profiles} currentUser={currentUser} request={request} setData={setData} selectedDate={selectedDate} openDetail={openDetail} />
          )}
          {page === "settings" && (
            <SettingsPage data={data} currentUser={currentUser} profiles={profiles} request={request} setData={setData} selectedDate={selectedDate} />
          )}
        </main>
        <MobileTabBar page={page} navigate={navigate} />
        {editingCard && (
          <CardEditor
            card={editingCard}
            profiles={profiles}
            onClose={() => setEditingCard(null)}
            onSave={saveCardEdit}
            onDelete={() => deleteCard(editingCard)}
            confirmLeave={() => askConfirmation({
              title: "放弃未保存修改？",
              body: "当前编辑内容还没有保存。",
              confirmLabel: "离开",
              cancelLabel: "继续编辑",
              tone: "danger",
              icon: "x",
            })}
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
        <ConfirmDialog request={confirmRequest} onCancel={() => resolveConfirm(false)} onConfirm={() => resolveConfirm(true)} />
      </div>
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: "peos-toast" }} />
    </>
  );
}

function MobileTabBar({ page, navigate }) {
  const items = [
    { id: "dashboard", label: "今天", icon: "rows" },
    { id: "month", label: "月历", icon: "calendar" },
    { id: "daily-summary", label: "日总结", icon: "sparkle" },
    { id: "cat-note", label: "猫猫的话", icon: "star" },
    { id: "goals", label: "记忆", icon: "bookmark" },
  ];
  return (
    <nav className="mobile-tabbar" aria-label="手机导航">
      {items.map((item) => (
        <button
          key={item.id}
          className={cx(page === item.id && "is-active")}
          type="button"
          onClick={() => navigate(item.id)}
          aria-label={item.label}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function LoginScreen({ bootstrap, profiles, login, setLogin, password, setPassword, error, busy, onSubmit }) {
  const title = bootstrap?.space?.name && !/首页|日程/.test(bootstrap.space.name) ? bootstrap.space.name : "猫猫日记本";
  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="login-cats">
          <AvatarPair profiles={profiles} className="avatar-pair-hero hero-pair" />
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
              <CatAvatar profile={profile} className="is-brand" />
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

function TopNav({ page, navigate, profiles, currentUser, now, logout }) {
  const items = [
    { id: "dashboard", label: "猫猫日记本" },
    { id: "month", label: "月历" },
    { id: "daily-summary", label: "日总结" },
    { id: "cat-note", label: "猫猫的话", icon: "sparkle" },
    { id: "goals", label: "长期记忆" },
    { id: "settings", label: "设置" },
  ];
  return (
    <header className="topbar">
      <div className="brand-cluster">
        <button className="brand-mark" type="button" onClick={() => navigate("dashboard")}>
          <AvatarPair profiles={profiles} className="avatar-pair-brand brand-cats" />
          <span>猫猫日记本</span>
        </button>
        <HomeTime now={now} />
      </div>
      <nav className="nav-tabs" aria-label="主导航">
        {items.map((item) => (
          <button
            key={item.id}
            className={cx(page === item.id && "is-active")}
            type="button"
            onClick={() => navigate(item.id)}
            aria-label={item.id === "cat-note" ? "打开猫猫的话" : item.label}
          >
            {item.icon ? <Icon name={item.icon} /> : null}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="session-chip">
        <CatAvatar profile={currentUser} className="is-mini" />
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
    agentJob,
    submitConfirmation,
    dismissConfirmation,
    retryAgentJob,
    clearAgentJob,
    saveRawCapture,
    busy,
    error,
    filter,
    setFilter,
    timelineScope,
    setTimelineScope,
    expanded,
    setExpanded,
    toggleCard,
    archiveCard,
    toggleStep,
    toggleTimer,
    moveCardsDate,
    archiveCards,
    setCardPriority,
    setEditingCard,
    openDetail,
    reorderCards,
    composingRef,
  } = props;

  return (
    <section className="dashboard">
      <section className="home-paper">
        <div className="home-context-strip">
          <div className="home-date-row">
            <DateRail selectedDate={selectedDate} chooseDate={chooseDate} />
          </div>
          <StoryDayContext dayContext={data.dayContext} calendarContext={data.calendarContext} className="home-day-context" />
        </div>
        <HomeFocusNote focus={data.homeFocus} data={data} profiles={profiles} onOpen={openDetail} />
        <button className="partner-note-link" type="button" onClick={() => { window.location.hash = "cat-note"; }}>
          <Icon name="send" />
          <span>给对方留一句</span>
        </button>
      </section>
      <Composer
        text={composerText}
        setText={setComposerText}
        saveRawCapture={saveRawCapture}
        profiles={profiles}
        currentUser={currentUser}
        busy={busy}
        agentJob={agentJob}
        confirmation={confirmation}
        submitConfirmation={submitConfirmation}
        dismissConfirmation={dismissConfirmation}
        retryAgentJob={retryAgentJob}
        clearAgentJob={clearAgentJob}
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
        timelineScope={timelineScope}
        setTimelineScope={setTimelineScope}
        expanded={expanded}
        setExpanded={setExpanded}
        toggleCard={toggleCard}
        archiveCard={archiveCard}
        toggleStep={toggleStep}
        toggleTimer={toggleTimer}
        moveCardsDate={moveCardsDate}
        archiveCards={archiveCards}
        setCardPriority={setCardPriority}
        setEditingCard={setEditingCard}
        openDetail={openDetail}
        reorderCards={reorderCards}
        chooseDate={chooseDate}
      />
    </section>
  );
}

function HomeTime({ now }) {
  return (
    <time className="home-time" dateTime={now?.toISOString?.() || ""} aria-label="当前时间">
      <strong>{clockLabel(now)}</strong>
    </time>
  );
}

function HomeFocusNote({ focus, data, profiles, onOpen }) {
  const isLifeCardFocus = focus?.sourceType === "lifeCard";
  const text = isLifeCardFocus ? lifeCardSurfaceText(cleanStoryText(focus?.text || ""), "") : cleanStoryText(focus?.text || "");
  const title = isLifeCardFocus ? lifeCardSurfaceText(cleanStoryText(focus?.title || ""), "") : cleanStoryText(focus?.title || "");
  if (!text && !title) return null;
  const actor = profiles.find((profile) => profile.id === focus?.actorId);
  const lifeCard = (data?.scheduleItemCards || []).find((card) => card.id === focus?.sourceId || card.sourceId === focus?.sourceId);
  const memoryItem = (data?.memoryItems || []).find((item) => item.id === focus?.sourceId);
  const capture = (data?.captures || []).find((item) => item.id === focus?.sourceId);
  const canOpen = Boolean(
    (focus?.sourceType === "daily-summary" && data?.dailySummary) ||
    ((focus?.sourceType === "cat-word" || focus?.sourceType === "capture") && capture) ||
    (focus?.sourceType === "memoryItem" && memoryItem) ||
    (focus?.sourceType === "lifeCard" && lifeCard)
  );
  const open = () => {
    if (!canOpen) return;
    if (focus.sourceType === "daily-summary") {
      onOpen?.("daySummary", data.dailySummary);
      return;
    }
    if (focus.sourceType === "cat-word" || focus.sourceType === "capture") {
      onOpen?.("capture", capture);
      return;
    }
    if (focus.sourceType === "memoryItem") {
      onOpen?.("memoryItem", memoryItem);
      return;
    }
    if (focus.sourceType === "lifeCard") {
      onOpen?.("lifeCard", lifeCard);
      return;
    }
  };
  const content = (
    <>
      <span className="home-focus-icon">
        <Icon name={focus?.icon || "sparkle"} />
      </span>
      <span className="home-focus-copy">
        <strong>{title || focus?.meta || (isLifeCardFocus ? "生活卡" : "今天")}</strong>
        <em>{text || title}</em>
      </span>
      {actor ? <CatAvatar profile={actor} className="is-mini" /> : focus?.meta ? <i>{focus.meta}</i> : null}
    </>
  );
  if (canOpen) {
    return (
      <button className={cx("home-focus-note", focus?.tone && `is-${focus.tone}`)} type="button" onClick={open}>
        {content}
      </button>
    );
  }
  return <div className={cx("home-focus-note", focus?.tone && `is-${focus.tone}`)}>{content}</div>;
}

function DateRail({ selectedDate, chooseDate }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(selectedDate);
  useEffect(() => {
    setCursor(selectedDate);
  }, [selectedDate]);

  async function selectDate(date) {
    const dateKey = formatDate(date);
    setOpen(false);
    await chooseDate(dateKey);
  }

  return (
    <div className="date-rail">
      <IconButton icon="chevronLeft" label="上一天" onClick={() => chooseDate(addDays(selectedDate, -1))} />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className={cx("date-pill", open && "is-open")} type="button" aria-expanded={open} aria-label="选择日期" title={selectedDate}>
            <Icon name="calendar" />
            <span>
              <strong>{selectedDate === today() ? "今天" : shortDate(selectedDate)}</strong>
              <em>{selectedDate}</em>
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="date-popover" align="center" sideOffset={10}>
            <DayPicker
              animate
              className="peos-day-picker"
              mode="single"
              month={parseDate(cursor) || new Date()}
              selected={parseDate(selectedDate)}
              weekStartsOn={1}
              onMonthChange={(date) => setCursor(formatDate(date))}
              onSelect={(date) => {
                if (date) selectDate(date);
              }}
              formatters={{
                formatCaption: (date) => monthLabel(formatDate(date)),
                formatWeekdayName: (date) => weekLabels[(date.getDay() + 6) % 7],
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <IconButton icon="chevronRight" label="下一天" onClick={() => chooseDate(addDays(selectedDate, 1))} />
    </div>
  );
}

function Composer({ text, setText, saveRawCapture, profiles, currentUser, busy, agentJob, confirmation, submitConfirmation, dismissConfirmation, retryAgentJob, clearAgentJob, composingRef }) {
  const [routeDraft, setRouteDraft] = useState(null);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const fileInputRef = useRef(null);
  useEffect(() => {
    if (!confirmation) {
      setRouteDraft(null);
      return;
    }
    setRouteDraft({
      ...confirmation,
      _enabled: confirmation._enabled !== false,
      relatedItems: (Array.isArray(confirmation.relatedItems) ? confirmation.relatedItems : []).map((item, index) => ({
        ...item,
        _uiId: item._uiId || `${item.title || item.detail || "item"}-${index}`,
        _enabled: item._enabled !== false,
      })),
    });
  }, [confirmation]);

  async function submit(mode) {
    const ok = await saveRawCapture(mode, selectedAssets.map(({ name, dataUrl }) => ({ name, dataUrl })));
    if (ok) setSelectedAssets([]);
  }
  async function chooseCaptureFiles(event) {
    const slots = Math.max(0, 3 - selectedAssets.length);
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/")).slice(0, slots);
    event.target.value = "";
    if (!files.length) return;
    try {
      const assets = await Promise.all(files.map(async (file) => {
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} 超过 5MB`);
        const dataUrl = await readFileAsDataUrl(file);
        return {
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          dataUrl,
        };
      }));
      setSelectedAssets((current) => [...current, ...assets].slice(0, 3));
    } catch (err) {
      toast.error(errorMessage(err, "图片读取失败"));
    }
  }
  const removeCaptureAsset = (id) => setSelectedAssets((current) => current.filter((asset) => asset.id !== id));
  const draft = routeDraft || confirmation;
  const canSubmit = Boolean(text.trim() || selectedAssets.length);
  const confirmationPeople = draft ? cardParticipantIds(draft, profiles, currentUser) : [];
  const visibleDecision = ["schedule", "capture"].includes(draft?.decision) ? draft.decision : "";
  const decisionMeta = captureDecisionMeta(draft?.decision);
  const confirmationType = decisionMeta.label;
  const routeWhen = draft?.decision === "schedule"
    ? [shortDate(draft.date), segmentLabels[draft.segment || "allDay"], itemTypeLabels[draft.itemType || "thing"]].filter(Boolean).join(" · ")
    : decisionMeta.hint;
  const memoryHint = draft?.decision === "memory"
    ? memoryKindText(draft.memoryKinds || draft.memoryKind, "长期记忆")
    : "";
  const routeOptions = [
    { id: "schedule", icon: "cards", label: "生活卡" },
    { id: "capture", icon: "camera", label: "随手记" },
  ];
  const ownerOptions = [
    { id: "shared", label: "共同" },
    ...profiles.map((profile) => ({ id: profile.id, label: profile.displayName })),
  ];
  const ownerText = draft?.decision === "schedule"
    ? (ownerOptions.find((option) => option.id === (draft.ownerId || currentUser?.id || ""))?.label || "我")
    : "";
  const participantsForOwner = (ownerId) => ownerId === "shared" ? profiles.map((profile) => profile.id) : [ownerId].filter(Boolean);
  const updateDraft = (patch) => setRouteDraft((current) => current ? { ...current, ...patch } : current);
  const updatePrimaryOwner = (ownerId) => updateDraft({ ownerId, participants: participantsForOwner(ownerId) });
  const updateRelatedItem = (index, patch) => {
    setRouteDraft((current) => {
      if (!current) return current;
      const relatedItems = (Array.isArray(current.relatedItems) ? current.relatedItems : []).map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      ));
      return { ...current, relatedItems };
    });
  };
  const updateRelatedOwner = (index, ownerId) => {
    updateRelatedItem(index, {
      ownerId,
      participants: participantsForOwner(ownerId),
    });
  };
  const updateDestination = (decision) => {
    setRouteDraft((current) => {
      if (!current) return current;
      if (decision === "schedule") {
        return {
          ...current,
          decision: "schedule",
          itemType: current.itemType || "thing",
          date: current.date || today(),
          segment: current.segment || "allDay",
          priority: current.priority || "normal",
          ownerId: current.ownerId || currentUser?.id || "",
          _enabled: current._enabled !== false,
        };
      }
      return { ...current, decision: "capture" };
    });
  };
  const stripRelatedUiFields = (item) => {
    const { _enabled, _uiId, ...rest } = item || {};
    return rest;
  };
  const normalizeRouteForSubmit = (route) => {
    if (!route) return route;
    const { _enabled, _uiId, relatedItems, ...routeBase } = route;
    if (route.decision === "schedule") {
      const enabledRelatedItems = (Array.isArray(relatedItems) ? relatedItems : [])
        .filter((item) => item?._enabled !== false)
        .map(stripRelatedUiFields);
      if (_enabled !== false) {
        return { ...routeBase, relatedItems: enabledRelatedItems };
      }
      if (enabledRelatedItems.length) {
        const [promoted, ...remaining] = enabledRelatedItems;
        return {
          ...routeBase,
          ...promoted,
          captureId: route.captureId,
          sourceCaptureId: route.sourceCaptureId,
          text: route.text,
          decision: "schedule",
          analysisMode: route.analysisMode,
          analyzer: route.analyzer,
          routeDestinations: route.routeDestinations,
          confirmationText: route.confirmationText,
          reason: route.reason,
          confidence: route.confidence,
          relatedItems: remaining,
        };
      }
      return { ...routeBase, decision: "capture", relatedItems: [] };
    }
    if (["memory", "dailyStory"].includes(route.decision)) return route;
    return { ...route, decision: "capture" };
  };
  const submitDraft = (event, patch = {}) => {
    const next = normalizeRouteForSubmit({ ...(draft || {}), ...patch });
    submitConfirmation(event, next);
  };
  const agentRunning = agentJob?.status === "running";
  const agentFailed = agentJob?.status === "failed";
  const relatedDraftItems = Array.isArray(draft?.relatedItems) ? draft.relatedItems : [];
  const confirmRows = draft?.decision === "schedule" && relatedDraftItems.length
    ? [
        {
          id: "primary",
          primary: true,
          enabled: draft._enabled !== false,
          item: draft,
        },
        ...relatedDraftItems.map((item, index) => ({
          id: item._uiId || `${item.title || item.detail || "item"}-${index}`,
          primary: false,
          index,
          enabled: item._enabled !== false,
          item,
        })),
      ]
    : [];
  const enabledRelatedCount = relatedDraftItems.filter((item) => item._enabled !== false).length;
  const enabledConfirmCount = (draft?._enabled !== false ? 1 : 0) + enabledRelatedCount;
  const confirmSubmitLabel = draft?.decision === "schedule" && enabledConfirmCount === 0
    ? "只留原文"
    : draft?.decision === "memory"
      ? "保存记忆"
      : draft?.decision === "dailyStory"
        ? "进日总结"
        : "确认";

  return (
    <section className={cx("composer-band", draft && "has-confirmation", selectedAssets.length && "has-assets")}>
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
          placeholder="随手记"
        />
        <div className="composer-actions">
          <label className={cx("icon-upload", (busy || selectedAssets.length >= 3) && "is-disabled")} title="加入图片">
            <Icon name="image" />
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={busy || selectedAssets.length >= 3} onChange={chooseCaptureFiles} />
          </label>
          <IconButton icon="bookmark" label="默认" disabled={busy || !canSubmit} onClick={() => submit("template")} />
          <IconButton icon="sparkle" label="Agent" primary disabled={busy || agentRunning || !canSubmit} onClick={() => submit("agent")} />
        </div>
      </form>
      {selectedAssets.length ? (
        <div className="composer-preview" aria-label="待保存图片">
          {selectedAssets.map((asset) => (
            <span className="composer-photo" key={asset.id}>
              <img src={asset.dataUrl} alt={asset.name || "图片"} />
              <b>{shortText(asset.name || "图片", 18)}</b>
              <button type="button" onClick={() => removeCaptureAsset(asset.id)} aria-label={`移除 ${asset.name || "图片"}`} title="移除图片">
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {agentJob ? (
        <div className={cx("agent-strip", agentFailed && "is-failed")} role="status" aria-live="polite">
          <Icon name={agentFailed ? "refresh" : "sparkle"} />
          <span>{agentFailed ? "Agent 没想明白" : "Agent 分流中"}</span>
          {agentFailed ? <em>{shortText(agentJob.error || "可以重试", 36)}</em> : <em>原文已保存</em>}
          {agentFailed ? (
            <div className="agent-strip-actions">
              <button type="button" onClick={() => retryAgentJob?.(agentJob)} disabled={busy}>
                <Icon name="refresh" />
                <span>重试</span>
              </button>
              <button type="button" onClick={clearAgentJob}>
                <Icon name="x" />
                <span>关闭</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {draft ? (
        <form className="confirm-strip" onSubmit={(event) => submitDraft(event)}>
          <AvatarPair profiles={profiles} ids={confirmationPeople} />
          <div className="confirm-copy">
            <strong>
              {draft.analysisMode === "agent" ? "Agent" : "默认"}
              {" · "}
              保存到 {confirmationType}
              {relatedDraftItems.length ? ` · ${enabledConfirmCount}/${confirmRows.length} 条` : ""}
            </strong>
            {draft.title ? <span>{draft.title}</span> : null}
            <span className={cx("confirm-destination", `is-${draft.decision || "capture"}`)}>
              <Icon name={decisionMeta.icon} />
              <b>{draft.decision === "schedule" ? routeWhen : decisionMeta.hint}</b>
              {memoryHint ? <em>{memoryHint}</em> : null}
            </span>
            {draft.reason || draft.confirmationText ? <em>{shortText(draft.reason || draft.confirmationText, 68)}</em> : null}
            <div className="route-tools">
              <div className="route-switch" aria-label="Agent 去向">
                {routeOptions.map((option) => (
                  <button
                    key={option.id}
                    className={cx(visibleDecision === option.id && "is-active")}
                    type="button"
                    onClick={() => updateDestination(option.id)}
                    aria-label={option.label}
                    title={option.label}
                  >
                    <Icon name={option.icon} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
              {visibleDecision === "schedule" ? (
                <details className="route-adjust">
                  <summary>
                    <Icon name="edit" />
                    <span>调整</span>
                  </summary>
                  <div className="route-tune">
                  <select value={draft.itemType || "thing"} onChange={(event) => updateDraft({ itemType: event.target.value })} aria-label="类型">
                    {itemTypeOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <input type="date" value={draft.date || today()} onChange={(event) => updateDraft({ date: event.target.value })} aria-label="日期" />
                  <select value={draft.segment || "allDay"} onChange={(event) => updateDraft({ segment: event.target.value })} aria-label="时段">
                    {Object.entries(segmentLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <select value={draft.ownerId || currentUser?.id || ""} onChange={(event) => updatePrimaryOwner(event.target.value)} aria-label="归属">
                    {ownerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  <select value={draft.priority || "normal"} onChange={(event) => updateDraft({ priority: event.target.value })} aria-label="优先级">
                    {priorityOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  </div>
                </details>
              ) : null}
            </div>
            {ownerText ? (
              <div className="route-owner-quick" aria-label="生活卡归属">
                {ownerOptions.map((option) => (
                  <button
                    key={option.id}
                    className={cx((draft.ownerId || currentUser?.id || "") === option.id && "is-active")}
                    type="button"
                    onClick={() => updatePrimaryOwner(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {confirmRows.length ? (
              <div className="confirm-item-list" aria-label="识别出的生活卡">
                {confirmRows.map((row) => {
                  const item = row.item || {};
                  const rowOwnerId = item.ownerId || draft.ownerId || currentUser?.id || "";
                  const updateRow = (patch) => row.primary ? updateDraft(patch) : updateRelatedItem(row.index, patch);
                  const toggleRow = () => updateRow({ _enabled: !row.enabled });
                  return (
                    <div className={cx("confirm-item-row", !row.enabled && "is-muted")} key={row.id}>
                      <label className="confirm-item-check">
                        <input type="checkbox" checked={row.enabled} onChange={toggleRow} />
                        <span>
                          <Icon name={row.enabled ? "check" : "circle"} />
                        </span>
                      </label>
                      <input
                        className="confirm-item-title"
                        value={item.title || ""}
                        disabled={!row.enabled}
                        onChange={(event) => updateRow({ title: event.target.value })}
                        aria-label={row.primary ? "主生活卡标题" : "子生活卡标题"}
                      />
                      <input
                        className="confirm-item-date"
                        type="date"
                        value={item.date || draft.date || today()}
                        disabled={!row.enabled}
                        onChange={(event) => updateRow({ date: event.target.value })}
                        aria-label={`${item.title || "生活卡"}日期`}
                      />
                      <select
                        value={rowOwnerId}
                        disabled={!row.enabled}
                        onChange={(event) => row.primary ? updatePrimaryOwner(event.target.value) : updateRelatedOwner(row.index, event.target.value)}
                        aria-label={`${item.title || "生活卡"}归属`}
                      >
                        {ownerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="confirm-actions">
            <button className="confirm-action-button" type="button" onClick={dismissConfirmation}>
              <Icon name="x" />
              <span>先不加入</span>
            </button>
            <button className="confirm-action-button is-primary" type="submit">
              <Icon name="check" />
              <span>{confirmSubmitLabel}</span>
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function monthCellSignal(day, storyTitle) {
  const cardCount = Number(day.eventCount || 0) + Number(day.todoCount || 0);
  const captureCount = Number(day.captureCount || 0);
  const diaryCount = Number(day.diaryCount || 0) || Number(day.dailyPulses?.length || 0);
  const hasStory = Boolean(storyTitle || day.summaryGenerated);
  const calendarTags = (day.calendarMarks || []).map(calendarMarkSignal).filter(Boolean).slice(0, 2);
  const tags = [
    ...calendarTags,
    hasStory ? { key: "story", icon: "sparkle", tone: "story", label: "日总结" } : null,
    captureCount ? { key: "capture", icon: "camera", tone: "capture", label: "随手记", value: captureCount } : null,
    cardCount ? { key: "cards", icon: "cards", tone: "cards", label: "猫猫的事", value: cardCount } : null,
    diaryCount ? { key: "pulse", icon: "star", tone: "pulse", label: "每日状态", value: diaryCount } : null,
  ].filter(Boolean);
  const fallbackTones = [
    { icon: "cloud", tone: "soft", label: "小碎片" },
    { icon: "moon", tone: "quiet", label: "慢慢来" },
    { icon: "circle", tone: "seed", label: "留一格" },
  ];
  const primary = calendarTags[0] || tags[0] || (day.isToday
    ? { icon: "sparkle", tone: "today", label: "今天" }
    : fallbackTones[stableIndex(day.id, fallbackTones.length)]);
  const ariaParts = [
    day.id,
    primary.label,
    cardCount ? `${cardCount} 个猫猫的事` : "",
    captureCount ? `${captureCount} 条随手记` : "",
    hasStory ? "有日总结" : "",
  ].filter(Boolean);
  return {
    primary,
    tags: tags.length ? tags.slice(0, 3) : [{ key: "soft", icon: primary.icon, tone: primary.tone, label: primary.label }],
    ariaLabel: ariaParts.join("，"),
  };
}

function calendarMarkSignal(mark) {
  if (!mark) return null;
  const tone = mark.tone || (mark.type === "workday" ? "workday" : mark.type === "holiday" ? "holiday" : mark.type === "solarTerm" ? "solar" : "festival");
  return {
    key: `${mark.type || tone}-${mark.label || mark.title}`,
    icon: mark.icon || (mark.type === "workday" ? "clock" : mark.type === "solarTerm" ? "cloud" : "star"),
    tone,
    label: mark.label || mark.title,
  };
}

function MonthCellSignals({ tags }) {
  return (
    <span className="month-cell-signals" aria-hidden="true">
      {tags.map((tag) => (
        <i key={tag.key} className={`tone-${tag.tone}`}>
          <Icon name={tag.icon} />
          {tag.value && tag.value > 1 ? <b>{tag.value}</b> : null}
        </i>
      ))}
    </span>
  );
}

function CalendarContextButton({ context, onOpen }) {
  const marks = context?.marks || [];
  const leading = marks[0] || null;
  return (
    <button className={cx("calendar-context-button", leading && `tone-${leading.tone || leading.type}`)} type="button" onClick={onOpen}>
      <span>
        <Icon name={leading?.icon || "calendar"} />
      </span>
      <strong>{leading?.title || context?.lunar || "日历"}</strong>
      <em>{[context?.weekday, context?.lunar, context?.isWorkday ? "班" : context?.isRestDay ? "休" : ""].filter(Boolean).join(" · ")}</em>
    </button>
  );
}

function CalendarPopover({ context, onClose }) {
  const marks = context?.marks || [];
  return (
    <Dialog.Root open onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="calendar-popover-backdrop" />
        <Dialog.Content className="calendar-popover" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">日历提示</Dialog.Title>
          <div className="calendar-popover-head">
            <span>
              <Icon name="calendar" />
              <strong>{context?.date}</strong>
            </span>
            <IconButton icon="x" label="关闭" onClick={onClose} />
          </div>
          <div className="calendar-popover-base">
            <b>{context?.weekday || "日历"}</b>
            {context?.lunar ? <em>{context.lunar}</em> : null}
            <i>{context?.isWorkday ? "班" : context?.isRestDay ? "休" : "平"}</i>
          </div>
          {marks.length ? (
            <div className="calendar-mark-list">
              {marks.map((mark) => (
                <span className={`tone-${mark.tone || mark.type}`} key={`${mark.type}-${mark.title}`}>
                  <Icon name={mark.icon || "star"} />
                  <b>{mark.title}</b>
                  <em>{mark.detail}</em>
                </span>
              ))}
            </div>
          ) : (
            <div className="calendar-mark-empty">
              <Icon name="moon" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MonthPicker({ data, selectedDate, chooseDate, open, setOpen }) {
  const summary = data.monthSummary || { month: selectedDate.slice(0, 7), days: [] };
  const gridDays = useMemo(() => {
    const days = summary.days || [];
    const first = parseDate(days[0]?.id || selectedDate);
    const offset = first ? (first.getDay() + 6) % 7 : 0;
    return [...Array.from({ length: offset }, (_, index) => ({ id: `pad-${index}`, isPad: true })), ...days];
  }, [summary.days, selectedDate]);
  async function openDay(day) {
    await chooseDate(day.id);
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
            const storyTitle = cleanStoryText(day.summaryTitle) || (day.id === selectedDate && data.dailySummary ? storyDisplayTitle(data.dailySummary, day.id) : "");
            const signal = monthCellSignal(day, storyTitle);
            return (
              <button
                key={day.id}
                className={cx("month-cell", day.id === selectedDate && "is-active", day.isToday && "is-today", day.summaryGenerated && "has-story", cardCount && "has-card", day.calendarMarks?.length && "has-calendar")}
                type="button"
                onClick={() => openDay(day)}
                aria-label={signal.ariaLabel}
              >
                <span className="month-cell-top">
                  <b>{day.dayNumber}</b>
                  <span className={`month-cell-charm tone-${signal.primary.tone}`} aria-hidden="true">
                    <Icon name={signal.primary.icon} />
                  </span>
                </span>
                {storyTitle ? <em className="month-story-title">{storyTitle}</em> : null}
                <MonthCellSignals tags={signal.tags} />
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function MonthPage({ data, selectedDate, chooseDate, setPage }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const monthSummary = data.monthSummary || { month: selectedDate.slice(0, 7), days: [], totalsByUser: {} };
  const selectedDay = monthSummary.days?.find((day) => day.id === selectedDate) || null;
  const selectedCalendar = data.calendarContext?.date === selectedDate
    ? data.calendarContext
    : selectedDay?.calendarContext || { date: selectedDate, weekday: selectedDay?.label || "", lunar: selectedDay?.lunar || "", marks: selectedDay?.calendarMarks || [] };
  const selectedCards = useMemo(() => {
    return sortCards((data.scheduleItemCards || [])
      .filter((card) => card.date === selectedDate));
  }, [data.scheduleItemCards, selectedDate]);
  const selectedSummary = data.dailySummary?.date === selectedDate ? data.dailySummary : null;
  const selectedSummaryTitle = cleanStoryText(selectedDay?.summaryTitle) || (selectedSummary ? storyDisplayTitle(selectedSummary, selectedDate) : "");
  const selectedSummaryText = cleanStoryText(selectedSummary?.narrative || selectedSummary?.nextStep || "");
  const monthSignals = [
    { key: "cards", icon: "cards", label: "猫猫的事", value: Number(selectedDay?.eventCount || 0) + Number(selectedDay?.todoCount || 0) || selectedCards.length },
    { key: "captures", icon: "camera", label: "随手记", value: Number(selectedDay?.captureCount || 0) || data.captures?.length || 0 },
  ];
  useEffect(() => setCalendarOpen(false), [selectedDate]);

  return (
    <section className="month-page">
      <div className="page-head">
        <div>
          <p className="kicker">猫猫的事</p>
          <h1>月历</h1>
        </div>
        <IconButton icon="rows" label="回首页" onClick={() => setPage("dashboard")} />
      </div>
      <div className="month-layout">
        <MonthPicker data={data} selectedDate={selectedDate} chooseDate={chooseDate} open={true} setOpen={() => {}} />
        <aside className="month-inspector">
          <div className="selected-day-head">
            <div>
              <strong>{selectedDate === today() ? "今天" : shortDate(selectedDate)}</strong>
              <span>{selectedDate}</span>
            </div>
          </div>
          <CalendarContextButton context={selectedCalendar} onOpen={() => setCalendarOpen(true)} />
          {selectedSummaryTitle ? (
            <button className="month-story-link" type="button" onClick={() => setPage("daily-summary")}>
              <Icon name="sparkle" />
              <span>
                <strong>{selectedSummaryTitle}</strong>
                {selectedSummaryText ? <em>{shortText(selectedSummaryText, 72)}</em> : null}
              </span>
              <Icon name="chevronRight" />
            </button>
          ) : null}
          <div className="month-signal-stack" aria-label="当天摘要">
            {monthSignals.map((signal) => (
              <span key={signal.key}>
                <Icon name={signal.icon} />
                <b>{signal.label}</b>
                <em>{signal.value}</em>
              </span>
            ))}
          </div>
        </aside>
      </div>
      {calendarOpen ? <CalendarPopover context={selectedCalendar} onClose={() => setCalendarOpen(false)} /> : null}
    </section>
  );
}

function LifeCardTimeline({ cards, profiles, currentUser, selectedDate, filter, setFilter, timelineScope = "today", setTimelineScope, expanded, setExpanded, toggleCard, archiveCard, toggleStep, toggleTimer, moveCardsDate, archiveCards, setCardPriority, setEditingCard, openDetail, chooseDate, reorderCards }) {
  const [isScrollDragging, setIsScrollDragging] = useState(false);
  const [isCardScrubbing, setIsCardScrubbing] = useState(false);
  const [rolloverBusy, setRolloverBusy] = useState(false);
  const [scrubTargetId, setScrubTargetId] = useState("");
  const [axisFocusId, setAxisFocusId] = useState("");
  const [compactDates, setCompactDates] = useState(() => new Set());
  const [axisHandleY, setAxisHandleY] = useState(`${dayProgressPercent(selectedDate)}%`);
  const listRef = useRef(null);
  const cardRefs = useRef(new Map());
  const scrubFrame = useRef(0);
  const scrubClearTimer = useRef(0);
  const dragState = useRef({ active: false, kind: "", startY: 0, scrollTop: 0, moved: false, blockClick: false, pointerId: null, targetId: "", latestY: 0 });
  const orderDragRef = useRef({ active: false, cardId: "", date: "", pointerId: null, moved: false });
  const orderPreviewRef = useRef(null);
  const todayKey = today();
  const lifeCards = useMemo(() => (cards || [])
    .filter((card) => !isDefaultPromptCard(card))
    .filter((card) => card.sourceType !== "insight")
    .filter((card) => {
      const cardDate = String(card.date || todayKey);
      const carryForward = !isRoutineLifeCard(card) && !isArchivedCard(card) && !isCompletedCard(card);
      if (timelineScope === "today") {
        return cardDate === selectedDate || (carryForward && cardDate < selectedDate);
      }
      return cardDate >= selectedDate || carryForward;
    }), [cards, selectedDate, todayKey, timelineScope]);
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
      const archived = isArchivedCard(card);
      if (filter === "archived") return archived;
      if (archived) return false;
      if (filter === "mine") return isCurrentUserCard(card);
      if (filter === "shared") return isTwoPersonBoardCard(card);
      return true;
    });
    return sortCards(filtered);
  }, [lifeCards, currentUser?.id, filter, profileIds]);

  const visibleCards = filteredCards;
  const grouped = groupByDate(visibleCards);
  const dates = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
  const [orderPreview, setOrderPreview] = useState(null);
  const updateOrderPreview = useCallback((nextPreview) => {
    orderPreviewRef.current = nextPreview;
    setOrderPreview(nextPreview);
  }, []);
  const displayGrouped = orderPreview
    ? new Map([...grouped].map(([date, dayCards]) => [date, date === orderPreview.date ? orderPreview.cards : dayCards]))
    : grouped;
  const focusedCardId = scrubTargetId || axisFocusId;
  const isFocusMode = Boolean(focusedCardId);
  const pinnedCards = useMemo(() => sortCards(visibleCards
    .filter((card) => String(card.date || todayKey) === selectedDate)
    .filter(isPriorityPinnedCard)
  ).slice(0, 3), [visibleCards, selectedDate, todayKey]);
  const nextUpCard = useMemo(() => sortCards(visibleCards
    .filter((card) => String(card.date || todayKey) === selectedDate)
    .filter((card) => !isArchivedCard(card) && !isCompletedCard(card))
  )[0] || null, [visibleCards, selectedDate, todayKey]);
  const nextUpTime = nextUpCard ? (isDailyCheckinCard(nextUpCard) ? dailyCheckinSummary(nextUpCard) : primaryTimeLabel(nextUpCard)) : "";
  const nextUpPeople = nextUpCard ? nextUpPeopleLabel(nextUpCard, profiles, currentUser) : "";
  const rolloverAllCards = useMemo(() => sortCards(visibleCards
    .filter((card) => String(card.date || todayKey) < selectedDate)
    .filter((card) => !isArchivedCard(card) && !isCompletedCard(card))
    .filter((card) => !isRoutineLifeCard(card))
    .filter(canPatchLifeCard)
  ), [visibleCards, selectedDate, todayKey]);
  const rolloverCards = rolloverAllCards.slice(0, 4);
  const rolloverHiddenCount = Math.max(0, rolloverAllCards.length - rolloverCards.length);
  const rolloverTargetLabel = selectedDate === todayKey ? "本日" : shortDate(selectedDate);
  const summary = useMemo(() => {
    const activeCards = lifeCards.filter((card) => !isArchivedCard(card));
    const openCards = activeCards.filter((card) => !isCompletedCard(card));
    const doneCards = activeCards.filter(isCompletedCard);
    const archivedCards = lifeCards.filter(isArchivedCard);
    const staleCards = openCards.filter((card) => lifeCardAgeNotice(card)?.level === "strong");
    return {
      openCount: openCards.length,
      doneCount: doneCards.length,
      archivedCount: archivedCards.length,
      mineCount: openCards.filter(isCurrentUserCard).length,
      boardCount: openCards.filter(isTwoPersonBoardCard).length,
      staleCount: staleCards.length,
    };
  }, [lifeCards, currentUser?.id, profileIds]);
  const filters = [
    ["all", "rows", "全部"],
    ["mine", "user", "自己"],
    ["shared", "users", "双人"],
    ["archived", "archive", "归档"],
  ];
  const scopes = [
    ["today", "focus", "今天"],
    ["future", "calendar", "未来"],
  ];
  const futureJumps = [
    { label: "明天", date: addDays(todayKey, 1) },
    { label: "三天后", date: addDays(todayKey, 3) },
    { label: "周末", date: nextWeekendDate(todayKey) },
    { label: "下周", date: addDays(todayKey, 7) },
  ];
  useEffect(() => () => {
    if (scrubFrame.current) window.cancelAnimationFrame(scrubFrame.current);
    if (scrubClearTimer.current) window.clearTimeout(scrubClearTimer.current);
  }, []);
  useEffect(() => {
    if (!dragState.current.active) setAxisHandleY(`${dayProgressPercent(selectedDate)}%`);
  }, [selectedDate]);
  useEffect(() => {
    if (axisFocusId && !visibleCards.some((card) => card.id === axisFocusId)) setAxisFocusId("");
  }, [axisFocusId, visibleCards]);
  useEffect(() => {
    updateOrderPreview(null);
    orderDragRef.current = { active: false, cardId: "", date: "", pointerId: null, moved: false };
  }, [filter, selectedDate, timelineScope, updateOrderPreview]);
  const axisPercentFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.height) return dayProgressPercent(selectedDate);
    return Math.max(3, Math.min(97, ((event.clientY - rect.top) / rect.height) * 100));
  };
  const centerCardNearPointer = (clientY, force = false) => {
    const list = listRef.current;
    if (!list) return;
    let closest = null;
    let distance = Infinity;
    cardRefs.current.forEach((node, id) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const nextDistance = Math.abs(center - clientY);
      if (nextDistance < distance) {
        distance = nextDistance;
        closest = { id, rect };
      }
    });
    if (!closest) return;
    const drag = dragState.current;
    if (!force && drag.targetId === closest.id) return;
    drag.targetId = closest.id;
    setScrubTargetId(closest.id);
    setAxisFocusId(closest.id);
    const listRect = list.getBoundingClientRect();
    const maxTop = Math.max(0, list.scrollHeight - list.clientHeight);
    const nextTop = list.scrollTop + closest.rect.top - listRect.top - (list.clientHeight / 2) + (closest.rect.height / 2);
    list.scrollTo({
      top: Math.max(0, Math.min(maxTop, nextTop)),
      behavior: force ? "auto" : "smooth",
    });
  };
  const scheduleCardScrub = (clientY, force = false) => {
    dragState.current.latestY = clientY;
    if (scrubFrame.current) return;
    scrubFrame.current = window.requestAnimationFrame(() => {
      scrubFrame.current = 0;
      centerCardNearPointer(dragState.current.latestY, force);
    });
  };
  const canReorderCard = (card) => Boolean(reorderCards && card && !card.readOnly && card.sourceType !== "insight" && !card.isDraft);
  const reorderCardsAtY = useCallback((clientY) => {
    const drag = orderDragRef.current;
    if (!drag.active || !drag.cardId || !drag.date) return;
    const preview = orderPreviewRef.current;
    const baseCards = preview?.date === drag.date ? preview.cards : (grouped.get(drag.date) || []);
    if (baseCards.length < 2) return;
    const rows = baseCards
      .map((card, index) => ({ card, index, node: cardRefs.current.get(card.id) }))
      .filter((item) => item.node);
    if (rows.length < 2) return;
    let targetIndex = rows.length;
    rows.some((item, index) => {
      const rect = item.node.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        targetIndex = index;
        return true;
      }
      return false;
    });
    const currentIndex = baseCards.findIndex((card) => card.id === drag.cardId);
    if (currentIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(baseCards.length - 1, targetIndex > currentIndex ? targetIndex - 1 : targetIndex));
    if (nextIndex === currentIndex) return;
    drag.moved = true;
    dragState.current.blockClick = true;
    updateOrderPreview({ date: drag.date, cards: reorder(baseCards, currentIndex, nextIndex) });
  }, [grouped, updateOrderPreview]);
  const startOrderDrag = useCallback((event, card, date) => {
    if (!canReorderCard(card)) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    orderDragRef.current = { active: true, cardId: card.id, date, pointerId, moved: false };
    setAxisFocusId("");
    setScrubTargetId("");
    setIsCardScrubbing(false);
    updateOrderPreview({ date, cards: grouped.get(date) || [] });
    const target = event.currentTarget;
    target.setPointerCapture?.(pointerId);
    const onMove = (moveEvent) => {
      if (pointerId !== undefined && moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      reorderCardsAtY(moveEvent.clientY);
    };
    const stopDrag = async (stopEvent) => {
      if (pointerId !== undefined && stopEvent?.pointerId !== undefined && stopEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      try {
        target.releasePointerCapture?.(pointerId);
      } catch {
        // The browser may release pointer capture before our cleanup runs.
      }
      const finished = orderDragRef.current;
      const preview = orderPreviewRef.current;
      orderDragRef.current = { active: false, cardId: "", date: "", pointerId: null, moved: false };
      if (finished.moved && preview?.date === date) {
        try {
          await reorderCards?.(date, preview.cards);
        } catch (err) {
          updateOrderPreview(null);
          toast.error(errorMessage(err, "排序失败"));
          return;
        }
      }
      updateOrderPreview(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }, [canReorderCard, grouped, reorderCards, reorderCardsAtY, updateOrderPreview]);
  const startDragScroll = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const axisTarget = Boolean(event.target.closest(".timeline-node"));
    if (!axisTarget && event.target.closest("input, textarea, select, a, summary, label, button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const axisX = Number.parseFloat(window.getComputedStyle(event.currentTarget).getPropertyValue("--timeline-axis-x")) || 132;
    const isAxisDrag = Math.abs(x - axisX) <= 42 || axisTarget;
    const canScroll = event.currentTarget.scrollHeight > event.currentTarget.clientHeight + 2;
    if (scrubClearTimer.current) window.clearTimeout(scrubClearTimer.current);
    dragState.current = {
      active: true,
      kind: isAxisDrag ? "card" : "scroll",
      startY: event.clientY,
      scrollTop: event.currentTarget.scrollTop,
      moved: false,
      blockClick: false,
      pointerId: event.pointerId,
      targetId: "",
      latestY: event.clientY,
    };
    if (!isAxisDrag && !canScroll) {
      dragState.current.active = false;
      return;
    }
    if (isAxisDrag) setAxisHandleY(`${axisPercentFromPointer(event)}%`);
    if (!isAxisDrag) {
      setAxisFocusId("");
      setScrubTargetId("");
      setIsScrollDragging(true);
    }
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
    if (drag.kind === "card") {
      setAxisHandleY(`${axisPercentFromPointer(event)}%`);
      if (drag.moved) {
        setIsCardScrubbing(true);
        scheduleCardScrub(event.clientY);
      }
    } else {
      event.currentTarget.scrollTop = drag.scrollTop - delta;
    }
    if (drag.moved) event.preventDefault();
  };
  const endDragScroll = (event) => {
    const drag = dragState.current;
    if (!drag.active) return;
    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    setIsScrollDragging(false);
    if (scrubFrame.current) {
      window.cancelAnimationFrame(scrubFrame.current);
      scrubFrame.current = 0;
    }
    if (drag.kind === "card" && drag.moved) {
      centerCardNearPointer(drag.latestY || event.clientY, false);
      scrubClearTimer.current = window.setTimeout(() => {
        setIsCardScrubbing(false);
        setScrubTargetId("");
      }, 220);
    } else {
      setIsCardScrubbing(false);
      setScrubTargetId("");
    }
    dragState.current = { ...drag, active: false, kind: "", pointerId: null, targetId: "" };
  };
  const stopDragClick = (event) => {
    if (!dragState.current.blockClick) return;
    dragState.current.blockClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const selectDate = (date) => {
    setAxisFocusId("");
    setScrubTargetId("");
    setIsCardScrubbing(false);
    if (date === todayKey) {
      setAxisHandleY(`${dayProgressPercent(date)}%`);
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    chooseDate?.(date);
  };
  const toggleDateDensity = (date) => {
    if (isFocusMode) {
      setCompactDates((current) => {
        const next = new Set(current);
        next.delete(date);
        return next;
      });
      selectDate(date);
      return;
    }
    if (date !== selectedDate) {
      selectDate(date);
      return;
    }
    setCompactDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };
  const selectedCompact = compactDates.has(selectedDate);
  const moveRolloverCards = async () => {
    if (!rolloverAllCards.length || rolloverBusy) return;
    setRolloverBusy(true);
    try {
      await moveCardsDate?.(rolloverAllCards, selectedDate);
    } finally {
      setRolloverBusy(false);
    }
  };
  const archiveRolloverCards = async () => {
    if (!rolloverAllCards.length || rolloverBusy) return;
    setRolloverBusy(true);
    try {
      await archiveCards?.(rolloverAllCards);
    } finally {
      setRolloverBusy(false);
    }
  };

  return (
    <section className="life-section">
      <div className="life-toolbar">
        <div className="life-summary">
          <AvatarPair profiles={profiles} />
          <span className="life-counts">
            <b>待做 {summary.openCount}</b>
            <i>完成 {summary.doneCount}</i>
            {summary.staleCount ? <i className="is-warm">久放 {summary.staleCount}</i> : null}
            {summary.archivedCount ? <i>归档 {summary.archivedCount}</i> : null}
          </span>
        </div>
        <div className="tool-groups">
          <div className="range-segment" aria-label="时间范围">
            {scopes.map(([id, icon, label]) => (
              <button
                key={id}
                className={cx(timelineScope === id && "is-active")}
                type="button"
                onClick={() => setTimelineScope?.(id)}
                aria-label={label}
                title={label}
              >
                <Icon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button
            className={cx("density-chip", selectedCompact && "is-compact")}
            type="button"
            onClick={() => toggleDateDensity(selectedDate)}
            aria-pressed={selectedCompact ? "true" : "false"}
            title={selectedCompact ? "切到详细" : "切到简略"}
            aria-label={selectedCompact ? "切到详细" : "切到简略"}
          >
            <Icon name={selectedCompact ? "focus" : "rows"} />
            <span>{selectedCompact ? "详细" : "简略"}</span>
          </button>
          <div className="icon-segment" aria-label="筛选">
            {filters.map(([id, icon, label]) => (
              <button
                key={id}
                className={cx("filter-button", filter === id && "is-active")}
                type="button"
                onClick={() => {
                  setAxisFocusId("");
                  setScrubTargetId("");
                  setFilter(id);
                }}
                aria-label={label}
              title={label}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
            ))}
          </div>
        </div>
      </div>
      {timelineScope === "future" ? (
        <div className="future-jump-row" aria-label="未来日期">
          {futureJumps.map((jump) => (
            <button
              key={`${jump.label}-${jump.date}`}
              className={cx(selectedDate === jump.date && "is-active")}
              type="button"
              onClick={() => selectDate(jump.date)}
            >
              <span>{jump.label}</span>
              <em>{shortDate(jump.date)}</em>
            </button>
          ))}
        </div>
      ) : null}
      {nextUpCard ? (
        <button
          className={cx("next-up-strip", nextUpCard.priority === "high" && "is-important")}
          type="button"
          onClick={() => openDetail?.("lifeCard", nextUpCard)}
          title={lifeCardDisplayTitle(nextUpCard, "生活卡")}
        >
          <span className="next-up-kicker">
            <Icon name="sparkle" />
            <b>接下来</b>
          </span>
          <span className="next-up-main">
            <strong>{lifeCardDisplayTitle(nextUpCard, "生活卡")}</strong>
            {nextUpTime ? <em>{nextUpTime}</em> : null}
          </span>
          {nextUpPeople ? <span className="next-up-people">{nextUpPeople}</span> : null}
        </button>
      ) : null}
      {rolloverAllCards.length ? (
        <section className="rollover-strip" aria-label="旧生活卡处理">
          <span className="rollover-head">
            <Icon name="refresh" />
            <b>待处理</b>
            <em>{rolloverAllCards.length}</em>
          </span>
          <div className="rollover-items">
            {rolloverCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => openDetail?.("lifeCard", card)}
                title={lifeCardDisplayTitle(card, "生活卡")}
              >
                <strong>{lifeCardDisplayTitle(card, "生活卡")}</strong>
                <em>{shortDate(card.date)}</em>
              </button>
            ))}
            {rolloverHiddenCount ? <span>还有 {rolloverHiddenCount} 张</span> : null}
          </div>
          <div className="rollover-actions">
            <button type="button" onClick={moveRolloverCards} disabled={rolloverBusy}>
              {rolloverBusy ? "处理中" : `顺延到${rolloverTargetLabel}`}
            </button>
            <button type="button" onClick={archiveRolloverCards} disabled={rolloverBusy}>
              归档
            </button>
          </div>
        </section>
      ) : null}
      {pinnedCards.length ? (
        <section className="priority-strip" aria-label="置顶生活卡">
          <div className="priority-strip-head">
            <Icon name="star" />
            <span>置顶</span>
          </div>
          <div className="priority-strip-items">
            {pinnedCards.map((card) => (
              <button
                key={card.id}
                className={cx("priority-pin", isRoutineLifeCard(card) && "is-routine", card.rankLane === "overdue" && "is-overdue")}
                type="button"
                onClick={() => openDetail?.("lifeCard", card)}
                title={lifeCardDisplayTitle(card, "生活卡")}
              >
                <b>{priorityPinLabel(card)}</b>
                <strong>{lifeCardDisplayTitle(card, "生活卡")}</strong>
                <em>{primaryTimeLabel(card)}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <div
        ref={listRef}
        className={cx("timeline-list", isScrollDragging && "is-dragging", isCardScrubbing && "is-card-scrubbing", isFocusMode && "is-card-focused")}
        style={{ "--day-progress": `${dayProgressPercent(selectedDate)}%`, "--axis-handle-y": axisHandleY }}
        onPointerDown={startDragScroll}
        onPointerMove={dragScroll}
        onPointerUp={endDragScroll}
        onPointerCancel={endDragScroll}
        onClickCapture={stopDragClick}
      >
        {dates.length ? <span className="timeline-axis-handle" aria-hidden="true" /> : null}
        {dates.length ? dates.map((date) => {
          const dayCards = displayGrouped.get(date) || [];
          const isExpanded = expanded.has(date);
          const isSelectedDay = date === selectedDate;
          const isTodayGroup = date === todayKey;
          const isCompactDay = compactDates.has(date);
          const visible = isFocusMode ? dayCards : (isExpanded || isSelectedDay || isTodayGroup ? dayCards : dayCards.slice(0, 3));
          const visibleGroups = groupCardsByTimelineSlot(visible);
          const hiddenCount = isFocusMode ? 0 : dayCards.length - visible.length;
          const openCount = dayCards.filter((card) => !isCompletedCard(card) && !isArchivedCard(card)).length;
          const hasHigh = dayCards.some((card) => card.priority === "high" || Number(card.rankScore || 0) >= 60);
          const hasScrubTarget = Boolean(focusedCardId && dayCards.some((card) => card.id === focusedCardId));
          return (
            <section key={date} className={cx("timeline-day", date === selectedDate && "is-selected", date === todayKey && "is-today", isCompactDay && "is-compact-day", hasHigh && "has-high", hasScrubTarget && "has-scrub-target")}>
              <button className="timeline-node" type="button" onClick={() => selectDate(date)} aria-label={date === todayKey ? `今天 ${date}` : date}>
                <span>{openCount || dayCards.length}</span>
              </button>
              <button className="day-label" type="button" onClick={() => selectDate(date)} title={date}>
                <strong>{date === todayKey ? "今天" : shortDate(date)}</strong>
                <span>{date}</span>
              </button>
              <div className="day-cards">
                {visibleGroups.map((group) => (
                  <section className={cx("timeline-time-group", `is-${group.slot.group}`)} key={group.key}>
                    <div className="timeline-time-label" aria-label={group.slot.label}>
                      <span>{group.slot.label}</span>
                    </div>
                    <div className="timeline-time-cards">
                      {group.cards.map((card) => {
                        const isScrubTarget = focusedCardId === card.id;
                        const isOrderDragging = orderDragRef.current.active && orderDragRef.current.cardId === card.id;
                        const isCompactCard = (isCompactDay || (!isTodayGroup && !isSelectedDay)) && !isScrubTarget;
                        return (
                          <div
                            key={card.id}
                            className={cx("timeline-card-slot", isCompactCard && "is-compact", isScrubTarget && "is-scrub-target", isOrderDragging && "is-order-dragging")}
                            ref={(node) => {
                              if (node) cardRefs.current.set(card.id, node);
                              else cardRefs.current.delete(card.id);
                            }}
                          >
                            {canReorderCard(card) ? (
                              <button
                                className="card-order-handle"
                                type="button"
                                aria-label={`拖动排序 ${card.title || "生活卡"}`}
                                title="拖动排序"
                                onPointerDown={(event) => startOrderDrag(event, card, date)}
                              >
                                <Icon name="grip" />
                              </button>
                            ) : null}
                            <LifeCard
                              card={card}
                              profiles={profiles}
                              currentUser={currentUser}
                              compact={isCompactCard}
                              toggleCard={toggleCard}
                              archiveCard={archiveCard}
                              toggleStep={toggleStep}
                              toggleTimer={toggleTimer}
                              setCardPriority={setCardPriority}
                              setEditingCard={setEditingCard}
                              openDetail={openDetail}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
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

function LifeCard({ card, profiles, currentUser, compact = false, toggleCard, archiveCard, toggleStep, toggleTimer, setCardPriority, setEditingCard, openDetail }) {
  if (isDefaultPromptCard(card)) return null;
  const itemType = card.itemType && itemTypeLabels[card.itemType] ? card.itemType : "thing";
  const participants = cardParticipantIds(card, profiles, currentUser);
  const status = statusText(card);
  const readOnly = card.readOnly || card.sourceType === "insight";
  const isDraft = Boolean(card.isDraft);
  const storedDone = isCompletedCard(card);
  const isArchived = isArchivedCard(card);
  const canPatch = canPatchLifeCard(card);
  const canQuickPatch = canPatch && !isArchived && !isDailyCheckinCard(card);
  const canArchive = ["schedule", "todo"].includes(card.sourceType) && !isDailyCheckinCard(card);
  const completionTarget = completionTargetUserId(card, currentUser);
  const isLegacyCheckin = card.sourceType === "checkin";
  const isDailyCheckin = isDailyCheckinCard(card);
  const title = lifeCardDisplayTitle(card);
  const timeNote = primaryTimeLabel(card);
  const ageNotice = lifeCardAgeNotice(card);
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const checkinSteps = isLegacyCheckin
    ? participants.map((id) => ({
        id: `checkin-${id}`,
        title: profileById.get(id)?.displayName || ownerLabel(id, currentUser),
        ownerId: id,
        status: card.statusByUser?.[id] === "done" ? "done" : "todo",
      }))
    : [];
  const allSteps = (isLegacyCheckin ? checkinSteps : (Array.isArray(card.steps) ? card.steps : [])).filter((step) => step.title);
  const pendingStep = !isLegacyCheckin ? allSteps.find((step) => step.status !== "done") : null;
  const progressTotal = Number(card.stepProgress?.total);
  const progressDone = Number(card.stepProgress?.done);
  const stepTotal = Number.isFinite(progressTotal) && progressTotal > 0 ? progressTotal : allSteps.length;
  const stepDone = Number.isFinite(progressDone) && progressDone >= 0 ? progressDone : allSteps.filter((step) => step.status === "done").length;
  const compactStepTitle = isLegacyCheckin ? "" : pendingStep?.title || (stepTotal ? "都完成了" : "");
  const statusByUser = card.statusByUser || {};
  const checkinPeople = isLegacyCheckin || isDailyCheckin
    ? participants.map((id) => {
        const profile = profileById.get(id);
        const done = statusByUser[id] === "done";
        return {
          id,
          done,
          label: profile?.displayName || ownerLabel(id, currentUser),
          color: profileColor(profiles, id, id === currentUser?.id ? avatarColor(currentUser) : "#24b99a"),
        };
      })
    : [];
  const checkinDoneCount = checkinPeople.filter((person) => person.done).length;
  const isGroupCard = participants.length > 1 || card.ownerId === "shared";
  const pendingOwnerIds = [...new Set(
    isLegacyCheckin
      ? checkinPeople.filter((person) => !person.done).map((person) => person.id)
      : allSteps.length
        ? allSteps
            .filter((step) => step.status !== "done")
            .flatMap((step) => {
              const owners = stepOwnerIds(step, participants);
              return owners.length ? owners : [completionTarget || currentUser?.id].filter(Boolean);
            })
        : participants.filter((id) => !isCardDoneForUser(card, id))
  )];
  const groupAllDone = isLegacyCheckin && checkinPeople.length
    ? checkinDoneCount === checkinPeople.length
    : allSteps.length
      ? allSteps.every((step) => step.status === "done")
      : participants.length
        ? participants.every((id) => isCardDoneForUser(card, id))
        : storedDone;
  const isDone = isGroupCard ? groupAllDone : storedDone;
  const currentUserPending = pendingOwnerIds.includes(currentUser?.id || "");
  const isInsight = card.sourceType === "insight";
  const ownerColor = card.ownerId === "shared" ? "#ff6fa8" : profileColor(profiles, card.ownerId, avatarColor(currentUser));
  const secondColor = participants.length > 1 ? profileColor(profiles, participants[1], "#24b99a") : ownerColor;
  const timerActive = Boolean(card.timeTracking?.currentUserActive);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timerActive) {
      setTimerNow(Date.now());
      return undefined;
    }
    const timer = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [timerActive, card.timeTracking?.activeStartedAt]);
  const totalTimeLabel = compactDuration(timerTotalSeconds(card, timerNow));
  const progressStatus = card.stepProgress?.total ? `${card.stepProgress.done}/${card.stepProgress.total}` : status;
  const waitLabel = !isDone && !isArchived && isGroupCard
    ? (currentUserPending ? "等我" : pendingOwnerIds.length ? "等对方" : "")
    : "";
  const displayedStatus = isArchived
    ? "已归档"
    : isDone
      ? (isGroupCard || card.completion?.allDone ? "已完成" : "我已完成")
    : waitLabel || progressStatus;
  const repeatNote = repeatRuleLabel(card.repeatRule);
  const checkinSummary = isDailyCheckin ? dailyCheckinSummary(card) : "";
  const checkinProgress = isDailyCheckin ? dailyCheckinProgressText(card) : "";
  const contextBits = isDailyCheckin
    ? [checkinSummary, checkinProgress].filter(Boolean)
    : [
        timeNote,
        repeatNote && repeatNote !== timeNote ? repeatNote : "",
        displayedStatus,
        card.priority === "high" ? "重要" : "",
      ].filter(Boolean);
  const openCard = () => {
    if (isDraft) {
      setEditingCard(card);
      return;
    }
    openDetail?.("lifeCard", card);
  };
  const stopAction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const { isProxy, targetName } = proxyActionMeta(card, currentUser, profiles);
  const completeLabel = isDailyCheckin ? (isProxy ? `帮${targetName}打卡` : "我打卡") : itemType === "checkin" ? (isProxy ? `帮${targetName}打卡` : "打卡") : isProxy ? `帮${targetName}完成` : "完成";
  const undoLabel = isDailyCheckin || itemType === "checkin" ? (isProxy ? `取消${targetName}打卡` : "取消打卡") : isProxy ? `取消${targetName}` : "取消";
  const targetDone = completionTarget ? isCardDoneForUser(card, completionTarget) : isDone;
  const participantStates = !isLegacyCheckin && !isDailyCheckin && isGroupCard
    ? participants.map((id) => {
        const profile = profileById.get(id);
        const done = isCardDoneForUser(card, id);
        return {
          id,
          done,
          label: participantShortName(id, profiles, currentUser, profile?.displayName || "对方"),
          initials: profile?.initials || (profile?.displayName || participantShortName(id, profiles, currentUser)).slice(0, 1),
          color: profileColor(profiles, id, id === currentUser?.id ? avatarColor(currentUser) : "#24b99a"),
          state: done ? "已完成" : id === currentUser?.id ? "等我" : "待完成",
        };
      })
    : [];
  const completeCard = (event) => {
    stopAction(event);
    toggleCard(card);
  };
  const togglePriorityAction = (event) => {
    stopAction(event);
    if (!canQuickPatch) return;
    setCardPriority?.(card, card.priority === "high" ? "normal" : "high");
  };
  const archiveCardAction = (event) => {
    stopAction(event);
    if (!canArchive) return;
    archiveCard?.(card);
  };
  const toggleStepAction = (event, step) => {
    stopAction(event);
    if (isLegacyCheckin || isDailyCheckin) {
      if (step.ownerId === currentUser?.id || step.ownerId === completionTarget) toggleCard?.(card);
      return;
    }
    if (!readOnly && (!step.ownerId || step.ownerId === currentUser?.id || step.ownerId === completionTarget)) toggleStep?.(card, step);
  };
  const checkinBoardLabel = checkinPeople.length ? `${checkinDoneCount}/${checkinPeople.length}` : "";
  return (
    <article
      className={cx("life-card", `type-${itemType}`, card.priority === "high" && "is-important", isLegacyCheckin && "is-checkin", isDailyCheckin && "is-daily-checkin", isDone && "is-done", isArchived && "is-archived", ageNotice && "is-aged", ageNotice?.level === "strong" && "is-aged-strong", readOnly && "is-readonly", isInsight && "is-insight", isDraft && "is-draft")}
      style={{ "--owner-one": ownerColor, "--owner-two": secondColor }}
      onDoubleClick={() => {
        if (!readOnly) setEditingCard(card);
      }}
    >
      <span className="card-accent" aria-hidden="true" />
      <div className="card-main">
        <button className="card-head card-open" type="button" onClick={openCard} aria-label={isDraft ? "保存猫猫的事" : "查看猫猫的事"}>
          <div className="card-people">
            <AvatarPair profiles={profiles} ids={participants} />
          </div>
          <div className="card-copy">
            <div className="card-meta">
              <span className="type-pill">{itemTypeLabels[itemType]}</span>
              {contextBits.length ? <span className="context-pill">{contextBits.join(" · ")}</span> : null}
              {totalTimeLabel ? (
                <span className={cx("time-total-pill", timerActive && "is-running")}>
                  <Icon name="clock" />
                  {totalTimeLabel}
                </span>
              ) : null}
            </div>
            <strong>{title}</strong>
          </div>
        </button>
        {!compact && isDailyCheckin ? (
          <div className="daily-checkin-brief" aria-label="打卡项">
            <span>{checkinSummary}</span>
            {checkinBoardLabel ? <em>{checkinBoardLabel}</em> : null}
          </div>
        ) : null}
        {!compact && checkinPeople.length ? (
          <div className="card-checkin-board" aria-label="共同打卡完成情况">
            {checkinPeople.map((person) => {
              const disabled = readOnly || (person.id !== currentUser?.id && person.id !== completionTarget);
              return (
                <button
                  key={person.id}
                  className={cx("checkin-person", person.done && "is-done")}
                  style={{ "--person-color": person.color }}
                  type="button"
                  aria-label={disabled ? `${person.label}${person.done ? "已打卡" : "未打卡"}` : person.done ? `取消 ${person.label} 打卡` : `${person.label} 打卡`}
                  title={person.done ? `${person.label} 已完成` : `${person.label} 未完成`}
                  onClick={(event) => toggleStepAction(event, { ownerId: person.id })}
                  disabled={disabled}
                >
                  <span>{person.label}</span>
                  <b aria-hidden="true"><Icon name={person.done ? "check" : "circle"} /></b>
                </button>
              );
            })}
          </div>
        ) : null}
        {!compact && isLegacyCheckin && checkinPeople.length ? (
          <div className="checkin-meter" aria-label={`共同打卡 ${checkinDoneCount}/${checkinPeople.length}`}>
            <span style={{ width: `${Math.round((checkinDoneCount / checkinPeople.length) * 100)}%` }} />
          </div>
        ) : null}
        {!compact && !isLegacyCheckin && participantStates.length ? (
          <div className="card-collab-board" aria-label="双人完成情况">
            {participantStates.map((person) => (
              <span
                key={person.id}
                className={cx("collab-person", person.done && "is-done", person.id === currentUser?.id && "is-me")}
                style={{ "--person-color": person.color }}
                title={`${person.label} ${person.state}`}
              >
                <em>{person.initials}</em>
                <b>{person.label}</b>
                <i>{person.state}</i>
              </span>
            ))}
          </div>
        ) : null}
        {!compact && !isLegacyCheckin && !isDailyCheckin && stepTotal ? (
          <button
            className={cx("next-step-row", !pendingStep && "is-done")}
            type="button"
            aria-label={pendingStep ? `完成下一步 ${pendingStep.title}` : "步骤已完成"}
            title={pendingStep ? `下一步：${pendingStep.title}` : "步骤已完成"}
            onClick={(event) => {
              if (pendingStep) toggleStepAction(event, pendingStep);
              else stopAction(event);
            }}
            disabled={readOnly || !pendingStep}
          >
            <Icon name={pendingStep ? "circle" : "check"} />
            <span>{pendingStep ? "下一步" : "步骤"}</span>
            <em>{compactStepTitle}</em>
            <b>{`${stepDone}/${stepTotal}`}</b>
          </button>
        ) : null}
        {!compact && !isLegacyCheckin && !isDailyCheckin && card.stepProgress?.total ? (
          <div className="step-meter" aria-label={`步骤 ${card.stepProgress.done}/${card.stepProgress.total}`}>
            <span style={{ width: `${card.stepProgress.percent || 0}%` }} />
          </div>
        ) : null}
      </div>
      {!readOnly && !isDraft ? (
        <div className="card-actions">
          {compact && !isArchived && completionTarget ? (
            <button
              className={cx("action-chip compact-only-action", targetDone ? "done-mark" : "complete-toggle")}
              type="button"
              aria-label={targetDone ? undoLabel : completeLabel}
              aria-pressed={targetDone ? "true" : "false"}
              title={targetDone ? undoLabel : completeLabel}
              onClick={completeCard}
            >
              <Icon name={targetDone ? "check" : "circle"} />
              <span>{targetDone ? undoLabel : completeLabel}</span>
            </button>
          ) : null}
          {!compact && !isArchived && !isLegacyCheckin && completionTarget && targetDone ? (
            <button
              className="action-chip done-mark"
              type="button"
              aria-label={undoLabel}
              aria-pressed="true"
              title={undoLabel}
              onClick={completeCard}
            >
              <Icon name="check" />
              <span>{undoLabel}</span>
            </button>
          ) : !compact && !isArchived && !isLegacyCheckin && completionTarget ? (
            <button
              className="action-chip complete-toggle"
              type="button"
              aria-label={completeLabel}
              aria-pressed="false"
              title={completeLabel}
              onClick={completeCard}
            >
              <Icon name="circle" />
              <span>{completeLabel}</span>
            </button>
          ) : null}
          {canQuickPatch ? (
            <button
              className={cx("action-chip priority-toggle", compact && "compact-only-action", card.priority === "high" && "is-active")}
              type="button"
              aria-label={card.priority === "high" ? "取消重要" : "标为重要"}
              aria-pressed={card.priority === "high" ? "true" : "false"}
              title={card.priority === "high" ? "取消重要" : "标为重要"}
              onClick={togglePriorityAction}
            >
              <Icon name="star" />
              <span>重要</span>
            </button>
          ) : null}
          {canArchive ? (
            <button
              className={cx("action-chip archive-toggle", compact && "compact-only-action", isArchived && "is-restore")}
              type="button"
              aria-label={isArchived ? "恢复归档" : "归档"}
              title={isArchived ? "恢复归档" : "归档"}
              onClick={archiveCardAction}
            >
              <Icon name={isArchived ? "undo" : "archive"} />
              <span>{isArchived ? "恢复" : "归档"}</span>
            </button>
          ) : null}
          {!compact && !isArchived && !isLegacyCheckin && !isDailyCheckin ? (
            <button
              className={cx("action-chip timer-toggle", timerActive && "is-active")}
              type="button"
              aria-label={timerActive ? "停止计时" : "开始计时"}
              aria-pressed={timerActive ? "true" : "false"}
              title={timerActive ? "停止计时" : "开始计时"}
              onClick={(event) => {
                stopAction(event);
                toggleTimer?.(card);
              }}
            >
              <Icon name={timerActive ? "stop" : "clock"} />
              <span>{timerActive ? "停止" : "计时"}</span>
            </button>
          ) : null}
          {!compact ? (
            <button
              className="action-chip detail-toggle"
              type="button"
              aria-label="详情"
              title="详情"
              onClick={(event) => {
                stopAction(event);
                openCard();
              }}
            >
              <Icon name="more" />
              <span>详情</span>
            </button>
          ) : null}
        </div>
      ) : isDraft ? (
        <div className="card-actions">
          <button
            className="action-chip complete-toggle"
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
            <span>保存</span>
          </button>
        </div>
      ) : null}
    </article>
  );
}

function makeEditorStep(step = {}, index = 0) {
  return {
    id: step.id || `draft-step-${Date.now()}-${index}`,
    title: step.title || "",
    estimateMin: step.estimateMin || "",
    status: step.status === "done" ? "done" : "todo",
    ownerId: step.ownerId || "",
  };
}

function buildCardEditorDefaults(card) {
  return {
    title: card.title || "",
    detail: card.detail || card.slot || "",
    date: card.date || today(),
    itemType: card.itemType || "thing",
    ownerId: card.ownerId || "shared",
    priority: card.priority || "normal",
    segment: card.segment || "allDay",
    repeatRule: card.repeatRule || "",
    plannedAt: dateTimeLocalValue(card.plannedAt),
    dueAt: dateTimeLocalValue(card.dueAt),
    durationMin: card.durationMin || "",
    tags: tagsInputValue(card.tags),
    steps: (card.steps || []).map(makeEditorStep),
  };
}

function CardEditor({ card, profiles, onClose, onSave, onDelete, confirmLeave }) {
  const isDailyCheckin = card.title === "一起打卡！" || card.repeatRule === "daily@03:00";
  const defaultValues = useMemo(() => buildCardEditorDefaults(card), [card]);
  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(cardEditorSchema),
    defaultValues,
    mode: "onBlur",
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: "steps", keyName: "formId" });
  const form = watch();
  const formSteps = watch("steps") || [];
  const [dragStepId, setDragStepId] = useState("");
  const dragStepIdRef = useRef("");
  const stepListRef = useRef(null);
  const dragCleanupRef = useRef(null);
  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);
  const moveStep = (id, direction) => {
    const steps = getValues("steps") || [];
    const index = steps.findIndex((step) => step.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) return;
    move(index, nextIndex);
  };
  const addStep = () => append(makeEditorStep({ title: "", estimateMin: "", ownerId: "" }, (getValues("steps") || []).length));
  const addStepTemplate = (templateId) => {
    const baseIndex = (getValues("steps") || []).length;
    const cardTitle = String(getValues("title") || "").trim();
    const templateSteps = templateId === "split" && profiles.length
      ? profiles.map((profile) => ({ title: `${profile.displayName} 负责的部分`, estimateMin: 15, ownerId: profile.id }))
      : templateId === "three"
        ? [
            { title: "准备一下", estimateMin: 5, ownerId: "" },
            { title: cardTitle || "开始做", estimateMin: 25, ownerId: "" },
            { title: "收尾确认", estimateMin: 5, ownerId: "" },
          ]
        : [{ title: isDailyCheckin ? "完成打卡" : "先做 5 分钟", estimateMin: 5, ownerId: "" }];
    append(templateSteps.map((step, offset) => makeEditorStep(step, baseIndex + offset)));
    setEditorSection("steps");
  };
  const removeStep = (id) => {
    const index = (getValues("steps") || []).findIndex((step) => step.id === id);
    if (index >= 0) remove(index);
  };
  const reorderStepAtY = useCallback((clientY) => {
    const activeId = dragStepIdRef.current;
    const list = stepListRef.current;
    if (!activeId || !list) return;
    const rows = Array.from(list.querySelectorAll("[data-step-id]"));
    if (!rows.length) return;
    let targetIndex = rows.length;
    rows.some((row, index) => {
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        targetIndex = index;
        return true;
      }
      return false;
    });
    const steps = getValues("steps") || [];
    const currentIndex = steps.findIndex((step) => step.id === activeId);
    if (currentIndex < 0) return;
    const endIndex = Math.max(0, Math.min(steps.length - 1, targetIndex > currentIndex ? targetIndex - 1 : targetIndex));
    if (endIndex === currentIndex) return;
    move(currentIndex, endIndex);
  }, [getValues, move]);
  const startStepDrag = useCallback((event, id, inputType = "pointer") => {
    if (event.button !== undefined && event.button !== 0) return;
    if (dragStepIdRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.();
    dragStepIdRef.current = id;
    setDragStepId(id);
    const target = event.currentTarget;
    const pointerId = inputType === "pointer" ? event.pointerId : undefined;
    const moveEventName = inputType === "mouse" ? "mousemove" : "pointermove";
    const upEventName = inputType === "mouse" ? "mouseup" : "pointerup";
    if (inputType === "pointer") target.setPointerCapture?.(pointerId);
    const onMove = (moveEvent) => {
      if (inputType === "pointer" && pointerId !== undefined && moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      reorderStepAtY(moveEvent.clientY);
    };
    const stopDrag = (stopEvent) => {
      if (inputType === "pointer" && pointerId !== undefined && stopEvent?.pointerId !== undefined && stopEvent.pointerId !== pointerId) return;
      window.removeEventListener(moveEventName, onMove);
      window.removeEventListener(upEventName, stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      if (inputType === "pointer") {
        try {
          target.releasePointerCapture?.(pointerId);
        } catch {
          // Pointer capture can already be released by the browser on pointerup.
        }
      }
      dragCleanupRef.current = null;
      dragStepIdRef.current = "";
      setDragStepId("");
    };
    dragCleanupRef.current = stopDrag;
    window.addEventListener(moveEventName, onMove, { passive: false });
    window.addEventListener(upEventName, stopDrag);
    if (inputType === "pointer") window.addEventListener("pointercancel", stopDrag);
    reorderStepAtY(event.clientY);
  }, [reorderStepAtY]);
  useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);
  const submit = handleSubmit((values) => {
    return onSave({
      ...values,
      title: isDailyCheckin ? "一起打卡！" : values.title,
      itemType: isDailyCheckin ? "checkin" : values.itemType,
      ownerId: isDailyCheckin ? "shared" : values.ownerId,
      priority: isDailyCheckin ? "normal" : values.priority,
      repeatRule: isDailyCheckin ? "daily@03:00" : values.repeatRule || (values.itemType === "habit" ? "daily" : ""),
      durationMin: Number(values.durationMin) || 0,
      tags: normalizeEditableTags(values.tags),
      steps: (values.steps || [])
        .map((step, index) => ({
          id: step.id || `step-${index + 1}`,
          title: String(step.title || "").trim(),
          ownerId: step.ownerId,
          estimateMin: Number(step.estimateMin) || 0,
          status: step.status === "done" ? "done" : "todo",
          sortOrder: index,
        }))
        .filter((step) => step.title),
    });
  });
  const participants = form.ownerId === "shared" ? profiles.map((profile) => profile.id) : [form.ownerId];
  const ownerChoices = [
    { id: "shared", label: "共同" },
    ...profiles.map((profile) => ({ id: profile.id, label: profile.displayName })),
  ];
  const stepOwnerChoices = [
    { id: "", label: "共同" },
    ...profiles.map((profile) => ({ id: profile.id, label: profile.displayName })),
  ];
  const [editorSection, setEditorSection] = useState(isDailyCheckin ? "steps" : "compose");
  const ownerLabel = ownerChoices.find((choice) => choice.id === form.ownerId)?.label || "共同";
  const priorityLabel = priorityOptions.find((choice) => choice.id === form.priority)?.label || "普通";
  const repeatLabel = repeatRuleLabel(form.repeatRule) || "一次";
  const stepCount = formSteps.filter((step) => String(step.title || "").trim()).length || formSteps.length;
  const editorTabs = [
    { id: "compose", label: "内容", icon: "edit", meta: itemTypeLabels[form.itemType] || "生活卡" },
    { id: "plan", label: isDailyCheckin ? "规则" : "时间", icon: "calendar", meta: isDailyCheckin ? "每日" : form.plannedAt ? "已安排" : repeatLabel || priorityLabel },
    { id: "steps", label: isDailyCheckin ? "打卡" : "步骤", icon: "rows", meta: `${stepCount} 项` },
  ];
  const stepTemplates = [
    { id: "starter", icon: "sparkle", label: isDailyCheckin ? "打卡" : "先动5分钟" },
    { id: "three", icon: "rows", label: "三步走" },
    profiles.length > 1 ? { id: "split", icon: "users", label: "分给两个人" } : null,
  ].filter(Boolean);
  const setEditorDate = useCallback((date) => {
    if (!date || isDailyCheckin) return;
    const plannedAt = getValues("plannedAt");
    const dueAt = getValues("dueAt");
    setValue("date", date, { shouldDirty: true, shouldValidate: true });
    if (plannedAt) setValue("plannedAt", redateDateTime(plannedAt, date), { shouldDirty: true, shouldValidate: true });
    if (dueAt) setValue("dueAt", redateDateTime(dueAt, date), { shouldDirty: true, shouldValidate: true });
  }, [getValues, isDailyCheckin, setValue]);
  const setEditorTime = useCallback((time, segment) => {
    if (isDailyCheckin) return;
    const date = getValues("date") || today();
    setValue("plannedAt", localDateTimeValue(date, time), { shouldDirty: true, shouldValidate: true });
    setValue("segment", segment, { shouldDirty: true, shouldValidate: true });
  }, [getValues, isDailyCheckin, setValue]);
  const editorDateShortcuts = [
    { label: "本日", value: today() },
    { label: "明天", value: addDays(today(), 1) },
    { label: "周末", value: nextWeekendDate(form.date || today()) },
  ];
  const editorTimeShortcuts = [
    { label: "早上", time: "09:00", segment: "morning" },
    { label: "下午", time: "15:00", segment: "afternoon" },
    { label: "晚上", time: "20:00", segment: "evening" },
  ];
  const requestClose = useCallback(async () => {
    if (isDirty && !isSubmitting) {
      const accepted = confirmLeave
        ? await confirmLeave()
        : window.confirm("还有没保存的改动，要先离开吗？");
      if (!accepted) return;
    }
    onClose();
  }, [confirmLeave, isDirty, isSubmitting, onClose]);
  const showDelete = !card.isDraft;
  return (
    <Dialog.Root open onOpenChange={(nextOpen) => {
      if (!nextOpen) requestClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-backdrop" />
        <Dialog.Content className="edit-sheet" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{card.isDraft ? "新增生活卡" : "编辑生活卡"}</Dialog.Title>
          <span className="sheet-handle" aria-hidden="true" />
          <form className="edit-sheet-form" onSubmit={submit}>
            <div className="sheet-head">
              <div className="edit-studio-id">
                <div className="edit-preview" style={{ "--type": "var(--pink)" }}>
                  <AvatarPair profiles={profiles} ids={participants} />
                </div>
                <span>
                  <strong>{card.isDraft ? "新增生活卡" : "编辑生活卡"}</strong>
                  <em>{ownerLabel} · {form.date || "未定日期"}</em>
                </span>
                <b className={cx("edit-dirty-badge", !isDirty && "is-clean")}>{isDirty ? "未保存" : "已保存"}</b>
              </div>
              <div className="sheet-icon-actions">
                {showDelete ? <IconButton icon="trash" label="删除" danger onClick={onDelete} /> : null}
                <IconButton icon="x" label="关闭" onClick={requestClose} />
              </div>
            </div>

            <div className="edit-title-block">
              <label className="edit-title-field">
                <textarea
                  rows={2}
                  {...register("title")}
                  autoFocus={!isDailyCheckin}
                  aria-label="标题"
                  placeholder="标题"
                  readOnly={isDailyCheckin}
                />
              </label>
              {errors.title ? <p className="form-error inline">{errors.title.message}</p> : null}
            </div>

            <Tabs.Root className="edit-tabs-root" value={editorSection} onValueChange={setEditorSection}>
              <Tabs.List className="edit-section-tabs" aria-label="生活卡编辑区">
                {editorTabs.map((tabItem) => (
                  <Tabs.Trigger key={tabItem.id} value={tabItem.id}>
                    <Icon name={tabItem.icon} />
                    <span>{tabItem.label}</span>
                    <em>{tabItem.meta}</em>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content className="edit-section-panel" value="compose">
                <label className="edit-line-field edit-note-field">
                  <span>注意</span>
                  <textarea rows={4} {...register("detail")} placeholder="补一句需要记住的提醒、背景或关照方式" />
                </label>
                <div className="edit-field-grid">
                  <div className="edit-line-field edit-date-field">
                    <span>日期</span>
                    <input type="date" {...register("date")} disabled={isDailyCheckin} aria-label="日期" />
                    {!isDailyCheckin ? (
                      <div className="date-shortcut-row" aria-label="日期快捷">
                        {editorDateShortcuts.map((shortcut) => (
                          <button
                            key={`${shortcut.label}-${shortcut.value}`}
                            type="button"
                            className={cx(form.date === shortcut.value && "is-active")}
                            onClick={() => setEditorDate(shortcut.value)}
                          >
                            {shortcut.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <label className="edit-line-field">
                    <span>类型</span>
                    <EditorSelect
                      value={form.itemType}
                      onValueChange={(value) => setValue("itemType", value, { shouldDirty: true, shouldValidate: true })}
                      options={itemTypeOptions.map(([id, label]) => ({ id, label }))}
                      disabled={isDailyCheckin}
                      ariaLabel="类型"
                    />
                  </label>
                  <label className="edit-line-field">
                    <span>归属</span>
                    <EditorSelect
                      value={form.ownerId}
                      onValueChange={(value) => setValue("ownerId", value, { shouldDirty: true, shouldValidate: true })}
                      options={ownerChoices}
                      disabled={card.sourceType === "checkin" || isDailyCheckin}
                      ariaLabel="归属"
                    />
                  </label>
                </div>
                <label className="edit-line-field">
                  <span>标签</span>
                  <input {...register("tags")} placeholder="用空格或逗号分开" />
                  {errors.tags ? <em className="field-error">{errors.tags.message}</em> : null}
                </label>
              </Tabs.Content>

              <Tabs.Content className="edit-section-panel" value="plan">
                {isDailyCheckin ? (
                  <div className="edit-static-rule">
                    <Icon name="refresh" />
                    <span>
                      <strong>每天 03:00 刷新</strong>
                      <em>这张卡固定为共同打卡，不需要额外安排时间。</em>
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="priority-choice" role="radiogroup" aria-label="优先级">
                      {priorityOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={cx(form.priority === option.id && "is-active", `is-${option.id}`)}
                          onClick={() => setValue("priority", option.id, { shouldDirty: true, shouldValidate: true })}
                          aria-pressed={form.priority === option.id ? "true" : "false"}
                        >
                          <Icon name={option.icon} />
                          <span>
                            <strong>{option.label}</strong>
                            <em>{option.hint}</em>
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="edit-field-grid is-time">
                      <label className="edit-line-field">
                        <span>开始</span>
                        <input type="datetime-local" {...register("plannedAt")} />
                      </label>
                      <label className="edit-line-field">
                        <span>截止</span>
                        <input type="datetime-local" {...register("dueAt")} />
                      </label>
                      <label className="edit-line-field">
                        <span>预计</span>
                        <input type="number" min="0" step="5" {...register("durationMin")} placeholder="分钟" />
                      </label>
                    </div>
                    <div className="date-shortcut-row is-time" aria-label="时间快捷">
                      {editorTimeShortcuts.map((shortcut) => (
                        <button key={shortcut.label} type="button" onClick={() => setEditorTime(shortcut.time, shortcut.segment)}>
                          <Icon name="clock" />
                          <span>{shortcut.label}</span>
                          <em>{shortcut.time}</em>
                        </button>
                      ))}
                    </div>
                    <input type="hidden" {...register("repeatRule")} />
                    <div className="repeat-choice" role="radiogroup" aria-label="周期">
                      {repeatEditorOptions.map((option) => (
                        <button
                          key={option.id || "once"}
                          type="button"
                          className={cx(form.repeatRule === option.id && "is-active")}
                          onClick={() => setValue("repeatRule", option.id, { shouldDirty: true, shouldValidate: true })}
                          aria-pressed={form.repeatRule === option.id ? "true" : "false"}
                        >
                          <span>{option.label}</span>
                          <em>{option.hint}</em>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </Tabs.Content>

              <Tabs.Content className="edit-section-panel" value="steps">
                <section className="step-editor" aria-label={isDailyCheckin ? "打卡项" : "步骤"}>
                  <div className="step-editor-head">
                    <span>{isDailyCheckin ? "打卡项" : "步骤"}</span>
                    <button type="button" onClick={addStep}>
                      <Icon name="plus" />
                      <em>添加</em>
                    </button>
                  </div>
                  <div className="step-template-row" aria-label="步骤模板">
                    {stepTemplates.map((template) => (
                      <button key={template.id} type="button" onClick={() => addStepTemplate(template.id)}>
                        <Icon name={template.icon} />
                        <span>{template.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="step-editor-list">
                    {formSteps.length ? (
                      <div className="step-editor-droppable" ref={stepListRef}>
                        {formSteps.map((step, index) => (
                          <div
                            key={fields[index]?.formId || step.id}
                            data-step-id={step.id}
                            className={cx("step-editor-row", dragStepId === step.id && "is-dragging")}
                            style={{ "--step-owner": stepOwnerMeta(step, profiles, participants).color }}
                          >
                            <input type="hidden" {...register(`steps.${index}.id`)} />
                            <input type="hidden" {...register(`steps.${index}.status`)} />
                            <button
                              className="step-drag"
                              type="button"
                              aria-label={`拖动 ${step.title || `第 ${index + 1} 步`}`}
                              aria-keyshortcuts="ArrowUp ArrowDown"
                              onPointerDown={(event) => startStepDrag(event, step.id)}
                              onMouseDown={(event) => startStepDrag(event, step.id, "mouse")}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowUp") {
                                  event.preventDefault();
                                  moveStep(step.id, -1);
                                } else if (event.key === "ArrowDown") {
                                  event.preventDefault();
                                  moveStep(step.id, 1);
                                }
                              }}
                            >
                              <Icon name="grip" />
                            </button>
                            <div className="step-editor-main">
                              <input
                                className="step-title-input"
                                {...register(`steps.${index}.title`)}
                                placeholder={`第 ${index + 1} 步`}
                                aria-label={`第 ${index + 1} 步`}
                              />
                              <div className="step-meta-controls">
                                <label>
                                  <Icon name="clock" />
                                  <input
                                    type="number"
                                    min="0"
                                    step="5"
                                    {...register(`steps.${index}.estimateMin`)}
                                    aria-label={`${step.title || `第 ${index + 1} 步`} 预计分钟`}
                                  />
                                  <span>分钟</span>
                                </label>
                                <label className="step-owner-field">
                                  <Icon name="users" />
                                  <EditorSelect
                                    value={step.ownerId || ""}
                                    onValueChange={(value) => setValue(`steps.${index}.ownerId`, value, { shouldDirty: true, shouldValidate: true })}
                                    options={stepOwnerChoices}
                                    ariaLabel={`${step.title || `第 ${index + 1} 步`} 负责人`}
                                  />
                                </label>
                              </div>
                            </div>
                            <div className="step-row-actions">
                              <IconButton icon="chevronUp" label="上移" onClick={() => moveStep(step.id, -1)} disabled={index === 0} />
                              <IconButton icon="chevronDown" label="下移" onClick={() => moveStep(step.id, 1)} disabled={index === formSteps.length - 1} />
                              <IconButton icon="trash" label="删除" danger onClick={() => removeStep(step.id)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button className="step-editor-empty" type="button" onClick={addStep}>
                        <Icon name="plus" />
                        <span>添加第一步</span>
                      </button>
                    )}
                  </div>
                </section>
              </Tabs.Content>
            </Tabs.Root>
            <div className="sheet-actions">
              <IconButton
                icon="check"
                label={isSubmitting ? "保存中" : isDirty ? "保存修改" : card.isDraft ? "创建生活卡" : "已保存"}
                type="submit"
                primary
                disabled={isSubmitting || (!isDirty && !card.isDraft)}
                className="save-button"
              />
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

function ConfirmDialog({ request, onCancel, onConfirm }) {
  if (!request) return null;
  return (
    <Dialog.Root open onOpenChange={(nextOpen) => {
      if (!nextOpen) onCancel();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="confirm-dialog-backdrop" />
        <Dialog.Content className={cx("confirm-dialog", request.tone && `is-${request.tone}`)} aria-describedby={request.body ? "confirm-dialog-body" : undefined}>
          <Dialog.Title className="confirm-dialog-title">
            <span>
              <Icon name={request.icon || "check"} />
            </span>
            <strong>{request.title}</strong>
          </Dialog.Title>
          {request.body ? <p id="confirm-dialog-body">{request.body}</p> : null}
          <div className="confirm-dialog-actions">
            <button type="button" onClick={onCancel}>{request.cancelLabel || "取消"}</button>
            <button className="is-primary" type="button" onClick={onConfirm}>{request.confirmLabel || "确认"}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailActionRow({ actions = [], onAction, secondary = false }) {
  if (!actions.length) return null;
  return (
    <div className={cx("detail-action-row", secondary && "is-secondary")} aria-label={secondary ? "更多操作" : "操作"}>
      {actions.map((action) => (
        <button
          key={`${action.type}-${action.label}`}
          className={cx(action.type === "toggle-card" && "is-primary", action.type === "timer-card" && "is-tool", action.type === "set-card-priority" && "is-warm")}
          type="button"
          onClick={() => onAction(action)}
        >
          <Icon name={action.icon} />
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function DetailRows({ rows = [], secondary = false }) {
  if (!rows.length) return null;
  return (
    <div className={cx("detail-rows", secondary && "is-secondary")}>
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className={cx(row.wide && "is-wide")}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DetailSectionGroups({ sections = [], profiles, onAction, secondary = false }) {
  if (!sections.length) return null;
  return (
    <div className={cx("detail-card-groups", secondary && "is-secondary")}>
      {sections.map((section) => (
        <section className="dynamic-list detail-card-group" key={section.title}>
          <div className="dynamic-list-head">
            <strong>{section.title}</strong>
            <span>{section.rows.length}</span>
          </div>
          <div className="dynamic-rows">
            {section.rows.map((row) => {
              const content = (
                <>
                  <AvatarPair profiles={profiles} ids={row.ownerIds} />
                  <span>
                    <strong>{row.title}</strong>
                    {row.subtitle ? <em>{row.subtitle}</em> : null}
                  </span>
                  {row.action ? <Icon name="chevronRight" /> : <i aria-hidden="true" />}
                </>
              );
              return row.action ? (
                <button
                  className={cx("dynamic-row detail-card-row", row.active && "is-active")}
                  type="button"
                  key={row.id}
                  onClick={() => onAction(row.action)}
                >
                  {content}
                </button>
              ) : (
                <div className={cx("dynamic-row detail-card-row", row.active && "is-active")} key={row.id}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function DetailDrawer({ detail, profiles, onClose, onAction }) {
  const ownerIds = detail.ownerIds?.length ? detail.ownerIds : profiles.map((profile) => profile.id).slice(0, 2);
  const moreActions = detail.moreActions || [];
  const moreRows = detail.moreRows || [];
  const moreSections = detail.moreSections || [];
  const hasMore = moreActions.length || moreRows.length || moreSections.length;
  return (
    <Dialog.Root open onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-backdrop detail-backdrop" />
        <Dialog.Content className="detail-drawer" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{detail.title}</Dialog.Title>
        <span className="sheet-handle" aria-hidden="true" />
        <div className="detail-head">
          <div className="detail-id">
            <AvatarPair profiles={profiles} ids={ownerIds} />
            <span>{detail.label}</span>
          </div>
          <div className="sheet-icon-actions">
            <IconButton icon="x" label="关闭" onClick={onClose} />
          </div>
        </div>
        <div className="detail-title-block">
          {detail.date ? <em>{detail.date}</em> : null}
          <h2>{detail.title}</h2>
          {detail.body ? <p>{detail.body}</p> : null}
        </div>
        <DetailActionRow actions={detail.actions || []} onAction={onAction} />
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
        <DetailRows rows={detail.rows || []} />
        {detail.steps?.length ? (
          <div className="detail-steps" aria-label={detail.stepsLabel || "步骤"}>
            {detail.steps.map((step) => {
              const content = (
                <>
                  <span className={cx("step-dot", step.done && "is-done")}>
                    <Icon name={step.done ? "check" : "circle"} />
                  </span>
                  <span>
                    <strong>{step.title}</strong>
                    <em>
                      {step.owner ? <b>{step.owner}</b> : null}
                      {step.state ? <i>{step.state}</i> : null}
                      {step.hint ? <small>{step.hint}</small> : null}
                    </em>
                  </span>
                  {step.ownerIds?.length ? <AvatarPair profiles={profiles} ids={step.ownerIds} /> : null}
                </>
              );
              return step.action ? (
                <button key={step.id} className={cx("detail-step", step.done && "is-done")} type="button" onClick={() => onAction(step.action)}>
                  {content}
                </button>
              ) : (
                <div key={step.id} className={cx("detail-step", step.done && "is-done")}>
                  {content}
                </div>
              );
            })}
          </div>
        ) : null}
        <DetailSectionGroups sections={detail.sections || []} profiles={profiles} onAction={onAction} />
        {hasMore ? (
          <details className="detail-more">
            <summary>
              <span><Icon name="more" />更多</span>
              <em>细项</em>
            </summary>
            <DetailActionRow actions={moreActions} onAction={onAction} secondary />
            <DetailRows rows={moreRows} secondary />
            <DetailSectionGroups sections={moreSections} profiles={profiles} onAction={onAction} secondary />
          </details>
        ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NightNoticeBanner({ notice, onOpen }) {
  return (
    <button className="night-notice" type="button" onClick={onOpen}>
      <Icon name="moon" />
      <span>{notice.text}</span>
      <Icon name="chevronRight" />
    </button>
  );
}

function CatNoticePage({ profiles, currentUser, now, data, request, setData, setSelectedDate }) {
  const [variant, setVariant] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const notice = useMemo(() => buildCatNotice(now, variant, data), [now, variant, data]);
  const targetProfile = useMemo(() => profiles.find((profile) => profile.id !== currentUser?.id) || profiles[0] || null, [profiles, currentUser?.id]);
  const catWords = useMemo(() => (data?.captures || [])
    .filter((capture) => capture.rawKind === "cat-word" && cleanNoticeBit(capture.text, 120))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [data?.captures]);
  const latestReceived = catWords.find((word) => word.createdBy && word.createdBy !== currentUser?.id);
  const latestSent = catWords.find((word) => word.createdBy === currentUser?.id);
  useEffect(() => setVariant(0), [notice.period, notice.date]);

  function beginEdit(text = notice.text) {
    setDraft(cleanStoryText(text) || notice.text);
    setSendError("");
    setEditing(true);
  }

  async function sendWord(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError("");
    try {
      const result = await request("/api/couple/capture", {
        method: "POST",
        body: {
          date: notice.date,
          text,
          mode: "save",
          visibility: "shared",
          rawKind: "cat-word",
          rawFormat: "text/cat-word",
          analysisIntent: "gift",
        },
      });
      if (result?.state) {
        setData(result.state);
        setSelectedDate(result.state.selectedDate || notice.date);
      }
      setEditing(false);
    } catch (error) {
      setSendError(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="cat-note-page">
      <div className="page-head">
        <div>
          <p className="kicker">{notice.isNightLocked ? "夜间" : notice.title}</p>
          <h1>猫猫的话</h1>
        </div>
        <div className="cat-note-actions">
          <IconButton icon="edit" label="自己编辑" onClick={() => beginEdit()} />
          <IconButton icon="refresh" label={notice.isNightLocked ? "夜间固定" : "换一句"} onClick={() => setVariant((value) => value + 1)} disabled={notice.isNightLocked || editing} />
        </div>
      </div>
      <section className={cx("cat-note-hero", `is-${notice.period}`, notice.kind && `kind-${notice.kind}`, notice.isLong && "is-long", notice.period === "deepNight" && "is-deep-night")}>
        <AvatarPair profiles={profiles} className="avatar-pair-hero cat-note-cats" />
        <span><Icon name={notice.icon} />{notice.title}</span>
        {editing ? (
          <form className="cat-word-compose" onSubmit={sendWord}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="猫猫的话"
              maxLength={180}
              autoFocus
            />
            <div className="cat-word-send-row">
              {sendError ? <em>{sendError}</em> : <span>{targetProfile ? `给 ${targetProfile.displayName}` : "给对方"}</span>}
              <div>
                <IconButton icon="x" label="取消" onClick={() => setEditing(false)} disabled={sending} />
                <IconButton icon="send" label="送给对方" type="submit" primary disabled={sending || !draft.trim()} />
              </div>
            </div>
          </form>
        ) : (
          <h2><BreakableText text={notice.text} /></h2>
        )}
        {!editing ? <p>{notice.detail}</p> : null}
        <div className="cat-note-chips">
          <em><Icon name="clock" />{notice.time}</em>
          <em><Icon name="calendar" />{notice.date}</em>
          <em><Icon name="cloud" />{notice.weather}</em>
        </div>
        {latestReceived || latestSent ? (
          <div className="cat-word-tray">
            {latestReceived ? (
              <CatWordMini word={latestReceived} profiles={profiles} label="收到" />
            ) : null}
            {latestSent ? (
              <CatWordMini word={latestSent} profiles={profiles} label="送出" onClick={() => beginEdit(latestSent.text)} />
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function CatWordMini({ word, profiles, label, onClick }) {
  const profile = profiles.find((item) => item.id === word.createdBy);
  const body = cleanNoticeBit(word.text, 52);
  const content = (
    <>
      <CatAvatar profile={profile} className="is-brand" />
      <span>
        <b>{label}</b>
        <em>{body}</em>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button className="cat-word-mini" type="button" onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="cat-word-mini">{content}</div>;
}

function BreakableText({ text }) {
  return Array.from(String(text || "")).map((char, index) => (
    <span className="break-char" key={`${char}-${index}`}>{char}</span>
  ));
}

function buildDayContextChips(dayContext, fallbackCalendar) {
  const context = dayContext || {};
  const weather = context.weather || {};
  const astronomy = context.astronomy || {};
  const moon = astronomy.moon || {};
  const calendar = context.calendar || fallbackCalendar || {};
  const marks = Array.isArray(calendar.marks) ? calendar.marks : [];
  const solarTerm = cleanStoryText(calendar.solarTerm) ||
    cleanStoryText(marks.find((mark) => mark.type === "solarTerm")?.title || marks.find((mark) => mark.type === "solarTerm")?.label);
  const festivals = Array.isArray(calendar.festivals)
    ? calendar.festivals.map(cleanStoryText).filter(Boolean)
    : marks
        .filter((mark) => ["festival", "holiday"].includes(mark.type))
        .map((mark) => cleanStoryText(mark.title || mark.label))
        .filter(Boolean);
  const moonLabel = cleanStoryText(astronomy.moonLabel || moon.label);
  const illumination = Math.round(Number(astronomy.moonIllumination ?? moon.illumination) || 0);
  const lunar = cleanStoryText(calendar.lunar);
  const weatherLabel = cleanStoryText(weather.label);
  const chips = [];
  const seen = new Set();
  const addChip = (chip) => {
    const text = cleanStoryText(chip?.text);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    chips.push({ ...chip, text });
  };

  if (weatherLabel) {
    addChip({
      key: "weather",
      icon: weather.icon || (weather.isSunny ? "sun" : "cloud"),
      text: weatherLabel,
      tone: weather.isSunny ? "sunny" : weather.tone || "weather",
    });
  }
  if (weather.isSunny) {
    addChip({ key: "sunny", icon: "sun", text: "晴", tone: "sunny" });
  }
  if (moonLabel) {
    addChip({
      key: "moon",
      icon: "moon",
      text: illumination ? `${moonLabel} ${illumination}%` : moonLabel,
      tone: "moon",
    });
  }
  if (solarTerm) {
    addChip({ key: "solar", icon: "sparkle", text: solarTerm, tone: "solar" });
  }
  festivals.slice(0, 2).forEach((festival, index) => {
    addChip({ key: `festival-${index}`, icon: "star", text: festival, tone: "festival" });
  });
  if (lunar && chips.length < 5) {
    addChip({ key: "lunar", icon: "calendar", text: lunar, tone: "lunar" });
  }
  if (calendar.isRestDay && chips.length < 5) {
    addChip({ key: "rest", icon: "moon", text: "休", tone: "rest" });
  }

  return chips.slice(0, 6);
}

function StoryDayContext({ dayContext, calendarContext, className = "" }) {
  const chips = buildDayContextChips(dayContext, calendarContext);
  if (!chips.length) return null;
  return (
    <div className={cx("story-day-context", className)} aria-label="当天上下文">
      {chips.map((chip) => (
        <span className={cx(chip.tone && `is-${chip.tone}`)} key={chip.key} title={chip.text}>
          <Icon name={chip.icon} />
          <em>{chip.text}</em>
        </span>
      ))}
    </div>
  );
}

function DailySummaryPage({ data, profiles, currentUser, request, setData, selectedDate, chooseDate, openDetail }) {
  const [pulse, setPulse] = useState(() => data.diaryDay?.userDays?.[currentUser?.id] || {});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshMessage, setRefreshMessage] = useState("");
  const summary = data.dailySummary;
  const dayContext = summary?.dayContext || data.dayContext || null;
  const title = storyDisplayTitle(summary, selectedDate);
  const narrative = cleanStoryText(summary?.narrative);
  const nextStep = cleanStoryText(summary?.nextStep);
  const titleIsDate = title === selectedDate;
  const context = useMemo(() => ({ profiles, currentUser, selectedDate }), [profiles, currentUser, selectedDate]);
  const selectedCards = useMemo(() => sortCards((data.scheduleItemCards || []).filter((card) => card.date === selectedDate && !isDefaultPromptCard(card))), [data.scheduleItemCards, selectedDate]);
  const selectedMemories = useMemo(() => (data.memoryItems || []).filter((item) => item.suggestedDate === selectedDate || String(item.updatedAt || "").slice(0, 10) === selectedDate).slice(0, 8), [data.memoryItems, selectedDate]);
  const completedRows = useMemo(() => (summary?.completed?.length ? summary.completed : selectedCards.filter(isCompletedCard)).slice(0, 8).map((item) => {
    if (item.sourceType) return lifeCardRow(item, context);
    return summaryRow(item, "完成", context);
  }).filter((row) => cleanStoryText(row.title)), [summary?.completed, selectedCards, context]);
  const missedRows = useMemo(() => (summary?.missed?.length ? summary.missed : selectedCards.filter((card) => !isCompletedCard(card))).slice(0, 8).map((item) => {
    if (item.sourceType) return lifeCardRow(item, context);
    return summaryRow(item, "待推进", context);
  }).filter((row) => cleanStoryText(row.title)), [summary?.missed, selectedCards, context]);
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
    return captures
      .filter((capture) => cleanStoryText(capture.text) || capture.assets?.length)
      .slice(0, 8)
      .map((capture) => captureRow(capture, context));
  }, [summary?.moments, data.captures, context, selectedDate]);
  const memoryRows = useMemo(() => {
    const hooks = summary?.memoryHooks?.length ? summary.memoryHooks : selectedMemories;
    return hooks.slice(0, 8).map((item) => item.group ? memoryRow(item, context) : summaryRow(item, "记忆", context));
  }, [summary?.memoryHooks, selectedMemories, context]);
  const analysis = summary?.analysis || {};
  const keyMoment = analysis.keyMoment?.text || analysis.keyMoment?.title
    ? analysis.keyMoment
    : null;
  const diary = analysis.diary?.text
    ? analysis.diary
    : { title: titleIsDate ? "日记" : title, text: narrative };
  const coreContributionItems = analysis.coreContributions?.length
    ? analysis.coreContributions
    : (summary?.people || [])
        .filter((person) => person.smallAchievement)
        .map((person) => ({
          title: person.displayName,
          detail: person.smallAchievement,
          userIds: [person.userId],
          evidence: ["核心贡献"],
        }));
  const carryForwardItems = analysis.carryForward?.length
    ? analysis.carryForward
    : missedRows.slice(0, 3).map((row) => ({
        title: row.title,
        detail: nextStep,
        userIds: row.ownerIds || [],
        evidence: [row.subtitle].filter(Boolean),
      }));
  const memoryClueItems = analysis.memoryClues?.length
    ? analysis.memoryClues
    : memoryRows.slice(0, 3).map((row) => ({
        title: row.title,
        detail: row.subtitle,
        userIds: row.ownerIds || [],
        evidence: ["长期记忆"],
      }));
  const dailyReview = analysis.dailyReview || {};
  const shortcomingFallbackItems = missedRows.slice(0, 3).map((row) => ({
    title: row.title,
    detail: row.subtitle || nextStep,
    userIds: row.ownerIds || [],
    evidence: ["待推进"],
  }));
  const reviewDid = reviewEntryOrFallback(dailyReview.did, coreContributionItems, "小小推进");
  const reviewShortcoming = reviewEntryOrFallback(dailyReview.shortcoming, shortcomingFallbackItems, "还差一点");
  const reviewTomorrow = reviewEntryOrFallback(dailyReview.tomorrow, carryForwardItems, "明天带上");
  const completionTimeline = (summary?.completionTimeline || []).slice(0, 12);
  const visibleCardTotal = Math.max(selectedCards.length, completedRows.length + missedRows.length);
  const sourceStats = [
    { key: "done", icon: "check", label: "完成", value: visibleCardTotal ? `${completedRows.length}/${visibleCardTotal}` : "0" },
    { key: "captures", icon: "camera", label: "随手记", value: momentRows.length },
    { key: "memory", icon: "bookmark", label: "记忆", value: Math.max(memoryRows.length, memoryClueItems.length) },
    { key: "photos", icon: "image", label: "照片", value: summary?.photos?.length ?? 0 },
  ];
  useEffect(() => {
    setPulse(data.diaryDay?.userDays?.[currentUser?.id] || {});
  }, [data.diaryDay, currentUser?.id]);

  async function waitForSummaryJob(jobId) {
    for (let attempt = 0; attempt < 220; attempt += 1) {
      const result = await request(`/api/jobs/${encodeURIComponent(jobId)}`);
      const job = result?.job;
      if (job?.status === "completed") return job.result;
      if (job?.status === "failed") throw new Error(job.error || "Agent 生成失败");
      await new Promise((resolve) => window.setTimeout(resolve, attempt < 8 ? 700 : 1300));
    }
    throw new Error("Agent 生成超时");
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    setRefreshMessage("生成中");
    try {
      const result = await request("/api/couple/daily-summary/refresh", {
        method: "POST",
        body: { date: selectedDate, useAgent: true, requireAgent: true, async: true, timeoutMs: 180000 },
      });
      if (result?.jobId) {
        const jobResult = await waitForSummaryJob(result.jobId);
        if (jobResult?.state) setData(jobResult.state);
      } else if (result?.state) {
        setData(result.state);
      }
      setRefreshMessage("已生成");
    } catch (error) {
      setRefreshError(error.message || "Agent 未生成");
    } finally {
      setRefreshing(false);
      window.setTimeout(() => setRefreshMessage(""), 1200);
    }
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

  const generatedLabel = summary?.generatedAt ? compactDateTime(summary.generatedAt) : "";
  const visibleDiary = cleanStoryText(diary.text || narrative);
  const hasReviewLines = [keyMoment, reviewDid, reviewShortcoming, reviewTomorrow].some(hasAnalysisEntry) || memoryClueItems.length > 0;

  return (
    <section className="story-page">
      <div className="page-head">
        <div className="story-heading">
          <h1>猫猫日记</h1>
        </div>
        <div className="story-head-actions">
          {refreshError ? <span>{refreshError}</span> : null}
          <IconButton icon={refreshing ? "refresh" : "sparkle"} label="Agent 生成" onClick={refresh} disabled={refreshing} className={refreshing ? "is-spinning" : ""} />
        </div>
      </div>
      <DateRail selectedDate={selectedDate} chooseDate={chooseDate} />
      {summary ? (
        <article className="story-journal">
          <div className="story-journal-top">
            <div className="story-journal-art">
              {summary.illustration?.type === "photo" && summary.illustration.url ? <img src={summary.illustration.url} alt={summary.illustration.alt || "当天照片"} /> : <AvatarPair profiles={data.profiles} className="avatar-pair-story story-cats" />}
            </div>
            <div className="story-journal-meta">
              <span title={summaryModeLabel(summary.mode)}><Icon name="sparkle" /></span>
              {generatedLabel ? <time>{generatedLabel}</time> : null}
            </div>
            <StoryDayContext dayContext={dayContext} calendarContext={data.calendarContext} />
          </div>
          {visibleDiary ? (
            <section className="story-journal-diary">
              <h2>{diary.title || title}</h2>
              <p>{visibleDiary}</p>
            </section>
          ) : null}
          <CompletionTimeline rows={completionTimeline} profiles={profiles} selectedDate={selectedDate} />
          {hasReviewLines ? (
            <div className="story-journal-lines">
              <JournalLine icon="star" label="最开心" entry={keyMoment} profiles={profiles} />
              <JournalLine icon="check" label="今天做了什么" entry={reviewDid} profiles={profiles} />
              <JournalLine icon="edit" label="有什么不足" entry={reviewShortcoming} profiles={profiles} />
              <JournalLine icon="calendar" label="明天可以怎么做" entry={reviewTomorrow} profiles={profiles} />
              <JournalList icon="bookmark" label="记忆" entries={memoryClueItems} profiles={profiles} />
            </div>
          ) : null}
        </article>
      ) : (
        <section className="story-journal story-journal-empty">
          <div className="story-journal-top">
            <div className="story-journal-art">
              <AvatarPair profiles={data.profiles} className="avatar-pair-story story-cats" />
            </div>
            <div className="story-journal-meta">
              <span><Icon name="sparkle" /></span>
            </div>
            <IconButton icon={refreshing ? "refresh" : "sparkle"} label="生成日总结" onClick={refresh} disabled={refreshing} className={refreshing ? "is-spinning" : ""} />
            <StoryDayContext dayContext={dayContext} calendarContext={data.calendarContext} />
          </div>
          <section className="story-journal-diary">
            <h2>等猫猫整理</h2>
          </section>
        </section>
      )}
      {summary ? (
        <details className="journal-source-fold">
          <summary>
            <span>
              <Icon name="more" />
              <strong>线索</strong>
            </span>
            <JournalStats stats={sourceStats} />
            <Icon name="chevronDown" />
          </summary>
          <DailySummarySourceStrip stats={sourceStats} locations={summary?.locations || []} note={nextStep || summary?.qualityNote} dayContext={dayContext} calendarContext={data.calendarContext} />
        </details>
      ) : null}
      <details className="pulse-fold">
        <summary>
          <CatAvatar profile={currentUser} className="is-mini" />
          <span><Icon name="star" /><Icon name="check" /><Icon name="edit" /></span>
          <Icon name="chevronDown" />
        </summary>
        <form className="pulse-strip" onSubmit={savePulse}>
          <input type="number" min="1" max="10" value={pulse.dailyScore || ""} onChange={(event) => setPulse({ ...pulse, dailyScore: event.target.value })} aria-label="今日打分" placeholder="/10" />
          <input value={pulse.happiestThing || ""} onChange={(event) => setPulse({ ...pulse, happiestThing: event.target.value })} aria-label="最开心的事" placeholder="最开心的事" />
          <input value={pulse.smallAchievement || ""} onChange={(event) => setPulse({ ...pulse, smallAchievement: event.target.value })} aria-label="核心贡献" placeholder="核心贡献" />
          <IconButton icon="check" label="保存状态" type="submit" primary />
        </form>
      </details>
      <CollapsibleSourceList title="随手记" rows={momentRows} profiles={profiles} onOpen={(row) => openDetail(row.type, row.payload)} />
    </section>
  );
}

function CollapsibleSourceList({ title, rows, profiles, onOpen }) {
  if (!rows?.length) return null;
  return (
    <details className="story-evidence">
      <summary>
        <span>
          <Icon name="camera" />
          <strong>{title}</strong>
        </span>
        <em>{rows.length}</em>
        <Icon name="chevronDown" />
      </summary>
      <div className="story-evidence-rows">
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
    </details>
  );
}

function JournalStats({ stats }) {
  const visible = (stats || []).filter((item) => {
    const value = String(item?.value ?? "").trim();
    return value && value !== "0" && value !== "0/0";
  });
  if (!visible.length) return null;
  return (
    <div className="journal-stats" aria-label="来源">
      {visible.map((item) => (
        <span key={item.key} title={`${item.label} ${item.value}`} aria-label={`${item.label} ${item.value}`}>
          <Icon name={item.icon} />
          <b>{item.value}</b>
          <em>{item.label}</em>
        </span>
      ))}
    </div>
  );
}

function CompletionTimeline({ rows, profiles, selectedDate }) {
  if (!rows?.length) return null;
  return (
    <section className="completion-timeline" aria-label="完成时间轴">
      <div className="completion-timeline-head">
        <Icon name="clock" />
        <strong>完成时间轴</strong>
      </div>
      <div className="completion-timeline-list">
        {rows.map((row) => {
          const actor = userDisplayName(row.actorId, profiles, "有人");
          const target = userDisplayName(row.targetUserId || row.actorId, profiles, actor);
          const proxy = row.actorId && row.targetUserId && row.actorId !== row.targetUserId;
          const taskDate = taskDateLabel(row.taskDate, selectedDate);
          const stepTitle = cleanCardText(row.stepTitle || "");
          return (
            <article key={row.id || `${row.completedAt}-${row.title}`}>
              <time>{completionTimeLabel(row.completedAt, selectedDate)}</time>
              <span>
                <strong>{row.title}</strong>
                {stepTitle ? <b>{stepTitle}</b> : null}
                <em>
                  {taskDate ? `${taskDate}的任务` : "任务"}
                  {" · "}
                  {proxy ? `${actor}帮${target}完成` : `${target}完成`}
                </em>
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function JournalLine({ icon, label, entry, profiles }) {
  const title = analysisTitle(entry);
  const detail = analysisDetail(entry);
  if (!title && !detail) return null;
  return (
    <section className="journal-line">
      <span className="journal-line-icon" title={label} aria-label={label}>
        <Icon name={icon} />
      </span>
      <div>
        <article>
          {title ? <h3>{title}</h3> : null}
          {title && detail && detail !== title ? <p>{detail}</p> : null}
          {!title && detail ? <h3>{detail}</h3> : null}
        </article>
      </div>
      <AvatarPair profiles={profiles} ids={analysisUserIds(entry)} />
    </section>
  );
}

function JournalList({ icon, label, entries, profiles }) {
  const rows = (entries || [])
    .map((entry) => ({
      entry,
      title: analysisTitle(entry),
      detail: analysisDetail(entry),
    }))
    .filter((row) => row.title || row.detail)
    .slice(0, 3);
  const ownerIds = [...new Set(rows.flatMap((row) => analysisUserIds(row.entry)))];
  if (!rows.length) return null;
  return (
    <section className="journal-line">
      <span className="journal-line-icon" title={label} aria-label={label}>
        <Icon name={icon} />
      </span>
      <div>
        {rows.map((row, index) => {
          const title = row.title || shortText(row.detail, 18);
          const detail = row.detail && row.detail !== title ? row.detail : "";
          return (
            <article key={`${label}-${title}-${index}`}>
              {title ? <h3>{title}</h3> : null}
              {detail ? <p>{detail}</p> : null}
            </article>
          );
        })}
      </div>
      <AvatarPair profiles={profiles} ids={ownerIds} />
    </section>
  );
}

function DailySummarySourceStrip({ stats, locations, note, dayContext, calendarContext }) {
  const contextChips = buildDayContextChips(dayContext, calendarContext).slice(0, 4);
  return (
    <div className="story-source-strip">
      {contextChips.map((item) => (
        <span key={`context-${item.key}`}>
          <Icon name={item.icon} />
          <b>{item.text}</b>
        </span>
      ))}
      {(stats || []).map((item) => (
        <span key={item.key}>
          <Icon name={item.icon} />
          <b>{item.label}</b>
          <em>{item.value}</em>
        </span>
      ))}
      {locations?.length ? (
        <span className="is-wide">
          <Icon name="calendar" />
          <b>地点</b>
          <em>{locations.slice(0, 2).join("、")}</em>
        </span>
      ) : null}
      {cleanStoryText(note) ? (
        <span className="is-note">
          <Icon name="bookmark" />
          <em>{shortText(note, 86)}</em>
        </span>
      ) : null}
    </div>
  );
}

function analysisUserIds(entry) {
  return Array.isArray(entry?.userIds) ? entry.userIds : Array.isArray(entry?.user_ids) ? entry.user_ids : [];
}

function analysisTitle(entry, fallback = "") {
  return cleanStoryText(entry?.title || "") || cleanStoryText(fallback) || cleanCardText(fallback);
}

function analysisDetail(entry) {
  return cleanStoryText(entry?.text || entry?.detail || "");
}

function hasAnalysisEntry(entry) {
  return Boolean(analysisTitle(entry) || analysisDetail(entry));
}

function reviewEntryOrFallback(entry, fallbackItems, fallbackTitle) {
  if (hasAnalysisEntry(entry)) return entry;
  const rows = (fallbackItems || []).filter(hasAnalysisEntry).slice(0, 2);
  if (!rows.length) return null;
  const text = rows.map((row) => {
    const title = analysisTitle(row);
    const detail = analysisDetail(row);
    if (title && detail && title !== detail) return `${title}：${detail}`;
    return title || detail;
  }).filter(Boolean).join("；");
  return {
    title: fallbackTitle,
    text,
    userIds: [...new Set(rows.flatMap((row) => analysisUserIds(row)))],
    evidence: rows.flatMap((row) => Array.isArray(row.evidence) ? row.evidence : []).slice(0, 3),
  };
}

function AnalysisEvidence({ entry }) {
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence.filter(Boolean).slice(0, 3) : [];
  if (!evidence.length) return null;
  return (
    <div className="analysis-evidence">
      {evidence.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function AnalysisSpot({ icon, label, entry, profiles }) {
  const detail = analysisDetail(entry);
  const title = cleanStoryText(entry?.title || "") || (detail ? cleanStoryText(label) : "");
  if (!title && !detail) return null;
  return (
    <section className="analysis-card analysis-spot">
      <div className="analysis-card-head">
        <Icon name={icon} />
        <strong>{label}</strong>
        <AvatarPair profiles={profiles} ids={analysisUserIds(entry)} />
      </div>
      {title ? <h2>{title}</h2> : null}
      {detail ? <p>{detail}</p> : null}
      <AnalysisEvidence entry={entry} />
    </section>
  );
}

function AnalysisList({ icon, label, entries, profiles, muted, accent }) {
  const rows = (entries || []).filter((entry) => analysisTitle(entry) || analysisDetail(entry)).slice(0, 4);
  if (!rows.length) return null;
  return (
    <section className={cx("analysis-card", muted && "is-muted", accent && "is-accent")}>
      <div className="analysis-card-head">
        <Icon name={icon} />
        <strong>{label}</strong>
      </div>
      <div className="analysis-items">
        {rows.map((entry, index) => (
          <article key={`${label}-${analysisTitle(entry, index)}-${index}`}>
            <AvatarPair profiles={profiles} ids={analysisUserIds(entry)} />
            <span>
              <b>{analysisTitle(entry, label)}</b>
              {analysisDetail(entry) ? <em>{analysisDetail(entry)}</em> : null}
            </span>
          </article>
        ))}
      </div>
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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(personalPageSchema),
    defaultValues: page,
    mode: "onBlur",
  });
  const [activeSurface, setActiveSurface] = useState("");
  const memoryItems = data.memoryItems || [];
  const memorySurfaces = useMemo(() => {
    const groups = Object.fromEntries(memorySurfaceDefs.map((item) => [item.key, []]));
    memoryItems.forEach((item) => {
      const key = memorySurfaceKey(item);
      groups[key].push(item);
    });
    return memorySurfaceDefs.map((surface) => ({
      ...surface,
      items: groups[surface.key] || [],
    }));
  }, [memoryItems]);
  const firstFilledSurface = memorySurfaces.find((surface) => surface.items.length) || memorySurfaces[0];
  const selectedSurface = memorySurfaces.find((surface) => surface.key === activeSurface) || firstFilledSurface;
  const featuredMemory = selectedSurface?.items?.[0] || null;
  const listedMemories = (selectedSurface?.items || []).slice(featuredMemory ? 1 : 0, featuredMemory ? 9 : 8);
  useEffect(() => reset(page), [page.userId, page.updatedAt, reset]);

  const save = handleSubmit(async (values) => {
    const result = await request("/api/couple/personal-page", {
      method: "POST",
      body: { date: selectedDate, ...values },
    });
    if (result) {
      setData(result.state);
      reset(values);
      toast.success("长期记忆已保存");
    }
  });

  return (
    <section className="memory-page">
      <div className="page-head">
        <div>
          <h1>长期记忆</h1>
        </div>
      </div>
      <section className="memory-hub">
        <div className="memory-switch" aria-label="长期记忆分类">
          {memorySurfaces.map((surface) => (
            <button
              className={cx(surface.key === selectedSurface.key && "is-active")}
              key={surface.key}
              type="button"
              onClick={() => setActiveSurface(surface.key)}
              aria-pressed={surface.key === selectedSurface.key}
            >
              <Icon name={surface.icon} />
              <span>
                <strong>{surface.title}</strong>
                <em>{surface.caption}</em>
              </span>
              <b className={cx(!surface.items.length && "is-empty")}>{surface.items.length || ""}</b>
            </button>
          ))}
        </div>
        <div className="memory-stage">
          <div className="memory-stage-head">
            <span><Icon name={selectedSurface.icon} />{selectedSurface.title}</span>
            {selectedSurface.items.length ? <strong>{selectedSurface.items.length}</strong> : null}
          </div>
          {featuredMemory ? (
            <MemoryItemCard item={featuredMemory} profiles={profiles} currentUser={currentUser} onOpen={() => openDetail("memoryItem", featuredMemory)} featured />
          ) : (
            <EmptyState profiles={profiles} />
          )}
          {listedMemories.length ? (
            <div className="memory-feed">
              {listedMemories.map((item) => (
                <MemoryItemCard key={item.id} item={item} profiles={profiles} currentUser={currentUser} onOpen={() => openDetail("memoryItem", item)} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <details className="memory-editor">
        <summary>
          <CatAvatar profile={currentUser} className="is-mini" />
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
              <textarea rows={4} {...register(key)} />
              {errors[key] ? <em className="field-error">{errors[key].message}</em> : null}
            </label>
          ))}
          <div className="memory-save-row">
            <IconButton icon="check" label={isSubmitting ? "保存中" : isDirty ? "保存长期记忆" : "已保存"} type="submit" primary disabled={isSubmitting || !isDirty} />
          </div>
        </form>
      </details>
    </section>
  );
}

function MemoryItemCard({ item, profiles, currentUser, onOpen, featured = false }) {
  const ids = memoryOwnerIds(item, profiles, currentUser);
  const surface = memorySurfaceDef(memorySurfaceKey(item));
  const dateLabel = item.source === "profile" ? "" : item.suggestedDate;
  return (
    <button className={cx("memory-card", `memory-${item.group || "care"}`, `is-${surface.key}`, featured && "is-featured")} type="button" onClick={onOpen}>
      <div className="memory-card-head">
        <span className="memory-kind"><Icon name={surface.icon} /><b>{item.kindLabel}</b></span>
        {item.actionable ? <Icon name="sparkle" /> : null}
        <AvatarPair profiles={profiles} ids={ids} className="avatar-pair-mini" />
      </div>
      <strong>{item.title}</strong>
      {item.detail ? <p>{item.detail}</p> : null}
      {dateLabel ? (
        <em>{dateLabel}</em>
      ) : null}
    </button>
  );
}

function SettingsPage({ currentUser, profiles, request, setData, selectedDate }) {
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const defaultValues = useMemo(() => ({
    displayName: currentUser?.displayName || "",
    initials: currentUser?.initials || "",
    color: currentUser?.color || "#ff6fa8",
    avatar: currentUser?.avatar || "pink-cat",
  }), [currentUser]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileFormSchema),
    defaultValues,
    mode: "onBlur",
  });
  const form = watch();
  const fileRef = useRef(null);
  useEffect(() => {
    reset(defaultValues);
    setAvatarPreviewUrl("");
  }, [defaultValues, reset]);

  async function chooseAvatarFile(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    setValue("avatar", "custom", { shouldDirty: true, shouldValidate: true });
    setAvatarPreviewUrl(await readFileAsDataUrl(file));
  }

  const save = handleSubmit(async (values) => {
    const file = fileRef.current?.files?.[0] || null;
    const avatarAsset = file ? { name: file.name, dataUrl: await readFileAsDataUrl(file) } : null;
    const result = await request("/api/couple/profile", {
      method: "POST",
      body: { date: selectedDate, ...values, avatarAsset },
    });
    if (result) {
      setData(result.state);
      reset(values);
      toast.success("设置已保存");
    }
  });

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
          <span>
            <CatAvatar profile={preview} className="is-hero" />
            <strong>{form.displayName}</strong>
          </span>
          <IconButton icon="check" label={isSubmitting ? "保存中" : isDirty ? "保存设置" : "已保存"} type="submit" primary disabled={isSubmitting || !isDirty} />
        </div>
        <label className="quiet-field">
          <span>昵称</span>
          <input {...register("displayName")} />
          {errors.displayName ? <em className="field-error">{errors.displayName.message}</em> : null}
        </label>
        <label className="quiet-field">
          <span>短标记</span>
          <input maxLength={2} {...register("initials")} />
          {errors.initials ? <em className="field-error">{errors.initials.message}</em> : null}
        </label>
        <label className="quiet-field">
          <span>颜色</span>
          <input type="color" {...register("color")} />
          {errors.color ? <em className="field-error">{errors.color.message}</em> : null}
        </label>
        <label className="quiet-field">
          <span>头像</span>
          <select
            {...register("avatar")}
            onChange={(event) => {
              const avatar = event.target.value;
              setValue("avatar", avatar, { shouldDirty: true, shouldValidate: true });
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
          {errors.avatar ? <em className="field-error">{errors.avatar.message}</em> : null}
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
            <CatAvatar profile={profile} className="is-mini" />
            <b>{profile.displayName}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
