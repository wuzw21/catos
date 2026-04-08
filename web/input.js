const inputTitle = document.querySelector("#input-title");
const inputContent = document.querySelector("#input-content");
const generatePromptButton = document.querySelector("#generate-prompt");
const copyPromptButton = document.querySelector("#copy-prompt");
const clearInputButton = document.querySelector("#clear-input");
const inputOutput = document.querySelector("#input-output");
const inputStatus = document.querySelector("#input-status");
const protocolGrid = document.querySelector("#protocol-grid");
const protocolTabs = document.querySelector("#protocol-tabs");
const storageKey = "personal-evolution-os-input";
let activeProtocol = "run-goal";

const protocols = [
  {
    id: "run-goal",
    label: "run goal",
    titlePlaceholder: "例如：四月科研安排 / 春天拍照计划 / 健身卡住了",
    contentPlaceholder: "把你现在的现状、想法、困惑、目标写进来。",
    summary: "讨论一个目标，先分析，再决定怎么做。",
    buildPrompt: (title, content) =>
      `run goal: ${title || "请帮我分析这个想法"}\n\n我的内容：\n${content || "待补充"}\n\n请你不要直接让我执行，而是先分析：\n1. 这件事真正的目标是什么\n2. 现在做是否合适\n3. 有哪些风险和更优路径\n4. 下一步最小动作是什么`,
  },
  {
    id: "todo",
    label: "todo",
    titlePlaceholder: "例如：补周计划 / 订球场 / 整理科研待办",
    contentPlaceholder: "写清楚要做什么，越具体越好。",
    summary: "记录一个待办，并自动判断层级和维度。",
    buildPrompt: (title, content) => `todo: ${title || content || "待补充待办"}`,
  },
  {
    id: "finish",
    label: "finish",
    titlePlaceholder: "例如：统计学习作业完成 / 做完胸推训练",
    contentPlaceholder: "补充完成了什么、有什么结果。",
    summary: "记录一件完成的事情，自动归档到日志和周志。",
    buildPrompt: (title, content) => `finish: ${title || content || "待补充完成事项"}`,
  },
  {
    id: "research",
    label: "research",
    titlePlaceholder: "例如：春天拍照 / 记账 app / 羽毛球训练方法",
    contentPlaceholder: "写清楚你想探索什么，以及探索目标。",
    summary: "发起一次网络探索，产出简明结论。",
    buildPrompt: (title, content) => `research: ${title || "待补充探索主题"}\n\n补充说明：\n${content || "待补充"}`,
  },
  {
    id: "archive",
    label: "archive",
    titlePlaceholder: "例如：归档今天的随手记 / 归档 4 月 6 日记录",
    contentPlaceholder: "可补充你特别希望联动到哪些地方，例如 Todo、日记、和猫、购买总表。",
    summary: "把随手记整理进 Todo、领域、日志和相关索引。",
    buildPrompt: (title, content) => `archive: ${title || "归档今天的随手记"}\n\n补充要求：\n${content || "请自动联动 Todo、领域、日记和相关索引。"}`,
  },
  {
    id: "eat",
    label: "eat",
    titlePlaceholder: "例如：晚饭 / 宵夜 / 午餐",
    contentPlaceholder: "写你吃了什么、多少、什么时候吃。",
    summary: "记录饮食，并尽量估热量和蛋白质。",
    buildPrompt: (title, content) => `eat: ${[title, content].filter(Boolean).join("，") || "待补充饮食记录"}`,
  },
  {
    id: "train",
    label: "train",
    titlePlaceholder: "例如：羽毛球 / 胸推训练 / 核心",
    contentPlaceholder: "写训练类型、时长、强度、组数或备注。",
    summary: "记录训练、运动或恢复活动。",
    buildPrompt: (title, content) => `train: ${[title, content].filter(Boolean).join("，") || "待补充训练记录"}`,
  },
  {
    id: "spend",
    label: "spend",
    titlePlaceholder: "例如：午饭 32 元 / 盒马 45 元",
    contentPlaceholder: "写金额、用途、是否必要。",
    summary: "记录一笔支出，并自动分类。",
    buildPrompt: (title, content) => `spend: ${[title, content].filter(Boolean).join("，") || "待补充支出记录"}`,
  },
  {
    id: "mood",
    label: "mood",
    titlePlaceholder: "例如：今天有点烦 / 状态不错",
    contentPlaceholder: "写情绪、精力和诱因。",
    summary: "记录情绪和精力状态。",
    buildPrompt: (title, content) => `mood: ${[title, content].filter(Boolean).join("，") || "待补充状态记录"}`,
  },
  {
    id: "sleep",
    label: "sleep",
    titlePlaceholder: "例如：1:30",
    contentPlaceholder: "可补充睡前做了什么。",
    summary: "记录入睡时间。",
    buildPrompt: (title, content) => `sleep: ${title || content || "待补充"}`,
  },
  {
    id: "wake",
    label: "wake",
    titlePlaceholder: "例如：11:30",
    contentPlaceholder: "可补充起床后的状态。",
    summary: "记录起床时间。",
    buildPrompt: (title, content) => `wake: ${title || content || "待补充"}`,
  },
];

