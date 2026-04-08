const todoData = window.personalTrackerData;
const purchaseTodoAnchor = document.querySelector("#purchase-todo-anchor");
const todoFeed = document.querySelector("#todo-feed");
const todoResult = document.querySelector("#todo-result");
const todoStatusOverview = document.querySelector("#todo-status-overview");
const todoDimensionOverview = document.querySelector("#todo-dimension-overview");
const todoFilterStatus = document.querySelector("#todo-filter-status");
const todoFilterDimension = document.querySelector("#todo-filter-dimension");
const todoSyncStatus = document.querySelector("#todo-sync-status");

const todoState = {
  status: "all",
  dimension: "all",
};
const todoUiState = {
  activeTodoId: "",
  message: "状态切换会同步到 Todo 文件、索引和前端数据。",
  tone: "idle",
};

function getApiBase() {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:2333";
  }

  return `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:2333`;
}

const todoApiBase = getApiBase();

const todoEntries = [...(todoData.todos || [])];
const dimensionOptions = ["日常杂项", "生活技能", "科研", "学习", "运动", "艺术", "理财", "外貌"];
const statusOptions = ["未开始", "进行中", "已完成", "搁置"];
const purchaseMasterTodoId = "todo-2026-04-06-purchase-master";

function initFiltersFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const dimension = params.get("dimension");
  const status = params.get("status");

  if (dimension && dimensionOptions.includes(dimension)) {
    todoState.dimension = dimension;
  }

  if (status && statusOptions.includes(status)) {
    todoState.status = status;
  }
}

function getTodoStatus(todo) {
  return todo.status;
}

function getPurchaseMasterTodo() {
  return todoEntries.find((item) => item.id === purchaseMasterTodoId) || null;
}

function renderSyncStatus() {
  todoSyncStatus.className = `sync-status${todoUiState.tone !== "idle" ? ` is-${todoUiState.tone}` : ""}`;
  todoSyncStatus.textContent = todoUiState.message;
}

function setSyncStatus(message, tone = "idle") {
  todoUiState.message = message;
  todoUiState.tone = tone;
  renderSyncStatus();
}

async function syncTodoStatus(todo, nextStatus, currentStatus) {
  if (!nextStatus || nextStatus === currentStatus) {
    setSyncStatus(`Todo ${todo.id} 当前已经是 ${currentStatus}。`);
    return;
  }

  todoUiState.activeTodoId = todo.id;
  setSyncStatus(`正在同步 ${todo.title} -> ${nextStatus} ...`, "pending");
  renderPurchaseMaster();
  renderFeed();

  try {
    const response = await fetch(`${todoApiBase}/api/todos/${encodeURIComponent(todo.id)}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: nextStatus }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "状态同步失败");
    }

    todo.status = result.todo.status;
    renderOverview();
    setSyncStatus(`已同步 ${todo.title} -> ${result.todo.status}。`, "success");
  } catch (error) {
    setSyncStatus(`同步失败：${error.message}。请确认本地服务已启动：${todoApiBase}`, "error");
  } finally {
    todoUiState.activeTodoId = "";
    renderPurchaseMaster();
    renderFeed();
  }
}

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
  renderCompactTable(
    todoStatusOverview,
    statusOptions.map((status) => ({
      key: status,
      value: `${todoEntries.filter((item) => getTodoStatus(item) === status).length} 条`,
      note: status === "未开始" ? "还没动" : status === "进行中" ? "正在推进" : status === "已完成" ? "已经完成" : "暂时搁置",
    }))
  );

  renderCompactTable(
    todoDimensionOverview,
    dimensionOptions.map((dimension) => ({
      key: dimension,
      value: `${todoEntries.filter((item) => item.dimension === dimension).length} 条`,
      note: "Todo 数量",
    }))
  );
}

function createButtons(node, options, stateKey) {
  node.innerHTML = "";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${todoState[stateKey] === option.value ? " is-active" : ""}`;
    button.textContent = option.label;
    button.addEventListener("click", () => {
      todoState[stateKey] = option.value;
      renderFilters();
      renderFeed();
    });
    node.appendChild(button);
  });
}

function renderFilters() {
  createButtons(
    todoFilterStatus,
    [{ label: "全部", value: "all" }, ...statusOptions.map((status) => ({ label: status, value: status }))],
    "status"
  );

  createButtons(
    todoFilterDimension,
    [{ label: "全部", value: "all" }, ...dimensionOptions.map((dimension) => ({ label: dimension, value: dimension }))],
    "dimension"
  );
}

