(function initCoupleDashboard() {
  const root = document.querySelector("#couple-app-root");
  if (!root) return;

  const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:2333" : window.location.origin;
  const captureSubmitActions = new Set(["save", "analysis", "todo"]);
  const priorityLabels = {
    high: "重要",
    normal: "普通",
    low: "低优先级",
  };
  const segmentAliases = [
    { key: "allDay", words: ["全天", "整天", "这天"] },
    { key: "morning", words: ["上午", "早上", "早晨", "今早"] },
    { key: "noon", words: ["中午", "午间"] },
    { key: "afternoon", words: ["下午"] },
    { key: "evening", words: ["晚上", "今晚", "夜里"] },
  ];
  const weekdayIndex = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  const pageDefinitions = [
    {
      id: "dashboard",
      label: "Dashboard",
      kicker: "Shared Dashboard",
      title: "今天两个人怎么样",
      note: "先看两个人当天和本月完成情况，再进入具体页面处理事项。",
    },
    {
      id: "capture",
      label: "随手记",
      kicker: "Quick Capture",
      title: "随手记",
      note: "把临时想法、地点、照片先放进这里，再选择交给 Agent 或直接生成 Todo。",
    },
    {
      id: "todos",
      label: "Todo",
      kicker: "Todo & Check-in",
      title: "Todo 和打卡",
      note: "处理今天要推进的事、共同打卡和重要日期。",
    },
    {
      id: "schedule",
      label: "日程",
      kicker: "Schedule",
      title: "日程",
      note: "这里只放具体安排；每天的完成情况在 Dashboard 用短标记显示。",
    },
    {
      id: "timeline",
      label: "时间轴",
      kicker: "Timeline",
      title: "一周时间轴",
      note: "左边是当前登录的人，右边是另一位；Todo、日程和随手记按日期排好。",
    },
    {
      id: "goals",
      label: "长期目标",
      kicker: "Long Goals",
      title: "长期目标",
      note: "记录想成为什么样的人，以及未来想一起做的事情。",
    },
    {
      id: "daily-summary",
      label: "日总结",
      kicker: "Daily Story",
      title: "自动日总结",
      note: "由随手记、Todo、日程、打卡、地点和照片自动整理。",
    },
    {
      id: "settings",
      label: "设置",
      kicker: "Settings",
      title: "设置",
      note: "调整自己的昵称、头像和代表颜色。",
    },
  ];
  const pageIds = new Set(pageDefinitions.map((page) => page.id));

  const state = {
    authenticated: false,
    bootstrap: null,
    data: null,
    selectedDate: getToday(),
    view: "all",
    activePage: getPageFromHash(),
    dashboardMode: "day",
    todoMode: "today",
    captureMode: "save",
    pagesMode: "future",
    activeSegment: "evening",
    quickOwner: "shared",
    editTodoId: "",
    selectedScheduleId: "",
    login: {
      login: "",
      error: "",
    },
    status: "",
    sync: {
      active: false,
      pendingState: null,
      pendingDate: "",
      message: "协作同步准备中",
    },
    loading: false,
  };

  function getToday() {
    return formatDate(new Date());
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(dateText) {
    const parsed = new Date(`${dateText}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function addDays(dateText, offset) {
    const date = parseDate(dateText) || new Date();
    date.setDate(date.getDate() + offset);
    return formatDate(date);
  }

  function escapeHtml(input) {
    return String(input == null ? "" : input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(input) {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizePageId(value) {
    const pageId = String(value || "").replace(/^#/, "");
    if (pageId === "pages") return "goals";
    return pageIds.has(pageId) ? pageId : "dashboard";
  }

  function getPageFromHash() {
    return normalizePageId(window.location.hash || "dashboard");
  }

  function activePageSpec() {
    return pageDefinitions.find((page) => page.id === state.activePage) || pageDefinitions[0];
  }

  function setActivePage(pageId) {
    const nextPage = normalizePageId(pageId);
    if (state.activePage === nextPage) {
      syncTopNavigation();
      return;
    }
    state.activePage = nextPage;
    state.editTodoId = "";
    renderApp();
  }

  function syncTopNavigation() {
    document.querySelectorAll(".couple-nav a").forEach((link) => {
      const pageId = normalizePageId(link.getAttribute("href"));
      if (pageId === state.activePage) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function isTyping() {
    const active = document.activeElement;
    return Boolean(active?.closest("input, textarea, select"));
  }

  function syncMessage() {
    if (state.sync.pendingState) return "有新更新，输入结束后同步";
    return state.sync.message || "协作同步已开启";
  }

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      state.authenticated = false;
      state.data = null;
      state.login.error = result.error || "需要先登录。";
      renderLogin();
      return null;
    }

    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "request failed");
    }

    return result;
  }

  function setData(nextData) {
    state.authenticated = true;
    state.data = nextData;
    state.selectedDate = nextData.selectedDate || state.selectedDate;
    if (state.sync.pendingState && Number(state.sync.pendingState.revision || 0) <= Number(nextData.revision || 0)) {
      state.sync.pendingState = null;
      state.sync.pendingDate = "";
    }
    if (!state.login.login && nextData.currentUser?.login) {
      state.login.login = nextData.currentUser.login;
    }
  }

  function applyRemoteState(nextState, message = "已同步对方的更新。") {
    setData(nextState);
    state.sync.pendingState = null;
    state.sync.pendingDate = "";
    state.sync.message = "协作同步已开启";
    state.status = message;
    renderApp();
  }

  function queueRemoteState(nextState) {
    state.sync.pendingState = nextState;
    state.sync.pendingDate = nextState.selectedDate || state.selectedDate;
    state.sync.message = "有新更新，输入结束后同步";
  }

  function applyPendingRemoteState() {
    if (!state.sync.pendingState || isTyping()) return false;
    if (state.sync.pendingDate && state.sync.pendingDate !== state.selectedDate) {
      state.sync.pendingState = null;
      state.sync.pendingDate = "";
      return false;
    }
    if (Number(state.sync.pendingState.revision || 0) <= Number(state.data?.revision || 0)) {
      state.sync.pendingState = null;
      state.sync.pendingDate = "";
      state.sync.message = "协作同步已开启";
      return false;
    }
    applyRemoteState(state.sync.pendingState, "已同步输入期间收到的更新。");
    return true;
  }

  function startCollaborationSync() {
    if (state.sync.active) return;
    state.sync.active = true;
    state.sync.message = "协作同步已开启";
    window.setTimeout(collaborationSyncLoop, 350);
  }

  async function collaborationSyncLoop() {
    while (state.sync.active && state.authenticated) {
      const currentRevision = Number(state.data?.revision || 0);
      const requestDate = state.selectedDate;

      if (!currentRevision) {
        await delay(1200);
        continue;
      }

      if (applyPendingRemoteState()) {
        await delay(250);
        continue;
      }

      if (state.sync.pendingState && isTyping()) {
        await delay(1000);
        continue;
      }

      try {
        const result = await request(
          `/api/couple/state?date=${encodeURIComponent(requestDate)}&since=${currentRevision}&wait=1&timeoutMs=25000`
        );
        if (!result || !state.authenticated) break;

        const latestLocalRevision = Number(state.data?.revision || 0);
        if (result.state && result.state.revision > latestLocalRevision && requestDate === state.selectedDate) {
          if (isTyping()) {
            queueRemoteState(result.state);
          } else {
            applyRemoteState(result.state);
          }
        } else {
          state.sync.message = "协作同步已开启";
        }
      } catch (error) {
        if (!state.authenticated) break;
        state.sync.message = `协作同步暂时断开：${error.message}`;
        await delay(3000);
      }

      await delay(250);
    }

    state.sync.active = false;
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function loadSession() {
    try {
      const result = await request(`/api/couple/session?date=${encodeURIComponent(state.selectedDate)}`);
      if (!result) return;

      if (result.authenticated) {
        setData(result.state);
        startCollaborationSync();
        renderApp();
        return;
      }

      state.authenticated = false;
      state.bootstrap = {
        space: result.space,
        profiles: result.profiles || [],
        apiVersion: result.apiVersion,
      };
      state.login.login = state.login.login || result.profiles?.[0]?.login || "";
      renderLogin();
    } catch (error) {
      renderError(error.message);
    }
  }

  async function refreshState(options = {}) {
    if (!state.authenticated) return;
    if (options.silent && isTyping()) return;

    try {
      const result = await request(`/api/couple/state?date=${encodeURIComponent(state.selectedDate)}`);
      if (!result) return;
      setData(result.state);
      if (!options.silent) {
        state.status = "已同步最新数据。";
      }
      renderApp();
    } catch (error) {
      state.status = `同步失败：${error.message}`;
      renderApp();
    }
  }

  async function selectDate(date) {
    state.selectedDate = date;
    state.editTodoId = "";
    state.selectedScheduleId = "";
    await refreshState();
  }

  async function login(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const loginName = String(formData.get("login") || state.login.login || "").trim();
    const password = String(formData.get("password") || "").trim();
    state.login.login = loginName;
    state.login.error = "";
    renderLogin();

    try {
      const result = await request("/api/couple/login", {
        method: "POST",
        body: {
          login: loginName,
          password,
          date: state.selectedDate,
        },
      });
      if (!result) return;
      setData(result.state);
      startCollaborationSync();
      state.status = "登录成功，正在查看共享首页。";
      renderApp();
    } catch (error) {
      state.login.error = error.message === "invalid login or password" ? "登录名或访问码不对。" : error.message;
      renderLogin();
    }
  }

  async function logout() {
    await request("/api/couple/logout", { method: "POST", body: {} });
    state.sync.active = false;
    state.sync.pendingState = null;
    state.sync.pendingDate = "";
    state.authenticated = false;
    state.data = null;
    state.status = "";
    await loadSession();
  }

  function profiles() {
    return state.data?.profiles || state.bootstrap?.profiles || [];
  }

  function currentUser() {
    return state.data?.currentUser || null;
  }

  function getProfile(userId) {
    return profiles().find((profile) => profile.id === userId);
  }

  function profileName(userId) {
    return getProfile(userId)?.displayName || "未知";
  }

  function profileStyle(userId) {
    const profile = getProfile(userId);
    return profile ? `style="--person-color: ${escapeHtml(profile.color)}"` : "";
  }

  function renderAvatar(profileOrUserId, className = "", options = {}) {
    const profile = typeof profileOrUserId === "string" ? getProfile(profileOrUserId) : profileOrUserId;
    if (!profile) {
      return `<span class="pixel-person-cat person-avatar ${escapeHtml(className)}" aria-hidden="true"></span>`;
    }
    const style = `style="--person-color: ${escapeHtml(profile.color)}"`;
    const label = escapeHtml(profile.displayName || "成员头像");
    if (profile.avatarUrl && options.allowImage !== false) {
      return `
        <span class="person-avatar has-image ${escapeHtml(className)}" ${style}>
          <img src="${escapeHtml(profile.avatarUrl)}" alt="${label}" />
        </span>
      `;
    }
    return `<span class="pixel-person-cat person-avatar ${escapeHtml(className)}" ${style} aria-hidden="true"></span>`;
  }

  function selectedDay() {
    return state.data?.weekDays?.find((day) => day.id === state.selectedDate) || {
      id: state.selectedDate,
      label: "",
      shortLabel: state.selectedDate.slice(5),
    };
  }

  function ownerToParticipants(ownerId) {
    if (ownerId === "shared") {
      return profiles().map((profile) => profile.id);
    }
    return [ownerId || currentUser()?.id].filter(Boolean);
  }

  function itemMatchesView(item) {
    return Boolean(item);
  }

  function isArchived(item) {
    return Boolean(item?.archivedAt);
  }

  function itemsForDate(date) {
    return (state.data?.scheduleItems || []).filter((item) => item.date === date);
  }

  function capturesForSelectedDate() {
    return state.data?.captures || [];
  }

  function todoItemsForMode() {
    return (state.data?.todoItems || [])
      .filter(itemMatchesView)
      .filter((item) => {
        if (state.todoMode === "future") return item.bucket === "future";
        if (state.todoMode === "all") return true;
        return item.bucket !== "future" && item.date === state.selectedDate;
      });
  }

  function futureItems() {
    return (state.data?.todoItems || [])
      .filter((item) => item.bucket === "future")
      .filter(itemMatchesView);
  }

  function checkinItemsForView() {
    return state.data?.checkinItems || [];
  }

  function deadlineItemsForView() {
    return (state.data?.deadlineItems || []).filter(itemMatchesView);
  }

  function visibleItemsForCell(date, segment) {
    return (state.data?.scheduleItems || [])
      .filter((item) => item.date === date && item.segment === segment)
      .filter(itemMatchesView);
  }

  function scheduleItemsForWeek() {
    return (state.data?.scheduleItems || []).filter(itemMatchesView);
  }

  function scheduleItemsForDate(date) {
    return scheduleItemsForWeek().filter((item) => item.date === date);
  }

  function selectedScheduleItem() {
    const items = scheduleItemsForWeek();
    return items.find((item) => item.id === state.selectedScheduleId) ||
      scheduleItemsForDate(state.selectedDate)[0] ||
      items[0] ||
      null;
  }

  function segmentLabel(segmentKey) {
    return state.data?.segments?.find((segment) => segment.key === segmentKey)?.label || "全天";
  }

  function getProfileDayThings(userId, date = state.selectedDate) {
    const schedule = itemsForDate(date)
      .filter((item) => item.participants.includes(userId))
      .map((item) => ({
        id: item.id,
        kind: "日程",
        title: item.title,
        done: item.statusByUser?.[userId] === "done",
      }));
    const todos = (state.data?.todoItems || [])
      .filter((item) => item.date === date && item.bucket !== "future" && item.participants.includes(userId))
      .map((item) => ({
        id: item.id,
        kind: "Todo",
        title: item.title,
        done: item.statusByUser?.[userId] === "done",
      }));
    const checkins = (state.data?.checkinItems || [])
      .filter((item) => item.participants.includes(userId))
      .map((item) => ({
        id: item.id,
        kind: "打卡",
        title: item.title,
        done: item.statusByUser?.[userId] === "done",
      }));
    return [...todos, ...schedule, ...checkins];
  }

  function getCompletion(userId, date = state.selectedDate) {
    const monthDay = state.data?.monthSummary?.days?.find((day) => day.id === date);
    if (monthDay?.userStats?.[userId]) {
      return monthDay.userStats[userId];
    }

    const items = getProfileDayThings(userId, date);
    const done = items.filter((item) => item.done).length;
    return {
      done,
      total: items.length,
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
    };
  }

  function dailyPulseDoneCount(day = {}) {
    return [
      Number(day.dailyScore || 0) > 0,
      Boolean(String(day.happiestThing || "").trim()),
      Boolean(String(day.smallAchievement || "").trim()),
    ].filter(Boolean).length;
  }

  function renderOwnerOptions(selectedOwner = state.quickOwner) {
    return `
      <option value="shared"${selectedOwner === "shared" ? " selected" : ""}>共同</option>
      ${profiles()
        .map(
          (profile) => `
            <option value="${escapeHtml(profile.id)}"${selectedOwner === profile.id ? " selected" : ""}>
              ${escapeHtml(profile.displayName)}
            </option>
          `
        )
        .join("")}
    `;
  }

  function ownerLabel(ownerId) {
    return ownerId === "shared" ? "共同" : profileName(ownerId);
  }

  function thingClass(item) {
    if (item.bucket === "future") return "未来";
    return item.ownerId === "shared" || item.participants.length > 1 ? "双人" : "单人";
  }

  function renderStatusControl(item, userId, type) {
    const done = item.statusByUser?.[userId] === "done";
    const profile = getProfile(userId);
    const label = type === "schedule" || type === "checkin" ? profile?.initials || "?" : profileName(userId);
    const dataAttrs =
      type === "todo"
        ? `data-toggle-todo="${escapeHtml(item.id)}" data-toggle-user="${escapeHtml(userId)}" data-toggle-date="${escapeHtml(item.date)}"`
        : type === "schedule"
          ? `data-toggle-item="${escapeHtml(item.id)}" data-toggle-user="${escapeHtml(userId)}" data-toggle-date="${escapeHtml(item.date)}"`
          : `data-toggle-checkin="${escapeHtml(item.id)}" data-toggle-user="${escapeHtml(userId)}"`;

    if (userId !== currentUser()?.id) {
      return `
        <span class="person-status-badge${done ? " is-done" : ""}" ${profileStyle(userId)} title="${escapeHtml(profileName(userId))}">
          ${escapeHtml(label)}${type === "todo" ? (done ? " 已完成" : " 待完成") : ""}
        </span>
      `;
    }

    return `
      <button
        class="person-toggle ${type === "todo" ? "todo-toggle" : ""}${done ? " is-done" : ""}"
        ${profileStyle(userId)}
        ${dataAttrs}
        type="button"
        title="${escapeHtml(profileName(userId))}${done ? "已完成" : "待完成"}"
      >
        ${type === "todo" ? `<span aria-hidden="true"></span>` : ""}
        ${escapeHtml(label)}
      </button>
    `;
  }

  function resolveQuickDate(raw, fallbackDate) {
    if (/明天/.test(raw)) return addDays(getToday(), 1);
    if (/今天|今日|今晚|今早/.test(raw)) return getToday();

    const explicitDate = raw.match(/(\d{4}-\d{2}-\d{2})/);
    if (explicitDate) return explicitDate[1];

    const monthDay = raw.match(/(\d{1,2})[./-](\d{1,2})/);
    if (monthDay) {
      const selected = parseDate(state.selectedDate) || new Date();
      return `${selected.getFullYear()}-${String(monthDay[1]).padStart(2, "0")}-${String(monthDay[2]).padStart(2, "0")}`;
    }

    const weekDay = raw.match(/周([一二三四五六日天])/);
    if (weekDay && state.data?.weekDays?.length) {
      return state.data.weekDays[weekdayIndex[weekDay[1]]]?.id || state.selectedDate;
    }

    return fallbackDate || state.selectedDate;
  }

  function resolveQuickSegment(raw, fallbackSegment) {
    return segmentAliases.find((item) => item.words.some((word) => raw.includes(word)))?.key ||
      fallbackSegment ||
      state.activeSegment;
  }

  function cleanQuickTitle(raw) {
    return raw
      .replace(/\d{4}-\d{2}-\d{2}/g, "")
      .replace(/\d{1,2}[./-]\d{1,2}/g, "")
      .replace(/今天|今日|今晚|今早|明天/g, "")
      .replace(/周[一二三四五六日天]/g, "")
      .replace(/全天|整天|这天|上午|早上|早晨|今早|中午|午间|下午|晚上|今晚|夜里/g, "")
      .replace(/[，,。；;：:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeUrl(url) {
    const value = String(url || "").trim();
    if (/^\/__content\//.test(value) || /^https?:\/\//i.test(value)) {
      return value;
    }
    return "";
  }

  function renderInlineMarkdown(input) {
    let html = escapeHtml(input);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const href = safeUrl(url);
      if (!href) return label;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`;
    });
    return html;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || "").split("\n");
    const html = [];
    let inList = false;

    function closeList() {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
    }

    lines.forEach((line) => {
      const raw = line.trim();
      if (!raw) {
        closeList();
        return;
      }

      const imageMatch = raw.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch) {
        closeList();
        const src = safeUrl(imageMatch[2]);
        if (src) {
          html.push(`
            <figure>
              <img src="${escapeHtml(src)}" alt="${escapeHtml(imageMatch[1] || "diary image")}" />
              ${imageMatch[1] ? `<figcaption>${escapeHtml(imageMatch[1])}</figcaption>` : ""}
            </figure>
          `);
        }
        return;
      }

      if (raw.startsWith("### ")) {
        closeList();
        html.push(`<h4>${renderInlineMarkdown(raw.slice(4))}</h4>`);
        return;
      }
      if (raw.startsWith("## ")) {
        closeList();
        html.push(`<h3>${renderInlineMarkdown(raw.slice(3))}</h3>`);
        return;
      }
      if (raw.startsWith("# ")) {
        closeList();
        html.push(`<h2>${renderInlineMarkdown(raw.slice(2))}</h2>`);
        return;
      }
      if (/^[-*]\s+/.test(raw)) {
        if (!inList) {
          html.push("<ul>");
          inList = true;
        }
        html.push(`<li>${renderInlineMarkdown(raw.replace(/^[-*]\s+/, ""))}</li>`);
        return;
      }

      closeList();
      html.push(`<p>${renderInlineMarkdown(raw)}</p>`);
    });

    closeList();
    return html.length ? html.join("") : `<p class="markdown-empty">还没有写正文。</p>`;
  }

  async function addScheduleFromForm(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const raw = String(formData.get("title") || "").trim();
    if (!raw) return;

    const ownerId = String(formData.get("ownerId") || state.quickOwner || "shared");
    const fallbackDate = String(formData.get("date") || state.selectedDate);
    const fallbackSegment = String(formData.get("segment") || state.activeSegment);
    const date = resolveQuickDate(raw, fallbackDate);
    const segment = resolveQuickSegment(raw, fallbackSegment);
    const title = cleanQuickTitle(raw) || raw;
    const detail = String(formData.get("detail") || "").trim();

    state.loading = true;
    state.status = "正在写入共享日程 ...";
    renderApp();

    try {
      const result = await request("/api/couple/schedule/upsert", {
        method: "POST",
        body: {
          date,
          segment,
          title,
          detail,
          ownerId,
          participants: ownerToParticipants(ownerId),
        },
      });
      if (!result) return;
      setData(result.state);
      state.selectedDate = date;
      state.activeSegment = segment;
      state.quickOwner = ownerId;
      state.selectedScheduleId = result.item?.id || "";
      state.status = `已加入日程：${title}`;
      state.loading = false;
      renderApp();
    } catch (error) {
      state.loading = false;
      state.status = `添加失败：${error.message}`;
      renderApp();
    }
  }

  async function addScheduleFromCell(date, segment) {
    state.selectedDate = date;
    state.activeSegment = segment;
    state.status = "已选中这个日程格，右侧可以直接快速添加。";
    renderApp();
    window.setTimeout(() => document.querySelector("#quick-title")?.focus(), 0);
  }

  async function toggleScheduleItem(itemId, targetUserId, date) {
    const item = state.data?.scheduleItems?.find((entry) => entry.id === itemId);
    if (item) {
      const current = item.statusByUser?.[targetUserId] === "done" ? "done" : "todo";
      item.statusByUser = {
        ...(item.statusByUser || {}),
        [targetUserId]: current === "done" ? "todo" : "done",
      };
      state.status = "日程状态已更新。";
      renderApp();
    }

    try {
      const result = await request("/api/couple/schedule/toggle", {
        method: "POST",
        body: {
          id: itemId,
          targetUserId,
          date,
        },
      });
      if (!result) return;
      setData(result.state);
      state.status = "日程状态已同步。";
      renderApp();
    } catch (error) {
      state.status = `更新失败：${error.message}`;
      await refreshState();
    }
  }

  async function deleteScheduleItem(itemId, date) {
    const result = await request("/api/couple/schedule/delete", {
      method: "POST",
      body: {
        id: itemId,
        date,
      },
    });
    if (!result) return;
    setData(result.state);
    if (state.selectedScheduleId === itemId) {
      state.selectedScheduleId = "";
    }
    state.status = "已删除这条日程。";
    renderApp();
  }

  async function archiveScheduleItem(itemId, date) {
    const result = await request("/api/couple/schedule/archive", {
      method: "POST",
      body: {
        id: itemId,
        date,
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "日程已归档，仍会用弱色保留在列表里。";
    renderApp();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("file read failed"));
      reader.readAsDataURL(file);
    });
  }

  function captureTitle(text) {
    return String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 120) || "随手记";
  }

  function captureDetail(text, title) {
    const value = String(text || "").trim();
    return value === title ? "" : value;
  }

  async function saveCapture(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = String(formData.get("text") || "").trim();
    if (!text) return;

    const submitMode = event.submitter?.dataset?.captureSubmitMode || event.submitter?.value || "";
    const modeSource = String(submitMode || formData.get("mode") || state.captureMode || "save");
    const mode = captureSubmitActions.has(modeSource) ? modeSource : "save";
    const ownerId = String(formData.get("ownerId") || "shared");
    const visibility = formData.get("visibility") || "shared";
    const location = String(formData.get("location") || "").trim();
    const photo = event.currentTarget.querySelector('input[name="photo"]')?.files?.[0] || null;
    const captureDate = mode === "todo" ? resolveQuickDate(text, state.selectedDate) : state.selectedDate;

    try {
      let assets = [];
      if (photo) {
        if (photo.size > 5 * 1024 * 1024) {
          state.status = "随手记图片不能超过 5MB。";
          renderApp();
          return;
        }
        assets = [
          {
            name: photo.name,
            dataUrl: await readFileAsDataUrl(photo),
          },
        ];
      }
      const captureResult = await request("/api/couple/capture", {
        method: "POST",
        body: {
          date: captureDate,
          text,
          mode,
          visibility,
          location,
          assets,
        },
      });
      if (!captureResult) return;
      setData(captureResult.state);

      if (mode === "todo") {
        const cleanedTitle = cleanQuickTitle(text);
        const title = captureTitle(cleanedTitle || text);
        const result = await request("/api/couple/todos/upsert", {
          method: "POST",
          body: {
            date: captureDate,
            title,
            detail: captureDetail(text, title),
            bucket: "today",
            priority: "normal",
            ownerId,
            participants: ownerToParticipants(ownerId),
          },
        });
        if (!result) return;
        setData(result.state);
        state.selectedDate = captureDate;
        state.todoMode = "today";
        state.activePage = "todos";
        state.status = "随手记已保存，并生成 Todo。";
        if (window.location.hash !== "#todos") {
          window.location.hash = "#todos";
        }
        renderApp();
        return;
      }
      state.status = mode === "analysis" ? "随手记已提交给 Agent。" : "随手记已记下。";
      renderApp();
    } catch (error) {
      state.status = `随手记保存失败：${error.message}`;
      renderApp();
    }
  }

  async function refreshDailySummary() {
    state.status = "正在刷新自动日总结 ...";
    renderApp();
    try {
      const result = await request("/api/couple/daily-summary/refresh", {
        method: "POST",
        body: {
          date: state.selectedDate,
        },
      });
      if (!result) return;
      setData(result.state);
      state.status = "自动日总结已刷新。";
      renderApp();
    } catch (error) {
      state.status = `日总结刷新失败：${error.message}`;
      renderApp();
    }
  }

  async function saveDailyPulse(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await request("/api/couple/status", {
      method: "POST",
      body: {
        date: state.selectedDate,
        dailyScore: formData.get("dailyScore") || 0,
        happiestThing: formData.get("happiestThing") || "",
        smallAchievement: formData.get("smallAchievement") || "",
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "每日小打卡已保存。";
    renderApp();
  }

  async function savePersonalPage(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await request("/api/couple/personal-page", {
      method: "POST",
      body: {
        date: state.selectedDate,
        title: formData.get("title") || "",
        bio: formData.get("bio") || "",
        likes: formData.get("likes") || "",
        longTermGoal: formData.get("longTermGoal") || "",
        identityGoal: formData.get("identityGoal") || "",
        notes: formData.get("notes") || "",
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "个人页已保存。";
    renderApp();
  }

  async function saveProfileSettings(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const avatarFile = event.currentTarget.querySelector('input[name="avatarFile"]')?.files?.[0] || null;

    try {
      let avatarAsset = null;
      if (avatarFile) {
        if (avatarFile.size > 5 * 1024 * 1024) {
          state.status = "头像图片不能超过 5MB。";
          renderApp();
          return;
        }
        avatarAsset = {
          name: avatarFile.name,
          dataUrl: await readFileAsDataUrl(avatarFile),
        };
      }
      const result = await request("/api/couple/profile", {
        method: "POST",
        body: {
          date: state.selectedDate,
          displayName: formData.get("displayName") || "",
          initials: formData.get("initials") || "",
          color: formData.get("color") || "",
          avatar: formData.get("avatar") || "pink-cat",
          avatarAsset,
        },
      });
      if (!result) return;
      setData(result.state);
      state.status = "设置已保存。";
      renderApp();
    } catch (error) {
      state.status = `设置保存失败：${error.message}`;
      renderApp();
    }
  }

  async function saveTodo(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    if (!title) return;

    const bucket = String(formData.get("bucket") || "today");
    const ownerId = String(formData.get("ownerId") || "shared");
    const date = String(formData.get("date") || state.selectedDate);
    const id = String(formData.get("id") || "");
    const result = await request("/api/couple/todos/upsert", {
      method: "POST",
      body: {
        id: id || undefined,
        date,
        title,
        detail: formData.get("detail") || "",
        bucket,
        priority: formData.get("priority") || "normal",
        ownerId,
        participants: ownerToParticipants(ownerId),
      },
    });
    if (!result) return;
    setData(result.state);
    state.todoMode = bucket === "future" ? "future" : "today";
    state.editTodoId = "";
    state.status = id ? "Todo 已更新。" : bucket === "future" ? "已加入未来想做。" : "Todo 已保存。";
    renderApp();
  }

  async function toggleTodo(itemId, targetUserId, date) {
    const item = state.data?.todoItems?.find((entry) => entry.id === itemId);
    if (item) {
      const current = item.statusByUser?.[targetUserId] === "done" ? "done" : "todo";
      item.statusByUser = {
        ...(item.statusByUser || {}),
        [targetUserId]: current === "done" ? "todo" : "done",
      };
      state.status = "Todo 状态已更新。";
      renderApp();
    }

    try {
      const result = await request("/api/couple/todos/toggle", {
        method: "POST",
        body: {
          id: itemId,
          targetUserId,
          date: date || state.selectedDate,
        },
      });
      if (!result) return;
      setData(result.state);
      state.status = "Todo 状态已同步。";
      renderApp();
    } catch (error) {
      state.status = `Todo 更新失败：${error.message}`;
      await refreshState();
    }
  }

  async function deleteTodo(itemId) {
    const result = await request("/api/couple/todos/delete", {
      method: "POST",
      body: {
        id: itemId,
        date: state.selectedDate,
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "Todo 已删除。";
    renderApp();
  }

  async function archiveTodo(itemId, date = state.selectedDate) {
    const result = await request("/api/couple/todos/archive", {
      method: "POST",
      body: {
        id: itemId,
        date,
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "Todo 已归档，仍会用弱色保留在列表里。";
    renderApp();
  }

  async function saveCheckin(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    if (!title) return;

    const result = await request("/api/couple/checkins/upsert", {
      method: "POST",
      body: {
        date: state.selectedDate,
        title,
        slot: formData.get("slot") || "",
        ownerId: "shared",
        participants: profiles().map((profile) => profile.id),
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "打卡项已保存。";
    renderApp();
  }

  async function toggleCheckin(itemId, targetUserId) {
    const item = state.data?.checkinItems?.find((entry) => entry.id === itemId);
    if (item) {
      const current = item.statusByUser?.[targetUserId] === "done" ? "done" : "todo";
      item.statusByUser = {
        ...(item.statusByUser || {}),
        [targetUserId]: current === "done" ? "todo" : "done",
      };
      state.status = "打卡状态已更新。";
      renderApp();
    }

    try {
      const result = await request("/api/couple/checkins/toggle", {
        method: "POST",
        body: {
          id: itemId,
          targetUserId,
          date: state.selectedDate,
        },
      });
      if (!result) return;
      setData(result.state);
      state.status = "打卡状态已同步。";
      renderApp();
    } catch (error) {
      state.status = `打卡更新失败：${error.message}`;
      await refreshState();
    }
  }

  async function deleteCheckin(itemId) {
    const result = await request("/api/couple/checkins/delete", {
      method: "POST",
      body: {
        id: itemId,
        date: state.selectedDate,
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "打卡项已删除。";
    renderApp();
  }

  async function saveDeadline(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const date = String(formData.get("date") || "").trim();
    if (!title || !date) return;

    const ownerId = String(formData.get("ownerId") || "shared");
    const result = await request("/api/couple/deadlines/upsert", {
      method: "POST",
      body: {
        date,
        title,
        detail: formData.get("detail") || "",
        ownerId,
        participants: ownerToParticipants(ownerId),
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "重要日期已保存。";
    renderApp();
  }

  async function deleteDeadline(itemId) {
    const result = await request("/api/couple/deadlines/delete", {
      method: "POST",
      body: {
        id: itemId,
        date: state.selectedDate,
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "重要日期已删除。";
    renderApp();
  }

  function renderLogin() {
    const bootstrap = state.bootstrap || { profiles: [], space: { name: "我们的共同日程" } };
    const selectedLogin = state.login.login || bootstrap.profiles?.[0]?.login || "";

    root.innerHTML = `
      <section class="couple-login-panel">
        <div class="couple-login-copy">
          <span class="pixel-cat-mark pixel-cat-mark-large" aria-hidden="true"></span>
          <p class="couple-kicker">Pink Cat Workspace</p>
          <h1>${escapeHtml(bootstrap.space?.name || "我们的共同日程")}</h1>
          <p>两个人共用的电脑端首页：随手记是主入口，Todo、日程、打卡和自动日总结都从这里沉淀。</p>
          <div class="couple-api-note">
            <strong>Backend API</strong>
            <span>/api/couple/state</span>
            <span>/api/couple/todos/upsert</span>
            <span>/api/couple/daily-summary/refresh</span>
          </div>
        </div>
        <form class="couple-login-form" id="couple-login-form">
          <div class="login-profile-grid">
            ${(bootstrap.profiles || [])
              .map(
                (profile) => `
                  <button
                    class="login-profile-card${profile.login === selectedLogin ? " is-active" : ""}"
                    type="button"
                    data-login-select="${escapeHtml(profile.login)}"
                    style="--person-color: ${escapeHtml(profile.color)}"
                  >
                    ${renderAvatar(profile, "login-avatar", { allowImage: false })}
                    <strong>${escapeHtml(profile.displayName)}</strong>
                    <em>${escapeHtml(profile.login)}</em>
                  </button>
                `
              )
              .join("")}
          </div>
          <input class="sr-only-login" name="login" type="text" value="${escapeHtml(selectedLogin)}" autocomplete="username" tabindex="-1" aria-hidden="true" />
          <label class="couple-field">
            <span>访问码</span>
            <input name="password" type="password" autocomplete="current-password" placeholder="输入你的访问码" autofocus />
          </label>
          ${state.login.error ? `<p class="couple-form-error">${escapeHtml(state.login.error)}</p>` : ""}
          <button class="pixel-primary-button" type="submit">进入共享首页</button>
          <p class="couple-form-help">本地默认账号是 you / partner；部署前用环境变量替换访问码。</p>
        </form>
      </section>
    `;

    root.querySelector("#couple-login-form")?.addEventListener("submit", login);
    root.querySelectorAll("[data-login-select]").forEach((button) => {
      button.addEventListener("click", () => {
        state.login.login = button.dataset.loginSelect || "";
        renderLogin();
      });
    });
    syncTopNavigation();
  }

  function renderError(message) {
    root.innerHTML = `
      <section class="couple-loading couple-error">
        <span class="pixel-cat-mark pixel-cat-mark-large" aria-hidden="true"></span>
        <h1>Backend 没有连上</h1>
        <p>${escapeHtml(message)}</p>
        <button class="pixel-primary-button" id="retry-load" type="button">重试</button>
      </section>
    `;
    root.querySelector("#retry-load")?.addEventListener("click", loadSession);
  }

  function renderApp() {
    const data = state.data;
    if (!data) {
      renderLogin();
      return;
    }

    const day = selectedDay();
    const page = activePageSpec();
    root.innerHTML = `
      <section class="couple-shell couple-app-v2">
        <div class="couple-workspace-head">
          <div class="workspace-title-block">
            <p class="couple-kicker">${escapeHtml(page.kicker)}</p>
            <h1>${escapeHtml(page.title)}</h1>
            <p class="couple-headline-note">${escapeHtml(page.note)}</p>
          </div>
          <div class="couple-session-card">
            ${renderAvatar(currentUser(), "session-avatar")}
            <div>
              <strong>${escapeHtml(currentUser().displayName)}</strong>
              <span>当前登录</span>
            </div>
            <button class="pixel-secondary-button" id="logout-button" type="button">退出</button>
          </div>
        </div>

        <div class="couple-date-bar">
          <button class="pixel-secondary-button" data-date-offset="-1" type="button">上一天</button>
          <button class="couple-date-now" data-jump-today type="button">
            <strong>${escapeHtml(day.label || "")} ${escapeHtml(day.shortLabel || state.selectedDate)}</strong>
            <span>${escapeHtml(state.selectedDate)}</span>
          </button>
          <button class="pixel-secondary-button" data-date-offset="1" type="button">下一天</button>
          <div class="couple-sync-line${state.sync.pendingState ? " is-pending" : ""}">
            <span aria-hidden="true"></span>
            ${escapeHtml(syncMessage())}
          </div>
          <div class="couple-status-line">${escapeHtml(state.status || `Revision ${data.revision} · ${data.updatedAt || ""}`)}</div>
        </div>

        ${renderWorkspaceTabs()}
        <div class="couple-page-view" data-page-view="${escapeHtml(state.activePage)}">
          ${renderCurrentPage()}
        </div>
      </section>
    `;

    bindAppEvents();
    syncTopNavigation();
  }

  function renderWorkspaceTabs() {
    return `
      <nav class="workspace-page-tabs" aria-label="工作区分页">
        ${pageDefinitions
          .map(
            (page) => `
              <a class="${state.activePage === page.id ? "is-active" : ""}" href="#${escapeHtml(page.id)}">
                ${escapeHtml(page.label)}
              </a>
            `
          )
          .join("")}
      </nav>
    `;
  }

  function renderCurrentPage() {
    if (state.activePage === "capture") return renderCaptureHub();
    if (state.activePage === "daily-summary") return renderDailySummaryPanel();
    if (state.activePage === "schedule") return renderSchedulePage();
    if (state.activePage === "timeline") return renderTimelinePage();
    if (state.activePage === "todos") return renderTodosPage();
    if (state.activePage === "goals") return renderGoalsPage();
    if (state.activePage === "settings") return renderSettingsPage();
    return renderDashboard();
  }

  function renderTodosPage() {
    return `
      <div class="couple-dashboard-layout todo-page-layout">
        <main class="couple-main-column">
          ${renderTodoPanel()}
        </main>
        <aside class="couple-side-column">
          ${renderCheckinPanel()}
          ${renderDeadlinePanel()}
        </aside>
      </div>
    `;
  }

  function renderSchedulePage() {
    return `
      <div class="couple-dashboard-layout schedule-page-layout">
        <main class="couple-main-column">
          ${renderScheduleBoard()}
        </main>
        <aside class="couple-side-column">
          ${renderQuickAdd()}
        </aside>
      </div>
    `;
  }

  function renderDashboard() {
    return `
      <section class="couple-panel diary-dashboard-panel dashboard-wide" id="dashboard">
        <div class="couple-panel-head">
          <div>
            <p class="couple-kicker">Dashboard</p>
            <h2>${state.dashboardMode === "month" ? "本月完成情况" : "今天两个人怎么样"}</h2>
          </div>
          <div class="couple-filter-tabs">
            <button class="${state.dashboardMode === "day" ? "is-active" : ""}" data-dashboard-mode="day" type="button">日</button>
            <button class="${state.dashboardMode === "month" ? "is-active" : ""}" data-dashboard-mode="month" type="button">月</button>
          </div>
        </div>
        ${
          state.dashboardMode === "month"
            ? renderMonthDashboard()
            : `
              ${renderDashboardChatBox()}
              <div class="couple-person-grid">
                ${profiles().map((profile) => renderPersonDashboardCard(profile)).join("")}
              </div>
              ${renderDashboardDeadlinePanel()}
            `
        }
      </section>
    `;
  }

  function renderDashboardDeadlinePanel() {
    const deadlines = deadlineItemsForView()
      .filter((item) => item.date >= state.selectedDate)
      .slice(0, 4);
    return `
      <section class="dashboard-mini-panel dashboard-deadline-panel">
        <div class="dashboard-mini-head">
          <strong>重要 DDL</strong>
          <a href="#todos">管理</a>
        </div>
        <div class="dashboard-mini-list">
          ${
            deadlines.length
              ? deadlines
                  .map(
                    (item) => `
                      <article class="dashboard-mini-item is-deadline">
                        <span>${escapeHtml(item.date)}</span>
                        <strong>${escapeHtml(item.title)}</strong>
                        <em>${escapeHtml(ownerLabel(item.ownerId))}</em>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="pixel-empty">还没有重要 DDL。</div>`
          }
        </div>
      </section>
    `;
  }

  function renderDashboardChatBox() {
    const items = dashboardStreamItems();
    return `
      <section class="dashboard-chat-panel">
        <form class="capture-form dashboard-chat-form" data-capture-form>
          <input type="hidden" name="mode" value="save" />
          <input type="hidden" name="ownerId" value="shared" />
          <textarea name="text" rows="3" placeholder="随手记：一句话、Todo、日程线索、地点都先写在这里"></textarea>
          <div class="dashboard-capture-controls">
            <select name="visibility" aria-label="可见范围">
              <option value="shared">共享</option>
              <option value="private">仅自己</option>
            </select>
            <input name="location" type="text" placeholder="地点" autocomplete="off" />
            <div class="dashboard-capture-symbols" aria-label="随手记动作">
              <button class="capture-symbol-button is-save" data-capture-submit-mode="save" type="submit">记下来！</button>
              <button class="capture-symbol-button" data-capture-submit-mode="todo" type="submit" title="转为 Todo" aria-label="转为 Todo">+Todo</button>
              <button class="capture-symbol-button is-primary" data-capture-submit-mode="analysis" type="submit">交给 Agent</button>
            </div>
          </div>
        </form>
        <div class="dashboard-chat-feed">
          <div class="dashboard-mini-head">
            <strong>今天的记录</strong>
            <span>${items.length} 条</span>
          </div>
          <div class="dashboard-stream-list">
            ${
              items.length
                ? items.map((item) => renderDashboardStreamItem(item)).join("")
                : `<div class="pixel-empty dashboard-empty-chat">今天还没有记录。先在上面写一句。</div>`
            }
          </div>
        </div>
      </section>
    `;
  }

  function dashboardStreamItems() {
    const schedules = scheduleItemsForDate(state.selectedDate).map((item) => ({
      type: "schedule",
      id: item.id,
      title: item.title,
      meta: `${segmentLabel(item.segment)} · ${ownerLabel(item.ownerId)}${isArchived(item) ? " · 已归档" : ""}`,
      detail: item.detail || "",
      createdAt: item.createdAt || `${item.date}T00:00:00.000Z`,
      archived: isArchived(item),
      item,
    }));
    const captures = capturesForSelectedDate().map((capture) => ({
      type: "capture",
      id: capture.id,
      title: capture.text,
      meta: `${profileName(capture.createdBy)} · ${captureModeLabel(capture.mode)}${capture.location ? ` · ${capture.location}` : ""}`,
      detail: "",
      createdAt: capture.createdAt || "",
      item: capture,
    }));
    const todos = (state.data?.todoItems || [])
      .filter((item) => item.date === state.selectedDate && item.bucket !== "future")
      .filter(itemMatchesView)
      .map((item) => ({
        type: "todo",
        id: item.id,
        title: item.title,
        meta: `${ownerLabel(item.ownerId)} · ${priorityLabels[item.priority] || "普通"}${isArchived(item) ? " · 已归档" : ""}`,
        detail: item.detail || "",
        createdAt: item.createdAt || `${item.date}T00:00:00.000Z`,
        archived: isArchived(item),
        item,
      }));
    return [...schedules, ...captures, ...todos]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 10);
  }

  function renderDashboardStreamItem(entry) {
    if (entry.type === "schedule") {
      return `
        <button class="dashboard-stream-item is-schedule${entry.archived ? " is-archived" : ""}" data-schedule-detail="${escapeHtml(entry.id)}" data-schedule-date="${escapeHtml(entry.item.date)}" type="button">
          <span>日</span>
          <div>
            <strong>${escapeHtml(entry.title)}</strong>
            <em>${escapeHtml(entry.meta)}</em>
            ${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ""}
          </div>
        </button>
      `;
    }
    if (entry.type === "todo") {
      const doneCount = Object.values(entry.item.statusByUser || {}).filter((status) => status === "done").length;
      const totalCount = entry.item.participants?.length || 1;
      return `
        <article class="dashboard-stream-item is-todo${entry.archived ? " is-archived" : ""}">
          <span>T</span>
          <div>
            <strong>${escapeHtml(entry.title)}</strong>
            <em>${escapeHtml(entry.meta)} · ${doneCount}/${totalCount}</em>
            ${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ""}
          </div>
        </article>
      `;
    }
    return `
      <article class="dashboard-stream-item is-capture">
        <span>记</span>
        <div>
          <strong>${escapeHtml(entry.title)}</strong>
          <em>${escapeHtml(entry.meta)}</em>
        </div>
      </article>
    `;
  }

  function renderPersonDashboardCard(profile) {
    const stats = getCompletion(profile.id);
    const day = state.data?.diaryDay?.userDays?.[profile.id] || {};
    const things = getProfileDayThings(profile.id).slice(0, 5);

    return `
      <article class="person-dashboard-card" style="--person-color: ${escapeHtml(profile.color)}">
        <div class="person-card-top">
          ${renderAvatar(profile, "dashboard-avatar")}
          <div>
            <strong>${escapeHtml(profile.displayName)}</strong>
            <span>${stats.done}/${stats.total} 已完成</span>
          </div>
          <em>${stats.percent}%</em>
        </div>
        <div class="pixel-progress">
          <span style="width: ${stats.percent}%"></span>
        </div>
        ${renderDailyPulseCard(profile, day)}
        <div class="person-thing-list">
          ${
            things.length
              ? things
                  .map(
                    (thing) => `
                      <span class="${thing.done ? "is-done" : ""}">
                        <em>${escapeHtml(thing.kind)}</em>
                        ${escapeHtml(thing.title)}
                      </span>
                    `
                  )
                  .join("")
              : `<span class="is-empty">这一天还没有具体事项。</span>`
          }
        </div>
      </article>
    `;
  }

  function renderDailyPulseCard(profile, day = {}) {
    const score = Number(day.dailyScore || 0);
    const doneCount = dailyPulseDoneCount(day);
    const isOwn = profile.id === currentUser()?.id;

    if (isOwn) {
      return `
        <form class="daily-pulse-form" data-daily-pulse-form style="--person-color: ${escapeHtml(profile.color)}">
          <div class="daily-pulse-score">
            <label>
              <span>今日打分</span>
              <input name="dailyScore" type="number" min="1" max="10" value="${score || ""}" placeholder="/10" />
            </label>
            <em>${doneCount}/3</em>
          </div>
          <input name="happiestThing" type="text" value="${escapeHtml(day.happiestThing || "")}" placeholder="最开心的事" autocomplete="off" />
          <input name="smallAchievement" type="text" value="${escapeHtml(day.smallAchievement || "")}" placeholder="小成就" autocomplete="off" />
          <button class="pixel-secondary-button" type="submit">打卡</button>
        </form>
      `;
    }

    return `
      <div class="daily-pulse-readonly" style="--person-color: ${escapeHtml(profile.color)}">
        <span>今日打分：${score ? `${score}/10` : "未填写"}</span>
        <span>最开心：${escapeHtml(day.happiestThing || "未填写")}</span>
        <span>小成就：${escapeHtml(day.smallAchievement || "未填写")}</span>
      </div>
    `;
  }

  function renderMonthDashboard() {
    const summary = state.data.monthSummary || { days: [], totalsByUser: {}, month: state.selectedDate.slice(0, 7) };
    const todayId = state.data?.today || getToday();
    return `
      <div class="month-dashboard">
        <div class="month-total-row">
          ${profiles()
            .map((profile) => {
              const stat = summary.totalsByUser?.[profile.id] || { done: 0, total: 0, percent: 0 };
              return `
                <div class="month-total-card" style="--person-color: ${escapeHtml(profile.color)}">
                  <span>${escapeHtml(profile.displayName)}</span>
                  <strong>${stat.percent}%</strong>
                  <em>${stat.done}/${stat.total} 本月完成</em>
                </div>
              `;
            })
            .join("")}
        </div>
        <div class="month-grid">
          ${summary.days
            .map((day) => {
              const selected = day.id === state.selectedDate;
              const isFuture = Boolean(day.isFuture || day.id > todayId);
              const totalDone = profiles().reduce((sum, profile) => sum + (day.userStats?.[profile.id]?.done || 0), 0);
              const totalCount = profiles().reduce((sum, profile) => sum + (day.userStats?.[profile.id]?.total || 0), 0);
              const combinedPercent = totalCount ? Math.round((totalDone / totalCount) * 100) : 0;
              const markers = dayCompletionMarkers(day);
              const status = dayCompletionStatus(combinedPercent, totalCount, isFuture, markers.length);
              const detailTitle = isFuture
                ? markers.length ? "已有计划" : "未来日期"
                : totalCount ? `${totalDone}/${totalCount} 完成` : "暂无完成项";
              return `
                <button
                  class="month-day-cell${selected ? " is-active" : ""}${day.isToday ? " is-today" : ""}${isFuture ? " is-future-day" : ""} ${completionTone(combinedPercent, totalCount, isFuture, markers.length)}"
                  data-month-date="${escapeHtml(day.id)}"
                  type="button"
                  title="${escapeHtml(`${day.id} · ${status.title} · ${detailTitle}`)}"
                >
                  <span class="month-day-top">
                    <span class="month-day-number">${day.dayNumber}</span>
                    <strong class="month-status-pill">${escapeHtml(status.label)}</strong>
                  </span>
                  <span class="month-person-dots" aria-label="${escapeHtml(`${day.id} 成员完成情况`)}">
                    ${profiles().map((profile) => renderMonthPersonDot(profile, day, isFuture)).join("")}
                  </span>
                  <span class="month-day-markers">
                    ${
                      markers.length
                        ? markers
                            .map(
                              (marker) => `
                                <i class="${escapeHtml(marker.kind)}" title="${escapeHtml(marker.title)}">
                                  ${escapeHtml(marker.label)}
                                </i>
                              `
                            )
                            .join("")
                        : isFuture
                          ? ""
                          : `<i class="is-muted">空</i>`
                    }
                  </span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function completionTone(percent, total, isFuture, markerCount = 0) {
    if (isFuture) return markerCount ? "is-plan-day" : "is-empty-day";
    if (!total && markerCount) return "is-note-day";
    if (!total) return "is-empty-day";
    if (percent >= 80) return "is-strong-day";
    if (percent >= 50) return "is-steady-day";
    if (percent > 0) return "is-light-day";
    return "is-zero-day";
  }

  function dayCompletionStatus(percent, total, isFuture, markerCount = 0) {
    if (isFuture) {
      return markerCount
        ? { label: "计划", title: "未来已有安排" }
        : { label: "-", title: "未来还没有安排" };
    }
    if (!total && markerCount) return { label: "记", title: "有随手记或日程记录" };
    if (!total) return { label: "空", title: "这天还没有记录" };
    if (percent >= 80) return { label: "好", title: "完成良好" };
    if (percent >= 50) return { label: "稳", title: "完成过半" };
    if (percent > 0) return { label: "少", title: "有少量推进" };
    return { label: "待", title: "还没有完成标记" };
  }

  function dayCompletionMarkers(day) {
    const markers = [];
    if (day.todoCount) markers.push({ kind: "is-todo", label: "T", title: `Todo ${day.todoCount}` });
    if (day.eventCount) markers.push({ kind: "is-schedule", label: "日", title: `日程 ${day.eventCount}` });
    if (day.captureCount) markers.push({ kind: "is-capture", label: "记", title: `随手记 ${day.captureCount}` });
    if (day.summaryGenerated) markers.push({ kind: "is-summary", label: "结", title: "已生成日总结" });
    return markers.slice(0, 4);
  }

  function renderMonthPersonDot(profile, day, isFuture) {
    const stat = day.userStats?.[profile.id] || { done: 0, total: 0, percent: 0 };
    const tone = isFuture
      ? "is-future"
      : !stat.total
        ? "is-empty"
        : stat.percent >= 80
          ? "is-strong"
          : stat.percent >= 50
            ? "is-steady"
            : stat.percent > 0
              ? "is-light"
              : "is-zero";
    const title = isFuture ? `${profile.displayName} · 计划中` : `${profile.displayName} · ${stat.done}/${stat.total}`;
    return `
      <span
        class="month-person-dot ${tone}"
        style="--person-color: ${escapeHtml(profile.color)}"
        title="${escapeHtml(title)}"
      >
        <span>${escapeHtml(profile.initials || profile.displayName?.slice(0, 1) || "?")}</span>
      </span>
    `;
  }

  function renderTodoPanel() {
    const todos = todoItemsForMode();
    const todayCount = (state.data?.todoItems || []).filter(
      (item) => item.bucket !== "future" && item.date === state.selectedDate && itemMatchesView(item)
    ).length;
    const futureCount = futureItems().length;
    return `
      <section class="couple-panel todo-panel todo-panel-hero" id="todos">
        <div class="couple-panel-head">
          <div>
            <p class="couple-kicker">Todo</p>
            <h2>今天要推进的事</h2>
          </div>
          <div class="couple-filter-tabs">
            <button class="${state.todoMode === "today" ? "is-active" : ""}" data-todo-mode="today" type="button">今天 ${todayCount}</button>
            <button class="${state.todoMode === "future" ? "is-active" : ""}" data-todo-mode="future" type="button">未来 ${futureCount}</button>
          </div>
        </div>
        <form class="todo-create-form" id="todo-create-form">
          <input name="title" type="text" placeholder="新增 Todo，例如：确认服务器部署步骤" autocomplete="off" />
          <textarea name="detail" rows="2" placeholder="补充细节，可留空"></textarea>
          <div class="todo-create-controls">
            <input name="date" type="date" value="${escapeHtml(state.selectedDate)}" />
            <select name="ownerId">${renderOwnerOptions()}</select>
            <select name="priority">
              <option value="normal">普通</option>
              <option value="high">重要</option>
              <option value="low">低优先级</option>
            </select>
            <select name="bucket">
              <option value="today">今天</option>
              <option value="future">未来想做</option>
            </select>
            <button class="pixel-primary-button" type="submit">添加</button>
          </div>
        </form>
        <div class="todo-thing-list">
          ${
            todos.length
              ? todos.map((item) => renderTodoItem(item)).join("")
              : `<div class="pixel-empty">这里还没有 Todo。可以是单人的，也可以是两个人一起完成的。</div>`
          }
        </div>
      </section>
    `;
  }

  function renderTodoItem(item) {
    if (state.editTodoId === item.id) {
      return `
        <article class="thing-row todo-edit-row">
          <form class="todo-edit-form">
            <input type="hidden" name="id" value="${escapeHtml(item.id)}" />
            <input name="title" type="text" value="${escapeHtml(item.title)}" />
            <textarea name="detail" rows="3">${escapeHtml(item.detail || "")}</textarea>
            <div class="todo-create-controls">
              <input name="date" type="date" value="${escapeHtml(item.date)}" />
              <select name="ownerId">${renderOwnerOptions(item.ownerId)}</select>
              <select name="priority">
                ${["normal", "high", "low"]
                  .map(
                    (priority) => `
                      <option value="${priority}"${item.priority === priority ? " selected" : ""}>${escapeHtml(priorityLabels[priority])}</option>
                    `
                  )
                  .join("")}
              </select>
              <select name="bucket">
                <option value="today"${item.bucket === "today" ? " selected" : ""}>今天</option>
                <option value="future"${item.bucket === "future" ? " selected" : ""}>未来想做</option>
              </select>
              <button class="pixel-primary-button" type="submit">保存</button>
              <button class="pixel-secondary-button" data-cancel-edit-todo type="button">取消</button>
            </div>
          </form>
        </article>
      `;
    }

    const archived = isArchived(item);
    const allDone = item.participants.every((id) => item.statusByUser?.[id] === "done");
    return `
      <article class="thing-row todo-row ${allDone ? "is-done" : ""}${archived ? " is-archived" : ""}">
        <div class="thing-row-main">
          <span class="thing-kind">${escapeHtml(thingClass(item))}</span>
          <strong>${escapeHtml(item.title)}</strong>
          ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
          <em>${escapeHtml(ownerLabel(item.ownerId))} · ${escapeHtml(priorityLabels[item.priority] || "普通")} · ${item.bucket === "future" ? "未来想做" : escapeHtml(item.date)}${archived ? " · 已归档" : ""}</em>
        </div>
        <div class="thing-row-actions">
          ${item.participants
            .map((userId) => renderStatusControl(item, userId, "todo"))
            .join("")}
          <button class="thing-edit-button" data-edit-todo="${escapeHtml(item.id)}" type="button">编辑</button>
          ${archived ? "" : `<button class="thing-archive-button" data-archive-todo="${escapeHtml(item.id)}" data-archive-date="${escapeHtml(item.date)}" type="button">归档</button>`}
          <button class="thing-delete-button" data-delete-todo="${escapeHtml(item.id)}" type="button">删除</button>
        </div>
      </article>
    `;
  }

  function renderScheduleBoard() {
    const data = state.data;
    const selectedItem = selectedScheduleItem();
    return `
      <section class="couple-panel schedule-board-panel" id="schedule">
        <div class="couple-panel-head">
          <div>
            <p class="couple-kicker">Schedule</p>
            <h2>具体安排</h2>
          </div>
          <div class="week-jump-row">
            ${data.weekDays
              .map(
                (day) => `
                  <button class="${day.id === state.selectedDate ? "is-active" : ""}${day.isToday ? " is-today" : ""}" data-select-date="${escapeHtml(day.id)}" type="button">
                    <strong>${escapeHtml(day.label)}</strong>
                    <span>${escapeHtml(day.shortLabel)}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="schedule-list-layout">
          <div class="schedule-list-column">
            ${data.weekDays.map((day) => renderScheduleDayBlock(day)).join("")}
          </div>
          <aside class="schedule-detail-pane">
            ${selectedItem ? renderScheduleDetail(selectedItem) : `<div class="pixel-empty">这周还没有日程。右侧快速加入日程后，可以在这里点开详情。</div>`}
          </aside>
        </div>
      </section>
    `;
  }

  function renderScheduleDayBlock(day) {
    const items = scheduleItemsForDate(day.id);
    return `
      <article class="schedule-day-block${day.id === state.selectedDate ? " is-active" : ""}">
        <button class="schedule-day-title" data-select-date="${escapeHtml(day.id)}" type="button">
          <strong>${escapeHtml(day.label)}</strong>
          <span>${escapeHtml(day.shortLabel)}</span>
        </button>
        <div class="schedule-day-items">
          ${
            items.length
              ? items.map((item) => renderScheduleListItem(item)).join("")
              : `<span class="schedule-day-empty">无安排</span>`
          }
        </div>
      </article>
    `;
  }

  function renderScheduleListItem(item) {
    const archived = isArchived(item);
    const allDone = item.participants.every((id) => item.statusByUser?.[id] === "done");
    return `
      <button
        class="schedule-list-item${state.selectedScheduleId === item.id ? " is-selected" : ""}${allDone ? " is-done" : ""}${archived ? " is-archived" : ""}"
        data-schedule-detail="${escapeHtml(item.id)}"
        data-schedule-date="${escapeHtml(item.date)}"
        type="button"
      >
        <span>${escapeHtml(segmentLabel(item.segment))}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <em>${escapeHtml(ownerLabel(item.ownerId))}${archived ? " · 已归档" : ""}</em>
      </button>
    `;
  }

  function renderScheduleDetail(item) {
    const archived = isArchived(item);
    return `
      <article class="schedule-detail-card${archived ? " is-archived" : ""}">
        <div class="schedule-detail-top">
          <div>
            <span>${escapeHtml(item.date)} · ${escapeHtml(segmentLabel(item.segment))}${archived ? " · 已归档" : ""}</span>
            <h3>${escapeHtml(item.title)}</h3>
          </div>
          <span class="thing-kind">${escapeHtml(thingClass(item))}</span>
        </div>
        ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : `<p class="schedule-detail-empty">没有补充细节。</p>`}
        <div class="schedule-detail-meta">
          <span>归属：${escapeHtml(ownerLabel(item.ownerId))}</span>
          <span>创建：${escapeHtml(profileName(item.createdBy))}</span>
        </div>
        <div class="schedule-detail-actions">
          ${item.participants
            .map((userId) => renderStatusControl(item, userId, "schedule"))
            .join("")}
          ${archived ? "" : `<button class="thing-archive-button" data-archive-item="${escapeHtml(item.id)}" data-archive-date="${escapeHtml(item.date)}" type="button">归档</button>`}
          <button class="thing-delete-button" data-delete-item="${escapeHtml(item.id)}" data-delete-date="${escapeHtml(item.date)}" type="button">删除</button>
        </div>
      </article>
    `;
  }

  function timelineDaysOrdered() {
    const days = state.data?.timelineDays || [];
    if (!days.length) return [];
    const selectedIndex = days.findIndex((day) => (day.date || day.id) === state.selectedDate);
    if (selectedIndex < 0) return days;
    return [
      days[selectedIndex],
      ...days.slice(selectedIndex + 1),
      ...days.slice(0, selectedIndex),
    ];
  }

  function timelinePeople() {
    const current = currentUser();
    const other = profiles().find((profile) => profile.id !== current?.id) || profiles()[0] || null;
    return {
      self: current,
      other,
    };
  }

  function timelineDayEntries(day) {
    return [...(day?.left || []), ...(day?.right || [])]
      .sort((a, b) => timelineEntrySortKey(a).localeCompare(timelineEntrySortKey(b)));
  }

  function timelineEntrySortKey(entry) {
    const segmentRank = {
      allDay: "0",
      morning: "1",
      noon: "2",
      afternoon: "3",
      evening: "4",
    };
    return [
      segmentRank[timelineSegmentKey(entry)] || "9",
      String(entry.createdAt || ""),
      String(entry.title || ""),
    ].join("|");
  }

  function timelineSegmentKey(entry) {
    if (entry.type === "schedule") return entry.meta || "allDay";
    if (entry.type === "capture" && entry.createdAt) {
      const hour = Number(String(entry.createdAt).slice(11, 13));
      if (Number.isFinite(hour)) {
        if (hour < 11) return "morning";
        if (hour < 14) return "noon";
        if (hour < 18) return "afternoon";
        return "evening";
      }
    }
    return "allDay";
  }

  function timelineTimeLabel(entry, options = {}) {
    if (entry.type === "schedule") return segmentLabel(entry.meta);
    if (entry.type === "capture" && entry.createdAt) {
      const time = String(entry.createdAt).slice(11, 16);
      return /^\d{2}:\d{2}$/.test(time) ? time : "";
    }
    return options.showAllDay ? "全天" : "";
  }

  function timelineTypeLabel(entry) {
    if (entry.type === "schedule") return "日程";
    if (entry.type === "todo") return "Todo";
    if (entry.type === "capture") return "随手记";
    return "事项";
  }

  function timelineTypeMark(entry) {
    if (entry.type === "schedule") return "日";
    if (entry.type === "todo") return "T";
    if (entry.type === "capture") return "记";
    return "事";
  }

  function timelineIsShared(entry) {
    return entry.ownerId === "shared" || entry.visibility === "shared" || (entry.participants || []).length > 1;
  }

  function captureModeLabel(mode) {
    if (mode === "todo") return "Todo";
    if (mode === "analysis") return "Agent";
    return "记下来";
  }

  function renderTimelinePage() {
    const orderedDays = timelineDaysOrdered();
    const focusDay = orderedDays[0];
    const restDays = orderedDays.slice(1, 7);
    const people = timelinePeople();

    return `
      <section class="couple-panel timeline-panel dashboard-wide" id="timeline">
        <div class="couple-panel-head">
          <div>
            <p class="couple-kicker">Timeline</p>
            <h2>一周事项时间轴</h2>
          </div>
          <span class="selected-day-count">最多 7 天</span>
        </div>
        <div class="timeline-split-head">
          <span style="--person-color: ${escapeHtml(people.self?.color || "#ff5c9a")}">${escapeHtml(people.self?.displayName || "我的")}</span>
          <span style="--person-color: ${escapeHtml(people.other?.color || "#8a6cff")}">${escapeHtml(people.other?.displayName || "对方")}</span>
        </div>
        ${focusDay ? renderTimelineFocusDay(focusDay) : `<div class="pixel-empty">这一周还没有事项。</div>`}
        <div class="timeline-rest-list">
          ${restDays.map((day) => renderTimelineCompactDay(day)).join("")}
        </div>
      </section>
    `;
  }

  function renderTimelineFocusDay(day) {
    const date = day.date || day.id;
    const entries = timelineDayEntries(day);
    const segments = (state.data?.segments || [])
      .map((segment) => ({
        ...segment,
        left: (day.left || []).filter((entry) => timelineSegmentKey(entry) === segment.key),
        right: (day.right || []).filter((entry) => timelineSegmentKey(entry) === segment.key),
      }))
      .filter((segment) => segment.left.length || segment.right.length);

    return `
      <article class="timeline-focus-day${day.isToday ? " is-today" : ""}">
        <div class="timeline-focus-title">
          <div>
            <span>${escapeHtml(day.label || "")}</span>
            <strong>${escapeHtml(date)}</strong>
          </div>
          <em>${entries.length} 件事</em>
        </div>
        ${
          segments.length
            ? segments.map((segment) => renderTimelineFocusSegment(segment)).join("")
            : `<div class="pixel-empty">这一天还没有 Todo、日程或随手记。</div>`
        }
      </article>
    `;
  }

  function renderTimelineFocusSegment(segment) {
    return `
      <section class="timeline-focus-segment">
        <div class="timeline-segment-label">${escapeHtml(segment.label)}</div>
        <div class="timeline-side-grid">
          <div class="timeline-side-column is-self">
            ${
              segment.left.length
                ? segment.left.map((entry) => renderTimelineEntry(entry, "focus")).join("")
                : `<span class="timeline-side-empty">这边暂无</span>`
            }
          </div>
          <div class="timeline-side-column is-other">
            ${
              segment.right.length
                ? segment.right.map((entry) => renderTimelineEntry(entry, "focus")).join("")
                : `<span class="timeline-side-empty">这边暂无</span>`
            }
          </div>
        </div>
      </section>
    `;
  }

  function renderTimelineCompactDay(day) {
    const date = day.date || day.id;
    const left = day.left || [];
    const right = day.right || [];
    return `
      <article class="timeline-compact-day${day.isToday ? " is-today" : ""}">
        <div class="timeline-compact-date">
          <strong>${escapeHtml(date)}</strong>
          <span>${escapeHtml(day.label || "")}</span>
        </div>
        <div class="timeline-side-grid">
          <div class="timeline-side-column is-self">
            ${
              left.length
                ? left.map((entry) => renderTimelineEntry(entry, "compact", date)).join("")
                : `<span class="timeline-side-empty">无</span>`
            }
          </div>
          <div class="timeline-side-column is-other">
            ${
              right.length
                ? right.map((entry) => renderTimelineEntry(entry, "compact", date)).join("")
                : `<span class="timeline-side-empty">无</span>`
            }
          </div>
        </div>
      </article>
    `;
  }

  function renderTimelineEntry(entry, variant = "focus", date = "") {
    const archived = isArchived(entry);
    const shared = timelineIsShared(entry);
    const time = timelineTimeLabel(entry, { showAllDay: variant === "focus" });
    const prefix = variant === "compact"
      ? [date, time].filter(Boolean).join(" · ")
      : time;
    return `
      <article class="timeline-entry is-${escapeHtml(entry.type)}${variant === "compact" ? " is-compact" : ""}${archived ? " is-archived" : ""}${shared ? " is-shared" : ""}">
        <span class="timeline-entry-mark">${escapeHtml(timelineTypeMark(entry))}</span>
        <div>
          <div class="timeline-entry-line">
            ${prefix ? `<time>${escapeHtml(prefix)}</time>` : ""}
            <strong>${escapeHtml(entry.title || "未命名事项")}</strong>
          </div>
          <div class="timeline-entry-meta">
            <span>${escapeHtml(timelineTypeLabel(entry))}</span>
            ${shared ? `<span>共同</span>` : ""}
            ${archived ? `<span>已归档</span>` : ""}
          </div>
          ${variant === "focus" && entry.detail ? `<p>${escapeHtml(entry.detail)}</p>` : ""}
        </div>
      </article>
    `;
  }

  function renderDailySummaryPanel() {
    const summary = state.data?.dailySummary;
    const people = summary?.people || [];
    const photos = summary?.photos || [];

    return `
      <section class="couple-panel daily-summary-panel dashboard-wide" id="daily-summary">
        <div class="couple-panel-head">
          <div>
            <p class="couple-kicker">Daily Story</p>
            <h2>自动日总结</h2>
          </div>
          <button class="pixel-secondary-button" data-refresh-summary type="button">刷新总结</button>
        </div>
        ${
          summary
            ? `
              <div class="daily-summary-layout">
                <div class="daily-illustration ${summary.illustration?.type === "photo" ? "has-photo" : ""}">
                  ${
                    summary.illustration?.type === "photo" && summary.illustration.url
                      ? `<img src="${escapeHtml(summary.illustration.url)}" alt="${escapeHtml(summary.illustration.alt || "当天照片")}" />`
                      : `
                        <span class="daily-pixel-sky" aria-hidden="true"></span>
                        <span class="daily-pixel-cat one" aria-hidden="true"></span>
                        <span class="daily-pixel-cat two" aria-hidden="true"></span>
                      `
                  }
                </div>
                <div class="daily-summary-copy">
                  <div class="daily-summary-title-row">
                    <div>
                      <h3>${escapeHtml(summary.title)}</h3>
                      <span>${escapeHtml(summary.subtitle || "由系统自动整理")}</span>
                    </div>
                    <strong>${escapeHtml(summary.qualityLabel || "今日质量")}</strong>
                  </div>
                  <p>${escapeHtml(summary.narrative || "这一天还没有足够材料生成总结。")}</p>
                  <div class="daily-quality-meter">
                    <span style="width: ${Math.max(0, Math.min(100, summary.qualityScore || 0))}%"></span>
                  </div>
                  <div class="daily-quality-facts">
                    <span>${escapeHtml(summary.stats?.done || 0)}/${escapeHtml(summary.stats?.total || 0)} 状态点</span>
                    <span>${escapeHtml(summary.qualityNote || "")}</span>
                    <span>${escapeHtml(summary.nextStep || "")}</span>
                  </div>
                </div>
              </div>
              <div class="daily-summary-columns">
                ${renderSummaryList("完成了", summary.completed || [])}
                ${renderSummaryList("没做完", summary.missed || [])}
                ${renderDailyPeople(people)}
              </div>
              ${
                photos.length || summary.moments?.length
                  ? `
                    <div class="daily-memory-strip">
                      ${photos.map((photo) => `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || "photo")}" />`).join("")}
                      ${(summary.moments || [])
                        .slice(0, 4)
                        .map(
                          (moment) => `
                            <span>
                              ${moment.location ? `<em>${escapeHtml(moment.location)}</em>` : ""}
                              ${escapeHtml(moment.text)}
                            </span>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : ""
              }
              <div class="daily-summary-meta">
                <span>${escapeHtml(summary.generatedAt ? `生成于 ${summary.generatedAt.slice(0, 16).replace("T", " ")}` : "尚未生成")}</span>
                <span>${escapeHtml(summary.mode === "agent" ? "Agent 生成" : "规则生成")}</span>
              </div>
            `
            : `
              <div class="daily-empty-state">
                <div class="daily-illustration">
                  <span class="daily-pixel-sky" aria-hidden="true"></span>
                  <span class="daily-pixel-cat one" aria-hidden="true"></span>
                  <span class="daily-pixel-cat two" aria-hidden="true"></span>
                </div>
                <div>
                  <h3>${escapeHtml(state.selectedDate)} 还没有自动总结</h3>
                  <p>凌晨 4 点会自动刷新，也可以现在手动生成。</p>
                  <button class="pixel-primary-button" data-refresh-summary type="button">生成今天总结</button>
                </div>
              </div>
            `
        }
      </section>
    `;
  }

  function renderSummaryList(title, items) {
    return `
      <div class="daily-summary-list">
        <strong>${escapeHtml(title)}</strong>
        ${
          items.length
            ? items
                .slice(0, 6)
                .map(
                  (item) => `
                    <span>
                      <em>${escapeHtml(item.kind || "事项")}</em>
                      ${escapeHtml(item.title)}
                    </span>
                  `
                )
                .join("")
            : `<span class="is-empty">暂无</span>`
        }
      </div>
    `;
  }

  function renderDailyPeople(people) {
    return `
      <div class="daily-people-list">
        <strong>每日小打卡</strong>
        ${
          people.length
            ? people
                .map(
                  (person) => `
                    <span style="--person-color: ${escapeHtml(person.color)}">
                      <b>${escapeHtml(person.displayName)}</b>
                      <em>${escapeHtml(person.percent || 0)}%</em>
                      <small>${escapeHtml(person.dailyScore ? `${person.dailyScore}/10` : "未打分")} · ${escapeHtml(person.happiestThing || "最开心未填")} · ${escapeHtml(person.smallAchievement || "小成就未填")}</small>
                    </span>
                  `
                )
                .join("")
            : `<span class="is-empty">暂无状态</span>`
        }
      </div>
    `;
  }

  function renderGoalsPage() {
    return `
      <section class="couple-panel memory-pages-panel" id="goals">
        <div class="couple-panel-head compact">
          <div>
            <p class="couple-kicker">Long Goals</p>
            <h2>长期目标</h2>
          </div>
        </div>
        <div class="goals-page-layout">
          ${renderLongTermGoals()}
          ${renderFuturePage()}
        </div>
      </section>
    `;
  }

  function renderLongTermGoals() {
    const pages = state.data?.personalPages || {};
    return `
      <div class="personal-pages-list goals-list">
        ${profiles()
          .map((profile) => {
            const page = pages[profile.id] || {};
            const editable = profile.id === currentUser()?.id;
            return `
              <article class="personal-page-card goal-card" style="--person-color: ${escapeHtml(profile.color)}">
                <div class="personal-page-head">
                  ${renderAvatar(profile, "goal-avatar")}
                  <div>
                    <strong>${escapeHtml(profile.displayName)}</strong>
                    <em>${escapeHtml(page.title || "长期目标")}</em>
                  </div>
                </div>
                ${
                  editable
                    ? `
                      <form class="personal-page-form goal-form" data-personal-page-form>
                        <input name="title" type="text" value="${escapeHtml(page.title || profile.displayName)}" placeholder="页面标题" />
                        <textarea name="longTermGoal" rows="3" placeholder="长期目标：想长期稳定做到什么">${escapeHtml(page.longTermGoal || "")}</textarea>
                        <textarea name="identityGoal" rows="3" placeholder="希望成为什么样的人">${escapeHtml(page.identityGoal || "")}</textarea>
                        <textarea name="bio" rows="2" placeholder="简单介绍">${escapeHtml(page.bio || "")}</textarea>
                        <textarea name="likes" rows="2" placeholder="喜欢、偏好、注意事项">${escapeHtml(page.likes || "")}</textarea>
                        <textarea name="notes" rows="3" placeholder="更多补充">${escapeHtml(page.notes || "")}</textarea>
                        <button class="pixel-secondary-button" type="submit">保存长期目标</button>
                      </form>
                    `
                    : `
                      <div class="personal-page-readonly goal-readonly">
                        <p>${escapeHtml(page.longTermGoal || "还没有长期目标。")}</p>
                        <span>${escapeHtml(page.identityGoal || "还没有写希望成为什么样的人。")}</span>
                        ${page.bio ? `<small>${escapeHtml(page.bio)}</small>` : ""}
                      </div>
                    `
                }
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderFuturePage() {
    const items = futureItems().slice(0, 8);
    return `
      <div class="future-page-list future-goals-panel">
        <div class="dashboard-mini-head">
          <strong>未来想做</strong>
          <a href="#todos">添加 Todo</a>
        </div>
        ${
          items.length
            ? items
                .map(
                  (item) => `
                    <article class="future-page-item">
                      <span>${escapeHtml(thingClass(item))}</span>
                      <strong>${escapeHtml(item.title)}</strong>
                      ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
                    </article>
                  `
                )
                .join("")
            : `<div class="pixel-empty">未来想做会从 Todo 的“未来”分类里出现。</div>`
        }
      </div>
    `;
  }

  function renderSettingsPage() {
    const current = currentUser();
    return `
      <section class="couple-panel settings-panel" id="settings">
        <div class="couple-panel-head compact">
          <div>
            <p class="couple-kicker">Settings</p>
            <h2>个人设置</h2>
          </div>
        </div>
        <div class="settings-page-layout">
          <form class="profile-settings-form" id="profile-settings-form">
            <div class="settings-avatar-preview">
              ${renderAvatar(current, "settings-avatar")}
              <div>
                <strong>${escapeHtml(current?.displayName || "")}</strong>
                <span>${escapeHtml(current?.login || "")}</span>
              </div>
            </div>
            <label class="couple-field">
              <span>昵称</span>
              <input name="displayName" type="text" value="${escapeHtml(current?.displayName || "")}" autocomplete="off" />
            </label>
            <label class="couple-field">
              <span>短标记</span>
              <input name="initials" type="text" maxlength="2" value="${escapeHtml(current?.initials || "")}" autocomplete="off" />
            </label>
            <div class="settings-form-row">
              <label class="couple-field compact">
                <span>代表颜色</span>
                <input name="color" type="color" value="${escapeHtml(current?.color || "#ff5c9a")}" />
              </label>
              <label class="couple-field compact">
                <span>头像样式</span>
                <select name="avatar">
                  ${renderAvatarOptions(current?.avatar)}
                </select>
              </label>
            </div>
            <label class="capture-photo-button settings-upload-button">
              <span>上传头像</span>
              <input name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            </label>
            <button class="pixel-primary-button" type="submit">保存设置</button>
          </form>
          <div class="settings-members">
            <strong>成员</strong>
            ${profiles()
              .map(
                (profile) => `
                  <article class="settings-member" style="--person-color: ${escapeHtml(profile.color)}">
                    ${renderAvatar(profile, "settings-member-avatar")}
                    <div>
                      <b>${escapeHtml(profile.displayName)}</b>
                      <span>${escapeHtml(profile.initials || "")} · ${escapeHtml(profile.login)}</span>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
    `;
  }

  function renderAvatarOptions(selectedAvatar = "pink-cat") {
    const options = [
      ["pink-cat", "粉色小猫"],
      ["violet-cat", "紫色小猫"],
      ["mint-cat", "薄荷小猫"],
      ["yellow-cat", "奶黄小猫"],
      ["custom", "自定义头像"],
    ];
    return options
      .map(
        ([value, label]) => `
          <option value="${escapeHtml(value)}"${selectedAvatar === value ? " selected" : ""}>${escapeHtml(label)}</option>
        `
      )
      .join("");
  }

  function renderPersonalPages() {
    const pages = state.data?.personalPages || {};
    return `
      <div class="personal-pages-list">
        ${profiles()
          .map((profile) => {
            const page = pages[profile.id] || {};
            const editable = profile.id === currentUser()?.id;
            return `
              <article class="personal-page-card" style="--person-color: ${escapeHtml(profile.color)}">
                <div class="personal-page-head">
                  ${renderAvatar(profile, "personal-page-avatar")}
                  <div>
                    <strong>${escapeHtml(page.title || profile.displayName)}</strong>
                    <em>${escapeHtml(profile.displayName)}</em>
                  </div>
                </div>
                ${
                  editable
                    ? `
                      <form class="personal-page-form" data-personal-page-form>
                        <input name="title" type="text" value="${escapeHtml(page.title || profile.displayName)}" placeholder="页面标题" />
                        <textarea name="bio" rows="2" placeholder="简单介绍">${escapeHtml(page.bio || "")}</textarea>
                        <textarea name="likes" rows="2" placeholder="喜欢、偏好、注意事项">${escapeHtml(page.likes || "")}</textarea>
                        <textarea name="notes" rows="3" placeholder="更多个人信息">${escapeHtml(page.notes || "")}</textarea>
                        <button class="pixel-secondary-button" type="submit">保存个人页</button>
                      </form>
                    `
                    : `
                      <div class="personal-page-readonly">
                        <p>${escapeHtml(page.bio || "还没有写介绍。")}</p>
                        <span>${escapeHtml(page.likes || "还没有偏好记录。")}</span>
                        ${page.notes ? `<small>${escapeHtml(page.notes)}</small>` : ""}
                      </div>
                    `
                }
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderQuickAdd() {
    return `
      <section class="couple-panel quick-add-panel">
        <div class="couple-panel-head compact">
          <div>
            <p class="couple-kicker">Quick Add</p>
            <h2>快速加入日程</h2>
          </div>
        </div>
        <form class="quick-add-form" id="quick-add-form">
          <label class="couple-field">
            <span>一句话日程</span>
            <input id="quick-title" name="title" type="text" placeholder="例如：周五晚上一起吃饭" autocomplete="off" />
          </label>
          <label class="couple-field compact">
            <span>细节</span>
            <textarea name="detail" rows="2" placeholder="地点、准备、备注"></textarea>
          </label>
          <div class="quick-add-controls">
            <label class="couple-field compact">
              <span>日期</span>
              <input name="date" type="date" value="${escapeHtml(state.selectedDate)}" />
            </label>
            <label class="couple-field compact">
              <span>归属</span>
              <select name="ownerId" id="quick-owner">
                ${renderOwnerOptions(state.quickOwner)}
              </select>
            </label>
            <label class="couple-field compact">
              <span>分段</span>
              <select name="segment" id="quick-segment">
                ${state.data.segments
                  .map(
                    (segment) => `
                      <option value="${escapeHtml(segment.key)}"${state.activeSegment === segment.key ? " selected" : ""}>
                        ${escapeHtml(segment.label)}
                      </option>
                    `
                  )
                  .join("")}
              </select>
            </label>
          </div>
          <button class="pixel-primary-button" type="submit">写入日程</button>
        </form>
      </section>
    `;
  }

  function renderCheckinPanel() {
    const items = checkinItemsForView();
    return `
      <section class="couple-panel checkin-panel">
        <div class="couple-panel-head compact">
          <div>
            <p class="couple-kicker">Check-in</p>
            <h2>共同打卡</h2>
          </div>
          <span class="selected-day-count">${items.length} 项 · 同屏</span>
        </div>
        <form class="mini-create-form" id="checkin-form">
          <input name="title" type="text" placeholder="例如：喝水 / 运动 / 互相报平安" />
          <div>
            <input name="slot" type="text" placeholder="时段" />
            <span class="checkin-shared-label">两个人都显示</span>
          </div>
          <button class="pixel-primary-button" type="submit">添加打卡</button>
        </form>
        <div class="compact-thing-list">
          ${
            items.length
              ? items.map((item) => renderCheckinItem(item)).join("")
              : `<div class="pixel-empty">还没有每日打卡项。</div>`
          }
        </div>
      </section>
    `;
  }

  function renderCheckinItem(item) {
    return `
      <article class="compact-thing">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>共同${item.slot ? ` · ${escapeHtml(item.slot)}` : ""}</span>
        </div>
        <div class="compact-toggle-row">
          ${item.participants
            .map((userId) => renderStatusControl(item, userId, "checkin"))
            .join("")}
          <button class="thing-delete-button" data-delete-checkin="${escapeHtml(item.id)}" type="button">删除</button>
        </div>
      </article>
    `;
  }

  function renderDeadlinePanel() {
    const items = deadlineItemsForView().slice(0, 8);
    return `
      <section class="couple-panel deadline-panel">
        <div class="couple-panel-head compact">
          <div>
            <p class="couple-kicker">Dates</p>
            <h2>重要日期</h2>
          </div>
        </div>
        <form class="mini-create-form" id="deadline-form">
          <input name="title" type="text" placeholder="例如：纪念日 / 投稿截止 / 旅行" />
          <input name="detail" type="text" placeholder="补充说明" />
          <div>
            <input name="date" type="date" value="${escapeHtml(state.selectedDate)}" />
            <select name="ownerId">${renderOwnerOptions()}</select>
          </div>
          <button class="pixel-primary-button" type="submit">记住</button>
        </form>
        <div class="compact-thing-list">
          ${
            items.length
              ? items
                  .map(
                    (item) => `
                      <article class="compact-thing date-thing">
                        <div>
                          <strong>${escapeHtml(item.date)}</strong>
                          <span>${escapeHtml(item.title)} · ${escapeHtml(thingClass(item))}</span>
                          ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}
                        </div>
                        <button class="thing-delete-button" data-delete-deadline="${escapeHtml(item.id)}" type="button">删除</button>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="pixel-empty">还没有重要日期。</div>`
          }
        </div>
      </section>
    `;
  }

  function renderCaptureHub() {
    const modeLabels = {
      save: "记下来！",
      analysis: "提交给 Agent",
      todo: "直接添加 Todo",
    };
    return `
      <section class="couple-panel capture-hub-panel" id="capture">
        <div class="couple-panel-head">
          <div>
            <p class="couple-kicker">Quick Capture</p>
            <h2>随手记</h2>
          </div>
          <div class="couple-filter-tabs">
            ${Object.entries(modeLabels)
              .map(
                ([mode, label]) => `
                  <button class="${state.captureMode === mode ? "is-active" : ""}" data-capture-mode="${mode}" type="button">
                    ${escapeHtml(label)}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="capture-hub-layout">
          <form class="capture-form capture-hub-form" id="capture-form" data-capture-form>
            <input type="hidden" name="mode" value="${escapeHtml(state.captureMode)}" />
            <textarea name="text" rows="3" placeholder="先写下来。记下来只保存，交给 Agent 会进入分析流。"></textarea>
            <div class="capture-extra-row">
              <input name="location" type="text" placeholder="地点，可留空" autocomplete="off" />
              <label class="capture-photo-button">
                <span>照片</span>
                <input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
              </label>
            </div>
            <div class="capture-form-row">
              <select name="visibility">
                <option value="shared">共享可见</option>
                <option value="private">仅自己可见</option>
              </select>
              <select name="ownerId">
                ${renderOwnerOptions(state.quickOwner)}
              </select>
              <button class="pixel-primary-button" type="submit">${escapeHtml(modeLabels[state.captureMode] || "提交")}</button>
            </div>
          </form>
          <div class="capture-hub-feed">
            <div class="capture-feed-head">
              <strong>今天的随手记</strong>
              <span>${capturesForSelectedDate().length} 条</span>
            </div>
            <div class="capture-list">
              ${
                capturesForSelectedDate().length
                  ? capturesForSelectedDate()
                      .map((capture) => renderCaptureNote(capture))
                      .join("")
                  : `<div class="pixel-empty">这一天还没有随手记。</div>`
              }
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderCaptureNote(capture, variant = "") {
    return `
      <article class="capture-note ${variant === "mini" ? "is-mini" : ""} ${capture.visibility === "private" ? "is-private" : ""}">
        <span>${escapeHtml(profileName(capture.createdBy))} · ${escapeHtml(captureModeLabel(capture.mode))} · ${capture.visibility === "private" ? "仅自己" : "共享"}${capture.location ? ` · ${escapeHtml(capture.location)}` : ""}</span>
        <p>${escapeHtml(capture.text)}</p>
        ${
          capture.assets?.length && variant !== "mini"
            ? `<img src="${escapeHtml(capture.assets[0].url)}" alt="${escapeHtml(capture.assets[0].name || "capture photo")}" />`
            : ""
        }
      </article>
    `;
  }

  function bindAppEvents() {
    root.querySelector("#logout-button")?.addEventListener("click", logout);
    root.querySelectorAll("[data-date-offset]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.selectedDate = addDays(state.selectedDate, Number(button.dataset.dateOffset));
        await refreshState();
      });
    });
    root.querySelector("[data-jump-today]")?.addEventListener("click", async () => {
      state.selectedDate = getToday();
      await refreshState();
    });
    root.querySelectorAll("[data-select-date]").forEach((button) => {
      button.addEventListener("click", () => selectDate(button.dataset.selectDate));
    });
    root.querySelectorAll("[data-month-date]").forEach((button) => {
      button.addEventListener("click", () => selectDate(button.dataset.monthDate));
    });
    root.querySelectorAll("[data-dashboard-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.dashboardMode = button.dataset.dashboardMode;
        renderApp();
      });
    });
    root.querySelectorAll("[data-todo-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.todoMode = button.dataset.todoMode;
        state.editTodoId = "";
        renderApp();
      });
    });
    root.querySelectorAll("[data-capture-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.captureMode = button.dataset.captureMode || "save";
        renderApp();
      });
    });
    root.querySelectorAll("[data-pages-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.pagesMode = button.dataset.pagesMode || "future";
        renderApp();
      });
    });
    root.querySelectorAll("[data-refresh-summary]").forEach((button) => {
      button.addEventListener("click", refreshDailySummary);
    });
    root.querySelectorAll("[data-daily-pulse-form]").forEach((form) => {
      form.addEventListener("submit", saveDailyPulse);
    });
    root.querySelector("#quick-add-form")?.addEventListener("submit", addScheduleFromForm);
    root.querySelector("#quick-owner")?.addEventListener("change", (event) => {
      state.quickOwner = event.currentTarget.value;
    });
    root.querySelector("#quick-segment")?.addEventListener("change", (event) => {
      state.activeSegment = event.currentTarget.value;
    });
    root.querySelector("#todo-create-form")?.addEventListener("submit", saveTodo);
    root.querySelectorAll(".todo-edit-form").forEach((form) => {
      form.addEventListener("submit", saveTodo);
    });
    root.querySelectorAll("[data-personal-page-form]").forEach((form) => {
      form.addEventListener("submit", savePersonalPage);
    });
    root.querySelector("#profile-settings-form")?.addEventListener("submit", saveProfileSettings);
    root.querySelector("#checkin-form")?.addEventListener("submit", saveCheckin);
    root.querySelector("#deadline-form")?.addEventListener("submit", saveDeadline);
    root.querySelectorAll("[data-schedule-detail]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.selectedScheduleId = button.dataset.scheduleDetail || "";
        state.selectedDate = button.dataset.scheduleDate || state.selectedDate;
        state.activePage = "schedule";
        if (window.location.hash !== "#schedule") {
          window.location.hash = "#schedule";
        }
        renderApp();
      });
    });
    root.querySelectorAll("[data-toggle-item]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleScheduleItem(button.dataset.toggleItem, button.dataset.toggleUser, button.dataset.toggleDate);
      });
    });
    root.querySelectorAll("[data-delete-item]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteScheduleItem(button.dataset.deleteItem, button.dataset.deleteDate);
      });
    });
    root.querySelectorAll("[data-archive-item]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        archiveScheduleItem(button.dataset.archiveItem, button.dataset.archiveDate);
      });
    });
    root.querySelectorAll("[data-toggle-todo]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleTodo(button.dataset.toggleTodo, button.dataset.toggleUser, button.dataset.toggleDate);
      });
    });
    root.querySelectorAll("[data-edit-todo]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editTodoId = button.dataset.editTodo;
        renderApp();
      });
    });
    root.querySelectorAll("[data-cancel-edit-todo]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editTodoId = "";
        renderApp();
      });
    });
    root.querySelectorAll("[data-delete-todo]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteTodo(button.dataset.deleteTodo);
      });
    });
    root.querySelectorAll("[data-archive-todo]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        archiveTodo(button.dataset.archiveTodo, button.dataset.archiveDate);
      });
    });
    root.querySelectorAll("[data-toggle-checkin]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleCheckin(button.dataset.toggleCheckin, button.dataset.toggleUser);
      });
    });
    root.querySelectorAll("[data-delete-checkin]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteCheckin(button.dataset.deleteCheckin);
      });
    });
    root.querySelectorAll("[data-delete-deadline]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteDeadline(button.dataset.deleteDeadline);
      });
    });
    root.querySelectorAll("[data-capture-form]").forEach((form) => {
      form.addEventListener("submit", saveCapture);
    });
  }

  root.addEventListener("focusout", () => {
    window.setTimeout(applyPendingRemoteState, 120);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.authenticated) {
      applyPendingRemoteState();
      refreshState({ silent: true });
      startCollaborationSync();
    }
  });

  window.addEventListener("hashchange", () => {
    const nextPage = getPageFromHash();
    if (nextPage !== state.activePage) {
      setActivePage(nextPage);
    } else {
      syncTopNavigation();
    }
  });

  loadSession();
})();
