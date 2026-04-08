const fs = require("fs");
const path = require("path");
const { routeCaptureWithCodex } = require("./codex-route-capture.js");
const { generateDailyLogWithCodex } = require("./daily-log-generator.js");
const { insertScheduleItemFromText } = require("./schedule-utils.js");
const { contentRoot, contentPath } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const inboxPath = contentPath("inbox", "quick-capture.md");
const purchaseMasterPath = contentPath("todos", "2026-04-06-purchase-master.md");
const catFoodFunPath = contentPath("private", "cat-food-fun-index.md");

const iterationFileMap = {
  basketball: contentPath("iterations", "basketball.md"),
  football: contentPath("iterations", "football.md"),
  badminton: contentPath("iterations", "badminton.md"),
  fitness: contentPath("iterations", "fitness.md"),
  skincare: contentPath("iterations", "skincare.md"),
  diet: contentPath("iterations", "diet.md"),
};

const iterationSectionMap = {
  recent_changes: "最近变化",
  current_problems: "当前问题",
  insights: "经验沉淀",
  next_step: "下一步",
};

const milestoneTableHeader = "| 状态 | 里程碑 | 目标时间 | 完成时间 | 证据 / 结果 |";
const milestoneTableDivider = "| --- | --- | --- | --- | --- |";
const achievementTableHeader = "| 日期 | 成就 | 影响 | 证据 |";
const achievementTableDivider = "| --- | --- | --- | --- |";

const iterationKeywordRoutes = [
  {
    iterationId: "basketball",
    keywords: ["篮球", "投篮", "三分", "接球投", "出手", "运球", "防守横移"],
  },
  {
    iterationId: "football",
    keywords: ["足球", "长传", "左后卫", "边后卫", "出球", "控球", "停球"],
  },
  {
    iterationId: "badminton",
    keywords: ["羽毛球", "高远球", "吊球", "杀球", "步伐", "步法"],
  },
  {
    iterationId: "fitness",
    keywords: ["健身", "力量", "卧推", "深蹲", "硬拉", "引体", "核心", "步频", "恢复", "有氧"],
  },
  {
    iterationId: "skincare",
    keywords: ["护肤", "痘", "皮肤", "洁面", "面膜", "爆痘"],
  },
  {
    iterationId: "diet",
    keywords: ["饮食", "热量", "蛋白质", "早餐", "午餐", "晚餐", "宵夜", "加餐", "外食", "减脂餐", "健身餐"],
  },
];

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
    .trim();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(date) {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getDateKeyFromTimestamp(timestamp) {
  const match = String(timestamp || "").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) {
    return "";
  }

  return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
}

function getIsoWeekId(date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 4 - (target.getDay() || 7));
  const yearStart = new Date(target.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getFullYear()}-W${pad(weekNo)}`;
}

function parseCaptureEntries(markdown) {
  const marker = "## 最近记录";
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex === -1) {
    return { before: markdown.trimEnd(), entries: [], tail: "" };
  }

  const before = markdown.slice(0, markerIndex + marker.length).trimEnd();
  const after = markdown.slice(markerIndex + marker.length).trim();
  const rawBlocks = after
    .split(/(?=^###\s+)/m)
    .map((block) => block.trim())
    .filter(Boolean);

  const entries = [];
  const tailBlocks = [];

  rawBlocks.forEach((block) => {
    if (!block.startsWith("### ")) {
      tailBlocks.push(block);
      return;
    }

    const lines = block.split("\n").map((line) => line.trimRight());
    const heading = lines[0].replace(/^###\s+/, "").trim();
    const parts = heading.split("|").map((item) => item.trim());
    const fields = {};

    lines.slice(1).forEach((line) => {
      const match = line.match(/^- ([^：]+)：\s*(.*)$/);
      if (match) {
        fields[match[1].trim()] = match[2].trim();
      }
    });

    entries.push({
      raw: block,
      timestamp: parts[0] || "",
      category: parts[1] || "",
      dimension: parts[2] || fields["归类"] || "日常杂项",
      fields,
      dateKey: getDateKeyFromTimestamp(parts[0]),
      archived: String(fields["归档"] || "").startsWith("已归档"),
    });
  });

  return {
    before,
    entries,
    tail: tailBlocks.join("\n\n").trim(),
  };
}

function serializeCaptureEntry(entry) {
  const lines = [`### ${entry.timestamp} | ${entry.category} | ${entry.dimension}`];
  const orderedKeys = ["归类", "内容", "保存", "文字", "备注", "归档"];
  const renderedKeys = new Set();

  orderedKeys.forEach((key) => {
    const value = normalizeText(entry.fields[key]);
    if (value) {
      lines.push(`- ${key}：${value}`);
      renderedKeys.add(key);
    }
  });

  Object.entries(entry.fields).forEach(([key, value]) => {
    if (renderedKeys.has(key)) {
      return;
    }
    const normalized = normalizeText(value);
    if (normalized) {
      lines.push(`- ${key}：${normalized}`);
    }
  });

  return lines.join("\n");
}