function getFilteredTodos() {
  return todoEntries.filter((item) => {
    if (item.id === purchaseMasterTodoId) return false;
    if (todoState.status !== "all" && getTodoStatus(item) !== todoState.status) return false;
    if (todoState.dimension !== "all" && item.dimension !== todoState.dimension) return false;
    return true;
  });
}

function buildTodoStatusButtons(todo, currentStatus) {
  return `
    <div class="todo-status-row">
      ${statusOptions
        .map(
          (status) => `
            <button
              class="todo-status-button${status === currentStatus ? " is-active" : ""}"
              type="button"
              data-status="${status}"
              ${todoUiState.activeTodoId === todo.id ? "disabled" : ""}
            >
              ${status}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function bindTodoStatusButtons(node, todo, currentStatus) {
  node.querySelectorAll(".todo-status-button").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextStatus = button.dataset.status;
      await syncTodoStatus(todo, nextStatus, currentStatus);
    });
  });
}

function renderPurchaseMaster() {
  if (!purchaseTodoAnchor) {
    return;
  }

  const purchaseTodo = getPurchaseMasterTodo();

  if (!purchaseTodo) {
    purchaseTodoAnchor.innerHTML = "";
    return;
  }

  const currentStatus = getTodoStatus(purchaseTodo);
  const card = document.createElement("article");
  card.className = "todo-card todo-card-featured";
  card.innerHTML = `
    <div class="card-topline">
      <div>
        <div class="iteration-meta">${purchaseTodo.id}</div>
        <h3>${purchaseTodo.title}</h3>
      </div>
      <span class="tag">${currentStatus}</span>
    </div>
    <p>${purchaseTodo.summary || "暂无任务说明"}</p>
    <div class="card-meta">
      <span class="tag">${purchaseTodo.dimension}</span>
      ${purchaseTodo.priority ? `<span class="tag">${purchaseTodo.priority}</span>` : ""}
      ${purchaseTodo.createdAt ? `<span class="tag">${purchaseTodo.createdAt}</span>` : ""}
      <span class="tag">支持 finish</span>
    </div>
    <div class="entry-dimensions">下一步：${purchaseTodo.nextStep || "待补充"}</div>
    <div class="purchase-index-row">
      <a class="purchase-index-link" href="./detail.html?type=todo&id=${purchaseTodo.id}">打开唯一购买入口</a>
    </div>
    ${buildTodoStatusButtons(purchaseTodo, currentStatus)}
  `;

  card.querySelector("h3").addEventListener("click", () => {
    window.location.href = `./detail.html?type=todo&id=${purchaseTodo.id}`;
  });

  bindTodoStatusButtons(card, purchaseTodo, currentStatus);
  purchaseTodoAnchor.innerHTML = "";
  purchaseTodoAnchor.appendChild(card);
}

function renderFeed() {
  const filtered = getFilteredTodos();
  todoResult.textContent = `当前显示 ${filtered.length} 条`;
  todoFeed.innerHTML = "";

  filtered.forEach((todo) => {
    const currentStatus = getTodoStatus(todo);
    const entry = document.createElement("a");
    entry.className = "todo-card";
    entry.href = `./detail.html?type=todo&id=${todo.id}`;
    entry.innerHTML = `
      <div class="card-topline">
        <div>
          <div class="iteration-meta">${todo.id}</div>
          <h3>${todo.title}</h3>
        </div>
        <span class="tag">${currentStatus}</span>
      </div>
      <p>${todo.summary || "暂无任务说明"}</p>
      <div class="card-meta">
        <span class="tag">${todo.dimension}</span>
        ${todo.priority ? `<span class="tag">${todo.priority}</span>` : ""}
        ${todo.createdAt ? `<span class="tag">${todo.createdAt}</span>` : ""}
      </div>
      <div class="entry-dimensions">下一步：${todo.nextStep || "待补充"}</div>
      ${buildTodoStatusButtons(todo, currentStatus)}
    `;
    bindTodoStatusButtons(entry, todo, currentStatus);
    todoFeed.appendChild(entry);
  });

  if (!filtered.length) {
    todoFeed.innerHTML = `<div class="empty-state">当前筛选下还没有 Todo。</div>`;
  }
}

initFiltersFromQuery();
renderOverview();
renderFilters();
renderSyncStatus();
renderPurchaseMaster();
renderFeed();
