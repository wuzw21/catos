const iterationData = window.personalTrackerData;
const iterationFeed = document.querySelector("#iteration-feed");
const iterationResult = document.querySelector("#iteration-result");
const dimensionOverview = document.querySelector("#dimension-overview");
const iterationOverview = document.querySelector("#iteration-overview");
const filterDimension = document.querySelector("#filter-dimension");
const filterStatus = document.querySelector("#filter-status");

const state = {
  dimension: "all",
  status: "all",
};

function buildEntries() {
  return iterationData.iterations.map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary || "打开查看这个领域。",
    meta: item.updatedAt || item.id,
    category: item.category || "未分类",
    stage: item.stage || "",
    status: item.status || "未标记",
    dimensions: item.dimensions || [],
    next: item.next || "",
    milestoneCount: item.milestoneCount || 0,
    achievementCount: item.achievementCount || 0,
    relatedTodoIds: item.relatedTodoIds || [],
    href: `./detail.html?type=iteration&id=${item.id}`,
  }));
}

const entries = buildEntries();
const todoEntries = [...(iterationData.todos || [])];

function renderCompactTable(node, rows) {
  node.innerHTML = rows
    .map(
      (row) => `
        <div class="compact-row">
          <span class="compact-key">${row.key}</span>
          <strong class="compact-value">${row.value}</strong>
          <span class="compact-note">${row.note}</span>
        </div>
      `
    )
    .join("");
}

function renderOverview() {
  const dimensionRows = ["日常杂项", "生活技能", "科研", "学习", "运动", "艺术", "理财", "外貌"].map((dimension) => {
    const count = entries.filter((item) => item.dimensions.includes(dimension)).length;
    return {
      key: dimension,
      value: `${count} 条`,
      note: count ? "已维护" : "待补",
    };
  });

  const iterationStatuses = ["计划中", "进行中", "已完成", "未标记"].map((status) => ({
    key: status,
    value: `${entries.filter((item) => item.status === status).length} 条`,
    note:
      status === "计划中"
        ? "刚进入系统"
        : status === "已完成"
          ? "已经稳定收口"
          : status === "进行中"
            ? "当前仍在推进"
            : "还没写状态",
  }));

  renderCompactTable(dimensionOverview, dimensionRows);
  renderCompactTable(iterationOverview, iterationStatuses);
}

function createFilterButtons(node, options, stateKey) {
  node.innerHTML = "";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${state[stateKey] === option.value ? " is-active" : ""}`;
    button.textContent = option.label;
    button.addEventListener("click", () => {
      state[stateKey] = option.value;
      renderFilters();
      renderFeed();
    });
    node.appendChild(button);
  });
}

function renderFilters() {
  createFilterButtons(
    filterDimension,
    [
      { label: "全部", value: "all" },
      { label: "日常杂项", value: "日常杂项" },
      { label: "生活技能", value: "生活技能" },
      { label: "科研", value: "科研" },
      { label: "学习", value: "学习" },
      { label: "运动", value: "运动" },
      { label: "艺术", value: "艺术" },
      { label: "理财", value: "理财" },
      { label: "外貌", value: "外貌" },
    ],
    "dimension"
  );

  createFilterButtons(
    filterStatus,
    [
      { label: "全部", value: "all" },
      { label: "计划中", value: "计划中" },
      { label: "已完成", value: "已完成" },
      { label: "进行中", value: "进行中" },
      { label: "未标记", value: "未标记" },
    ],
    "status"
  );
}

function getFilteredEntries() {
  return entries.filter((item) => {
    if (state.dimension !== "all" && !item.dimensions.includes(state.dimension)) return false;
    if (state.status !== "all" && item.status !== state.status) return false;
    return true;
  });
}

function renderFeed() {
  const filteredEntries = getFilteredEntries();

  iterationResult.textContent = `当前显示 ${filteredEntries.length} 条`;
  iterationFeed.innerHTML = "";

  filteredEntries.forEach((item) => {
    const dimensionText =
      item.dimensions && item.dimensions.length ? item.dimensions.join(" / ") : "未标记维度";
    const relatedTodos = todoEntries.filter((todo) => {
      if (item.relatedTodoIds.length) {
        return item.relatedTodoIds.includes(todo.id);
      }
      return item.dimensions.some((dimension) => dimension === todo.dimension);
    });
    const entry = document.createElement("article");
    entry.className = "iteration-entry";
    entry.tabIndex = 0;
    entry.setAttribute("role", "link");
    entry.setAttribute("aria-label", `打开领域：${item.title}`);
    entry.innerHTML = `
      <div class="iteration-dot"></div>
      <div class="iteration-body">
        <div class="iteration-entry-top">
          <div class="iteration-meta">${item.meta}</div>
          <div class="card-meta">
            <span class="tag">${item.status}</span>
            ${item.stage ? `<span class="tag">${item.stage}</span>` : ""}
          </div>
        </div>
        <h3>${item.title}</h3>
        <p>${item.summary}</p>
        <div class="entry-dimensions">维度：${dimensionText}</div>
        <div class="entry-dimensions">下一步：${item.next || "待补充"}</div>
        <div class="entry-dimensions">关联 Todo：</div>
        <div class="iteration-todo-links">
          ${
            relatedTodos.length
              ? relatedTodos
                  .map(
                    (todo) => `
                      <a class="iteration-todo-chip" href="./detail.html?type=todo&id=${encodeURIComponent(todo.id)}">${todo.title}</a>
                    `
                  )
                  .join("")
              : `<span class="iteration-todo-empty">当前还没有明确关联 Todo</span>`
          }
        </div>
        <div class="card-meta">
          <span class="tag">里程碑 ${item.milestoneCount}</span>
          <span class="tag">成就 ${item.achievementCount}</span>
          <span class="tag">Todo ${relatedTodos.length}</span>
          <span class="tag">${item.dimensions[0] || "未分维度"}</span>
        </div>
      </div>
    `;
    entry.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }
      window.location.href = item.href;
    });
    entry.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = item.href;
      }
    });
    iterationFeed.appendChild(entry);
  });

  if (!filteredEntries.length) {
    iterationFeed.innerHTML = `<div class="empty-state">当前筛选下还没有内容。</div>`;
  }
}

renderOverview();
renderFilters();
renderFeed();