function writeCaptureEntries(structure) {
  const blocks = structure.entries.map(serializeCaptureEntry);
  if (structure.tail) {
    blocks.push(structure.tail);
  }
  const output = `${structure.before}\n\n${blocks.join("\n\n")}\n`;
  writeFile(inboxPath, output);
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

  const replacement = `${header}\n${nextLines.join("\n")}\n`;
  return ensured.replace(pattern, replacement);
}

function ensureTableSection(markdown, sectionTitle, headerRow, dividerRow) {
  const ensured = ensureSection(markdown, sectionTitle);
  const pattern = new RegExp(`(^##\\s+${sectionTitle}\\s*$\\n?)([\\s\\S]*?)(?=\\n##\\s+|$)`, "m");
  const match = ensured.match(pattern);

  if (!match) {
    return `${ensured.trimEnd()}\n\n## ${sectionTitle}\n\n${headerRow}\n${dividerRow}\n`;
  }

  const header = match[1];
  const body = match[2].trim();
  const lines = body ? body.split("\n").map((line) => line.trimRight()).filter(Boolean) : [];
  const hasTableHeader = lines.includes(headerRow);
  const hasDivider = lines.includes(dividerRow);
  const nextLines = [...lines];

  if (!hasTableHeader) {
    nextLines.unshift(dividerRow);
    nextLines.unshift(headerRow);
  } else if (!hasDivider) {
    const headerIndex = nextLines.indexOf(headerRow);
    nextLines.splice(headerIndex + 1, 0, dividerRow);
  }

  const replacement = `${header}\n${nextLines.join("\n")}\n`;
  return ensured.replace(pattern, replacement);
}

function appendUniqueTableRows(markdown, sectionTitle, headerRow, dividerRow, rows) {
  const normalizedRows = rows
    .map((row) => normalizeText(row))
    .filter(Boolean)
    .map((row) => (row.startsWith("|") ? row : `| ${row} |`));

  if (!normalizedRows.length) {
    return markdown;
  }

  const ensured = ensureTableSection(markdown, sectionTitle, headerRow, dividerRow);
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

  normalizedRows.forEach((line) => {
    if (!existingSet.has(line)) {
      nextLines.push(line);
      existingSet.add(line);
    }
  });

  const replacement = `${header}\n${nextLines.join("\n")}\n`;
  return ensured.replace(pattern, replacement);
}

