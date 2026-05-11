import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  const manifestPaths = [
    {
      label: "openclaw.plugin.json",
      path: path.join(packageDir, "openclaw.plugin.json"),
    },
    {
      label: "plugin/.codex-plugin/plugin.json",
      path: path.join(packageDir, "plugin", ".codex-plugin", "plugin.json"),
    },
    {
      label: "plugin/.claude-plugin/plugin.json",
      path: path.join(packageDir, "plugin", ".claude-plugin", "plugin.json"),
    },
  ];
  const claudeCliIntegrationPaths = [
    path.join(packageDir, "plugin", "skills", "calle", "SKILL.md"),
    path.join(packageDir, "plugin", "skills", "calle", "references", "commands.md"),
  ];
  const indexPath = path.join(packageDir, "index.js");
  const cliConfigPath = path.join(packageDir, "lib", "config.js");

  if (!fs.existsSync(packageJsonPath)) {
    continue;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const packageVersion = packageJson.version;

  for (const manifestPath of manifestPaths) {
    if (!fs.existsSync(manifestPath.path)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath.path, "utf8"));
    const manifestVersion = manifest.version;

    if (packageVersion !== manifestVersion) {
      failures.push(
        `${entry.name}: package.json version (${packageVersion}) does not match ${manifestPath.label} version (${manifestVersion}).`
      );
    }
  }

  if (packageJson.name === "@call-e/claude-plugin") {
    for (const integrationPath of claudeCliIntegrationPaths) {
      if (!fs.existsSync(integrationPath)) {
        continue;
      }

      const source = fs.readFileSync(integrationPath, "utf8");
      const staleMatches = source.match(/CALLE_INTEGRATION_VERSION=(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g) || [];
      for (const match of staleMatches) {
        const version = match.replace("CALLE_INTEGRATION_VERSION=", "");
        if (version !== packageVersion) {
          failures.push(
            `${entry.name}: ${path.relative(packageDir, integrationPath)} ${match} does not match package.json version (${packageVersion}).`
          );
        }
      }
    }
  }

  if (packageJson.name === "@call-e/claude-plugin") {
    const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
    if (fs.existsSync(marketplacePath)) {
      const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
      const pluginEntry = Array.isArray(marketplace.plugins)
        ? marketplace.plugins.find((plugin) => plugin?.name === "calle")
        : null;
      if (pluginEntry?.version !== packageVersion) {
        failures.push(
          `${entry.name}: .claude-plugin/marketplace.json calle version (${pluginEntry?.version}) does not match package.json version (${packageVersion}).`
        );
      }
    }
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

  if (packageJson.name === "@call-e/cli" && fs.existsSync(cliConfigPath)) {
    const configSource = fs.readFileSync(cliConfigPath, "utf8");
    const match = configSource.match(/export const CLI_VERSION = "([^"]+)";/);
    if (!match) {
      failures.push(`${entry.name}: lib/config.js is missing a CLI_VERSION constant.`);
    } else if (match[1] !== packageVersion) {
      failures.push(
        `${entry.name}: lib/config.js CLI_VERSION (${match[1]}) does not match package.json version (${packageVersion}).`
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
