#!/usr/bin/env node

const { businessDate, businessDayContext, getState } = require("./couple-store.js");

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function normalizeUserId(value) {
  const userId = String(value || "you").trim();
  if (userId === "you" || userId === "partner") return userId;
  throw new Error("--user must be you or partner");
}

function normalizeDateArg(value) {
  const raw = String(value || "today").trim();
  if (!raw || raw === "today") return businessDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  throw new Error("--date must be today or YYYY-MM-DD");
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function compactText(value, max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function compactStatus(statusByUser) {
  if (!statusByUser || typeof statusByUser !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(statusByUser)
      .filter(([id]) => id === "you" || id === "partner")
      .map(([id, status]) => [id, status])
  );
}

function compactSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, 12).map((step) => ({
    id: step.id,
    title: compactText(step.title, 80),
    statusByUser: compactStatus(step.statusByUser),
    valueByUser: step.valueByUser,
  }));
}

function compactItem(item) {
  if (!item || typeof item !== "object") return null;
  return {
    id: item.id,
    title: compactText(item.title || item.text || item.name, 140),
    detail: compactText(item.detail || item.note || item.description, 220),
    date: item.date,
    segment: item.segment,
    timeLabel: item.timeLabel,
    plannedAt: item.plannedAt,
    dueAt: item.dueAt,
    itemType: item.itemType,
    ownerId: item.ownerId,
    participants: item.participants,
    visibility: item.visibility,
    statusByUser: compactStatus(item.statusByUser),
    steps: compactSteps(item.steps),
    tags: item.tags,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function compactCapture(capture) {
  if (!capture || typeof capture !== "object") return null;
  return {
    id: capture.id,
    text: compactText(capture.text, 260),
    date: capture.date,
    visibility: capture.visibility,
    sourceType: capture.sourceType,
    rawKind: capture.rawKind,
    createdBy: capture.createdBy,
    createdAt: capture.createdAt,
    assetCount: Array.isArray(capture.assets) ? capture.assets.length : 0,
  };
}

function compactTimeline(block) {
  if (!block || typeof block !== "object") return null;
  return {
    id: block.id,
    type: block.type,
    title: compactText(block.title, 120),
    detail: compactText(block.detail, 220),
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    createdBy: block.createdBy,
  };
}

function itemTouchesDate(item, date) {
  if (!item || typeof item !== "object") return false;
  if (item.date === date) return true;
  if (String(item.plannedAt || "").startsWith(date)) return true;
  if (String(item.dueAt || "").startsWith(date)) return true;
  return false;
}

function hasPendingStatus(item) {
  const statuses = Object.values(item?.statusByUser || {});
  if (!statuses.length) return false;
  return statuses.some((status) => status !== "done");
}

const userId = normalizeUserId(argValue("--user"));
const date = normalizeDateArg(argValue("--date"));
const full = hasFlag("--full");
const state = getState(userId, { date });
const scheduleItemCards = (state.scheduleItemCards || []).map(compactItem).filter(Boolean);
const todayPlanCards = scheduleItemCards.filter((item) => itemTouchesDate(item, state.selectedDate));
const carryForwardCards = scheduleItemCards
  .filter((item) => !itemTouchesDate(item, state.selectedDate))
  .filter(hasPendingStatus)
  .slice(0, 20);

const output = {
  generatedAt: new Date().toISOString(),
  contentRoot: process.env.PEOS_CONTENT_ROOT || "",
  viewer: {
    id: userId,
    displayName: state.currentUser?.displayName || userId,
  },
  today: state.today,
  selectedDate: state.selectedDate,
  timeContext: businessDayContext(new Date(), state.selectedDate),
  profiles: state.profiles?.map((profile) => ({
    id: profile.id,
    displayName: profile.displayName,
  })),
  homeFocus: state.homeFocus,
  calendarContext: state.calendarContext,
  dayContext: state.dayContext,
  dailySummary: state.dailySummary,
  counts: {
    todayPlanCards: todayPlanCards.length,
    carryForwardCards: carryForwardCards.length,
    allVisibleScheduleItemCards: scheduleItemCards.length,
    captures: Array.isArray(state.captures) ? state.captures.length : 0,
    timelineBlocks: Array.isArray(state.dayTimelineBlocks) ? state.dayTimelineBlocks.length : 0,
  },
  todayPlanCards,
  carryForwardCards,
  scheduleItemCards: full ? scheduleItemCards : undefined,
  dayTimelineBlocks: (state.dayTimelineBlocks || []).map(compactTimeline).filter(Boolean),
  captures: (state.captures || []).slice(0, 30).map(compactCapture).filter(Boolean),
  weekScheduleItems: full ? (state.scheduleItems || []).map(compactItem).filter(Boolean) : undefined,
  todoItems: full ? (state.todoItems || []).map(compactItem).filter(Boolean) : undefined,
  checkinItems: full ? (state.checkinItems || []).map(compactItem).filter(Boolean) : undefined,
  deadlineItems: full ? (state.deadlineItems || []).map(compactItem).filter(Boolean) : undefined,
  memoryHints: full ? state.memoryHints : undefined,
  memoryItems: full ? state.memoryItems : undefined,
};

console.log(JSON.stringify(output, null, 2));
