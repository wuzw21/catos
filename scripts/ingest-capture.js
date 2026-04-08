const fs = require("fs");
const path = require("path");
const { dimensionDefinitions } = require("../config/dimension-keywords.js");
const { contentRoot, contentPath, relativeToContent } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const inboxPath = contentPath("inbox", "quick-capture.md");
const photosDir = contentPath("photos");

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " / ")
    .replace(/\|/g, "/")
    .trim();
}

function detectDimension(text) {
  const normalized = normalizeText(text).toLowerCase();
  const matched = dimensionDefinitions.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  );
  return matched?.label || "日常杂项";
}

function detectCategory(type, value) {
  if (type === "photo") return "照片";
  if (type === "text") return "文字";

  const normalized = value.toLowerCase();
  if (normalized.includes("xiaohongshu.com")) return "小红书链接";
  if (normalized.includes("bilibili.com")) return "B站链接";
  if (normalized.includes("douyin.com")) return "抖音链接";
  return "URL";
}

function savePhoto(file) {
  if (!file?.dataUrl || !file?.name) {
    throw new Error("photo file is required");
  }

  const match = file.dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("invalid photo payload");
  }

  const extension = path.extname(file.name) || ".png";
  const fileName = `capture-${Date.now()}${extension.toLowerCase()}`;
  const targetPath = path.join(photosDir, fileName);
  fs.writeFileSync(targetPath, Buffer.from(match[2], "base64"));
  return relativeToContent(targetPath);
}

function prependEntry(markdown, entry) {
  const marker = "## 最近记录";
  if (!markdown.includes(marker)) {
    return `${markdown.trim()}\n\n## 最近记录\n\n${entry}\n`;
  }
  return markdown.replace(marker, `${marker}\n\n${entry}`);
}

function ingestCapture(payload) {
  const explicitType = normalizeText(payload?.type).toLowerCase();
  const note = normalizeText(payload?.note);
  const url = normalizeText(payload?.url);
  const text = normalizeText(payload?.text);
  const hasPhoto = Boolean(payload?.file?.dataUrl && payload?.file?.name);
  const type = hasPhoto ? "photo" : url ? "url" : text ? "text" : explicitType;

  if (!["photo", "text", "url"].includes(type)) {
    throw new Error("type must be photo, text, or url");
  }

  let target = "";
  let summary = "";

  if (type === "photo") {
    target = savePhoto(payload.file);
    summary = text || note || target;
  } else if (type === "url") {
    if (!url) throw new Error("url is required");
    target = url;
    summary = text || note || url;
  } else {
    if (!text) throw new Error("text is required");
    target = text;
    summary = text;
  }

  const dimension = detectDimension(`${summary} ${note}`);
  const category = detectCategory(type, target);
  const timestamp = new Date().toLocaleString("zh-CN", { hour12: false });
  const entry = [
    `### ${timestamp} | ${category} | ${dimension}`,
    "",
    `- 归类：${dimension}`,
    `- 内容：${summary}`,
    `- 保存：${target}`,
    type === "photo" && text ? `- 文字：${text}` : "",
    note ? `- 备注：${note}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const current = fs.existsSync(inboxPath) ? fs.readFileSync(inboxPath, "utf8") : "# 快速收集\n";
  fs.writeFileSync(inboxPath, prependEntry(current, entry), "utf8");

  return {
    path: relativeToContent(inboxPath),
    type,
    category,
    dimension,
    target,
    summary,
  };
}

if (require.main === module) {
  const [, , jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const result = ingestCapture(payload);
    console.log(`ingested -> ${result.path}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  ingestCapture,
};
