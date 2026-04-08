const fs = require("fs");
const path = require("path");
const { repoRoot } = require("./lib/runtime-paths.js");

const dimensionDirSpecs = [
  { id: "01-daily-misc", title: "日常杂项" },
  { id: "02-life", title: "生活技能" },
  { id: "03-research", title: "科研" },
  { id: "04-learning", title: "学习" },
  { id: "05-fitness", title: "运动" },
  { id: "06-art", title: "艺术" },
  { id: "07-finance", title: "理财" },
  { id: "08-appearance", title: "外貌" },
];

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeIfMissing(targetPath, content) {
  ensureDir(path.dirname(targetPath));
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, content, "utf8");
  }
}

function copyIfMissing(fromPath, toPath) {
  ensureDir(path.dirname(toPath));
  if (!fs.existsSync(toPath)) {
    fs.copyFileSync(fromPath, toPath);
  }
}

function buildWeeklySchedule() {
  return [
    "# 每周日程",
    "",
    "## 当前周 | 请开始记录本周安排",
    "",
    "### 周一",
    "",
    "起床：",
    "日程：",
    "睡觉：",
    "完成事项：",
    "",
    "### 周二",
    "",
    "起床：",
    "日程：",
    "睡觉：",
    "完成事项：",
    "",
    "### 周三",
    "",
    "起床：",
    "日程：",
    "睡觉：",
    "完成事项：",
    "",
    "### 周四",
    "",
    "起床：",
    "日程：",
    "睡觉：",
    "完成事项：",
    "",
    "### 周五",
    "",
    "起床：",
    "日程：",
    "睡觉：",
    "完成事项：",
    "",
    "### 周六",
    "",
    "起床：",
    "日程：",
    "睡觉：",
    "完成事项：",
    "",
    "### 周日",
    "",
    "起床：",
    "日程：",
    "睡觉：",
    "完成事项：",
    "",
  ].join("\n");
}

