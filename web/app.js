(function initCoupleDashboard() {
  const root = document.querySelector("#couple-app-root");
  if (!root) return;

  const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:2333" : window.location.origin;
  const captureSubmitActions = new Set(["save", "analysis"]);
  const scheduleItemTypeLabels = {
    thing: "事情",
    date: "约会",
    purchase: "购买",
    reminder: "提醒",
    checkin: "打卡",
    habit: "习惯",
  };
  const scheduleItemTypeOptions = [
    ["thing", "事情"],
    ["date", "约会"],
    ["purchase", "购买"],
    ["reminder", "提醒"],
    ["checkin", "打卡"],
    ["habit", "习惯"],
  ];
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
      label: "首页",
      kicker: "",
      title: "",
      note: "",
    },
    {
      id: "goals",
      label: "长期记忆",
      kicker: "长期记忆",
      title: "长期记忆",
      note: "把关系偏好、目标、重要清单和未来想做放在一个记忆板里。",
    },
    {
      id: "daily-summary",
      label: "日总结",
      kicker: "回忆页",
      title: "AI 回忆页",
      note: "这一天为什么值得记住，由记录、生活卡、照片、地点和每日状态整理。",
    },
    {
      id: "settings",
      label: "设置",
      kicker: "设置",
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
    activePage: getPageFromHash(),
    activeSegment: "evening",
    quickOwner: "shared",
    editCardId: "",
    scheduleFilter: "open",
    scheduleViewStyle: "line",
    expandedScheduleGroups: new Set(),
    monthViewOpen: true,
    captureConfirmation: null,
    login: {
      login: "",
      error: "",
    },
    status: "",
    sync: {
      active: false,
      pendingState: null,
      pendingDate: "",
      message: "",
    },
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

  function addMonths(dateText, offset) {
    const date = parseDate(dateText) || new Date();
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + offset);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDay));
    return formatDate(date);
  }

  function escapeHtml(input) {
    return String(input == null ? "" : input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizePageId(value) {
    const pageId = String(value || "").replace(/^#/, "");
    if (pageId === "pages") return "goals";
    if (pageId === "capture" || pageId === "todos" || pageId === "schedule" || pageId === "timeline") return "dashboard";
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
    renderApp();
    window.scrollTo(0, 0);
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
    if (state.sync.pendingState) return "有新更新";
    return state.sync.message || "";
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

  function applyRemoteState(nextState, message = "") {
    setData(nextState);
    state.sync.pendingState = null;
    state.sync.pendingDate = "";
    state.sync.message = "";
    state.status = message;
    renderApp();
  }

  function queueRemoteState(nextState) {
    state.sync.pendingState = nextState;
    state.sync.pendingDate = nextState.selectedDate || state.selectedDate;
    state.sync.message = "有新更新";
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
      state.sync.message = "";
      return false;
    }
    applyRemoteState(state.sync.pendingState, "");
    return true;
  }

  function startCollaborationSync() {
    if (state.sync.active) return;
    state.sync.active = true;
    state.sync.message = "";
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
          state.sync.message = "";
        }
      } catch (error) {
        if (!state.authenticated) break;
        state.sync.message = `连接暂时中断：${error.message}`;
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
      renderApp();
    } catch (error) {
      state.status = `同步失败：${error.message}`;
      renderApp();
    }
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
      state.status = "";
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
    return getProfile(userId)?.displayName || "成员";
  }

  function profileStyle(userId) {
    const profile = getProfile(userId);
    return profile ? `style="--person-color: ${escapeHtml(profile.color)}"` : "";
  }

  function iconSvg(name) {
    const icons = {
      check: '<path d="M20 7 10 17l-4-4" />',
      undo: '<path d="M8 8H4v4" /><path d="M4 12a8 8 0 1 0 2.2-5.4" />',
      edit: '<path d="M5 19h4" /><path d="m13.5 5.5 5 5L8 21H3v-5Z" />',
      trash: '<path d="M5 7h14" /><path d="M9 7V5h6v2" /><path d="M8 7.5V19h8V7.5" />',
      sparkles: '<path d="M12 3.5l1.6 4.4L18 9.5l-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6Z" /><path d="M18 13l.9 2.6L21.5 16l-2.6.9L18 19.5l-.9-2.6L14.5 16l2.6-.4Z" />',
      bookmark: '<path d="M7 5h10v14l-5-3-5 3Z" />',
      plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
      x: '<path d="m6 6 12 12" /><path d="m18 6-12 12" />',
      refresh: '<path d="M18.5 7.5A8 8 0 0 0 6.7 6.7" /><path d="M5.5 6.5v4h4" /><path d="M5.5 16.5A8 8 0 0 0 17.3 17.3" /><path d="M18.5 17.5v-4h-4" />',
      logout: '<path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" /><path d="M14 9l4 3-4 3" /><path d="M18 12H10" />',
      chevronLeft: '<path d="m14 6-6 6 6 6" />',
      chevronRight: '<path d="m10 6 6 6-6 6" />',
      chevronDown: '<path d="m6 9 6 6 6-6" />',
      chevronUp: '<path d="m18 15-6-6-6 6" />',
      calendar: '<rect x="4" y="6" width="16" height="14" rx="3" /><path d="M8 4v4M16 4v4M4 10h16" />',
      clock: '<circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" />',
      camera: '<path d="M5 8h4l2-2h2l2 2h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="3" />',
      image: '<rect x="4" y="5" width="16" height="14" rx="3" /><path d="m7 15 3-3 3 3 2-2 2 2" />',
      userGroup: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path d="M4.5 18a3.5 3.5 0 0 1 7 0" /><path d="M12.5 18a3 3 0 0 1 6 0" />',
      rows: '<path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" />',
      cards: '<rect x="5" y="5" width="6" height="6" rx="1.5" /><rect x="13" y="5" width="6" height="6" rx="1.5" /><rect x="5" y="13" width="6" height="6" rx="1.5" /><rect x="13" y="13" width="6" height="6" rx="1.5" />',
      circle: '<circle cx="12" cy="12" r="7" />',
      star: '<path d="m12 4 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8Z" />',
    };
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${icons[name] || icons.check}
      </svg>
    `;
  }

  function renderIconButton({ icon, label, className = "", type = "button", attrs = "", active = false }) {
    return `
      <button
        class="icon-button${className ? ` ${className}` : ""}${active ? " is-active" : ""}"
        type="${escapeHtml(type)}"
        aria-label="${escapeHtml(label)}"
        title="${escapeHtml(label)}"
        ${attrs}
      >
        ${iconSvg(icon)}
        <span class="sr-only">${escapeHtml(label)}</span>
      </button>
    `;
  }

  function avatarPresetColor(avatar, fallbackColor) {
    const colors = {
      "pink-cat": "#ff78ad",
      "violet-cat": "#8b79ff",
      "mint-cat": "#24b99a",
      "yellow-cat": "#e0a72e",
    };
    return colors[avatar] || fallbackColor || "#ff78ad";
  }

  function renderAvatar(profileOrUserId, className = "", options = {}) {
    const profile = typeof profileOrUserId === "string" ? getProfile(profileOrUserId) : profileOrUserId;
    if (!profile) {
      return `<span class="pixel-person-cat person-avatar ${escapeHtml(className)}" aria-hidden="true"></span>`;
    }
    const style = `style="--person-color: ${escapeHtml(profile.color)}; --avatar-color: ${escapeHtml(avatarPresetColor(profile.avatar, profile.color))}"`;
    const avatarClass = `${className} avatar-${String(profile.avatar || "pink-cat").replace(/[^\w-]/g, "")}`;
    const label = escapeHtml(profile.displayName || "成员头像");
    if (profile.avatarUrl && options.allowImage !== false) {
      return `
        <span class="person-avatar has-image ${escapeHtml(avatarClass)}" ${style}>
          <img src="${escapeHtml(profile.avatarUrl)}" alt="${label}" />
        </span>
      `;
    }
    return `<span class="pixel-person-cat person-avatar ${escapeHtml(avatarClass)}" ${style} aria-hidden="true"></span>`;
  }

  function scheduleCardAvatarIds(card) {
    const participantIds = Array.isArray(card.participants) ? card.participants.filter(Boolean) : [];
    const currentId = currentUser()?.id;
    if (card.ownerId === "shared" || participantIds.length > 1) {
      const ids = participantIds.slice(0, 2);
      if (ids.length < 2 && profiles().length) {
        profiles().forEach((profile) => {
          if (ids.length < 2 && !ids.includes(profile.id)) ids.push(profile.id);
        });
      }
      return ids.slice(0, 2);
    }
    return [card.ownerId || currentId].filter(Boolean).slice(0, 2);
  }

  function renderScheduleCardAvatars(card) {
    const ids = scheduleCardAvatarIds(card);
    return `
      <div class="schedule-card-avatar-stack${ids.length > 1 ? " is-paired" : ""}" aria-hidden="true">
        ${ids
          .map((userId) => renderAvatar(userId, "schedule-card-avatar"))
          .join("")}
      </div>
    `;
  }

  function renderCoupleCatPair(className = "") {
    const pair = profiles().slice(0, 2);
    if (!pair.length) return "";
    return `
      <div class="couple-cat-pair ${escapeHtml(className)}" aria-label="${escapeHtml(pair.map((profile) => profile.displayName).join("和"))}">
        ${pair.map((profile) => renderAvatar(profile, "couple-pair-avatar")).join("")}
      </div>
    `;
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

  function isArchived(item) {
    return Boolean(item?.archivedAt);
  }

  function capturesForSelectedDate() {
    return state.data?.captures || [];
  }

  function futureItems() {
    return (state.data?.todoItems || []).filter((item) => item?.bucket === "future");
  }

  function segmentLabel(segmentKey) {
    return state.data?.segments?.find((segment) => segment.key === segmentKey)?.label || "全天";
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

  function ownerShortLabel(ownerId) {
    if (ownerId === "shared") return "共同";
    if (ownerId === currentUser()?.id) return "我";
    return "对方";
  }

  function renderItemTypeOptions(selectedType = "thing") {
    return scheduleItemTypeOptions
      .map(
        ([value, label]) => `
          <option value="${escapeHtml(value)}"${selectedType === value ? " selected" : ""}>${escapeHtml(label)}</option>
        `
      )
      .join("");
  }

  function normalizeCardItemType(itemType) {
    return scheduleItemTypeLabels[itemType] ? itemType : "thing";
  }

  function allScheduleItemCards() {
    return Array.isArray(state.data?.scheduleItemCards) ? state.data.scheduleItemCards : [];
  }

  function findScheduleItemCard(cardId) {
    return allScheduleItemCards().find((card) => card.id === cardId);
  }

  function groupedScheduleCards(cards) {
    return cards.reduce((groups, card) => {
      if (!groups.has(card.date)) {
        groups.set(card.date, []);
      }
      groups.get(card.date).push(card);
      return groups;
    }, new Map());
  }

  function cardTimeSummary(card) {
    const datePart = card.bucket === "future" ? "未来" : card.date;
    const timePart = card.timeLabel || (card.repeatRule ? card.repeatRule : "");
    return [datePart, timePart].filter(Boolean).join(" · ");
  }

  function scheduleCardTitle(card) {
    return String(card.title || card.sourceCaptureSummary || "记录").trim();
  }

  function cardPriorityRank(card) {
    if (isArchived(card)) return 5;
    if (card.completion?.allDone) return 4;
    if (card.priority === "high") return 0;
    if (card.sourceType === "insight") return 1;
    if (card.priority === "low") return 3;
    return 2;
  }

  function sortScheduleCardsForView(cards) {
    const segmentWeight = { morning: 0, noon: 1, afternoon: 2, evening: 3, allDay: 4 };
    return [...cards].sort((a, b) => {
      const dateSort = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateSort !== 0) return dateSort;
      const prioritySort = cardPriorityRank(a) - cardPriorityRank(b);
      if (prioritySort !== 0) return prioritySort;
      const segmentSort = (segmentWeight[a.segment] ?? 5) - (segmentWeight[b.segment] ?? 5);
      if (segmentSort !== 0) return segmentSort;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  function filterScheduleCardsForView(cards) {
    const selectedDate = state.selectedDate;
    const filter = state.scheduleFilter || "open";
    if (filter === "all") return cards;
    if (filter === "date") return cards.filter((card) => card.date === selectedDate);
    if (filter === "important") {
      return cards.filter((card) => card.priority === "high" || card.sourceType === "insight");
    }
    return cards.filter((card) => !isArchived(card) && !card.completion?.allDone);
  }

  function cardSummaryLine(card) {
    const time = cardTimeSummary(card);
    const detail = String(card.detail || "")
      .replace("这是第一条共享日程，可以直接改掉。", "")
      .replace("这是第一张共享生活卡，可以直接改掉。", "")
      .replace("这是第一张共享生活卡，可以直接改。", "")
      .trim();
    const source = String(card.sourceCaptureSummary || "").trim();
    const pieces = time ? [time] : [];

    if (detail && detail !== card.timeLabel && detail !== card.repeatRule) {
      pieces.push(detail);
    }
    if (source) {
      pieces.push(`${card.sourceType === "insight" ? "后台记住" : "来源"}：${source}`);
    }
    if (isArchived(card)) {
      pieces.push("已归档");
    }

    return pieces.filter(Boolean).join(" · ");
  }

  function splitCardsForDay(cards) {
    const visibleIds = new Set();
    cards.forEach((card, index) => {
      if (index < 3 || card.priority === "high" || card.sourceType === "insight") {
        visibleIds.add(card.id);
      }
    });
    return {
      visible: cards.filter((card) => visibleIds.has(card.id)),
      folded: cards.filter((card) => !visibleIds.has(card.id)),
    };
  }

  function cardStatusText(card) {
    if (card.statusLabel) return card.statusLabel;
    const done = Number(card.completion?.done || 0);
    const total = Number(card.completion?.total || card.participants?.length || 0);
    if (!total) return "未开始";
    if (done >= total) return "已完成";
    if (done > 0) return `${done}/${total} 完成`;
    return "待完成";
  }

  function thingClass(item) {
    if (item.bucket === "future") return "未来";
    return item.ownerId === "shared" || item.participants.length > 1 ? "双人" : "单人";
  }

  function renderScheduleItemCard(card, options = {}) {
    const itemType = normalizeCardItemType(card.itemType);
    const isDone = Boolean(card.completion?.allDone);
    const isCurrentDone = Boolean(card.completion?.currentUserDone);
    const archived = isArchived(card);
    const readOnly = Boolean(card.readOnly || card.sourceType === "insight");
    const ownerStyle = card.ownerId && card.ownerId !== "shared" ? profileStyle(card.ownerId) : "";
    const title = scheduleCardTitle(card);
    const summary = cardSummaryLine(card);
    const compact = Boolean(options.compact || options.viewStyle === "line");
    const compactClass = compact ? " is-compact" : "";
    const lineClass = options.viewStyle === "line" ? " is-line" : "";
    const status = cardStatusText(card);

    if (!readOnly && state.editCardId === card.id) {
      return renderScheduleItemEditForm(card);
    }

    if (compact) {
      return `
        <article class="schedule-item-card is-compact${lineClass} is-${escapeHtml(itemType)} is-source-${escapeHtml(card.sourceType || "item")}${readOnly ? " is-readonly" : ""}${isDone ? " is-done" : ""}${archived ? " is-archived" : ""}" data-card-id="${escapeHtml(card.id)}">
          ${renderScheduleCardAvatars(card)}
          <div class="schedule-compact-copy">
            <div class="schedule-card-meta-row">
              <span class="schedule-card-type">${escapeHtml(scheduleItemTypeLabels[itemType])}</span>
              <span class="schedule-card-owner" ${ownerStyle}>${escapeHtml(ownerShortLabel(card.ownerId))}</span>
              <span class="schedule-card-status">${escapeHtml(status)}</span>
            </div>
            <strong>${escapeHtml(title)}</strong>
            ${summary ? `<small>${escapeHtml(summary)}</small>` : ""}
          </div>
          ${
            readOnly
              ? ""
              : `<div class="schedule-card-actions schedule-card-actions-line">
                  ${renderIconButton({
                    icon: isCurrentDone ? "undo" : "check",
                    label: isCurrentDone ? "取消完成" : "完成",
                    className: `is-primary${isCurrentDone ? " is-done" : ""}`,
                    attrs: `data-card-toggle="${escapeHtml(card.id)}"`,
                  })}
                </div>`
          }
        </article>
      `;
    }

    return `
      <article class="schedule-item-card is-${escapeHtml(itemType)} is-source-${escapeHtml(card.sourceType || "item")}${readOnly ? " is-readonly" : ""}${isDone ? " is-done" : ""}${archived ? " is-archived" : ""}${compactClass}" data-card-id="${escapeHtml(card.id)}">
        ${renderScheduleCardAvatars(card)}
        <div class="schedule-card-main">
          <div class="schedule-card-head">
            <div class="schedule-card-head-copy">
              <div class="schedule-card-meta-row">
                <span class="schedule-card-type">${escapeHtml(scheduleItemTypeLabels[itemType])}</span>
                <span class="schedule-card-owner" ${ownerStyle}>${escapeHtml(ownerShortLabel(card.ownerId))}</span>
                <span class="schedule-card-status">${escapeHtml(status)}</span>
              </div>
              <div class="schedule-card-title-row">
                <h3>${escapeHtml(title)}</h3>
              </div>
            </div>
            ${
              readOnly
                ? ""
                : `
                  <div class="schedule-card-actions">
                    ${renderIconButton({
                      icon: isCurrentDone ? "undo" : "check",
                      label: isCurrentDone ? "取消完成" : "完成",
                      className: `is-primary${isCurrentDone ? " is-done" : ""}`,
                      attrs: `data-card-toggle="${escapeHtml(card.id)}"`,
                    })}
                    ${renderIconButton({
                      icon: "edit",
                      label: "编辑",
                      attrs: `data-card-edit="${escapeHtml(card.id)}"`,
                    })}
                  </div>
                `
            }
          </div>
          ${summary ? `<p class="schedule-card-summary">${escapeHtml(summary)}</p>` : ""}
        </div>
      </article>
    `;
  }

  function renderScheduleItemEditForm(card) {
    const itemType = normalizeCardItemType(card.itemType);
    const canDate = card.sourceType !== "checkin";
    const detailLabel = card.sourceType === "checkin" ? "时段" : "细节";
    return `
      <article class="schedule-item-card is-editing is-${escapeHtml(itemType)}" data-card-id="${escapeHtml(card.id)}">
        <form class="schedule-card-edit-form" data-card-edit-form>
          <input type="hidden" name="cardId" value="${escapeHtml(card.id)}" />
          <div class="schedule-card-edit-head">
            ${renderScheduleCardAvatars(card)}
            <div class="schedule-card-edit-copy">
              <span class="schedule-card-type">${escapeHtml(scheduleItemTypeLabels[itemType])}</span>
              <input name="title" type="text" value="${escapeHtml(card.title || "")}" placeholder="标题" />
            </div>
          </div>
          <textarea name="detail" rows="2" placeholder="${escapeHtml(detailLabel)}">${escapeHtml(card.detail || card.slot || "")}</textarea>
          <div class="schedule-card-edit-grid">
            <select name="itemType">${renderItemTypeOptions(itemType)}</select>
            ${canDate ? `<input name="date" type="date" value="${escapeHtml(card.date)}" />` : `<input name="date" type="hidden" value="${escapeHtml(card.date)}" />`}
            ${
              card.sourceType === "schedule"
                ? `
                  <select name="segment">
                    ${(state.data?.segments || [])
                      .map((segment) => `<option value="${escapeHtml(segment.key)}"${card.segment === segment.key ? " selected" : ""}>${escapeHtml(segment.label)}</option>`)
                      .join("")}
                  </select>
                `
                : `<input name="segment" type="hidden" value="${escapeHtml(card.segment || "allDay")}" />`
            }
            ${
              card.sourceType !== "checkin"
                ? `<select name="ownerId">${renderOwnerOptions(card.ownerId)}</select>`
                : `<input name="ownerId" type="hidden" value="shared" />`
            }
            <input name="repeatRule" type="text" value="${escapeHtml(card.repeatRule || "")}" placeholder="周期，可留空" />
          </div>
          <div class="schedule-card-inline-actions">
            ${renderIconButton({
              icon: "check",
              label: "保存",
              className: "is-primary",
              type: "submit",
            })}
            ${renderIconButton({
              icon: "x",
              label: "取消",
              attrs: `data-card-cancel-edit`,
            })}
            ${renderIconButton({
              icon: "trash",
              label: "删除",
              className: "is-danger",
              attrs: `data-card-delete="${escapeHtml(card.id)}"`,
            })}
          </div>
        </form>
      </article>
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

    const nextWeekDay = raw.match(/下周([一二三四五六日天])/);
    if (nextWeekDay) {
      const selected = parseDate(fallbackDate || state.selectedDate) || new Date();
      const target = nextWeekDay[1] === "日" || nextWeekDay[1] === "天" ? 0 : weekdayIndex[nextWeekDay[1]] + 1;
      const offset = ((target - selected.getDay() + 7) % 7) + 7;
      selected.setDate(selected.getDate() + offset);
      return formatDate(selected);
    }
    if (/下周/.test(raw)) return addDays(fallbackDate || state.selectedDate, 7);

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

  function inferItemTypeFromText(raw) {
    const text = String(raw || "");
    if (/买|购|下单|采购|补货/.test(text)) return "purchase";
    if (/提醒|记得|别忘|ddl|截止|deadline|纪念日|生日|周年|答辩|考试|面试/i.test(text)) return "reminder";
    if (/习惯|每天|每日|每周|周期|固定/.test(text)) return "habit";
    if (/打卡|签到|记录/.test(text)) return "checkin";
    if (/约|见|聚|电影|吃饭|咖啡|一起|日料|散步|看日落|海边/.test(text)) return "date";
    return "thing";
  }

  function inferCaptureDecision(raw) {
    const text = String(raw || "");
    if (/偏好|边界|喜欢|不喜欢|讨厌|雷区|好闻|安静|太吵|重要的是|长期|目标|以后要|未来想|记住|答应|承诺|说好|帮你|我来|下次带你|谢谢|感谢|吵架|争执|生气|委屈/.test(text)) {
      return "memory";
    }
    if (/今天|明天|周[一二三四五六日天]|上午|中午|下午|晚上|今晚|\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}|提醒|买|约|打卡|习惯|答辩|考试|面试|ddl|截止/i.test(text)) {
      return "schedule";
    }
    return "capture";
  }

  function captureConfirmationFor(capture, payload = {}) {
    const text = capture?.text || payload.text || "";
    const decision = inferCaptureDecision(text);
    const itemType = inferItemTypeFromText(text);
    const date = resolveQuickDate(text, state.selectedDate);
    const segment = resolveQuickSegment(text, "allDay");
    const ownerId = payload.ownerId || state.quickOwner || "shared";
    const title = captureTitle(cleanQuickTitle(text) || text);
    const detail = captureDetail(text, title);
    return {
      captureId: capture?.id || "",
      text,
      decision,
      itemType,
      date,
      segment,
      ownerId,
      title,
      detail,
      repeatRule: itemType === "habit" ? "daily" : "",
      relatedItems: [],
    };
  }

  async function analyzeRawCapture(capture, payload = {}) {
    const result = await request("/api/couple/capture/analyze", {
      method: "POST",
      body: {
        captureId: capture?.id || "",
        text: payload.text || capture?.text || "",
        date: payload.date || state.selectedDate,
        ownerId: payload.ownerId || state.quickOwner || "shared",
      },
    });
    return result?.confirmation || captureConfirmationFor(capture, payload);
  }

  function confirmationDecisionLabel(decision) {
    if (decision === "memory") return "长期记忆";
    if (decision === "capture") return "仅记录";
    return "生活卡";
  }

  function confirmationTimeLabel(confirmation) {
    if (!confirmation) return "";
    if (confirmation.decision === "memory") return "记忆线索";
    if (confirmation.decision !== "schedule") return "只保存记录";
    return [confirmation.date, segmentLabel(confirmation.segment)].filter(Boolean).join(" · ");
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

  async function toggleScheduleItem(itemId, targetUserId, date) {
    const item = state.data?.scheduleItems?.find((entry) => entry.id === itemId);
    if (item) {
      const current = item.statusByUser?.[targetUserId] === "done" ? "done" : "todo";
      item.statusByUser = {
        ...(item.statusByUser || {}),
        [targetUserId]: current === "done" ? "todo" : "done",
      };
      state.status = "生活卡状态已更新。";
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
      state.status = "生活卡状态已同步。";
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
    state.status = "已删除这张生活卡。";
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
      ?.slice(0, 120) || "记录";
  }

  function captureDetail(text, title) {
    const value = String(text || "").trim();
    return value === title ? "" : value;
  }

  async function persistCaptureRecord(confirmation, statusText, modeOverride = "") {
    if (confirmation.captureId) {
      state.captureConfirmation = null;
      state.status = statusText;
      renderApp();
      return true;
    }

    const result = await request("/api/couple/capture", {
      method: "POST",
      body: {
        date: confirmation.captureDate || state.selectedDate,
        text: confirmation.text || "",
        mode: modeOverride || (confirmation.decision === "memory" ? "analysis" : "save"),
        visibility: confirmation.visibility || "shared",
        location: confirmation.location || "",
        assets: confirmation.assets || [],
      },
    });
    if (!result) return false;
    setData(result.state);
    state.captureConfirmation = null;
    state.status = statusText;
    renderApp();
    return true;
  }

  async function saveRawCapture(payload) {
    const result = await request("/api/couple/capture", {
      method: "POST",
      body: {
        date: payload.date || state.selectedDate,
        text: payload.text || "",
        mode: "save",
        visibility: payload.visibility || "shared",
        location: payload.location || "",
        assets: payload.assets || [],
        rawKind: "raw",
        rawFormat: payload.assets?.length ? "markdown+photo" : "markdown",
        analysisIntent: payload.mode === "analysis" ? "agent" : "",
      },
    });
    if (!result) return null;
    setData(result.state);
    return result.capture || null;
  }

  async function saveCapture(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = String(formData.get("text") || "").trim();
    if (!text) return;

    const submitMode = event.submitter?.dataset?.captureSubmitMode || event.submitter?.value || "";
    const modeSource = String(submitMode || formData.get("mode") || "save");
    const mode = captureSubmitActions.has(modeSource) ? modeSource : "save";
    const ownerId = String(formData.get("ownerId") || "shared");
    const visibility = formData.get("visibility") || "shared";
    const location = String(formData.get("location") || "").trim();
    const photo = event.currentTarget.querySelector('input[name="photo"]')?.files?.[0] || null;
    const captureDate = state.selectedDate;

    try {
      let assets = [];
      if (photo) {
        if (photo.size > 5 * 1024 * 1024) {
          state.status = "图片不能超过 5MB。";
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

      if (mode === "analysis") {
        const rawCapture = await saveRawCapture({
          date: captureDate,
          text,
          mode: "analysis",
          visibility,
          location,
          assets,
        });
        if (!rawCapture) return;
        const confirmation = await analyzeRawCapture(rawCapture, {
          date: captureDate,
          text,
          ownerId,
        });
        state.captureConfirmation = {
          ...confirmation,
          captureDate: state.selectedDate,
          visibility,
          location,
          assets,
          rawSaved: true,
        };
        state.status = "";
        renderApp();
        return;
      }

      const captureResult = await saveRawCapture({
        date: captureDate,
        text,
        mode,
        visibility,
        location,
        assets,
      });
      if (!captureResult) return;
      state.captureConfirmation = null;
      state.status = "";
      renderApp();
    } catch (error) {
      state.status = `保存失败：${error.message}`;
      renderApp();
    }
  }

  async function submitCaptureConfirmation(event) {
    event.preventDefault();
    if (!state.captureConfirmation) return;
    const formData = new FormData(event.currentTarget);
    const confirmation = {
      ...state.captureConfirmation,
      title: String(formData.get("title") || state.captureConfirmation.title || "").trim(),
      itemType: normalizeCardItemType(String(formData.get("itemType") || state.captureConfirmation.itemType || "thing")),
      date: String(formData.get("date") || state.captureConfirmation.date || state.selectedDate),
      segment: String(formData.get("segment") || state.captureConfirmation.segment || "allDay"),
      ownerId: String(formData.get("ownerId") || state.captureConfirmation.ownerId || "shared"),
      repeatRule: String(formData.get("repeatRule") || state.captureConfirmation.repeatRule || ""),
    };

    if (confirmation.decision !== "schedule") {
      try {
        await persistCaptureRecord(
          confirmation,
          confirmation.decision === "memory" ? "已保存为长期记忆线索。" : "已仅保存为记录。"
        );
      } catch (error) {
        state.status = `保存失败：${error.message}`;
        renderApp();
      }
      return;
    }

    if (!confirmation.title) return;
    try {
      const result = await request("/api/couple/life-cards/from-confirmation", {
        method: "POST",
        body: {
          ...confirmation,
          sourceCaptureId: confirmation.captureId || confirmation.sourceCaptureId || "",
        },
      });
      if (!result) return;
      setData(result.state);
      state.captureConfirmation = null;
      state.selectedDate = confirmation.date;
      state.status = "";
      renderApp();
    } catch (error) {
      state.status = `确认失败：${error.message}`;
      renderApp();
    }
  }

  async function dismissCaptureConfirmation() {
    if (!state.captureConfirmation) return;
    try {
      await persistCaptureRecord(state.captureConfirmation, "已仅保存为记录。", "save");
    } catch (error) {
      state.status = `保存失败：${error.message}`;
      renderApp();
    }
  }

  async function refreshDailySummary() {
    state.status = "正在刷新 AI 回忆页 ...";
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
      state.status = "AI 回忆页已刷新。";
      renderApp();
    } catch (error) {
      state.status = `回忆页刷新失败：${error.message}`;
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

  function sourceTypeForItemType(itemType) {
    if (itemType === "checkin" || itemType === "habit") return "checkin";
    if (itemType === "purchase" || itemType === "thing") return "todo";
    return "schedule";
  }

  function baseCardPayload(card, overrides = {}) {
    const ownerId = overrides.ownerId ?? card.ownerId ?? "shared";
    return {
      id: card.sourceId,
      date: overrides.date ?? card.date ?? state.selectedDate,
      title: overrides.title ?? card.title ?? "",
      detail: overrides.detail ?? card.detail ?? "",
      itemType: overrides.itemType ?? card.itemType ?? "thing",
      sourceCaptureId: overrides.sourceCaptureId ?? card.sourceCaptureId ?? "",
      repeatRule: overrides.repeatRule ?? card.repeatRule ?? "",
      ownerId,
      participants: ownerToParticipants(ownerId),
    };
  }

  async function upsertScheduleCard(card, overrides = {}) {
    if (card.readOnly || card.sourceType === "insight") {
      state.status = "后台建议会随数据自动更新。";
      renderApp();
      return null;
    }
    const payload = baseCardPayload(card, overrides);
    let endpoint = "/api/couple/schedule/upsert";
    let body = {
      ...payload,
      segment: overrides.segment ?? card.segment ?? "allDay",
    };

    if (card.sourceType === "todo") {
      endpoint = "/api/couple/todos/upsert";
      body = {
        ...payload,
        bucket: overrides.bucket ?? card.bucket ?? "today",
        priority: overrides.priority ?? card.priority ?? "normal",
      };
    } else if (card.sourceType === "checkin") {
      endpoint = "/api/couple/checkins/upsert";
      body = {
        ...payload,
        slot: overrides.slot ?? overrides.detail ?? card.slot ?? card.detail ?? "",
        ownerId: "shared",
        participants: profiles().map((profile) => profile.id),
      };
    } else if (card.sourceType === "deadline") {
      endpoint = "/api/couple/deadlines/upsert";
      body = payload;
    }

    const result = await request(endpoint, {
      method: "POST",
      body,
    });
    if (!result) return null;
    setData(result.state);
    return result;
  }

  async function createScheduleCard(payload) {
    const itemType = normalizeCardItemType(payload.itemType);
    const sourceType = sourceTypeForItemType(itemType);
    let endpoint = "/api/couple/schedule/upsert";
    let body = {
      date: payload.date || state.selectedDate,
      title: payload.title,
      detail: payload.detail || "",
      itemType,
      segment: payload.segment || "allDay",
      ownerId: payload.ownerId || "shared",
      participants: ownerToParticipants(payload.ownerId || "shared"),
      sourceCaptureId: payload.sourceCaptureId || "",
      repeatRule: payload.repeatRule || "",
    };

    if (sourceType === "todo") {
      endpoint = "/api/couple/todos/upsert";
      body = {
        ...body,
        bucket: payload.bucket || "today",
        priority: payload.priority || "normal",
      };
    } else if (sourceType === "checkin") {
      endpoint = "/api/couple/checkins/upsert";
      body = {
        date: payload.date || state.selectedDate,
        title: payload.title,
        slot: payload.detail || payload.slot || "",
        itemType,
        sourceCaptureId: payload.sourceCaptureId || "",
        repeatRule: payload.repeatRule || (itemType === "habit" ? "daily" : ""),
        ownerId: "shared",
        participants: profiles().map((profile) => profile.id),
      };
    }

    const result = await request(endpoint, {
      method: "POST",
      body,
    });
    if (!result) return null;
    setData(result.state);
    return result;
  }

  async function saveScheduleCardEdit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const card = findScheduleItemCard(String(formData.get("cardId") || ""));
    if (!card) return;
    const title = String(formData.get("title") || "").trim();
    if (!title) return;

    try {
      await upsertScheduleCard(card, {
        title,
        detail: formData.get("detail") || "",
        slot: formData.get("detail") || "",
        itemType: formData.get("itemType") || card.itemType,
        date: formData.get("date") || card.date,
        segment: formData.get("segment") || card.segment,
        ownerId: formData.get("ownerId") || card.ownerId,
        repeatRule: formData.get("repeatRule") || "",
      });
      state.editCardId = "";
      state.status = "生活卡已更新。";
      renderApp();
    } catch (error) {
      state.status = `生活卡保存失败：${error.message}`;
      renderApp();
    }
  }

  async function toggleScheduleCard(cardId) {
    const card = findScheduleItemCard(cardId);
    const userId = currentUser()?.id;
    if (!card || !userId) return;
    if (card.readOnly || card.sourceType === "insight") {
      state.status = "后台建议不需要手动完成。";
      renderApp();
      return;
    }

    if (card.sourceType === "schedule") {
      await toggleScheduleItem(card.sourceId, userId, card.date);
      return;
    }
    if (card.sourceType === "todo") {
      await toggleTodo(card.sourceId, userId, card.date);
      return;
    }
    if (card.sourceType === "checkin") {
      await toggleCheckin(card.sourceId, userId);
      return;
    }

    try {
      const result = await request("/api/couple/deadlines/toggle", {
        method: "POST",
        body: {
          id: card.sourceId,
          targetUserId: userId,
          date: card.date,
        },
      });
      if (!result) return;
      setData(result.state);
      state.status = "提醒状态已同步。";
      renderApp();
    } catch (error) {
      state.status = `提醒更新失败：${error.message}`;
      await refreshState();
    }
  }

  async function deleteScheduleCard(cardId) {
    const card = findScheduleItemCard(cardId);
    if (!card) return;
    if (card.readOnly || card.sourceType === "insight") {
      state.status = "后台建议会随记录和生活卡自动变化。";
      renderApp();
      return;
    }
    if (card.sourceType === "schedule") {
      await deleteScheduleItem(card.sourceId, card.date);
      return;
    }
    if (card.sourceType === "todo") {
      await deleteTodo(card.sourceId, card.date);
      return;
    }
    if (card.sourceType === "checkin") {
      await deleteCheckin(card.sourceId);
      return;
    }
    await deleteDeadline(card.sourceId, card.date);
  }

  async function toggleTodo(itemId, targetUserId, date) {
    const item = state.data?.todoItems?.find((entry) => entry.id === itemId);
    if (item) {
      const current = item.statusByUser?.[targetUserId] === "done" ? "done" : "todo";
      item.statusByUser = {
        ...(item.statusByUser || {}),
        [targetUserId]: current === "done" ? "todo" : "done",
      };
      state.status = "生活卡状态已更新。";
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
      state.status = "生活卡状态已同步。";
      renderApp();
    } catch (error) {
      state.status = `生活卡更新失败：${error.message}`;
      await refreshState();
    }
  }

  async function deleteTodo(itemId, date = state.selectedDate) {
    const result = await request("/api/couple/todos/delete", {
      method: "POST",
      body: {
        id: itemId,
        date,
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "生活卡已删除。";
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

  async function deleteDeadline(itemId, date = state.selectedDate) {
    const result = await request("/api/couple/deadlines/delete", {
      method: "POST",
      body: {
        id: itemId,
        date,
      },
    });
    if (!result) return;
    setData(result.state);
    state.status = "重要日期已删除。";
    renderApp();
  }

  function renderLogin() {
    const bootstrap = state.bootstrap || { profiles: [], space: { name: "我们的共同首页" } };
    const selectedLogin = state.login.login || bootstrap.profiles?.[0]?.login || "";

    root.innerHTML = `
      <section class="couple-login-panel">
        <div class="couple-login-copy">
          <span class="pixel-cat-mark pixel-cat-mark-large" aria-hidden="true"></span>
          <p class="couple-kicker">Pink Cat Workspace</p>
          <h1>${escapeHtml(bootstrap.space?.name || "我们的共同首页")}</h1>
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
          ${renderIconButton({
            icon: "chevronRight",
            label: "进入首页",
            className: "is-primary",
            type: "submit",
          })}
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
        <h1>首页暂时打不开</h1>
        <p>${escapeHtml(message)}</p>
        ${renderIconButton({
          icon: "refresh",
          label: "重试",
          className: "is-primary",
          attrs: 'id="retry-load"',
        })}
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
        <div class="couple-workspace-head${state.activePage === "dashboard" ? " is-dashboard" : ""}">
          ${
            state.activePage === "dashboard"
              ? `<div class="workspace-cats-only">${renderCoupleCatPair("dashboard-head-pair")}</div>`
              : `
                <div class="workspace-title-block">
                  <p class="couple-kicker">${escapeHtml(page.kicker)}</p>
                  <h1>${escapeHtml(page.title)}</h1>
                  <p class="couple-headline-note">${escapeHtml(page.note)}</p>
                </div>
              `
          }
          <div class="couple-session-card">
            ${renderAvatar(currentUser(), "session-avatar")}
            <div>
              <strong>${escapeHtml(currentUser().displayName)}</strong>
              <span>当前登录</span>
            </div>
            ${renderIconButton({
              icon: "logout",
              label: "退出",
              attrs: 'id="logout-button"',
            })}
          </div>
        </div>

        <div class="couple-date-bar">
          ${renderIconButton({
            icon: "chevronLeft",
            label: "上一天",
            attrs: 'data-date-offset="-1"',
          })}
          <label class="couple-date-now">
            ${iconSvg("calendar")}
            <div class="couple-date-copy">
              <strong>${escapeHtml(day.label || "")} ${escapeHtml(day.shortLabel || state.selectedDate)}</strong>
              <span>${escapeHtml(state.selectedDate)}</span>
            </div>
            <input class="couple-date-input" type="date" value="${escapeHtml(state.selectedDate)}" aria-label="选择日期" data-date-picker />
          </label>
          ${renderIconButton({
            icon: "chevronRight",
            label: "下一天",
            attrs: 'data-date-offset="1"',
          })}
        </div>
        <div class="couple-page-view" data-page-view="${escapeHtml(state.activePage)}">
          ${renderCurrentPage()}
        </div>
      </section>
    `;

    bindAppEvents();
    syncTopNavigation();
  }

  function renderCurrentPage() {
    if (state.activePage === "daily-summary") return renderDailySummaryPanel();
    if (state.activePage === "goals") return renderGoalsPage();
    if (state.activePage === "settings") return renderSettingsPage();
    return renderDashboard();
  }

  function renderDashboard() {
    return `
      <section class="couple-panel diary-dashboard-panel dashboard-wide" id="dashboard">
        ${renderDashboardChatBox()}
        ${renderMonthView()}
        ${renderScheduleTimeline({
          cards: allScheduleItemCards(),
          title: "生活卡",
          empty: "还没有生活卡。先在上面写一句。",
        })}
      </section>
    `;
  }

  function renderMonthView() {
    const summary = state.data?.monthSummary || { month: state.selectedDate.slice(0, 7), days: [] };
    const monthLabel = summary.month || state.selectedDate.slice(0, 7);
    const days = Array.isArray(summary.days) ? summary.days : [];

    return `
      <section class="month-dashboard is-compact${state.monthViewOpen ? "" : " is-collapsed"}" aria-label="月视图">
        <div class="month-dashboard-head">
          ${renderIconButton({
            icon: "chevronLeft",
            label: "上个月",
            attrs: 'data-month-offset="-1"',
          })}
          <strong>${escapeHtml(monthLabel)}</strong>
          ${renderIconButton({
            icon: "chevronRight",
            label: "下个月",
            attrs: 'data-month-offset="1"',
          })}
          ${renderIconButton({
            icon: state.monthViewOpen ? "chevronUp" : "chevronDown",
            label: state.monthViewOpen ? "收起月视图" : "展开月视图",
            attrs: "data-month-toggle",
          })}
        </div>
        ${
          state.monthViewOpen
            ? `
              <div class="month-grid is-picker">
                ${days.map((day) => renderMonthDay(day)).join("")}
              </div>
            `
            : ""
        }
      </section>
    `;
  }

  function renderMonthDay(day) {
    const cardCount = Number(day.eventCount || 0) + Number(day.todoCount || 0);
    const captureCount = Number(day.captureCount || 0);
    const hasSummary = Boolean(day.summaryGenerated);
    const active = day.id === state.selectedDate;
    const className = [
      "month-day-cell",
      "is-picker-day",
      active ? "is-active" : "",
      day.isToday ? "is-today" : "",
      day.isFuture ? "is-future-day" : "",
      cardCount ? "is-plan-day" : "",
      captureCount ? "is-note-day" : "",
      hasSummary ? "is-summary-day" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <button class="${className}" type="button" data-date-select="${escapeHtml(day.id)}" aria-label="${escapeHtml(day.id)}">
        <span class="month-day-top">
          <b class="month-day-number">${escapeHtml(day.dayNumber || day.id.slice(-2))}</b>
          ${active ? `<em>选中</em>` : ""}
        </span>
        <span class="month-day-markers" aria-hidden="true">
          ${cardCount ? `<i class="is-schedule">${escapeHtml(cardCount)}</i>` : ""}
          ${captureCount ? `<i class="is-capture">${escapeHtml(captureCount)}</i>` : ""}
          ${hasSummary ? `<i class="is-summary"></i>` : ""}
        </span>
      </button>
    `;
  }

  function renderDashboardChatBox() {
    return `
      <section class="dashboard-chat-panel">
        <form class="capture-form dashboard-chat-form" data-capture-form>
          <input type="hidden" name="mode" value="save" />
          <input type="hidden" name="ownerId" value="shared" />
          <input type="hidden" name="visibility" value="shared" />
          <textarea name="text" rows="1" aria-label="写一句记录" placeholder="写一句就好：她想吃日料 / 周六吃饭"></textarea>
          <div class="dashboard-capture-controls">
            <div class="dashboard-capture-symbols" aria-label="记录动作">
              ${renderIconButton({
                icon: "bookmark",
                label: "记下来",
                className: "is-save",
                attrs: 'data-capture-submit-mode="save"',
                type: "submit",
              })}
              ${renderIconButton({
                icon: "sparkles",
                label: "交给 Agent",
                className: "is-primary",
                attrs: 'data-capture-submit-mode="analysis"',
                type: "submit",
              })}
            </div>
          </div>
        </form>
        ${renderCaptureConfirmation()}
      </section>
    `;
  }

  function renderCaptureConfirmation() {
    const confirmation = state.captureConfirmation;
    if (!confirmation) {
      return "";
    }

    const isSchedule = confirmation.decision === "schedule";
    const relatedCount = Array.isArray(confirmation.relatedItems) ? confirmation.relatedItems.length : 0;
    return `
      <form class="capture-confirmation-bar is-${escapeHtml(confirmation.decision)}" data-capture-confirm-form>
        <div class="capture-confirm-copy">
          <strong>
            识别为：${escapeHtml(confirmationDecisionLabel(confirmation.decision))}
            ${isSchedule ? ` · ${escapeHtml(scheduleItemTypeLabels[normalizeCardItemType(confirmation.itemType)])}` : ""}
            · ${escapeHtml(confirmationTimeLabel(confirmation))}
            · ${escapeHtml(ownerShortLabel(confirmation.ownerId))}
            ${relatedCount ? ` · +${escapeHtml(relatedCount)} 相关` : ""}
          </strong>
          <span>${escapeHtml(confirmation.text)}</span>
        </div>
        <div class="capture-confirm-actions">
          ${renderIconButton({
            icon: "check",
            label: "确认",
            className: "is-primary",
            type: "submit",
          })}
          ${renderIconButton({
            icon: "bookmark",
            label: "仅记录",
            attrs: 'data-confirm-record-only',
          })}
        </div>
      </form>
    `;
  }

  function renderScheduleTimeline(options = {}) {
    const sourceCards = Array.isArray(options.cards) ? options.cards : allScheduleItemCards();
    const cards = sortScheduleCardsForView(filterScheduleCardsForView(sourceCards));
    const grouped = groupedScheduleCards(cards);
    const days = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
    const title = options.title || "生活卡";
    const empty = options.empty || "还没有生活卡。";
    const viewStyle = state.scheduleViewStyle || "line";

    return `
      <section class="schedule-timeline-panel">
        <div class="dashboard-mini-head schedule-toolbar">
          <div class="schedule-toolbar-title">
            <strong>${escapeHtml(title)}</strong>
            <span>${cards.length}/${sourceCards.length}</span>
          </div>
          <div class="schedule-toolbar-actions">
            <div class="schedule-icon-group" aria-label="筛选生活卡">
              ${renderIconButton({
                icon: "circle",
                label: "未完成",
                attrs: 'data-schedule-filter="open"',
                active: state.scheduleFilter === "open",
              })}
              ${renderIconButton({
                icon: "calendar",
                label: "选中日期",
                attrs: 'data-schedule-filter="date"',
                active: state.scheduleFilter === "date",
              })}
              ${renderIconButton({
                icon: "star",
                label: "重要",
                attrs: 'data-schedule-filter="important"',
                active: state.scheduleFilter === "important",
              })}
              ${renderIconButton({
                icon: "rows",
                label: "全部",
                attrs: 'data-schedule-filter="all"',
                active: state.scheduleFilter === "all",
              })}
            </div>
            <div class="schedule-icon-group" aria-label="切换显示样式">
              ${renderIconButton({
                icon: "rows",
                label: "紧凑行",
                attrs: 'data-schedule-view="line"',
                active: viewStyle === "line",
              })}
              ${renderIconButton({
                icon: "cards",
                label: "卡片",
                attrs: 'data-schedule-view="card"',
                active: viewStyle === "card",
              })}
            </div>
          </div>
        </div>
        <div class="schedule-timeline">
          ${
            days.length
              ? days
                  .map((date) => {
                    const day = (state.data?.timelineDays || state.data?.weekDays || []).find((entry) => (entry.date || entry.id) === date);
                    const label = date === state.data?.today ? "今天" : day?.label || "";
                    const dayCards = grouped.get(date) || [];
                    const compactDay = date !== (state.data?.today || state.selectedDate);
                    const expanded = state.expandedScheduleGroups.has(date);
                    const split = splitCardsForDay(dayCards);
                    const visibleCards = expanded ? dayCards : split.visible;
                    const foldedCards = expanded ? [] : split.folded;
                    return `
                      <section class="schedule-timeline-day${date === state.selectedDate ? " is-selected" : ""}${date === state.data?.today ? " is-today" : ""}">
                        <div class="schedule-timeline-date">
                          <strong>${escapeHtml(label || date.slice(5))}</strong>
                          <span>${escapeHtml(date)}</span>
                        </div>
                        <div class="schedule-timeline-cards">
                          ${visibleCards.map((card) => renderScheduleItemCard(card, { compact: options.compact || compactDay, viewStyle })).join("")}
                          ${
                            foldedCards.length
                              ? `
                                <div class="schedule-fold-row">
                                  <span>已收起 ${foldedCards.length} 张次要生活卡</span>
                                  ${renderIconButton({
                                    icon: "chevronDown",
                                    label: "展开次要生活卡",
                                    attrs: `data-schedule-fold-toggle="${escapeHtml(date)}"`,
                                  })}
                                </div>
                              `
                              : expanded && split.folded.length
                                ? `
                                  <div class="schedule-fold-row">
                                    <span>已展开全部生活卡</span>
                                    ${renderIconButton({
                                      icon: "chevronUp",
                                      label: "收起次要生活卡",
                                      attrs: `data-schedule-fold-toggle="${escapeHtml(date)}"`,
                                    })}
                                  </div>
                                `
                                : ""
                          }
                        </div>
                      </section>
                    `;
                  })
                  .join("")
              : `<div class="pixel-empty">${escapeHtml(empty)}</div>`
          }
        </div>
      </section>
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
          ${renderIconButton({
            icon: "check",
            label: "保存打卡",
            className: "is-primary",
            type: "submit",
          })}
        </form>
      `;
    }

    return `
      <div class="daily-pulse-readonly" style="--person-color: ${escapeHtml(profile.color)}">
        ${score ? `<span>今日打分：${score}/10</span>` : ""}
        ${day.happiestThing ? `<span>最开心：${escapeHtml(day.happiestThing)}</span>` : ""}
        ${day.smallAchievement ? `<span>小成就：${escapeHtml(day.smallAchievement)}</span>` : ""}
      </div>
    `;
  }

  function renderDailySummaryPanel() {
    const summary = state.data?.dailySummary;
    const people = summary?.people || [];
    const photos = summary?.photos || [];
    const memoryHooks = summary?.memoryHooks || [];

    return `
      <section class="couple-panel daily-summary-panel dashboard-wide" id="daily-summary">
        <div class="couple-panel-head">
          <div>
            <p class="couple-kicker">回忆页</p>
            <h2>这一天为什么值得记住</h2>
          </div>
          ${renderIconButton({
            icon: "refresh",
            label: "刷新回忆",
            attrs: 'data-refresh-summary',
          })}
        </div>
        ${renderDailyStoryInputs()}
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
                    <span>${escapeHtml(summary.subtitle || "由记录和生活卡自动整理")}</span>
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
                ${renderSummaryList("完成/兑现", summary.completed || [])}
                ${renderSummaryList("延期/待补", summary.missed || [])}
                ${renderDailyPeople(people)}
              </div>
              ${
                photos.length || summary.moments?.length || memoryHooks.length
                  ? `
                    <div class="daily-memory-strip">
                      ${photos.map((photo) => `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || "photo")}" />`).join("")}
                      ${memoryHooks
                        .slice(0, 3)
                        .map(
                          (hook) => `
                            <span>
                              <em>${escapeHtml(hook.kindLabel || "记住")}</em>
                              ${escapeHtml(hook.title)}
                            </span>
                          `
                        )
                        .join("")}
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
                <span>${escapeHtml(summary.mode === "agent" ? "Agent 回忆" : "本地回忆")}</span>
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
                  <h3>${escapeHtml(state.selectedDate)} 还没有回忆页</h3>
                  <p>凌晨 4 点会自动刷新，也可以现在手动生成。</p>
                  ${renderIconButton({
                    icon: "sparkles",
                    label: "生成今天回忆",
                    className: "is-primary",
                    attrs: 'data-refresh-summary',
                  })}
                </div>
              </div>
            `
        }
      </section>
    `;
  }

  function renderDailyStoryInputs() {
    const current = currentUser();
    if (!current) return "";
    const day = state.data?.diaryDay?.userDays?.[current.id] || {};
    return `
      <section class="daily-story-inputs" style="--person-color: ${escapeHtml(current.color)}">
        <div>
          ${renderAvatar(current, "daily-story-avatar")}
          <strong>今日状态</strong>
        </div>
        ${renderDailyPulseCard(current, day)}
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
            : ""
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
                      <small>${escapeHtml([person.dailyScore ? `${person.dailyScore}/10` : "", person.happiestThing, person.smallAchievement].filter(Boolean).join(" · "))}</small>
                    </span>
                  `
                )
                .join("")
            : ""
        }
      </div>
    `;
  }

  function renderGoalsPage() {
    return `
      <section class="couple-panel memory-pages-panel" id="goals">
        <div class="couple-panel-head compact">
          <div>
            <p class="couple-kicker">长期记忆</p>
            <h2>长期记忆板</h2>
          </div>
        </div>
        ${renderLongTermGoals()}
      </section>
    `;
  }

  function renderLongTermGoals() {
    const pages = state.data?.personalPages || {};
    return `
      <div class="long-memory-board">
        ${profiles().map((profile) => renderMemoryProfile(profile, pages[profile.id] || {})).join("")}
        ${renderFuturePage()}
      </div>
    `;
  }

  function renderMemoryProfile(profile, page = {}) {
    const editable = profile.id === currentUser()?.id;
    const memoryHints = [
      ...(state.data?.memoryHints?.byUser?.[profile.id] || []),
      ...(state.data?.memoryHints?.shared || []),
    ].slice(0, 5);
    const blocks = [
      {
        key: "identityGoal",
        title: "我们想成为什么样",
        value: page.identityGoal || page.longTermGoal || "",
        placeholder: "希望成为什么样的人 / 两个人想长期形成什么状态",
      },
      {
        key: "likes",
        title: "偏好和边界",
        value: page.likes || "",
        placeholder: "喜欢、雷区、沟通偏好、需要被记住的边界",
      },
      {
        key: "notes",
        title: "重要清单",
        value: page.notes || "",
        placeholder: "重要清单、纪念信息、需要长期保留的线索",
      },
      {
        key: "longTermGoal",
        title: "未来想做",
        value: page.longTermGoal || "",
        placeholder: "旅行、项目、生活计划、想一起做的事",
      },
    ];

    if (!editable) {
      return `
        <article class="memory-profile" style="--person-color: ${escapeHtml(profile.color)}">
          <div class="personal-page-head">
            ${renderAvatar(profile, "goal-avatar")}
            <div>
              <strong>${escapeHtml(profile.displayName)}</strong>
              <em>${escapeHtml(page.title || "长期记忆")}</em>
            </div>
          </div>
          <div class="memory-block-grid">
            ${blocks
              .map(
                (block) => `
                  <section class="memory-block">
                    <span>${escapeHtml(block.title)}</span>
                    <p>${escapeHtml(block.value || "还没有记录。")}</p>
                  </section>
                `
              )
              .join("")}
          </div>
          ${renderMemoryHints(memoryHints)}
        </article>
      `;
    }

    return `
      <article class="memory-profile" style="--person-color: ${escapeHtml(profile.color)}">
        <form class="memory-profile-form" data-personal-page-form>
          <div class="personal-page-head">
            ${renderAvatar(profile, "goal-avatar")}
            <div>
              <strong>${escapeHtml(profile.displayName)}</strong>
              <em>正在编辑长期记忆</em>
            </div>
          </div>
          <input name="title" type="text" value="${escapeHtml(page.title || profile.displayName)}" placeholder="标题" />
          <input name="bio" type="hidden" value="${escapeHtml(page.bio || "")}" />
          <div class="memory-block-grid">
            ${blocks
              .map(
                (block) => `
                  <label class="memory-block">
                    <span>${escapeHtml(block.title)}</span>
                    <textarea name="${escapeHtml(block.key)}" rows="3" placeholder="${escapeHtml(block.placeholder)}">${escapeHtml(block.value)}</textarea>
                  </label>
                `
              )
              .join("")}
          </div>
          ${renderMemoryHints(memoryHints)}
          ${renderIconButton({
            icon: "check",
            label: "保存长期记忆",
            className: "is-primary",
            type: "submit",
          })}
        </form>
      </article>
    `;
  }

  function renderMemoryHints(hints = []) {
    if (!hints.length) return "";
    return `
      <section class="memory-block memory-hint-block">
        <span>系统记住</span>
        <div class="memory-hint-list">
          ${hints
            .slice(0, 4)
            .map(
              (hint) => `
                <p>
                  <b>${escapeHtml(hint.kindLabel || "线索")}</b>
                  ${escapeHtml(hint.detail || hint.title || "")}
                </p>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderFuturePage() {
    const items = futureItems().slice(0, 8);
    return `
      <div class="future-page-list future-goals-panel">
        <div class="dashboard-mini-head">
          <strong>未来想做</strong>
          <a href="#dashboard">回首页</a>
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
            : `<div class="pixel-empty">未来想做会从生活卡的“未来”分类里出现。</div>`
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
            <p class="couple-kicker">设置</p>
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
            <label class="capture-photo-button settings-upload-button" title="上传头像">
              ${iconSvg("camera")}
              <span class="sr-only">上传头像</span>
              <input name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            </label>
            ${renderIconButton({
              icon: "check",
              label: "保存设置",
              className: "is-primary",
              type: "submit",
            })}
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

  function bindAppEvents() {
    root.querySelector("#logout-button")?.addEventListener("click", logout);
    root.querySelectorAll("[data-date-offset]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.selectedDate = addDays(state.selectedDate, Number(button.dataset.dateOffset));
        state.expandedScheduleGroups.clear();
        await refreshState();
      });
    });
    root.querySelector("[data-jump-today]")?.addEventListener("click", async () => {
      state.selectedDate = getToday();
      state.expandedScheduleGroups.clear();
      await refreshState();
    });
    root.querySelector("[data-date-picker]")?.addEventListener("change", async (event) => {
      const nextDate = String(event.currentTarget.value || "").trim();
      if (!nextDate || nextDate === state.selectedDate) return;
      state.selectedDate = nextDate;
      state.expandedScheduleGroups.clear();
      await refreshState();
    });
    root.querySelectorAll("[data-date-select]").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextDate = button.dataset.dateSelect || "";
        if (!nextDate || nextDate === state.selectedDate) return;
        state.selectedDate = nextDate;
        state.expandedScheduleGroups.clear();
        await refreshState();
      });
    });
    root.querySelectorAll("[data-month-offset]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.selectedDate = addMonths(state.selectedDate, Number(button.dataset.monthOffset));
        state.expandedScheduleGroups.clear();
        state.monthViewOpen = true;
        await refreshState();
      });
    });
    root.querySelector("[data-month-toggle]")?.addEventListener("click", () => {
      state.monthViewOpen = !state.monthViewOpen;
      renderApp();
    });
    root.querySelectorAll("[data-schedule-fold-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.scheduleFoldToggle || "";
        if (!key) return;
        if (state.expandedScheduleGroups.has(key)) {
          state.expandedScheduleGroups.delete(key);
        } else {
          state.expandedScheduleGroups.add(key);
        }
        renderApp();
      });
    });
    root.querySelectorAll("[data-schedule-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.scheduleFilter = button.dataset.scheduleFilter || "open";
        state.expandedScheduleGroups.clear();
        renderApp();
      });
    });
    root.querySelectorAll("[data-schedule-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.scheduleViewStyle = button.dataset.scheduleView || "line";
        renderApp();
      });
    });
    root.querySelectorAll("[data-refresh-summary]").forEach((button) => {
      button.addEventListener("click", refreshDailySummary);
    });
    root.querySelectorAll("[data-capture-confirm-form]").forEach((form) => {
      form.addEventListener("submit", submitCaptureConfirmation);
    });
    root.querySelectorAll("[data-confirm-record-only]").forEach((button) => {
      button.addEventListener("click", dismissCaptureConfirmation);
    });
    root.querySelectorAll("[data-daily-pulse-form]").forEach((form) => {
      form.addEventListener("submit", saveDailyPulse);
    });
    root.querySelectorAll("[data-card-toggle]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleScheduleCard(button.dataset.cardToggle);
      });
    });
    root.querySelectorAll("[data-card-edit]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.editCardId = button.dataset.cardEdit || "";
        renderApp();
      });
    });
    root.querySelectorAll("[data-card-delete]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteScheduleCard(button.dataset.cardDelete);
      });
    });
    root.querySelectorAll("[data-card-edit-form]").forEach((form) => {
      form.addEventListener("submit", saveScheduleCardEdit);
    });
    root.querySelectorAll("[data-card-cancel-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editCardId = "";
        renderApp();
      });
    });
    root.querySelectorAll("[data-personal-page-form]").forEach((form) => {
      form.addEventListener("submit", savePersonalPage);
    });
    root.querySelector("#profile-settings-form")?.addEventListener("submit", saveProfileSettings);
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
