const { readCurrentHomeIndex, updateHomeIndex } = require("./update-home-index.js");
const { insertScheduleItemFromText, segmentDefinitions } = require("./schedule-utils.js");

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " / ")
    .replace(/\|/g, "/")
    .trim();
}

function formatPlacement(scheduleItem) {
  const segmentLabel = segmentDefinitions.find((item) => item.key === scheduleItem.segment)?.label || scheduleItem.segment || "全天";
  return `${normalizeText(scheduleItem.dateId)} ${normalizeText(segmentLabel)}`.trim();
}

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function linkTodayPlanToSchedule(payload = {}) {
  const planId = normalizeText(payload.planId);
  const whenText = normalizeText(payload.whenText || "今天");

  if (!planId) {
    throw new Error("planId is required");
  }

  const current = readCurrentHomeIndex();
  const item = current.todayItems.find((plan) => normalizeText(plan.planId) === planId);

  if (!item) {
    throw new Error(`today plan not found: ${planId}`);
  }

  const description = normalizeText(item.description);
  if (!description) {
    throw new Error("plan description is empty");
  }

  const expression = whenText.includes(description) ? whenText : `${whenText} ${description}`;
  const scheduleItem = insertScheduleItemFromText(expression, {
    referenceDate: `${getLocalDateString()}T12:00:00`,
  });

  const nextTodayItems = current.todayItems.map((plan) =>
    normalizeText(plan.planId) === planId
      ? {
          ...plan,
          schedulePlacement: formatPlacement(scheduleItem),
        }
      : plan
  );

  const updatedHomeIndex = updateHomeIndex({
    todayItems: nextTodayItems,
  });

  return {
    homeIndex: updatedHomeIndex,
    schedule: scheduleItem,
  };
}

if (require.main === module) {
  const [, , jsonPayload] = process.argv;

  try {
    const payload = jsonPayload ? JSON.parse(jsonPayload) : null;
    const result = linkTodayPlanToSchedule(payload);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  linkTodayPlanToSchedule,
};
