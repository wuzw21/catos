const data = window.personalTrackerData;

function getApiBase() {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:2333";
  }

  return `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:2333`;
}

const detailApiBase = getApiBase();

function stripLeadingHeading(html) {
  return String(html || "").replace(/^\s*<h1>.*?<\/h1>\s*/i, "");
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    type: params.get("type"),
    id: params.get("id"),
  };
}

function findEntry(type, id) {
  if (type === "soul" && id === "soul") {
    return {
      kind: "Soul",
      title: data.soul.title,
      summary: data.soul.summary,
      html: data.soul.html,
      meta: [
        `源文件：${data.soul.path}`,
        `关键词数：${data.soul.keywords.length}`,
        `身份字段：${data.soul.identity.length}`,
      ],
    };
  }

  if (type === "protocol" && id === "run-goal") {
    return {
      kind: "Protocol",
      title: data.runGoal.title,
      summary: data.runGoal.summary,
      html: data.runGoal.html,
      meta: [`源文件：${data.runGoal.path}`, "用途：目标讨论模式"],
    };
  }

  if (type === "doc") {
    const doc = data.docs.find((item) => item.id === id);
    if (!doc) return null;
    return {
      kind: doc.category,
      title: doc.title,
      summary: doc.summary,
      html: doc.html,
      meta: [`源文件：${doc.path}`, `类别：${doc.category}`],
    };
  }

  if (type === "dashboard" && id === "change-dashboard") {
    return {
      kind: "Dashboard",
      title: data.dashboard.title,
      summary: data.dashboard.summary,
      html: data.dashboard.html,
      meta: [`源文件：${data.dashboard.path}`, `指标数：${data.dashboard.metrics.length}`],
    };
  }

  if (type === "iteration") {
    const iteration = data.iterations.find((item) => item.id === id);
    if (!iteration) return null;
    return {
      kind: "Iteration",
      title: iteration.title,
      summary: iteration.summary,
      html: iteration.html,
      meta: [`源文件：${iteration.path}`, `领域：${iteration.id}`],
    };
  }

  if (type === "exploration") {
    const exploration = data.explorations.find((item) => item.id === id);
    if (!exploration) return null;
    return {
      kind: "Exploration",
      title: exploration.title,
      summary: exploration.summary,
      html: exploration.html,
      meta: [`源文件：${exploration.path}`, "类型：探索文档"],
    };
  }

  if (type === "plan") {
    const plan = data.plans.find((item) => item.id === id);
    if (!plan) return null;
    return {
      kind: "Plan",
      title: plan.title,
      summary: plan.summary,
      html: plan.html,
      meta: [`源文件：${plan.path}`, `时间标记：${plan.period}`],
    };
  }

  if (type === "todo") {
    const todo = data.todos.find((item) => item.id === id || item.fileId === id);
    if (!todo) return null;
    return {
      kind: "Todo",
      title: todo.title,
      summary: todo.summary,
      html: todo.html,
      meta: [
        `源文件：${todo.path}`,
        `Todo ID：${todo.id}`,
        `维度：${todo.dimension}`,
        `状态：${todo.status}`,
        `优先级：${todo.priority || "未标记"}`,
      ],
    };
  }

  if (type === "dimension") {
    const dimension = data.dimensions.find((item) => item.id === id);
    if (!dimension) return null;
    return {
      kind: "Dimension",
      title: dimension.name,
      summary: dimension.summary,
      html: `
        <section class="detail-subsection">
          <h2>概览</h2>
          ${dimension.html.overview}
        </section>
        <section class="detail-subsection">
          <h2>目标</h2>
          ${dimension.html.goals}
        </section>
        <section class="detail-subsection">
          <h2>变化记录</h2>
          ${dimension.html.changes}
        </section>
      `,
      meta: [
        `目录：${dimension.id}`,
        `目标数：${dimension.goalCount}`,
        `平均进度：${dimension.progress}%`,
        `最近变化：${dimension.latestChange || "暂无"}`,
      ],
    };
  }

  if (type === "log") {
    const log = data.logs.find((item) => item.id === id);
    if (!log) return null;
    return {
      kind: "Log",
      title: log.title,
      summary: log.summary,
      html: stripLeadingHeading(log.html),
      meta: [`源文件：${log.path}`, `类型：${log.category}`, `时间：${log.period}`],
      logCategory: log.category,
      period: log.period,
    };
  }

  return null;
}

async function pollBackgroundJob(jobId) {
  while (true) {
    const response = await fetch(`${detailApiBase}/api/jobs/${encodeURIComponent(jobId)}`);
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "job poll failed");
    }

    if (result.job.status === "completed") {
      return result.job.result;
    }

    if (result.job.status === "failed") {
      throw new Error(result.job.error || "job failed");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 900));
  }
}

function renderDetailActions(entry, params) {
  const actionsNode = document.querySelector("#detail-actions");
  const summaryNode = document.querySelector("#detail-summary");

  actionsNode.innerHTML = "";
  if (entry.kind !== "Log" || entry.logCategory !== "daily") {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "panel-action-chip";
  button.textContent = "重新整理这篇日志";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "整理中...";
    summaryNode.style.display = "";
    summaryNode.textContent = "正在异步整理这篇日志 ...";

    try {
      const response = await fetch(
        `${detailApiBase}/api/logs/daily/${encodeURIComponent(entry.period)}/regenerate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      const result = await response.json();

      if (!response.ok || !result.ok || !result.jobId) {
        throw new Error(result.error || "start failed");
      }

      const generated = await pollBackgroundJob(result.jobId);
      summaryNode.textContent =
        generated.mode === "fallback"
          ? "已重新整理这篇日志。当前使用规则 fallback 生成。"
          : "已重新整理这篇日志。";
      window.setTimeout(() => {
        window.location.href = `./detail.html?type=${encodeURIComponent(params.type)}&id=${encodeURIComponent(params.id)}&refresh=${Date.now()}`;
      }, 500);
    } catch (error) {
      summaryNode.textContent = `整理失败：${error.message}`;
      button.disabled = false;
      button.textContent = "重新整理这篇日志";
    }
  });
  actionsNode.appendChild(button);
}

function renderDetail() {
  const params = getParams();
  const { type, id } = params;
  const entry = findEntry(type, id);
  const kindNode = document.querySelector("#detail-kind");
  const titleNode = document.querySelector("#detail-title");
  const summaryNode = document.querySelector("#detail-summary");
  const bodyNode = document.querySelector("#detail-body");
  const metaNode = document.querySelector("#detail-meta");

  if (!entry) {
    kindNode.textContent = "Not Found";
    titleNode.textContent = "没有找到对应内容";
    summaryNode.textContent = "请从首页或日记页重新进入。";
    summaryNode.style.display = "";
    bodyNode.innerHTML = `<p>当前参数无效：type=${type || ""}，id=${id || ""}</p>`;
    return;
  }

  kindNode.textContent = entry.kind;
  titleNode.textContent = entry.title;
  summaryNode.textContent = entry.summary;
  summaryNode.style.display = entry.summary ? "" : "none";
  bodyNode.innerHTML = entry.html;
  metaNode.innerHTML = "";

  entry.meta.forEach((line) => {
    const item = document.createElement("div");
    item.className = "side-item";
    item.textContent = line;
    metaNode.appendChild(item);
  });

  renderDetailActions(entry, params);
}

renderDetail();
