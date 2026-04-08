const fs = require("fs");
const path = require("path");
const { archiveCapture } = require("./archive-capture.js");
const { generateDailyLogWithCodex } = require("./daily-log-generator.js");
const { contentRoot, contentPath } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const checkinPath = contentPath("tasks", "daily-checkin.md");
const coreContributionPath = contentPath("tasks", "today-core-contribution.md");
const todayPlanPath = contentPath("tasks", "today-plan.md");
const dailyLogDir = contentPath("logs", "daily");

function readFileSafe(filePath, fallback = "") {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : fallback;
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " / ")
    .replace(/\|/g, "/")
    .trim();
}

function getSection(markdown, sectionTitle) {
  const pattern = new RegExp(`^##\\s+${sectionTitle}\\s*$([\\s\\S]*?)(?=\\n##\\s+|$)`, "m");
  const match = String(markdown || "").match(pattern);
  return match ? match[1].trim() : "";
}

function ensureDailyLog(dateKey) {
  const filePath = path.join(dailyLogDir, `${dateKey}.md`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const skeleton = [
    `# ${dateKey} 日志`,
    "",
    "## 今日变化",
    "",
    "## 数据记录",
    "",
    "| 维度 | 指标 | 数值 / 状态 |",
    "| --- | --- | --- |",
    "",
    "## 复盘",
    "",
  ].join("\n");
  writeFile(filePath, `${skeleton}\n`);
  return filePath;
}

function ensureSection(markdown, sectionTitle) {
  if (new RegExp(`^##\\s+${sectionTitle}\\s*$`, "m").test(markdown)) {
    return markdown;
  }
  return `${markdown.trimEnd()}\n\n## ${sectionTitle}\n`;
}

function appendUniqueBullets(markdown, sectionTitle, bullets) {
  const normalizedBullets = bullets
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .map((item) => (item.startsWith("- ") ? item : `- ${item}`));

  if (!normalizedBullets.length) {
    return markdown;
  }

  const ensured = ensureSection(markdown, sectionTitle);
  const pattern = new RegExp(`(^##\\s+${sectionTitle}\\s*$\\n?)([\\s\\S]*?)(?=\\n##\\s+|$)`, "m");
  const match = ensured.match(pattern);
  if (!match) {
    return ensured;
  }

  const header = match[1];
  const body = match[2].trim();
  const existingLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const existingSet = new Set(existingLines);
  const nextLines = [...existingLines];

  normalizedBullets.forEach((line) => {
    if (!existingSet.has(line)) {
      nextLines.push(line);
      existingSet.add(line);
    }
  });

  return ensured.replace(pattern, `${header}\n${nextLines.join("\n")}\n`);
}

function parseCheckinMarkdown(markdown) {
  const dateMatch = String(markdown || "").match(/\| 日期 \| ([^|]+) \|/);
  const date = dateMatch ? normalizeText(dateMatch[1]) : "";
  const rows = String(markdown || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 3 && cells[0] !== "项目" && cells[0] !== "字段" && cells[0] !== "---")
    .map((cells) => ({
      title: normalizeText(cells[0]),
      slot: normalizeText(cells[1]),
      status: normalizeText(cells[2]),
    }))
    .filter((row) => row.title);

  return {
    date,
    items: rows,
  };
}

function buildCheckinMarkdown(date, items) {
  return [
    "# 每天打卡",
    "",
    "## 今日信息",
    "",
    "| 字段 | 内容 |",
    "| --- | --- |",
    `| 日期 | ${date} |`,
    "",
    "## 打卡项",
    "",
    "| 项目 | 时段 | 状态 |",
    "| --- | --- | --- |",
    ...items.map((item) => `| ${normalizeText(item.title)} | ${normalizeText(item.slot)} | ${normalizeText(item.status)} |`),
    "",
  ].join("\n");
}

function parseCoreContributionMarkdown(markdown) {
  const date = String(markdown || "").match(/^##\s+日期\s*\n\s*\n([^\n]+)$/m)?.[1]?.trim() || "";
  const content = getSection(markdown, "内容");
  return {
    date: normalizeText(date),
    content: String(content || "").trim(),
  };
}

function buildCoreContributionMarkdown(date, content) {
  return [
    "# 今日核心贡献",
    "",
    "## 日期",
    "",
    date,
    "",
    "## 内容",
    "",
    String(content || "").trim(),
    "",
  ].join("\n");
}

function parseTodayPlanMarkdown(markdown) {
  const items = String(markdown || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 3 && cells[0] !== "排序" && cells[0] !== "---")
    .map((cells, index) => ({
      order: Number(cells[0]) || index + 1,
      description: normalizeText(cells[1]),
      status: normalizeText(cells[2] || "未完成"),
      planId: normalizeText(cells[3] || ""),
      schedulePlacement: normalizeText(cells[4] || ""),
    }))
    .filter((item) => item.description)
    .sort((a, b) => a.order - b.order);

  return {
    items,
  };
}

function buildTodayPlanMarkdown(items) {
  return [
    "# 日计划",
    "",
    "| 排序 | 描述 | 状态 | 计划ID | 日程落位 |",
    "| --- | --- | --- | --- | --- |",
    ...items.map((item, index) => `| ${index + 1} | ${normalizeText(item.description)} | ${normalizeText(item.status || "未完成")} | ${normalizeText(item.planId || "")} | ${normalizeText(item.schedulePlacement || "")} |`),
    "",
  ].join("\n");
}

function incrementDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function appendTableRows(markdown, rows) {
  const normalizedRows = rows.filter((row) => row.dimension || row.metric || row.value);
  if (!normalizedRows.length) {
    return markdown;
  }

  const section = getSection(markdown, "数据记录");
  const existingLines = String(section || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headerLines = existingLines.length
    ? existingLines.filter((line, index) => index < 2 || /^\|/.test(line))
    : ["| 维度 | 指标 | 数值 / 状态 |", "| --- | --- | --- |"];
  const currentRows = new Set(existingLines.filter((line) => /^\|/.test(line)).slice(2));

  normalizedRows.forEach((row) => {
    currentRows.add(`| ${normalizeText(row.dimension)} | ${normalizeText(row.metric)} | ${normalizeText(row.value)} |`);
  });

  const nextSection = [...headerLines.slice(0, 2), ...currentRows].join("\n");
  return markdown.replace(
    /^##\s+数据记录\s*$[\s\S]*?(?=\n##\s+|$)/m,
    `## 数据记录\n\n${nextSection}`
  );
}

function startNewDay(payload = {}) {
  const checkin = parseCheckinMarkdown(readFileSafe(checkinPath, ""));
  const contribution = parseCoreContributionMarkdown(readFileSafe(coreContributionPath, ""));
  const todayPlan = parseTodayPlanMarkdown(readFileSafe(todayPlanPath, ""));
  const archivedDate = normalizeText(payload?.archivedDate) || contribution.date || checkin.date;
  const nextDate = normalizeText(payload?.nextDate) || incrementDate(archivedDate);

  if (!archivedDate) {
    throw new Error("archived date is required");
  }

  const archivedCapture = archiveCapture({ date: archivedDate });

  const logPath = ensureDailyLog(archivedDate);
  let logMarkdown = readFileSafe(logPath);
  const completedItems = checkin.items.filter((item) => item.status === "已完成");
  const pendingItems = checkin.items.filter((item) => item.status !== "已完成");
  const completedPlans = todayPlan.items.filter((item) => item.status === "已完成");
  const pendingPlans = todayPlan.items.filter((item) => item.status !== "已完成");

  const summaryBullets = [];
  if (todayPlan.items.length) {
    const doneSummary = completedPlans.length
      ? `已完成 ${completedPlans.length} 项：${completedPlans.map((item) => item.description).join("、")}`
      : "已完成 0 项";
    const pendingSummary = pendingPlans.length
      ? `；未完成 ${pendingPlans.length} 项：${pendingPlans.map((item) => item.description).join("、")}`
      : "";
    summaryBullets.push(`- 日计划收口 ${completedPlans.length}/${todayPlan.items.length}，${doneSummary}${pendingSummary}`);
  }
  if (completedItems.length) {
    summaryBullets.push(`- 完成每日打卡 ${completedItems.length}/${checkin.items.length}：${completedItems.map((item) => item.title).join("、")}`);
  }
  if (contribution.content) {
    summaryBullets.push(`- 今日核心贡献：${normalizeText(contribution.content)}`);
  }
  logMarkdown = appendUniqueBullets(logMarkdown, "今日变化", summaryBullets);
  logMarkdown = appendTableRows(logMarkdown, [
    todayPlan.items.length
      ? {
          dimension: "日常杂项",
          metric: "日计划完成率",
          value: `${completedPlans.length}/${todayPlan.items.length}`,
        }
      : null,
    completedPlans.length
      ? {
          dimension: "日常杂项",
          metric: "已完成日计划",
          value: completedPlans.map((item) => item.description).join("、"),
        }
      : null,
    pendingPlans.length
      ? {
          dimension: "日常杂项",
          metric: "未完成日计划",
          value: pendingPlans.map((item) => item.description).join("、"),
        }
      : null,
    checkin.items.length
      ? {
          dimension: "生活技能",
          metric: "打卡完成率",
          value: `${completedItems.length}/${checkin.items.length}`,
        }
      : null,
    completedItems.length
      ? {
          dimension: "生活技能",
          metric: "已完成打卡",
          value: completedItems.map((item) => item.title).join("、"),
        }
      : null,
    pendingItems.length
      ? {
          dimension: "生活技能",
          metric: "未完成打卡",
          value: pendingItems.map((item) => item.title).join("、"),
        }
      : null,
    contribution.content
      ? {
          dimension: "日常杂项",
          metric: "上一天核心贡献",
          value: normalizeText(contribution.content),
        }
      : null,
  ].filter(Boolean));
  writeFile(logPath, `${logMarkdown.trimEnd()}\n`);

  const generated = generateDailyLogWithCodex(archivedDate);

  const resetItems = checkin.items.map((item) => ({
    ...item,
    status: "未完成",
  }));
  writeFile(checkinPath, buildCheckinMarkdown(nextDate, resetItems));
  writeFile(coreContributionPath, buildCoreContributionMarkdown(nextDate, ""));
  writeFile(todayPlanPath, buildTodayPlanMarkdown([]));

  const writtenFiles = [
    ...new Set(
      [
        ...(archivedCapture.updatedFiles || []),
        path.relative(rootDir, logPath),
        path.relative(rootDir, checkinPath),
        path.relative(rootDir, coreContributionPath),
        path.relative(rootDir, todayPlanPath),
      ].filter(Boolean)
    ),
  ];

  const summary = {
    archivedDate,
    captures: {
      archivedCount: archivedCapture.archivedCount || 0,
      updatedFiles: archivedCapture.updatedFiles || [],
    },
    todayPlan: {
      total: todayPlan.items.length,
      completedCount: completedPlans.length,
      pendingCount: pendingPlans.length,
      completedItems: completedPlans.map((item) => item.description),
      pendingItems: pendingPlans.map((item) => item.description),
    },
    dailyCheckin: {
      total: checkin.items.length,
      completedCount: completedItems.length,
      pendingCount: pendingItems.length,
      completedItems: completedItems.map((item) => item.title),
      pendingItems: pendingItems.map((item) => item.title),
    },
    coreContribution: contribution.content ? normalizeText(contribution.content) : "",
    log: {
      path: path.relative(rootDir, logPath),
      generationMode: generated.mode,
    },
    writtenFiles,
  };

  return {
    archivedDate,
    nextDate,
    archivedCaptureCount: archivedCapture.archivedCount || 0,
    logPath: path.relative(rootDir, logPath),
    generationMode: generated.mode,
    dailyCheckin: {
      date: nextDate,
      items: resetItems,
    },
    todayPlan: {
      items: [],
    },
    coreContribution: {
      date: nextDate,
      content: "",
    },
    summary,
  };
}

if (require.main === module) {
  const [, , jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const result = startNewDay(payload);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  startNewDay,
};
