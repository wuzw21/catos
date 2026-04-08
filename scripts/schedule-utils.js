const fs = require("fs");
const { contentRoot, contentPath } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const weeklySchedulePath = contentPath("schedules", "weekly-schedule.md");

const segmentDefinitions = [
  { key: "allDay", label: "全天", aliases: ["全天", "整天", "这天"] },
  { key: "morning", label: "上午", aliases: ["上午", "早上", "早晨", "今早"] },
  { key: "noon", label: "中午", aliases: ["中午", "午间"] },
  { key: "afternoon", label: "下午", aliases: ["下午"] },
  { key: "evening", label: "晚上", aliases: ["晚上", "今晚", "夜里"] },
];

const weekdayIndexMap = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

function readWeeklySchedule() {
  if (!fs.existsSync(weeklySchedulePath)) {
    throw new Error("weekly schedule file not found");
  }

  return fs.readFileSync(weeklySchedulePath, "utf8");
}

function writeWeeklySchedule(markdown) {
  fs.writeFileSync(weeklySchedulePath, markdown, "utf8");
}

function normalizeCell(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " / ")
    .replace(/\|/g, "/")
    .trim();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateId(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateValue(dateText) {
  const parsed = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseWeeks(markdown) {
  return markdown
    .split(/^##\s+/m)
    .slice(1)
    .map((block) => {
      const lines = block.split("\n");
      const rawTitle = lines[0].trim();
      const [weekLabel, dateRange] = rawTitle.split("|").map((part) => part.trim());
      const bodyMarkdown = lines.slice(1).join("\n").trim();

      return {
        id: weekLabel.toLowerCase(),
        rawTitle,
        weekLabel,
        dateRange: dateRange || "",
        bodyMarkdown,
        blockMarkdown: `## ${rawTitle}\n\n${bodyMarkdown}`.trim(),
      };
    });
}

function buildDefaultDays(dateRange) {
  const [startText] = String(dateRange || "")
    .split("至")
    .map((item) => item.trim());
  const startDate = parseDateValue(startText);

  if (!startDate) {
    return [];
  }

  const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    return {
      id: formatDateId(current),
      title: `${weekdayLabels[current.getDay()]} ${pad(current.getMonth() + 1)}-${pad(current.getDate())}`,
      wakeTime: "",
      sleepTime: "",
      schedule: createEmptySchedule(),
      completedItems: [],
    };
  });
}

function parseDayIdFromTitle(title, dateRange) {
  const match = String(title || "").match(/(\d{2})-(\d{2})$/);
  if (!match) {
    return "";
  }

  const [startText] = String(dateRange || "")
    .split("至")
    .map((item) => item.trim());
  const startDate = parseDateValue(startText);
  const year = startDate ? startDate.getFullYear() : new Date().getFullYear();
  return `${year}-${match[1]}-${match[2]}`;
}

function createEmptySchedule() {
  return {
    allDay: [],
    morning: [],
    noon: [],
    afternoon: [],
    evening: [],
  };
}

function normalizeSegmentLabel(label) {
  const normalized = String(label || "").trim();
  const matched = segmentDefinitions.find((definition) =>
    definition.aliases.some((alias) => normalized.includes(alias))
  );
  return matched?.key || "allDay";
}

function parseBullets(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function extractSectionLines(lines, sectionTitle, nextTitles) {
  const startIndex = lines.findIndex((line) => line.trim() === sectionTitle);
  if (startIndex === -1) {
    return [];
  }

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const current = lines[index].trim();
    if (nextTitles.includes(current)) {
      break;
    }
    sectionLines.push(current);
  }
  return sectionLines;
}

function parseScheduleBullets(lines) {
  const schedule = createEmptySchedule();
  parseBullets(lines).forEach((item) => {
    const parts = item.split(/[：:｜|]/);
    if (parts.length > 1) {
      const segmentKey = normalizeSegmentLabel(parts[0]);
      const content = parts.slice(1).join(" ").trim();
      if (content) {
        schedule[segmentKey].push(content);
      }
      return;
    }

    schedule.allDay.push(item.trim());
  });
  return schedule;
}

function parseWeekDays(week) {
  const blocks = String(week?.bodyMarkdown || "")
    .split(/^###\s+/m)
    .slice(1)
    .map((block) => {
      const lines = block.split("\n");
      const title = lines[0].trim();
      const bodyLines = lines.slice(1);
      const wakeLine = bodyLines.find((line) => line.trim().startsWith("起床：")) || "";
      const sleepLine = bodyLines.find((line) => line.trim().startsWith("睡觉：")) || "";
      const scheduleLines = extractSectionLines(bodyLines, "日程：", ["睡觉：", "完成事项："]);
      const completedLines = extractSectionLines(bodyLines, "完成事项：", []);

      return {
        id: parseDayIdFromTitle(title, week?.dateRange) || title,
        title,
        wakeTime: wakeLine.replace(/^起床：/, "").trim(),
        sleepTime: sleepLine.replace(/^睡觉：/, "").trim(),
        schedule: parseScheduleBullets(scheduleLines),
        completedItems: parseBullets(completedLines),
      };
    });

  const defaultDays = buildDefaultDays(week?.dateRange);
  const dayMap = new Map(blocks.map((day) => [day.title, day]));

  return defaultDays.length
    ? defaultDays.map((day) => ({
        ...day,
        ...(dayMap.get(day.title) || {}),
        schedule: {
          ...createEmptySchedule(),
          ...(dayMap.get(day.title)?.schedule || {}),
        },
      }))
    : blocks;
}

function buildDayMarkdown(day) {
  const scheduleLines = segmentDefinitions.flatMap((definition) =>
    (day.schedule?.[definition.key] || [])
      .map((item) => normalizeCell(item))
      .filter(Boolean)
      .map((item) => `- ${definition.label}｜${item}`)
  );
  const completedLines = (day.completedItems || [])
    .map((item) => normalizeCell(item))
    .filter(Boolean)
    .map((item) => `- ${item}`);

  return [
    `### ${normalizeCell(day.title)}`,
    "",
    `起床：${normalizeCell(day.wakeTime || "")}`,
    "日程：",
    ...scheduleLines,
    `睡觉：${normalizeCell(day.sleepTime || "")}`,
    "完成事项：",
    ...completedLines,
  ].join("\n");
}

function buildWeekMarkdown(week, days) {
  const dayBlocks = (days || []).map((day) => buildDayMarkdown(day));
  return [`## ${week.rawTitle}`, "", ...dayBlocks].join("\n\n");
}

function resolveTargetDate(text, referenceDate = new Date()) {
  const input = String(text || "").trim();
  const explicitDateMatch = input.match(/(\d{4}-\d{2}-\d{2})/);
  if (explicitDateMatch) {
    return explicitDateMatch[1];
  }

  const explicitMonthDayMatch = input.match(/(\d{1,2})[./-](\d{1,2})/);
  if (explicitMonthDayMatch) {
    return `${referenceDate.getFullYear()}-${pad(explicitMonthDayMatch[1])}-${pad(explicitMonthDayMatch[2])}`;
  }

  if (/明天/.test(input)) {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() + 1);
    return formatDateId(date);
  }

  if (/今天|今晚|今早|今日/.test(input)) {
    return formatDateId(referenceDate);
  }

  const weekDayMatch = input.match(/周([一二三四五六日天])/);
  if (weekDayMatch) {
    const targetWeekday = weekdayIndexMap[weekDayMatch[1]];
    const start = new Date(referenceDate);
    start.setDate(referenceDate.getDate() - referenceDate.getDay());
    return formatDateId(new Date(start.getFullYear(), start.getMonth(), start.getDate() + targetWeekday));
  }

  return formatDateId(referenceDate);
}

function detectSegment(text) {
  const input = String(text || "");
  return segmentDefinitions.find((definition) =>
    definition.aliases.some((alias) => input.includes(alias))
  )?.key || "allDay";
}

function extractTaskText(text) {
  return String(text || "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{1,2}[./-]\d{1,2}/g, "")
    .replace(/今天|今晚|今早|今日|明天/g, "")
    .replace(/周[一二三四五六日天]/g, "")
    .replace(/全天|整天|这天|上午|早上|早晨|今早|中午|午间|下午|晚上|今晚|夜里/g, "")
    .replace(/[，,。；;：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuickScheduleInput(text, referenceDate = new Date()) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("schedule text is required");
  }

  const dateId = resolveTargetDate(raw, referenceDate);
  const segment = detectSegment(raw);
  const task = extractTaskText(raw) || raw;

  return {
    dateId,
    segment,
    task,
  };
}

function insertScheduleItemFromText(text, options = {}) {
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const parsed = parseQuickScheduleInput(text, referenceDate);
  const markdown = readWeeklySchedule();
  const titleMatch = markdown.match(/^#\s+.+$/m);
  const documentTitle = titleMatch ? titleMatch[0].trim() : "# 日程记录";
  const weeks = parseWeeks(markdown);
  const targetWeek = weeks.find((week) => {
    const [startText, endText] = String(week.dateRange || "")
      .split("至")
      .map((item) => item.trim());
    const start = parseDateValue(startText);
    const end = parseDateValue(endText);
    const target = parseDateValue(parsed.dateId);
    return start && end && target && target >= start && target <= end;
  });

  if (!targetWeek) {
    throw new Error(`no matching week for ${parsed.dateId}`);
  }

  const days = parseWeekDays(targetWeek);
  const day = days.find((item) => item.id === parsed.dateId);
  if (!day) {
    throw new Error(`day not found for ${parsed.dateId}`);
  }

  const currentItems = day.schedule?.[parsed.segment] || [];
  if (!currentItems.includes(parsed.task)) {
    currentItems.push(parsed.task);
  }
  day.schedule[parsed.segment] = currentItems;

  const updatedWeeks = weeks.map((week) =>
    week.id === targetWeek.id ? buildWeekMarkdown(week, days) : week.blockMarkdown
  );
  const output = [documentTitle, "", ...updatedWeeks].join("\n\n").trimEnd() + "\n";
  writeWeeklySchedule(output);

  return {
    path: path.relative(rootDir, weeklySchedulePath),
    weekId: targetWeek.id,
    weekLabel: targetWeek.weekLabel,
    dateId: parsed.dateId,
    segment: parsed.segment,
    task: parsed.task,
  };
}

module.exports = {
  buildWeekMarkdown,
  insertScheduleItemFromText,
  normalizeCell,
  parseQuickScheduleInput,
  parseWeekDays,
  parseWeeks,
  readWeeklySchedule,
  segmentDefinitions,
  weeklySchedulePath,
  writeWeeklySchedule,
};
