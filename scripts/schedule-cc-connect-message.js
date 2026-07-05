#!/usr/bin/env node

const {
  cancelScheduledCcConnectPush,
  createScheduledCcConnectPush,
  listScheduledCcConnectPushes,
  processDueScheduledCcConnectPushes,
} = require("./cc-connect-scheduler.js");

function printUsage() {
  console.error([
    "Usage:",
    "  node scripts/schedule-cc-connect-message.js --user partner --text \"记录今天的猫猫日记！\" --at 2026-05-22T22:00:00+08:00",
    "  node scripts/schedule-cc-connect-message.js --user partner --text \"记录今天的猫猫日记！\" --date 2026-05-22 --time 22:00",
    "  node scripts/schedule-cc-connect-message.js --list",
    "  node scripts/schedule-cc-connect-message.js --run-due",
    "  node scripts/schedule-cc-connect-message.js --cancel <id>",
    "",
    "Options:",
    "  --user <id>       PEOS user id or alias: you/partner/damao/xiaomao",
    "  --text <message>  Message text to send",
    "  --at <datetime>   ISO or local date-time",
    "  --date <date>     YYYY-MM-DD, used with --time",
    "  --time <time>     HH:mm, used with --date or today",
    "  --delay-ms <n>    Schedule after delay",
    "  --key <key>       Idempotency key",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--run-due") options.runDue = true;
    else if (arg === "--cancel") options.cancel = next();
    else if (arg === "--user" || arg === "--to") options.userId = next();
    else if (arg === "--text" || arg === "--message" || arg === "-m") options.text = next();
    else if (arg === "--at" || arg === "--scheduled-at") options.scheduledAt = next();
    else if (arg === "--date") options.date = next();
    else if (arg === "--time") options.time = next();
    else if (arg === "--delay-ms") options.delayMs = Number(next());
    else if (arg === "--key" || arg === "--idempotency-key") options.idempotencyKey = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printUsage();
    return;
  }
  if (options.list) {
    console.log(JSON.stringify(listScheduledCcConnectPushes(options), null, 2));
    return;
  }
  if (options.cancel) {
    console.log(JSON.stringify(cancelScheduledCcConnectPush(options.cancel), null, 2));
    return;
  }
  if (options.runDue) {
    console.log(JSON.stringify(await processDueScheduledCcConnectPushes(), null, 2));
    return;
  }
  console.log(JSON.stringify(createScheduledCcConnectPush(options), null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
