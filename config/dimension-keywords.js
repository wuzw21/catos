const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");

const baseDimensionDefinitions = [
  {
    id: "01-daily-misc",
    label: "日常杂项",
    keywords: ["日常杂项", "系统", "日志", "计划", "日程", "待办", "清理", "收件", "维护", "复盘", "回顾", "前端", "页面"],
  },
  {
    id: "02-life",
    label: "生活技能",
    keywords: ["生活技能", "生活", "作息", "饮食", "睡眠", "桌搭", "环境", "做饭", "社交", "精力", "规律", "踏青", "约会", "礼物"],
  },
  {
    id: "03-research",
    label: "科研",
    keywords: ["科研", "研究", "论文", "实验", "顶会", "写作", "导师", "组会", "ai"],
  },
  {
    id: "04-learning",
    label: "学习",
    keywords: ["学习", "课程", "知识", "工具学习", "专题", "笔记", "输入", "上课", "作业", "考试", "复习", "教材"],
  },
  {
    id: "05-fitness",
    label: "运动",
    keywords: ["运动", "健身", "训练", "体脂", "体重", "卧推", "深蹲", "硬拉", "引体", "恢复", "核心", "步频", "篮球", "足球", "羽毛球"],
  },
  {
    id: "06-art",
    label: "艺术",
    keywords: ["艺术", "音乐", "摄影", "设计", "视觉", "审美", "唱歌", "钢琴", "拍照", "专辑"],
  },
  {
    id: "07-finance",
    label: "理财",
    keywords: ["理财", "记账", "存款", "投资", "量化", "预算", "储蓄", "消费"],
  },
  {
    id: "08-appearance",
    label: "外貌",
    keywords: ["外貌", "护肤", "穿搭", "发型", "仪态", "气质", "痘", "整洁"],
  },
];

const dimensionRuleFiles = {
  科研: path.join(rootDir, "dimensions", "03-research", "rules.md"),
  学习: path.join(rootDir, "dimensions", "04-learning", "rules.md"),
};

function extractKeywordBullets(markdown) {
  const match = String(markdown || "").match(/^##\s+关键词词库\s*$\n([\s\S]*?)(?=\n##\s+|$)/m);
  const section = match ? match[1] : "";
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean)
    .flatMap((line) => line.split(/[，,]/).map((item) => item.trim()).filter(Boolean));
}

function buildDimensionDefinitions() {
  return baseDimensionDefinitions.map((definition) => {
    const rulePath = dimensionRuleFiles[definition.label];
    if (!rulePath || !fs.existsSync(rulePath)) {
      return definition;
    }

    const extraKeywords = extractKeywordBullets(fs.readFileSync(rulePath, "utf8"));
    return {
      ...definition,
      keywords: [...new Set([...definition.keywords, ...extraKeywords])],
    };
  });
}

const dimensionDefinitions = buildDimensionDefinitions();

module.exports = {
  dimensionDefinitions,
};
