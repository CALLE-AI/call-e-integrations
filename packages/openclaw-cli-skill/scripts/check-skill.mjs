import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_PACKAGE_ROOT, "../..");

const EXPECTED_PACKAGE_NAME = "@call-e/openclaw-cli-skill";
const EXPECTED_SKILL_DIR = "calle-cli";
const EXPECTED_SKILL_NAME = "Phone Call — Call-E";
const BANNED_PLUGIN_STRINGS = [
  ["openclaw", "plugins", "install"].join(" "),
  ["openclaw-setup", "sh"].join("."),
];

function readJson(filePath, failures) {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing ${filePath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`Invalid JSON at ${filePath}: ${error.message}`);
    return null;
  }
}

function assert(condition, failures, message) {
  if (!condition) {
    failures.push(message);
  }
}

function extractFrontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n?/u.exec(markdown);
  return match ? match[1] : null;
}

function frontmatterValue(frontmatter, key) {
  const match = new RegExp(`^${key}:\\s*([^\\n]+)\\s*$`, "mu").exec(frontmatter);
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? null;
}

function checkPackage({ packageRoot, failures }) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = readJson(packageJsonPath, failures);
  if (!packageJson) {
    return;
  }

  assert(packageJson.name === EXPECTED_PACKAGE_NAME, failures, "package.json name must be @call-e/openclaw-cli-skill.");
  assert(packageJson.private === true, failures, "package.json must keep this validation package private.");
  assert(packageJson.files?.includes("README.md"), failures, "package.json files must include README.md.");
  assert(packageJson.files?.includes("skills"), failures, "package.json files must include skills.");
  assert(packageJson.scripts?.check === "node ./scripts/check-skill.mjs", failures, "package.json must expose the package check script.");
  assert(packageJson.scripts?.test, failures, "package.json must expose a test script.");
  assert(packageJson.scripts?.["pack:dry-run"], failures, "package.json must expose a pack:dry-run script.");
}

function checkSkill({ packageRoot, failures }) {
  const skillDir = path.join(packageRoot, "skills", EXPECTED_SKILL_DIR);
  const skillFile = path.join(skillDir, "SKILL.md");
  const referenceFile = path.join(skillDir, "references", "commands.md");

  assert(fs.existsSync(skillDir), failures, `Missing skill directory: ${skillDir}`);
  assert(fs.existsSync(skillFile), failures, `Missing skill file: ${skillFile}`);
  assert(fs.existsSync(referenceFile), failures, `Missing command reference: ${referenceFile}`);

  if (!fs.existsSync(skillFile)) {
    return;
  }

  const source = fs.readFileSync(skillFile, "utf8");
  const frontmatter = extractFrontmatter(source);
  assert(frontmatter, failures, `${skillFile} must start with YAML frontmatter.`);
  assert(source.includes("assistant_hint.message"), failures, `${skillFile} must document assistant_hint.message handling.`);
  assert(source.includes("auth_required"), failures, `${skillFile} must document auth_required handling.`);
  assert(source.includes("CALLE_INTEGRATION=openclaw_cli_skill"), failures, `${skillFile} must include OpenClaw CLI skill integration attribution.`);

  for (const banned of BANNED_PLUGIN_STRINGS) {
    assert(!source.includes(banned), failures, `${skillFile} must not reference plugin install path: ${banned}`);
  }

  if (!frontmatter) {
    return;
  }

  assert(frontmatterValue(frontmatter, "name") === EXPECTED_SKILL_NAME, failures, `${skillFile} frontmatter name must be "${EXPECTED_SKILL_NAME}".`);
  assert(Boolean(frontmatterValue(frontmatter, "description")), failures, `${skillFile} frontmatter must include description.`);

  const metadataMatches = [...frontmatter.matchAll(/^metadata:\s*(.*)$/gmu)];
  assert(metadataMatches.length === 1, failures, `${skillFile} frontmatter must include exactly one metadata line.`);
  const metadataSource = metadataMatches[0]?.[1]?.trim();
  assert(Boolean(metadataSource), failures, `${skillFile} metadata must be declared on one line.`);

  if (metadataSource) {
    try {
      const metadata = JSON.parse(metadataSource);
      const openclaw = metadata.openclaw;
      assert(openclaw && typeof openclaw === "object", failures, `${skillFile} metadata.openclaw must be an object.`);
      assert(openclaw.requires?.bins?.includes("node"), failures, `${skillFile} metadata.openclaw.requires.bins must include node.`);
      assert(openclaw.requires?.anyBins?.includes("calle"), failures, `${skillFile} metadata.openclaw.requires.anyBins must include calle.`);
      assert(openclaw.requires?.anyBins?.includes("npx"), failures, `${skillFile} metadata.openclaw.requires.anyBins must include npx.`);
      assert(
        Array.isArray(openclaw.install) && openclaw.install.some((entry) => entry?.kind === "node" && entry?.package === "@call-e/cli"),
        failures,
        `${skillFile} metadata.openclaw.install must include a node installer for @call-e/cli.`,
      );
    } catch (error) {
      failures.push(`${skillFile} metadata must be single-line JSON: ${error.message}`);
    }
  }
}

function checkReference({ packageRoot, failures }) {
  const referenceFile = path.join(packageRoot, "skills", EXPECTED_SKILL_DIR, "references", "commands.md");
  if (!fs.existsSync(referenceFile)) {
    return;
  }

  const source = fs.readFileSync(referenceFile, "utf8");
  const requiredSnippets = [
    "node packages/cli/bin/calle.js",
    "npx -y @call-e/cli@",
    "CALLE_SOURCE=openclaw",
    "CALLE_INTEGRATION=openclaw_cli_skill",
    "auth_required",
    "assistant_hint.message",
    "call plan",
    "call run",
    "call status",
  ];

  for (const snippet of requiredSnippets) {
    assert(source.includes(snippet), failures, `${referenceFile} must include ${snippet}.`);
  }

  for (const banned of BANNED_PLUGIN_STRINGS) {
    assert(!source.includes(banned), failures, `${referenceFile} must not reference plugin install path: ${banned}`);
  }
}

function checkRepoDocs({ repoRoot, failures }) {
  const readmePath = path.join(repoRoot, "README.md");
  const layoutPath = path.join(repoRoot, "docs", "agent-integration-layout.md");

  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, "utf8");
    assert(readme.includes("packages/openclaw-cli-skill"), failures, "README.md must mention packages/openclaw-cli-skill.");
  }

  if (fs.existsSync(layoutPath)) {
    const layout = fs.readFileSync(layoutPath, "utf8");
    assert(layout.includes("packages/openclaw-cli-skill"), failures, "docs/agent-integration-layout.md must mention packages/openclaw-cli-skill.");
    assert(layout.includes("Root `skills/`"), failures, "docs/agent-integration-layout.md must describe the root skills boundary.");
  }
}

export function checkOpenClawCliSkill({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const failures = [];
  checkPackage({ packageRoot, failures });
  checkSkill({ packageRoot, failures });
  checkReference({ packageRoot, failures });
  checkRepoDocs({ repoRoot, failures });
  return failures;
}

function main() {
  const failures = checkOpenClawCliSkill();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  console.log("Call-E OpenClaw CLI skill metadata is valid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
