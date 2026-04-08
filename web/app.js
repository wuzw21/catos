const data = window.personalTrackerData;

function getApiBase() {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:2333";
  }

  return `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:2333`;
}

const homeApiBase = getApiBase();
const homeState = {
  savingHomeIndex: false,
  savingCheckin: false,
  savingCoreContribution: false,
  savingCapture: false,
  archivingCapture: false,
  depositingLatestCapture: false,
  startingNewDay: false,
  homeIndexTimer: null,
  checkinTimer: null,
  coreContributionTimer: null,
  pendingHomeSection: "",
  pendingCheckin: false,
  pendingCoreContribution: false,
  openSchedulePlanIndex: -1,
  scheduleDrafts: {},
};

function initHome() {
  const homeNote = document.querySelector("#home-note");
  const todayList = document.querySelector("#today-list");
  const ddlList = document.querySelector("#ddl-list");
  const homeCurrentDate = document.querySelector("#home-current-date");
  const checkinDate = document.querySelector("#checkin-date");
  const dailyCheckinList = document.querySelector("#daily-checkin-list");
  const coreContributionDate = document.querySelector("#core-contribution-date");
  const coreContributionInput = document.querySelector("#core-contribution-input");
  const addTodayPlan = document.querySelector("#add-today-plan");
  const addDdlItemButton = document.querySelector("#add-ddl-item");
  const toggleDdlEditButton = document.querySelector("#toggle-ddl-edit");
  const addDailyCheckin = document.querySelector("#add-daily-checkin");
  const startNewDayButton = document.querySelector("#start-new-day");
  const viewYesterdayLog = document.querySelector("#view-yesterday-log");
  const captureTextInput = document.querySelector("#capture-text");
  const capturePhotoInput = document.querySelector("#capture-photo-input");
  const captureDropzone = document.querySelector("#capture-dropzone");
  const captureFileStatus = document.querySelector("#capture-file-status");
  const saveCaptureButton = document.querySelector("#save-capture");
  const archiveCaptureButton = document.querySelector("#archive-capture");
  const clearCaptureButton = document.querySelector("#clear-capture");
  const captureStatus = document.querySelector("#capture-status");
  const captureLastEntry = document.querySelector("#capture-last-entry");
  const capturePanel = document.querySelector(".home-capture-panel");
  const captureDetailUrl = "./detail.html?type=doc&id=quick-capture";
  const homeIndex = data.homeIndex || { todayItems: [], ddlItems: [] };
  const dailyCheckin = data.dailyCheckin || { date: "", items: [] };
  const coreContribution = data.coreContribution || { date: "", content: "" };
  const quickCaptureDoc = (data.docs || []).find((item) => item.id === "quick-capture");
  const captureState = {
    latestEntry: parseLatestCaptureEntry(quickCaptureDoc?.markdown || ""),
  };
  const ddlUiState = { editing: false };

  function createClientPlanId() {
    return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseLatestCaptureEntry(markdown) {
    const block = String(markdown || "")
      .split(/(?=^###\s+)/m)
      .find((item) => item.trim().startsWith("### "));

    if (!block) {
      return null;
    }

    const lines = block
      .trim()
      .split("\n")
      .map((line) => line.trim());
    const heading = lines[0].replace(/^###\s+/, "").trim();
    const [timestamp = "", category = "", dimension = ""] = heading.split("|").map((item) => item.trim());
    const content = lines.find((line) => line.startsWith("- 内容："))?.replace(/^- 内容：/, "").trim() || "";
    const archived = lines.find((line) => line.startsWith("- 归档："))?.replace(/^- 归档：/, "").trim() || "";

    return {
      timestamp,
      category,
      dimension,
      content,
      archived,
    };
  }

  function renderLatestCaptureEntry() {
    if (!captureLastEntry) {
      return;
    }

    const latest = captureState.latestEntry;
    if (!latest) {
      captureLastEntry.innerHTML = `
        <div class="capture-last-card">
          <a class="capture-last-link" href="${captureDetailUrl}">
            <span class="capture-last-label">上一条随手记</span>
            <strong>还没有内容，先丢一条进去。</strong>
          </a>
        </div>
      `;
      return;
    }

    captureLastEntry.innerHTML = `
      <div class="capture-last-card">
        <a class="capture-last-link" href="${captureDetailUrl}">
          <span class="capture-last-label">上一条随手记</span>
          <div class="capture-last-meta">${latest.timestamp || "刚刚"} · ${latest.category || "记录"}${latest.dimension ? ` · ${latest.dimension}` : ""}</div>
          <strong>${latest.content || "打开收集箱查看详情"}</strong>
          ${latest.archived ? `<em class="capture-last-archived">${latest.archived}</em>` : ""}
        </a>
        <div class="capture-last-actions">
          <button class="panel-action-chip" id="deposit-latest-capture" type="button" ${latest.archived || homeState.depositingLatestCapture ? "disabled" : ""}>
            ${homeState.depositingLatestCapture ? "沉淀中..." : latest.archived ? "已沉淀" : "沉淀到系统"}
          </button>
        </div>
      </div>
    `;

    const depositButton = document.querySelector("#deposit-latest-capture");
    if (depositButton) {
      depositButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        depositLatestCapture();
      });
    }
  }

  function autosizeCaptureInput() {
    captureTextInput.style.height = "auto";
    captureTextInput.style.height = `${Math.min(captureTextInput.scrollHeight, 220)}px`;
  }

  function getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function renderCurrentDate() {
    if (!homeCurrentDate) {
      return;
    }
    const now = new Date();
    const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    homeCurrentDate.textContent = `${getLocalDateString()} ${weekdayLabels[now.getDay()]}`;
  }

  function renderYesterdayLink() {
    if (!viewYesterdayLog) {
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayLogId = `daily-${formatDateString(yesterday)}`;
    const logs = Array.isArray(data.logs) ? data.logs : [];
    const exactYesterday = logs.find((item) => item.id === yesterdayLogId);
    const latestDaily = logs.find((item) => item.category === "daily");
    const target = exactYesterday || latestDaily;

    if (!target?.id) {
      viewYesterdayLog.href = "./diary.html";
      viewYesterdayLog.textContent = "查看日记";
      return;
    }

    viewYesterdayLog.href = `./detail.html?type=log&id=${encodeURIComponent(target.id)}`;
    viewYesterdayLog.textContent = "查看昨日";
  }

  function escapeHtml(input) {
    return String(input || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderStartNewDaySummary(payload) {
    const summary = payload?.summary || {};
    const capturePart = `随手记 ${summary.captures?.archivedCount || 0} 条`;
    const planPart = summary.todayPlan?.total
      ? `日计划 ${summary.todayPlan.completedCount}/${summary.todayPlan.total}`
      : "日计划 0 项";
    const checkinPart = summary.dailyCheckin?.total
      ? `打卡 ${summary.dailyCheckin.completedCount}/${summary.dailyCheckin.total}`
      : "打卡 0 项";
    const contributionPart = summary.coreContribution
      ? `核心贡献：${summary.coreContribution}`
      : "核心贡献：空";
    const files = (summary.writtenFiles || []).slice(0, 6).map((item) => escapeHtml(item)).join("，");
    const generationMode = escapeHtml(summary.log?.generationMode || payload?.generationMode || "unknown");

    return [
      `<strong>${escapeHtml(payload.archivedDate)} 已整理完成</strong>`,
      `${escapeHtml(capturePart)}；${escapeHtml(planPart)}；${escapeHtml(checkinPart)}`,
      escapeHtml(contributionPart),
      `日志整理：${generationMode}${files ? `；写入：${files}` : ""}`,
    ].join("<br />");
  }

  function queueHomeIndexSave(section) {
    clearTimeout(homeState.homeIndexTimer);
    homeState.homeIndexTimer = setTimeout(() => {
      saveHomeIndex(section);
    }, 500);
  }

  function queueCheckinSave() {
    clearTimeout(homeState.checkinTimer);
    homeState.checkinTimer = setTimeout(() => {
      saveCheckin();
    }, 500);
  }

  function queueCoreContributionSave() {
    clearTimeout(homeState.coreContributionTimer);
    homeState.coreContributionTimer = setTimeout(() => {
      saveCoreContribution();
    }, 700);
  }

  function renderDdl() {
    toggleDdlEditButton.textContent = ddlUiState.editing ? "完成" : "编辑";
    ddlList.innerHTML = "";
    if (!homeIndex.ddlItems.length) {
      ddlList.innerHTML = `
        <div class="empty-state home-empty-state">
          <strong>还没有重要日程。</strong>
          <span>请先记录一个有明确日期的事项，例如考试、投稿或纪念日。</span>
        </div>
      `;
      return;
    }

    homeIndex.ddlItems.forEach((item, index) => {
      const row = document.createElement("article");
      row.className = "simple-index-item milestone-item ddl-card";
      row.innerHTML = `
        ${
          ddlUiState.editing
            ? `<input class="milestone-edit-input milestone-edit-date" data-ddl-date="${index}" type="date" value="${item.deadline || ""}" />`
            : `<div class="milestone-date">${item.deadline || "待定"}</div>`
        }
        <div class="milestone-body">
          ${
            ddlUiState.editing
              ? `<input class="milestone-edit-input milestone-edit-copy" data-ddl-desc="${index}" type="text" value="${item.description || ""}" placeholder="重要事项" />`
              : `<strong>${item.description || "待补充重要事项"}</strong>`
          }
          ${
            ddlUiState.editing
              ? `
                <div class="milestone-actions milestone-actions-editing">
                  <button class="milestone-action-button is-danger" type="button" data-ddl-delete="${index}">移除</button>
                </div>
              `
              : ""
          }
        </div>
      `;
      ddlList.appendChild(row);
    });

    ddlList.querySelectorAll("[data-ddl-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.ddlDelete);
        if (Number.isNaN(index)) return;
        homeIndex.ddlItems.splice(index, 1);
        renderDdl();
        queueHomeIndexSave("ddl");
      });
    });

    ddlList.querySelectorAll("[data-ddl-date]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.ddlDate);
        if (Number.isNaN(index) || !homeIndex.ddlItems[index]) return;
        homeIndex.ddlItems[index].deadline = input.value.trim();
        queueHomeIndexSave("ddl");
      });
    });

    ddlList.querySelectorAll("[data-ddl-desc]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.ddlDesc);
        if (Number.isNaN(index) || !homeIndex.ddlItems[index]) return;
        homeIndex.ddlItems[index].description = input.value.trim();
        queueHomeIndexSave("ddl");
      });
    });
  }

  function renderToday() {
    todayList.innerHTML = "";
    if (!homeIndex.todayItems.length) {
      todayList.innerHTML = `
        <div class="empty-state home-empty-state">
          <strong>今天还没有日计划。</strong>
          <span>请先记录今天真正要推进的一件事，保持短句、直接、可执行。</span>
        </div>
      `;
      return;
    }

    homeIndex.todayItems.forEach((item, index) => {
      const scheduleDraft = homeState.scheduleDrafts[index] ?? "";
      const scheduleOpen = homeState.openSchedulePlanIndex === index;
      const row = document.createElement("article");
      row.className = "plan-item";
      row.dataset.planItem = "true";
      row.dataset.planId = item.planId || "";
      row.dataset.planPlacement = item.schedulePlacement || "";
      row.innerHTML = `
        <input class="plan-checkbox" type="checkbox" data-plan-index="${index}" ${item.status === "已完成" ? "checked" : ""} />
        <div class="plan-copy">
          <input class="plan-text-input" type="text" data-plan-title="${index}" value="${item.description || ""}" placeholder="今天要推进什么" />
          <div class="plan-subline">
            <span class="plan-placement${item.schedulePlacement ? "" : " is-empty"}">
              ${item.schedulePlacement ? `已排进日程：${item.schedulePlacement}` : "还没排进日程"}
            </span>
            <button class="panel-action-chip plan-link-button" type="button" data-plan-schedule="${index}">
              ${item.schedulePlacement ? "改日程" : "排进日程"}
            </button>
          </div>
          <div class="plan-schedule-form${scheduleOpen ? " is-open" : ""}">
            <input
              class="plan-schedule-input"
              type="text"
              data-plan-when="${index}"
              value="${scheduleDraft}"
              placeholder="例如：今天下午 / 今晚 / 明天上午"
            />
            <button class="panel-action-chip plan-link-button is-accent" type="button" data-plan-confirm="${index}">确定</button>
            <button class="panel-action-chip panel-action-chip-muted plan-link-button" type="button" data-plan-cancel="${index}">收起</button>
          </div>
        </div>
        <button class="checkin-delete-button" type="button" data-plan-delete="${index}">移除</button>
      `;
      todayList.appendChild(row);
    });

    todayList.querySelectorAll("[data-plan-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.planDelete);
        if (Number.isNaN(index)) return;
        homeIndex.todayItems.splice(index, 1);
        renderToday();
        queueHomeIndexSave("today");
      });
    });

    todayList.querySelectorAll("[data-plan-index]").forEach((input) => {
      input.addEventListener("change", () => {
        queueHomeIndexSave("today");
      });
    });

    todayList.querySelectorAll("[data-plan-title]").forEach((input) => {
      input.addEventListener("input", () => {
        queueHomeIndexSave("today");
      });
    });

    todayList.querySelectorAll("[data-plan-schedule]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.planSchedule);
        if (Number.isNaN(index)) return;
        homeState.openSchedulePlanIndex = homeState.openSchedulePlanIndex === index ? -1 : index;
        if (!homeState.scheduleDrafts[index]) {
          homeState.scheduleDrafts[index] = homeIndex.todayItems[index]?.schedulePlacement || "";
        }
        renderToday();
        const input = document.querySelector(`[data-plan-when="${index}"]`);
        if (input && homeState.openSchedulePlanIndex === index) {
          input.focus();
        }
      });
    });

    todayList.querySelectorAll("[data-plan-when]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.planWhen);
        if (Number.isNaN(index)) return;
        homeState.scheduleDrafts[index] = input.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const index = Number(input.dataset.planWhen);
          if (Number.isNaN(index)) return;
          scheduleTodayPlan(index, input.value);
        }
      });
    });

    todayList.querySelectorAll("[data-plan-confirm]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.planConfirm);
        if (Number.isNaN(index)) return;
        const value = document.querySelector(`[data-plan-when="${index}"]`)?.value || "";
        scheduleTodayPlan(index, value);
      });
    });

    todayList.querySelectorAll("[data-plan-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.planCancel);
        if (Number.isNaN(index)) return;
        homeState.openSchedulePlanIndex = -1;
        renderToday();
      });
    });
  }

  function renderCheckin() {
    checkinDate.textContent = dailyCheckin.date || "Check";
    dailyCheckinList.innerHTML = "";
    if (!dailyCheckin.items.length) {
      dailyCheckinList.innerHTML = `
        <div class="empty-state home-empty-state">
          <strong>还没有打卡项。</strong>
          <span>请先加 1 到 3 个你每天都要重复执行的动作。</span>
        </div>
      `;
      return;
    }

    dailyCheckin.items.forEach((item, index) => {
      const row = document.createElement("article");
      row.className = "checkin-item";
      row.innerHTML = `
        <input class="checkin-checkbox" type="checkbox" data-checkin-index="${index}" ${item.status === "已完成" ? "checked" : ""} />
        <div class="checkin-copy">
          <input class="checkin-text-input" type="text" data-checkin-title="${index}" value="${item.title || ""}" placeholder="打卡项" />
          <input class="checkin-slot-input" type="text" data-checkin-slot="${index}" value="${item.slot || ""}" placeholder="时段 / 说明" />
        </div>
        <button class="checkin-delete-button" type="button" data-checkin-delete="${index}">移除</button>
      `;
      dailyCheckinList.appendChild(row);
    });

    dailyCheckinList.querySelectorAll("[data-checkin-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.checkinDelete);
        if (Number.isNaN(index)) return;
        dailyCheckin.items.splice(index, 1);
        renderCheckin();
        queueCheckinSave();
      });
    });

    dailyCheckinList.querySelectorAll("[data-checkin-index]").forEach((input) => {
      input.addEventListener("change", () => {
        queueCheckinSave();
      });
    });

    dailyCheckinList.querySelectorAll("[data-checkin-title], [data-checkin-slot]").forEach((input) => {
      input.addEventListener("input", () => {
        queueCheckinSave();
      });
    });
  }

  function renderCoreContribution() {
    coreContributionDate.textContent = coreContribution.date || "Today";
    coreContributionInput.value = coreContribution.content || "";
  }

  function resetCaptureInputs() {
    captureTextInput.value = "";
    capturePhotoInput.value = "";
    captureFileStatus.textContent = "可附一张图片，支持拖拽";
    captureDropzone.classList.remove("is-dragover");
    autosizeCaptureInput();
  }

  function updateCaptureFileStatus(file) {
    captureFileStatus.textContent = file?.name || "可附一张图片，支持拖拽";
  }

  function syncDroppedFiles(files) {
    const dataTransfer = new DataTransfer();
    [...files].forEach((file) => dataTransfer.items.add(file));
    capturePhotoInput.files = dataTransfer.files;
    updateCaptureFileStatus(capturePhotoInput.files?.[0]);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function readTodayInputs() {
    return [...document.querySelectorAll("[data-plan-item]")].map((row, index) => ({
      order: index + 1,
      description: document.querySelector(`[data-plan-title="${index}"]`)?.value.trim() || "",
      status: document.querySelector(`[data-plan-index="${index}"]`)?.checked ? "已完成" : "未完成",
      planId: row.dataset.planId || createClientPlanId(),
      schedulePlacement: row.dataset.planPlacement || "",
    })).filter((item) => item.description);
  }

  function readCheckinInputs() {
    return [...document.querySelectorAll("[data-checkin-index]")].map((node, index) => ({
      title: document.querySelector(`[data-checkin-title="${index}"]`)?.value.trim() || "",
      slot: document.querySelector(`[data-checkin-slot="${index}"]`)?.value.trim() || "",
      status: node.checked ? "已完成" : "未完成",
    })).filter((item) => item.title || item.slot);
  }

  async function saveHomeIndex(section) {
    if (homeState.savingHomeIndex) {
      homeState.pendingHomeSection = section;
      return false;
    }

    homeState.savingHomeIndex = true;
    homeNote.textContent = section === "today" ? "正在同步日计划 ..." : "正在同步重要日程 ...";

    try {
      const payload =
        section === "today"
          ? { todayItems: readTodayInputs() }
          : {
              ddlItems: homeIndex.ddlItems
                .map((item) => ({
                  deadline: String(item.deadline || "").trim(),
                  description: String(item.description || "").trim(),
                }))
                .filter((item) => item.deadline || item.description),
            };
      const response = await fetch(`${homeApiBase}/api/home-index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "save failed");
      }

      homeIndex.todayItems = result.homeIndex.todayItems;
      homeIndex.ddlItems = result.homeIndex.ddlItems;
      renderToday();
      renderDdl();
      homeNote.textContent = `已同步：${new Date().toLocaleString("zh-CN", { hour12: false })}`;
      return true;
    } catch (error) {
      homeNote.textContent = `同步失败：${error.message}。请通过 http://127.0.0.1:2333/web/index.html 打开。`;
      return false;
    } finally {
      homeState.savingHomeIndex = false;
      if (homeState.pendingHomeSection) {
        const nextSection = homeState.pendingHomeSection;
        homeState.pendingHomeSection = "";
        saveHomeIndex(nextSection);
      }
    }
  }

  async function scheduleTodayPlan(index, inputWhenText = "") {
    let item = homeIndex.todayItems[index];
    if (!item) {
      return;
    }

    const description = String(item.description || "").trim();
    if (!description) {
      homeNote.textContent = "先把这条日计划写清楚，再排进日程。";
      return;
    }

    const ensuredSave = await saveHomeIndex("today");
    if (!ensuredSave) {
      return;
    }
    item = homeIndex.todayItems[index];
    if (!item?.planId) {
      homeNote.textContent = "这条日计划还没有生成计划 ID，请再试一次。";
      return;
    }
    const whenText = String(inputWhenText || homeState.scheduleDrafts[index] || item.schedulePlacement || "今天").trim() || "今天";

    homeNote.textContent = `正在把「${description}」排进日程 ...`;

    try {
      const response = await fetch(`${homeApiBase}/api/today-plan/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: item.planId,
          whenText: whenText.trim() || "今天",
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "schedule plan failed");
      }

      homeIndex.todayItems = result.homeIndex.todayItems;
      homeState.openSchedulePlanIndex = -1;
      homeState.scheduleDrafts[index] = "";
      renderToday();
      const latestPlacement =
        homeIndex.todayItems.find((plan) => plan.planId === item.planId)?.schedulePlacement || `${result.schedule.dateId}`;
      homeNote.textContent = `已把「${description}」排进 ${latestPlacement}。`;
    } catch (error) {
      homeNote.textContent = `日计划排程失败：${error.message}`;
    }
  }

  async function saveCheckin() {
    if (homeState.savingCheckin) {
      homeState.pendingCheckin = true;
      return false;
    }

    homeState.savingCheckin = true;
    homeNote.textContent = "正在同步今天打卡 ...";

    try {
      const response = await fetch(`${homeApiBase}/api/daily-checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: dailyCheckin.date || new Date().toISOString().slice(0, 10),
          items: readCheckinInputs(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "save failed");
      }

      dailyCheckin.date = result.dailyCheckin.date;
      dailyCheckin.items = result.dailyCheckin.items;
      renderCheckin();
      homeNote.textContent = `打卡已同步：${new Date().toLocaleString("zh-CN", { hour12: false })}`;
      return true;
    } catch (error) {
      homeNote.textContent = `打卡同步失败：${error.message}。请通过 http://127.0.0.1:2333/web/index.html 打开。`;
      return false;
    } finally {
      homeState.savingCheckin = false;
      if (homeState.pendingCheckin) {
        homeState.pendingCheckin = false;
        saveCheckin();
      }
    }
  }

  async function saveCoreContribution() {
    if (homeState.savingCoreContribution) {
      homeState.pendingCoreContribution = true;
      return false;
    }

    homeState.savingCoreContribution = true;
    homeNote.textContent = "正在同步今日核心贡献 ...";

    try {
      const response = await fetch(`${homeApiBase}/api/core-contribution`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: coreContribution.date || new Date().toISOString().slice(0, 10),
          content: coreContributionInput.value.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "save failed");
      }

      coreContribution.date = result.coreContribution.date;
      coreContribution.content = result.coreContribution.content;
      renderCoreContribution();
      homeNote.textContent = `核心贡献已同步：${new Date().toLocaleString("zh-CN", { hour12: false })}`;
      return true;
    } catch (error) {
      homeNote.textContent = `核心贡献同步失败：${error.message}。请通过 http://127.0.0.1:2333/web/index.html 打开。`;
      return false;
    } finally {
      homeState.savingCoreContribution = false;
      if (homeState.pendingCoreContribution) {
        homeState.pendingCoreContribution = false;
        saveCoreContribution();
      }
    }
  }

  async function saveCapture() {
    if (homeState.savingCapture) return;

    const text = captureTextInput.value.trim();
    const file = capturePhotoInput.files?.[0];
    if (!text && !file) {
      captureStatus.textContent = "请至少输入文字或上传图片。";
      return;
    }

    homeState.savingCapture = true;
    saveCaptureButton.disabled = true;
    clearCaptureButton.disabled = true;
    captureStatus.textContent = "正在保存随手记 ...";

    try {
      const payload = {};
      if (text) {
        payload.text = text;
      }
      if (file) {
        payload.file = {
          name: file.name,
          dataUrl: await readFileAsDataUrl(file),
        };
      }
      payload.type = file ? "photo" : "text";

      const response = await fetch(`${homeApiBase}/api/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "capture save failed");
      }

      resetCaptureInputs();
      captureState.latestEntry = {
        timestamp: "刚刚保存",
        category: result.capture.category || "记录",
        dimension: result.capture.dimension || "",
        content: result.capture.summary || "",
        archived: "",
      };
      renderLatestCaptureEntry();
      captureStatus.textContent = `已收进随手记：${result.capture.dimension} / ${result.capture.category}`;
    } catch (error) {
      captureStatus.textContent = `保存失败：${error.message}`;
    } finally {
      homeState.savingCapture = false;
      saveCaptureButton.disabled = false;
      archiveCaptureButton.disabled = false;
      clearCaptureButton.disabled = false;
    }
  }

  async function archiveCapture() {
    if (homeState.archivingCapture) return;

    homeState.archivingCapture = true;
    saveCaptureButton.disabled = true;
    archiveCaptureButton.disabled = true;
    clearCaptureButton.disabled = true;
    captureStatus.textContent = "正在归档今天的随手记 ...";

    try {
      const response = await fetch(`${homeApiBase}/api/archive-capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "archive failed");
      }

      const files = (result.archive.updatedFiles || []).slice(0, 4).join("，");
      if (captureState.latestEntry) {
        captureState.latestEntry.archived = `已归档 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
        renderLatestCaptureEntry();
      }
      captureStatus.textContent = files
        ? `${result.archive.message} 已联动：${files}`
        : result.archive.message;
    } catch (error) {
      captureStatus.textContent = `归档失败：${error.message}`;
    } finally {
      homeState.archivingCapture = false;
      saveCaptureButton.disabled = false;
      archiveCaptureButton.disabled = false;
      clearCaptureButton.disabled = false;
    }
  }

  async function pollBackgroundJob(jobId) {
    while (true) {
      const response = await fetch(`${homeApiBase}/api/jobs/${encodeURIComponent(jobId)}`);
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

  async function depositLatestCapture() {
    if (homeState.depositingLatestCapture) {
      return;
    }

    homeState.depositingLatestCapture = true;
    renderLatestCaptureEntry();
    captureStatus.textContent = "正在异步沉淀上一条随手记 ...";

    try {
      const response = await fetch(`${homeApiBase}/api/capture-deposit-latest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const result = await response.json();

      if (!response.ok || !result.ok || !result.jobId) {
        throw new Error(result.error || "deposit start failed");
      }

      const archive = await pollBackgroundJob(result.jobId);
      if (captureState.latestEntry) {
        captureState.latestEntry.archived = archive.latestEntry?.archivedAt || "已沉淀";
      }
      const files = (archive.updatedFiles || []).slice(0, 4).join("，");
      captureStatus.textContent = files
        ? `${archive.message} 已联动：${files}`
        : archive.message;
    } catch (error) {
      captureStatus.textContent = `沉淀失败：${error.message}`;
    } finally {
      homeState.depositingLatestCapture = false;
      renderLatestCaptureEntry();
    }
  }

  async function startNewDay() {
    if (homeState.startingNewDay) {
      return;
    }

    homeState.startingNewDay = true;
    startNewDayButton.disabled = true;
    startNewDayButton.textContent = "收口中...";
    homeNote.textContent = "正在保存昨天的收口快照，随后转到后台整理。";

    try {
      const saveTodayOk = await saveHomeIndex("today");
      const saveCheckinOk = await saveCheckin();
      const saveCoreOk = await saveCoreContribution();

      if (!saveTodayOk || !saveCheckinOk || !saveCoreOk) {
        throw new Error("昨天的输入还没成功同步，请稍后再试");
      }

      const response = await fetch(`${homeApiBase}/api/start-new-day`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archivedDate: dailyCheckin.date || coreContribution.date || "",
          nextDate: getLocalDateString(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok || !result.jobId) {
        throw new Error(result.error || "start new day failed");
      }

      homeNote.textContent = `已保存到临时队列，正在后台整理。通常需要 1 到 20 秒。`;

      const payload = await pollBackgroundJob(result.jobId);
      dailyCheckin.date = payload.dailyCheckin.date;
      dailyCheckin.items = payload.dailyCheckin.items;
      coreContribution.date = payload.coreContribution.date;
      coreContribution.content = payload.coreContribution.content;
      renderCheckin();
      renderCoreContribution();
      if (captureState.latestEntry) {
        captureState.latestEntry.archived = `已归档 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
        renderLatestCaptureEntry();
      }
      homeIndex.todayItems = Array.isArray(payload.todayPlan?.items) ? payload.todayPlan.items : [];
      renderToday();
      homeNote.innerHTML = renderStartNewDaySummary(payload);
    } catch (error) {
      homeNote.textContent = `新的一天执行失败：${error.message}`;
    } finally {
      homeState.startingNewDay = false;
      startNewDayButton.disabled = false;
      startNewDayButton.textContent = "新的一天";
    }
  }

  function appendCheckinItem() {
    dailyCheckin.items.push({
      title: "",
      slot: "",
      status: "未完成",
    });
    renderCheckin();
    const latestTitle = document.querySelector(`[data-checkin-title="${dailyCheckin.items.length - 1}"]`);
    if (latestTitle) {
      latestTitle.focus();
    }
  }

  function appendTodayPlan() {
    homeIndex.todayItems.push({
      order: homeIndex.todayItems.length + 1,
      description: "",
      status: "未完成",
      planId: createClientPlanId(),
      schedulePlacement: "",
    });
    renderToday();
    const latest = document.querySelector(`[data-plan-title="${homeIndex.todayItems.length - 1}"]`);
    if (latest) {
      latest.focus();
    }
  }

  function appendDdlItem() {
    homeIndex.ddlItems.push({
      deadline: "",
      description: "",
    });
    ddlUiState.editing = true;
    renderDdl();
    const latest = document.querySelector(`[data-ddl-date="${homeIndex.ddlItems.length - 1}"]`);
    if (latest) {
      latest.focus();
    }
  }

  addTodayPlan.addEventListener("click", appendTodayPlan);
  startNewDayButton.addEventListener("click", startNewDay);
  addDdlItemButton.addEventListener("click", appendDdlItem);
  toggleDdlEditButton.addEventListener("click", () => {
    ddlUiState.editing = !ddlUiState.editing;
    renderDdl();
  });
  addDailyCheckin.addEventListener("click", appendCheckinItem);
  coreContributionInput.addEventListener("input", queueCoreContributionSave);
  captureTextInput.addEventListener("input", autosizeCaptureInput);
  captureTextInput.addEventListener("keydown", (event) => {
    if (event.isComposing) {
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    if (event.altKey) {
      return;
    }

    event.preventDefault();
    saveCapture();
  });
  capturePhotoInput.addEventListener("change", () => {
    updateCaptureFileStatus(capturePhotoInput.files?.[0]);
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    captureDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      captureDropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    captureDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName !== "drop") {
        captureDropzone.classList.remove("is-dragover");
      }
    });
  });
  captureDropzone.addEventListener("drop", (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("image/"));
    captureDropzone.classList.remove("is-dragover");
    if (!file) {
      captureStatus.textContent = "拖拽时请放图片文件。";
      return;
    }
    syncDroppedFiles([file]);
    captureStatus.textContent = `已接收图片：${file.name}`;
  });
  saveCaptureButton.addEventListener("click", saveCapture);
  archiveCaptureButton.addEventListener("click", archiveCapture);
  clearCaptureButton.addEventListener("click", () => {
    resetCaptureInputs();
    captureStatus.textContent = "支持文字、拖拽图片和点选图片。";
  });
  capturePanel.addEventListener("click", (event) => {
    const interactiveSelector = "textarea, input, button, label, a, .capture-actions, .home-capture-composer";
    if (event.target.closest(interactiveSelector)) {
      return;
    }
    window.location.href = captureDetailUrl;
  });
  renderToday();
  renderDdl();
  renderCheckin();
  renderCoreContribution();
  renderLatestCaptureEntry();
  autosizeCaptureInput();
  renderCurrentDate();
  renderYesterdayLink();
  window.setInterval(renderCurrentDate, 60000);
}

initHome();
