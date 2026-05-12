const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { contentPath, contentRoot, relativeToContent, repoPath, repoRoot } = require("./lib/runtime-paths.js");

const storePath = contentPath("private", "couple-workspace.json");
const captureAnalysisSchemaPath = repoPath("schemas", "couple-capture-analysis.schema.json");
const dailySummarySchemaPath = repoPath("schemas", "couple-daily-summary.schema.json");
const dailySummarySkillPath = repoPath("skills", "couple-daily-diary", "SKILL.md");

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
const validCaptureDecisions = new Set(["capture", "schedule", "memory", "dailyStory"]);
const validMemoryKinds = new Set(["preference", "wish", "purchase", "promise", "care", "anniversary", "memory", "gratitude", "repair", "identity", "goal", "list"]);
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
  "如果输入同时包含偏好/心愿和具体行动，优先输出 schedule，并把偏好/心愿压进 detail/reason，后端会从 raw 和分析轨迹沉淀记忆。",
  "如果输入是在定义纪念日、周年、生日、在一起、相识、领证、结婚、第一次等重要日期，而不是安排庆祝动作，返回 memory，memoryKind=anniversary。",
  "纪念日定义支持无年份日期，例如“纪念日：1月9日在一起”“1.9 是在一起的日子”；date 用 selectedDate/currentDate 所在年份补齐，repeatRule 用 yearly，ownerId 用 shared，participants 用双方。",
  "纪念日记忆会用于倒计时、今年第几天、提前提醒和准备建议；如果用户明确说要提醒、准备、买礼物、订餐厅、整理照片、写信或庆祝，才返回 schedule，并把 memoryKinds 包含 anniversary，多个准备动作拆进 relatedItems。",
  "如果输入是在新增日常打卡或习惯，例如运动打卡、喝水打卡、每天早睡，返回 schedule 且 itemType=checkin/habit；后端会把它加入当天固定“打卡”生活卡的子项，不要再生成一张独立普通生活卡。",
  "如果输入包含图片，图片也是 raw capture 的一部分；分析图片只能生成轻确认，不能覆盖 raw。",
  "如果图片是截图、手写清单、便签或 todolist，先识别文字与勾选状态，再把未完成的明确行动拆成 schedule/relatedItems；已勾选内容可写入 detail 或 dailyStory，不要当成待办。",
  "如果只是偏好、边界、愿望、承诺或照顾线索，不要强行生成 Schedule Item，返回 memory。",
  "如果只是当天素材、照片说明、情绪片段或回忆，不要强行生成 Schedule Item，返回 dailyStory。",
  "输出轻确认，不直接写入最终生活卡，除非用户确认。",
].join("\n");
const defaultLifeCardTitle = "今天有没有开开心心？";
const dailyCheckinTitle = "一起确认明天的安排";
const dailyCheckinCardTitle = "一起打卡！";
const dailyCheckinCardTag = "daily-checkin-card";
const dailyCheckinDefaultSteps = [
  "确定明天安排",
  "进行体育锻炼",
];
const defaultLifeCardTitleKey = defaultLifeCardTitle.replace(/[？?。!！\s]/g, "");
const placeholderTitleKeys = new Set([
  defaultLifeCardTitle,
  "写下今天最重要的一件事",
  "互相确认今天的状态",
  "一起确认今天的安排",
  dailyCheckinTitle,
  dailyCheckinCardTitle,
].map((value) => value.replace(/[？?。!！\s]/g, "")));
const lowSignalSummaryTitleKeys = new Set(["做别的事", "日记", "今日", "今天", "日总结", "共同回忆"].map((value) => value.replace(/[？?。!！\s]/g, "")));
const badGeneratedSummaryPattern = /值得记住的是|今天最清楚留下来(?:的)?是|今天最值得记住的是|今天的页面很轻|记录留下了\s*\d+\s*条现场线索|完成了\s*今天有没有开开心心|需要顺手带到明天的是\s*今天有没有开开心心|还没有明确完成项|没有明确贡献记录|没有太多具体安排|没有谁完成了什么|没有具体安排|信息不足|数据不足|记录较少|记录里|记录显示|没有显示|做了?别的事|随手记还比较少|先补上|小偏好|自动日总结|每日状态对象|doneUsers|pendingUsers|createdBy|updatedBy|statusUpdatedBy|actorId|targetUserId|status_by_user|source_counts/;
const importantEventPattern = /答辩|考试|面试|汇报|演讲|提交|材料|ddl|deadline|截止|证件|面谈|复试|重要(?!的一件事)/i;
const anniversaryPattern = /纪念日|周年|生日|情人节|七夕|圣诞|跨年|节日|纪念/i;
const anniversaryEventCuePattern = /在一起|认识|相识|领证|结婚|恋爱|第一次|定情|告白|生日/i;
const anniversaryPreparationActionPattern = /提醒|记得|别忘|提前|安排|准备|预案|庆祝|买|订|预约|预订|送|约|写信|写封信|写卡片|整理照片|整理相册|做相册|做礼物|拍照|订餐厅|吃饭|吃顿饭|看电影/i;
const promisePattern = /答应|承诺|说好|我(?:会|来|去|周末|今晚|明天|下次|之后|以后)?[^。！？\n]{0,18}(?:帮你|给你|带你|陪你|替你|负责|弄|整理|修|买|订|处理|搞定)/;
const wishPattern = /想(?:要|去|吃|买|看|体验|喝|逛|试|拍|一起)?|好想|以后想|以后要|想一起/;
const preferencePattern = /喜欢|不喜欢|讨厌|雷区|边界|偏好|好闻|爱吃|不爱|不要太|别太|太吵|安静/;
const gratitudePattern = /谢谢|感谢|辛苦|帮我|帮了|照顾|做了|准备了/;
const repairPattern = /吵架|争执|生气|委屈|难过|不开心|冷战|道歉|修复/;
const actionSchedulePattern = /(?:^|[，,。；;\s])(?:查|查询|搜索|搜|找|看|学习|学|练习|训练|康复|复习|研究|了解|准备|处理|整理|写|做|改|修|预约|联系|发|问|读)[^。！？\n]{0,80}|视频|资料|教程|攻略/i;
const fullDatePattern = /(?:^|[^\d])(\d{4})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?(?!\d)/;
const fullDateReplacePattern = /\d{4}\s*(?:年|[./-])\s*\d{1,2}\s*(?:月|[./-])\s*\d{1,2}\s*日?/g;
const dayRolloverHour = 3;
const solarTermNames = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑",
  "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];
const solarTermInfo = [0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758];
const solarTermDates2026 = new Map([
  ["2026-01-05", "小寒"],
  ["2026-01-20", "大寒"],
  ["2026-02-04", "立春"],
  ["2026-02-18", "雨水"],
  ["2026-03-05", "惊蛰"],
  ["2026-03-20", "春分"],
  ["2026-04-05", "清明"],
  ["2026-04-20", "谷雨"],
  ["2026-05-05", "立夏"],
  ["2026-05-21", "小满"],
  ["2026-06-05", "芒种"],
  ["2026-06-21", "夏至"],
  ["2026-07-07", "小暑"],
  ["2026-07-23", "大暑"],
  ["2026-08-07", "立秋"],
  ["2026-08-23", "处暑"],
  ["2026-09-07", "白露"],
  ["2026-09-23", "秋分"],
  ["2026-10-08", "寒露"],
  ["2026-10-23", "霜降"],
  ["2026-11-07", "立冬"],
  ["2026-11-22", "小雪"],
  ["2026-12-07", "大雪"],
  ["2026-12-22", "冬至"],
]);
const lunarMonthLabels = ["", "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
const lunarDayLabels = ["", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
const lunarFestivalMap = {
  "1-1": "春节",
  "1-15": "元宵",
  "5-5": "端午",
  "7-7": "七夕",
  "8-15": "中秋",
  "9-9": "重阳",
  "12-8": "腊八",
};
const fixedFestivalMap = {
  "02-14": "情人节",
  "05-20": "520",
  "12-24": "平安夜",
  "12-25": "圣诞",
};
const officialHolidayRanges2026 = [
  ["元旦", "2026-01-01", "2026-01-03"],
  ["春节", "2026-02-15", "2026-02-23"],
  ["清明", "2026-04-04", "2026-04-06"],
  ["劳动节", "2026-05-01", "2026-05-05"],
  ["端午", "2026-06-19", "2026-06-21"],
  ["中秋", "2026-09-25", "2026-09-27"],
  ["国庆", "2026-10-01", "2026-10-07"],
];
const officialWorkdays2026 = new Map([
  ["2026-01-04", "元旦调休"],
  ["2026-02-14", "春节调休"],
  ["2026-02-28", "春节调休"],
  ["2026-05-09", "劳动节调休"],
  ["2026-09-20", "国庆调休"],
  ["2026-10-10", "国庆调休"],
]);
const weatherCodeLabels = new Map([
  [0, "晴"],
  [1, "晴间多云"],
  [2, "多云"],
  [3, "阴"],
  [45, "雾"],
  [48, "雾"],
  [51, "小雨"],
  [53, "小雨"],
  [55, "小雨"],
  [56, "冻雨"],
  [57, "冻雨"],
  [61, "雨"],
  [63, "雨"],
  [65, "大雨"],
  [66, "冻雨"],
  [67, "冻雨"],
  [71, "雪"],
  [73, "雪"],
  [75, "大雪"],
  [77, "雪粒"],
  [80, "阵雨"],
  [81, "阵雨"],
  [82, "强阵雨"],
  [85, "阵雪"],
  [86, "阵雪"],
  [95, "雷雨"],
  [96, "雷雨"],
  [99, "雷雨"],
]);
const fallbackDailyWeather = [
  { label: "小晴天", icon: "sun", tone: "sunny" },
  { label: "软软云", icon: "cloud", tone: "cloudy" },
  { label: "微风", icon: "cloud", tone: "breeze" },
  { label: "安静雨", icon: "cloud", tone: "rain" },
  { label: "月亮亮", icon: "moon", tone: "night" },
  { label: "暖乎乎", icon: "sun", tone: "warm" },
];
const moonPhaseLabels = [
  { label: "新月", icon: "moon", tone: "new" },
  { label: "蛾眉月", icon: "moon", tone: "waxing-crescent" },
  { label: "上弦月", icon: "moon", tone: "first-quarter" },
  { label: "盈凸月", icon: "moon", tone: "waxing-gibbous" },
  { label: "满月", icon: "moon", tone: "full" },
  { label: "亏凸月", icon: "moon", tone: "waning-gibbous" },
  { label: "下弦月", icon: "moon", tone: "last-quarter" },
  { label: "残月", icon: "moon", tone: "waning-crescent" },
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function businessDate(date = new Date()) {
  const shifted = new Date(date);
  if (shifted.getHours() < dayRolloverHour) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return formatDate(shifted);
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

function dayOfYear(dateText) {
  const date = parseDate(normalizeDate(dateText, ""));
  if (!date) return 0;
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - yearStart.getTime()) / 86400000) + 1;
}

function dateInRange(dateText, startText, endText) {
  const date = normalizeDate(dateText, "");
  return Boolean(date && date >= startText && date <= endText);
}

function normalizeDate(dateText, fallback = businessDate()) {
  const value = String(dateText || "").trim();
  return parseDate(value) ? value : fallback;
}

function lunarDateInfo(dateText) {
  const date = parseDate(normalizeDate(dateText, ""));
  if (!date || typeof Intl === "undefined") return null;
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "numeric", day: "numeric" });
    const parts = formatter.formatToParts(date);
    const month = Number(parts.find((part) => part.type === "month")?.value || 0);
    const day = Number(parts.find((part) => part.type === "day")?.value || 0);
    if (!month || !day) return null;
    return {
      month,
      day,
      label: `${lunarMonthLabels[month] || `${month}月`}${lunarDayLabels[day] || `${day}日`}`,
      key: `${month}-${day}`,
    };
  } catch {
    return null;
  }
}

function solarTermForDate(dateText) {
  const date = parseDate(normalizeDate(dateText, ""));
  if (!date) return "";
  const year = date.getFullYear();
  const id = formatDate(date);
  if (year === 2026) return solarTermDates2026.get(id) || "";
  const base = Date.UTC(1900, 0, 6, 2, 5);
  for (let index = 0; index < solarTermNames.length; index += 1) {
    const termDate = new Date(31556925974.7 * (year - 1900) + solarTermInfo[index] * 60000 + base);
    if (formatDate(termDate) === id) return solarTermNames[index];
  }
  return "";
}

function officialHolidayMark(dateText) {
  const date = normalizeDate(dateText, "");
  if (!date) return null;
  const workdayTitle = officialWorkdays2026.get(date);
  if (workdayTitle) {
    return {
      type: "workday",
      tone: "workday",
      icon: "clock",
      label: "班",
      title: workdayTitle,
      detail: "官方调休",
    };
  }
  const holiday = officialHolidayRanges2026.find(([, start, end]) => dateInRange(date, start, end));
  if (!holiday) return null;
  return {
    type: "holiday",
    tone: "holiday",
    icon: "sparkle",
    label: "休",
    title: `${holiday[0]}假期`,
    detail: "官方放假",
  };
}

function calendarContextForDate(dateText) {
  const date = normalizeDate(dateText);
  const parsed = parseDate(date);
  const weekday = parsed ? weekdayLabels[parsed.getDay()] : "";
  const lunar = lunarDateInfo(date);
  const nextLunar = lunarDateInfo(addDays(date, 1));
  const marks = [];
  const officialMark = officialHolidayMark(date);
  const solarTerm = solarTermForDate(date);
  const fixedFestival = fixedFestivalMap[date.slice(5)];
  const lunarFestival = lunar?.key ? lunarFestivalMap[lunar.key] : "";
  const isNewYearEve = nextLunar?.key === "1-1";

  if (officialMark) marks.push(officialMark);
  if (solarTerm) {
    marks.push({
      type: "solarTerm",
      tone: "solar",
      icon: "cloud",
      label: solarTerm,
      title: solarTerm,
      detail: "二十四节气",
    });
  }
  if (lunarFestival || isNewYearEve) {
    const title = isNewYearEve ? "除夕" : lunarFestival;
    marks.push({
      type: "festival",
      tone: "festival",
      icon: "star",
      label: title,
      title,
      detail: lunar?.label || "农历节日",
    });
  }
  if (fixedFestival) {
    marks.push({
      type: "festival",
      tone: "festival",
      icon: "star",
      label: fixedFestival,
      title: fixedFestival,
      detail: "日历节日",
    });
  }

  const isWeekend = parsed ? [0, 6].includes(parsed.getDay()) : false;
  const isWorkday = marks.some((mark) => mark.type === "workday");
  const isHoliday = marks.some((mark) => mark.type === "holiday");
  return {
    date,
    weekday,
    lunar: lunar?.label || "",
    marks,
    isRestDay: !isWorkday && (isHoliday || isWeekend),
    isWorkday,
  };
}

function inferWeatherFromText(text) {
  const value = sanitizeText(text, 500);
  if (!value) return null;
  const patterns = [
    [/雷|闪电|打雷/, { label: "雷雨", icon: "cloud", tone: "storm" }],
    [/暴雨|大雨|下大雨/, { label: "大雨", icon: "cloud", tone: "rain" }],
    [/下雨|雨天|小雨|阵雨|淋雨/, { label: "下雨", icon: "cloud", tone: "rain" }],
    [/下雪|雪天|小雪|大雪/, { label: "下雪", icon: "cloud", tone: "snow" }],
    [/晴|太阳|晒|阳光/, { label: "晴天", icon: "sun", tone: "sunny" }],
    [/阴天|阴了|阴沉/, { label: "阴天", icon: "cloud", tone: "cloudy" }],
    [/多云|云很多|云朵/, { label: "多云", icon: "cloud", tone: "cloudy" }],
    [/刮风|大风|风很大|微风/, { label: "有风", icon: "cloud", tone: "breeze" }],
    [/雾|雾气|起雾/, { label: "有雾", icon: "cloud", tone: "fog" }],
    [/热|闷热|好热|升温/, { label: "热乎乎", icon: "sun", tone: "warm" }],
    [/冷|降温|好冷|冻/, { label: "冷嗖嗖", icon: "moon", tone: "cold" }],
  ];
  const matched = patterns.find(([pattern]) => pattern.test(value));
  return matched ? { ...matched[1], source: "capture" } : null;
}

function fallbackWeatherForDate(date) {
  const item = fallbackDailyWeather[stableIndex(date, fallbackDailyWeather.length)] || fallbackDailyWeather[0];
  return {
    ...item,
    source: "daily-random",
  };
}

function buildDailyWeather(date, captures = []) {
  const fromCapture = (captures || [])
    .map((capture) => inferWeatherFromText(`${capture.text || ""} ${capture.location || ""}`))
    .find(Boolean);
  if (fromCapture) return fromCapture;
  return fallbackWeatherForDate(date);
}

function moonPhaseForDate(dateText) {
  const parsed = parseDate(normalizeDate(dateText, ""));
  if (!parsed) return { label: "月亮", icon: "moon", tone: "unknown", illumination: 0 };
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const current = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0);
  const lunation = 29.530588853;
  const age = (((current - knownNewMoon) / 86400000) % lunation + lunation) % lunation;
  const phaseIndex = Math.round((age / lunation) * 8) % 8;
  const phase = moonPhaseLabels[phaseIndex] || moonPhaseLabels[0];
  const illumination = Math.round(((1 - Math.cos((2 * Math.PI * age) / lunation)) / 2) * 100);
  return {
    ...phase,
    age: Number(age.toFixed(1)),
    illumination,
  };
}

