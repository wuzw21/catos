#!/usr/bin/env node

const { sendCcConnectMessage } = require("./cc-connect-outbound.js");

function printUsage() {
  console.error([
    "Usage:",
    "  node scripts/send-cc-connect-message.js --user partner --text \"记录今天的猫猫日记！\"",
    "  echo \"记录今天的猫猫日记！\" | node scripts/send-cc-connect-message.js --user partner --stdin",
    "",
    "Options:",
    "  --user <id>        PEOS user id or alias: you/partner/damao/xiaomao",
    "  --text <message>   Message text to send",
    "  --stdin            Read message text from stdin",
    "  --project <name>   Override CC Connect project",
    "  --session <key>    Override CC Connect session key",
    "  --data-dir <path>  Override CC Connect data dir",
    "  --timeout-ms <n>   Send timeout",
    "  --dry-run          Validate target and print command without sending",
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

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--user" || arg === "--to") {
      options.userId = next();
    } else if (arg === "--text" || arg === "--message" || arg === "-m") {
      options.text = next();
    } else if (arg === "--stdin") {
      options.stdin = true;
    } else if (arg === "--project" || arg === "-p") {
      options.project = next();
    } else if (arg === "--session" || arg === "-s") {
      options.session = next();
    } else if (arg === "--data-dir") {
      options.dataDir = next();
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(next());
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (!options.text) {
      options.text = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(text));
  });
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printUsage();
    return;
  }
  if (options.stdin) {
    options.text = await readStdin();
  }

  const result = await sendCcConnectMessage(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (error.result) {
    console.error(JSON.stringify(error.result, null, 2));
  }
  process.exit(1);
});