function truncateText(text, maxLength = 48) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function ensureDailyLog(dateKey) {
  const filePath = path.join(rootDir, "logs", "daily", `${dateKey}.md`);
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

function ensureWeeklyLog(date) {
  const weekId = getIsoWeekId(date);
  const filePath = path.join(rootDir, "logs", "weekly", `${weekId}.md`);
  if (fs.existsSync(filePath)) {
    return { filePath, weekId };
  }

  const skeleton = [
    `# ${weekId} 周志`,
    "",
    "## 本周主题",
    "",
    "待补充",
    "",
    "## 本周关键进展",
    "",
    "## 下周重点",
    "",
  ].join("\n");
  writeFile(filePath, `${skeleton}\n`);
  return { filePath, weekId };
}

function appendCatFoodFun(dateKey, summary) {
  let markdown = readFileSafe(catFoodFunPath);
  const row = `| ${dateKey} | 日常记录 | ${normalizeText(summary)} | ${dateKey} |`;
  if (markdown.includes(row)) {
    return false;
  }

  const placeholder = "| 待补充 | 饮食 | 预留 | 待补充 |";
  if (markdown.includes(placeholder)) {
    markdown = markdown.replace(placeholder, `${row}\n${placeholder}`);
  } else {
    markdown = markdown.replace("## 索引列表", `## 索引列表\n\n| 日期 | 类型 | 去哪里吃喝玩 | 关联日期 |\n| --- | --- | --- | --- |\n${row}`);
  }

  writeFile(catFoodFunPath, markdown);
  return true;
}

function appendPurchaseArchive(summary, dateKey) {
  let markdown = readFileSafe(purchaseMasterPath);
  const bullet = `- ${dateKey} 随手记归档：${normalizeText(summary)}`;
  markdown = appendUniqueBullets(markdown, "归档记录", [bullet]);
  writeFile(purchaseMasterPath, markdown);
  return true;
}

function appendIterationRoute(route, dateKey) {
  const iterationId = String(route?.iteration_id || "none");
  const sectionKey = String(route?.section || "ignore");
  const filePath = iterationFileMap[iterationId];
  const sectionTitle = iterationSectionMap[sectionKey];

  if (!filePath || !sectionTitle || !fs.existsSync(filePath)) {
    return "";
  }

  let markdown = readFileSafe(filePath);
  const bulletBody = normalizeText(route?.markdown_bullet || route?.summary || route?.title || "");
  if (!bulletBody) {
    return "";
  }

  const bullet = `- ${dateKey} ${bulletBody}`;
  markdown = appendUniqueBullets(markdown, sectionTitle, [bullet]);
  markdown = markdown.replace(/\| 更新时间 \| .* \|/, `| 更新时间 | ${dateKey} |`);
  writeFile(filePath, markdown);
  return path.relative(rootDir, filePath);
}

function appendIterationMilestone(iterationId, dateKey, milestoneText, evidenceText) {
  const filePath = iterationFileMap[iterationId];
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }

  const cleanMilestone = normalizeText(milestoneText);
  if (!cleanMilestone) {
    return "";
  }

  let markdown = readFileSafe(filePath);
  const row = `| 已完成 | ${cleanMilestone} | 待补充 | ${dateKey} | ${truncateText(evidenceText || cleanMilestone)} |`;
  markdown = appendUniqueTableRows(markdown, "里程碑", milestoneTableHeader, milestoneTableDivider, [row]);
  markdown = markdown.replace(/\| 更新时间 \| .* \|/, `| 更新时间 | ${dateKey} |`);
  writeFile(filePath, markdown);
  return path.relative(rootDir, filePath);
}

function appendIterationAchievement(iterationId, dateKey, achievementText, impactText, evidenceText) {
  const filePath = iterationFileMap[iterationId];
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }

  const cleanAchievement = normalizeText(achievementText);
  if (!cleanAchievement) {
    return "";
  }

  let markdown = readFileSafe(filePath);
  const row = `| ${dateKey} | ${cleanAchievement} | ${normalizeText(impactText || "形成阶段性可回看结果")} | ${truncateText(evidenceText || cleanAchievement)} |`;
  markdown = appendUniqueTableRows(markdown, "成就归档", achievementTableHeader, achievementTableDivider, [row]);
  markdown = markdown.replace(/\| 更新时间 \| .* \|/, `| 更新时间 | ${dateKey} |`);
  writeFile(filePath, markdown);
  return path.relative(rootDir, filePath);
}

function matchIterationByKeyword(text) {
  const normalized = normalizeText(text).toLowerCase();
  return (
    iterationKeywordRoutes.find((route) =>
      route.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    ) || null
  );
}

function guessIterationSection(text) {
  const normalized = normalizeText(text);
  if (/问题|不行|卡住|断|短板|不足|失误/.test(normalized)) {
    return "current_problems";
  }
  if (/下一步|接下来|明天|下次|需要|应该/.test(normalized)) {
    return "next_step";
  }
  if (/核心|要点|经验|技巧|方法|感觉|发力|对准|释放|姿势|细节|模板/.test(normalized)) {
    return "insights";
  }
  return "recent_changes";
}

