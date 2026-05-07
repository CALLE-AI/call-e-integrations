import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const syncedInstallFiles = [
  "README.md",
  "docs/install/cli.md",
  "docs/install/codex-plugin.md",
  "docs/install/openclaw-cli-skill.md",
  "docs/agent-integration-layout.md",
  "packages/codex-plugin/README.md",
  "packages/codex-plugin/plugin/README.md",
  "packages/codex-plugin/plugin/skills/calle/SKILL.md",
  "packages/codex-plugin/plugin/skills/calle/references/commands.md",
  "packages/openclaw-cli-skill/README.md",
  "packages/openclaw-cli-skill/skills/phone-call-calle/SKILL.md",
  "packages/openclaw-cli-skill/skills/phone-call-calle/references/commands.md",
];

const codexLatestInstallFiles = new Set([
  "docs/install/codex-plugin.md",
  "docs/agent-integration-layout.md",
  "packages/codex-plugin/plugin/README.md",
]);

const codexLatestInstallRef = "--ref '@call-e/codex-plugin@latest'";

const codexIntegrationFiles = new Set([
  "packages/codex-plugin/plugin/skills/calle/SKILL.md",
  "packages/codex-plugin/plugin/skills/calle/references/commands.md",
]);

const openclawCliSkillIntegrationFiles = new Set([
  "packages/openclaw-cli-skill/README.md",
  "packages/openclaw-cli-skill/skills/phone-call-calle/SKILL.md",
  "packages/openclaw-cli-skill/skills/phone-call-calle/references/commands.md",
]);

function readPackageVersion(packagePath) {
  const packageJsonPath = path.join(repoRoot, packagePath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

const replacements = [
  {
    label: "npx CLI fallback",
    pattern: /npx -y @call-e\/cli@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
    value: `npx -y @call-e/cli@${readPackageVersion("packages/cli")}`,
  },
];

const codexIntegrationReplacements = [
  {
    label: "Codex plugin integration attribution version",
    pattern: /CALLE_INTEGRATION_VERSION=\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
    value: `CALLE_INTEGRATION_VERSION=${readPackageVersion("packages/codex-plugin")}`,
  },
];

const openclawCliSkillIntegrationReplacements = [
  {
    label: "OpenClaw CLI skill integration attribution version",
    pattern: /CALLE_INTEGRATION_VERSION=\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
    value: `CALLE_INTEGRATION_VERSION=${readPackageVersion("packages/openclaw-cli-skill")}`,
  },
];

const staleFiles = [];
const validationFailures = [];

for (const relativePath of syncedInstallFiles) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing synced install doc: ${relativePath}`);
  }

  const source = fs.readFileSync(filePath, "utf8");
  let nextSource = source;

  for (const replacement of replacements) {
    nextSource = nextSource.replace(replacement.pattern, replacement.value);
  }

  const integrationReplacements = codexIntegrationFiles.has(relativePath)
    ? codexIntegrationReplacements
    : openclawCliSkillIntegrationFiles.has(relativePath)
      ? openclawCliSkillIntegrationReplacements
      : [];

  for (const replacement of integrationReplacements) {
    nextSource = nextSource.replace(replacement.pattern, replacement.value);
  }

  if (codexLatestInstallFiles.has(relativePath)) {
    if (!nextSource.includes(codexLatestInstallRef)) {
      validationFailures.push(`${relativePath} must install the Codex plugin with ${codexLatestInstallRef}.`);
    }

    if (/--ref\s+['"]?@call-e\/codex-plugin@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?['"]?/u.test(nextSource)) {
      validationFailures.push(`${relativePath} must not use a version-pinned Codex install ref by default.`);
    }
  }

  if (nextSource === source) {
    continue;
  }

  if (checkOnly) {
    staleFiles.push(relativePath);
  } else {
    fs.writeFileSync(filePath, nextSource);
  }
}

if (staleFiles.length > 0) {
  for (const relativePath of staleFiles) {
    console.error(`${relativePath} has stale install command references.`);
  }
  console.error("Run `node ./scripts/sync-install-doc-versions.mjs` to update them.");
}

if (validationFailures.length > 0) {
  for (const failure of validationFailures) {
    console.error(failure);
  }
}

if (staleFiles.length > 0 || validationFailures.length > 0) {
  process.exit(1);
}

console.log(
  checkOnly
    ? "Install command references are in sync."
    : "Install command references have been synced.",
);
