import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const versionedFiles = [
  "README.md",
  "docs/agent-integration-layout.md",
  "docs/git-naming-conventions.md",
  "packages/codex-plugin/README.md",
  "packages/codex-plugin/plugin/README.md",
  "packages/codex-plugin/plugin/skills/calle/SKILL.md",
  "packages/codex-plugin/plugin/skills/calle/references/commands.md",
  "packages/openclaw-cli-skill/README.md",
  "packages/openclaw-cli-skill/skills/phone-call-calle/SKILL.md",
  "packages/openclaw-cli-skill/skills/phone-call-calle/references/commands.md",
];

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
    label: "Codex marketplace --ref",
    pattern: /(?<=--ref ')@call-e\/codex-plugin@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?=')/g,
    value: `@call-e/codex-plugin@${readPackageVersion("packages/codex-plugin")}`,
  },
  {
    label: "Codex plugin install docs release tag",
    pattern:
      /`@call-e\/codex-plugin@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`(?= with the package release tag)/g,
    value: `\`@call-e/codex-plugin@${readPackageVersion("packages/codex-plugin")}\``,
  },
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

for (const relativePath of versionedFiles) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing versioned install doc: ${relativePath}`);
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
    console.error(`${relativePath} has stale versioned install command references.`);
  }
  console.error("Run `node ./scripts/sync-install-doc-versions.mjs` to update them.");
  process.exit(1);
}

console.log(
  checkOnly
    ? "Versioned install command references are in sync."
    : "Versioned install command references have been synced.",
);
