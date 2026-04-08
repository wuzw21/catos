const fs = require("fs");
const path = require("path");
const { contentRoot, contentPath, relativeToContent } = require("./lib/runtime-paths.js");

const rootDir = contentRoot;
const allowedStatuses = new Set(["未开始", "进行中", "已完成", "搁置"]);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function listTodoFiles(todosDir) {
  return fs
    .readdirSync(todosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(todosDir, entry.name))
    .filter((filePath) => {
      const base = path.basename(filePath, ".md").toLowerCase();
      return base !== "readme" && base !== "index";
    });
}

function matchTodo(filePath) {
  const markdown = read(filePath);
  const fileId = path.basename(filePath, ".md");
  const extractedId = markdown.match(/`(todo-[^`]+)`/)?.[1] || fileId;
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  return {
    filePath,
    fileId,
    extractedId,
    title,
    markdown,
  };
}

function updateTodoIndex(indexMarkdown, matched, nextStatus) {
  const targetTodoIdCell = `\`${matched.extractedId}\``;
  const targetFileCell = `\`todos/${matched.fileId}.md\``;

  return indexMarkdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!/^\|.+\|$/.test(trimmed)) return line;

      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());

      if (cells.length !== 5) return line;
      if (cells[0] !== targetTodoIdCell) return line;
      if (cells[4] !== targetFileCell) return line;

      cells[3] = nextStatus;
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");
}

function updateTodoStatus(todoId, nextStatus) {
  if (!todoId || !nextStatus) {
    throw new Error("usage: node scripts/update-todo-status.js <todo-id-or-fileId> <status>");
  }

  if (!allowedStatuses.has(nextStatus)) {
    throw new Error(`invalid status: ${nextStatus}`);
  }

  const todosDir = contentPath("todos");
  const todoFiles = listTodoFiles(todosDir);
  const matched = todoFiles
    .map(matchTodo)
    .find((item) => item.extractedId === todoId || item.fileId === todoId || item.title === todoId);

  if (!matched) {
    throw new Error(`todo not found: ${todoId}`);
  }

  const updatedTodo = matched.markdown.replace(
    /^\| 状态 \| .* \|$/m,
    `| 状态 | ${nextStatus} |`
  );

  write(matched.filePath, updatedTodo);

  const indexPath = path.join(todosDir, "index.md");
  if (fs.existsSync(indexPath)) {
    const indexMarkdown = updateTodoIndex(read(indexPath), matched, nextStatus);
    write(indexPath, indexMarkdown);
  }

  return {
    id: matched.extractedId,
    fileId: matched.fileId,
    title: matched.title,
    path: relativeToContent(matched.filePath),
    status: nextStatus,
  };
}

if (require.main === module) {
  const [, , todoId, nextStatus] = process.argv;

  try {
    const updated = updateTodoStatus(todoId, nextStatus);
    console.log(`updated ${updated.id} -> ${updated.status}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  allowedStatuses,
  updateTodoStatus,
};
