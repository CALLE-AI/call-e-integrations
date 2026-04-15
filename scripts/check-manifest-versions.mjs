import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(repoRoot, "packages");
const failures = [];

if (!fs.existsSync(packagesDir)) {
  console.error("Missing packages directory.");
  process.exit(1);
}

for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageDir = path.join(packagesDir, entry.name);
  const packageJsonPath = path.join(packageDir, "package.json");
  const manifestPath = path.join(packageDir, "openclaw.plugin.json");
  const indexPath = path.join(packageDir, "index.js");

  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(manifestPath)) {
    continue;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const packageVersion = packageJson.version;
  const manifestVersion = manifest.version;

  if (packageVersion !== manifestVersion) {
    failures.push(
      `${entry.name}: package.json version (${packageVersion}) does not match openclaw.plugin.json version (${manifestVersion}).`
    );
  }

  if (fs.existsSync(indexPath)) {
    const indexSource = fs.readFileSync(indexPath, "utf8");
    const match = indexSource.match(/const PLUGIN_VERSION = "([^"]+)";/);
    if (!match) {
      failures.push(`${entry.name}: index.js is missing a PLUGIN_VERSION constant.`);
    } else if (match[1] !== packageVersion) {
      failures.push(
        `${entry.name}: index.js PLUGIN_VERSION (${match[1]}) does not match package.json version (${packageVersion}).`
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("Package metadata versions are in sync.");
