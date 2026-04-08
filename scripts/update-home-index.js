const fs = require("fs");
const path = require("path");
const { contentRoot, contentPath, relativeToContent } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const homeIndexPath = contentPath("tasks", "home-index.md");
const todayPlanPath = contentPath("tasks", "today-plan.md");

function createPlanId() {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " / ")
    .replace(/\|/g, "/")
    .trim();
}

function buildTable(header, rows) {
  const headerLine = `| ${header.join(" | ")} |`;
  const dividerLine = `| ${header.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, dividerLine, ...rowLines].join("\n");
}

function buildOptionalTable(header, rows) {
  return rows.length ? buildTable(header, rows) : "";
}

function sortDdlItems(items) {
  return [...(items || [])].sort((a, b) => {
    const left = String(a?.deadline || "");
    const right = String(b?.deadline || "");
    return left.localeCompare(right, "zh-CN");
  });
}

function parseTableRows(sectionMarkdown) {
  return sectionMarkdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter(
      (cells) =>
        cells.length &&
        !cells.every((cell) => /^-+$/.test(cell.replace(/\s/g, ""))) &&
        !["排序", "日期", "截止时间"].includes(cells[0])
    );
}

function readCurrentHomeIndex() {
  const homeMarkdown = fs.existsSync(homeIndexPath) ? fs.readFileSync(homeIndexPath, "utf8") : "";
  const todayMarkdown = fs.existsSync(todayPlanPath) ? fs.readFileSync(todayPlanPath, "utf8") : "";
  const homeSections = homeMarkdown
    .split(/^##\s+/m)
    .slice(1)
    .map((block) => {
      const lines = block.split("\n");
      return {
        title: lines[0].trim(),
        body: lines.slice(1).join("\n").trim(),
      };
    });
  const ddlSection = homeSections.find((section) => section.title === "DDL");

  return {
    todayItems: parseTableRows(todayMarkdown).map((row, index) => ({
      order: Number(row[0]) || index + 1,
      description: row[1] || "",
      status: row[2] || "未完成",
      planId: row[3] || "",
      schedulePlacement: row[4] || "",
    })),
    ddlItems: sortDdlItems(
      parseTableRows(ddlSection?.body || "").map((row, index) => ({
        deadline: row[0] || "",
        description: row[1] || "",
      }))
    ),
  };
}

function updateHomeIndex(payload) {
  const current = readCurrentHomeIndex();
  const todayItems = (Array.isArray(payload?.todayItems) ? payload.todayItems : current.todayItems).map((item, index) => ({
    order: Number(item?.order) || index + 1,
    description: normalizeText(item?.description),
    status: normalizeText(item?.status || "未完成"),
    planId: normalizeText(item?.planId) || createPlanId(),
    schedulePlacement: normalizeText(item?.schedulePlacement || ""),
  }));
  const ddlItems = sortDdlItems(Array.isArray(payload?.ddlItems) ? payload.ddlItems : current.ddlItems);

  const todayRows = todayItems.map((item, index) => [
    String(index + 1),
    item.description,
    item.status,
    item.planId,
    item.schedulePlacement,
  ]);
  const ddlRows = ddlItems.map((item, index) => [
    normalizeText(item.deadline || ""),
    normalizeText(item.description),
  ]);

  const homeMarkdown = [
    "# 首页索引",
    "",
    "## DDL",
    "",
    buildTable(["截止时间", "事项"], ddlRows),
    "",
  ].join("\n");
  const todayMarkdown = [
    "# 日计划",
    "",
    buildOptionalTable(["排序", "描述", "状态", "计划ID", "日程落位"], todayRows),
    "",
  ].join("\n");

  fs.writeFileSync(homeIndexPath, homeMarkdown, "utf8");
  fs.writeFileSync(todayPlanPath, todayMarkdown, "utf8");

  return {
    path: relativeToContent(homeIndexPath),
    todayPath: relativeToContent(todayPlanPath),
    todayItems: todayItems.map((item, index) => ({
      order: index + 1,
      description: item.description,
      status: item.status,
      planId: item.planId,
      schedulePlacement: item.schedulePlacement,
    })),
    ddlItems: ddlItems.map((item, index) => ({
      deadline: normalizeText(item.deadline || ""),
      description: normalizeText(item.description),
    })),
  };
}

if (require.main === module) {
  const [, , jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const updated = updateHomeIndex(payload);
    console.log(`updated ${updated.path}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  readCurrentHomeIndex,
  updateHomeIndex,
};
