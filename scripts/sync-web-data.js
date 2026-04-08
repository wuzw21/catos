const fs = require("fs");
const path = require("path");
const { dimensionDefinitions } = require("../config/dimension-keywords.js");
const { repoRoot, contentRoot, repoPath, relativeToContent } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const outFile = repoPath("web", "data.js");

function read(filePath) {
  return stripFrontmatter(fs.readFileSync(path.join(rootDir, filePath), "utf8")).trim();
}

function stripFrontmatter(markdown) {
  return markdown.replace(/^\uFEFF?---\n[\s\S]*?\n---\n*/u, "");
}

function listFiles(dirPath) {
  return fs
    .readdirSync(path.join(rootDir, dirPath), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let tableRows = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join("<br />"))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  }

  function flushTable() {
    if (!tableRows.length) return;
    const [header, ...body] = tableRows;
    const headerCells = header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("");
    const bodyRows = body
      .filter((row) => !row.every((cell) => /^-+$/.test(cell.replace(/\s/g, ""))))
      .map((row) => {
        const cells = row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    html.push(`<div class="md-table-wrap"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`);
    tableRows = [];
  }

  function closeBlocks() {
    flushParagraph();
    flushList();
    flushTable();
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeBlocks();
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      tableRows.push(cells);
      continue;
    }

    flushTable();

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeBlocks();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^-\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  closeBlocks();
  return html.join("\n");
}

function getFirstTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}

function getSecondaryTitle(markdown) {
  const match = markdown.match(/^##\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function getFirstParagraph(markdown) {
  const lines = markdown.split("\n");
  const chunks = [];
  let collecting = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (collecting) break;
      continue;
    }
    if (/^(#|\||- |\d+\.)/.test(line)) {
      if (collecting) break;
      continue;
    }
    collecting = true;
    chunks.push(line);
  }

  return chunks.join(" ");
}

function getSectionText(markdown, headingTitle) {
  const escapedHeading = headingTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^##\\s+${escapedHeading}\\s*\\n\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "m"));
  if (!match) return "";

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function getListText(markdown, headingTitle) {
  const escapedHeading = headingTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^##\\s+${escapedHeading}\\s*\\n\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "m"));
  if (!match) return "";

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, ""))
    .join(" ");
}

function parseIdentityTable(markdown) {
  const lines = markdown.split("\n");
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^\|.+\|$/.test(trimmed)) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length === 2 && cells[0] !== "项目" && !/^---+$/.test(cells[0])) {
      rows.push({ key: cells[0], value: cells[1] });
    }
  }

  return rows;
}

function parseKeywords(markdown) {
  const section = markdown.split("## 当前年度关键词")[1] || "";
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, ""));
}

function parseGoals(goalsMarkdown) {
  const blocks = goalsMarkdown.split(/^##\s+/m).slice(1);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const title = lines[0].trim();
    const pairs = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!/^\|.+\|$/.test(trimmed)) continue;
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.length === 2 && cells[0] !== "字段" && !/^---+$/.test(cells[0])) {
        pairs.push({ key: cells[0], value: cells[1] });
      }
    }

    const progressValue = pairs.find((item) => item.key === "进度条")?.value || "";
    const progressMatch = progressValue.match(/(\d+)%/);

    return {
      id: slugify(title),
      title,
      progress: progressMatch ? Number(progressMatch[1]) : 0,
      fields: pairs,
    };
  });
}

function parseMarkdownTable(markdown, sectionTitle) {
  let section = markdown;
  if (sectionTitle) {
    const afterTitle = String(markdown).split(sectionTitle)[1] || "";
    section = afterTitle.split(/\n##\s+/)[0] || "";
  }
  const lines = section.split("\n");
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^\|.+\|$/.test(trimmed)) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (
      cells.length &&
      !cells.every((cell) => /^-+$/.test(cell.replace(/\s/g, ""))) &&
      !["项目", "字段", "维度"].includes(cells[0])
    ) {
      rows.push(cells);
    }
  }

  return rows;
}

function parseKeyValueTable(markdown, sectionTitle) {
  const section = sectionTitle ? markdown.split(sectionTitle)[1] || "" : markdown;
  const lines = section.split("\n");
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^\|.+\|$/.test(trimmed)) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length === 2 && cells[0] !== "字段" && !/^---+$/.test(cells[0].replace(/\s/g, ""))) {
      rows.push({ key: cells[0], value: cells[1] });
    }
  }

  return rows;
}

function detectDimensions(text) {
  const normalized = (text || "").toLowerCase();
  const matches = dimensionDefinitions
    .filter((dimension) =>
      dimension.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    )
    .map((dimension) => dimension.label);

  return matches.length ? matches : ["日常杂项"];
}

