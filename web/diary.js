const diaryData = window.personalTrackerData;
const filterRow = document.querySelector("#filter-row");
const diaryLogList = document.querySelector("#diary-log-list");

const filters = [
  { key: "all", label: "全部" },
  { key: "daily", label: "日记" },
  { key: "weekly", label: "周记" },
  { key: "monthly", label: "月记" },
  { key: "yearly", label: "年记" },
];

let activeFilter = "all";

function renderFilters() {
  filters.forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${filter.key === activeFilter ? " is-active" : ""}`;
    button.textContent = filter.label;
    button.addEventListener("click", () => {
      activeFilter = filter.key;
      filterRow.innerHTML = "";
      renderFilters();
      renderLogs();
    });
    filterRow.appendChild(button);
  });
}

function renderLogs() {
  diaryLogList.innerHTML = "";
  const entries = diaryData.logs.filter((entry) => activeFilter === "all" || entry.category === activeFilter);

  entries.forEach((entry) => {
    const item = document.createElement("a");
    item.className = "log-item log-link";
    item.href = `./detail.html?type=log&id=${entry.id}`;
    const tagHtml = (entry.tags || [])
      .map((tag) => `<span class="tag">${tag}</span>`)
      .join("");
    item.innerHTML = `
      <div class="card-topline">
        <div>
          <div class="log-date">${entry.period}</div>
          <h3 class="log-title">${entry.title}</h3>
        </div>
        <span class="inline-link">打开</span>
      </div>
      <div class="tag-bar log-tag-bar">${tagHtml}</div>
      <p class="log-text">${entry.summary || "打开查看这篇日志。"} </p>
    `;
    diaryLogList.appendChild(item);
  });
}

renderFilters();
renderLogs();
