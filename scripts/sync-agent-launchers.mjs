import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "packages/cli/scripts/run-agent-command.mjs"), "utf8");
const skillDirs = [
  "packages/codex-plugin/plugin/skills/calle",
  "packages/claude-plugin/plugin/skills/calle",
  "packages/cursor-plugin/plugin/skills/calle",
  "packages/openclaw-cli-skill/skills/phone-call-calle",
  "skills/calle",
];
for (const dir of skillDirs) {
  const target = path.join(root, dir, "scripts/run-agent-command.mjs");
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== source.replaceAll("\r\n", "\n")) {
      console.error(dir + ": run node scripts/sync-agent-launchers.mjs to synchronize the bundled launcher.");
      process.exitCode = 1;
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
}