function initContentRoot(targetRoot) {
  const resolvedRoot = path.resolve(repoRoot, targetRoot || "content.example");

  [
    "assets",
    "explorations",
    "inbox",
    "iterations",
    "lists",
    "logs/daily",
    "logs/weekly",
    "logs/monthly",
    "logs/yearly",
    "metrics",
    "notes",
    "photos",
    "plans",
    "private",
    "profile",
    "schedules",
    "tasks",
    "todos",
    "workflows",
  ].forEach((dirPath) => ensureDir(path.join(resolvedRoot, dirPath)));

  dimensionDirSpecs.forEach((spec) => {
    const base = path.join(resolvedRoot, "dimensions", spec.id);
    ensureDir(base);
    writeIfMissing(
      path.join(base, "index.md"),
      `# ${spec.title}\n\n这里先留空。等你有第一条真实变化时，再开始维护这个方向。\n`
    );
    writeIfMissing(
      path.join(base, "goals.md"),
      [
        `# ${spec.title}目标`,
        "",
        `## G-01 ${spec.title}基础目标`,
        "",
        "| 字段 | 内容 |",
        "| --- | --- |",
        "| 内容 | 请先记录这个维度里你最重要的一个目标 |",
        "| 重要性 | 中 |",
        "| 投入成本 | 时间优先 |",
        "| 发生时间 | 长期 |",
        "| 频率 | 每周 |",
        "| 和谁完成 | 独自 |",
        "| 进度条 | `[----------] 0%` |",
        "| 当前状态 | 尚未开始记录 |",
        "| 最近变化 | 还没有第一条真实变化 |",
        "| 下一步行动 | 请先补第一条真实目标 |",
        "",
      ].join("\n")
    );
    writeIfMissing(
      path.join(base, "changes.md"),
      `# ${spec.title}变化记录\n\n- 这里还没有内容。请先记录第一条真实变化。\n`
    );
  });

  writeIfMissing(
    path.join(resolvedRoot, "soul.md"),
    [
      "# Soul",
      "",
      "## 基本身份",
      "",
      "| 项目 | 内容 |",
      "| --- | --- |",
      "| 性别 | 待补充 |",
      "| 年龄 | 待补充 |",
      "| 学历阶段 | 待补充 |",
      "| 核心身份 | 待补充 |",
      "| 研究方向 | 待补充 |",
      "| 计划周期 | 待补充 |",
      "| 当前体重 | 待补充 |",
      "| 当前体脂率 | 待补充 |",
      "| 当前存款 | 待补充 |",
      "",
      "## 当前阶段定义",
      "",
      "这里还没有内容。请先记录你的基本身份、当前阶段和接下来一年的主线。",
      "",
      "## 当前年度关键词",
      "",
      "- 请先补一个关键词",
      "",
    ].join("\n")
  );

  writeIfMissing(
    path.join(resolvedRoot, "profile", "personal-info.md"),
    "# 个人信息\n\n## 当前信息\n\n| 字段 | 内容 |\n| --- | --- |\n| 姓名 / 昵称 | 待补充 |\n| 年龄 | 待补充 |\n| 当前阶段 | 待补充 |\n| 备注 | 这里还没有内容，请先补最基本的个人信息 |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "profile", "interpersonal.md"),
    "# 人际关系\n\n- 这里还没有内容。以后可以维护重要人物、合作关系和支持网络。\n"
  );

  writeIfMissing(
    path.join(resolvedRoot, "private", "cat-100-things.md"),
    "# 和猫的 Shining Time\n\n## 页面说明\n\n这里记录值得反复回看的高光活动。\n\n## Shining Time\n\n| 编号 | 活动 | 日期 | 状态 | 备注 |\n| --- | --- | --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "private", "cat-food-fun-index.md"),
    "# 和猫的饮食 / 玩乐索引\n\n| 日期 | 类型 | 内容 | 备注 |\n| --- | --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "private", "cat-little-things.md"),
    "# 和猫的日常小事\n\n| 日期 | 小事 | 类型 | 状态 | 备注 |\n| --- | --- | --- | --- | --- |\n"
  );

  writeIfMissing(
    path.join(resolvedRoot, "lists", "personal-list.md"),
    "# 个人列表\n\n- 这里还没有内容。以后放重要但不适合进 Todo 的长期列表。\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "lists", "purchase-asset-hub.md"),
    "# 购买 / 资产入口\n\n- 当前购买统一入口：`todos/2026-04-06-purchase-master.md`\n- 已拥有资产：`assets/asset-register.md`\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "lists", "purchase-list.md"),
    "# 购买清单（已并入购买总表）\n\n- 以后所有购买事项只维护 `购买总表` 一个入口。\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "lists", "wardrobe.md"),
    "# 衣柜与妆台\n\n## 上装\n\n| 名称 | 风格 / 颜色 | 场景 | 当前状态 | 备注 |\n| --- | --- | --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "lists", "memorial-days.md"),
    "# 纪念日\n\n| 日期 | 事项 | 备注 |\n| --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "lists", "deadlines.md"),
    "# DDL 索引\n\n| 截止时间 | 事项 | 状态 |\n| --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "lists", "want-to-do.md"),
    "# 想做的事\n\n| 分类 | 想做的事 | 状态 | 备注 |\n| --- | --- | --- | --- |\n"
  );

  writeIfMissing(
    path.join(resolvedRoot, "assets", "asset-register.md"),
    "# 资产总表\n\n## 当前已入库资产\n\n| 名称 | 八维归属 | 类型 | 当前估值 / 金额 | 状态 | 使用频率 | 备注 |\n| --- | --- | --- | --- | --- | --- | --- |\n"
  );

  writeIfMissing(
    path.join(resolvedRoot, "inbox", "quick-capture.md"),
    "# 快速收集\n\n## 最近记录\n"
  );

  writeIfMissing(
    path.join(resolvedRoot, "schedules", "daily-schedule.md"),
    "# 日程说明\n\n- 这里还没有具体安排。\n- 日程页主要查看 `weekly-schedule.md`。\n"
  );
  writeIfMissing(path.join(resolvedRoot, "schedules", "weekly-schedule.md"), buildWeeklySchedule());

  writeIfMissing(
    path.join(resolvedRoot, "metrics", "change-dashboard.md"),
    "# 变化面板\n\n## 核心指标\n\n| 维度 | 指标 | 起点 | 当前 | 目标 | 截止时间 | 增量 | 证据 | 下一步 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
  );

  writeIfMissing(
    path.join(resolvedRoot, "tasks", "home-index.md"),
    "# 首页索引\n\n## DDL\n\n| 截止时间 | 事项 |\n| --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "tasks", "today-plan.md"),
    "# 日计划\n\n| 排序 | 描述 | 状态 | 计划ID | 日程落位 |\n| --- | --- | --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "tasks", "daily-checkin.md"),
    "# 每天打卡\n\n## 今日信息\n\n| 字段 | 内容 |\n| --- | --- |\n| 日期 |  |\n\n## 打卡项\n\n| 项目 | 时段 | 状态 |\n| --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "tasks", "today-core-contribution.md"),
    "# 今日核心贡献\n\n## 日期\n\n\n## 内容\n\n\n"
  );
  writeIfMissing(path.join(resolvedRoot, "tasks", "current-focus.md"), "# 当前聚焦\n");

  writeIfMissing(path.join(resolvedRoot, "plans", "daily.md"), "# 日计划\n\n## 今日\n\n- 这里还没有内容。请先记录今天最重要的一件事。\n");
  writeIfMissing(path.join(resolvedRoot, "plans", "weekly.md"), "# 周计划\n\n## 本周\n\n- 这里还没有内容。请先记录这周最重要的一件事。\n");
  writeIfMissing(path.join(resolvedRoot, "plans", "monthly.md"), "# 月计划\n\n## 本月\n\n- 这里还没有内容。请先记录这个月的主线。\n");
  writeIfMissing(path.join(resolvedRoot, "plans", "yearly.md"), "# 年计划\n\n## 本年\n\n- 这里还没有内容。请先记录这一年的主线。\n");

  writeIfMissing(
    path.join(resolvedRoot, "todos", "README.md"),
    "# Todos\n\n这里是待办目录。\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "todos", "index.md"),
    "# Todo 索引\n\n| Todo ID | 标题 | 维度 | 状态 | 文件 |\n| --- | --- | --- | --- | --- |\n"
  );
  writeIfMissing(
    path.join(resolvedRoot, "todos", "2026-04-06-purchase-master.md"),
    [
      "# 购买总表",
      "",
      "## Todo ID",
      "",
      "`todo-2026-04-06-purchase-master`",
      "",
      "## 基本信息",
      "",
      "| 字段 | 内容 |",
      "| --- | --- |",
      "| 标题 | 购买总表 |",
      "| 维度 | 生活技能 |",
      "| 类型 | 待办 |",
      "| 状态 | 进行中 |",
      "| 创建时间 | 2026-04-06 |",
      "| 优先级 | 中 |",
      "| 下一步 | 补第一条真实购买计划 |",
      "",
      "## 任务说明",
      "",
      "- 这是购买类输入的统一入口。",
      "",
      "## 当前购买项目",
      "",
      "| 项目 | 类别 | 用途 | 对象 | 当前状态 | 下一步 / 备注 |",
      "| --- | --- | --- | --- | --- | --- |",
      "",
    ].join("\n")
  );

  [
    "workflows/archive.md",
    "workflows/asset.md",
    "workflows/daily-log-generation-skill.md",
    "workflows/eat.md",
    "workflows/finish.md",
    "workflows/home-and-capture-routing-skill.md",
    "workflows/input-rules.md",
    "workflows/mood.md",
    "workflows/research.md",
    "workflows/routing-map.md",
    "workflows/run-goal.md",
    "workflows/sleep.md",
    "workflows/spend.md",
    "workflows/todo.md",
    "workflows/train.md",
    "workflows/wake.md",
    "notes/change-model.md",
    "notes/external-guides.md",
    "notes/fat-loss-calorie-control.md",
    "notes/research-keyword-lexicon.md",
  ].forEach((repoRelativePath) => {
    copyIfMissing(path.join(repoRoot, repoRelativePath), path.join(resolvedRoot, repoRelativePath));
  });

  return resolvedRoot;
}

if (require.main === module) {
  const targetRoot = process.argv[2] || "content.example";
  const resolvedRoot = initContentRoot(targetRoot);
  console.log(`initialized content root at ${resolvedRoot}`);
}

module.exports = {
  initContentRoot,
};
