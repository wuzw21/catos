const path = require("path");

const repoRoot = process.cwd();

function resolveContentRoot() {
  const configured = String(process.env.PEOS_CONTENT_ROOT || "").trim();
  if (!configured) {
    return repoRoot;
  }

  return path.isAbsolute(configured) ? configured : path.resolve(repoRoot, configured);
}

const contentRoot = resolveContentRoot();

function repoPath(...parts) {
  return path.join(repoRoot, ...parts);
}

function contentPath(...parts) {
  return path.join(contentRoot, ...parts);
}

function relativeToRepo(targetPath) {
  return path.relative(repoRoot, targetPath);
}

function relativeToContent(targetPath) {
  return path.relative(contentRoot, targetPath);
}

module.exports = {
  repoRoot,
  contentRoot,
  repoPath,
  contentPath,
  relativeToRepo,
  relativeToContent,
};
