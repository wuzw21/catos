const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { repoRoot, repoPath } = require("./lib/runtime-paths.js");

const schemaPath = repoPath("schemas", "codex-capture-routing.schema.json");

function buildPrompt(text) {
  return [
    "你是个人系统归档路由器，只负责判断一条随手记经验是否应该沉淀到行动领域 markdown。",
    "你的输出必须严格遵守给定 schema。",
    "",
    "可选领域：",
    "- basketball: 篮球、投篮、三分、防守、脚步、接球投",
    "- football: 足球、长传、左后卫、中卫、步频、出球",
    "- badminton: 羽毛球",
    "- fitness: 健身、力量、卧推、深蹲、硬拉、引体、核心、恢复",
    "- skincare: 护肤、痘、皮肤",
    "- diet: 饮食、热量、蛋白质、外食、宵夜、减脂餐、健身餐",
    "",
    "可选 section：",
    "- recent_changes: 今天的真实变化、训练结果、阶段推进",
    "- current_problems: 当前暴露的问题、卡点、短板",
    "- insights: 经验、技巧、动作要点、方法总结",
    "- next_step: 下一次该怎么练、下一步具体动作",
    "- ignore: 不应该写入行动领域",
    "",
    "判断原则：",
    "- 如果内容明显是动作经验，例如“投篮：肩膀对准+释放”，通常属于 insights。",
    "- 如果内容只是泛泛感受，没有长期沉淀价值，则 ignore。",
    "- markdown_bullet 必须是可以直接写进 markdown 的单行 bullet 内容，不要带日期。",
    "- title 用极短短语概括这条内容。",
    "- summary 用一句中文概括。",
    "- achievement_candidate 用一句更像“成就栏标题”的中文短句概括这条内容；只有在内容真的值得回看时才填写，否则返回空字符串。",
    "",
    `输入内容：${String(text || "").trim()}`
  ].join("\n");
}

function routeCaptureWithCodex(text, options = {}) {
  const input = String(text || "").trim();
  if (!input) {
    throw new Error("text is required");
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema not found: ${schemaPath}`);
  }

  const outputPath = path.join(os.tmpdir(), `codex-capture-route-${Date.now()}.json`);
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
    buildPrompt(input),
  ];

  if (options.model) {
    args.splice(1, 0, "--model", options.model);
  }

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

  const raw = fs.readFileSync(outputPath, "utf8").trim();
  if (!raw) {
    throw new Error("codex returned empty structured output");
  }

  return JSON.parse(raw);
}

if (require.main === module) {
  const text = process.argv.slice(2).join(" ").trim();

  try {
    const result = routeCaptureWithCodex(text);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  routeCaptureWithCodex,
};
