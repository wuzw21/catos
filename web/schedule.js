const scheduleData = window.personalTrackerData;
const scheduleSummary = document.querySelector("#schedule-summary");
const scheduleBody = document.querySelector("#schedule-body");
const scheduleWeekTabs = document.querySelector("#schedule-week-tabs");
const scheduleRange = document.querySelector("#schedule-range");
const schedulePrev = document.querySelector("#schedule-prev");
const scheduleNext = document.querySelector("#schedule-next");
const scheduleResetWeek = document.querySelector("#schedule-reset-week");
const scheduleEditStatus = document.querySelector("#schedule-edit-status");
const scheduleQuickInput = document.querySelector("#schedule-quick-input");
const scheduleQuickAdd = document.querySelector("#schedule-quick-add");
const scheduleSearch = document.querySelector("#schedule-search");
const scheduleSearchResults = document.querySelector("#schedule-search-results");

const weeklySchedule = scheduleData.schedules.find((item) => item.id === "weekly-schedule");
const scheduleDraftStorageKey = "personal-evolution-os-schedule-drafts";
const scheduleRows = [
  { key: "wake", label: "起床", type: "time" },
  { key: "allDay", label: "全天", type: "list" },
  { key: "morning", label: "上午", type: "list" },
  { key: "noon", label: "中午", type: "list" },
  { key: "afternoon", label: "下午", type: "list" },
  { key: "evening", label: "晚上", type: "list" },
  { key: "sleep", label: "睡觉", type: "time" },
  { key: "done", label: "完成", type: "list" },
];
const segmentAliases = [
  { key: "allDay", aliases: ["全天", "整天", "这天"] },
  { key: "morning", aliases: ["上午", "早上", "早晨", "今早"] },
  { key: "noon", aliases: ["中午", "午间"] },
  { key: "afternoon", aliases: ["下午"] },
  { key: "evening", aliases: ["晚上", "今晚", "夜里"] },
];
const weekdayIndexMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

function getApiBase() {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:2333";
  }

  return `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:2333`;
}

const scheduleApiBase = getApiBase();
const scheduleSaveTimers = new Map();
let scheduleActiveSaveWeekId = "";

