const fs = require("fs");
const { contentPath, relativeToContent } = require("./lib/runtime-paths.js");

const targetPath = contentPath("tasks", "today-core-contribution.md");

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function updateCoreContribution(payload) {
  const date = normalizeText(payload?.date);
  const content = normalizeText(payload?.content);

  if (!date) {
    throw new Error("date is required");
  }
  if (!content) {
    throw new Error("content is required");
  }

  const markdown = [
    "# 今日核心贡献",
    "",
    "## 日期",
    "",
    date,
    "",
    "## 内容",
    "",
    content,
    "",
  ].join("\n");

  fs.writeFileSync(targetPath, markdown, "utf8");

  return {
    path: relativeToContent(targetPath),
    date,
    content,
  };
}

if (require.main === module) {
  const [, , jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const updated = updateCoreContribution(payload);
    console.log(`updated ${updated.path}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  updateCoreContribution,
};