function buildKeywordIterationRoute(summary) {
  const matched = matchIterationByKeyword(summary);
  if (!matched) {
    return null;
  }

  const cleanSummary = normalizeText(summary);
  return {
    should_archive_to_iteration: true,
    iteration_id: matched.iterationId,
    section: guessIterationSection(cleanSummary),
    title: cleanSummary.slice(0, 24),
    summary: cleanSummary,
    markdown_bullet: cleanSummary,
    achievement_candidate: "",
    source: "keyword",
  };
}

function normalizeCodexRoute(route) {
  return {
    should_archive_to_iteration: Boolean(route?.should_archive_to_iteration),
    iteration_id: String(route?.iteration_id || "none"),
    section: String(route?.section || "ignore"),
    title: normalizeText(route?.title || ""),
    summary: normalizeText(route?.summary || ""),
    reason: normalizeText(route?.reason || ""),
    markdown_bullet: normalizeText(route?.markdown_bullet || ""),
    achievement_candidate: normalizeText(route?.achievement_candidate || ""),
  };
}

function resolveIterationRoute(summary) {
  const fallbackRoute = buildKeywordIterationRoute(summary);

  try {
    const aiRoute = normalizeCodexRoute(routeCaptureWithCodex(summary));
    if (
      aiRoute.should_archive_to_iteration &&
      aiRoute.iteration_id !== "none" &&
      aiRoute.section !== "ignore"
    ) {
      return { route: aiRoute, usedFallback: false };
    }

    if (fallbackRoute) {
      return {
        route: {
          ...fallbackRoute,
          achievement_candidate: aiRoute.achievement_candidate || fallbackRoute.achievement_candidate || "",
        },
        usedFallback: true,
      };
    }

    return { route: aiRoute, usedFallback: false };
  } catch (error) {
    if (fallbackRoute) {
      return { route: fallbackRoute, usedFallback: true, fallbackError: error };
    }
    throw error;
  }
}

function parseExplicitIterationDirective(text) {
  const normalized = normalizeText(text);
  const milestoneMatch = normalized.match(/^(?:【里程碑】|里程碑[：:])\s*(.+)$/);
  if (milestoneMatch) {
    return {
      type: "milestone",
      payload: milestoneMatch[1].trim(),
    };
  }

  const achievementMatch = normalized.match(/^(?:【成就】|成就[：:])\s*(.+)$/);
  if (achievementMatch) {
    return {
      type: "achievement",
      payload: achievementMatch[1].trim(),
    };
  }

  return null;
}

function stripIterationLeadLabel(text) {
  return normalizeText(text).replace(/^(篮球|足球|羽毛球|护肤|健身)\s*[：:]\s*/, "").trim();
}

function buildAchievementImpact(route) {
  const section = String(route?.section || "");
  if (section === "insights") {
    return "形成了可复用的方法和动作锚点";
  }
  if (section === "current_problems") {
    return "把真实问题从流水里提炼成了可回看的卡点";
  }
  if (section === "next_step") {
    return "把后续动作明确成了可以继续推进的方向";
  }
  return "阶段推进被系统单独归档了";
}

function looksLikePurchase(text) {
  return /购买|买了|下单|篮球鞋|衣服|项链|手环|键盘|手机卡|手机壳|书/.test(text);
}

function looksLikeCatActivity(text) {
  return /猫/.test(text) && /吃|喝|玩|约会|散步|去|拍照|体检|小酒馆/.test(text);
}

function looksLikeSchedulePlan(text) {
  return /(周[一二三四五六日天]|今天|今晚|今早|明天|\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2})/.test(text);
}

function looksLikeTodaySchedulePlan(text) {
  return /(今天|今晚|今早|今日)/.test(String(text || ""));
}

function getEntrySummary(entry) {
  return normalizeText(entry?.fields?.["内容"] || entry?.fields?.["保存"] || "");
}

