import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distEntry = path.resolve(__dirname, "artifacts/api-server/dist/index.mjs");

if (!fs.existsSync(distEntry)) {
  const { execSync } = await import("node:child_process");
  console.log("[CivicFix] Production server bundle not found. Building now...");
  execSync("npm run build", { stdio: "inherit", cwd: __dirname });
}

await import(distEntry);
