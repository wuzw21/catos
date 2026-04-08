const path = require("path");
const { contentRoot } = require("./lib/runtime-paths.js");

const {
  buildWeekMarkdown,
  normalizeCell,
  parseWeekDays,
  parseWeeks,
  readWeeklySchedule,
  weeklySchedulePath,
  writeWeeklySchedule,
} = require("./schedule-utils.js");

const rootDir = contentRoot;

function normalizeDay(day) {
  return {
    id: normalizeCell(day?.id || ""),
    title: normalizeCell(day?.title || ""),
    wakeTime: normalizeCell(day?.wakeTime || ""),
    sleepTime: normalizeCell(day?.sleepTime || ""),
    schedule: {
      allDay: Array.isArray(day?.schedule?.allDay) ? day.schedule.allDay : [],
      morning: Array.isArray(day?.schedule?.morning) ? day.schedule.morning : [],
      noon: Array.isArray(day?.schedule?.noon) ? day.schedule.noon : [],
      afternoon: Array.isArray(day?.schedule?.afternoon) ? day.schedule.afternoon : [],
      evening: Array.isArray(day?.schedule?.evening) ? day.schedule.evening : [],
    },
    completedItems: Array.isArray(day?.completedItems) ? day.completedItems : [],
  };
}

function updateWeeklySchedule(weekId, payload) {
  if (!weekId) {
    throw new Error("week id is required");
  }

  const days = payload?.days;
  if (!Array.isArray(days) || !days.length) {
    throw new Error("schedule days are invalid");
  }

  const markdown = readWeeklySchedule();
  const titleMatch = markdown.match(/^#\s+.+$/m);
  const documentTitle = titleMatch ? titleMatch[0].trim() : "# 日程记录";
  const weeks = parseWeeks(markdown);
  const targetWeek = weeks.find((week) => week.id === weekId.toLowerCase());

  if (!targetWeek) {
    throw new Error(`week not found: ${weekId}`);
  }

  const normalizedDays = days.map(normalizeDay);
  const updatedWeeks = weeks.map((week) =>
    week.id === targetWeek.id ? buildWeekMarkdown(week, normalizedDays) : week.blockMarkdown
  );

  const output = [documentTitle, "", ...updatedWeeks].join("\n\n").trimEnd() + "\n";
  writeWeeklySchedule(output);

  return {
    id: targetWeek.id,
    weekLabel: targetWeek.weekLabel,
    dateRange: targetWeek.dateRange,
    path: path.relative(rootDir, weeklySchedulePath),
    bodyMarkdown: buildWeekMarkdown(targetWeek, normalizedDays)
      .replace(/^##\s+.+\n+/, "")
      .trim(),
    days: parseWeekDays({
      ...targetWeek,
      bodyMarkdown: buildWeekMarkdown(targetWeek, normalizedDays)
        .replace(/^##\s+.+\n+/, "")
        .trim(),
    }),
  };
}

if (require.main === module) {
  const [, , weekId, jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const updatedWeek = updateWeeklySchedule(weekId, payload);
    console.log(`updated ${updatedWeek.id} -> ${updatedWeek.path}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  updateWeeklySchedule,
};