function applyArchiveRouting({ dateKey, summaries }) {
  const now = new Date(`${dateKey}T12:00:00`);
  const updatedFiles = new Set();
  const modelRouteFailures = [];

  const dailyLogPath = ensureDailyLog(dateKey);
  let dailyLogMarkdown = readFileSafe(dailyLogPath);
  const dailyBullets = summaries.map((summary) => `- 随手记归档：${summary}`);
  dailyLogMarkdown = appendUniqueBullets(dailyLogMarkdown, "今日变化", dailyBullets);
  writeFile(dailyLogPath, dailyLogMarkdown);
  updatedFiles.add(path.relative(rootDir, dailyLogPath));

  const { filePath: weeklyLogPath } = ensureWeeklyLog(now);
  let weeklyLogMarkdown = readFileSafe(weeklyLogPath);
  weeklyLogMarkdown = appendUniqueBullets(
    weeklyLogMarkdown,
    "本周关键进展",
    [`- ${dateKey} 归档了 ${summaries.length} 条随手记：${summaries.join("；")}`]
  );
  writeFile(weeklyLogPath, weeklyLogMarkdown);
  updatedFiles.add(path.relative(rootDir, weeklyLogPath));

  summaries.forEach((summary) => {
    const explicitDirective = parseExplicitIterationDirective(summary);
    const summaryForIteration = explicitDirective
      ? stripIterationLeadLabel(explicitDirective.payload)
      : summary;

    // "今天 / 今晚 / 今早 / 今日" 属于强规则，优先直接沉到今日日程。
    if (looksLikeTodaySchedulePlan(summary) || looksLikeSchedulePlan(summary)) {
      try {
        const inserted = insertScheduleItemFromText(summary, {
          referenceDate: `${dateKey}T12:00:00`,
        });
        updatedFiles.add(inserted.path);
      } catch (error) {
        modelRouteFailures.push(`${summary} -> schedule: ${error.message}`);
      }
    }

    if (looksLikePurchase(summary)) {
      appendPurchaseArchive(summary, dateKey);
      updatedFiles.add(path.relative(rootDir, purchaseMasterPath));
    }

    try {
      const { route } = resolveIterationRoute(summaryForIteration);
      if (route.should_archive_to_iteration) {
        const iterationPath = appendIterationRoute(route, dateKey);
        if (iterationPath) {
          updatedFiles.add(iterationPath);
        }

        const achievementCandidate = normalizeText(route.achievement_candidate || "");
        if (achievementCandidate) {
          const achievementPath = appendIterationAchievement(
            route.iteration_id,
            dateKey,
            achievementCandidate,
            buildAchievementImpact(route),
            summaryForIteration
          );
          if (achievementPath) {
            updatedFiles.add(achievementPath);
          }
        }
      }

      if (explicitDirective) {
        const explicitMatch = matchIterationByKeyword(explicitDirective.payload);
        const explicitIterationId =
          explicitMatch?.iterationId ||
          (route?.iteration_id && route.iteration_id !== "none" ? route.iteration_id : "");
        const explicitText = stripIterationLeadLabel(explicitDirective.payload);

        if (explicitDirective.type === "milestone" && explicitIterationId) {
          const milestonePath = appendIterationMilestone(
            explicitIterationId,
            dateKey,
            explicitText,
            summaryForIteration
          );
          if (milestonePath) {
            updatedFiles.add(milestonePath);
          }
        }

        if (explicitDirective.type === "achievement" && explicitIterationId) {
          const achievementPath = appendIterationAchievement(
            explicitIterationId,
            dateKey,
            explicitText,
            "手动标记为值得回看的阶段结果",
            summaryForIteration
          );
          if (achievementPath) {
            updatedFiles.add(achievementPath);
          }
        }
      }
    } catch (error) {
      modelRouteFailures.push(`${summary} -> ${error.message}`);
    }

    if (looksLikeCatActivity(summary) && appendCatFoodFun(dateKey, summary)) {
      updatedFiles.add(path.relative(rootDir, catFoodFunPath));
    }
  });

  try {
    const dailyLogResult = generateDailyLogWithCodex(dateKey);
    if (dailyLogResult.updated && dailyLogResult.path) {
      updatedFiles.add(dailyLogResult.path);
    }
  } catch (error) {
    modelRouteFailures.push(`daily-log ${dateKey} -> ${error.message}`);
  }

  return {
    updatedFiles: [...updatedFiles],
    modelRouteFailures,
  };
}

