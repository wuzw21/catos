import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const webDir = path.join(repoRoot, "web");

for (const relativePath of ["assets", "index.html", "manifest.webmanifest", "boot.js", "icons"]) {
  const targetPath = path.join(webDir, relativePath);
  fs.rmSync(targetPath, { recursive: true, force: true });
}