function buildAstronomyContext(date) {
  const moon = moonPhaseForDate(date);
  return {
    moon,
    moonLabel: moon.label,
    moonIllumination: moon.illumination,
  };
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function isManualContextPart(part) {
  const source = sanitizeText(part?.source, 40);
  return part?.configured === true || source === "manual" || source === "user" || source === "override";
}

function hasContextValue(object) {
  return Boolean(object && typeof object === "object" && Object.values(object).some((value) =>
    value !== undefined && value !== null && value !== ""
  ));
}

function normalizeMoonContext(moon = {}, backupMoon = {}) {
  const source = moon && typeof moon === "object" ? moon : {};
  const backup = backupMoon && typeof backupMoon === "object" ? backupMoon : {};
  const label = cleanGeneratedSummaryText(source.label || backup.label, 80) || "月亮";
  const illumination = Math.max(0, Math.min(100, Math.round(Number(source.illumination ?? backup.illumination) || 0)));
  return {
    label,
    icon: sanitizeText(source.icon || backup.icon || "moon", 40),
    tone: sanitizeText(source.tone || backup.tone || "", 40),
    age: Number.isFinite(Number(source.age ?? backup.age)) ? Number(Number(source.age ?? backup.age).toFixed(1)) : 0,
    illumination,
  };
}

function normalizeDayContext(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const backup = fallback && typeof fallback === "object" ? fallback : {};
  const sourceWeather = source.weather && typeof source.weather === "object"
    ? source.weather
    : {
        label: source.weatherLabel,
        icon: source.weatherIcon,
        tone: source.weatherTone,
        source: source.weatherSource,
        isSunny: source.isSunny ?? source.sunny,
      };
  const weather = hasContextValue(sourceWeather)
    ? sourceWeather
    : backup.weather || {};
  const sourceAstronomy = source.astronomy && typeof source.astronomy === "object"
    ? source.astronomy
    : {
        moon: source.moon,
        moonLabel: source.moonLabel || source.moonPhase,
        moonIllumination: source.moonIllumination,
        source: source.astronomySource,
      };
  const astronomy = hasContextValue(sourceAstronomy)
    ? sourceAstronomy
    : backup.astronomy || {};
  const calendar = source.calendar && typeof source.calendar === "object" ? source.calendar : backup.calendar || {};
  const backupMoon = backup.astronomy?.moon || {};
  const moon = normalizeMoonContext(astronomy.moon, backupMoon);
  const weatherLabel = cleanGeneratedSummaryText(weather.label, 80) || "小天气";
  const weatherIsSunny = normalizeBooleanFlag(
    weather.isSunny,
    /晴|太阳|阳光|小晴天/.test(weatherLabel)
  );
  return {
    date: sanitizeText(source.date || backup.date, 40),
    weather: {
      label: weatherLabel,
      icon: sanitizeText(weather.icon || (weatherIsSunny ? "sun" : "cloud"), 40),
      tone: sanitizeText(weather.tone || "", 40),
      source: sanitizeText(weather.source || "daily-random", 40),
      isSunny: weatherIsSunny,
      configured: weather.configured === true || isManualContextPart(weather),
      updatedBy: sanitizeText(weather.updatedBy, 80),
      updatedAt: sanitizeText(weather.updatedAt, 40),
    },
    astronomy: {
      moonLabel: cleanGeneratedSummaryText(astronomy.moonLabel || moon.label, 80) || "月亮",
      moonIllumination: Math.max(0, Math.min(100, Math.round(Number(astronomy.moonIllumination ?? moon.illumination) || 0))),
      moon,
      source: sanitizeText(astronomy.source || "calculated", 40),
      configured: astronomy.configured === true || isManualContextPart(astronomy),
      updatedBy: sanitizeText(astronomy.updatedBy, 80),
      updatedAt: sanitizeText(astronomy.updatedAt, 40),
    },
    calendar: {
      weekday: sanitizeText(calendar.weekday, 40),
      lunar: sanitizeText(calendar.lunar, 80),
      solarTerm: sanitizeText(calendar.solarTerm, 80),
      festivals: sanitizeList(calendar.festivals, 6, 80),
      marks: Array.isArray(calendar.marks) ? calendar.marks : [],
      isRestDay: calendar.isRestDay === true,
      isWorkday: calendar.isWorkday === true,
      source: sanitizeText(calendar.source || "calculated", 40),
      configured: calendar.configured === true || isManualContextPart(calendar),
    },
    note: cleanGeneratedSummaryText(source.note || backup.note, 180),
    updatedBy: sanitizeText(source.updatedBy || backup.updatedBy, 80),
    updatedAt: sanitizeText(source.updatedAt || backup.updatedAt, 40),
  };
}

function mergeSavedDayContext(savedContext, generatedContext) {
  const generated = normalizeDayContext(generatedContext);
  if (!savedContext || typeof savedContext !== "object") return generated;
  const saved = normalizeDayContext(savedContext, generated);
  return normalizeDayContext({
    ...generated,
    weather: isManualContextPart(saved.weather) ? { ...generated.weather, ...saved.weather } : generated.weather,
    astronomy: isManualContextPart(saved.astronomy) ? { ...generated.astronomy, ...saved.astronomy } : generated.astronomy,
    calendar: isManualContextPart(saved.calendar)
      ? { ...generated.calendar, ...saved.calendar, marks: generated.calendar.marks }
      : generated.calendar,
    note: saved.note || generated.note,
    updatedBy: saved.updatedBy || generated.updatedBy,
    updatedAt: saved.updatedAt || generated.updatedAt,
  }, generated);
}

function buildDayContext(store, date, options = {}) {
  const captures = Array.isArray(options.captures)
    ? options.captures
    : (store?.captures || [])
        .filter((item) => item.date === date)
        .map(publicCapture);
  const calendar = calendarContextForDate(date);
  const weather = buildDailyWeather(date, captures);
  const astronomy = buildAstronomyContext(date);
  const solarTerm = (calendar.marks || []).find((mark) => mark.type === "solarTerm")?.title || "";
  const festivals = (calendar.marks || [])
    .filter((mark) => mark.type === "festival" || mark.type === "holiday")
    .map((mark) => mark.title || mark.label)
    .filter(Boolean);
  const generated = normalizeDayContext({
    date,
    weather,
    astronomy,
    calendar: {
      ...calendar,
      solarTerm,
      festivals,
    },
  });
  const saved = store?.dayContexts?.[date];
  return mergeSavedDayContext(saved, generated);
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

function normalizeIdList(items, maxItems = 16) {
  const raw = Array.isArray(items) ? items : String(items || "").split(/[,\s，、]+/);
  return [...new Set(raw.map((item) => sanitizeText(item, 100)).filter(Boolean))].slice(0, maxItems);
}

function normalizeTagValue(input) {
  return sanitizeText(input, 40)
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .slice(0, 32);
}

function tagListInput(input) {
  if (Array.isArray(input)) return input;
  return String(input || "").split(/[#,，、\s]+/);
}

function inferLifeCardTags(payload = {}) {
  const text = `${payload.title || ""} ${payload.detail || ""} ${payload.slot || ""}`.trim();
  const itemType = normalizeScheduleItemType(payload.itemType, "");
  const tags = [];
  const typeLabel = scheduleItemTypeLabels[itemType];
  if (typeLabel) tags.push(typeLabel);
  if (payload.priority === "high" || /重要|必须|ddl|deadline|截止|答辩|考试|面试/i.test(text)) tags.push("重要");
  if (/tfcc|康复|训练|健身|运动|手腕|疼|医院|复诊/i.test(text)) tags.push("健康");
  if (/作业|论文|学习|复习|读书|课程|考试|答辩|资料|视频|教程/i.test(text)) tags.push("学习");
  if (/工作|会议|项目|需求|客户|面试|汇报|周报/i.test(text)) tags.push("工作");
  if (/日料|餐厅|吃|饭|咖啡|奶茶|甜品/i.test(text)) tags.push("吃喝");
  if (/护手霜|礼物|买|下单|购物|购买/i.test(text)) tags.push("购买");
  if (/纪念日|生日|周年|情人节|七夕/i.test(text) || hasAnniversaryMemorySignal(text)) tags.push("纪念");
  if (/照片|相册|回忆|日记|故事/i.test(text)) tags.push("回忆");
  if (/承诺|答应|说好|帮你|带你|陪你|整理|处理/i.test(text)) tags.push("承诺");
  if (/开心|累|难过|生气|吵架|道歉|情绪/i.test(text)) tags.push("情绪");
  if (/安静|太吵|喜欢|不喜欢|偏好|雷区|边界/i.test(text)) tags.push("偏好");
  return tags.map(normalizeTagValue).filter(Boolean);
}

function normalizeLifeCardTags(input, payload = {}) {
  const explicit = tagListInput(input).map(normalizeTagValue).filter(Boolean);
  return [...new Set([...explicit, ...inferLifeCardTags(payload)])].slice(0, 12);
}

function memoryKindListInput(input) {
  if (Array.isArray(input)) return input;
  return String(input || "").split(/[,\s，、]+/);
}

function inferLifeCardMemoryKinds(payload = {}) {
  const text = `${payload.title || ""} ${payload.detail || ""} ${payload.slot || ""}`.trim();
  const itemType = normalizeScheduleItemType(payload.itemType, "thing");
  const kinds = [];
  if (itemType === "purchase") kinds.push("purchase");
  if (preferencePattern.test(text)) kinds.push("preference");
  if (wishPattern.test(text)) kinds.push(itemType === "purchase" ? "purchase" : "wish");
  if (promisePattern.test(text)) kinds.push("promise");
  if (gratitudePattern.test(text)) kinds.push("gratitude");
  if (repairPattern.test(text)) kinds.push("repair");
  if (anniversaryPattern.test(text) || hasAnniversaryMemorySignal(text)) kinds.push("anniversary");
  if (/照片|相册|回忆|日记|故事/.test(text)) kinds.push("memory");
  if (/照顾|很累|太累|鼓励|材料|证件|奶茶|晚饭|休息/.test(text)) kinds.push("care");
  if (/目标|未来|长期|成为|以后想|以后要/.test(text)) kinds.push("goal");
  return kinds.filter((kind) => validMemoryKinds.has(kind));
}

function normalizeLifeCardMemoryKinds(input, payload = {}) {
  const explicit = memoryKindListInput(input).map((item) => normalizeMemoryKind(item)).filter(Boolean);
  return [...new Set([...explicit, ...inferLifeCardMemoryKinds(payload)])].slice(0, 8);
}

function sanitizeTextMap(input, maxLength = 80) {
  return Object.fromEntries(
    Object.entries(input && typeof input === "object" ? input : {})
      .map(([key, value]) => [sanitizeText(key, 80), sanitizeText(value, maxLength)])
      .filter(([key, value]) => key && value)
  );
}

function normalizedTitleKey(value) {
  return sanitizeText(value, 200).replace(/[？?。!！\s]/g, "");
}

function isDefaultLifeCardTitle(value) {
  const key = normalizedTitleKey(value);
  return key === defaultLifeCardTitleKey || placeholderTitleKeys.has(key);
}

function isLowSignalSummaryTitle(value) {
  return lowSignalSummaryTitleKeys.has(normalizedTitleKey(value));
}

function isGenericSummaryTitle(value) {
  const text = sanitizeText(value, 120);
  if (!text) return false;
  return /^\d{1,2}[/-]\d{1,2}\s*的共同回忆$/.test(text) ||
    /^\d{4}-\d{2}-\d{2}$/.test(text) ||
    /^\d{1,2}\s*月\s*\d{1,2}\s*日(?:的)?(?:共同回忆|日总结)?$/.test(text);
}

function cleanGeneratedSummaryText(input, maxLength = 500) {
  const text = sanitizeText(input, maxLength);
  if (!text) return "";
  if (isDefaultLifeCardTitle(text) || isLowSignalSummaryTitle(text) || isGenericSummaryTitle(text)) return "";
  if (badGeneratedSummaryPattern.test(text) || /^完成\s*\d+\s*\/\s*\d+$/.test(text)) return "";
  return text;
}

function stableIndex(key, size) {
  if (!size) return 0;
  let hash = 0;
  String(key).split("").forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  });
  return hash % size;
}

function titleBit(value, maxLength = 6) {
  const text = cleanGeneratedSummaryText(value, 80)
    .replace(/[「」"“”'《》]/g, "")
    .replace(/[，。！？、,.!?；;：:\n\r]/g, " ")
    .replace(/^(todo|待办|提醒|今天|今日|我们|一起|猫猫|大猫|小猫|把|在)\s*/i, "")
    .replace(/^(今天|今日|把)\s*/g, "")
    .trim();
  if (!text || /^\d+$/.test(text)) return "";
  return text.split(/\s+/)[0].slice(0, maxLength);
}

function titleVariant(date, bit, templates) {
  const list = templates.map((template) => template(bit)).map((item) => cleanGeneratedSummaryText(item, 16)).filter(Boolean);
  return list[stableIndex(`${date}:${bit}`, list.length)] || "";
}

function buildCuteSummaryTitle(facts) {
  const pulses = facts.status_by_user || [];
  const happyBit = titleBit(pulses.find((person) => person.happiestThing)?.happiestThing);
  if (happyBit) {
    return titleVariant(facts.date, happyBit, [
      (bit) => `${bit}发光`,
      (bit) => `${bit}被抱住`,
      (bit) => `${bit}小闪光`,
    ]);
  }

  const contributionBit = titleBit(pulses.find((person) => person.smallAchievement)?.smallAchievement);
  if (contributionBit) {
    return titleVariant(facts.date, contributionBit, [
      (bit) => `${bit}向前挪`,
      (bit) => `${bit}长出小芽`,
      (bit) => `${bit}落地啦`,
    ]);
  }

  const completedBit = titleBit((facts.completed_items || []).find(isMeaningfulSummaryThing)?.title);
  if (completedBit) {
    return titleVariant(facts.date, completedBit, [
      (bit) => `${bit}完成啦`,
      (bit) => `${bit}收进口袋`,
      (bit) => `${bit}有进度`,
    ]);
  }

  const captureBit = titleBit((facts.captures || []).map(meaningfulCaptureText).find(Boolean));
  if (captureBit) {
    return titleVariant(facts.date, captureBit, [
      (bit) => `${bit}小纸条`,
      (bit) => `${bit}留一格`,
      (bit) => `${bit}被记住`,
    ]);
  }

  const locationBit = titleBit(facts.locations?.[0], 5);
  if (locationBit) return `${locationBit}小闪光`;

  if ((facts.relationshipInsights || []).length) return ["小愿望亮灯", "记忆冒小芽", "心事收好"][stableIndex(facts.date, 3)];
  if ((facts.missed_items || []).some(isMeaningfulSummaryThing)) return ["明天的小尾巴", "还有一点点", "轻轻带到明天"][stableIndex(facts.date, 3)];

  return [
    "轻轻的一页",
    "小猫留光日",
    "慢慢亮起来",
    "把今天收好",
    "软软小片刻",
    "今天有小光",
  ][stableIndex(facts.date, 6)];
}

function buildCuteSummaryTitleFromSummary(summary = {}) {
  const people = Array.isArray(summary.people) ? summary.people : [];
  const happyBit = titleBit(people.find((person) => person.happiestThing)?.happiestThing);
  if (happyBit) {
    return titleVariant(summary.date || "", happyBit, [
      (bit) => `${bit}发光`,
      (bit) => `${bit}被抱住`,
      (bit) => `${bit}小闪光`,
    ]);
  }

  const contributionBit = titleBit(people.find((person) => person.smallAchievement)?.smallAchievement);
  if (contributionBit) {
    return titleVariant(summary.date || "", contributionBit, [
      (bit) => `${bit}向前挪`,
      (bit) => `${bit}长出小芽`,
      (bit) => `${bit}落地啦`,
    ]);
  }

  const completedBit = titleBit((Array.isArray(summary.completed) ? summary.completed : []).find(isMeaningfulSummaryThing)?.title);
  if (completedBit) {
    return titleVariant(summary.date || "", completedBit, [
      (bit) => `${bit}完成啦`,
      (bit) => `${bit}收进口袋`,
      (bit) => `${bit}有进度`,
    ]);
  }

  const momentBit = titleBit((Array.isArray(summary.moments) ? summary.moments : []).map((item) => meaningfulCaptureText(item)).find(Boolean));
  if (momentBit) {
    return titleVariant(summary.date || "", momentBit, [
      (bit) => `${bit}小纸条`,
      (bit) => `${bit}留一格`,
      (bit) => `${bit}被记住`,
    ]);
  }

  return [
    "轻轻的一页",
    "小猫留光日",
    "慢慢亮起来",
    "把今天收好",
    "软软小片刻",
    "今天有小光",
  ][stableIndex(summary.date || "", 6)];
}

function normalizeSummaryTitle(summary, fallbackTitle = "") {
  const direct = cleanGeneratedSummaryText(summary?.title, 80);
  if (direct) return direct;
  const analysis = normalizeDailyAnalysis(summary?.analysis);
  const diaryTitle = cleanGeneratedSummaryText(analysis.diary?.title, 80);
  if (diaryTitle) return diaryTitle;
  const keyTitle = cleanGeneratedSummaryText(analysis.keyMoment?.title, 80);
  if (keyTitle) return keyTitle;
  return cleanGeneratedSummaryText(fallbackTitle, 80) || buildCuteSummaryTitleFromSummary(summary);
}

function normalizeDurationMin(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(5, Math.min(1440, Math.round(parsed)));
}

function normalizeManualOrder(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(-1000000, Math.min(1000000, Math.round(parsed)));
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

function formatDateTimeShort(value) {
  const raw = normalizeDateTime(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const date = match[1] === businessDate() ? "今天" : match[1].slice(5).replace("-", "/");
  return `${date} ${match[2]}:${match[3]}`;
}

function durationLabel(minutes) {
  const value = normalizeDurationMin(minutes, 0);
  if (!value) return "";
  if (value < 60) return `${value} 分钟`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
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

function cleanStoredLifeCardStepTitle(title, parentTitle = "") {
  const parent = sanitizeText(parentTitle, 120).replace(/\s+/g, " ").trim();
  let value = sanitizeText(title, 120)
    .replace(/^(?:第?[一二两三四五六七八九十\d]+步|分(?:[一二两三四五六七八九十\d]+)?步|步骤\s*[一二两三四五六七八九十\d]*|step\s*\d*)\s*[:：.、-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  while (parent && value.startsWith(parent)) {
    value = value.slice(parent.length).trim();
  }

  return value
    .replace(/^(?:[:：,，.。;；、\-\s]+)+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLifeCardSteps(steps, participants = [], parentTitle = "") {
  const seen = new Set();
  return (Array.isArray(steps) ? steps : [])
    .map((step, index) => {
      const source = typeof step === "string" ? { title: step } : (step || {});
      const title = cleanStoredLifeCardStepTitle(source.title, parentTitle);
      if (!title) return null;
      const key = normalizedTitleKey(title);
      if (key && seen.has(key)) return null;
      if (key) seen.add(key);
      const ownerId = participants.includes(source.ownerId) ? source.ownerId : "";
      const normalized = {
        id: sanitizeText(source.id, 80) || `step-${index + 1}`,
        title,
        ownerId,
        estimateMin: normalizeDurationMin(source.estimateMin, 0),
        status: validStatuses.has(source.status) ? source.status : "todo",
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index,
      };
      if (source.statusByUser && typeof source.statusByUser === "object" && !Array.isArray(source.statusByUser)) {
        normalized.statusByUser = Object.fromEntries(
          participants.map((id) => [
            id,
            validStatuses.has(source.statusByUser?.[id]) ? source.statusByUser[id] : "todo",
          ])
        );
      }
      if (source.statusUpdatedBy && typeof source.statusUpdatedBy === "object" && !Array.isArray(source.statusUpdatedBy)) {
        normalized.statusUpdatedBy = sanitizeTextMap(source.statusUpdatedBy);
      }
      if (source.statusUpdatedAt && typeof source.statusUpdatedAt === "object" && !Array.isArray(source.statusUpdatedAt)) {
        normalized.statusUpdatedAt = sanitizeTextMap(source.statusUpdatedAt, 40);
      }
      return normalized;
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 8);
}

function cleanInferredLifeCardStepTitle(part, parentTitle = "") {
  const parent = cleanCaptureTitle(parentTitle);
  let value = cleanCaptureTitle(part)
    .replace(/^(?:第?[一二两三四五六七八九十\d]+步|分(?:[一二两三四五六七八九十\d]+)?步|步骤\s*[一二两三四五六七八九十\d]*|step\s*\d*)\s*[:：.、-]?\s*/i, "")
    .trim();

  while (parent && value.startsWith(parent)) {
    value = value.slice(parent.length).trim();
  }

  return value
    .replace(/^(?:[:：,，.。;；、\-\s]+)+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferLifeCardSteps(payload, participants = []) {
  const title = cleanCaptureTitle(payload.title || "");
  const titleKey = normalizedTitleKey(title);
  const text = `${payload.title || ""} ${payload.detail || ""}`.trim();
  const seen = new Set();
  const clauses = splitCaptureClauses(text)
    .map((part) => cleanInferredLifeCardStepTitle(part, title))
    .filter((part) => {
      if (!part || part === title) return false;
      const key = normalizedTitleKey(part);
      if (!key || (titleKey && key === titleKey) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
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

function normalizeTimerTimestamp(value) {
  const raw = sanitizeText(value, 40);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  const local = normalizeDateTime(raw);
  const localParsed = Date.parse(local);
  return Number.isFinite(localParsed) ? new Date(localParsed).toISOString() : "";
}

function normalizeLifeCardTimeEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => {
      const startedAt = normalizeTimerTimestamp(entry?.startedAt);
      if (!startedAt) return null;
      const stoppedAt = normalizeTimerTimestamp(entry?.stoppedAt);
      const startedMs = Date.parse(startedAt);
      const stoppedMs = stoppedAt ? Date.parse(stoppedAt) : 0;
      const inferredDuration = stoppedAt && Number.isFinite(startedMs) && Number.isFinite(stoppedMs)
        ? Math.max(1, Math.round((stoppedMs - startedMs) / 1000))
        : 0;
      return {
        id: sanitizeText(entry?.id, 80) || `timer-${index + 1}`,
        userId: sanitizeText(entry?.userId, 80),
        date: entry?.date ? normalizeDate(entry.date) : normalizeDate(startedAt.slice(0, 10)),
        startedAt,
        stoppedAt,
        durationSec: stoppedAt ? Math.max(1, Number(entry?.durationSec) || inferredDuration) : 0,
      };
    })
    .filter((entry) => entry && entry.userId)
    .slice(-120);
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
  const parentTitle = payload.title ?? existing.title ?? "";
  const payloadSteps = normalizeLifeCardSteps(payload.steps, participants, parentTitle);
  const existingSteps = normalizeLifeCardSteps(existing.steps, participants, parentTitle);
  const steps = payloadSteps.length
    ? payloadSteps
    : (existingSteps.length
        ? existingSteps
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
  const steps = normalizeLifeCardSteps(item.steps, participants, item.title);
  return {
    plannedAt: normalizeDateTime(item.plannedAt),
    dueAt: normalizeDateTime(item.dueAt),
    durationMin: normalizeDurationMin(item.durationMin, 0),
    steps,
    timeBlocks: normalizeLifeCardTimeBlocks(item.timeBlocks, steps),
    timeEntries: normalizeLifeCardTimeEntries(item.timeEntries),
  };
}

function lifeCardTimeTracking(card, userId) {
  const entries = normalizeLifeCardTimeEntries(card.timeEntries);
  const nowMs = Date.now();
  const totalSec = entries.reduce((sum, entry) => {
    if (entry.stoppedAt) return sum + (Number(entry.durationSec) || 0);
    const startedMs = Date.parse(entry.startedAt);
    if (!Number.isFinite(startedMs)) return sum;
    return sum + Math.max(0, Math.round((nowMs - startedMs) / 1000));
  }, 0);
  const activeEntry = [...entries].reverse().find((entry) => !entry.stoppedAt && entry.userId === userId) ||
    [...entries].reverse().find((entry) => !entry.stoppedAt) ||
    null;
  return {
    totalSec,
    currentUserActive: Boolean(activeEntry && activeEntry.userId === userId),
    activeUserId: activeEntry?.userId || "",
    activeStartedAt: activeEntry?.startedAt || "",
  };
}

function lifeCardStepProgress(card) {
  if (isDailyCheckinLifeCard(card)) return { done: 0, total: 0, percent: 0 };
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

function lifeCardNextStep(card) {
  if (isDailyCheckinLifeCard(card)) return null;
  const steps = Array.isArray(card.steps) ? card.steps : [];
  const next = steps.find((step) => step.status !== "done");
  if (next) {
    return {
      id: next.id || "",
      title: next.title || "",
      ownerId: next.ownerId || "",
      estimateMin: normalizeDurationMin(next.estimateMin, 0),
    };
  }
  if (card.completion?.allDone || card.completion?.currentUserDone) return null;
  return {
    id: "",
    title: card.title || "",
    ownerId: card.ownerId || "",
    estimateMin: normalizeDurationMin(card.durationMin, 0),
  };
}

function lifeCardTiming(card, selectedDate) {
  const anchorDate = normalizeDate(selectedDate);
  const cardDate = normalizeDate(card.date, anchorDate);
  const dueDate = normalizeDate(String(card.dueAt || "").slice(0, 10), "");
  const plannedDate = normalizeDate(String(card.plannedAt || "").slice(0, 10), "");
  const relevantDate = dueDate || plannedDate || cardDate;
  const days = relevantDate ? daysBetween(anchorDate, relevantDate) : 0;
  const overdue = Boolean(dueDate && dueDate < anchorDate && !card.completion?.allDone && !card.archivedAt);
  return {
    date: relevantDate,
    days,
    overdue,
    lane: overdue ? "overdue" : relevantDate === anchorDate ? "today" : relevantDate > anchorDate ? "future" : "past",
    label: overdue
      ? "已过期"
      : relevantDate === anchorDate
        ? "当天"
        : days === 1
          ? "明天"
          : days > 1
            ? `${days} 天后`
            : days === -1
              ? "昨天"
              : days < -1
                ? `${Math.abs(days)} 天前`
                : "",
  };
}

function lifeCardActionSummary(card, selectedDate) {
  const parts = [];
  const timing = lifeCardTiming(card, selectedDate);
  const nextStep = lifeCardNextStep(card);
  if (timing.overdue) parts.push("先处理过期");
  if (nextStep?.title && nextStep.title !== card.title) parts.push(`下一步：${shortText(nextStep.title, 18)}`);
  if (card.dueAt) parts.push(`${formatDateTimeShort(card.dueAt)} 截止`);
  const duration = durationLabel(card.durationMin || nextStep?.estimateMin);
  if (duration) parts.push(duration);
  return parts.slice(0, 3);
}

function rankScheduleItemCard(card, selectedDate) {
  const anchorDate = normalizeDate(selectedDate);
  const completed = Boolean(card.archivedAt || card.completion?.allDone);
  if (completed) {
    return {
      rankScore: -1000,
      rankReason: "已完成",
      rankLane: "done",
    };
  }

  let score = 0;
  const reasons = [];
  const routine = isRoutineLifeCardItem(card);
  const cardDate = normalizeDate(card.date, anchorDate);
  const plannedDate = normalizeDate(String(card.plannedAt || "").slice(0, 10), "");
  const dueDate = normalizeDate(String(card.dueAt || "").slice(0, 10), "");
  const dueDays = dueDate ? daysBetween(anchorDate, dueDate) : null;

  if (routine) {
    score += 72;
    reasons.push(card.itemType === "habit" ? "习惯" : "打卡");
  }

  if (card.priority === "high") {
    score += 30;
    reasons.push("重要");
  } else if (card.priority === "low") {
    score -= 8;
  }

  if (card.completion?.currentUserDone && !card.completion?.allDone) {
    score -= 16;
    reasons.push("等对方");
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
      reasons.unshift("本日截止");
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

  const rankLane = routine
    ? "routine"
    : Number.isFinite(dueDays) && dueDays < 0
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
    updatedBy: profile.updatedBy || "",
    updatedAt: profile.updatedAt || "",
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
      isToday: formatDate(date) === businessDate(),
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
      isToday: id === businessDate(),
    };
  });
}

function getMonthDays(dateText) {
  const selected = parseDate(normalizeDate(dateText)) || new Date();
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  const today = businessDate();

  return Array.from({ length: last.getDate() }, (_, index) => {
    const date = new Date(first);
    date.setDate(index + 1);
    const id = formatDate(date);
    const calendarContext = calendarContextForDate(id);
    return {
      id,
      label: weekdayLabels[date.getDay()],
      shortLabel: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      dayNumber: index + 1,
      isToday: id === today,
      isFuture: id > today,
      calendarContext,
      calendarMarks: calendarContext.marks,
      lunar: calendarContext.lunar,
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

function resolveCatWordTargetUserId(store, capture, fallbackSenderId) {
  const profileIds = getProfileIds(store);
  const senderId = profileIds.includes(capture?.createdBy) ? capture.createdBy : fallbackSenderId;
  const currentTarget = sanitizeText(capture?.targetUserId, 80);
  if (profileIds.includes(currentTarget) && currentTarget !== senderId) return currentTarget;
  return profileIds.find((id) => id !== senderId) || "";
}

function normalizeCatWordMeta(store, capture, senderId) {
  if (capture?.rawKind !== "cat-word") return capture;
  const createdAt = sanitizeText(capture.createdAt || nowIso(), 40);
  capture.visibility = "shared";
  capture.targetUserId = resolveCatWordTargetUserId(store, capture, senderId);
  capture.deliveredAt = sanitizeText(capture.deliveredAt || createdAt, 40);
  capture.readBy = sanitizeTextMap(capture.readBy, 40);
  if (senderId) {
    capture.readBy[senderId] = capture.readBy[senderId] || createdAt;
  }
  return capture;
}

function catWordStatusLabelForUser(store, capture, userId) {
  const readBy = capture?.readBy && typeof capture.readBy === "object" ? capture.readBy : {};
  if (capture?.createdBy === userId) {
    const targetUserId = resolveCatWordTargetUserId(store, capture, capture.createdBy);
    return targetUserId && readBy[targetUserId] ? "已看" : "已送达";
  }
  return readBy[userId] ? "已读" : "未读";
}

function resolveStatusTargetUserId(store, userId, targetUserId) {
  const profileIds = getProfileIds(store);
  return profileIds.includes(targetUserId) ? targetUserId : userId;
}

function lifeCardStatusByUserFromSteps(item, steps = normalizeLifeCardSteps(item.steps, item.participants, item.title)) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  if (!steps.length) {
    return Object.fromEntries(
      participants.map((id) => [id, validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo"])
    );
  }

  return Object.fromEntries(
    participants.map((id) => {
      const accountableSteps = steps.filter((step) => !step.ownerId || step.ownerId === id);
      if (!accountableSteps.length) {
        return [id, "done"];
      }
      const hasPendingStep = accountableSteps.some((step) => {
        const status = lifeCardStepStatusForUser(step, item, id);
        return status !== "done" && status !== "skip";
      });
      return [id, hasPendingStep ? "todo" : "done"];
    })
  );
}

function lifeCardStepStatusForUser(step, item, userId) {
  if (!step || !userId) return "todo";
  const participants = Array.isArray(item?.participants) ? item.participants : [];
  if (step.ownerId && step.ownerId !== userId && participants.includes(userId)) return "skip";
  if (validStatuses.has(step.statusByUser?.[userId])) return step.statusByUser[userId];
  if (validStatuses.has(step.status)) return step.status;
  if (validStatuses.has(item?.statusByUser?.[userId])) return item.statusByUser[userId];
  return "todo";
}

function setLifeCardStepUserStatus(step, item, targetUserId, nextStatus, userId, timestamp = nowIso()) {
  const participants = Array.isArray(item?.participants) ? item.participants : [];
  const accountableIds = step.ownerId
    ? participants.filter((id) => id === step.ownerId)
    : participants;
  const statusByUser = Object.fromEntries(
    accountableIds.map((id) => [
      id,
      id === targetUserId ? nextStatus : lifeCardStepStatusForUser(step, item, id),
    ])
  );
  const statusUpdatedBy = {
    ...(step.statusUpdatedBy || {}),
    [targetUserId]: userId,
  };
  const statusUpdatedAt = {
    ...(step.statusUpdatedAt || {}),
    [targetUserId]: timestamp,
  };
  return {
    ...step,
    status: accountableIds.length && accountableIds.every((id) => statusByUser[id] === "done") ? "done" : "todo",
    statusByUser,
    statusUpdatedBy,
    statusUpdatedAt,
  };
}

function dailyCheckinStepStatusForUser(step, item, userId) {
  if (!step || !userId) return "todo";
  if (validStatuses.has(step.statusByUser?.[userId])) return step.statusByUser[userId];
  if (validStatuses.has(item?.statusByUser?.[userId])) return item.statusByUser[userId];
  if (validStatuses.has(step.status)) return step.status;
  return "todo";
}

function normalizeDailyCheckinStepsForItem(item) {
  const participants = Array.isArray(item?.participants) ? item.participants : [];
  return normalizeLifeCardSteps(item?.steps, participants, item?.title).map((step) => {
    const statusByUser = Object.fromEntries(
      participants.map((id) => [id, dailyCheckinStepStatusForUser(step, item, id)])
    );
    const statusUpdatedBy = sanitizeTextMap(step.statusUpdatedBy);
    const statusUpdatedAt = sanitizeTextMap(step.statusUpdatedAt, 40);
    return {
      ...step,
      status: participants.length && participants.every((id) => statusByUser[id] === "done") ? "done" : "todo",
      statusByUser,
      statusUpdatedBy,
      statusUpdatedAt,
    };
  });
}

function dailyCheckinStatusByUserFromSteps(item, steps = normalizeDailyCheckinStepsForItem(item)) {
  const participants = Array.isArray(item?.participants) ? item.participants : [];
  if (!steps.length) {
    return Object.fromEntries(
      participants.map((id) => [id, validStatuses.has(item?.statusByUser?.[id]) ? item.statusByUser[id] : "todo"])
    );
  }
  return Object.fromEntries(
    participants.map((id) => {
      const done = steps.every((step) => dailyCheckinStepStatusForUser(step, item, id) === "done");
      return [id, done ? "done" : "todo"];
    })
  );
}

function setDailyCheckinStepUserStatus(step, item, targetUserId, nextStatus, userId, timestamp = nowIso()) {
  const participants = Array.isArray(item?.participants) ? item.participants : [];
  const statusByUser = Object.fromEntries(
    participants.map((id) => [
      id,
      id === targetUserId ? nextStatus : dailyCheckinStepStatusForUser(step, item, id),
    ])
  );
  const statusUpdatedBy = {
    ...(step.statusUpdatedBy || {}),
    [targetUserId]: userId,
  };
  const statusUpdatedAt = {
    ...(step.statusUpdatedAt || {}),
    [targetUserId]: timestamp,
  };
  return {
    ...step,
    status: participants.length && participants.every((id) => statusByUser[id] === "done") ? "done" : "todo",
    statusByUser,
    statusUpdatedBy,
    statusUpdatedAt,
  };
}

function syncArchiveWithCompletion(item, userId) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const steps = normalizeLifeCardSteps(item.steps, participants, item.title);
  const allDone = steps.length
    ? steps.every((step) => step.status === "done")
    : participants.length > 0 && participants.every((id) => item.statusByUser?.[id] === "done");
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

function stepOwnerIdsForStoredStep(step, participants = []) {
  if (step?.ownerId) return participants.includes(step.ownerId) ? [step.ownerId] : [];
  return participants;
}

function resetLifeCardCompletion(item) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const steps = normalizeLifeCardSteps(item.steps, participants, item.title);
  if (steps.length) {
    item.steps = steps.map((step) => ({
      ...step,
      status: "todo",
      statusByUser: Object.fromEntries(stepOwnerIdsForStoredStep(step, participants).map((id) => [id, "todo"])),
      statusUpdatedBy: {},
      statusUpdatedAt: {},
    }));
  }
  item.statusByUser = Object.fromEntries(participants.map((id) => [id, "todo"]));
  item.statusUpdatedBy = {};
  item.statusUpdatedAt = {};
  const timeBlocks = normalizeLifeCardTimeBlocks(item.timeBlocks, item.steps || steps);
  if (timeBlocks.length) {
    item.timeBlocks = timeBlocks.map((block) => ({ ...block, status: "planned" }));
  }
}

function markStatusOperation(item, targetUserId, userId, timestamp = nowIso()) {
  if (!targetUserId || !userId) return;
  item.statusUpdatedBy = {
    ...(item.statusUpdatedBy || {}),
    [targetUserId]: userId,
  };
  item.statusUpdatedAt = {
    ...(item.statusUpdatedAt || {}),
    [targetUserId]: timestamp,
  };
}

function markCheckinStatusOperation(item, date, targetUserId, userId, timestamp = nowIso()) {
  if (!date || !targetUserId || !userId) return;
  item.statusMetaByDate = item.statusMetaByDate || {};
  item.statusMetaByDate[date] = item.statusMetaByDate[date] || {};
  item.statusMetaByDate[date][targetUserId] = {
    updatedBy: userId,
    updatedAt: timestamp,
  };
}

function assertUserCanCompleteItem(item, userId) {
  if (!item || !userId) {
    throw new Error("cannot complete this item");
  }
  const participants = Array.isArray(item.participants) ? item.participants : [];
  if (item.ownerId === "shared" || item.ownerId === userId || participants.includes(userId)) return;
  throw new Error("cannot complete another user's item");
}

function assertStatusTargetAllowed(item, userId, targetUserId, payload = {}) {
  if (targetUserId === userId) {
    assertUserCanCompleteItem(item, userId);
    return;
  }
  if (payload.proxyConfirmed === true) return;
  throw new Error("proxy completion requires confirmation");
}

function applyStepAwareStatusToggle(item, targetUserId, userId, payload = {}) {
  const currentStatus = validStatuses.has(item.statusByUser?.[targetUserId])
    ? item.statusByUser[targetUserId]
    : "todo";
  const requestedStatus = validStatuses.has(payload.status) ? payload.status : "";

  if (isDailyCheckinLifeCard(item)) {
    const participants = Array.isArray(item.participants) ? item.participants : [];
    const nextStatus = requestedStatus || (currentStatus === "done" ? "todo" : "done");
    const timestamp = nowIso();
    const steps = normalizeDailyCheckinStepsForItem(item).map((step) =>
      setDailyCheckinStepUserStatus(step, item, targetUserId, nextStatus, userId, timestamp)
    );
    item.steps = steps;
    item.statusByUser = steps.length
      ? dailyCheckinStatusByUserFromSteps(item, steps)
      : {
          ...Object.fromEntries(
            participants.map((id) => [id, validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo"])
          ),
          [targetUserId]: nextStatus,
        };
    item.archivedAt = "";
    item.archivedBy = "";
    return;
  }

  const steps = normalizeLifeCardSteps(item.steps, item.participants, item.title);

  if (steps.length) {
    const isAccountableStep = (step) => !step.ownerId || step.ownerId === targetUserId;
    const shouldUndo = requestedStatus === "todo" || currentStatus === "done" || item.archivedAt;
    if (shouldUndo) {
      const timestamp = nowIso();
      item.steps = steps.map((step) => {
        if (!isAccountableStep(step) || lifeCardStepStatusForUser(step, item, targetUserId) !== "done") return step;
        return setLifeCardStepUserStatus(step, item, targetUserId, "todo", userId, timestamp);
      });
      item.statusByUser = lifeCardStatusByUserFromSteps(item, item.steps);
      syncArchiveWithCompletion(item, userId);
      return;
    }

    const nextTodoIndex = steps.findIndex((step) => {
      const status = lifeCardStepStatusForUser(step, item, targetUserId);
      return isAccountableStep(step) && status !== "done" && status !== "skip";
    });
    if (nextTodoIndex >= 0) {
      steps[nextTodoIndex] = setLifeCardStepUserStatus(steps[nextTodoIndex], item, targetUserId, "done", userId);
    }
    item.steps = steps;
    item.statusByUser = lifeCardStatusByUserFromSteps(item, steps);
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

function findLifeCardSourceItem(store, sourceType, sourceId) {
  const id = sanitizeText(sourceId, 80);
  const collections = {
    schedule: store.scheduleItems,
    todo: store.todoItems,
    checkin: store.checkinItems,
    deadline: store.deadlineItems,
  };
  const collection = collections[sourceType];
  if (!collection) return null;
  return collection.find((item) => item.id === id) || null;
}

function publicSourceItem(store, item, sourceType, userId) {
  const profileIds = getProfileIds(store);
  if (sourceType === "schedule") return publicScheduleItem(item, profileIds);
  if (sourceType === "todo") return publicTodoItem(item, profileIds);
  if (sourceType === "checkin") return publicCheckinItem(item, profileIds, businessDate());
  if (sourceType === "deadline") return publicDeadlineItem(item, profileIds);
  return publicScheduleItemCard(store, item, sourceType, userId);
}

function reorderLifeCards(userId, payload = {}) {
  return mutateStore((store) => {
    const date = normalizeDate(payload.date || businessDate());
    const order = Array.isArray(payload.order) ? payload.order : [];
    const timestamp = nowIso();
    const updated = [];

    order.forEach((entry, index) => {
      const sourceType = sanitizeText(entry?.sourceType, 40);
      const sourceId = sanitizeText(entry?.sourceId || entry?.id, 80);
      const item = findLifeCardSourceItem(store, sourceType, sourceId);
      if (!item) return;
      item.manualOrder = normalizeManualOrder(entry.manualOrder, (index + 1) * 1000);
      item.updatedBy = userId;
      item.updatedAt = timestamp;
      updated.push({ sourceType, sourceId: item.id, manualOrder: item.manualOrder });
    });

    if (!updated.length) {
      throw new Error("life card order is empty");
    }

    recordOperation(store, userId, "reorder", "life-card", date, {
      date,
      sourceType: "life-card",
      title: `${updated.length} cards`,
    });

    return updated;
  });
}

function toggleLifeCardStep(userId, payload = {}) {
  return mutateStore((store) => {
    const sourceType = sanitizeText(payload.sourceType, 40);
    const item = findLifeCardSourceItem(store, sourceType, payload.id);
    if (!item) {
      throw new Error("life card item not found");
    }

    const requestedTargetUserId = resolveStatusTargetUserId(store, userId, payload.targetUserId);
    const steps = normalizeLifeCardSteps(item.steps, item.participants, item.title);
    const stepId = sanitizeText(payload.stepId, 80);
    const stepIndex = steps.findIndex((step) => step.id === stepId);
    if (stepIndex === -1) {
      throw new Error("life card step not found");
    }
    if (isDailyCheckinLifeCard(item)) {
      const dailySteps = normalizeDailyCheckinStepsForItem(item);
      const dailyStepIndex = dailySteps.findIndex((step) => step.id === stepId);
      if (dailyStepIndex === -1) {
        throw new Error("life card step not found");
      }
      const targetUserId = requestedTargetUserId;
      if (targetUserId !== userId && payload.proxyConfirmed !== true) {
        throw new Error("proxy completion requires confirmation");
      }
      if (!item.participants.includes(targetUserId)) {
        item.participants.push(targetUserId);
      }

      const currentStatus = dailyCheckinStepStatusForUser(dailySteps[dailyStepIndex], item, targetUserId);
      const nextStatus = validStatuses.has(payload.status)
        ? payload.status
        : currentStatus === "done" ? "todo" : "done";
      const timestamp = nowIso();
      dailySteps[dailyStepIndex] = setDailyCheckinStepUserStatus(dailySteps[dailyStepIndex], item, targetUserId, nextStatus, userId, timestamp);
      item.steps = dailySteps;
      item.statusByUser = dailyCheckinStatusByUserFromSteps(item, dailySteps);
      item.archivedAt = "";
      item.archivedBy = "";
      markStatusOperation(item, targetUserId, userId, timestamp);
      item.updatedBy = userId;
      item.updatedAt = timestamp;
      recordOperation(store, userId, "toggle-step", sourceType, item.id, {
        date: item.date,
        title: item.title,
        stepId,
        stepTitle: dailySteps[dailyStepIndex].title,
        targetUserId,
        status: nextStatus,
        sourceType,
      });

      return publicSourceItem(store, item, sourceType, userId);
    }
    const stepOwnerId = sanitizeText(steps[stepIndex].ownerId, 80);
    const targetUserId = stepOwnerId || requestedTargetUserId;
    if (targetUserId !== userId && payload.proxyConfirmed !== true) {
      throw new Error("proxy completion requires confirmation");
    }
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    const currentStatus = lifeCardStepStatusForUser(steps[stepIndex], item, targetUserId);
    const nextStatus = validStatuses.has(payload.status)
      ? payload.status
      : currentStatus === "done" ? "todo" : "done";
    const timestamp = nowIso();
    steps[stepIndex] = setLifeCardStepUserStatus(steps[stepIndex], item, targetUserId, nextStatus, userId, timestamp);
    item.steps = steps;
    item.statusByUser = lifeCardStatusByUserFromSteps(item, steps);
    syncArchiveWithCompletion(item, userId);

    markStatusOperation(item, targetUserId, userId, timestamp);
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, "toggle-step", sourceType, item.id, {
      date: item.date,
      title: item.title,
      stepId,
      stepTitle: steps[stepIndex].title,
      targetUserId,
      status: nextStatus,
      sourceType,
    });

    return publicSourceItem(store, item, sourceType, userId);
  });
}

function toggleLifeCardTimer(userId, payload = {}) {
  return mutateStore((store) => {
    const sourceType = sanitizeText(payload.sourceType, 40);
    const item = findLifeCardSourceItem(store, sourceType, payload.id);
    if (!item) {
      throw new Error("life card item not found");
    }

    const timestamp = nowIso();
    const date = normalizeDate(payload.date || item.date || businessDate());
    const entries = normalizeLifeCardTimeEntries(item.timeEntries);
    const activeIndex = entries.findIndex((entry) => entry.userId === userId && !entry.stoppedAt);

    if (activeIndex >= 0) {
      const startedMs = Date.parse(entries[activeIndex].startedAt);
      const stoppedMs = Date.parse(timestamp);
      entries[activeIndex] = {
        ...entries[activeIndex],
        stoppedAt: timestamp,
        durationSec: Number.isFinite(startedMs) && Number.isFinite(stoppedMs)
          ? Math.max(1, Math.round((stoppedMs - startedMs) / 1000))
          : 1,
      };
    } else {
      entries.push({
        id: makeId("timer"),
        userId,
        date,
        startedAt: timestamp,
        stoppedAt: "",
        durationSec: 0,
      });
    }

    item.timeEntries = normalizeLifeCardTimeEntries(entries);
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, activeIndex >= 0 ? "stop-timer" : "start-timer", sourceType, item.id, {
      date,
      title: item.title,
      sourceType,
    });

    if (sourceType === "checkin") return publicCheckinItem(item, getProfileIds(store), date);
    return publicSourceItem(store, item, sourceType, userId);
  });
}

function rememberLifeCard(userId, payload = {}) {
  return mutateStore((store) => {
    const sourceType = sanitizeText(payload.sourceType, 40);
    const item = findLifeCardSourceItem(store, sourceType, payload.id);
    if (!item) {
      throw new Error("life card item not found");
    }

    const itemType = normalizeScheduleItemType(item.itemType, sourceType === "schedule" ? "date" : "thing");
    const cardId = typedLifeCardId(sourceType, item.id);
    const inferredKinds = normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind || payload.memoryKinds, { ...item, itemType });
    const kind = normalizeMemoryKind(payload.kind || payload.memoryKind) || inferredKinds[0] || (itemType === "purchase" ? "purchase" : "memory");
    store.longTermMemoryItems = Array.isArray(store.longTermMemoryItems) ? store.longTermMemoryItems : [];
    const existingIndex = store.longTermMemoryItems.findIndex((memory) =>
      memory.id === payload.memoryId ||
      (normalizeMemoryKind(memory.kind) === kind && normalizeIdList(memory.sourceCardIds, 12).includes(cardId))
    );
    const current = existingIndex >= 0 ? store.longTermMemoryItems[existingIndex] : {};
    const timestamp = nowIso();
    const memory = normalizeStoredLongTermMemoryItem(store, {
      ...current,
      id: current.id || sanitizeText(payload.memoryId, 100) || insightId(kind, cardId, item.title || ""),
      kind,
      title: payload.title || current.title || item.title || relationshipInsightKindLabels[kind] || "长期记忆",
      detail: payload.detail || current.detail || item.detail || item.slot || sourceCaptureSummary(store, item.sourceCaptureId),
      ownerId: payload.ownerId || current.ownerId || item.ownerId || "shared",
      targetUserId: payload.targetUserId || current.targetUserId || "",
      source: "lifeCard",
      sourceCaptureId: item.sourceCaptureId || current.sourceCaptureId || "",
      sourceCardIds: [...normalizeIdList(current.sourceCardIds, 12), cardId],
      relatedCardIds: [...normalizeIdList(current.relatedCardIds, 12), ...normalizeIdList(item.relationIds, 12)],
      tags: normalizeLifeCardTags(payload.tags || current.tags || item.tags, { ...item, itemType }),
      suggestedDate: payload.suggestedDate || current.suggestedDate || item.date || businessDate(),
      itemType,
      score: current.score || (item.priority === "high" ? 86 : 66),
      createdBy: current.createdBy || userId,
      updatedBy: userId,
      createdAt: current.createdAt || timestamp,
      updatedAt: timestamp,
    });
    if (!memory) {
      throw new Error("memory title is required");
    }

    if (existingIndex >= 0) {
      store.longTermMemoryItems[existingIndex] = memory;
    } else {
      store.longTermMemoryItems.unshift(memory);
    }
    store.longTermMemoryItems = store.longTermMemoryItems.slice(0, 300);
    item.linkedMemoryIds = normalizeIdList([...(item.linkedMemoryIds || []), memory.id], 12);
    item.memoryKinds = normalizeLifeCardMemoryKinds([...(item.memoryKinds || []), kind], item);
    item.tags = normalizeLifeCardTags(item.tags, item);
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, existingIndex >= 0 ? "update-memory-link" : "remember", sourceType, item.id, {
      date: item.date || payload.date,
      title: item.title,
      sourceType,
    });

    return {
      memory: publicMemoryItem(memory),
      card: publicScheduleItemCard(store, publicSourceItem(store, item, sourceType, userId), sourceType, userId, {
        selectedDate: payload.date || item.date,
      }),
    };
  });
}

function createScheduleItem(store, payload, userId) {
  const profileIds = store.profiles.map((item) => item.id);
  const date = normalizeDate(payload.date);
  const ownerId = normalizeOwnerId(store, payload.ownerId, userId);
  const normalizedParticipants = normalizeParticipants(store, ownerId, payload.participants, userId);
  const itemType = inferScheduleItemType(payload, "date");
  const timestamp = nowIso();
  const item = {
    id: makeId("event"),
    date,
    segment: normalizeSegment(payload.segment),
    title: sanitizeText(payload.title, 160),
    detail: sanitizeText(payload.detail, 800),
    itemType,
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    relationIds: normalizeIdList(payload.relationIds, 16),
    linkedMemoryIds: normalizeIdList(payload.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(payload.tags, { ...payload, itemType }),
    memoryKinds: normalizeLifeCardMemoryKinds(payload.memoryKinds || payload.memoryKind, { ...payload, itemType }),
    repeatRule: sanitizeText(payload.repeatRule, 120),
    priority: normalizePriority(payload.priority),
    manualOrder: normalizeManualOrder(payload.manualOrder, 0),
    ownerId,
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(normalizedParticipants.map((id) => [id, "todo"])),
    statusUpdatedBy: {},
    statusUpdatedAt: {},
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
  const itemType = inferScheduleItemType(payload, "thing");
  const timestamp = nowIso();
  const item = {
    id: makeId("todo"),
    date,
    bucket,
    title: sanitizeText(payload.title, 180),
    detail: sanitizeText(payload.detail, 800),
    itemType,
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    relationIds: normalizeIdList(payload.relationIds, 16),
    linkedMemoryIds: normalizeIdList(payload.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(payload.tags, { ...payload, itemType }),
    memoryKinds: normalizeLifeCardMemoryKinds(payload.memoryKinds || payload.memoryKind, { ...payload, itemType }),
    repeatRule: sanitizeText(payload.repeatRule, 120),
    priority: normalizePriority(payload.priority),
    manualOrder: normalizeManualOrder(payload.manualOrder, 0),
    ownerId,
    participants,
    statusByUser: Object.fromEntries(participants.map((id) => [id, "todo"])),
    statusUpdatedBy: {},
    statusUpdatedAt: {},
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

function makeDailyCheckinStep(title, index, existing = null, participants = [], fallbackStatusByUser = {}) {
  const source = existing && typeof existing === "object" ? existing : {};
  const statusByUser = Object.fromEntries(
    participants.map((id) => [
      id,
      validStatuses.has(source.statusByUser?.[id])
        ? source.statusByUser[id]
        : validStatuses.has(fallbackStatusByUser?.[id])
          ? fallbackStatusByUser[id]
          : validStatuses.has(source.status)
            ? source.status
            : "todo",
    ])
  );
  return {
    id: sanitizeText(source.id, 80) || `daily-checkin-step-${index + 1}`,
    title: sanitizeText(title || source.title, 120),
    ownerId: sanitizeText(source.ownerId || "", 80),
    estimateMin: normalizeDurationMin(source.estimateMin, 0),
    status: participants.length && participants.every((id) => statusByUser[id] === "done") ? "done" : "todo",
    statusByUser,
    statusUpdatedBy: sanitizeTextMap(source.statusUpdatedBy),
    statusUpdatedAt: sanitizeTextMap(source.statusUpdatedAt, 40),
    sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index,
  };
}

function ensureDailyCheckinCard(store, date = businessDate(), userId = "system") {
  const normalizedDate = normalizeDate(date);
  const profileIds = getProfileIds(store);
  const timestamp = nowIso();
  const existing = store.todoItems.find((item) =>
    item.date === normalizedDate &&
    normalizeLifeCardTags(item.tags, item).includes(dailyCheckinCardTag)
  );
  const existingSteps = normalizeLifeCardSteps(existing?.steps, profileIds, dailyCheckinCardTitle);
  const usedKeys = new Set();
  const steps = [
    ...dailyCheckinDefaultSteps.map((title, index) => {
      const key = normalizedTitleKey(title);
      usedKeys.add(key);
      return makeDailyCheckinStep(title, index, existingSteps.find((step) => normalizedTitleKey(step.title) === key), profileIds, existing?.statusByUser);
    }),
    ...existingSteps
      .filter((step) => {
        const key = normalizedTitleKey(step.title);
        if (!key || usedKeys.has(key)) return false;
        usedKeys.add(key);
        return true;
      })
      .map((step, index) => makeDailyCheckinStep(step.title, dailyCheckinDefaultSteps.length + index, step, profileIds, existing?.statusByUser)),
  ];
  const aggregateStatusByUser = dailyCheckinStatusByUserFromSteps({ ...existing, participants: profileIds }, steps);

  if (existing) {
    let changed = false;
    const assignIfChanged = (key, value) => {
      if (JSON.stringify(existing[key]) === JSON.stringify(value)) return;
      existing[key] = value;
      changed = true;
    };
    assignIfChanged("title", dailyCheckinCardTitle);
    assignIfChanged("date", normalizedDate);
    assignIfChanged("bucket", "today");
    assignIfChanged("detail", sanitizeText(existing.detail || "每天 03:00 刷新。", 800));
    assignIfChanged("itemType", "checkin");
    assignIfChanged("ownerId", "shared");
    assignIfChanged("participants", profileIds);
    assignIfChanged("tags", normalizeLifeCardTags([...(existing.tags || []), dailyCheckinCardTag], { ...existing, itemType: "checkin", title: dailyCheckinCardTitle }));
    assignIfChanged("repeatRule", "daily@03:00");
    assignIfChanged("priority", normalizePriority(existing.priority || "normal"));
    assignIfChanged("statusByUser", aggregateStatusByUser);
    assignIfChanged("steps", steps);
    if (!existing.updatedAt) existing.updatedAt = timestamp;
    if (!existing.updatedBy) existing.updatedBy = userId;
    if (changed) {
      existing.updatedAt = timestamp;
      existing.updatedBy = userId;
    }
    return { item: existing, changed };
  }

  const created = {
    id: makeId("todo"),
    date: normalizedDate,
    bucket: "today",
    title: dailyCheckinCardTitle,
    detail: "每天 03:00 刷新。",
    itemType: "checkin",
    sourceCaptureId: "",
    relatedGroupId: "",
    parentItemId: "",
    relationIds: [],
    linkedMemoryIds: [],
    tags: normalizeLifeCardTags([dailyCheckinCardTag], { title: dailyCheckinCardTitle, itemType: "checkin" }),
    memoryKinds: [],
    repeatRule: "daily@03:00",
    priority: "normal",
    manualOrder: normalizeManualOrder(existing?.manualOrder, 0),
    ownerId: "shared",
    participants: profileIds,
    statusByUser: aggregateStatusByUser,
    statusUpdatedBy: {},
    statusUpdatedAt: {},
    plannedAt: "",
    dueAt: "",
    durationMin: 0,
    steps,
    timeBlocks: [],
    timeEntries: [],
    createdBy: userId,
    updatedBy: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: "",
    archivedBy: "",
  };
  store.todoItems.push(created);
  return { item: created, changed: true };
}

function createCheckinItem(store, payload, userId) {
  const participants = getProfileIds(store);
  const itemType = inferScheduleItemType(payload, "checkin");
  const timestamp = nowIso();
  const item = {
    id: makeId("checkin"),
    title: sanitizeText(payload.title, 120),
    slot: sanitizeText(payload.slot, 80),
    itemType,
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    relationIds: normalizeIdList(payload.relationIds, 16),
    linkedMemoryIds: normalizeIdList(payload.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(payload.tags, { ...payload, itemType }),
    memoryKinds: normalizeLifeCardMemoryKinds(payload.memoryKinds || payload.memoryKind, { ...payload, itemType }),
    repeatRule: sanitizeText(payload.repeatRule || "daily", 120),
    manualOrder: normalizeManualOrder(payload.manualOrder, 0),
    ownerId: "shared",
    participants,
    statusByDate: {},
    statusMetaByDate: {},
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
  const itemType = inferScheduleItemType(payload, "reminder");
  const timestamp = nowIso();
  const item = {
    id: makeId("deadline"),
    date: normalizeDate(payload.date),
    title: sanitizeText(payload.title, 180),
    detail: sanitizeText(payload.detail, 500),
    itemType,
    sourceCaptureId: sanitizeText(payload.sourceCaptureId, 80),
    relatedGroupId: sanitizeText(payload.relatedGroupId, 80),
    parentItemId: sanitizeText(payload.parentItemId, 80),
    relationIds: normalizeIdList(payload.relationIds, 16),
    linkedMemoryIds: normalizeIdList(payload.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(payload.tags, { ...payload, itemType }),
    memoryKinds: normalizeLifeCardMemoryKinds(payload.memoryKinds || payload.memoryKind, { ...payload, itemType }),
    repeatRule: sanitizeText(payload.repeatRule, 120),
    priority: normalizePriority(payload.priority),
    manualOrder: normalizeManualOrder(payload.manualOrder, 0),
    ownerId,
    participants,
    statusByUser: Object.fromEntries(participants.map((id) => [id, "todo"])),
    statusUpdatedBy: {},
    statusUpdatedAt: {},
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
    operations: [],
    diaryDays: {},
    dailySummaries: {},
    dayContexts: {},
    longTermMemoryItems: [],
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
  ["scheduleItems", "todoItems", "checkinItems", "deadlineItems"].forEach((key) => {
    shaped[key] = shaped[key].map((item) => ({
      ...item,
      relationIds: normalizeIdList(item.relationIds, 16),
      linkedMemoryIds: normalizeIdList(item.linkedMemoryIds, 12),
      tags: normalizeLifeCardTags(item.tags, item),
      memoryKinds: normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind, item),
      manualOrder: normalizeManualOrder(item.manualOrder, 0),
      timeEntries: normalizeLifeCardTimeEntries(item.timeEntries),
    }));
  });
  shaped.operations = Array.isArray(shaped.operations) ? shaped.operations : [];
  shaped.diaryDays = shaped.diaryDays && typeof shaped.diaryDays === "object" ? shaped.diaryDays : {};
  shaped.dailySummaries = shaped.dailySummaries && typeof shaped.dailySummaries === "object" ? shaped.dailySummaries : {};
  shaped.dayContexts = shaped.dayContexts && typeof shaped.dayContexts === "object" ? shaped.dayContexts : {};
  shaped.dayContexts = Object.fromEntries(
    Object.entries(shaped.dayContexts)
      .map(([date, context]) => [normalizeDate(date, ""), normalizeDayContext(context, { date })])
      .filter(([date]) => date)
  );
  shaped.longTermMemoryItems = Array.isArray(shaped.longTermMemoryItems)
    ? shaped.longTermMemoryItems.map((item) => normalizeStoredLongTermMemoryItem(shaped, item)).filter(Boolean)
    : [];
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
          updatedBy: sanitizeText(current.updatedBy || profile.id, 80),
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
    statusMetaByDate: item.statusMetaByDate && typeof item.statusMetaByDate === "object" ? item.statusMetaByDate : {},
  }));
  shaped.operations = shaped.operations
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: sanitizeText(item.id, 80) || makeId("op"),
      action: sanitizeText(item.action, 80),
      entityType: sanitizeText(item.entityType, 80),
      entityId: sanitizeText(item.entityId, 120),
      date: item.date ? normalizeDate(item.date) : "",
      actorId: sanitizeText(item.actorId, 80),
      targetUserId: sanitizeText(item.targetUserId, 80),
      createdAt: item.createdAt || nowIso(),
      meta: item.meta && typeof item.meta === "object" ? item.meta : {},
    }))
    .slice(-500);
  shaped.updatedAt = shaped.updatedAt || nowIso();
  return shaped;
}

function hasDailyCheckinCard(store, date = businessDate()) {
  const normalizedDate = normalizeDate(date);
  return (store?.todoItems || []).some((item) =>
    item.date === normalizedDate &&
    normalizeLifeCardTags(item.tags, item).includes(dailyCheckinCardTag)
  );
}

function isDailyCheckinLifeCard(item) {
  if (!item) return false;
  return normalizeLifeCardTags(item.tags, item).includes(dailyCheckinCardTag) ||
    (normalizeScheduleItemType(item.itemType, "") === "checkin" && item.repeatRule === "daily@03:00");
}

function isRoutineLifeCardItem(item) {
  if (!item) return false;
  const itemType = normalizeScheduleItemType(item.itemType, "");
  return isDailyCheckinLifeCard(item) ||
    item.sourceType === "checkin" ||
    itemType === "habit" ||
    (itemType === "checkin" && Boolean(item.repeatRule));
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

function ensureDailyCheckinCardPersisted(date = businessDate(), userId = "system") {
  const store = readStore();
  const { changed } = ensureDailyCheckinCard(store, date, userId);
  if (!changed) return false;
  writeStore(store);
  return true;
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

function recordOperation(store, userId, action, entityType, entityId, meta = {}) {
  if (!store || !userId || !action) return;
  store.operations = Array.isArray(store.operations) ? store.operations : [];
  const date = meta.date ? normalizeDate(meta.date) : "";
  store.operations.push({
    id: makeId("op"),
    action: sanitizeText(action, 80),
    entityType: sanitizeText(entityType, 80),
    entityId: sanitizeText(entityId, 120),
    date,
    actorId: sanitizeText(userId, 80),
    targetUserId: sanitizeText(meta.targetUserId, 80),
    createdAt: nowIso(),
    meta: {
      sourceType: sanitizeText(meta.sourceType, 80),
      title: sanitizeText(meta.title, 180),
      stepTitle: sanitizeText(meta.stepTitle, 180),
      status: sanitizeText(meta.status, 40),
    },
  });
  store.operations = store.operations.slice(-500);
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
      createdBy: current.createdBy || profile.id,
      updatedBy: current.updatedBy || "",
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
    updatedBy: source.updatedBy || source.userId || profile.id,
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
    analysisRuns: (Array.isArray(capture.analysisRuns) ? capture.analysisRuns : [])
      .map((run) => ({
        id: sanitizeText(run?.id, 80),
        analysisMode: sanitizeText(run?.analysisMode, 40),
        analyzer: sanitizeText(run?.analyzer, 80),
        decision: sanitizeText(run?.decision, 40),
        itemType: normalizeScheduleItemType(run?.itemType, "thing"),
        memoryKind: sanitizeText(run?.memoryKind, 40),
        title: sanitizeText(run?.title, 120),
        date: sanitizeText(run?.date, 20),
        segment: normalizeSegment(run?.segment),
        confidence: Number.isFinite(Number(run?.confidence)) ? Number(run.confidence) : 0,
        tags: normalizeLifeCardTags(run?.tags, run),
        memoryKinds: normalizeLifeCardMemoryKinds(run?.memoryKinds || run?.memoryKind, run),
        createdAt: sanitizeText(run?.createdAt, 40),
      }))
      .filter((run) => run.id)
      .slice(0, 8),
    acceptedRoutes: (Array.isArray(capture.acceptedRoutes) ? capture.acceptedRoutes : [])
      .map((route) => ({
        id: sanitizeText(route?.id, 80),
        decision: normalizeCaptureDecision(route?.decision, "capture"),
        itemType: normalizeScheduleItemType(route?.itemType, "thing"),
        memoryKind: normalizeMemoryKind(route?.memoryKind),
        title: sanitizeText(route?.title, 160),
        detail: sanitizeText(route?.detail, 360),
        date: normalizeDate(route?.date, capture.date || businessDate()),
        segment: normalizeSegment(route?.segment),
        ownerId: sanitizeText(route?.ownerId, 80),
        priority: normalizePriority(route?.priority),
        confidence: Number.isFinite(Number(route?.confidence)) ? Number(route.confidence) : 0,
        tags: normalizeLifeCardTags(route?.tags, route),
        memoryKinds: normalizeLifeCardMemoryKinds(route?.memoryKinds || route?.memoryKind, route),
        memoryItemId: sanitizeText(route?.memoryItemId, 100),
        acceptedBy: sanitizeText(route?.acceptedBy, 80),
        acceptedAt: sanitizeText(route?.acceptedAt, 40),
        cardIds: Array.isArray(route?.cardIds) ? route.cardIds.map((id) => sanitizeText(id, 80)).filter(Boolean).slice(0, 8) : [],
      }))
      .filter((route) => route.id)
      .slice(0, 8),
    targetUserId: sanitizeText(capture.targetUserId, 80),
    deliveredAt: sanitizeText(capture.deliveredAt, 40),
    readBy: sanitizeTextMap(capture.readBy, 40),
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
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    archivedBy: item.archivedBy || "",
    statusUpdatedBy: sanitizeTextMap(item.statusUpdatedBy),
    statusUpdatedAt: sanitizeTextMap(item.statusUpdatedAt, 40),
    statusActors: Array.isArray(item.statusActors)
      ? item.statusActors.map((actor) => ({
          userId: sanitizeText(actor.userId, 80),
          status: sanitizeText(actor.status, 40),
          updatedBy: sanitizeText(actor.updatedBy, 80),
          updatedAt: sanitizeText(actor.updatedAt, 40),
        })).filter((actor) => actor.userId)
      : [],
    sourceCaptureId: item.sourceCaptureId || "",
  };
}

function publicCompletionTimelineItem(item = {}) {
  return {
    id: sanitizeText(item.id, 120),
    action: sanitizeText(item.action, 80),
    entityType: sanitizeText(item.entityType, 80),
    entityId: sanitizeText(item.entityId, 120),
    taskDate: normalizeDate(item.taskDate || item.date, ""),
    completedAt: sanitizeText(item.completedAt || item.createdAt, 40),
    actorId: sanitizeText(item.actorId, 80),
    targetUserId: sanitizeText(item.targetUserId, 80),
    title: sanitizeText(item.title, 180),
    stepTitle: sanitizeText(item.stepTitle, 180),
    status: sanitizeText(item.status, 40),
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

function publicDailySummary(summary, options = {}) {
  if (!summary || typeof summary !== "object") {
    return null;
  }
  const liveCompletionTimeline = Array.isArray(options.completionTimeline)
    ? options.completionTimeline.map(publicCompletionTimelineItem).filter((item) => item.title && item.completedAt)
    : [];
  const storedCompletionTimeline = Array.isArray(summary.completionTimeline)
    ? summary.completionTimeline.map(publicCompletionTimelineItem).filter((item) => item.title && item.completedAt)
    : [];

  return {
    date: summary.date || "",
    title: normalizeSummaryTitle(summary),
    subtitle: cleanGeneratedSummaryText(summary.subtitle, 180),
    narrative: cleanGeneratedSummaryText(summary.narrative, 900),
    qualityScore: Number(summary.qualityScore) || 0,
    qualityLabel: cleanGeneratedSummaryText(summary.qualityLabel, 80),
    qualityNote: cleanGeneratedSummaryText(summary.qualityNote, 240),
    nextStep: cleanGeneratedSummaryText(summary.nextStep, 240),
    analysis: normalizeDailyAnalysis(summary.analysis),
    illustration: summary.illustration || { type: "pixel", url: "", alt: "像素小猫日总结" },
    people: Array.isArray(summary.people) ? summary.people : [],
    completed: Array.isArray(summary.completed) ? summary.completed.map(publicSummaryThing) : [],
    missed: Array.isArray(summary.missed) ? summary.missed.map(publicSummaryThing) : [],
    moments: Array.isArray(summary.moments) ? summary.moments : [],
    completionTimeline: liveCompletionTimeline.length ? liveCompletionTimeline : storedCompletionTimeline,
    memoryHooks: Array.isArray(summary.memoryHooks) ? summary.memoryHooks.map(publicRelationshipInsight) : [],
    locations: sanitizeList(summary.locations, 8, 80),
    weather: summary.weather && typeof summary.weather === "object" ? normalizeDayContext({ date: summary.date, weather: summary.weather }).weather : null,
    dayContext: summary.dayContext && typeof summary.dayContext === "object" ? normalizeDayContext(summary.dayContext, { date: summary.date }) : null,
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
  const planning = publicPlanningFields({ ...item, participants: normalizedParticipants });
  const statusByUser = planning.steps.length
    ? lifeCardStatusByUserFromSteps({ ...item, participants: normalizedParticipants, steps: planning.steps }, planning.steps)
    : Object.fromEntries(
        normalizedParticipants.map((id) => [
          id,
          validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo",
        ])
      );
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
    relationIds: normalizeIdList(item.relationIds, 16),
    linkedMemoryIds: normalizeIdList(item.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(item.tags, item),
    memoryKinds: normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind, item),
    repeatRule: item.repeatRule || "",
    priority: normalizePriority(item.priority),
    manualOrder: normalizeManualOrder(item.manualOrder, 0),
    ownerId: item.ownerId || "shared",
    participants: normalizedParticipants,
    statusByUser,
    statusUpdatedBy: sanitizeTextMap(item.statusUpdatedBy),
    statusUpdatedAt: sanitizeTextMap(item.statusUpdatedAt, 40),
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    archivedAt: item.archivedAt || "",
    archivedBy: item.archivedBy || "",
    ...planning,
  };
}

function publicTodoItem(item, profileIds) {
  const participants = (Array.isArray(item.participants) ? item.participants : [])
    .filter((id) => profileIds.includes(id));
  const normalizedParticipants = participants.length ? participants : profileIds;
  const planning = publicPlanningFields({ ...item, participants: normalizedParticipants });
  const statusByUser = planning.steps.length
    ? lifeCardStatusByUserFromSteps({ ...item, participants: normalizedParticipants, steps: planning.steps }, planning.steps)
    : Object.fromEntries(
        normalizedParticipants.map((id) => [
          id,
          validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo",
        ])
      );
  return {
    id: item.id,
    date: normalizeDate(item.date),
    title: item.title || "",
    detail: item.detail || "",
    itemType: normalizeScheduleItemType(item.itemType, inferScheduleItemType(item, "thing")),
    sourceCaptureId: item.sourceCaptureId || "",
    relatedGroupId: item.relatedGroupId || "",
    parentItemId: item.parentItemId || "",
    relationIds: normalizeIdList(item.relationIds, 16),
    linkedMemoryIds: normalizeIdList(item.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(item.tags, item),
    memoryKinds: normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind, item),
    repeatRule: item.repeatRule || "",
    priority: normalizePriority(item.priority),
    manualOrder: normalizeManualOrder(item.manualOrder, 0),
    bucket: normalizeTodoBucket(item.bucket),
    ownerId: item.ownerId || "shared",
    participants: normalizedParticipants,
    statusByUser,
    statusUpdatedBy: sanitizeTextMap(item.statusUpdatedBy),
    statusUpdatedAt: sanitizeTextMap(item.statusUpdatedAt, 40),
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    archivedAt: item.archivedAt || "",
    archivedBy: item.archivedBy || "",
    ...planning,
  };
}

function publicCheckinItem(item, profileIds, date) {
  const normalizedParticipants = profileIds;
  const dayStatus = item.statusByDate?.[date] || {};
  const dayStatusMeta = item.statusMetaByDate?.[date] || {};
  const title = /^(?:互相确认今天的状态|一起确认今天的安排)$/.test(item.title || "")
    ? dailyCheckinTitle
    : item.title || "";
  return {
    id: item.id,
    date: normalizeDate(date),
    title,
    slot: item.slot || "",
    itemType: normalizeScheduleItemType(item.itemType, item.repeatRule ? "habit" : "checkin"),
    sourceCaptureId: item.sourceCaptureId || "",
    relatedGroupId: item.relatedGroupId || "",
    parentItemId: item.parentItemId || "",
    relationIds: normalizeIdList(item.relationIds, 16),
    linkedMemoryIds: normalizeIdList(item.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(item.tags, item),
    memoryKinds: normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind, item),
    repeatRule: item.repeatRule || "daily",
    manualOrder: normalizeManualOrder(item.manualOrder, 0),
    ownerId: "shared",
    participants: normalizedParticipants,
    statusByUser: Object.fromEntries(
      normalizedParticipants.map((id) => [
        id,
        validStatuses.has(dayStatus[id]) ? dayStatus[id] : "todo",
      ])
    ),
    statusUpdatedBy: Object.fromEntries(
      normalizedParticipants
        .map((id) => [id, sanitizeText(dayStatusMeta[id]?.updatedBy, 80)])
        .filter(([, value]) => value)
    ),
    statusUpdatedAt: Object.fromEntries(
      normalizedParticipants
        .map((id) => [id, sanitizeText(dayStatusMeta[id]?.updatedAt, 40)])
        .filter(([, value]) => value)
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
  const planning = publicPlanningFields({ ...item, participants: normalizedParticipants });
  const statusByUser = planning.steps.length
    ? lifeCardStatusByUserFromSteps({ ...item, participants: normalizedParticipants, steps: planning.steps }, planning.steps)
    : Object.fromEntries(
        normalizedParticipants.map((id) => [
          id,
          validStatuses.has(item.statusByUser?.[id]) ? item.statusByUser[id] : "todo",
        ])
      );
  return {
    id: item.id,
    date: normalizeDate(item.date),
    title: item.title || "",
    detail: item.detail || "",
    itemType: normalizeScheduleItemType(item.itemType, "reminder"),
    sourceCaptureId: item.sourceCaptureId || "",
    relatedGroupId: item.relatedGroupId || "",
    parentItemId: item.parentItemId || "",
    relationIds: normalizeIdList(item.relationIds, 16),
    linkedMemoryIds: normalizeIdList(item.linkedMemoryIds, 12),
    tags: normalizeLifeCardTags(item.tags, item),
    memoryKinds: normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind, item),
    repeatRule: item.repeatRule || "",
    priority: normalizePriority(item.priority),
    manualOrder: normalizeManualOrder(item.manualOrder, 0),
    ownerId: item.ownerId || "shared",
    participants: normalizedParticipants,
    statusByUser,
    statusUpdatedBy: sanitizeTextMap(item.statusUpdatedBy),
    statusUpdatedAt: sanitizeTextMap(item.statusUpdatedAt, 40),
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    archivedAt: item.archivedAt || "",
    archivedBy: item.archivedBy || "",
    ...planning,
  };
}

function extractExplicitDate(text) {
  const raw = String(text || "");
  const fullDate = raw.match(fullDatePattern);
  if (fullDate) {
    const candidate = `${fullDate[1]}-${pad(fullDate[2])}-${pad(fullDate[3])}`;
    return parseDate(candidate) ? candidate : "";
  }

  const dashed = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return dashed ? normalizeDate(dashed[1], "") : "";
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

  const explicitDate = extractExplicitDate(raw);
  if (explicitDate) return explicitDate;

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
    .replace(fullDateReplacePattern, "")
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

function hasAnniversaryMemorySignal(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (anniversaryPattern.test(raw)) return true;
  return Boolean((extractExplicitDate(raw) || extractMonthDay(raw)) && anniversaryEventCuePattern.test(raw));
}

function isAnniversaryPreparationCapture(text) {
  const raw = String(text || "").trim();
  if (!raw || !hasAnniversaryMemorySignal(raw)) return false;
  if (!anniversaryPreparationActionPattern.test(raw)) return false;
  if (/^(?:纪念日|周年|生日)\s*[:：]\s*(?:\d{4}\s*(?:年|[./-])\s*)?\d{1,2}\s*(?:月|[./-])\s*\d{1,2}\s*日?\s*(?:是|=|＝|在)?\s*(?:在一起|认识|相识|领证|结婚|恋爱|第一次|生日)(?:的日子)?\s*[。.!！]?$/.test(raw)) {
    return false;
  }
  return true;
}

function isAnniversaryMemoryCapture(text) {
  const raw = String(text || "").trim();
  if (!raw || !hasAnniversaryMemorySignal(raw)) return false;
  if (isAnniversaryPreparationCapture(raw)) return false;
  const hasDate = Boolean(extractExplicitDate(raw) || extractMonthDay(raw));
  const describesDate = /(?:纪念日|周年|生日)\s*[:：]/.test(raw) ||
    /(?:纪念日|周年|生日).{0,30}(?:是|日期|日子|在)/.test(raw) ||
    /(?:在一起|认识|相识|第一次|领证|结婚|恋爱|生日).{0,30}(?:日子|纪念日|周年|日期)/.test(raw) ||
    (hasDate && anniversaryEventCuePattern.test(raw));
  return describesDate;
}

function cleanAnniversaryTitle(text) {
  const cleaned = sanitizeText(text, 180)
    .replace(/^(?:纪念日|周年|生日)\s*[:：]\s*/i, "")
    .replace(fullDateReplacePattern, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{1,2}\s*(?:月|[./-])\s*\d{1,2}\s*日?/g, "")
    .replace(/^[\s=＝:：\-—]+/, "")
    .replace(/^是+/, "")
    .replace(/[，,。；;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return shortText(cleaned || "纪念日", 48);
}

function buildAnniversaryMemoryConfirmation(store, userId, payload, capture, text, selectedDate, ownerId, analysisMode) {
  if (!isAnniversaryMemoryCapture(text)) return null;
  const explicitDate = extractExplicitDate(text);
  const monthDay = extractMonthDay(text);
  const baseDate = parseDate(selectedDate) || new Date();
  const inferredDate = monthDay
    ? `${baseDate.getFullYear()}-${pad(monthDay.month)}-${pad(monthDay.day)}`
    : "";
  const date = explicitDate || (parseDate(inferredDate) ? inferredDate : selectedDate);
  const title = cleanAnniversaryTitle(text);
  const detail = sanitizeText(text, 800);
  const participants = getProfileIds(store);

  return {
    captureId: capture?.id || sanitizeText(payload.captureId, 80),
    sourceCaptureId: capture?.id || sanitizeText(payload.captureId, 80),
    text,
    decision: "memory",
    itemType: "reminder",
    memoryKind: "anniversary",
    date,
    segment: "allDay",
    ownerId: "shared",
    participants,
    title,
    detail,
    repeatRule: "yearly",
    priority: "normal",
    tags: normalizeLifeCardTags(["纪念"], { title, detail, itemType: "reminder" }),
    memoryKinds: ["anniversary"],
    plannedAt: "",
    dueAt: "",
    durationMin: 0,
    steps: [],
    timeBlocks: [],
    analysisMode,
    templateMatched: true,
    isDefaultDraft: false,
    analyzer: analysisMode === "agent" ? "agent-route-prompt" : "template-rules",
    routeDestinations: captureRouteDestinations,
    agentPrompt: analysisMode === "agent" ? captureAgentPrompt : "",
    confirmationText: "保存为纪念日长期记忆",
    reason: `这句话是在定义一个重要日期，不是今天要完成的生活卡。保存后可按 yearly 生成倒计时、今年第 ${dayOfYear(date) || "几"} 天、提前提醒和准备建议。`,
    confidence: 0.96,
    relatedItems: [],
  };
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
  if (isAnniversaryMemoryCapture(raw)) {
    return "memory";
  }
  if (/偏好|边界|喜欢|不喜欢|讨厌|雷区|好闻|安静|太吵|重要的是|长期|目标|以后要|未来想|记住|答应|承诺|说好|帮你|我来|下次带你|谢谢|感谢|吵架|争执|生气|委屈|想吃|想买|想去|好想/.test(raw)) {
    return "memory";
  }
  if (/今天|明天|周[一二三四五六日天]|上午|中午|下午|晚上|今晚|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:月|[./-])\s*\d{1,2}|提醒|买|约|打卡|习惯|答辩|考试|面试|ddl|截止/i.test(raw) || actionSchedulePattern.test(raw)) {
    return "schedule";
  }
  return "capture";
}

function isTemplateScheduleMatch(text) {
  const raw = String(text || "");
  if (!raw.trim() || isCompletedCaptureStatement(raw)) return false;
  if (isAnniversaryMemoryCapture(raw)) return false;
  return /todo|待办|安排|生活卡|今天|明天|后天|周[一二三四五六日天]|下周|上午|中午|下午|晚上|今晚|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:月|[./-])\s*\d{1,2}|提醒|记得|别忘|买|约|打卡|习惯|答辩|考试|面试|ddl|deadline|截止|开会|会议|作业|任务|提交|整理|处理|预约|带/i.test(raw) || actionSchedulePattern.test(raw);
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
    .filter((item) => item.itemType !== "thing" || /记得|别忘|提醒|准备|带|订|预约|买|下单|处理|整理|写信|写封信|写卡片|照片|相册|餐厅|礼物|帮/.test(item.detail))
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
  const anniversaryMemory = buildAnniversaryMemoryConfirmation(store, userId, payload, capture, text, selectedDate, ownerId, analysisMode);
  if (anniversaryMemory) return anniversaryMemory;
  const templateMatched = analysisMode === "template" ? isTemplateScheduleMatch(text) : true;
  const inferredDecision = inferCaptureDecision(text);
  const decision = analysisMode === "template"
    ? (templateMatched ? "schedule" : inferredDecision)
    : inferredDecision;
  const clauses = splitCaptureClauses(text);
  const scheduleClause = templateMatched
    ? (clauses.find((part) => isTemplateScheduleMatch(part)) || clauses[0] || text)
    : "";
  const itemType = inferScheduleItemType({ title: scheduleClause, detail: scheduleClause }, "thing");
  const date = templateMatched ? resolveCaptureDate(scheduleClause || text, selectedDate) : selectedDate;
  const segment = templateMatched ? resolveCaptureSegment(scheduleClause || text, "allDay") : "allDay";
  const title = templateMatched
    ? (cleanCaptureTitle(scheduleClause) || cleanCaptureTitle(text) || shortText(text, 80))
    : (cleanCaptureTitle(text) || shortText(text, 80));
  const detail = templateMatched ? sanitizeText(text === title ? "" : text, 800) : sanitizeText(text === title ? "" : text, 800);
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
    : buildLifeCardPlanning({
        title,
        detail,
        itemType,
        date,
        segment,
        ownerId,
        participants: [ownerId].filter(Boolean),
        priority,
      });
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
    tags: normalizeLifeCardTags(payload.tags, { title, detail, itemType, priority }),
    memoryKinds: normalizeLifeCardMemoryKinds(payload.memoryKinds || payload.memoryKind, { title, detail, itemType, priority }),
    ...planning,
  };
  const relatedItems = decision === "schedule" && templateMatched ? analyzeRelatedScheduleItems(text, title, base) : [];
  const relatedTitleKeys = relatedItems.map((item) => normalizedTitleKey(item.title)).filter(Boolean);
  const filteredSteps = relatedTitleKeys.length
    ? base.steps.filter((step) => {
        const key = normalizedTitleKey(step.title);
        return !relatedTitleKeys.some((relatedKey) => key.includes(relatedKey) || relatedKey.includes(key));
      })
    : base.steps;

  return {
    ...base,
    steps: filteredSteps.length ? filteredSteps : base.steps,
    analysisMode,
    templateMatched,
    isDefaultDraft: analysisMode === "template" && !templateMatched,
    analyzer: analysisMode === "agent" ? "agent-route-prompt" : "template-rules",
    routeDestinations: captureRouteDestinations,
    agentPrompt: analysisMode === "agent" ? captureAgentPrompt : "",
    relatedItems,
  };
}

function normalizeCaptureDecision(value, fallback = "capture") {
  return validCaptureDecisions.has(value) ? value : fallback;
}

function normalizeMemoryKind(value) {
  return validMemoryKinds.has(value) ? value : "";
}

function publicCaptureAgentContextItem(item, sourceType) {
  if (!item) return null;
  return {
    id: item.id || "",
    sourceType,
    date: item.date || "",
    title: sanitizeText(item.title || item.text, 140),
    detail: sanitizeText(item.detail || item.slot || item.text, 220),
    itemType: normalizeScheduleItemType(item.itemType, sourceType === "schedule" ? "date" : "thing"),
    ownerId: item.ownerId || item.createdBy || "",
    participants: Array.isArray(item.participants) ? item.participants.slice(0, 4) : [],
    priority: validPriorities.has(item.priority) ? item.priority : "normal",
    repeatRule: sanitizeText(item.repeatRule, 80),
    plannedAt: normalizeDateTime(item.plannedAt),
    dueAt: normalizeDateTime(item.dueAt),
    tags: normalizeLifeCardTags(item.tags, item),
    memoryKinds: normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind, item),
  };
}

function captureAssetFilePath(asset) {
  const url = String(asset?.url || "");
  if (!url.startsWith("/__content/")) return "";
  const relativePath = decodeURIComponent(url.replace(/^\/__content\//, ""));
  const filePath = path.normalize(contentPath(relativePath));
  if (filePath !== contentRoot && !filePath.startsWith(`${contentRoot}${path.sep}`)) return "";
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return "";
  return filePath;
}

function captureImagePaths(capture) {
  return (Array.isArray(capture?.assets) ? capture.assets : [])
    .map(captureAssetFilePath)
    .filter(Boolean)
    .slice(0, 3);
}

function buildCaptureAgentFacts(store, userId, payload, capture, text, selectedDate, ownerId, templateDraft) {
  const profileIds = getProfileIds(store);
  const startDate = addDays(selectedDate, -14);
  const endDate = addDays(selectedDate, 90);
  const datedContext = [
    ...store.todoItems.map((item) => publicCaptureAgentContextItem(item, "todo")),
    ...store.scheduleItems.map((item) => publicCaptureAgentContextItem(item, "schedule")),
    ...store.deadlineItems.map((item) => publicCaptureAgentContextItem(item, "deadline")),
    ...store.checkinItems.map((item) => publicCaptureAgentContextItem(item, "checkin")),
  ]
    .filter(Boolean)
    .filter((item) => !item.date || (item.date >= startDate && item.date <= endDate))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(String(b.title)))
    .slice(0, 30);

  return {
    currentDate: businessDate(),
    selectedDate,
    userId,
    ownerId,
    profiles: store.profiles.map(publicProfile),
    profileIds,
    rawCapture: {
      id: capture?.id || sanitizeText(payload.captureId, 80),
      date: capture?.date || selectedDate,
      text,
      rawKind: capture?.rawKind || payload.rawKind || "raw",
      rawFormat: capture?.rawFormat || payload.rawFormat || "markdown",
      assets: (Array.isArray(capture?.assets) ? capture.assets : []).map((asset, index) => ({
        index: index + 1,
        id: asset.id || "",
        name: asset.name || asset.filename || `image-${index + 1}`,
        mimeType: asset.mimeType || "",
        size: Number(asset.size) || 0,
      })),
      createdBy: capture?.createdBy || userId,
      createdAt: capture?.createdAt || "",
    },
    routeDestinations: captureRouteDestinations,
    allowedScheduleItemTypes: [...validScheduleItemTypes],
    allowedMemoryKinds: [...validMemoryKinds],
    segments: segmentDefinitions,
    templateDraft,
    nearbyLifeCards: datedContext,
    recentCaptures: store.captures
      .filter((item) => captureVisibleToUser(item, userId))
      .slice(0, 16)
      .map((item) => ({
        id: item.id,
        date: item.date,
        text: sanitizeText(item.text, 180),
        analysisIntent: item.analysisIntent || "",
        createdBy: item.createdBy,
        createdAt: item.createdAt,
      })),
  };
}

function buildCaptureAgentStructuredPrompt(facts) {
  return [
    captureAgentPrompt,
    "",
    "你正在给前端生成一条轻确认，不要写入数据，不要修改文件，不要运行命令。",
    "输出必须严格符合 JSON schema。",
    "",
    "决策要求：",
    "- decision=schedule：用户明确说了要发生、要提醒、要买、要做、要约、要打卡、要养成习惯的事。",
    "- 查资料、搜视频、学习、练习、训练、复习、准备、处理、整理这类短动作也属于 schedule，默认落到今天的 thing/work。",
    "- 纪念日/周年/生日/在一起/相识/领证/结婚/第一次的日期定义属于 memory，memoryKind=anniversary；无年份日期用 selectedDate/currentDate 所在年份补齐，repeatRule=yearly，ownerId=shared，participants=双方。",
    "- 纪念日记忆要在 reason/detail 中说明可用于倒计时、今年第几天、提前提醒和准备建议；不要因为“今天录入”把 date 设成今天。",
    "- 只有明确要提醒、准备、买礼物、订餐厅、整理照片、写信、庆祝时才生成 schedule；这类 schedule 的 memoryKinds 必须包含 anniversary，礼物/吃饭/照片/信等准备动作要拆成 relatedItems。",
    "- decision=memory：偏好、心愿、承诺、照顾线索、纪念线索、感谢、修复、关系资料、长期目标。",
    "- decision=dailyStory：适合进入当天日总结素材，但不是未来行动或长期记忆。",
    "- decision=capture：只保留 raw，不需要任何生活卡或长期记忆。",
    "- itemType 默认 thing；工作/作业/会议用 work；购买用 purchase；约会/一起出去用 date；提醒/截止用 reminder；打卡用 checkin；周期习惯用 habit。",
    "- 新增日常打卡/习惯时，仍返回 decision=schedule 和 itemType=checkin/habit，但语义是加入当天固定“打卡”生活卡的打卡项；不要把它描述成独立普通任务。",
    "- ownerId 默认当前用户；只有明确共同参与才用 shared。participants 必须从 profileIds 或 shared 对应成员中选择。",
    "- 相对日期必须按 selectedDate 解析，例如今天下午、周日、下周一。",
    "- 如果 rawCapture.assets 非空，你会收到同顺序的图片附件；必须结合图片内容和 rawCapture.text 分析。",
    "- 图片里如果是 todo list、备忘录、聊天截图、白板或手写清单：识别每一条文字；未勾选/待办项生成 schedule 或 relatedItems；已勾选/完成项不要生成待办，可放进 detail/reason。",
    "- 如果一句话包含多个动作，用 relatedItems 拆出子生活卡；标题必须短，不要重复日期词。",
    "- 可以输出 tags 和 memoryKinds：tags 是短标签；memoryKinds 用于长期记忆沉淀，只能来自 allowedMemoryKinds。",
    "- 如果无法匹配明确动作，返回 decision=capture，title 可以概括 raw。",
    "",
    "输入上下文 JSON：",
    JSON.stringify(facts, null, 2),
  ].join("\n");
}

function runCaptureAgentCodex(facts, options = {}) {
  if (!fs.existsSync(captureAnalysisSchemaPath)) {
    return Promise.reject(new Error(`schema not found: ${captureAnalysisSchemaPath}`));
  }

  const outputPath = path.join(os.tmpdir(), `couple-capture-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  const imageArgs = (Array.isArray(options.imagePaths) ? options.imagePaths : [])
    .filter((filePath) => filePath && fs.existsSync(filePath))
    .flatMap((filePath) => ["--image", filePath]);
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "-C",
    repoRoot,
    ...imageArgs,
    "--output-schema",
    captureAnalysisSchemaPath,
    "-o",
    outputPath,
    buildCaptureAgentStructuredPrompt(facts),
  ];

  if (options.model) {
    args.splice(1, 0, "--model", options.model);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    const child = spawn("codex", args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        OTEL_SDK_DISABLED: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = Number(options.timeoutMs || 120000);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeout);

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (timedOut) {
        finish(new Error(`codex capture analysis timed out after ${timeout}ms`));
        return;
      }
      if (code !== 0) {
        finish(new Error((stderr || stdout || "codex exec failed").trim()));
        return;
      }
      if (!fs.existsSync(outputPath)) {
        finish(new Error("codex output file was not created"));
        return;
      }

      try {
        const raw = fs.readFileSync(outputPath, "utf8").trim();
        if (!raw) throw new Error("codex returned empty structured output");
        finish(null, JSON.parse(raw));
      } catch (error) {
        finish(error);
      } finally {
        try {
          fs.unlinkSync(outputPath);
        } catch {
          // Temporary output cleanup is best-effort.
        }
      }
    });
  });
}

function normalizeAgentRelatedItem(store, userId, source, fallback) {
  const raw = source || {};
  const text = `${raw.title || ""} ${raw.detail || ""}`.trim();
  const date = normalizeDate(raw.date, resolveCaptureDate(text || fallback.text, fallback.date));
  const segment = normalizeSegment(raw.segment || resolveCaptureSegment(text || fallback.text, fallback.segment));
  const itemType = normalizeScheduleItemType(raw.itemType, inferScheduleItemType(raw, fallback.itemType));
  const ownerId = normalizeOwnerId(store, raw.ownerId || fallback.ownerId, userId);
  const participants = normalizeParticipants(store, ownerId, raw.participants, userId);
  const title = sanitizeText(raw.title || cleanCaptureTitle(text), 180);
  const detail = sanitizeText(raw.detail || "", 800);
  const priority = validPriorities.has(raw.priority) ? raw.priority : fallback.priority;
  const rawSteps = normalizeLifeCardSteps(raw.steps, participants, title);
  const steps = rawSteps.length
    ? rawSteps
    : [{ title, ownerId, estimateMin: normalizeDurationMin(raw.durationMin, 0), status: "todo", sortOrder: 0 }];
  const planning = buildLifeCardPlanning({
    title,
    detail,
    itemType,
    date,
    segment,
    ownerId,
    participants,
    priority,
    plannedAt: raw.plannedAt,
    dueAt: raw.dueAt,
    durationMin: raw.durationMin,
    steps,
  });

  if (!title) return null;
  return {
    title,
    detail,
    itemType,
    date,
    segment,
    ownerId,
    participants,
    repeatRule: sanitizeText(raw.repeatRule || (itemType === "habit" ? "daily" : ""), 120),
    priority,
    tags: normalizeLifeCardTags(raw.tags, { title, detail, itemType, priority }),
    memoryKinds: normalizeLifeCardMemoryKinds(raw.memoryKinds || raw.memoryKind, { title, detail, itemType, priority }),
    ...planning,
  };
}

function normalizeCaptureAgentConfirmation(store, userId, payload, capture, text, agentOutput) {
  const selectedDate = normalizeDate(payload.date || capture?.date);
  const fallbackDecision = inferCaptureDecision(text);
  const decision = normalizeCaptureDecision(agentOutput?.decision, fallbackDecision);
  const baseText = `${agentOutput?.title || ""} ${agentOutput?.detail || ""} ${text || ""}`;
  const date = normalizeDate(agentOutput?.date, resolveCaptureDate(baseText, selectedDate));
  const segment = normalizeSegment(agentOutput?.segment || resolveCaptureSegment(baseText, "allDay"));
  const itemType = normalizeScheduleItemType(agentOutput?.itemType, inferScheduleItemType(agentOutput, "thing"));
  const ownerId = normalizeOwnerId(store, agentOutput?.ownerId || payload.ownerId || userId, userId);
  const participants = normalizeParticipants(store, ownerId, agentOutput?.participants, userId);
  const title = sanitizeText(
    agentOutput?.title || (decision === "schedule" ? cleanCaptureTitle(text) : shortText(text, 80)) || defaultLifeCardTitle,
    180
  );
  const detail = sanitizeText(agentOutput?.detail || (decision === "schedule" && title !== text ? text : ""), 800);
  const priority = validPriorities.has(agentOutput?.priority)
    ? agentOutput.priority
    : (/重要|必须|ddl|deadline|截止|答辩|考试|面试/i.test(text) ? "high" : "normal");
  const rawRelatedItems = Array.isArray(agentOutput?.relatedItems) ? agentOutput.relatedItems : [];
  const relatedTitleKeys = rawRelatedItems
    .map((item) => normalizedTitleKey(item?.title))
    .filter(Boolean);
  const filteredSteps = normalizeLifeCardSteps(agentOutput?.steps, participants, title)
    .filter((step) => {
      const key = normalizedTitleKey(step.title);
      return !relatedTitleKeys.some((relatedKey) => key.includes(relatedKey) || relatedKey.includes(key));
    });
  const steps = filteredSteps.length
    ? filteredSteps
    : (decision === "schedule" && rawRelatedItems.length
        ? [{ title, ownerId, estimateMin: normalizeDurationMin(agentOutput?.durationMin, 0), status: "todo", sortOrder: 0 }]
        : agentOutput?.steps);
  const planning = buildLifeCardPlanning({
    title,
    detail,
    itemType,
    date,
    segment,
    ownerId,
    participants,
    priority,
    plannedAt: agentOutput?.plannedAt,
    dueAt: agentOutput?.dueAt,
    durationMin: agentOutput?.durationMin,
    steps,
  });
  const fallback = {
    text,
    date,
    segment,
    itemType,
    ownerId,
    priority,
  };
  const primaryTitleKey = normalizedTitleKey(title);
  const relatedItems = decision === "schedule"
    ? rawRelatedItems
        .map((item) => normalizeAgentRelatedItem(store, userId, item, fallback))
        .filter(Boolean)
        .filter((item) => normalizedTitleKey(item.title) !== primaryTitleKey)
        .slice(0, 4)
    : [];

  return {
    captureId: capture?.id || sanitizeText(payload.captureId, 80),
    sourceCaptureId: capture?.id || sanitizeText(payload.captureId, 80),
    text,
    decision,
    itemType,
    memoryKind: normalizeMemoryKind(agentOutput?.memoryKind),
    date,
    segment,
    ownerId,
    participants,
    title,
    detail,
    repeatRule: sanitizeText(agentOutput?.repeatRule || (itemType === "habit" ? "daily" : ""), 120),
    priority,
    tags: normalizeLifeCardTags(agentOutput?.tags, { title, detail, itemType, priority }),
    memoryKinds: normalizeLifeCardMemoryKinds(agentOutput?.memoryKinds || agentOutput?.memoryKind, { title, detail, itemType, priority }),
    ...planning,
    analysisMode: "agent",
    templateMatched: false,
    isDefaultDraft: false,
    analyzer: "local-codex",
    routeDestinations: captureRouteDestinations,
    agentPrompt: captureAgentPrompt,
    confirmationText: sanitizeText(agentOutput?.confirmationText, 220),
    reason: sanitizeText(agentOutput?.reason, 360),
    confidence: Number.isFinite(Number(agentOutput?.confidence)) ? Number(agentOutput.confidence) : 0,
    relatedItems,
  };
}

function buildCaptureAgentFallbackConfirmation(templateDraft, error) {
  const agentError = sanitizeText(error?.message || error || "", 500);
  const fallbackDecision = templateDraft?.isDefaultDraft
    ? "capture"
    : normalizeCaptureDecision(templateDraft?.decision, "capture");
  const shouldKeepScheduleFields = fallbackDecision === "schedule";
  const title = sanitizeText(templateDraft?.title || shortText(templateDraft?.text, 80) || "随手记", 120);
  return {
    ...templateDraft,
    decision: fallbackDecision,
    itemType: normalizeScheduleItemType(templateDraft?.itemType, "thing"),
    memoryKind: normalizeMemoryKind(templateDraft?.memoryKind),
    title,
    detail: shouldKeepScheduleFields ? sanitizeText(templateDraft?.detail, 800) : "",
    repeatRule: shouldKeepScheduleFields ? sanitizeText(templateDraft?.repeatRule, 120) : "",
    plannedAt: shouldKeepScheduleFields ? normalizeDateTime(templateDraft?.plannedAt) : "",
    dueAt: shouldKeepScheduleFields ? normalizeDateTime(templateDraft?.dueAt) : "",
    durationMin: shouldKeepScheduleFields ? normalizeDurationMin(templateDraft?.durationMin, 0) : 0,
    steps: shouldKeepScheduleFields ? normalizeLifeCardSteps(templateDraft?.steps, templateDraft?.participants, title) : [],
    timeBlocks: shouldKeepScheduleFields ? normalizeLifeCardTimeBlocks(templateDraft?.timeBlocks, templateDraft?.steps) : [],
    relatedItems: shouldKeepScheduleFields && Array.isArray(templateDraft?.relatedItems) ? templateDraft.relatedItems : [],
    tags: fallbackDecision === "capture" ? [] : normalizeLifeCardTags(templateDraft?.tags, templateDraft),
    memoryKinds: fallbackDecision === "capture"
      ? []
      : fallbackDecision === "memory"
      ? normalizeLifeCardMemoryKinds(templateDraft?.memoryKinds || templateDraft?.memoryKind, templateDraft)
      : normalizeLifeCardMemoryKinds(templateDraft?.memoryKinds, templateDraft),
    analysisMode: "fallback",
    analyzer: "template-fallback",
    agentPrompt: captureAgentPrompt,
    agentError,
    confirmationText: fallbackDecision === "capture" ? "先保存为随手记" : "先按本地规则生成轻确认",
    reason: agentError
      ? `Agent 分析暂时不可用，已使用本地规则兜底：${shortText(agentError, 180)}`
      : "Agent 分析暂时不可用，已使用本地规则兜底。",
    confidence: fallbackDecision === "capture" ? 0.35 : 0.55,
  };
}

function recordCaptureAnalysis(userId, confirmation) {
  const captureId = sanitizeText(confirmation?.sourceCaptureId || confirmation?.captureId, 80);
  if (!captureId) return null;
  return mutateStore((store) => {
    const capture = store.captures.find((item) => item.id === captureId);
    if (!capture) return null;
    const analysis = {
      id: makeId("capture-analysis"),
      analysisMode: confirmation.analysisMode || "agent",
      analyzer: confirmation.analyzer || "local-codex",
      decision: confirmation.decision || "capture",
      itemType: confirmation.itemType || "thing",
      memoryKind: confirmation.memoryKind || "",
      title: confirmation.title || "",
      date: confirmation.date || capture.date,
      segment: confirmation.segment || "allDay",
      confidence: Number.isFinite(Number(confirmation.confidence)) ? Number(confirmation.confidence) : 0,
      tags: normalizeLifeCardTags(confirmation.tags, confirmation),
      memoryKinds: normalizeLifeCardMemoryKinds(confirmation.memoryKinds || confirmation.memoryKind, confirmation),
      createdBy: userId,
      createdAt: nowIso(),
    };
    capture.analysisRuns = [analysis, ...(Array.isArray(capture.analysisRuns) ? capture.analysisRuns : [])].slice(0, 12);
    recordOperation(store, userId, "analyze", "capture", capture.id, {
      date: capture.date,
      title: analysis.title,
      sourceType: "capture-analysis",
    });
    return publicCapture(capture);
  });
}

async function analyzeCaptureWithAgent(userId, payload = {}) {
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
  const anniversaryMemory = buildAnniversaryMemoryConfirmation(store, userId, payload, capture, text, selectedDate, ownerId, "agent");
  if (anniversaryMemory) {
    recordCaptureAnalysis(userId, anniversaryMemory);
    return anniversaryMemory;
  }
  const templateDraft = analyzeCapture(userId, {
    ...payload,
    text,
    date: selectedDate,
    ownerId,
    analysisMode: "template",
  });
  const facts = buildCaptureAgentFacts(store, userId, payload, capture, text, selectedDate, ownerId, templateDraft);
  let agentOutput = null;
  try {
    agentOutput = await runCaptureAgentCodex(facts, {
      imagePaths: captureImagePaths(capture),
      model: payload.model,
      timeoutMs: payload.timeoutMs,
    });
  } catch (error) {
    const fallback = buildCaptureAgentFallbackConfirmation(templateDraft, error);
    recordCaptureAnalysis(userId, fallback);
    return fallback;
  }
  const confirmation = normalizeCaptureAgentConfirmation(store, userId, payload, capture, text, agentOutput);
  recordCaptureAnalysis(userId, confirmation);
  return confirmation;
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
  const fullDate = normalized.match(fullDatePattern);
  if (fullDate) {
    const month = Number(fullDate[2]);
    const day = Number(fullDate[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
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
    tags: normalizeLifeCardTags(insight.tags, insight),
    memoryKinds: normalizeLifeCardMemoryKinds(insight.kind, insight),
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
    const shouldSuggestCard = capture.mode === "analysis" || ["agent", "template", "schedule"].includes(capture.analysisIntent || "");
    const acceptedRoutes = [
      ...(Array.isArray(capture.acceptedRoutes) ? capture.acceptedRoutes : []),
      ...(Array.isArray(capture.analysisRuns) ? capture.analysisRuns.filter((run) => run?.decision === "memory") : []),
    ];

    acceptedRoutes
      .filter((route) => route?.decision === "memory")
      .forEach((route) => {
        const kind = normalizeMemoryKind(route.memoryKind) || "memory";
        const routeTitle = sanitizeText(route.title || sourceText, 120);
        insights.push(makeInsight(store, {
          kind,
          title: routeTitle || relationshipInsightKindLabels[kind] || "长期记忆",
          detail: sanitizeText(route.detail || route.reason || text, 360),
          date: normalizeDate(route.date || today),
          segment: normalizeSegment(route.segment),
          itemType: normalizeScheduleItemType(route.itemType, "reminder"),
          ownerId: route.ownerId || "shared",
          participants: getProfileIds(store),
          sourceCaptureId: capture.id,
          sourceText,
          targetUserId,
          priority: normalizePriority(route.priority),
          score: 84 - Math.min(ageDays, 20),
          actionable: false,
          createdAt: route.acceptedAt || route.createdAt || capture.createdAt,
        }));
      });

    acceptedRoutes
      .filter((route) => route?.decision === "dailyStory")
      .forEach((route) => {
        insights.push(makeInsight(store, {
          kind: "memory",
          title: sanitizeText(route.title || sourceText, 120) || "日总结素材",
          detail: sanitizeText(route.detail || text, 360),
          date: normalizeDate(route.date || today),
          segment: normalizeSegment(route.segment),
          itemType: "reminder",
          ownerId: "shared",
          participants: getProfileIds(store),
          sourceCaptureId: capture.id,
          sourceText,
          targetUserId,
          priority: "normal",
          score: 54 - Math.min(ageDays, 20),
          actionable: false,
          createdAt: route.acceptedAt || route.createdAt || capture.createdAt,
        }));
      });

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

  const acceptedAnniversaryCaptureIds = new Set();
  (store.longTermMemoryItems || [])
    .filter((item) => !item.archivedAt && normalizeMemoryKind(item.kind) === "anniversary")
    .forEach((item) => {
      const sourceText = `${item.suggestedDate || ""} ${item.title || ""} ${item.detail || ""}`;
      const monthDay = extractMonthDay(sourceText);
      const date = monthDay ? nextAnnualDate(monthDay.month, monthDay.day, today) : normalizeDate(item.suggestedDate, "");
      if (!date) return;
      if (item.sourceCaptureId) acceptedAnniversaryCaptureIds.add(item.sourceCaptureId);
      candidates.push({
        id: `memory-${item.id}`,
        date,
        title: item.title || "纪念日",
        detail: item.detail || "",
        sourceCaptureId: item.sourceCaptureId || "",
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
    .filter((capture) => !acceptedAnniversaryCaptureIds.has(capture.id))
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
    .map((candidate) => {
      const countdown = candidate.daysUntil === 0 ? "今天就是这件事" : `${candidate.daysUntil} 天后就是这件事`;
      const ordinalDay = dayOfYear(candidate.date);
      const dateMeta = ordinalDay ? `${candidate.date} 是这一年第 ${ordinalDay} 天` : candidate.date;
      return makeInsight(store, {
        id: insightId("anniversary", candidate.id, candidate.date),
        kind: "anniversary",
        title: `提前预案：${shortText(candidate.title, 28)}`,
        detail: `${countdown}，${dateMeta}。${wishDetail} 建议先定一个小预案：预约、礼物、照片/信各一项；可以按 14/7/3/1 天提前提醒。`,
        date: today,
        segment: "allDay",
        itemType: "reminder",
        ownerId: "shared",
        participants: getProfileIds(store),
        sourceCaptureId: candidate.sourceCaptureId || "",
        sourceText: candidate.detail || candidate.title,
        priority: candidate.daysUntil <= 3 ? "high" : "normal",
        score: 90 - candidate.daysUntil,
      });
    });
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
    const key = insight.id
      ? `${insight.kind}:${insight.id}`
      : (insight.sourceCaptureId
          ? `${insight.kind}:${insight.sourceCaptureId}`
          : `${insight.kind}:${insight.title}:${insight.date}`);
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
    statusUpdatedBy: {},
    statusUpdatedAt: {},
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
    tags: normalizeLifeCardTags(insight.tags, insight),
    memoryKinds: normalizeLifeCardMemoryKinds(insight.kind, insight),
    relationIds: [],
    linkedMemoryIds: [],
    relations: [],
    memoryLinks: [],
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
  const tags = normalizeLifeCardTags(input.tags, {
    title: input.title,
    detail: input.detail,
    itemType: input.itemType,
    priority: input.priority,
  });
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
    sourceCardIds: normalizeIdList(input.sourceCardIds, 12),
    relatedCardIds: normalizeIdList(input.relatedCardIds, 12),
    tags,
    actionable: Boolean(input.actionable),
    suggestedDate: input.suggestedDate ? normalizeDate(input.suggestedDate) : "",
    itemType: normalizeScheduleItemType(input.itemType, "reminder"),
    score: Number(input.score) || 0,
    updatedAt: input.updatedAt || input.createdAt || "",
  };
}

function normalizeStoredLongTermMemoryItem(store, item = {}) {
  const kind = normalizeMemoryKind(item.kind) || "memory";
  const ownerId = normalizeOwnerId(store, item.ownerId || "shared", getProfileIds(store)[0] || "shared");
  const timestamp = nowIso();
  const normalized = {
    id: sanitizeText(item.id, 100) || makeId("memory"),
    kind,
    title: sanitizeText(item.title || relationshipInsightKindLabels[kind] || "长期记忆", 140),
    detail: sanitizeText(item.detail, 800),
    ownerId,
    targetUserId: sanitizeText(item.targetUserId, 80),
    source: sanitizeText(item.source || "manual", 40),
    sourceCaptureId: sanitizeText(item.sourceCaptureId, 80),
    sourceCardIds: normalizeIdList(item.sourceCardIds, 12),
    relatedCardIds: normalizeIdList(item.relatedCardIds, 12),
    tags: normalizeLifeCardTags(item.tags, item),
    suggestedDate: item.suggestedDate ? normalizeDate(item.suggestedDate) : "",
    itemType: normalizeScheduleItemType(item.itemType, "reminder"),
    score: Number(item.score) || 60,
    createdBy: sanitizeText(item.createdBy, 80),
    updatedBy: sanitizeText(item.updatedBy, 80),
    createdAt: item.createdAt || timestamp,
    updatedAt: item.updatedAt || item.createdAt || timestamp,
    archivedAt: sanitizeText(item.archivedAt, 40),
    archivedBy: sanitizeText(item.archivedBy, 80),
  };
  return normalized.title || normalized.detail ? normalized : null;
}

function typedLifeCardId(sourceType, sourceId) {
  return `${sanitizeText(sourceType, 40)}-${sanitizeText(sourceId, 100)}`;
}

function collectRawLifeCardItems(store) {
  return [
    ...store.scheduleItems.map((item) => ({ sourceType: "schedule", item })),
    ...store.todoItems.map((item) => ({ sourceType: "todo", item })),
    ...store.checkinItems.map((item) => ({ sourceType: "checkin", item })),
    ...store.deadlineItems.map((item) => ({ sourceType: "deadline", item })),
  ];
}

function publicLifeCardRelationLink(item, sourceType, relationType) {
  return {
    id: typedLifeCardId(sourceType, item.id),
    sourceType,
    sourceId: item.id || "",
    relationType,
    title: sanitizeText(item.title || item.slot, 140),
    date: normalizeDate(item.date || businessDate()),
    itemType: normalizeScheduleItemType(item.itemType, sourceType === "schedule" ? "date" : sourceType === "checkin" ? "checkin" : "thing"),
    tags: normalizeLifeCardTags(item.tags, item),
  };
}

function relationIdsMatch(aIds, bSourceType, bId) {
  const typedId = typedLifeCardId(bSourceType, bId);
  return normalizeIdList(aIds, 16).some((id) => id === bId || id === typedId);
}

function buildLifeCardRelations(store, publicItem, sourceType) {
  const currentId = publicItem.id || "";
  if (!currentId) return [];
  const currentTypedId = typedLifeCardId(sourceType, currentId);
  const currentGroupId = publicItem.relatedGroupId || "";
  const currentParentId = publicItem.parentItemId || "";
  const currentCaptureId = publicItem.sourceCaptureId || "";
  const links = [];

  collectRawLifeCardItems(store).forEach(({ sourceType: otherType, item }) => {
    if (!item?.id) return;
    const otherTypedId = typedLifeCardId(otherType, item.id);
    if (otherTypedId === currentTypedId) return;

    let relationType = "";
    if (currentParentId && (item.id === currentParentId || otherTypedId === currentParentId)) relationType = "parent";
    else if (item.parentItemId && (item.parentItemId === currentId || item.parentItemId === currentTypedId)) relationType = "child";
    else if (currentGroupId && item.relatedGroupId === currentGroupId) relationType = "group";
    else if (currentCaptureId && item.sourceCaptureId === currentCaptureId) relationType = "source";
    else if (relationIdsMatch(publicItem.relationIds, otherType, item.id) || relationIdsMatch(item.relationIds, sourceType, currentId)) relationType = "related";
    if (!relationType) return;
    links.push(publicLifeCardRelationLink(item, otherType, relationType));
  });

  return links.slice(0, 12);
}

function buildLifeCardMemoryLinks(store, publicItem, sourceType) {
  const sourceCaptureId = publicItem.sourceCaptureId || "";
  const cardIds = [publicItem.id, typedLifeCardId(sourceType, publicItem.id)].filter(Boolean);
  const genericTags = new Set(Object.values(scheduleItemTypeLabels).map(normalizeTagValue));
  const cardTags = new Set(normalizeLifeCardTags(publicItem.tags, publicItem).filter((tag) => !genericTags.has(tag)));
  const linkedMemoryIds = new Set(normalizeIdList(publicItem.linkedMemoryIds, 12));
  const links = [];

  (store.longTermMemoryItems || []).forEach((item) => {
    const idMatches = linkedMemoryIds.has(item.id);
    const sourceMatches = sourceCaptureId && item.sourceCaptureId === sourceCaptureId;
    const cardMatches = [...normalizeIdList(item.sourceCardIds, 12), ...normalizeIdList(item.relatedCardIds, 12)]
      .some((id) => cardIds.includes(id));
    const tagMatches = cardTags.size > 0 && normalizeLifeCardTags(item.tags, item)
      .filter((tag) => !genericTags.has(tag))
      .some((tag) => cardTags.has(tag));
    if (!idMatches && !sourceMatches && !cardMatches && !tagMatches) return;
    links.push(publicMemoryItem({
      ...item,
      source: item.source || "longTermMemory",
    }));
  });

  if (sourceCaptureId) {
    const capture = store.captures.find((item) => item.id === sourceCaptureId);
    (capture?.acceptedRoutes || [])
      .filter((route) => route?.decision === "memory")
      .forEach((route) => {
        const kind = normalizeMemoryKind(route.memoryKind) || "memory";
        links.push(publicMemoryItem({
          id: route.memoryItemId || `capture-memory-${route.id}`,
          kind,
          title: route.title,
          detail: route.detail || capture.text,
          ownerId: route.ownerId || "shared",
          targetUserId: route.targetUserId || "",
          source: "capture",
          sourceCaptureId,
          sourceCardIds: route.cardIds || [],
          tags: route.tags,
          actionable: false,
          suggestedDate: route.date,
          itemType: route.itemType,
          score: 72,
          updatedAt: route.acceptedAt,
        }));
      });
  }

  const seen = new Set();
  return links.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 8);
}

function buildMemoryItems(store, userId, selectedDate, relationshipInsights) {
  const items = [];

  (store.longTermMemoryItems || [])
    .filter((item) => !item.archivedAt)
    .forEach((item) => {
      items.push(publicMemoryItem({
        ...item,
        source: item.source || "longTermMemory",
        actionable: false,
        updatedAt: item.updatedAt || item.createdAt,
      }));
    });

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
        suggestedDate: "",
        updatedAt: page.updatedAt || "",
      }));
    });
  });

  collectRawLifeCardItems(store).forEach(({ sourceType, item }) => {
    const itemType = normalizeScheduleItemType(item.itemType, sourceType === "schedule" ? "date" : "thing");
    const memoryKinds = normalizeLifeCardMemoryKinds(item.memoryKinds || item.memoryKind, { ...item, itemType });
    if (!memoryKinds.length) return;
    memoryKinds.forEach((kind) => {
      items.push(publicMemoryItem({
        id: `life-card-memory-${sourceType}-${item.id}-${kind}`,
        kind,
        title: item.title || relationshipInsightKindLabels[kind] || "长期记忆",
        detail: item.detail || sourceCaptureSummary(store, item.sourceCaptureId),
        ownerId: item.ownerId,
        source: "lifeCard",
        sourceCaptureId: item.sourceCaptureId,
        sourceCardIds: [typedLifeCardId(sourceType, item.id)],
        relatedCardIds: normalizeIdList(item.relationIds, 12),
        tags: item.tags,
        actionable: !isArchived(item),
        suggestedDate: item.date || selectedDate,
        itemType,
        score: item.priority === "high" ? 86 : 62,
        updatedAt: item.updatedAt || item.createdAt,
      }));
    });
  });

  return dedupeInsights(items)
    .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 36);
}

function publicScheduleItemCard(store, publicItem, sourceType, userId, options = {}) {
  const itemType = normalizeScheduleItemType(publicItem.itemType, options.itemType || "thing");
  const participants = Array.isArray(publicItem.participants) ? publicItem.participants : [];
  const steps = normalizeLifeCardSteps(publicItem.steps, participants, publicItem.title);
  const tags = normalizeLifeCardTags(publicItem.tags, { ...publicItem, itemType });
  const isDailyCheckin = tags.includes(dailyCheckinCardTag) ||
    (itemType === "checkin" && publicItem.repeatRule === "daily@03:00");
  const completionSteps = isDailyCheckin ? [] : steps;
  const publicStatusByUser = isDailyCheckin
    ? dailyCheckinStatusByUserFromSteps(publicItem, steps)
    : publicItem.statusByUser || {};
  const doneUsers = participants.filter((id) => publicStatusByUser?.[id] === "done");
  const stepsDone = completionSteps.length ? completionSteps.filter((step) => step.status === "done").length : 0;
  const stepsAllDone = Boolean(completionSteps.length && stepsDone === completionSteps.length);
  const currentUserHasTodoStep = completionSteps.some((step) => (!step.ownerId || step.ownerId === userId) && step.status !== "done");
  const date = normalizeDate(options.date || publicItem.date);
  const memoryKinds = normalizeLifeCardMemoryKinds(publicItem.memoryKinds || publicItem.memoryKind, { ...publicItem, itemType });
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
    statusByUser: publicStatusByUser,
    statusUpdatedBy: publicItem.statusUpdatedBy || {},
    statusUpdatedAt: publicItem.statusUpdatedAt || {},
    completion: {
      done: completionSteps.length ? stepsDone : doneUsers.length,
      total: completionSteps.length || participants.length,
      allDone: completionSteps.length ? stepsAllDone : Boolean(participants.length && doneUsers.length === participants.length),
      currentUserDone: completionSteps.length ? !currentUserHasTodoStep : publicStatusByUser?.[userId] === "done",
    },
    priority: publicItem.priority || "",
    manualOrder: normalizeManualOrder(publicItem.manualOrder, 0),
    bucket: publicItem.bucket || "",
    slot: publicItem.slot || "",
    sourceCaptureId: publicItem.sourceCaptureId || "",
    sourceCaptureSummary: sourceCaptureSummary(store, publicItem.sourceCaptureId),
    relatedGroupId: publicItem.relatedGroupId || "",
    parentItemId: publicItem.parentItemId || "",
    relationIds: normalizeIdList(publicItem.relationIds, 16),
    linkedMemoryIds: normalizeIdList(publicItem.linkedMemoryIds, 12),
    tags,
    memoryKinds,
    repeatRule: publicItem.repeatRule || "",
    plannedAt: publicItem.plannedAt || "",
    dueAt: publicItem.dueAt || "",
    durationMin: normalizeDurationMin(publicItem.durationMin, 0),
    steps,
    timeBlocks: normalizeLifeCardTimeBlocks(publicItem.timeBlocks, steps),
    timeEntries: normalizeLifeCardTimeEntries(publicItem.timeEntries),
    archivedAt: publicItem.archivedAt || "",
    archivedBy: publicItem.archivedBy || "",
    createdBy: publicItem.createdBy || "",
    updatedBy: publicItem.updatedBy || "",
    createdAt: publicItem.createdAt || "",
    updatedAt: publicItem.updatedAt || "",
  };
  card.stepProgress = lifeCardStepProgress(card);
  card.timeTracking = lifeCardTimeTracking(card, userId);
  card.nextStep = lifeCardNextStep(card);
  card.timing = lifeCardTiming(card, options.selectedDate || date);
  card.actionSummary = lifeCardActionSummary(card, options.selectedDate || date);
  card.relations = buildLifeCardRelations(store, publicItem, sourceType);
  card.memoryLinks = buildLifeCardMemoryLinks(store, publicItem, sourceType);
  return {
    ...card,
    ...rankScheduleItemCard(card, options.selectedDate || date),
  };
}

function buildScheduleItemCards(store, userId, selectedDate, relationshipInsights = null) {
  const profileIds = getProfileIds(store);
  const today = normalizeDate(selectedDate);
  const dateWindowStart = (() => {
    const date = parseDate(today) || new Date();
    date.setDate(date.getDate() - 14);
    return formatDate(date);
  })();
  const dateWindowEnd = (() => {
    const date = parseDate(today) || new Date();
    date.setDate(date.getDate() + 90);
    return formatDate(date);
  })();
  const segmentWeight = Object.fromEntries(segmentDefinitions.map((item, index) => [item.key, index]));
  const includeDatedItem = (item) => {
    const date = normalizeDate(item.date);
    return date >= dateWindowStart && date <= dateWindowEnd;
  };
  const itemParticipants = (item) => {
    const participants = (Array.isArray(item.participants) ? item.participants : [])
      .filter((id) => profileIds.includes(id));
    return participants.length ? participants : profileIds;
  };
  const includeUnfinishedItem = (item) => {
    if (item.archivedAt) return false;
    const participants = itemParticipants(item);
    if (!participants.length) return true;
    return participants.some((id) => item.statusByUser?.[id] !== "done");
  };
  const includeVisibleItem = (item) => includeDatedItem(item) || includeUnfinishedItem(item);
  const isLegacyCheckinPlaceholder = (item) =>
    /^(?:互相确认今天的状态|一起确认今天的安排|一起确认明天的安排)$/.test(sanitizeText(item?.title, 160));

  const scheduleCards = store.scheduleItems
    .filter(includeVisibleItem)
    .map((item) => publicScheduleItemCard(store, publicScheduleItem(item, profileIds), "schedule", userId, {
      itemType: "date",
      selectedDate: today,
    }));
  const todoCards = store.todoItems
    .filter((item) => normalizeTodoBucket(item.bucket) === "future" || includeVisibleItem(item))
    .map((item) => publicScheduleItemCard(store, publicTodoItem(item, profileIds), "todo", userId, {
      itemType: "thing",
      selectedDate: today,
    }));
  const checkinCards = getCheckinItemsForSummary(store, today)
    .filter((item) => !isLegacyCheckinPlaceholder(item))
    .map((item) => publicScheduleItemCard(store, publicCheckinItem(item, profileIds, today), "checkin", userId, {
      date: today,
      itemType: "checkin",
      timeLabel: item.slot || "每日",
      selectedDate: today,
    }));
  const deadlineCards = store.deadlineItems
    .filter(includeVisibleItem)
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
      const doneSort = Number(Boolean(a.archivedAt || a.completion?.allDone)) -
        Number(Boolean(b.archivedAt || b.completion?.allDone));
      if (doneSort !== 0) return doneSort;
      if (a.date === b.date) {
        const manualA = normalizeManualOrder(a.manualOrder, 0);
        const manualB = normalizeManualOrder(b.manualOrder, 0);
        if (manualA || manualB) return (manualA || 1000000) - (manualB || 1000000);
      }
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

function isCompletedPublicLifeCard(card) {
  return Boolean(card?.archivedAt || card?.completion?.allDone);
}

function homeFocusText(value, maxLength = 88) {
  const cleaned = cleanGeneratedSummaryText(value, maxLength + 40)
    .replace(/^["“”'「」《》]+|["“”'「」《》]+$/g, "")
    .trim();
  if (!cleaned || isDefaultLifeCardTitle(cleaned) || isLowSignalSummaryTitle(cleaned)) return "";
  return shortText(cleaned, maxLength);
}

function homeFocusLabel(value, maxLength = 30) {
  const cleaned = sanitizeText(value, maxLength + 40)
    .replace(/^["“”'「」《》]+|["“”'「」《》]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || badGeneratedSummaryPattern.test(cleaned) || isDefaultLifeCardTitle(cleaned)) return "";
  return shortText(cleaned, maxLength);
}

function scheduleFocusCopy(card, date) {
  const raw = homeFocusText(card.title || card.sourceCaptureSummary || card.detail, 96);
  if (!raw) return null;
  let text = raw.replace(/\s+/g, " ").trim();
  let time = "";
  const timeMatch = text.match(/^(\d{1,2})(?:\s+|[:：点])(\d{2})?\s*(.*)$/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = timeMatch[2] !== undefined && timeMatch[2] !== "" ? Number(timeMatch[2]) : null;
    if (hour >= 0 && hour <= 23 && (minute === null || (minute >= 0 && minute <= 59))) {
      time = minute === null ? `${hour}点` : `${pad(hour)}:${pad(minute)}`;
      text = homeFocusText(timeMatch[3] || raw, 80) || raw;
    }
  }
  const itemType = normalizeScheduleItemType(card.itemType, "thing");
  const cardDate = normalizeDate(card.date, date);
  const label = cardDate === date
    ? itemType === "date" ? "小约会" : itemType === "purchase" ? "小愿望" : itemType === "work" ? "推进一点" : "小事"
    : "接下来";
  const withTime = [time, text].filter(Boolean).join(" ");
  if (/吃|饭|午餐|晚餐|早餐|日料|餐厅|咖啡|奶茶/.test(text)) {
    return {
      title: itemType === "date" ? "好好约会" : "好好吃饭",
      text: `${withTime || text}，猫猫要先把自己照顾好。`,
      meta: time || card.itemTypeLabel,
    };
  }
  if (itemType === "date") {
    return {
      title: "小约会",
      text: `${withTime || text}，这件事可以慢慢期待。`,
      meta: time || (cardDate === date ? "" : cardDate),
    };
  }
  if (itemType === "purchase") {
    return {
      title: "小愿望",
      text: `「${text}」先放进口袋，等一个顺手的时刻。`,
      meta: time || (cardDate === date ? "" : cardDate),
    };
  }
  if (itemType === "work") {
    return {
      title: "推进一点",
      text: withTime || `给「${text}」留一小段专心。`,
      meta: time || (cardDate === date ? "" : cardDate),
    };
  }
  return {
    title: label,
    text: withTime || `把「${text}」轻轻放到这一天。`,
    meta: [time, cardDate === date ? "" : cardDate].filter(Boolean).join(" · ") || card.itemTypeLabel,
  };
}

function buildHomeFocus(store, userId, selectedDate, options = {}) {
  const date = normalizeDate(selectedDate);
  const profileIds = getProfileIds(store);
  const dayContext = options.dayContext || buildDayContext(store, date);
  const relationshipInsights = Array.isArray(options.relationshipInsights)
    ? options.relationshipInsights
    : buildRelationshipInsights(store, userId, date);
  const scheduleItemCards = Array.isArray(options.scheduleItemCards)
    ? options.scheduleItemCards
    : buildScheduleItemCards(store, userId, date, relationshipInsights);
  const memoryItems = Array.isArray(options.memoryItems)
    ? options.memoryItems
    : buildMemoryItems(store, userId, date, relationshipInsights);
  const visibleCaptures = (Array.isArray(options.captures) ? options.captures : store.captures)
    .filter((capture) => capture.date === date)
    .filter((capture) => capture.visibility === "shared" || capture.createdBy === userId)
    .map((capture) => capture.rawKind ? capture : publicCapture(capture))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const publicFocus = (candidate) => candidate ? {
    date,
    kind: sanitizeText(candidate.kind || "note", 40),
    icon: sanitizeText(candidate.icon || "sparkle", 40),
    tone: sanitizeText(candidate.tone || "", 40),
    title: homeFocusLabel(candidate.title, 30),
    text: homeFocusText(candidate.text || candidate.title, 120),
    meta: homeFocusLabel(candidate.meta, 32),
    sourceType: sanitizeText(candidate.sourceType || "", 40),
    sourceId: sanitizeText(candidate.sourceId || "", 100),
    actorId: profileIds.includes(candidate.actorId) ? candidate.actorId : "",
    targetUserId: profileIds.includes(candidate.targetUserId) ? candidate.targetUserId : "",
  } : null;

  const catWord = visibleCaptures
    .filter((capture) => capture.rawKind === "cat-word")
    .find((capture) => homeFocusText(capture.text, 110));
  if (catWord) {
    return publicFocus({
      kind: "cat-word",
      icon: "sparkle",
      tone: catWord.createdBy === userId ? "sent" : "received",
      title: "猫猫的话",
      text: catWord.text,
      meta: catWordStatusLabelForUser(store, catWord, userId),
      sourceType: "cat-word",
      sourceId: catWord.id,
      actorId: catWord.createdBy,
      targetUserId: catWord.targetUserId,
    });
  }

  const summary = publicDailySummary(store.dailySummaries?.[date]);
  if (summary) {
    const title = homeFocusText(normalizeSummaryTitle(summary), 24);
    const diary = homeFocusText(summary.analysis?.diary?.text || summary.narrative || summary.analysis?.keyMoment?.text, 116);
    if (title || diary) {
      return publicFocus({
        kind: "story",
        icon: "star",
        tone: "story",
        title: title || "日总结",
        text: diary || title,
        meta: "日记",
        sourceType: "daily-summary",
        sourceId: date,
      });
    }
  }

  const livingCard = scheduleItemCards
    .filter((card) => !isCompletedPublicLifeCard(card))
    .filter((card) => !isDefaultLifeCardTitle(card.title))
    .find((card) => {
      const cardDate = normalizeDate(card.date, "");
      return cardDate === date || cardDate > date;
    });
  if (livingCard) {
    const copy = scheduleFocusCopy(livingCard, date);
    if (copy?.text) {
      const cardDate = normalizeDate(livingCard.date, date);
      return publicFocus({
        kind: "schedule",
        icon: livingCard.itemType === "date" ? "calendar" : livingCard.itemType === "purchase" ? "bookmark" : "cards",
        tone: livingCard.priority === "high" ? "warm" : "schedule",
        title: copy.title,
        text: copy.text,
        meta: copy.meta || [cardDate === date ? "" : cardDate, livingCard.itemTypeLabel].filter(Boolean).join(" · "),
        sourceType: "lifeCard",
        sourceId: livingCard.id,
        actorId: livingCard.updatedBy || livingCard.createdBy || "",
        targetUserId: livingCard.ownerId,
      });
    }
  }

  const warmInsight = relationshipInsights
    .filter((insight) => ["care", "wish", "promise", "anniversary", "memory", "gratitude"].includes(insight.kind))
    .find((insight) => homeFocusText(insight.title || insight.sourceText || insight.detail, 96));
  if (warmInsight) {
    return publicFocus({
      kind: warmInsight.kind,
      icon: warmInsight.kind === "wish" ? "bookmark" : warmInsight.kind === "anniversary" ? "calendar" : "sparkle",
      tone: "memory",
      title: relationshipInsightKindLabels[warmInsight.kind] || "记忆",
      text: warmInsight.title || warmInsight.sourceText || warmInsight.detail,
      meta: warmInsight.date === date ? "" : warmInsight.date,
      sourceType: warmInsight.sourceCaptureId ? "capture" : "insight",
      sourceId: warmInsight.sourceCaptureId || warmInsight.id,
      actorId: warmInsight.ownerId === "shared" ? "" : warmInsight.ownerId,
      targetUserId: warmInsight.targetUserId,
    });
  }

  const wishMemory = memoryItems
    .filter((item) => item.group === "wish" || ["wish", "purchase", "anniversary", "memory"].includes(item.kind))
    .find((item) => homeFocusText(item.title || item.detail, 96));
  if (wishMemory) {
    return publicFocus({
      kind: "memory",
      icon: wishMemory.group === "time" || wishMemory.kind === "anniversary" ? "calendar" : "bookmark",
      tone: "memory",
      title: wishMemory.kindLabel || relationshipInsightKindLabels[wishMemory.kind] || "长期记忆",
      text: wishMemory.title || wishMemory.detail,
      meta: wishMemory.suggestedDate || "",
      sourceType: "memoryItem",
      sourceId: wishMemory.id,
      actorId: wishMemory.ownerId === "shared" ? "" : wishMemory.ownerId,
      targetUserId: wishMemory.targetUserId,
    });
  }

  const weather = dayContext.weather || {};
  const astronomy = dayContext.astronomy || {};
  const moon = astronomy.moon || {};
  const calendar = dayContext.calendar || {};
  const solarTerm = homeFocusText(calendar.solarTerm, 18);
  const festival = sanitizeList(calendar.festivals, 1, 18)[0];
  const lunar = homeFocusText(calendar.lunar, 18);
  const moonLabel = homeFocusText(astronomy.moonLabel || moon.label, 18);
  const moonIllumination = Math.round(Number(astronomy.moonIllumination ?? moon.illumination) || 0);
  const weatherLabel = homeFocusText(weather.label, 18);
  if (festival || solarTerm || lunar) {
    const title = festival || solarTerm || lunar;
    return publicFocus({
      kind: "calendar",
      icon: festival ? "star" : "sparkle",
      tone: "calendar",
      title,
      text: [festival ? solarTerm : "", lunar].filter(Boolean).join(" · ") || `${title}轻轻来到这一天`,
      meta: weatherLabel,
      sourceType: "day-context",
      sourceId: date,
    });
  }
  if (moonLabel) {
    return publicFocus({
      kind: "moon",
      icon: "moon",
      tone: "moon",
      title: moonLabel,
      text: moonIllumination ? `月亮亮度 ${moonIllumination}%` : "今晚也有月亮",
      meta: weatherLabel,
      sourceType: "day-context",
      sourceId: date,
    });
  }
  return publicFocus({
    kind: "weather",
    icon: weather.icon || (weather.isSunny ? "sun" : "cloud"),
    tone: weather.tone || "weather",
    title: weatherLabel || "小天气",
    text: weather.configured ? `今天是${weatherLabel}` : `今天按${weatherLabel || "小天气"}的心情慢慢来`,
    meta: weather.isSunny ? "晴" : "",
    sourceType: "day-context",
    sourceId: date,
  });
}

function shouldAppendToDailyCheckinCard(itemType, input = {}) {
  const normalized = normalizeScheduleItemType(itemType, "thing");
  if (normalized === "checkin") return true;
  if (normalized !== "habit") return false;
  const text = `${input.title || ""} ${input.detail || ""} ${input.repeatRule || ""}`.trim();
  return !text || /每天|每日|daily|打卡|签到|习惯|固定|运动|锻炼|喝水|早睡|早起/i.test(text);
}

function dailyCheckinAppendTitle(input = {}) {
  const raw = sanitizeText(input.title || input.detail || input.slot || "完成打卡", 120);
  const cleaned = raw
    .replace(/^(?:每天|每日|固定|周期|习惯|打卡)\s*[:：-]?\s*/i, "")
    .replace(/\s*(?:打卡|签到|记录)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitizeText(cleaned || raw || "完成打卡", 120);
}

function appendDailyCheckinStepFromConfirmation(store, userId, body = {}) {
  const profileIds = getProfileIds(store);
  const date = normalizeDate(body.date);
  const { item } = ensureDailyCheckinCard(store, date, userId);
  item.participants = profileIds;
  item.ownerId = "shared";
  item.itemType = "checkin";
  item.repeatRule = "daily@03:00";
  item.tags = normalizeLifeCardTags([...(item.tags || []), dailyCheckinCardTag], { ...item, itemType: "checkin" });

  const title = dailyCheckinAppendTitle(body);
  const titleKey = normalizedTitleKey(title);
  const steps = normalizeDailyCheckinStepsForItem(item);
  const existingIndex = steps.findIndex((step) => normalizedTitleKey(step.title) === titleKey);
  const timestamp = nowIso();
  let changed = false;
  if (existingIndex >= 0) {
    const existing = steps[existingIndex];
    const estimateMin = normalizeDurationMin(body.durationMin, existing.estimateMin);
    if (estimateMin !== existing.estimateMin) {
      steps[existingIndex] = { ...existing, estimateMin };
      changed = true;
    }
  } else {
    steps.push({
      id: makeId("daily-checkin-step"),
      title,
      ownerId: "",
      estimateMin: normalizeDurationMin(body.durationMin, 0),
      status: "todo",
      statusByUser: Object.fromEntries(profileIds.map((id) => [id, "todo"])),
      statusUpdatedBy: {},
      statusUpdatedAt: {},
      sortOrder: steps.length,
    });
    changed = true;
  }

  item.steps = steps.map((step, index) => ({ ...step, sortOrder: index }));
  item.statusByUser = dailyCheckinStatusByUserFromSteps(item, item.steps);
  item.archivedAt = "";
  item.archivedBy = "";
  item.updatedBy = userId;
  item.updatedAt = timestamp;
  if (changed) {
    recordOperation(store, userId, "merge-checkin-step", "todo", item.id, {
      date,
      title,
      sourceType: "todo",
    });
  }
  return {
    raw: item,
    card: publicScheduleItemCard(store, publicTodoItem(item, profileIds), "todo", userId),
  };
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
      const tagInput = input.tags || (parentItemId ? [] : payload.tags);
      const memoryKindInput = input.memoryKinds || input.memoryKind || (parentItemId ? [] : (payload.memoryKinds || payload.memoryKind));
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
        relationIds: normalizeIdList(input.relationIds || payload.relationIds, 16),
        linkedMemoryIds: normalizeIdList(input.linkedMemoryIds || payload.linkedMemoryIds, 12),
        tags: normalizeLifeCardTags(tagInput, input),
        memoryKinds: normalizeLifeCardMemoryKinds(memoryKindInput, input),
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

      if (shouldAppendToDailyCheckinCard(itemType, body)) {
        return appendDailyCheckinStepFromConfirmation(store, userId, body);
      }

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
      recordOperation(store, userId, "create", sourceType, created.id, {
        date: body.date,
        title: created.title,
        sourceType,
      });

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

    return [...new Map([primary.card, ...relatedCards.map((item) => item.card)].map((card) => [card.id, card])).values()];
  });
}

function upsertLongTermMemoryFromRoute(store, userId, capture, route) {
  if (!capture || route?.decision !== "memory") return null;
  store.longTermMemoryItems = Array.isArray(store.longTermMemoryItems) ? store.longTermMemoryItems : [];
  const kind = normalizeMemoryKind(route.memoryKind) || "memory";
  const sourceCaptureId = capture.id || route.sourceCaptureId || "";
  const id = route.memoryItemId || insightId(kind, sourceCaptureId || route.title, route.detail || capture.text || "");
  const existingIndex = store.longTermMemoryItems.findIndex((item) =>
    item.id === id || (sourceCaptureId && item.sourceCaptureId === sourceCaptureId && normalizeMemoryKind(item.kind) === kind)
  );
  const current = existingIndex >= 0 ? store.longTermMemoryItems[existingIndex] : {};
  const timestamp = nowIso();
  const next = normalizeStoredLongTermMemoryItem(store, {
    ...current,
    id: current.id || id,
    kind,
    title: route.title || current.title || relationshipInsightKindLabels[kind] || "长期记忆",
    detail: route.detail || current.detail || capture.text || "",
    ownerId: route.ownerId || current.ownerId || "shared",
    targetUserId: route.targetUserId || current.targetUserId || inferCaptureTargetUserId(store, capture),
    source: "capture",
    sourceCaptureId,
    sourceCardIds: route.cardIds || current.sourceCardIds || [],
    relatedCardIds: current.relatedCardIds || [],
    tags: normalizeLifeCardTags(route.tags || current.tags, { ...route, detail: `${route.detail || ""} ${capture.text || ""}` }),
    suggestedDate: route.date || current.suggestedDate || capture.date,
    itemType: route.itemType || current.itemType || "reminder",
    score: current.score || (route.priority === "high" ? 86 : 70),
    createdBy: current.createdBy || userId,
    updatedBy: userId,
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp,
  });
  if (!next) return null;
  if (existingIndex >= 0) {
    store.longTermMemoryItems[existingIndex] = next;
  } else {
    store.longTermMemoryItems.unshift(next);
  }
  store.longTermMemoryItems = store.longTermMemoryItems.slice(0, 300);
  recordOperation(store, userId, existingIndex >= 0 ? "update" : "create", "long-term-memory", next.id, {
    date: next.suggestedDate || capture.date,
    title: next.title,
    sourceType: "long-term-memory",
  });
  return next;
}

function recordAcceptedCaptureRoute(userId, payload = {}, cardIds = []) {
  return mutateStore((store) => {
    const captureId = sanitizeText(payload.sourceCaptureId || payload.captureId, 80);
    const capture = store.captures.find((item) => item.id === captureId);
    if (!capture) return null;

    const decision = normalizeCaptureDecision(payload.decision, "capture");
    const timestamp = nowIso();
    const route = {
      id: makeId("accepted-route"),
      decision,
      itemType: normalizeScheduleItemType(payload.itemType, "thing"),
      memoryKind: normalizeMemoryKind(payload.memoryKind),
      title: sanitizeText(payload.title || capture.text, 160),
      detail: sanitizeText(payload.detail || payload.reason || "", 360),
      date: normalizeDate(payload.date || capture.date),
      segment: normalizeSegment(payload.segment),
      ownerId: sanitizeText(payload.ownerId || userId, 80),
      priority: normalizePriority(payload.priority),
      confidence: Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : 0,
      tags: normalizeLifeCardTags(payload.tags, payload),
      memoryKinds: normalizeLifeCardMemoryKinds(payload.memoryKinds || payload.memoryKind, payload),
      acceptedBy: userId,
      acceptedAt: timestamp,
      cardIds: cardIds.map((id) => sanitizeText(id, 80)).filter(Boolean).slice(0, 8),
    };
    const memoryItem = upsertLongTermMemoryFromRoute(store, userId, capture, route);
    if (memoryItem) route.memoryItemId = memoryItem.id;

    capture.acceptedRoutes = [route, ...(Array.isArray(capture.acceptedRoutes) ? capture.acceptedRoutes : [])].slice(0, 12);
    capture.analysisIntent = decision;
    if (decision !== "capture") capture.mode = "analysis";
    recordOperation(store, userId, "accept-route", "capture", capture.id, {
      date: capture.date,
      title: route.title,
      sourceType: `capture-${decision}`,
    });
    return publicCapture(capture);
  });
}

function acceptCaptureRoute(userId, payload = {}) {
  const decision = normalizeCaptureDecision(payload.decision, "capture");
  if (decision === "schedule") {
    const created = createLifeCardsFromConfirmation(userId, payload);
    const cards = created.result || [];
    const accepted = recordAcceptedCaptureRoute(userId, payload, cards.map((card) => card.sourceId || card.id));
    return {
      result: {
        decision,
        cards,
        capture: accepted.result,
      },
      store: accepted.store,
    };
  }

  const accepted = recordAcceptedCaptureRoute(userId, payload, []);
  return {
    result: {
      decision,
      cards: [],
      capture: accepted.result,
    },
    store: accepted.store,
  };
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
      summaryTitle: dailySummary ? normalizeSummaryTitle(dailySummary) : "",
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

function isMeaningfulSummaryThing(item) {
  const title = sanitizeText(item?.title, 180);
  if (!title || isDefaultLifeCardTitle(title)) return false;
  if (isLowSignalSummaryTitle(title)) return false;
  if (!item?.sourceCaptureId && /^(?:写下今天最重要的一件事|互相确认今天的状态|一起确认今天的安排|一起确认明天的安排)$/.test(title)) return false;
  return true;
}

function summarizeThing(kind, item, statusByUser, statusMeta = {}) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const doneUsers = participants.filter((id) => statusByUser?.[id] === "done");
  const pendingUsers = participants.filter((id) => statusByUser?.[id] !== "done");
  const statusUpdatedBy = Object.fromEntries(
    participants
      .map((id) => [id, sanitizeText(statusMeta[id]?.updatedBy || item.statusUpdatedBy?.[id], 80)])
      .filter(([, value]) => value)
  );
  const statusUpdatedAt = Object.fromEntries(
    participants
      .map((id) => [id, sanitizeText(statusMeta[id]?.updatedAt || item.statusUpdatedAt?.[id], 40)])
      .filter(([, value]) => value)
  );

  return {
    id: item.id || "",
    kind,
    title: item.title || "",
    detail: item.detail || item.slot || "",
    ownerId: item.ownerId || "shared",
    participants,
    doneUsers,
    pendingUsers,
    createdBy: item.createdBy || "",
    updatedBy: item.updatedBy || "",
    archivedBy: item.archivedBy || "",
    sourceCaptureId: item.sourceCaptureId || "",
    statusUpdatedBy,
    statusUpdatedAt,
    statusActors: participants.map((id) => ({
      userId: id,
      status: statusByUser?.[id] === "done" ? "done" : "todo",
      updatedBy: statusUpdatedBy[id] || "",
      updatedAt: statusUpdatedAt[id] || "",
    })),
  };
}

function isDailySummaryContentOperation(operation) {
  const entityType = sanitizeText(operation?.entityType, 80);
  if (!entityType) return false;
  if (["daily-summary", "profile", "personal-page"].includes(entityType)) return false;
  return true;
}

function buildCompletionTimeline(store, date) {
  return (Array.isArray(store.operations) ? store.operations : [])
    .filter((operation) => ["toggle-status", "toggle-step"].includes(operation.action))
    .filter((operation) => operation.meta?.status === "done")
    .filter((operation) => operation.date === date || String(operation.createdAt || "").slice(0, 10) === date)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(-80)
    .map((operation) => publicCompletionTimelineItem({
      id: operation.id,
      action: operation.action,
      entityType: operation.entityType,
      entityId: operation.entityId,
      taskDate: operation.date,
      completedAt: operation.createdAt,
      actorId: operation.actorId,
      targetUserId: operation.targetUserId || operation.actorId,
      title: operation.meta?.title || "",
      stepTitle: operation.meta?.stepTitle || "",
      status: operation.meta?.status || "done",
    }))
    .filter((item) => item.title && item.completedAt);
}

function qualityLabel(percent) {
  if (percent >= 90) return "高质量完成";
  if (percent >= 75) return "稳定推进";
  if (percent >= 50) return "有推进";
  if (percent > 0) return "轻量推进";
  return "等待开始";
}

function displayNameById(facts, userId) {
  const profile = (facts.profiles || []).find((item) => item.id === userId);
  return profile?.displayName || userId || "";
}

function meaningfulCaptureText(capture) {
  const text = sanitizeText(capture?.text, 120).replace(/\s+/g, " ");
  const coreText = text.replace(/^(早上|上午|中午|下午|晚上|夜里|夜晚|白天|今天|今日)\s*/g, "").trim();
  if (!text || /^\d+$/.test(text)) return "";
  if (isDefaultLifeCardTitle(text) || isLowSignalSummaryTitle(text) || isLowSignalSummaryTitle(coreText)) return "";
  if (/^(做了?别的事|别的事)$/.test(coreText)) return "";
  return text;
}

function buildFallbackNarrative(facts) {
  const sentences = [];
  const pulseParts = (facts.status_by_user || []).flatMap((person) => {
    const name = displayNameById(facts, person.userId);
    return [
      person.happiestThing ? `${name}最开心的是 ${person.happiestThing}` : "",
      person.smallAchievement ? `${name}的核心贡献是 ${person.smallAchievement}` : "",
    ].filter(Boolean);
  });
  const captureParts = (facts.captures || []).map(meaningfulCaptureText).filter(Boolean);
  const completedTitles = (facts.completed_items || [])
    .filter(isMeaningfulSummaryThing)
    .map((item) => item.title)
    .slice(0, 3);
  const missedTitles = (facts.missed_items || [])
    .filter(isMeaningfulSummaryThing)
    .map((item) => item.title)
    .slice(0, 2);

  if (pulseParts.length) {
    sentences.push(pulseParts.slice(0, 3).join("；"));
  } else if (captureParts.length) {
    sentences.push(`随手记里留下了：${captureParts.slice(0, 2).join("；")}`);
  }
  if (completedTitles.length) sentences.push(`已完成：${completedTitles.join("、")}`);
  if (missedTitles.length) sentences.push(`明天继续：${missedTitles.join("、")}`);
  if (facts.locations?.length) sentences.push(`地点：${facts.locations.slice(0, 2).join("、")}`);

  return sentences.length ? `${sentences.join("。")}。` : "";
}

function storySnippetForPrompt(summary, date) {
  if (!summary) return null;
  const analysis = normalizeDailyAnalysis(summary.analysis);
  const title = normalizeSummaryTitle(summary, "");
  const diaryText = cleanGeneratedSummaryText(analysis.diary?.text || summary.narrative, 220);
  if (!title && !diaryText) return null;
  return {
    date,
    title,
    opening: diaryText ? diaryText.slice(0, 80) : "",
  };
}

function buildRecentDailyStorySnippets(store, date, maxItems = 5) {
  if (!store?.dailySummaries) return [];
  return Array.from({ length: maxItems * 2 }, (_, index) => addDays(date, -(index + 1)))
    .map((day) => storySnippetForPrompt(store.dailySummaries[day], day))
    .filter(Boolean)
    .slice(0, maxItems);
}

function analysisUserIds(input) {
  const source = Array.isArray(input?.userIds) ? input.userIds :
    Array.isArray(input?.user_ids) ? input.user_ids : [];
  return sanitizeList(source, 6, 80);
}

function analysisEvidence(input) {
  return sanitizeList(input?.evidence, 4, 160).filter((item) => cleanGeneratedSummaryText(item, 160));
}

function normalizeAgentUserId(value, profiles = []) {
  const raw = sanitizeText(value, 80);
  if (!raw) return "";
  const matched = profiles.find((profile) =>
    profile.id === raw ||
    profile.displayName === raw ||
    profile.initials === raw ||
    profile.login === raw
  );
  return matched?.id || raw;
}

function normalizeAgentAnalysisUserIds(analysis, profiles = []) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const normalizeEntry = (entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const ids = Array.isArray(entry.user_ids)
      ? entry.user_ids
      : Array.isArray(entry.userIds)
        ? entry.userIds
        : [];
    const user_ids = [...new Set(ids.map((id) => normalizeAgentUserId(id, profiles)).filter(Boolean))];
    return {
      ...entry,
      user_ids,
    };
  };
  const normalizeItems = (items) => Array.isArray(items) ? items.map(normalizeEntry) : items;
  return {
    ...analysis,
    key_moment: normalizeEntry(analysis.key_moment || analysis.keyMoment),
    core_contributions: normalizeItems(analysis.core_contributions || analysis.coreContributions),
    carry_forward: normalizeItems(analysis.carry_forward || analysis.carryForward),
    memory_clues: normalizeItems(analysis.memory_clues || analysis.memoryClues),
    daily_review: {
      did: normalizeEntry(analysis.daily_review?.did || analysis.dailyReview?.did),
      shortcoming: normalizeEntry(analysis.daily_review?.shortcoming || analysis.dailyReview?.shortcoming),
      tomorrow: normalizeEntry(analysis.daily_review?.tomorrow || analysis.dailyReview?.tomorrow),
    },
  };
}

function normalizeAnalysisBlock(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const backup = fallback && typeof fallback === "object" ? fallback : {};
  return {
    title: cleanGeneratedSummaryText(source.title || backup.title, 100),
    text: cleanGeneratedSummaryText(source.text || source.detail || backup.text || backup.detail, 500),
    userIds: analysisUserIds(source).length ? analysisUserIds(source) : analysisUserIds(backup),
    evidence: analysisEvidence(source).length ? analysisEvidence(source) : analysisEvidence(backup),
  };
}

function normalizeAnalysisItem(input = {}, fallback = {}) {
  const block = normalizeAnalysisBlock(input, fallback);
  return {
    kind: cleanGeneratedSummaryText(input?.kind || fallback?.kind, 40),
    title: block.title,
    detail: cleanGeneratedSummaryText(input?.detail || input?.text || fallback?.detail || fallback?.text, 500),
    userIds: block.userIds,
    evidence: block.evidence,
  };
}

function normalizeAnalysisItems(items, fallbackItems = [], maxItems = 4) {
  const source = Array.isArray(items) && items.length ? items : fallbackItems;
  return (Array.isArray(source) ? source : [])
    .map((item) => normalizeAnalysisItem(item))
    .filter((item) => item.title || item.detail)
    .slice(0, maxItems);
}

function normalizeDailyAnalysis(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const backup = fallback && typeof fallback === "object" ? fallback : {};
  const diarySource = source.diary || backup.diary || {};
  return {
    keyMoment: normalizeAnalysisBlock(source.key_moment || source.keyMoment, backup.keyMoment),
    coreContributions: normalizeAnalysisItems(source.core_contributions || source.coreContributions, backup.coreContributions, 4),
    carryForward: normalizeAnalysisItems(source.carry_forward || source.carryForward, backup.carryForward, 4),
    memoryClues: normalizeAnalysisItems(source.memory_clues || source.memoryClues, backup.memoryClues, 4),
    dailyReview: {
      did: normalizeAnalysisBlock(source.daily_review?.did || source.dailyReview?.did, backup.dailyReview?.did),
      shortcoming: normalizeAnalysisBlock(source.daily_review?.shortcoming || source.dailyReview?.shortcoming, backup.dailyReview?.shortcoming),
      tomorrow: normalizeAnalysisBlock(source.daily_review?.tomorrow || source.dailyReview?.tomorrow, backup.dailyReview?.tomorrow),
    },
    diary: {
      title: cleanGeneratedSummaryText(diarySource.title || "日记", 100) || "日记",
      text: cleanGeneratedSummaryText(diarySource.text || diarySource.detail || backup.diary?.text || backup.diary?.detail, 1200),
    },
  };
}

function buildFallbackAnalysis(facts, narrative, nextStep, title = "") {
  const pulses = facts.status_by_user || [];
  const happiest = pulses.find((person) => person.happiestThing);
  const captureTexts = (facts.captures || []).map(meaningfulCaptureText).filter(Boolean);
  const firstCompleted = (facts.completed_items || []).find(isMeaningfulSummaryThing);

  const keyMoment = happiest
    ? {
        title: "最开心",
        text: `${displayNameById(facts, happiest.userId)}：${happiest.happiestThing}`,
        userIds: [happiest.userId],
        evidence: ["每日状态"],
      }
    : captureTexts.length
      ? {
          title: "现场",
          text: captureTexts[0],
          userIds: [],
          evidence: ["随手记"],
        }
      : firstCompleted
        ? {
            title: "推进",
            text: firstCompleted.title,
            userIds: firstCompleted.doneUsers || [],
            evidence: [firstCompleted.kind || "猫猫的事"],
          }
        : {
            title: "今日",
            text: narrative || "",
            userIds: [],
            evidence: [],
          };

  const coreContributions = pulses
    .filter((person) => person.smallAchievement)
    .map((person) => ({
      title: displayNameById(facts, person.userId),
      detail: person.smallAchievement,
      userIds: [person.userId],
      evidence: ["核心贡献"],
    }));
  if (!coreContributions.length) {
    (facts.completed_items || []).filter(isMeaningfulSummaryThing).slice(0, 3).forEach((item) => {
      coreContributions.push({
        title: item.title,
        detail: item.detail || "已完成",
        userIds: item.doneUsers || [],
        evidence: [item.kind || "猫猫的事"],
      });
    });
  }

  const carryForward = (facts.missed_items || [])
    .filter(isMeaningfulSummaryThing)
    .slice(0, 3)
    .map((item) => ({
      title: item.title,
      detail: item.detail || nextStep || "",
      userIds: item.pendingUsers || [],
      evidence: [item.kind || "猫猫的事"],
    }));

  const memoryClues = (facts.relationshipInsights || [])
    .slice(0, 3)
    .map((item) => ({
      kind: item.kind || "memory",
      title: item.title || item.kindLabel || "记忆",
      detail: item.sourceText || item.detail || "",
      userIds: [item.targetUserId, item.ownerId].filter((id) => id && id !== "shared"),
      evidence: [item.sourceCaptureId ? "随手记" : "长期记忆"],
    }))
    .filter((item) => item.title || item.detail);
  const didText = coreContributions.length
    ? coreContributions.map((item) => [item.title, item.detail].filter(Boolean).join("：")).join("；")
    : (facts.completed_items || []).filter(isMeaningfulSummaryThing).slice(0, 3).map((item) => item.title).join("、");
  const shortcomingText = carryForward.length
    ? carryForward.map((item) => item.title).join("、")
    : "";
  const tomorrowText = carryForward[0]?.detail || nextStep || "";

  return normalizeDailyAnalysis({}, {
    keyMoment,
    coreContributions,
    carryForward,
    memoryClues,
    dailyReview: {
      did: {
        title: didText ? "今天做了什么" : "",
        text: didText,
        userIds: [...new Set(coreContributions.flatMap((item) => item.userIds || []))],
        evidence: ["今日推进"],
      },
      shortcoming: {
        title: shortcomingText ? "还差一点" : "",
        text: shortcomingText,
        userIds: [...new Set(carryForward.flatMap((item) => item.userIds || []))],
        evidence: ["待推进"],
      },
      tomorrow: {
        title: tomorrowText ? "明天怎么做" : "",
        text: tomorrowText,
        userIds: [...new Set(carryForward.flatMap((item) => item.userIds || []))],
        evidence: ["明天"],
      },
    },
    diary: {
      title: title || "日记",
      text: narrative || "",
    },
  });
}

function buildAgentPrompt(facts) {
  const skillText = fs.existsSync(dailySummarySkillPath)
    ? fs.readFileSync(dailySummarySkillPath, "utf8").trim()
    : "";
  return [
    "你是 PEOS 双人生活系统的 Daily Story Agent。请基于输入事实生成一天的共享日总结。",
    "严格规则：",
    "- 只能使用输入事实，不允许编造事件、地点、照片、情绪或完成状态。",
    "- 必须区分人：profiles 是人员表；createdBy/updatedBy 是操作人；doneUsers/pendingUsers 是状态对象；statusUpdatedBy[userId] 是这个人的状态由谁操作。",
    "- 如果事实不足以判断是谁做的，就温和写成“归属还不清楚/还没看出是谁按下完成”，不要猜，也不要说“记录里没有明确归属”。",
    "- 最终展示文字必须使用人话，不要写 createdBy、doneUsers、statusUpdatedBy、actorId、每日状态对象等字段名或开发者词。",
    "- 如果只知道归属但不知道操作人，用“归在某人名下，记录没有写明是谁操作完成”，不要暴露字段名。",
    "- 忽略默认占位卡：今天有没有开开心心？、写下今天最重要的一件事、互相确认今天的状态、一起确认今天的安排、一起确认明天的安排。",
    "- 忽略低信号随手记：纯数字、做别的事、上午做别的事、没有具体对象或动作的流水话。",
    "- 优先使用每日状态里的最开心的事、核心贡献、随手记、完成状态和长期记忆线索。",
    "- completion/source_counts 只能辅助判断信息量，不要只根据数字推断还有几件事；待推进内容必须来自 missed_items 或明确随手记。",
    "- 随手记是证据来源，不要逐条平铺复述；要先整理成 key_moment/core_contributions/carry_forward/memory_clues/diary。",
    "- 所有最终展示字段都要由 Agent 重新生成，不要复制 fallback 句式，不要把输入字段简单改写成清单。",
    "- 文字要像给两个人看的回忆，不要写后台、系统、记录留下了几条线索、完成率报表这类话。",
    "- title 必须是 4-12 个中文左右的可爱小标题，要抓当天最有特征的一点，短暂、具体、每天不一样。",
    "- title 禁止写日期、05/09、共同回忆、日总结、今日、这一天，也不要套用固定模板。",
    "- dayContext 是当天的天气、月相、节气、农历和节日上下文；可以轻轻带进标题或 diary，但只能使用输入里给出的内容。",
    "- 如果 dayContext.weather.source 是 daily-random，它只是未配置真实天气时的可爱占位，不要把它写成确定的真实天气。",
    "- 月相、节气、农历和节日可以作为当天氛围锚点，但不能替代真实发生的生活事实。",
    "- next_step 只写明天最值得顺手带上的一件事；没有事实就留轻一点，不要硬编。",
    "- analysis.key_moment 写最值得记住的一件事；core_contributions 写每个人可归属的贡献；carry_forward 写明天顺手带上的事；memory_clues 写长期记忆线索；diary.text 写一篇可直接展示的小日记。",
    "- analysis.daily_review.did 写今天实际做了什么；shortcoming 写有什么不足或还差什么；tomorrow 写明天可以怎么做。三项都必须基于输入事实，不要从统计数字臆测任务。",
    "- daily_review 三项是给页面展示的短总结：每项 title 要短、具体、有信息；text 写 1 句自然解释；title 不要直接写“今天做了什么/有什么不足/明天怎么做”。",
    "- diary.text 是主展示内容，要像一段写给对方看的小日记：自然、亲近、轻一点，有画面感，但不能油腻、不能编造。",
    "- 反模板要求：不要每天都用同一种开头、同一种三段逻辑、同一种“做了什么/不足/明天”腔调。根据当天事实自然选择重点。",
    "- diary.text 必须有一个当天独有锚点：一句原话、一个人、一个地点、一个动作、一个未完成的小尾巴、一个偏好或一个长期记忆线索。",
    "- diary.text 写成 1 段 2-5 句，不要分点，不要像周报，不要把 daily_review 三项再复述一遍。",
    "- diary.text 不要像项目报告，不要用“今天最清楚留下来的，是”“今天的页面很轻”“记录里/记录显示/没有显示”“没有太多具体安排”“这边”“事项”“收尾情况”“事实不足”“信息不足”“记录较少”等腔调。",
    "- diary.text 可以承认没完成，但要换成人话，例如“作业还差一个轻轻收口”“日料先从找一家安静小店开始”，不要写“没有在记录里收尾/没有显示两个人完成”。",
    "- 如果今天素材很少，也写成一张很短的小纸条，只抓真实线索；不要写“信息少/数据不足/没有谁完成了什么”。",
    "- recentDailyStories 只用于避免重复标题、开头和句式，绝不能把其他日期的事件写进今天。",
    "- 结构化字段也要短而有温度：title 像小标题，detail 像一句解释，不要堆证据说明。",
    "- 输出必须严格符合给定 JSON schema。",
    skillText ? "\n参考 skill：\n" + skillText : "",
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
    .map((item) => summarizeThing(scheduleItemTypeLabels[normalizeScheduleItemType(item.itemType, "date")] || "猫猫的事", item, item.statusByUser || {}))
    .filter(isMeaningfulSummaryThing);
  const todoThings = store.todoItems
    .filter((item) => item.date === date && normalizeTodoBucket(item.bucket) !== "future")
    .map((item) => summarizeThing(scheduleItemTypeLabels[normalizeScheduleItemType(item.itemType, "thing")] || "事情", item, item.statusByUser || {}))
    .filter(isMeaningfulSummaryThing);
  const checkinThings = getCheckinItemsForSummary(store, date)
    .map((item) => summarizeThing("打卡", item, item.statusByDate?.[date] || {}, item.statusMetaByDate?.[date] || {}))
    .filter(isMeaningfulSummaryThing);
  const things = [...todoThings, ...scheduleThings, ...checkinThings];
  const completed = things.filter((item) => item.participants.length && item.pendingUsers.length === 0);
  const missed = things.filter((item) => item.pendingUsers.length > 0);
  const meaningfulStatsByUser = Object.fromEntries(profileIds.map((id) => [id, { done: 0, total: 0, percent: 0 }]));
  things.forEach((item) => {
    (item.participants || []).forEach((id) => {
      if (!meaningfulStatsByUser[id]) return;
      meaningfulStatsByUser[id].total += 1;
      if ((item.doneUsers || []).includes(id)) meaningfulStatsByUser[id].done += 1;
    });
  });
  Object.values(meaningfulStatsByUser).forEach((stat) => {
    stat.percent = stat.total ? Math.round((stat.done / stat.total) * 100) : 0;
  });
  const captures = store.captures
    .filter((item) => item.date === date)
    .filter((item) => options.includePrivate || item.visibility === "shared")
    .map(publicCapture)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const photos = captures.flatMap((capture) => capture.assets || []);
  const locations = [...new Set(captures.map((capture) => sanitizeText(capture.location, 80)).filter(Boolean))];
  const dayContext = buildDayContext(store, date, { captures });
  const weather = dayContext.weather;
  const people = store.profiles.map((profile) => {
    const day = store.diaryDays[date]?.userDays?.[profile.id] || {};
    const stat = meaningfulStatsByUser[profile.id] || { done: 0, total: 0, percent: 0 };
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
      createdBy: day.createdBy || profile.id,
      updatedBy: day.updatedBy || "",
      updatedAt: day.updatedAt || "",
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
      rawKind: capture.rawKind,
      rawFormat: capture.rawFormat,
      analysisIntent: capture.analysisIntent,
      location: capture.location,
      createdBy: capture.createdBy,
      createdAt: capture.createdAt,
      photoCount: capture.assets.length,
    })),
    operations: store.operations
      .filter((operation) => isDailySummaryContentOperation(operation))
      .filter((operation) => operation.date === date || String(operation.createdAt || "").slice(0, 10) === date)
      .slice(-40)
      .map((operation) => ({
        action: operation.action,
        entityType: operation.entityType,
        entityId: operation.entityId,
        actorId: operation.actorId,
        targetUserId: operation.targetUserId,
        title: operation.meta?.title || "",
        status: operation.meta?.status || "",
        createdAt: operation.createdAt,
      })),
    locations,
    weather,
    dayContext,
    photos: photos.map(publicDiaryAsset).filter(Boolean),
    completionTimeline: buildCompletionTimeline(store, date),
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
      operations: store.operations
        .filter((operation) => isDailySummaryContentOperation(operation))
        .filter((operation) => operation.date === date || String(operation.createdAt || "").slice(0, 10) === date).length,
    },
    relationshipInsights,
    recentDailyStories: buildRecentDailyStorySnippets(store, date),
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
      if (options.requireAgent) {
        throw new Error(`daily summary agent failed: ${error.message}`);
      }
      mode = "fallback";
    }
  }

  const fallbackTitle = buildCuteSummaryTitle(facts);
  const completed = facts.completed_items.map(publicSummaryThing);
  const missed = facts.missed_items.map(publicSummaryThing);
  const photos = facts.photos.map(publicDiaryAsset).filter(Boolean);
  const agentAnalysis = normalizeAgentAnalysisUserIds(agent?.analysis, facts.profiles);
  const agentDiaryText = cleanGeneratedSummaryText(agentAnalysis?.diary?.text || agentAnalysis?.diary?.detail, 1200);
  const narrative = mode === "agent"
    ? (agentDiaryText || cleanGeneratedSummaryText(agent?.narrative, 900))
    : (cleanGeneratedSummaryText(agent?.narrative, 900) || cleanGeneratedSummaryText(buildFallbackNarrative(facts), 900));
  const label = cleanGeneratedSummaryText(agent?.quality_label || qualityLabel(percent), 80);
  const qualityNote = cleanGeneratedSummaryText(agent?.quality_note, 240);
  const nextStepText = cleanGeneratedSummaryText(
    agent?.next_step ||
      (mode === "agent"
        ? ""
        : missed.length
        ? `先带上：${missed.slice(0, 2).map((item) => item.title).join("、")}`
        : ""),
    240
  );
  const analysis = normalizeDailyAnalysis(
    agentAnalysis,
    mode === "agent" ? {} : buildFallbackAnalysis(facts, narrative, nextStepText, fallbackTitle)
  );

  return {
    date,
    title: cleanGeneratedSummaryText(agent?.title, 80) || (mode === "agent" ? cleanGeneratedSummaryText(analysis.diary?.title, 80) : "") || fallbackTitle,
    subtitle: facts.locations.length
      ? `地点：${facts.locations.join("、")}`
      : "",
    narrative,
    qualityScore: percent,
    qualityLabel: label,
    qualityNote,
    nextStep: nextStepText,
    analysis,
    illustration: photos[0]
      ? { type: "photo", url: photos[0].url, alt: photos[0].name || "当天照片" }
      : { type: "pixel", url: "", alt: "像素小猫日总结" },
    people: facts.status_by_user,
    completed: completed.slice(0, 10),
    missed: missed.slice(0, 10),
    moments: facts.captures.slice(0, 8),
    memoryHooks: facts.relationshipInsights.slice(0, 6),
    locations: facts.locations,
    weather: facts.weather,
    dayContext: facts.dayContext,
    photos: photos.slice(0, 8),
    completionTimeline: facts.completionTimeline.slice(0, 80),
    stats: facts.completion,
    sourceCounts: facts.source_counts,
    generatedBy: userId,
    generatedAt: nowIso(),
    mode,
  };
}

function getState(userId, options = {}) {
  ensureDailyCheckinCardPersisted(businessDate(), "system");
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
  const dayContext = buildDayContext(store, selectedDate, { captures: visibleCaptures });
  const scheduleItemCards = buildScheduleItemCards(store, userId, selectedDate, relationshipInsights);
  const memoryItems = buildMemoryItems(store, userId, selectedDate, relationshipInsights);
  const homeFocus = buildHomeFocus(store, userId, selectedDate, {
    captures: visibleCaptures,
    dayContext,
    relationshipInsights,
    scheduleItemCards,
    memoryItems,
  });

  return {
    apiVersion: store.apiVersion,
    revision: store.revision,
    updatedAt: store.updatedAt,
    today: businessDate(),
    selectedDate,
    calendarContext: calendarContextForDate(selectedDate),
    dayContext,
    homeFocus,
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
    dailySummary: publicDailySummary(store.dailySummaries[selectedDate], {
      completionTimeline: buildCompletionTimeline(store, selectedDate),
    }),
    scheduleItemCards,
    relationshipInsights,
    memoryHints: buildMemoryHints(store, relationshipInsights),
    memoryItems,
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
      recordOperation(store, userId, "create", "schedule", created.id, { date: created.date, title: created.title, sourceType: "schedule" });
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
    existing.relationIds = normalizeIdList(payload.relationIds ?? existing.relationIds, 16);
    existing.linkedMemoryIds = normalizeIdList(payload.linkedMemoryIds ?? existing.linkedMemoryIds, 12);
    existing.tags = normalizeLifeCardTags(payload.tags ?? existing.tags, { ...existing, ...payload });
    existing.memoryKinds = normalizeLifeCardMemoryKinds(payload.memoryKinds ?? payload.memoryKind ?? existing.memoryKinds, { ...existing, ...payload });
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule, 120);
    existing.priority = normalizePriority(payload.priority || existing.priority);
    existing.manualOrder = normalizeManualOrder(payload.manualOrder, existing.manualOrder);
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

    recordOperation(store, userId, "update", "schedule", existing.id, { date: existing.date, title: existing.title, sourceType: "schedule" });
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
    assertStatusTargetAllowed(item, userId, targetUserId, payload);
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    applyStepAwareStatusToggle(item, targetUserId, userId, payload);
    const timestamp = nowIso();
    markStatusOperation(item, targetUserId, userId, timestamp);
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, "toggle-status", "schedule", item.id, {
      date: item.date,
      title: item.title,
      targetUserId,
      status: item.statusByUser?.[targetUserId],
      sourceType: "schedule",
    });

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
    const restoring = Boolean(item.archivedAt);
    if (restoring) {
      item.archivedAt = "";
      item.archivedBy = "";
      resetLifeCardCompletion(item);
    } else {
      item.archivedAt = timestamp;
      item.archivedBy = userId;
    }
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, restoring ? "restore" : "archive", "schedule", item.id, { date: item.date, title: item.title, sourceType: "schedule" });

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
    recordOperation(store, userId, "delete", "schedule", removed.id, { date: removed.date, title: removed.title, sourceType: "schedule" });
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
      recordOperation(store, userId, "create", "todo", created.id, { date: created.date, title: created.title, sourceType: "todo" });
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
    existing.relationIds = normalizeIdList(payload.relationIds ?? existing.relationIds, 16);
    existing.linkedMemoryIds = normalizeIdList(payload.linkedMemoryIds ?? existing.linkedMemoryIds, 12);
    existing.tags = normalizeLifeCardTags(payload.tags ?? existing.tags, { ...existing, ...payload });
    existing.memoryKinds = normalizeLifeCardMemoryKinds(payload.memoryKinds ?? payload.memoryKind ?? existing.memoryKinds, { ...existing, ...payload });
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule, 120);
    existing.priority = normalizePriority(payload.priority || existing.priority);
    existing.manualOrder = normalizeManualOrder(payload.manualOrder, existing.manualOrder);
    existing.ownerId = ownerId;
    existing.participants = participants;
    existing.statusByUser = Object.fromEntries(
      participants.map((id) => [
        id,
        validStatuses.has(existing.statusByUser?.[id]) ? existing.statusByUser[id] : "todo",
      ])
    );
    Object.assign(existing, buildLifeCardPlanning({ ...payload, date: existing.date, participants }, existing));
    if (normalizeLifeCardTags(existing.tags, existing).includes(dailyCheckinCardTag)) {
      existing.itemType = "checkin";
      existing.ownerId = "shared";
      existing.participants = profileIds;
      existing.tags = normalizeLifeCardTags([...(existing.tags || []), dailyCheckinCardTag], { ...existing, itemType: "checkin" });
      existing.repeatRule = "daily@03:00";
      existing.steps = normalizeDailyCheckinStepsForItem(existing);
      existing.statusByUser = dailyCheckinStatusByUserFromSteps(existing, existing.steps);
    }
    existing.updatedBy = userId;
    existing.updatedAt = nowIso();

    if (!existing.title) {
      throw new Error("todo title is required");
    }

    recordOperation(store, userId, "update", "todo", existing.id, { date: existing.date, title: existing.title, sourceType: "todo" });
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
    assertStatusTargetAllowed(item, userId, targetUserId, payload);
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    applyStepAwareStatusToggle(item, targetUserId, userId, payload);
    const timestamp = nowIso();
    markStatusOperation(item, targetUserId, userId, timestamp);
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, "toggle-status", "todo", item.id, {
      date: item.date,
      title: item.title,
      targetUserId,
      status: item.statusByUser?.[targetUserId],
      sourceType: "todo",
    });
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
    const restoring = Boolean(item.archivedAt);
    if (restoring) {
      item.archivedAt = "";
      item.archivedBy = "";
      resetLifeCardCompletion(item);
    } else {
      item.archivedAt = timestamp;
      item.archivedBy = userId;
    }
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, restoring ? "restore" : "archive", "todo", item.id, { date: item.date, title: item.title, sourceType: "todo" });

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
    recordOperation(store, userId, "delete", "todo", removed.id, { date: removed.date, title: removed.title, sourceType: "todo" });
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
      recordOperation(store, userId, "create", "checkin", created.id, { date: normalizeDate(payload.date), title: created.title, sourceType: "checkin" });
      return publicCheckinItem(created, profileIds, normalizeDate(payload.date));
    }

    existing.title = sanitizeText(payload.title ?? existing.title, 120);
    existing.slot = sanitizeText(payload.slot ?? existing.slot, 80);
    existing.itemType = inferScheduleItemType(payload, normalizeScheduleItemType(existing.itemType, "checkin"));
    existing.sourceCaptureId = sanitizeText(payload.sourceCaptureId ?? existing.sourceCaptureId, 80);
    existing.relatedGroupId = sanitizeText(payload.relatedGroupId ?? existing.relatedGroupId, 80);
    existing.parentItemId = sanitizeText(payload.parentItemId ?? existing.parentItemId, 80);
    existing.relationIds = normalizeIdList(payload.relationIds ?? existing.relationIds, 16);
    existing.linkedMemoryIds = normalizeIdList(payload.linkedMemoryIds ?? existing.linkedMemoryIds, 12);
    existing.tags = normalizeLifeCardTags(payload.tags ?? existing.tags, { ...existing, ...payload });
    existing.memoryKinds = normalizeLifeCardMemoryKinds(payload.memoryKinds ?? payload.memoryKind ?? existing.memoryKinds, { ...existing, ...payload });
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule ?? "daily", 120);
    existing.manualOrder = normalizeManualOrder(payload.manualOrder, existing.manualOrder);
    existing.ownerId = "shared";
    existing.participants = profileIds;
    existing.statusByDate = existing.statusByDate || {};
    existing.updatedBy = userId;
    existing.updatedAt = nowIso();

    if (!existing.title) {
      throw new Error("checkin title is required");
    }

    recordOperation(store, userId, "update", "checkin", existing.id, { date: normalizeDate(payload.date), title: existing.title, sourceType: "checkin" });
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
    assertStatusTargetAllowed(item, userId, targetUserId, payload);
    if (!item.participants.includes(targetUserId)) {
      item.participants.push(targetUserId);
    }

    item.statusByDate = item.statusByDate || {};
    item.statusByDate[date] = item.statusByDate[date] || {};
    const currentStatus = validStatuses.has(item.statusByDate[date][targetUserId])
      ? item.statusByDate[date][targetUserId]
      : "todo";
    const timestamp = nowIso();
    item.statusByDate[date][targetUserId] = validStatuses.has(payload.status)
      ? payload.status
      : currentStatus === "done"
        ? "todo"
        : "done";
    markCheckinStatusOperation(item, date, targetUserId, userId, timestamp);
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, "toggle-status", "checkin", item.id, {
      date,
      title: item.title,
      targetUserId,
      status: item.statusByDate[date][targetUserId],
      sourceType: "checkin",
    });

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
    recordOperation(store, userId, "delete", "checkin", removed.id, { title: removed.title, sourceType: "checkin" });
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
      recordOperation(store, userId, "create", "deadline", created.id, { date: created.date, title: created.title, sourceType: "deadline" });
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
    existing.relationIds = normalizeIdList(payload.relationIds ?? existing.relationIds, 16);
    existing.linkedMemoryIds = normalizeIdList(payload.linkedMemoryIds ?? existing.linkedMemoryIds, 12);
    existing.tags = normalizeLifeCardTags(payload.tags ?? existing.tags, { ...existing, ...payload });
    existing.memoryKinds = normalizeLifeCardMemoryKinds(payload.memoryKinds ?? payload.memoryKind ?? existing.memoryKinds, { ...existing, ...payload });
    existing.repeatRule = sanitizeText(payload.repeatRule ?? existing.repeatRule, 120);
    existing.priority = normalizePriority(payload.priority || existing.priority);
    existing.manualOrder = normalizeManualOrder(payload.manualOrder, existing.manualOrder);
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

    recordOperation(store, userId, "update", "deadline", existing.id, { date: existing.date, title: existing.title, sourceType: "deadline" });
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
    assertStatusTargetAllowed(item, userId, targetUserId, payload);
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
    const timestamp = nowIso();
    markStatusOperation(item, targetUserId, userId, timestamp);
    item.updatedBy = userId;
    item.updatedAt = timestamp;
    recordOperation(store, userId, "toggle-status", "deadline", item.id, {
      date: item.date,
      title: item.title,
      targetUserId,
      status: item.statusByUser?.[targetUserId],
      sourceType: "deadline",
    });

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
    recordOperation(store, userId, "delete", "deadline", removed.id, { date: removed.date, title: removed.title, sourceType: "deadline" });
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
    const timestamp = nowIso();
    current.userDays[userId] = {
      ...userDay,
      createdBy: userDay.createdBy || userId,
      mood: sanitizeText(payload.mood ?? userDay.mood, 40),
      energy: Math.max(1, Math.min(5, Number(payload.energy ?? userDay.energy) || 3)),
      focus: sanitizeText(payload.focus ?? userDay.focus, 160),
      note: sanitizeText(payload.note ?? userDay.note, 1200),
      markdown: sanitizeMarkdown(payload.markdown ?? userDay.markdown ?? userDay.note, 20000),
      dailyScore: normalizeDailyScore(payload.dailyScore ?? userDay.dailyScore, 0),
      happiestThing: sanitizeText(payload.happiestThing ?? userDay.happiestThing, 220),
      smallAchievement: sanitizeText(payload.smallAchievement ?? userDay.smallAchievement, 220),
      images: Array.isArray(userDay.images) ? userDay.images.map(publicDiaryAsset).filter(Boolean) : [],
      updatedBy: userId,
      updatedAt: timestamp,
    };
    store.diaryDays[date] = current;
    recordOperation(store, userId, "update", "daily-pulse", `${date}:${userId}`, { date, targetUserId: userId, sourceType: "daily-pulse" });
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
    const timestamp = nowIso();
    current.userDays[userId] = {
      ...userDay,
      createdBy: userDay.createdBy || userId,
      images: [...(Array.isArray(userDay.images) ? userDay.images : []), asset],
      updatedBy: userId,
      updatedAt: timestamp,
    };
    store.diaryDays[date] = current;
    recordOperation(store, userId, "add-asset", "daily-pulse", `${date}:${userId}`, { date, targetUserId: userId, sourceType: "daily-pulse" });

    return {
      asset: publicDiaryAsset(asset),
      diaryDay: getDiaryDaySnapshot(store, date),
      markdown: `![${asset.name}](${asset.url})`,
    };
  });
}

function addCapture(userId, payload) {
  return mutateStore((store) => {
    const date = normalizeDate(payload.date);
    const visibility = validVisibilities.has(payload.visibility) ? payload.visibility : "shared";
    const mode = validCaptureModes.has(payload.mode) ? payload.mode : "save";
    const assetPayloads = [
      ...(Array.isArray(payload.assets) ? payload.assets : []),
      payload.dataUrl ? { name: payload.name, dataUrl: payload.dataUrl } : null,
    ].filter(Boolean);
    const text = sanitizeText(payload.text, 1200) || (assetPayloads.length ? "图片随手记" : "");
    if (!text) {
      throw new Error("capture text is required");
    }
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
    normalizeCatWordMeta(store, capture, userId);
    store.captures.unshift(capture);
    store.captures = store.captures.slice(0, 300);
    recordOperation(store, userId, "create", "capture", capture.id, { date, title: capture.text, sourceType: "capture" });
    return capture;
  });
}

function markCatWordsRead(userId, payload = {}) {
  const store = readStore();
  const profileIds = getProfileIds(store);
  if (!profileIds.includes(userId)) {
    throw new Error("profile not found");
  }

  const date = normalizeDate(payload.date, "");
  const captureIds = new Set(normalizeIdList(payload.captureIds, 80));
  const readAt = nowIso();
  const markedIds = [];

  store.captures.forEach((capture) => {
    if (capture.rawKind !== "cat-word") return;
    if (capture.createdBy === userId) return;
    if (capture.visibility !== "shared" && capture.createdBy !== userId) return;
    if (captureIds.size && !captureIds.has(capture.id)) return;
    if (!captureIds.size && date && capture.date !== date) return;

    normalizeCatWordMeta(store, capture, capture.createdBy);
    if (capture.readBy?.[userId]) return;
    capture.readBy[userId] = readAt;
    markedIds.push(capture.id);
  });

  if (!markedIds.length) {
    return {
      result: { marked: 0, captureIds: [] },
      store,
    };
  }

  recordOperation(store, userId, "read", "cat-word", markedIds[0], {
    date: date || businessDate(),
    sourceType: "cat-word",
    title: `已读 ${markedIds.length} 条猫猫的话`,
  });
  const updated = writeStore(store);
  return {
    result: { marked: markedIds.length, captureIds: markedIds },
    store: updated,
  };
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
      updatedBy: userId,
      updatedAt: nowIso(),
    };
    store.personalPages = store.personalPages || {};
    store.personalPages[userId] = next;
    recordOperation(store, userId, "update", "personal-page", userId, { targetUserId: userId, title: next.title, sourceType: "personal-page" });
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
    const timestamp = nowIso();

    const avatar = sanitizeText(payload.avatar ?? profile.avatar ?? "pink-cat", 40);
    profile.avatar = avatar || "pink-cat";
    if (payload.avatarAsset?.dataUrl) {
      const asset = createImageAsset(userId, payload.avatarAsset, {
        date: businessDate(),
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
      personalPage.updatedBy = userId;
      personalPage.updatedAt = timestamp;
    }
    profile.updatedBy = userId;
    profile.updatedAt = timestamp;
    recordOperation(store, userId, "update", "profile", userId, { targetUserId: userId, title: nextName, sourceType: "profile" });

    return publicProfile(profile);
  });
}

function updateDayContext(userId, payload = {}) {
  return mutateStore((store) => {
    const date = normalizeDate(payload.date);
    const current = buildDayContext(store, date);
    const timestamp = nowIso();
    const nextInput = {
      ...current,
      note: payload.note !== undefined ? payload.note : current.note,
      updatedBy: userId,
      updatedAt: timestamp,
    };

    if (payload.weather && typeof payload.weather === "object") {
      nextInput.weather = {
        ...current.weather,
        label: payload.weather.label ?? payload.weather.weatherLabel ?? current.weather.label,
        icon: payload.weather.icon ?? current.weather.icon,
        tone: payload.weather.tone ?? current.weather.tone,
        isSunny: payload.weather.isSunny ?? payload.weather.sunny ?? current.weather.isSunny,
        source: "manual",
        configured: true,
        updatedBy: userId,
        updatedAt: timestamp,
      };
    }

    if (payload.astronomy && typeof payload.astronomy === "object") {
      const moonPayload = payload.astronomy.moon && typeof payload.astronomy.moon === "object"
        ? payload.astronomy.moon
        : {};
      nextInput.astronomy = {
        ...current.astronomy,
        moonLabel: payload.astronomy.moonLabel ?? payload.astronomy.moonPhase ?? moonPayload.label ?? current.astronomy.moonLabel,
        moonIllumination: payload.astronomy.moonIllumination ?? moonPayload.illumination ?? current.astronomy.moonIllumination,
        moon: {
          ...current.astronomy.moon,
          ...moonPayload,
          label: moonPayload.label ?? payload.astronomy.moonLabel ?? payload.astronomy.moonPhase ?? current.astronomy.moon?.label,
          illumination: moonPayload.illumination ?? payload.astronomy.moonIllumination ?? current.astronomy.moon?.illumination,
        },
        source: "manual",
        configured: true,
        updatedBy: userId,
        updatedAt: timestamp,
      };
    }

    if (payload.calendar && typeof payload.calendar === "object") {
      nextInput.calendar = {
        ...current.calendar,
        solarTerm: payload.calendar.solarTerm ?? current.calendar.solarTerm,
        lunar: payload.calendar.lunar ?? current.calendar.lunar,
        festivals: payload.calendar.festivals ?? current.calendar.festivals,
        source: "manual",
        configured: true,
      };
    }

    const next = normalizeDayContext(nextInput, current);
    store.dayContexts = store.dayContexts || {};
    store.dayContexts[date] = next;
    const summary = store.dailySummaries?.[date];
    if (summary) {
      summary.dayContext = next;
      summary.weather = next.weather;
    }
    recordOperation(store, userId || "system", "update", "day-context", date, { date, sourceType: "day-context", title: next.weather.label });
    return next;
  });
}

function refreshDailySummary(userId, payload = {}) {
  return mutateStore((store) => {
    const date = normalizeDate(payload.date);
    const summary = buildDailySummary(store, date, userId || "system", {
      includePrivate: payload.includePrivate === true,
      useAgent: payload.useAgent === true,
      requireAgent: payload.requireAgent === true,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
    });
    const dayContext = buildDayContext(store, date);
    store.dayContexts = store.dayContexts || {};
    store.dayContexts[date] = dayContext;
    summary.dayContext = dayContext;
    summary.weather = dayContext.weather;
    store.dailySummaries = store.dailySummaries || {};
    store.dailySummaries[date] = summary;
    recordOperation(store, userId || "system", "refresh", "daily-summary", date, { date, sourceType: "daily-summary", title: summary.title });
    return publicDailySummary(summary);
  });
}

module.exports = {
  addCapture,
  addDiaryAsset,
  acceptCaptureRoute,
  analyzeCapture,
  analyzeCaptureWithAgent,
  archiveScheduleItem,
  archiveTodoItem,
  businessDate,
  createLifeCardsFromConfirmation,
  deleteCheckinItem,
  deleteDeadlineItem,
  deleteScheduleItem,
  deleteTodoItem,
  getState,
  markCatWordsRead,
  readAuthConfig,
  readPublicBootstrap,
  readRevision,
  rememberLifeCard,
  refreshDailySummary,
  reorderLifeCards,
  segmentDefinitions,
  toggleCheckinItem,
  toggleDeadlineItem,
  toggleLifeCardStep,
  toggleLifeCardTimer,
  toggleScheduleItem,
  toggleTodoItem,
  updateDayContext,
  updatePersonalPage,
  updateProfile,
  updateDiaryDay,
  upsertCheckinItem,
  upsertDeadlineItem,
  upsertScheduleItem,
  upsertTodoItem,
  verifyLogin,
};