function archiveCapture(payload = {}) {
  const now = payload?.date ? new Date(`${payload.date}T12:00:00`) : new Date();
  const dateKey = formatDate(now);
  const inboxMarkdown = readFileSafe(inboxPath, "# 快速收集\n\n## 最近记录\n\n");
  const structure = parseCaptureEntries(inboxMarkdown);
  const entries = structure.entries.filter((entry) => entry.dateKey === dateKey && !entry.archived);

  if (!entries.length) {
    return {
      date: dateKey,
      archivedCount: 0,
      updatedFiles: [],
      message: "今天没有可归档的新随手记。",
    };
  }

  const summaries = entries.map(getEntrySummary).filter(Boolean);
  const archiveResult = applyArchiveRouting({ dateKey, summaries });

  const archiveStamp = `已归档 ${formatDateTime(new Date())}`;
  structure.entries = structure.entries.map((entry) => {
    if (entry.dateKey === dateKey && !entry.archived) {
      return {
        ...entry,
        archived: true,
        fields: {
          ...entry.fields,
          归档: archiveStamp,
        },
      };
    }
    return entry;
  });
  writeCaptureEntries(structure);

  const updatedFiles = new Set(archiveResult.updatedFiles);
  updatedFiles.add(path.relative(rootDir, inboxPath));

  return {
    date: dateKey,
    archivedCount: entries.length,
    updatedFiles: [...updatedFiles],
    message:
      archiveResult.modelRouteFailures.length
        ? `已归档 ${entries.length} 条随手记。领域沉淀有 ${archiveResult.modelRouteFailures.length} 条未完成，请检查本地 codex 连接。`
        : `已归档 ${entries.length} 条随手记。`,
    modelRouteFailures: archiveResult.modelRouteFailures,
  };
}

function archiveLatestCapture(payload = {}) {
  const inboxMarkdown = readFileSafe(inboxPath, "# 快速收集\n\n## 最近记录\n\n");
  const structure = parseCaptureEntries(inboxMarkdown);
  const latestEntry = structure.entries[0];

  if (!latestEntry) {
    return {
      archivedCount: 0,
      updatedFiles: [],
      message: "当前没有可沉淀的随手记。",
    };
  }

  if (latestEntry.archived) {
    return {
      archivedCount: 0,
      updatedFiles: [],
      message: "上一条随手记已经沉淀过了。",
      latestEntry: {
        timestamp: latestEntry.timestamp,
        summary: getEntrySummary(latestEntry),
        archived: true,
      },
    };
  }

  const dateKey = latestEntry.dateKey || formatDate(payload?.date ? new Date(`${payload.date}T12:00:00`) : new Date());
  const summary = getEntrySummary(latestEntry);
  const archiveResult = applyArchiveRouting({
    dateKey,
    summaries: summary ? [summary] : [],
  });

  const archiveStamp = `已归档 ${formatDateTime(new Date())}`;
  structure.entries = structure.entries.map((entry, index) => {
    if (index === 0) {
      return {
        ...entry,
        archived: true,
        fields: {
          ...entry.fields,
          归档: archiveStamp,
        },
      };
    }
    return entry;
  });
  writeCaptureEntries(structure);

  const updatedFiles = new Set(archiveResult.updatedFiles);
  updatedFiles.add(path.relative(rootDir, inboxPath));

  return {
    date: dateKey,
    archivedCount: 1,
    updatedFiles: [...updatedFiles],
    message:
      archiveResult.modelRouteFailures.length
        ? "已沉淀上一条随手记，但有部分 AI 路由未完成。"
        : "已沉淀上一条随手记。",
    modelRouteFailures: archiveResult.modelRouteFailures,
    latestEntry: {
      timestamp: latestEntry.timestamp,
      summary,
      archived: true,
      archivedAt: archiveStamp,
    },
  };
}

if (require.main === module) {
  const [, , jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const result = archiveCapture(payload);
    console.log(`archived ${result.archivedCount} capture(s)`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  archiveCapture,
  archiveLatestCapture,
};