function buildPlans() {
  return listFiles("plans").map((filePath) => {
    const markdown = read(filePath);
    const title = getFirstTitle(markdown);
    const period = getSecondaryTitle(markdown);
    return {
      id: path.basename(filePath, ".md"),
      path: filePath,
      title,
      period,
      summary: getFirstParagraph(markdown),
      dimensions: detectDimensions(`${title}\n${period}\n${markdown}`),
      markdown,
      html: markdownToHtml(markdown),
    };
  });
}

function buildDimensions() {
  return fs
    .readdirSync(path.join(rootDir, "dimensions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dirName = entry.name;
      const basePath = path.join("dimensions", dirName);
      const overviewPath = path.join(basePath, "index.md");
      const goalsPath = path.join(basePath, "goals.md");
      const changesPath = path.join(basePath, "changes.md");
      const overviewMarkdown = read(overviewPath);
      const goalsMarkdown = read(goalsPath);
      const changesMarkdown = read(changesPath);
      const goals = parseGoals(goalsMarkdown);
      const latestChange = changesMarkdown
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("- "))
        ?.replace(/^- /, "");

      return {
        id: dirName,
        path: overviewPath,
        name: getFirstTitle(overviewMarkdown),
        summary: getFirstParagraph(overviewMarkdown),
        latestChange: latestChange || "",
        goalCount: goals.length,
        progress:
          goals.length > 0
            ? Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length)
            : 0,
        goals,
        files: {
          overview: overviewPath,
          goals: goalsPath,
          changes: changesPath,
        },
        markdown: {
          overview: overviewMarkdown,
          goals: goalsMarkdown,
          changes: changesMarkdown,
        },
        html: {
          overview: markdownToHtml(overviewMarkdown),
          goals: markdownToHtml(goalsMarkdown),
          changes: markdownToHtml(changesMarkdown),
        },
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildLogs() {
  const categories = ["daily", "weekly", "monthly", "yearly"];
  const all = [];
  const categoryLabels = {
    daily: "日记",
    weekly: "周记",
    monthly: "月记",
    yearly: "年记",
  };

  categories.forEach((category) => {
    listFiles(path.join("logs", category)).forEach((filePath) => {
      const markdown = read(filePath);
      const tags = [...new Set([categoryLabels[category], ...detectDimensions(markdown)])];
      const summary =
        getFirstParagraph(markdown) ||
        (category === "daily"
          ? getListText(markdown, "今日变化") || getSectionText(markdown, "复盘")
          : category === "weekly"
            ? getSectionText(markdown, "本周主题") || getListText(markdown, "本周关键进展")
            : category === "monthly"
              ? getSectionText(markdown, "本月主题")
              : getSectionText(markdown, "年度主题"));
      all.push({
        id: `${category}-${path.basename(filePath, ".md")}`,
        category,
        path: filePath,
        title: getFirstTitle(markdown),
        period: path.basename(filePath, ".md"),
        summary,
        tags,
        markdown,
        html: markdownToHtml(markdown),
      });
    });
  });

  return all.sort((a, b) => b.period.localeCompare(a.period));
}

function buildSoul() {
  const markdown = read("soul.md");
  const identity = parseIdentityTable(markdown);

  return {
    id: "soul",
    path: "soul.md",
    title: getFirstTitle(markdown),
    summary: getFirstParagraph(markdown),
    identity,
    keywords: parseKeywords(markdown),
    markdown,
    html: markdownToHtml(markdown),
  };
}

function buildRunGoalProtocol() {
  const markdown = read("workflows/run-goal.md");
  return {
    id: "run-goal",
    path: "workflows/run-goal.md",
    title: getFirstTitle(markdown),
    summary: getFirstParagraph(markdown),
    markdown,
    html: markdownToHtml(markdown),
  };
}

function buildDocs() {
  const docSpecs = [
    { id: "personal-info", path: "profile/personal-info.md", category: "Profile" },
    { id: "interpersonal", path: "profile/interpersonal.md", category: "People" },
    { id: "cat-100-things", path: "private/cat-100-things.md", category: "Private" },
    { id: "cat-food-fun-index", path: "private/cat-food-fun-index.md", category: "Private" },
    { id: "cat-little-things", path: "private/cat-little-things.md", category: "Private" },
    { id: "personal-list", path: "lists/personal-list.md", category: "List" },
    { id: "purchase-asset-hub", path: "lists/purchase-asset-hub.md", category: "Finance" },
    { id: "purchase-list", path: "lists/purchase-list.md", category: "List" },
    { id: "wardrobe", path: "lists/wardrobe.md", category: "Wardrobe" },
    { id: "memorial-days", path: "lists/memorial-days.md", category: "List" },
    { id: "deadlines", path: "lists/deadlines.md", category: "List" },
    { id: "want-to-do", path: "lists/want-to-do.md", category: "Wishlist" },
    { id: "asset-register", path: "assets/asset-register.md", category: "Asset" },
    { id: "quick-capture", path: "inbox/quick-capture.md", category: "Inbox" },
    { id: "daily-schedule", path: "schedules/daily-schedule.md", category: "Schedule" },
    { id: "change-model", path: "notes/change-model.md", category: "System" },
    { id: "fat-loss-calorie-control", path: "notes/fat-loss-calorie-control.md", category: "Nutrition" },
    { id: "external-guides", path: "notes/external-guides.md", category: "Research" },
    { id: "research-keyword-lexicon", path: "notes/research-keyword-lexicon.md", category: "System" },
    { id: "input-rules", path: "workflows/input-rules.md", category: "Workflow" },
    { id: "routing-map", path: "workflows/routing-map.md", category: "Workflow" },
    { id: "run-goal", path: "workflows/run-goal.md", category: "Workflow" },
    { id: "todo", path: "workflows/todo.md", category: "Workflow" },
    { id: "finish", path: "workflows/finish.md", category: "Workflow" },
    { id: "research", path: "workflows/research.md", category: "Workflow" },
    { id: "archive", path: "workflows/archive.md", category: "Workflow" },
    { id: "daily-log-generation-skill", path: "workflows/daily-log-generation-skill.md", category: "Workflow" },
    { id: "eat", path: "workflows/eat.md", category: "Workflow" },
    { id: "train", path: "workflows/train.md", category: "Workflow" },
    { id: "spend", path: "workflows/spend.md", category: "Workflow" },
    { id: "mood", path: "workflows/mood.md", category: "Workflow" },
    { id: "asset", path: "workflows/asset.md", category: "Workflow" },
    { id: "sleep", path: "workflows/sleep.md", category: "Workflow" },
    { id: "wake", path: "workflows/wake.md", category: "Workflow" },
  ];

  return docSpecs.map((spec) => {
    const markdown = read(spec.path);
    const hiddenSummaryDocIds = new Set([
      "cat-100-things",
      "cat-food-fun-index",
      "personal-list",
      "purchase-asset-hub",
      "purchase-list",
      "wardrobe",
      "memorial-days",
      "deadlines",
      "want-to-do",
      "asset-register",
    ]);
    return {
      id: spec.id,
      path: spec.path,
      category: spec.category,
      title: getFirstTitle(markdown),
      summary: hiddenSummaryDocIds.has(spec.id) ? "" : getFirstParagraph(markdown),
      markdown,
      html: markdownToHtml(markdown),
    };
  });
}

function buildPhotos() {
  const photoDir = path.join(rootDir, "photos");
  const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

  if (!fs.existsSync(photoDir)) {
    return [];
  }

  return fs
    .readdirSync(photoDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({
      name: entry.name,
      path:
        rootDir === repoRoot
          ? `../photos/${entry.name}`
          : `/__content/${relativeToContent(path.join(photoDir, entry.name)).replace(/\\/g, "/")}`,
    }));
}

function buildExplorations() {
  const dirPath = path.join(rootDir, "explorations");

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return listFiles("explorations").map((filePath) => {
    const markdown = read(filePath);
    return {
      id: path.basename(filePath, ".md"),
      path: filePath,
      title: getFirstTitle(markdown),
      summary: getFirstParagraph(markdown),
      markdown,
      html: markdownToHtml(markdown),
    };
  });
}

function buildDashboard() {
  const markdown = read("metrics/change-dashboard.md");
  const rows = parseMarkdownTable(markdown, "## 核心指标");
  const metrics = rows.map((cells) => ({
    dimension: cells[0],
    metric: cells[1],
    start: cells[2],
    current: cells[3],
    target: cells[4],
    deadline: cells[5],
    delta: cells[6],
    evidence: cells[7],
    next: cells[8],
  }));

  return {
    id: "change-dashboard",
    path: "metrics/change-dashboard.md",
    title: getFirstTitle(markdown),
    summary: getFirstParagraph(markdown),
    metrics,
    markdown,
    html: markdownToHtml(markdown),
  };
}

function buildIterations() {
  const dirPath = path.join(rootDir, "iterations");

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return listFiles("iterations")
    .map((filePath) => {
      const markdown = read(filePath);
      const fields = parseKeyValueTable(markdown, "## 基本信息");
      const getField = (key) => fields.find((item) => item.key === key)?.value || "";
      const relatedTodoIds = getField("关联 Todo")
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter((item) => item && item !== "待补充");

      if (!fields.length) {
        return null;
      }

      return {
        id: path.basename(filePath, ".md"),
        path: filePath,
        title: getFirstTitle(markdown),
        summary: getListText(markdown, "当前现状") || getListText(markdown, "最近变化") || getFirstParagraph(markdown),
        status: getField("状态") || "未标记",
        category: getField("类别") || "未分类",
        stage: getField("当前阶段") || "",
        updatedAt: getField("更新时间") || "",
        relatedTodoIds,
        dimensions: getField("八维") ? [getField("八维")] : detectDimensions(markdown),
        milestoneCount: parseMarkdownTable(markdown, "## 里程碑").filter((row) => row[0] !== "状态").length,
        achievementCount: parseMarkdownTable(markdown, "## 成就归档").filter((row) => row[0] !== "日期").length,
        current: getListText(markdown, "当前现状"),
        changes: getListText(markdown, "最近变化"),
        problems: getListText(markdown, "当前问题"),
        next: getListText(markdown, "下一步"),
        markdown,
        html: markdownToHtml(markdown),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.id.localeCompare(a.id));
}

function buildSchedules() {
  const dirPath = path.join(rootDir, "schedules");

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return listFiles("schedules").map((filePath) => {
    const markdown = read(filePath);
    const weeks =
      path.basename(filePath, ".md") === "weekly-schedule"
        ? markdown
            .split(/^##\s+/m)
            .slice(1)
            .map((block) => {
              const lines = block.split("\n");
              const rawTitle = lines[0].trim();
              const [weekLabel, dateRange] = rawTitle.split("|").map((part) => part.trim());
              const bodyMarkdown = lines.slice(1).join("\n").trim();
              return {
                id: weekLabel.toLowerCase(),
                weekLabel,
                dateRange: dateRange || "",
                bodyMarkdown,
                html: markdownToHtml(bodyMarkdown),
              };
            })
        : [];

    return {
      id: path.basename(filePath, ".md"),
      path: filePath,
      title: getFirstTitle(markdown),
      summary: getFirstParagraph(markdown),
      markdown,
      html: markdownToHtml(markdown),
      weeks,
    };
  });
}

function buildCurrentFocus() {
  const filePath = path.join("tasks", "current-focus.md");
  const absolutePath = path.join(rootDir, filePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      id: "current-focus",
      path: filePath,
      title: "当前聚焦",
      summary: "",
      markdown: "",
      html: "",
      layers: [],
    };
  }

  const markdown = read(filePath);
  const layers = markdown
    .split(/^##\s+/m)
    .slice(1)
    .map((block) => {
      const lines = block.split("\n");
      const title = lines[0].trim();
      const bodyMarkdown = lines.slice(1).join("\n").trim();
      const items = parseMarkdownTable(bodyMarkdown)
        .filter((row) => row[0] !== "排序")
        .map((row) => ({
          rank: Number(row[0]) || 99,
          project: row[1] || "",
          action: row[2] || "",
          importance: row[3] || "",
          note: row[4] || "",
        }))
        .sort((a, b) => a.rank - b.rank);

      return {
        id: slugify(title),
        title,
        items,
      };
    });

  return {
    id: "current-focus",
    path: filePath,
    title: getFirstTitle(markdown),
    summary: getFirstParagraph(markdown),
    markdown,
    html: markdownToHtml(markdown),
    layers,
  };
}

function buildHomeIndex() {
  const filePath = path.join("tasks", "home-index.md");
  const todayPlanPath = path.join("tasks", "today-plan.md");
  const absolutePath = path.join(rootDir, filePath);
  const todayAbsolutePath = path.join(rootDir, todayPlanPath);

  if (!fs.existsSync(absolutePath) && !fs.existsSync(todayAbsolutePath)) {
    return {
      id: "home-index",
      path: filePath,
      todayPath: todayPlanPath,
      title: "首页索引",
      todayItems: [],
      ddlItems: [],
      markdown: "",
      html: "",
    };
  }

  const markdown = fs.existsSync(absolutePath) ? read(filePath) : "# 首页索引\n";
  const todayMarkdown = fs.existsSync(todayAbsolutePath) ? read(todayPlanPath) : "# 日计划\n";
  const todayRows = parseMarkdownTable(todayMarkdown)
    .filter((row) => row[0] !== "排序")
    .map((row) => ({
      order: Number(row[0]) || 99,
      description: row[1] || "",
      status: row[2] || "未完成",
      planId: row[3] || "",
      schedulePlacement: row[4] || "",
    }))
    .sort((a, b) => a.order - b.order);
  const ddlRows = parseMarkdownTable(markdown, "## DDL")
    .filter((row) => row[0] !== "截止时间")
    .map((row) => ({
      deadline: row[0] || "",
      description: row[1] || "",
    }))
    .sort((a, b) => String(a.deadline || "").localeCompare(String(b.deadline || ""), "zh-CN"));

  return {
    id: "home-index",
    path: filePath,
    todayPath: todayPlanPath,
    title: getFirstTitle(markdown),
    todayItems: todayRows,
    ddlItems: ddlRows,
    markdown: [markdown.trim(), todayMarkdown.trim()].filter(Boolean).join("\n\n"),
    html: markdownToHtml(markdown),
  };
}

function buildDailyCheckin() {
  const filePath = path.join("tasks", "daily-checkin.md");
  const absolutePath = path.join(rootDir, filePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      id: "daily-checkin",
      path: filePath,
      date: "",
      items: [],
      markdown: "",
      html: "",
    };
  }

  const markdown = read(filePath);
  const meta = parseKeyValueTable(markdown, "## 今日信息");
  const items = parseMarkdownTable(markdown, "## 打卡项")
    .filter((row) => row[0] !== "项目")
    .map((row) => ({
      title: row[0] || "",
      slot: row[1] || "",
      status: row[2] || "未完成",
    }));

  return {
    id: "daily-checkin",
    path: filePath,
    date: meta.find((item) => item.key === "日期")?.value || "",
    items,
    markdown,
    html: markdownToHtml(markdown),
  };
}

function buildCoreContribution() {
  const filePath = path.join("tasks", "today-core-contribution.md");
  const absolutePath = path.join(rootDir, filePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      id: "core-contribution",
      path: filePath,
      date: "",
      content: "",
      markdown: "",
      html: "",
    };
  }

  const markdown = read(filePath);
  const date = markdown.match(/^##\s+日期\s*\n\s*\n([^\n]+)$/m)?.[1]?.trim() || "";

  return {
    id: "core-contribution",
    path: filePath,
    date,
    content: getSectionText(markdown, "内容"),
    markdown,
    html: markdownToHtml(markdown),
  };
}

function buildTodos() {
  const dirPath = path.join(rootDir, "todos");

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return listFiles("todos")
    .filter((filePath) => {
      const base = path.basename(filePath, ".md").toLowerCase();
      return base !== "readme" && base !== "index";
    })
    .map((filePath) => {
      const markdown = read(filePath);
      const fields = parseKeyValueTable(markdown, "## 基本信息");
      const getField = (key) => fields.find((item) => item.key === key)?.value || "";
      const todoId = markdown.match(/`(todo-[^`]+)`/)?.[1] || path.basename(filePath, ".md");

      return {
        id: todoId,
        fileId: path.basename(filePath, ".md"),
        path: filePath,
        title: getFirstTitle(markdown),
        summary: getSectionText(markdown, "任务说明") || getFirstParagraph(markdown),
        dimension: getField("维度") || detectDimensions(markdown)[0],
        status: getField("状态") || "未开始",
        priority: getField("优先级") || "",
        nextStep: getField("下一步") || "",
        createdAt: getField("创建时间") || "",
        markdown,
        html: markdownToHtml(markdown),
      };
    })
    .sort((a, b) => b.fileId.localeCompare(a.fileId));
}

function syncWebData() {
  const data = {
    generatedAt: new Date().toISOString(),
    soul: buildSoul(),
    runGoal: buildRunGoalProtocol(),
    docs: buildDocs(),
    photos: buildPhotos(),
    explorations: buildExplorations(),
    dashboard: buildDashboard(),
    iterations: buildIterations(),
    schedules: buildSchedules(),
    currentFocus: buildCurrentFocus(),
    homeIndex: buildHomeIndex(),
    dailyCheckin: buildDailyCheckin(),
    coreContribution: buildCoreContribution(),
    todos: buildTodos(),
    plans: buildPlans(),
    dimensions: buildDimensions(),
    logs: buildLogs(),
  };

  const output = `window.personalTrackerData = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(outFile, output, "utf8");
  console.log(`Synced web data to ${path.relative(rootDir, outFile)}`);
  return data;
}

if (require.main === module) {
  syncWebData();
}

module.exports = {
  syncWebData,
};
