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
  assert.equal(store.verifyLogin("you", "damao").id, "you");
  assert.equal(store.verifyLogin("partner", "xiaomao").id, "partner");
  assert.equal(store.businessDate(new Date("2026-05-21T16:30:00Z")), "2026-05-21");
  assert.equal(store.businessDate(new Date("2026-05-21T19:30:00Z")), "2026-05-22");
  assert.equal(store.businessDayContext(new Date("2026-05-21T16:30:00Z")).currentBusinessDate, "2026-05-21");
  assert.equal(store.businessDayContext(new Date("2026-05-21T16:30:00Z")).isCurrentDeepNightForBusinessDay, true);

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

  const weekend = store.analyzeCapture("you", {
    date: "2026-05-13",
    text: "周末出去玩",
    analysisMode: "template",
  });
  assert.equal(weekend.decision, "schedule");
  assert.equal(weekend.date, "2026-05-16");
  assert.equal(weekend.dueAt, "2026-05-17T23:59");
  assert.equal(weekend.title, "出去玩");

  const weekly = store.analyzeCapture("you", {
    date: "2026-05-13",
    text: "每周一20:00做周复盘",
    analysisMode: "template",
  });
  assert.equal(weekly.decision, "schedule");
  assert.equal(weekly.date, "2026-05-18");
  assert.equal(weekly.plannedAt, "2026-05-18T20:00");
  assert.equal(weekly.repeatRule, "weekly@mon@20:00");
  assert.equal(weekly.title, "做周复盘");

  const deepNightPlan = store.analyzeCapture("you", {
    date: "2026-05-21",
    text: "今天凌晨1点写日记",
    analysisMode: "template",
  });
  assert.equal(deepNightPlan.decision, "schedule");
  assert.equal(deepNightPlan.date, "2026-05-21");
  assert.equal(deepNightPlan.plannedAt, "2026-05-22T01:00");

  const eveningPlan = store.analyzeCapture("you", {
    date: "2026-05-21",
    text: "今天晚上8点写日记",
    analysisMode: "template",
  });
  assert.equal(eveningPlan.plannedAt, "2026-05-21T20:00");

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
  assert(anniversary.reason.includes("倒计时"));

  const shortAnniversary = store.analyzeCapture("you", {
    date: "2026-05-11",
    text: "纪念日：1月9日在一起",
    analysisMode: "template",
  });
  assert.equal(shortAnniversary.decision, "memory");
  assert.equal(shortAnniversary.memoryKind, "anniversary");
  assert.equal(shortAnniversary.date, "2026-01-09");
  assert.equal(shortAnniversary.ownerId, "shared");
  assert.equal(shortAnniversary.repeatRule, "yearly");
  assert.equal(shortAnniversary.title, "在一起");

  const implicitAnniversary = store.analyzeCapture("you", {
    date: "2026-05-11",
    text: "1月9日是在一起的日子",
    analysisMode: "template",
  });
  assert.equal(implicitAnniversary.decision, "memory");
  assert.equal(implicitAnniversary.memoryKind, "anniversary");
  assert.equal(implicitAnniversary.date, "2026-01-09");
  assert.equal(implicitAnniversary.title, "在一起的日子");

  const anniversaryPrep = store.analyzeCapture("you", {
    date: "2026-01-01",
    text: "1月9日准备在一起纪念日：买礼物，订餐厅，整理照片，写信",
    analysisMode: "template",
  });
  assert.equal(anniversaryPrep.decision, "schedule");
  assert.equal(anniversaryPrep.date, "2026-01-09");
  assert(anniversaryPrep.memoryKinds.includes("anniversary"));
  assert(anniversaryPrep.relatedItems.some((item) => item.title === "订餐厅"));
  assert(anniversaryPrep.relatedItems.some((item) => item.title === "整理照片"));
  assert(anniversaryPrep.relatedItems.some((item) => item.title === "写信"));

  const noise = store.analyzeCapture("you", {
    date: "2026-05-12",
    text: "1231231",
    analysisMode: "template",
  });
  assert.equal(noise.decision, "capture");
  assert.equal(noise.isDefaultDraft, true);

  const secretDraft = store.analyzeCapture("you", {
    date: "2026-05-12",
    text: "小秘密：明天买礼物，不准被对方看到",
    analysisMode: "template",
  });
  assert.equal(secretDraft.decision, "schedule");
  assert.equal(secretDraft.visibility, "private");
  assert.equal(secretDraft.ownerId, "you");
  assert.deepEqual(secretDraft.participants, ["you"]);
  assert.equal(secretDraft.title, "买礼物");
  assert(!titles(secretDraft.steps).includes("不准被对方看到"));

  const secretCapture = store.addCapture("you", {
    date: "2026-05-12",
    text: "小秘密：明天买礼物，不准被对方看到",
    mode: "analysis",
  }).result;
  assert.equal(secretCapture.visibility, "private");
  const secretCaptureOwnerState = store.getState("you", { date: "2026-05-12" });
  assert(secretCaptureOwnerState.captures.some((capture) => capture.id === secretCapture.id && capture.visibility === "private"));
  const secretCapturePartnerState = store.getState("partner", { date: "2026-05-12" });
  assert(!secretCapturePartnerState.captures.some((capture) => capture.id === secretCapture.id));

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
  const archivedCapture = store.archiveCaptureItem("you", { id: imageOnlyCapture.id }).result;
  assert(archivedCapture.archivedAt);
  const restoredCapture = store.archiveCaptureItem("you", {
    date: imageOnlyCapture.date,
    text: imageOnlyCapture.text,
    createdAt: imageOnlyCapture.createdAt,
    createdBy: imageOnlyCapture.createdBy,
  }).result;
  assert.equal(restoredCapture.archivedAt, "");

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

  const weeklyCapture = store.addCapture("you", {
    date: "2026-05-13",
    text: "每周一20:00做周复盘",
    mode: "analysis",
    visibility: "shared",
  }).result;
  const weeklyConfirmation = store.analyzeCapture("you", {
    captureId: weeklyCapture.id,
    date: "2026-05-13",
    analysisMode: "template",
  });
  const weeklyCreated = store.acceptCaptureRoute("you", weeklyConfirmation).result;
  assert.equal(weeklyCreated.cards.length, 1);
  const weeklySource = weeklyCreated.cards[0];
  const weeklyFirstState = store.getState("you", { date: "2026-05-18" });
  const weeklyFirstCard = weeklyFirstState.scheduleItemCards.find((card) => card.sourceId === weeklySource.sourceId && card.date === "2026-05-18");
  assert(weeklyFirstCard);
  assert.equal(weeklyFirstCard.recurrence.frequency, "weekly");
  assert.equal(weeklyFirstCard.plannedAt, "2026-05-18T20:00");
  const weeklySecondState = store.getState("you", { date: "2026-05-25" });
  const weeklySecondCard = weeklySecondState.scheduleItemCards.find((card) => card.sourceId === weeklySource.sourceId && card.date === "2026-05-25");
  assert(weeklySecondCard);
  const toggleWeekly = weeklyFirstCard.sourceType === "schedule"
    ? (payload) => store.toggleScheduleItem("you", payload)
    : weeklyFirstCard.sourceType === "deadline"
      ? (payload) => store.toggleDeadlineItem("you", payload)
      : (payload) => store.toggleTodoItem("you", payload);
  toggleWeekly({ id: weeklyFirstCard.sourceId, targetUserId: "you", date: "2026-05-18", status: "done" });
  const weeklyDoneState = store.getState("you", { date: "2026-05-18" });
  const weeklyDoneCard = weeklyDoneState.scheduleItemCards.find((card) => card.sourceId === weeklySource.sourceId && card.date === "2026-05-18");
  assert.equal(weeklyDoneCard.statusByUser.you, "done");
  const weeklyFutureState = store.getState("you", { date: "2026-05-25" });
  const weeklyFutureCard = weeklyFutureState.scheduleItemCards.find((card) => card.sourceId === weeklySource.sourceId && card.date === "2026-05-25");
  assert.equal(weeklyFutureCard.statusByUser.you, "todo");

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

  const resetTodo = store.upsertTodoItem("you", {
    date: "2026-05-12",
    title: "恢复测试",
    ownerId: "shared",
    participants: ["you", "partner"],
    steps: [
      { id: "reset-step-1", title: "大猫确认", ownerId: "you" },
      { id: "reset-step-2", title: "小猫确认", ownerId: "partner" },
    ],
  }).result;
  store.toggleLifeCardStep("you", {
    sourceType: "todo",
    id: resetTodo.id,
    stepId: "reset-step-1",
    targetUserId: "you",
  });
  store.toggleLifeCardStep("partner", {
    sourceType: "todo",
    id: resetTodo.id,
    stepId: "reset-step-2",
    targetUserId: "partner",
  });
  const resetStateDone = store.getState("you", { date: "2026-05-12" });
  const resetDoneCard = resetStateDone.scheduleItemCards.find((card) => card.sourceId === resetTodo.id);
  assert(resetDoneCard.archivedAt);
  assert(resetDoneCard.steps.every((step) => step.status === "done"));

  const restored = store.archiveTodoItem("you", { id: resetTodo.id }).result;
  assert.equal(restored.archivedAt, "");
  assert(restored.steps.every((step) => step.status === "todo"));
  assert.deepEqual(restored.statusByUser, { you: "todo", partner: "todo" });
  assert.deepEqual(restored.statusUpdatedBy, {});

  const secretTodo = store.upsertTodoItem("you", {
    date: "2026-05-12",
    title: "小秘密测试",
    ownerId: "shared",
    participants: ["you", "partner"],
    visibility: "private",
  }).result;
  assert.equal(secretTodo.visibility, "private");
  assert.equal(secretTodo.ownerId, "you");
  assert.deepEqual(secretTodo.participants, ["you"]);
  const secretOwnerState = store.getState("you", { date: "2026-05-12" });
  assert(secretOwnerState.scheduleItemCards.some((card) => card.sourceId === secretTodo.id && card.visibility === "private"));
  const secretPartnerState = store.getState("partner", { date: "2026-05-12" });
  assert(!secretPartnerState.scheduleItemCards.some((card) => card.sourceId === secretTodo.id));
  assert.throws(() => store.toggleTodoItem("partner", { id: secretTodo.id, targetUserId: "partner" }), /not found/);

  const timelineSecretLink = store.upsertDayTimelineBlock("you", {
    date: "2026-05-12",
    title: "准备礼物",
    startAt: "2026-05-12T20:00",
    endAt: "2026-05-12T21:00",
    participantIds: ["you", "partner"],
    linkedLifeCardIds: [`todo-${secretTodo.id}`],
  }).result;
  assert.deepEqual(timelineSecretLink.linkedLifeCardIds, [`todo-${secretTodo.id}`]);
  const secretTimelineOwnerState = store.getState("you", { date: "2026-05-12" });
  const ownerTimelineBlock = secretTimelineOwnerState.dayTimelineBlocks.find((block) => block.id === timelineSecretLink.id);
  assert(ownerTimelineBlock.linkedLifeCardIds.includes(`todo-${secretTodo.id}`));
  const secretTimelinePartnerState = store.getState("partner", { date: "2026-05-12" });
  const partnerTimelineBlock = secretTimelinePartnerState.dayTimelineBlocks.find((block) => block.id === timelineSecretLink.id);
  assert(partnerTimelineBlock);
  assert(!partnerTimelineBlock.linkedLifeCardIds.includes(`todo-${secretTodo.id}`));
  store.upsertDayTimelineBlock("partner", {
    id: timelineSecretLink.id,
    date: "2026-05-12",
    title: "一起出门",
    startAt: "2026-05-12T20:30",
    endAt: "2026-05-12T21:30",
    participantIds: ["you", "partner"],
    linkedLifeCardIds: [],
  });
  const timelineSecretLinkAfterPartnerEdit = store.getState("you", { date: "2026-05-12" })
    .dayTimelineBlocks.find((block) => block.id === timelineSecretLink.id);
  assert(timelineSecretLinkAfterPartnerEdit.linkedLifeCardIds.includes(`todo-${secretTodo.id}`));

  const privateTimeline = store.upsertDayTimelineBlock("you", {
    date: "2026-05-12",
    title: "小秘密时间",
    startAt: "2026-05-12T02:30",
    endAt: "2026-05-12T03:30",
    visibility: "private",
  }).result;
  assert.equal(privateTimeline.date, "2026-05-11");
  assert.equal(privateTimeline.startAt, "2026-05-12T02:30");
  assert.equal(privateTimeline.endAt, "2026-05-12T03:00");
  assert(!store.getState("partner", { date: "2026-05-11" }).dayTimelineBlocks.some((block) => block.id === privateTimeline.id));
  const boundaryTimeline = store.upsertDayTimelineBlock("you", {
    title: "三点边界",
    startAt: "2026-05-12T03:00",
    endAt: "2026-05-12T03:30",
  }).result;
  assert.equal(boundaryTimeline.date, "2026-05-12");

  const steppedTodo = store.upsertTodoItem("you", {
    date: "2026-05-12",
    title: "分步骤测试",
    ownerId: "shared",
    participants: ["you", "partner"],
    steps: [
      { id: "step-you-1", title: "大猫第一步", ownerId: "you" },
      { id: "step-you-2", title: "大猫第二步", ownerId: "you" },
      { id: "step-partner-1", title: "小猫一步", ownerId: "partner" },
    ],
  }).result;
  store.toggleTodoItem("you", { id: steppedTodo.id, targetUserId: "you", status: "done" });
  const oneStepDone = store.toggleTodoItem("you", { id: steppedTodo.id, targetUserId: "you", status: "done" }).result;
  assert.equal(oneStepDone.statusByUser.you, "done");
  assert.equal(oneStepDone.statusByUser.partner, "todo");
  assert.equal(oneStepDone.steps.filter((step) => step.ownerId === "you" && step.status === "done").length, 2);

  const resetOwnSteps = store.toggleTodoItem("you", { id: steppedTodo.id, targetUserId: "you", status: "todo" }).result;
  assert.equal(resetOwnSteps.statusByUser.you, "todo");
  assert.equal(resetOwnSteps.statusByUser.partner, "todo");
  assert(resetOwnSteps.steps.filter((step) => step.ownerId === "you").every((step) => step.status === "todo"));
  assert(resetOwnSteps.steps.filter((step) => step.ownerId === "partner").every((step) => step.status === "todo"));

  const clearedStepsTodo = store.upsertTodoItem("you", {
    id: steppedTodo.id,
    date: "2026-05-12",
    title: "分步骤测试",
    ownerId: "shared",
    participants: ["you", "partner"],
    steps: [],
    stepsMode: "replace",
  }).result;
  assert.deepEqual(clearedStepsTodo.steps, []);

  const participantTodo = store.upsertTodoItem("you", {
    date: "2026-05-12",
    title: "参与人测试",
    ownerId: "you",
    participants: ["you", "partner"],
  }).result;
  assert.equal(participantTodo.ownerId, "you");
  assert.deepEqual(participantTodo.participants, ["you", "partner"]);
  const reassignedParticipantTodo = store.upsertTodoItem("you", {
    id: participantTodo.id,
    date: "2026-05-12",
    title: "参与人测试",
    ownerId: "partner",
    participants: ["you"],
  }).result;
  assert.equal(reassignedParticipantTodo.ownerId, "partner");
  assert.deepEqual(reassignedParticipantTodo.participants.sort(), ["partner", "you"]);

  const participantSchedule = store.upsertScheduleItem("you", {
    date: "2026-05-12",
    title: "一起散步",
    itemType: "date",
    ownerId: "you",
    participants: ["partner"],
  }).result;
  assert.equal(participantSchedule.ownerId, "you");
  assert.deepEqual(participantSchedule.participants.sort(), ["partner", "you"]);

  const checkinState = store.getState("you", { date: "2026-05-12" });
  const checkinCard = checkinState.scheduleItemCards.find((card) => card.tags.includes("daily-checkin-card"));
  assert(checkinCard);
  assert(checkinCard.steps.length >= 4);
  const sleepStep = checkinCard.steps.find((step) => step.title === "入睡时间");
  const wakeStep = checkinCard.steps.find((step) => step.title === "起床时间");
  const planStep = checkinCard.steps.find((step) => step.title === "确定明天安排");
  const exerciseStep = checkinCard.steps.find((step) => step.title === "进行体育锻炼");
  const bedtimeStep = checkinCard.steps.find((step) => step.title === "睡前打卡");
  assert(sleepStep);
  assert(wakeStep);
  assert(planStep);
  assert(exerciseStep);
  assert(bedtimeStep);
  assert.equal(sleepStep.inputType, "time");
  assert.equal(wakeStep.inputType, "time");
  assert.equal(bedtimeStep.inputType, "bedtime");
  assert(!checkinCard.steps.some((step) => step.title === "最开心的事"));
  assert(!checkinCard.steps.some((step) => step.title === "最有贡献的事"));
  assert(!checkinCard.steps.some((step) => step.title === "最珍贵的照片"));
  assert.deepEqual(wakeStep.statusByUser, { you: "todo", partner: "todo" });

  store.toggleLifeCardStep("you", {
    sourceType: "todo",
    id: checkinCard.sourceId,
    stepId: sleepStep.id,
    targetUserId: "you",
    value: "23:40",
  });
  store.toggleLifeCardStep("you", {
    sourceType: "todo",
    id: checkinCard.sourceId,
    stepId: wakeStep.id,
    targetUserId: "you",
    value: "7:30",
  });
  const wakeCheckinStepState = store.getState("you", { date: "2026-05-12" });
  const wakeCheckinStepCard = wakeCheckinStepState.scheduleItemCards.find((card) => card.sourceId === checkinCard.sourceId);
  const recordedWakeStep = wakeCheckinStepCard.steps.find((step) => step.title === "起床时间");
  assert.equal(recordedWakeStep.valueByUser.you, "07:30");
  assert.equal(recordedWakeStep.statusByUser.you, "done");
  assert.equal(recordedWakeStep.statusByUser.partner, "todo");
  assert.equal(wakeCheckinStepCard.statusByUser.you, "todo");
  const sleepBlocks = wakeCheckinStepState.dayTimelineBlocks.filter((block) => block.type === "sleep" && block.participantIds.includes("you"));
  assert.equal(sleepBlocks.length, 1);
  assert.equal(sleepBlocks[0].startAt, "2026-05-12T23:40");
  assert.equal(sleepBlocks[0].endAt, "2026-05-13T07:30");
  const manualSleep = store.upsertDayTimelineBlock("you", {
    date: "2026-05-12",
    type: "sleep",
    title: "补记睡觉",
    startAt: "2026-05-12T23:20",
    endAt: "2026-05-13T07:10",
    participantIds: ["you"],
  }).result;
  const manualSleepState = store.getState("you", { date: "2026-05-12" });
  const manualSleepBlocks = manualSleepState.dayTimelineBlocks.filter((block) => block.type === "sleep" && block.participantIds.includes("you"));
  assert.equal(manualSleepBlocks.length, 1);
  assert.equal(manualSleepBlocks[0].id, manualSleep.id);

  store.toggleLifeCardStep("you", {
    sourceType: "todo",
    id: checkinCard.sourceId,
    stepId: planStep.id,
    targetUserId: "you",
  });
  const oneCheckinStepState = store.getState("you", { date: "2026-05-12" });
  const oneCheckinStepCard = oneCheckinStepState.scheduleItemCards.find((card) => card.sourceId === checkinCard.sourceId);
  const oneCheckinPlanStep = oneCheckinStepCard.steps.find((step) => step.title === "确定明天安排");
  const oneCheckinExerciseStep = oneCheckinStepCard.steps.find((step) => step.title === "进行体育锻炼");
  assert.equal(oneCheckinPlanStep.statusByUser.you, "done");
  assert.equal(oneCheckinPlanStep.statusByUser.partner, "todo");
  assert.equal(oneCheckinExerciseStep.statusByUser.you, "todo");
  assert.equal(oneCheckinStepCard.statusByUser.you, "todo");

  store.toggleLifeCardStep("you", {
    sourceType: "todo",
    id: checkinCard.sourceId,
    stepId: exerciseStep.id,
    targetUserId: "you",
  });
  const allOwnCheckinState = store.getState("you", { date: "2026-05-12" });
  const allOwnCheckinCard = allOwnCheckinState.scheduleItemCards.find((card) => card.sourceId === checkinCard.sourceId);
  assert.equal(allOwnCheckinCard.statusByUser.you, "todo");
  assert.equal(allOwnCheckinCard.statusByUser.partner, "todo");

  store.updateDiaryDay("you", {
    date: "2026-05-12",
    happiestThing: "晚上一起散步",
    smallAchievement: "把页面整理清楚",
  });
  store.addDiaryAsset("you", {
    date: "2026-05-12",
    name: "precious.png",
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  });
  const diaryCheckinState = store.getState("you", { date: "2026-05-12" });
  const diaryCheckinCard = diaryCheckinState.scheduleItemCards.find((card) => card.sourceId === checkinCard.sourceId);
  const diaryBedtimeStep = diaryCheckinCard.steps.find((step) => step.title === "睡前打卡");
  assert.equal(diaryBedtimeStep.valueByUser.you, "开心 · 贡献 · 照片");
  assert.equal(diaryBedtimeStep.statusByUser.you, "done");
  assert.equal(diaryCheckinCard.statusByUser.you, "done");

  const dailySummary = store.refreshDailySummary("you", {
    date: "2026-05-12",
    useAgent: false,
  }).result;
  assert(dailySummary.analysis.dailyReview.encouragement.text.includes("把页面整理清楚"));
  assert(dailySummary.analysis.dailyReview.record.text.includes("晚上一起散步"));
  assert("effort" in dailySummary.analysis.dailyReview);
  assert(dailySummary.analysis.diary.text.includes("值得"));

  store.toggleLifeCardStep("you", {
    sourceType: "todo",
    id: checkinCard.sourceId,
    stepId: wakeStep.id,
    targetUserId: "you",
    value: "",
  });
  const clearedWakeCheckinState = store.getState("you", { date: "2026-05-12" });
  const clearedWakeCheckinCard = clearedWakeCheckinState.scheduleItemCards.find((card) => card.sourceId === checkinCard.sourceId);
  const clearedWakeStep = clearedWakeCheckinCard.steps.find((step) => step.title === "起床时间");
  assert.equal(clearedWakeStep.valueByUser.you, undefined);
  assert.equal(clearedWakeStep.statusByUser.you, "todo");
  assert.equal(clearedWakeCheckinCard.statusByUser.you, "todo");
  assert.equal(clearedWakeCheckinState.dayTimelineBlocks.filter((block) => block.type === "sleep" && block.derived && block.participantIds.includes("you")).length, 0);
  assert(clearedWakeCheckinState.dayTimelineBlocks.some((block) => block.id === manualSleep.id));

  const appendedCheckin = store.createLifeCardsFromConfirmation("you", {
    decision: "schedule",
    date: "2026-05-13",
    title: "喝水打卡",
    itemType: "checkin",
    ownerId: "shared",
  }).result;
  assert.equal(appendedCheckin.length, 1);
  assert.equal(appendedCheckin[0].sourceType, "todo");
  assert(appendedCheckin[0].tags.includes("daily-checkin-card"));
  assert(appendedCheckin[0].steps.some((step) => step.title === "喝水"));

  const appendedHabit = store.createLifeCardsFromConfirmation("you", {
    decision: "schedule",
    date: "2026-05-13",
    title: "每天早睡",
    itemType: "habit",
    ownerId: "you",
  }).result;
  assert.equal(appendedHabit.length, 1);
  assert.equal(appendedHabit[0].sourceId, appendedCheckin[0].sourceId);
  assert(appendedHabit[0].steps.some((step) => step.title === "早睡"));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
