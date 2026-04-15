import { spawnSync } from "node:child_process";
import path from "node:path";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("No files provided.");
  process.exit(1);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    const resolved = path.resolve(process.cwd(), file);
    console.error(`Syntax check failed for ${resolved}.`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Syntax check passed for ${files.length} file(s).`);