function getActiveProtocol() {
  return protocols.find((item) => item.id === activeProtocol) || protocols[0];
}

function buildPrompt() {
  const title = inputTitle.value.trim();
  const content = inputContent.value.trim();
  const protocol = getActiveProtocol();
  const prompt = protocol.buildPrompt(title, content);
  inputOutput.textContent = prompt;
}

function renderProtocols() {
  protocolGrid.innerHTML = "";
  protocolTabs.innerHTML = "";

  protocols.forEach((protocol) => {
    const card = document.createElement("article");
    card.className = `protocol-card${protocol.id === activeProtocol ? " is-active" : ""}`;
    card.innerHTML = `
      <div class="card-topline">
        <h3>${protocol.label}</h3>
        <span class="tag">Rule</span>
      </div>
      <p>${protocol.summary}</p>
    `;
    card.addEventListener("click", () => {
      activeProtocol = protocol.id;
      inputTitle.placeholder = protocol.titlePlaceholder;
      inputContent.placeholder = protocol.contentPlaceholder;
      renderProtocols();
      buildPrompt();
    });
    protocolGrid.appendChild(card);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${protocol.id === activeProtocol ? " is-active" : ""}`;
    button.textContent = protocol.label;
    button.addEventListener("click", () => {
      activeProtocol = protocol.id;
      inputTitle.placeholder = protocol.titlePlaceholder;
      inputContent.placeholder = protocol.contentPlaceholder;
      renderProtocols();
      buildPrompt();
    });
    protocolTabs.appendChild(button);
  });
}

function saveDraft() {
  const payload = {
    title: inputTitle.value,
    content: inputContent.value,
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
  inputStatus.textContent = "草稿已自动保存";
}

function restoreDraft() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;

  try {
    const payload = JSON.parse(raw);
    inputTitle.value = payload.title || "";
    inputContent.value = payload.content || "";
    buildPrompt();
    inputStatus.textContent = "已恢复上次草稿";
  } catch {
    inputStatus.textContent = "草稿恢复失败";
  }
}

generatePromptButton.addEventListener("click", buildPrompt);

copyPromptButton.addEventListener("click", async () => {
  const text = inputOutput.textContent.trim();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  inputStatus.textContent = "已复制，可直接粘贴给 Codex";
});

[inputTitle, inputContent].forEach((element) => {
  element.addEventListener("input", () => {
    buildPrompt();
    saveDraft();
  });
});

clearInputButton.addEventListener("click", () => {
  inputTitle.value = "";
  inputContent.value = "";
  inputOutput.textContent = "";
  localStorage.removeItem(storageKey);
  inputStatus.textContent = "草稿已清空";
});

restoreDraft();
renderProtocols();
inputTitle.placeholder = getActiveProtocol().titlePlaceholder;
inputContent.placeholder = getActiveProtocol().contentPlaceholder;
buildPrompt();
