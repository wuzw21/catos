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
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