function parseDateValue(dateText) {
  const parsed = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatMonthDay(date) {
  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatDateId(date) {
  return `${date.getFullYear()}-${formatMonthDay(date)}`;
}

function getInitialWeekId() {
  if (!weeklySchedule?.weeks?.length) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const matchedWeek = weeklySchedule.weeks.find((week) => {
    const parts = week.dateRange.split("至").map((item) => item.trim());
    if (parts.length !== 2) return false;
    const start = parseDateValue(parts[0]);
    const end = parseDateValue(parts[1]);
    if (!start || !end) return false;
    return today >= start && today <= end;
  });

  return matchedWeek?.id || weeklySchedule.weeks[0].id;
}

let activeWeekId = getInitialWeekId();

function getDrafts() {
  try {
    return JSON.parse(localStorage.getItem(scheduleDraftStorageKey) || "{}");
  } catch {
    return {};
  }
}

function saveDrafts(drafts) {
  localStorage.setItem(scheduleDraftStorageKey, JSON.stringify(drafts));
}

function setEditStatus(text) {
  scheduleEditStatus.textContent = text;
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
      title: `${weekdayLabels[current.getDay()]} ${formatMonthDay(current)}`,
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

function parseBullets(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function normalizeSegmentKey(text) {
  return segmentAliases.find((item) => item.aliases.some((alias) => String(text || "").includes(alias)))?.key || "allDay";
}

function parseScheduleBullets(lines) {
  const schedule = createEmptySchedule();
  parseBullets(lines).forEach((item) => {
    const parts = item.split(/[：:｜|]/);
    if (parts.length > 1) {
      const segmentKey = normalizeSegmentKey(parts[0]);
      const content = parts.slice(1).join(" ").trim();
      if (content) {
        schedule[segmentKey].push(content);
      }
      return;
    }

    schedule.allDay.push(item);
  });
  return schedule;
}

function parseWeekContent(week) {
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

function getWeekDraft(weekId) {
  return getDrafts()[weekId] || {};
}

function updateWeekDraft(weekId, cellKey, value) {
  const drafts = getDrafts();
  drafts[weekId] = drafts[weekId] || {};
  drafts[weekId][cellKey] = value;
  saveDrafts(drafts);
}

function clearWeekDraft(weekId) {
  const drafts = getDrafts();
  delete drafts[weekId];
  saveDrafts(drafts);
}

function updateWeekBodyMarkdown(weekId, bodyMarkdown) {
  const week = weeklySchedule.weeks.find((item) => item.id === weekId);
  if (!week) return;
  week.bodyMarkdown = bodyMarkdown;
}

function getParsedDaysWithDrafts(week) {
  const parsedDays = parseWeekContent(week);
  const weekDraft = getWeekDraft(week.id);

  return parsedDays.map((day) => ({
    ...day,
    wakeTime: weekDraft[`${day.id}-wake`] ?? day.wakeTime,
    sleepTime: weekDraft[`${day.id}-sleep`] ?? day.sleepTime,
    schedule: {
      allDay: (weekDraft[`${day.id}-plan-allDay`] ?? day.schedule.allDay.join("\n"))
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      morning: (weekDraft[`${day.id}-plan-morning`] ?? day.schedule.morning.join("\n"))
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      noon: (weekDraft[`${day.id}-plan-noon`] ?? day.schedule.noon.join("\n"))
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      afternoon: (weekDraft[`${day.id}-plan-afternoon`] ?? day.schedule.afternoon.join("\n"))
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      evening: (weekDraft[`${day.id}-plan-evening`] ?? day.schedule.evening.join("\n"))
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    },
    completedItems: (weekDraft[`${day.id}-done`] ?? day.completedItems.join("\n"))
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
  }));
}

async function saveWeekToMarkdown(weekId) {
  const week = weeklySchedule.weeks.find((item) => item.id === weekId);
  if (!week) return;

  const days = getParsedDaysWithDrafts(week).map((day) => ({
    id: day.id,
    title: day.title,
    wakeTime: day.wakeTime,
    sleepTime: day.sleepTime,
    schedule: day.schedule,
    completedItems: day.completedItems,
  }));

  scheduleActiveSaveWeekId = weekId;
  setEditStatus(`正在同步 ${week.weekLabel} 到 Markdown ...`);

  try {
    const response = await fetch(`${scheduleApiBase}/api/schedules/weekly/${encodeURIComponent(weekId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        days,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "schedule sync failed");
    }

    updateWeekBodyMarkdown(weekId, result.week.bodyMarkdown);
    clearWeekDraft(weekId);
    setEditStatus(`已同步 ${result.week.weekLabel} 到 Markdown。`);
    renderWeek();
  } catch (error) {
    setEditStatus(`同步失败：${error.message}。本地草稿已保留。`);
  } finally {
    scheduleActiveSaveWeekId = "";
  }
}

function queueWeekSave(weekId) {
  if (scheduleSaveTimers.has(weekId)) {
    clearTimeout(scheduleSaveTimers.get(weekId));
  }

  const timer = window.setTimeout(() => {
    scheduleSaveTimers.delete(weekId);
    saveWeekToMarkdown(weekId);
  }, 700);

  scheduleSaveTimers.set(weekId, timer);
}

function getActiveWeekIndex() {
  return weeklySchedule.weeks.findIndex((item) => item.id === activeWeekId);
}

function updateWeekNav() {
  const activeIndex = getActiveWeekIndex();
  schedulePrev.disabled = activeIndex <= 0;
  scheduleNext.disabled = activeIndex === -1 || activeIndex >= weeklySchedule.weeks.length - 1;
}

function renderWeekTabs() {
  scheduleWeekTabs.innerHTML = "";

  weeklySchedule.weeks.forEach((week) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${week.id === activeWeekId ? " is-active" : ""}`;
    button.textContent = week.weekLabel;
    button.addEventListener("click", () => {
      activeWeekId = week.id;
      renderWeekTabs();
      renderWeek();
    });
    scheduleWeekTabs.appendChild(button);
  });
}

function buildTableCell(day, row, weekId, todayId, query) {
  const cell = document.createElement("td");
  const isToday = day.id === todayId;

  if (row.type === "time") {
    const key = row.key === "wake" ? `${day.id}-wake` : `${day.id}-sleep`;
    const input = document.createElement("input");
    input.className = "schedule-day-time-input";
    input.type = "time";
    input.value = row.key === "wake" ? day.wakeTime : day.sleepTime;
    input.addEventListener("input", () => {
      updateWeekDraft(weekId, key, input.value);
      setEditStatus(`已记录 ${day.title} 的改动，准备同步 Markdown ...`);
      queueWeekSave(weekId);
    });
    cell.appendChild(input);
  } else {
    const key = row.key === "done" ? `${day.id}-done` : `${day.id}-plan-${row.key}`;
    const textarea = document.createElement("textarea");
    textarea.className = "schedule-day-textarea";
    textarea.rows = row.key === "done" ? 5 : 4;
    textarea.placeholder = "";
    textarea.value =
      row.key === "done" ? day.completedItems.join("\n") : (day.schedule[row.key] || []).join("\n");
    textarea.addEventListener("input", () => {
      updateWeekDraft(weekId, key, textarea.value);
      setEditStatus(`已记录 ${day.title} 的改动，准备同步 Markdown ...`);
      queueWeekSave(weekId);
      renderSearchResults();
    });
    cell.appendChild(textarea);
  }

  if (isToday) {
    cell.classList.add("is-today");
  }

  if (query) {
    const content =
      row.type === "time"
        ? (row.key === "wake" ? day.wakeTime : day.sleepTime)
        : row.key === "done"
          ? day.completedItems.join(" ")
          : (day.schedule[row.key] || []).join(" ");
    if (content.toLowerCase().includes(query)) {
      cell.classList.add("is-match");
    }
  }

  return cell;
}

function renderWeek() {
  const week = weeklySchedule.weeks.find((item) => item.id === activeWeekId) || weeklySchedule.weeks[0];
  const parsedDays = getParsedDaysWithDrafts(week);
  const query = scheduleSearch.value.trim().toLowerCase();
  scheduleRange.textContent = week.dateRange;
  scheduleBody.innerHTML = "";
  const todayId = formatDateId(new Date());
  const table = document.createElement("table");
  table.className = "schedule-table schedule-matrix";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.innerHTML = '<th>分段</th>';

  parsedDays.forEach((day) => {
    const headerCell = document.createElement("th");
    headerCell.innerHTML = `
      <div class="schedule-day-label">
        <strong>${day.title}</strong>
        <span>${day.id}</span>
      </div>
    `;
    if (day.id === todayId) {
      headerCell.classList.add("is-today");
    }
    headerRow.appendChild(headerCell);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  scheduleRows.forEach((row) => {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("th");
    rowHeader.scope = "row";
    rowHeader.className = "schedule-row-label";
    rowHeader.textContent = row.label;
    tr.appendChild(rowHeader);

    parsedDays.forEach((day) => {
      tr.appendChild(buildTableCell(day, row, week.id, todayId, query));
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  scheduleBody.appendChild(table);

  if (scheduleActiveSaveWeekId !== week.id) {
    setEditStatus("日期在横轴，分段在纵轴。直接编辑后会自动同步回 Markdown。");
  }

  updateWeekNav();
  renderSearchResults();
}

function switchWeek(offset) {
  const activeIndex = getActiveWeekIndex();
  const nextWeek = weeklySchedule.weeks[activeIndex + offset];
  if (!nextWeek) return;
  activeWeekId = nextWeek.id;
  renderWeekTabs();
  renderWeek();
}

function resolveTargetDate(rawText, referenceWeek) {
  const text = String(rawText || "").trim();
  if (!text) {
    return "";
  }

  const explicitDateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (explicitDateMatch) {
    return explicitDateMatch[1];
  }

  const explicitMonthDayMatch = text.match(/(\d{1,2})[./-](\d{1,2})/);
  if (explicitMonthDayMatch) {
    const [startText] = String(referenceWeek?.dateRange || "")
      .split("至")
      .map((item) => item.trim());
    const baseYear = parseDateValue(startText)?.getFullYear() || new Date().getFullYear();
    return `${baseYear}-${padNumber(explicitMonthDayMatch[1])}-${padNumber(explicitMonthDayMatch[2])}`;
  }

  if (/今天|今晚|今早|今日/.test(text)) {
    return formatDateId(new Date());
  }

  if (/明天/.test(text)) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    return formatDateId(nextDate);
  }

  const weekDayMatch = text.match(/周([一二三四五六日天])/);
  if (weekDayMatch) {
    const targetIndex = weekdayIndexMap[weekDayMatch[1]];
    const days = buildDefaultDays(referenceWeek?.dateRange || "");
    return days[targetIndex]?.id || "";
  }

  return formatDateId(new Date());
}

function detectQuickSegment(text) {
  return segmentAliases.find((item) => item.aliases.some((alias) => String(text || "").includes(alias)))?.key || "allDay";
}

function extractQuickTask(text) {
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

function insertQuickSchedule() {
  const raw = scheduleQuickInput.value.trim();
  if (!raw) {
    setEditStatus("先写一句自然语言日程，例如：周四晚上 去东操音乐跑。");
    return;
  }

  const weekCandidates = weeklySchedule.weeks;
  const initialWeek = weekCandidates.find((item) => item.id === activeWeekId) || weekCandidates[0];
  const dateId = resolveTargetDate(raw, initialWeek);
  const targetWeek =
    weekCandidates.find((week) => {
      const [startText, endText] = String(week.dateRange || "")
        .split("至")
        .map((item) => item.trim());
      const start = parseDateValue(startText);
      const end = parseDateValue(endText);
      const date = parseDateValue(dateId);
      return start && end && date && date >= start && date <= end;
    }) || initialWeek;

  const segment = detectQuickSegment(raw);
  const task = extractQuickTask(raw) || raw;
  const day = getParsedDaysWithDrafts(targetWeek).find((item) => item.id === dateId);

  if (!day) {
    setEditStatus(`没有找到 ${dateId} 对应的日程格。`);
    return;
  }

  const draftKey = `${day.id}-plan-${segment}`;
  const existing = (getWeekDraft(targetWeek.id)[draftKey] ?? (day.schedule[segment] || []).join("\n"))
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!existing.includes(task)) {
    existing.push(task);
  }

  updateWeekDraft(targetWeek.id, draftKey, existing.join("\n"));
  scheduleQuickInput.value = "";
  activeWeekId = targetWeek.id;
  renderWeekTabs();
  renderWeek();
  setEditStatus(`已把「${task}」放进 ${day.title} / ${scheduleRows.find((row) => row.key === segment)?.label || "全天"}，正在同步 ...`);
  queueWeekSave(targetWeek.id);
}

function buildSearchEntries() {
  return weeklySchedule.weeks.flatMap((week) =>
    getParsedDaysWithDrafts(week).flatMap((day) => [
      ...Object.entries(day.schedule).flatMap(([segmentKey, items]) =>
        (items || []).map((item) => ({
          weekId: week.id,
          dateId: day.id,
          title: day.title,
          segmentKey,
          segmentLabel: scheduleRows.find((row) => row.key === segmentKey)?.label || "全天",
          text: item,
        }))
      ),
      ...day.completedItems.map((item) => ({
        weekId: week.id,
        dateId: day.id,
        title: day.title,
        segmentKey: "done",
        segmentLabel: "完成",
        text: item,
      })),
    ])
  );
}

function renderSearchResults() {
  const query = scheduleSearch.value.trim().toLowerCase();
  scheduleSearchResults.innerHTML = "";

  if (!query) {
    scheduleSearchResults.classList.remove("is-visible");
    return;
  }

  const results = buildSearchEntries().filter((item) => item.text.toLowerCase().includes(query));
  scheduleSearchResults.classList.add("is-visible");

  if (!results.length) {
    scheduleSearchResults.innerHTML = '<p class="schedule-search-empty">这周和相邻周里没有命中结果。</p>';
    return;
  }

  results.slice(0, 12).forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "schedule-search-hit";
    button.innerHTML = `
      <strong>${item.title}</strong>
      <span>${item.segmentLabel}</span>
      <em>${item.text}</em>
    `;
    button.addEventListener("click", () => {
      activeWeekId = item.weekId;
      renderWeekTabs();
      renderWeek();
    });
    scheduleSearchResults.appendChild(button);
  });
}

if (weeklySchedule) {
  scheduleSummary.textContent =
    weeklySchedule.summary || "用日期和时间段记录这一周。适合插入一句话式待办，也适合回看每天起床、睡觉和完成情况。";
  schedulePrev.addEventListener("click", () => switchWeek(-1));
  scheduleNext.addEventListener("click", () => switchWeek(1));
  scheduleResetWeek.addEventListener("click", () => {
    if (scheduleSaveTimers.has(activeWeekId)) {
      clearTimeout(scheduleSaveTimers.get(activeWeekId));
      scheduleSaveTimers.delete(activeWeekId);
    }
    clearWeekDraft(activeWeekId);
    renderWeek();
    setEditStatus("已清空本周未同步的本地编辑内容。");
  });
  scheduleQuickAdd.addEventListener("click", insertQuickSchedule);
  scheduleQuickInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      insertQuickSchedule();
    }
  });
  scheduleSearch.addEventListener("input", () => {
    renderWeek();
  });
  renderWeekTabs();
  renderWeek();
}
