import { spawn } from "node:child_process";
import { access, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "foreground_final");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function exists(file) {
  return access(file).then(
    () => true,
    () => false,
  );
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, args, { cwd: app, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(" ")} exited ${code}`));
    });
  });
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`Node ${process.versions.node} is too old. Install Node 20 or newer, then run npm run dev again.`);
  process.exit(1);
}

if (!(await exists(path.join(app, "node_modules", "next")))) {
  console.log("Installing foreground_final dependencies...");
  await run(["ci"]);
}

const envFile = path.join(app, ".env.local");
if (!(await exists(envFile))) {
  await copyFile(path.join(app, ".env.example"), envFile);
  console.log("Created foreground_final/.env.local from .env.example.");
  console.log("Add the Matterport, Vexcel, Anthropic, and Gemini keys to that file, then restart.");
}

console.log("Starting Foreground at http://localhost:3000");
await run(["run", "dev"]);
