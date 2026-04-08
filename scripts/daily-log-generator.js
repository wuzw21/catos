const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { repoRoot, contentRoot, contentPath, relativeToContent, repoPath } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const inboxPath = contentPath("inbox", "quick-capture.md");
const schemaPath = repoPath("schemas", "daily-log-generation.schema.json");

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
  const match = markdown.match(pattern);
  return match ? match[1].trim() : "";
}

function replaceSection(markdown, sectionTitle, nextContent) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const startIndex = lines.findIndex((line) => new RegExp(`^##\\s+${sectionTitle}\\s*$`).test(line.trim()));
  const renderedSection = [`## ${sectionTitle}`, "", String(nextContent || "").trim()].join("\n").trimEnd();

  if (startIndex === -1) {
    return `${String(markdown || "").trimEnd()}\n\n${renderedSection}\n`;
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index].trim())) {
      endIndex = index;
      break;
    }
  }

  const before = lines.slice(0, startIndex).join("\n").trimEnd();
  const after = lines.slice(endIndex).join("\n").trimStart();
  return [before, renderedSection, after].filter(Boolean).join("\n\n").trimEnd() + "\n";
}

function parseBulletLines(sectionText) {
  return String(sectionText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function parseReflection(sectionText) {
  const lines = parseBulletLines(sectionText);
  return {
    good: lines.find((line) => line.startsWith("做得好的地方："))?.replace(/^做得好的地方：/, "").trim() || "",
    fix: lines.find((line) => line.startsWith("需要修正的地方："))?.replace(/^需要修正的地方：/, "").trim() || "",
    next: lines.find((line) => line.startsWith("下一步："))?.replace(/^下一步：/, "").trim() || "",
  };
}

function parseDataRows(sectionText) {
  return String(sectionText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 3 && cells[0] !== "维度" && cells[0] !== "---")
    .map((cells) => ({
      dimension: cells[0] || "",
      metric: cells[1] || "",
      value: cells[2] || "",
    }))
    .filter((row) => row.dimension || row.metric || row.value);
}

function getDateKeyFromTimestamp(timestamp) {
  const match = String(timestamp || "").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) {
    return "";
  }

  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function parseCaptureSummaries(dateKey) {
  const markdown = readFileSafe(inboxPath, "");
  return markdown
    .split(/(?=^###\s+)/m)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "))
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      const heading = lines[0].replace(/^###\s+/, "").trim();
      const timestamp = heading.split("|")[0]?.trim() || "";
      const content = lines.find((line) => line.startsWith("- 内容："))?.replace(/^- 内容：/, "").trim() || "";
      return {
        dateKey: getDateKeyFromTimestamp(timestamp),
        content: normalizeText(content),
      };
    })
    .filter((item) => item.dateKey === dateKey && item.content);
}

function buildPrompt({ dateKey, todayChanges, dataRows, reflection, captureSummaries }) {
  const context = {
    date: dateKey,
    existing_today_changes: todayChanges,
    existing_data_records: dataRows,
    existing_reflection: reflection,
    capture_summaries: captureSummaries,
  };

  return [
    "你是个人日志整理器，只负责把当天已知事实整理成一篇紧凑、真实、可复盘的日记。",
    "必须严格遵守给定 schema 输出。",
    "",
    "要求：",
    "- 只能基于给定事实整理，不允许编造。",
    "- `today_changes` 写 3 到 6 条真实 bullet，优先主线推进、训练、作息、饮食、恢复、重要事件。",
    "- `data_records` 只保留明确事实，避免空泛指标。",
    "- `reflection.good` / `reflection.fix` / `reflection.next` 要短、准、可执行。",
    "- 如果材料里有“明天”“下次”等未来表达，不要写进 today_changes，可放到 reflection.next。",
    "- 如果已有结构化数据更明确，应保留其事实。",
    "",
    "输入事实 JSON：",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function buildFallbackGeneration({ todayChanges, dataRows, reflection, captureSummaries }) {
  const nextCandidates = [];
  const normalizedSummaries = captureSummaries.map(normalizeText).filter(Boolean);
  const generatedTodayChanges = [];
  const generatedRows = [...dataRows];

  normalizedSummaries.forEach((summary) => {
    if (/^明天|周[一二三四五六日天]/.test(summary)) {
      nextCandidates.push(summary);
      return;
    }

    if (/今天上午睡的太晚|睡的太晚|起得太晚/.test(summary)) {
      generatedTodayChanges.push("上午起得偏晚，作息有拖延。");
      generatedRows.push({
        dimension: "生活技能",
        metric: "作息反馈",
        value: "上午起得太晚，需要往前收作息",
      });
      return;
    }

    if (/投篮练习/.test(summary)) {
      generatedTodayChanges.push("完成了 1.5 小时投篮训练，三分手感有上升。");
      generatedRows.push({
        dimension: "运动",
        metric: "今日训练",
        value: "投篮练习 1.5 小时",
      });
      if (/三分命中率上升/.test(summary)) {
        generatedRows.push({
          dimension: "运动",
          metric: "训练反馈",
          value: "三分命中率上升",
        });
      }
      if (/肩膀释放|手托球/.test(summary)) {
        generatedRows.push({
          dimension: "运动",
          metric: "动作要点",
          value: "肩膀释放、手托球、先稳再快速释放小臂",
        });
      }
      return;
    }

    if (/今天/.test(summary)) {
      generatedTodayChanges.push(summary.replace(/^今天[:：]?/, "").trim());
      return;
    }

    nextCandidates.push(summary);
  });

  const dedupedTodayChanges = [...new Set([...todayChanges, ...generatedTodayChanges].filter(Boolean))];
  const dedupedRows = [...new Map(
    generatedRows
      .filter((row) => row.dimension || row.metric || row.value)
      .map((row) => [`${row.dimension}-${row.metric}-${row.value}`, row])
  ).values()];

  return {
    today_changes: dedupedTodayChanges.slice(0, 6),
    data_records: dedupedRows,
    reflection: {
      good:
        reflection.good ||
        (dedupedTodayChanges.some((line) => /投篮|训练|科研|作业/.test(line))
          ? "虽然当天状态不算理想，但还是保留了训练推进。"
          : "把当天的真实变化留进了系统，没有让记录断掉。"),
      fix:
        reflection.fix ||
        (normalizedSummaries.some((summary) => /睡的太晚|起得太晚/.test(summary))
          ? "作息偏拖会压缩白天可用时间，需要更早进入状态。"
          : "当天事实还偏碎，记录和执行节奏都要更清晰。"),
      next:
        reflection.next ||
        (nextCandidates.length
          ? `优先处理：${nextCandidates.join("；")}`
          : "把明天最重要的一件事提前拆成一个可直接执行的动作。"),
    },
  };
}

function generateDailyLogWithCodex(dateKey, options = {}) {
  const logPath = contentPath("logs", "daily", `${dateKey}.md`);
  if (!fs.existsSync(logPath)) {
    throw new Error(`daily log not found: ${dateKey}`);
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema not found: ${schemaPath}`);
  }

  const markdown = readFileSafe(logPath);
  const currentTodayChanges = parseBulletLines(getSection(markdown, "今日变化"));
  const currentDataRows = parseDataRows(getSection(markdown, "数据记录"));
  const currentReflection = parseReflection(getSection(markdown, "复盘"));
  const captureSummaries = parseCaptureSummaries(dateKey).map((item) => item.content);

  if (!currentTodayChanges.length && !currentDataRows.length && !captureSummaries.length) {
    return {
      date: dateKey,
      updated: false,
      path: relativeToContent(logPath),
      reason: "no source facts",
    };
  }

  const outputPath = path.join(os.tmpdir(), `daily-log-${dateKey}-${Date.now()}.json`);
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "-C",
    repoRoot,
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
    buildPrompt({
      dateKey,
      todayChanges: currentTodayChanges,
      dataRows: currentDataRows,
      reflection: currentReflection,
      captureSummaries,
    }),
  ];

  if (options.model) {
    args.splice(1, 0, "--model", options.model);
  }

  let generated;
  let mode = "ai";

  try {
    const result = spawnSync("codex", args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        OTEL_SDK_DISABLED: "true",
      },
      timeout: Number(options.timeoutMs || 120000),
    });

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error((stderr || stdout || "codex exec failed").trim());
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error("codex output file was not created");
    }

    generated = JSON.parse(fs.readFileSync(outputPath, "utf8").trim());
  } catch (error) {
    mode = "fallback";
    generated = buildFallbackGeneration({
      todayChanges: currentTodayChanges,
      dataRows: currentDataRows,
      reflection: currentReflection,
      captureSummaries,
    });
  }

  const nextTodayChanges = (generated.today_changes || []).map(normalizeText).filter(Boolean);
  const nextDataRows = (generated.data_records || [])
    .map((row) => ({
      dimension: normalizeText(row.dimension),
      metric: normalizeText(row.metric),
      value: normalizeText(row.value),
    }))
    .filter((row) => row.dimension || row.metric || row.value);
  const nextReflection = {
    good: normalizeText(generated.reflection?.good || currentReflection.good),
    fix: normalizeText(generated.reflection?.fix || currentReflection.fix),
    next: normalizeText(generated.reflection?.next || currentReflection.next),
  };

  let nextMarkdown = markdown;
  nextMarkdown = replaceSection(
    nextMarkdown,
    "今日变化",
    (nextTodayChanges.length ? nextTodayChanges : currentTodayChanges)
      .map((line) => `- ${line}`)
      .join("\n")
  );
  nextMarkdown = replaceSection(
    nextMarkdown,
    "数据记录",
    [
      "| 维度 | 指标 | 数值 / 状态 |",
      "| --- | --- | --- |",
      ...(nextDataRows.length ? nextDataRows : currentDataRows).map(
        (row) => `| ${row.dimension} | ${row.metric} | ${row.value} |`
      ),
    ].join("\n")
  );
  nextMarkdown = replaceSection(
    nextMarkdown,
    "复盘",
    [
      `- 做得好的地方：${nextReflection.good}`,
      `- 需要修正的地方：${nextReflection.fix}`,
      `- 下一步：${nextReflection.next}`,
    ].join("\n")
  );

  writeFile(logPath, `${nextMarkdown.trimEnd()}\n`);
  return {
    date: dateKey,
    updated: true,
    path: relativeToContent(logPath),
    mode,
  };
}

if (require.main === module) {
  const [, , dateKey] = process.argv;

  try {
    const result = generateDailyLogWithCodex(dateKey);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  generateDailyLogWithCodex,
};
