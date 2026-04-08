const systemData = window.personalTrackerData;

function buildDocCard(doc) {
  return `
    <a class="card card-link system-card" href="./detail.html?type=doc&id=${doc.id}">
      <div class="card-topline">
        <h3>${doc.title}</h3>
        <span class="tag">${doc.category}</span>
      </div>
      ${doc.summary ? `<p>${doc.summary}</p>` : ""}
      <div class="card-meta">
        <span class="tag">${doc.path}</span>
      </div>
    </a>
  `;
}

function getGroupConfig() {
  return [
    {
      id: "core",
      title: "核心索引",
      description: "只放主导航里没有、但你会反复回看的长期页面。",
      docIds: ["personal-info", "wardrobe", "memorial-days", "want-to-do"],
    },
    {
      id: "workflow",
      title: "低频规则",
      description: "不常改，但需要时可以回来查的规则页。",
      docIds: ["input-rules", "routing-map", "change-model"],
    },
    {
      id: "reference",
      title: "参考资料",
      description: "真正作为参考使用的少量资料。",
      docIds: ["fat-loss-calorie-control", "external-guides"],
    },
  ];
}

function buildGroupSection(group, docs) {
  if (!docs.length) {
    return "";
  }

  return `
    <section class="system-group">
      <div class="section-heading system-group-heading">
        <p class="eyebrow">${group.id}</p>
        <h2>${group.title}</h2>
        <p class="home-note">${group.description}</p>
      </div>
      <div class="doc-grid system-group-grid">
        ${docs.map(buildDocCard).join("")}
      </div>
    </section>
  `;
}

function renderSystemDirectory() {
  const groupsNode = document.querySelector("#system-groups");
  const count = document.querySelector("#system-doc-count");
  const hiddenDocIds = new Set([
    "cat-100-things",
    "cat-food-fun-index",
    "cat-little-things",
    "purchase-asset-hub",
    "purchase-list",
    "asset-register",
    "quick-capture",
    "daily-schedule",
    "interpersonal",
    "deadlines",
    "run-goal",
    "todo",
    "finish",
    "research",
    "archive",
    "eat",
    "train",
    "spend",
    "mood",
    "asset",
    "sleep",
    "wake",
  ]);
  const docs = [...(systemData.docs || [])].filter((doc) => !hiddenDocIds.has(doc.id));
  const groups = getGroupConfig();
  const usedIds = new Set(groups.flatMap((group) => group.docIds));

  count.textContent = `${docs.length} Docs`;

  const groupedHtml = groups
    .map((group) => {
      const groupDocs = group.docIds
        .map((id) => docs.find((doc) => doc.id === id))
        .filter(Boolean);
      return buildGroupSection(group, groupDocs);
    })
    .join("");

  const restDocs = docs
    .filter((doc) => !usedIds.has(doc.id))
    .sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.title.localeCompare(b.title, "zh-CN"));

  const restHtml = buildGroupSection(
    {
      id: "others",
      title: "低频补充",
      description: "查询、模板、规则和其他不需要放在最前面的内容。",
    },
    restDocs
  );

  groupsNode.innerHTML = `${groupedHtml}${restHtml}`;
}

renderSystemDirectory();
