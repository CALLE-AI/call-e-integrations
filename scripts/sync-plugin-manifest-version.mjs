import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(repoRoot, "packages");

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
  const manifestPaths = [
    path.join(packageDir, "openclaw.plugin.json"),
    path.join(packageDir, "plugin", ".codex-plugin", "plugin.json"),
  ];
  const indexPath = path.join(packageDir, "index.js");
  const cliConfigPath = path.join(packageDir, "lib", "config.js");

  if (!fs.existsSync(packageJsonPath)) {
    continue;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;

  for (const manifestPath of manifestPaths) {
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.version !== version) {
      manifest.version = version;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  if (fs.existsSync(indexPath)) {
    const indexSource = fs.readFileSync(indexPath, "utf8");
    const nextSource = indexSource.replace(
      /const PLUGIN_VERSION = "([^"]+)";/,
      `const PLUGIN_VERSION = "${version}";`
    );
    if (nextSource !== indexSource) {
      fs.writeFileSync(indexPath, nextSource);
    }
  }

  if (packageJson.name === "@call-e/cli" && fs.existsSync(cliConfigPath)) {
    const configSource = fs.readFileSync(cliConfigPath, "utf8");
    const nextSource = configSource.replace(
      /export const CLI_VERSION = "([^"]+)";/,
      `export const CLI_VERSION = "${version}";`
    );
    if (nextSource !== configSource) {
      fs.writeFileSync(cliConfigPath, nextSource);
    }
  }
}

console.log("Plugin manifest and runtime versions are in sync.");
