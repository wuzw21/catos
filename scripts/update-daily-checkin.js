const fs = require("fs");
const { contentPath, relativeToContent } = require("./lib/runtime-paths.js");

const targetPath = contentPath("tasks", "daily-checkin.md");
const allowedStatuses = new Set(["未完成", "已完成"]);

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " / ")
    .replace(/\|/g, "/")
    .trim();
}

function updateDailyCheckin(payload) {
  const date = normalizeText(payload?.date);
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!date) {
    throw new Error("date is required");
  }
  if (!items.length) {
    throw new Error("items is required");
  }

  const normalizedItems = items.map((item) => {
    const status = normalizeText(item.status);
    if (!allowedStatuses.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }

    return {
      title: normalizeText(item.title),
      slot: normalizeText(item.slot),
      status,
    };
  });

  const markdown = [
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
    ...normalizedItems.map((item) => `| ${item.title} | ${item.slot} | ${item.status} |`),
    "",
  ].join("\n");

  fs.writeFileSync(targetPath, markdown, "utf8");

  return {
    path: relativeToContent(targetPath),
    date,
    items: normalizedItems,
  };
}

if (require.main === module) {
  const [, , jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const updated = updateDailyCheckin(payload);
    console.log(`updated ${updated.path}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  updateDailyCheckin,
};
