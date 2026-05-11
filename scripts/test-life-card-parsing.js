const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "peos-life-card-test-"));
process.env.PEOS_CONTENT_ROOT = tempRoot;

const store = require("./couple-store.js");

function titles(steps) {
  return (steps || []).map((step) => step.title);
}

try {
  const homework = store.analyzeCapture("you", {
    date: "2026-05-10",
    text: "今天下午写完作业，分三步：列提纲，写正文，检查",
    analysisMode: "template",
  });
  assert.equal(homework.decision, "schedule");
  assert.equal(homework.title, "写完作业");
  assert.equal(homework.date, "2026-05-10");
  assert.equal(homework.segment, "afternoon");
  assert.deepEqual(titles(homework.steps), ["列提纲", "写正文", "检查"]);

  const linked = store.analyzeCapture("you", {
    date: "2026-05-10",
    text: "下周一下午提醒我把作业改完，然后买护手霜",
    analysisMode: "template",
  });
  assert.equal(linked.decision, "schedule");
  assert.equal(linked.date, "2026-05-11");
  assert.equal(linked.segment, "afternoon");
  assert.equal(linked.relatedItems.length, 1);
  assert.equal(linked.relatedItems[0].itemType, "purchase");
  assert.equal(linked.relatedItems[0].title, "买护手霜");
  assert(!titles(linked.steps).includes("买护手霜"));

  const refactor = store.analyzeCapture("you", {
    date: "2026-05-10",
    text: "今天改一个要动全身，分三步：定位影响，改核心，回归检查",
    analysisMode: "template",
  });
  assert.equal(refactor.decision, "schedule");
  assert.deepEqual(titles(refactor.steps), ["定位影响", "改核心", "回归检查"]);

  const anniversary = store.analyzeCapture("you", {
    date: "2026-05-11",
    text: "纪念日：2026.1.9是在一起的日子",
    analysisMode: "template",
  });
  assert.equal(anniversary.decision, "memory");
  assert.equal(anniversary.memoryKind, "anniversary");
  assert.equal(anniversary.date, "2026-01-09");
  assert.equal(anniversary.title, "在一起的日子");

  const imageOnlyCapture = store.addCapture("you", {
    date: "2026-05-10",
    text: "",
    mode: "analysis",
    visibility: "shared",
    assets: [
      {
        name: "todo-list.png",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      },
    ],
  }).result;
  assert.equal(imageOnlyCapture.text, "图片随手记");
  assert.equal(imageOnlyCapture.rawFormat, "markdown+photo");
  assert.equal(imageOnlyCapture.assets.length, 1);

  const capture = store.addCapture("you", {
    date: "2026-05-10",
    text: "她不喜欢太吵的店",
    mode: "analysis",
    visibility: "shared",
  }).result;
  const acceptedMemory = store.acceptCaptureRoute("you", {
    captureId: capture.id,
    sourceCaptureId: capture.id,
    decision: "memory",
    memoryKind: "preference",
    title: "不喜欢太吵的店",
    detail: "约会和吃饭时优先找安静一点的地方。",
    date: "2026-05-10",
  }).result;
  assert.equal(acceptedMemory.decision, "memory");
  assert(acceptedMemory.capture.acceptedRoutes[0].memoryItemId);

  const anniversaryCapture = store.addCapture("you", {
    date: "2026-05-11",
    text: "纪念日：2026.1.9是在一起的日子",
    mode: "analysis",
    visibility: "shared",
  }).result;
  const anniversaryConfirmation = store.analyzeCapture("you", {
    captureId: anniversaryCapture.id,
    date: "2026-05-11",
    analysisMode: "template",
  });
  const acceptedAnniversary = store.acceptCaptureRoute("you", anniversaryConfirmation).result;
  assert.equal(acceptedAnniversary.decision, "memory");
  assert.equal(acceptedAnniversary.capture.acceptedRoutes[0].memoryKind, "anniversary");
  const anniversaryState = store.getState("you", { date: "2027-01-01" });
  assert(anniversaryState.memoryItems.some((item) => item.kind === "anniversary" && item.title === "在一起的日子"));
  assert(anniversaryState.scheduleItemCards.some((card) => card.insightKind === "anniversary"));

  const linkedCapture = store.addCapture("you", {
    date: "2026-05-10",
    text: "下周一下午提醒我把作业改完，然后买护手霜",
    mode: "analysis",
    visibility: "shared",
  }).result;
  const linkedConfirmation = store.analyzeCapture("you", {
    captureId: linkedCapture.id,
    date: "2026-05-10",
    analysisMode: "template",
  });
  const created = store.acceptCaptureRoute("you", linkedConfirmation).result;
  assert.equal(created.cards.length, 2);

  const state = store.getState("you", { date: "2026-05-11" });
  const purchaseCard = state.scheduleItemCards.find((card) => card.title === "买护手霜");
  assert(purchaseCard);
  assert(purchaseCard.tags.includes("购买"));
  assert(purchaseCard.memoryKinds.includes("purchase"));
  assert(purchaseCard.relations.some((relation) => ["group", "child", "parent"].includes(relation.relationType)));

  const remembered = store.rememberLifeCard("you", {
    sourceType: purchaseCard.sourceType,
    id: purchaseCard.sourceId,
    date: purchaseCard.date,
  }).result;
  assert.equal(remembered.memory.kind, "purchase");
  assert(remembered.card.memoryLinks.some((item) => item.id === remembered.memory.id));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
