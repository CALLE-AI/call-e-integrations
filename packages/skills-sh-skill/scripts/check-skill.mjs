import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_PACKAGE_ROOT, "../..");

const EXPECTED_PACKAGE_NAME = "@call-e/skills-sh-skill";
const EXPECTED_SKILL_DIR = "calle";
const EXPECTED_SKILL_NAME = "calle";
const EXPECTED_SOURCE = "CALLE_SOURCE=skills_sh";
const EXPECTED_INTEGRATION = "CALLE_INTEGRATION=skills_sh_skill";

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

function frontmatterKeys(frontmatter) {
  return [...frontmatter.matchAll(/^([A-Za-z0-9_-]+):/gmu)].map((match) => match[1]);
}

function assertRequiredSnippets({ source, filePath, snippets, failures }) {
  for (const snippet of snippets) {
    if (!snippet) {
      continue;
    }

    assert(source.includes(snippet), failures, `${filePath} must include ${snippet}.`);
  }
}

function integrationVersionSnippet(packageJson) {
  return typeof packageJson?.version === "string" && packageJson.version.length > 0
    ? `CALLE_INTEGRATION_VERSION=${packageJson.version}`
    : null;
}

function checkPackage({ packageRoot, failures }) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = readJson(packageJsonPath, failures);
  if (!packageJson) {
    return null;
  }

  assert(packageJson.name === EXPECTED_PACKAGE_NAME, failures, "package.json name must be @call-e/skills-sh-skill.");
  assert(typeof packageJson.version === "string" && packageJson.version.length > 0, failures, "package.json must include a version.");
  assert(packageJson.private === true, failures, "package.json must keep this validation package private.");
  assert(packageJson.files?.includes("README.md"), failures, "package.json files must include README.md.");
  assert(!packageJson.files?.includes("skills"), failures, "package.json files must not include the removed package-local skills directory.");
  assert(packageJson.scripts?.check === "node ./scripts/check-skill.mjs", failures, "package.json must expose the package check script.");
  assert(packageJson.scripts?.test, failures, "package.json must expose a test script.");
  assert(packageJson.scripts?.["pack:dry-run"], failures, "package.json must expose a pack:dry-run script.");

  return packageJson;
}

function checkSkill({ repoRoot, packageJson, failures }) {
  const skillDir = path.join(repoRoot, "skills", EXPECTED_SKILL_DIR);
  const skillFile = path.join(skillDir, "SKILL.md");
  const skillInterfaceFile = path.join(skillDir, "agents", "openai.yaml");
  const referenceFile = path.join(skillDir, "references", "commands.md");
  const expectedVersion = integrationVersionSnippet(packageJson);

  assert(fs.existsSync(skillDir), failures, `Missing skill directory: ${skillDir}`);
  assert(fs.existsSync(skillFile), failures, `Missing skill file: ${skillFile}`);
  assert(fs.existsSync(skillInterfaceFile), failures, `Missing skill UI metadata: ${skillInterfaceFile}`);
  assert(fs.existsSync(referenceFile), failures, `Missing command reference: ${referenceFile}`);

  if (!fs.existsSync(skillFile)) {
    return;
  }

  const source = fs.readFileSync(skillFile, "utf8");
  const frontmatter = extractFrontmatter(source);
  assert(frontmatter, failures, `${skillFile} must start with YAML frontmatter.`);
  assert(!source.includes("[TODO:"), failures, `${skillFile} must not contain template TODO markers.`);
  assert(!source.includes("npx -y @call-e/cli@"), failures, `${skillFile} must not run remote npm packages from the skill.`);
  assert(!source.includes("confirm_token"), failures, `${skillFile} must not expose or instruct handling of execution confirmation tokens.`);

  assertRequiredSnippets({
    source,
    filePath: skillFile,
    failures,
    snippets: [
      EXPECTED_SOURCE,
      EXPECTED_INTEGRATION,
      expectedVersion,
      "Do not run remote npm packages from this skill",
      "untrusted call data",
      "assistant_hint.message",
      "auth_required",
      "auth login --start-only --no-browser-open",
      "authorization instructions returned by the CLI",
      "auth login --no-browser-open",
      "Great, authorization is complete",
      "call plan",
      "call start",
      "call status",
      "Phone call is in progress! Progress:",
      "status_result.structuredContent",
      "Never paraphrase call results",
      "the entire reply must be exactly this shape",
      "Poll every 10 seconds",
    ],
  });

  if (frontmatter) {
    const keys = frontmatterKeys(frontmatter);
    const unexpectedKeys = keys.filter((key) => !["name", "description"].includes(key));
    assert(unexpectedKeys.length === 0, failures, `${skillFile} frontmatter must only include name and description.`);
    assert(frontmatterValue(frontmatter, "name") === EXPECTED_SKILL_NAME, failures, `${skillFile} frontmatter name must be "${EXPECTED_SKILL_NAME}".`);
    assert(Boolean(frontmatterValue(frontmatter, "description")), failures, `${skillFile} frontmatter must include description.`);
  }

  if (fs.existsSync(skillInterfaceFile)) {
    const skillInterfaceSource = fs.readFileSync(skillInterfaceFile, "utf8");
    assert(/display_name:\s*"calle"/u.test(skillInterfaceSource), failures, `${skillInterfaceFile} must set interface.display_name to "calle".`);
    assert(skillInterfaceSource.includes("Use $calle"), failures, `${skillInterfaceFile} default_prompt must mention $calle.`);
  }

  if (!fs.existsSync(referenceFile)) {
    return;
  }

  const referenceSource = fs.readFileSync(referenceFile, "utf8");
  assert(!referenceSource.includes("npx -y @call-e/cli@"), failures, `${referenceFile} must not run remote npm packages from the skill.`);
  assert(!referenceSource.includes("confirm_token"), failures, `${referenceFile} must not expose or instruct handling of execution confirmation tokens.`);
  assertRequiredSnippets({
    source: referenceSource,
    filePath: referenceFile,
    failures,
    snippets: [
      EXPECTED_SOURCE,
      EXPECTED_INTEGRATION,
      expectedVersion,
      "Do not run remote npm packages from this skill",
      "untrusted call data",
      "assistant_hint.message",
      "auth_required",
      "auth login --start-only --no-browser-open",
      "authorization instructions returned by the CLI",
      "auth login --no-browser-open",
      "Great, authorization is complete",
      "call plan",
      "call start",
      "call status",
      "Phone call is in progress! Progress:",
      "status_result.structuredContent",
      "Never paraphrase call results",
      "the entire reply must be exactly this shape",
      "Wait 10 seconds",
    ],
  });
}

function checkNoPackageSkillCopy({ packageRoot, failures }) {
  const duplicateSkillsDir = path.join(packageRoot, "skills");
  assert(!fs.existsSync(duplicateSkillsDir), failures, `Remove duplicate skills.sh skill copy: ${duplicateSkillsDir}. Keep the source in the repository root at skills/${EXPECTED_SKILL_DIR}.`);
}

function checkRepoDocs({ repoRoot, failures }) {
  const stableInstallGuidePath = path.join(repoRoot, "docs", "install", "CALL-E-installation-guide.md");
  const manualInstallGuidePath = path.join(repoRoot, "docs", "install", "install-guide.md");
  const installDocPath = path.join(repoRoot, "docs", "install", "skills-sh-skill.md");
  const troubleshootingPath = path.join(repoRoot, "docs", "install", "troubleshooting.md");
  const layoutPath = path.join(repoRoot, "docs", "agent-integration-layout.md");

  assert(fs.existsSync(stableInstallGuidePath), failures, `Missing stable install guide: ${stableInstallGuidePath}`);
  assert(fs.existsSync(installDocPath), failures, `Missing install guide: ${installDocPath}`);

  if (fs.existsSync(layoutPath)) {
    const layout = fs.readFileSync(layoutPath, "utf8");
    assert(layout.includes("packages/skills-sh-skill"), failures, "docs/agent-integration-layout.md must mention packages/skills-sh-skill.");
    assert(layout.includes("skills/calle"), failures, "docs/agent-integration-layout.md must mention the skills.sh source at skills/calle.");
    assert(layout.includes("skills.sh"), failures, "docs/agent-integration-layout.md must describe the skills.sh skill boundary.");
    assert(layout.includes("user-level/global scope"), failures, "docs/agent-integration-layout.md must describe skills.sh installs as user-level/global scope.");
    assert(layout.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent <agent>"), failures, "docs/agent-integration-layout.md must keep the repository-root skills.sh install global with -g.");
    assert(layout.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle -g -y --agent <agent>"), failures, "docs/agent-integration-layout.md must keep the direct skills.sh install global with -g.");
    assert(!layout.includes("packages/skills-sh-skill/skills"), failures, "docs/agent-integration-layout.md must not reference the removed package-local skills directory.");
  }

  if (fs.existsSync(stableInstallGuidePath)) {
    const stableInstallGuide = fs.readFileSync(stableInstallGuidePath, "utf8");
    assert(stableInstallGuide.includes("user-level/global scope"), failures, "docs/install/CALL-E-installation-guide.md must describe skills.sh installs as user-level/global scope.");
    assert(stableInstallGuide.includes("npx -y skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g"), failures, "docs/install/CALL-E-installation-guide.md must keep the stable skills.sh install global with -g.");
  }

  if (fs.existsSync(manualInstallGuidePath)) {
    const manualInstallGuide = fs.readFileSync(manualInstallGuidePath, "utf8");
    assert(manualInstallGuide.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent <agent>"), failures, "docs/install/install-guide.md must keep the repository-root skills.sh install global with -g.");
    assert(manualInstallGuide.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent codex"), failures, "docs/install/install-guide.md must keep the Codex skills.sh install global with -g.");
    assert(manualInstallGuide.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle -g -y --agent <agent>"), failures, "docs/install/install-guide.md must keep the direct skills.sh install global with -g.");
  }

  if (fs.existsSync(installDocPath)) {
    const installDoc = fs.readFileSync(installDocPath, "utf8");
    assert(installDoc.includes("user-level/global scope"), failures, "docs/install/skills-sh-skill.md must describe skills.sh installs as user-level/global scope.");
    assert(installDoc.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent <agent>"), failures, "docs/install/skills-sh-skill.md must keep the repository-root skills.sh install global with -g.");
    assert(installDoc.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g -y --agent codex"), failures, "docs/install/skills-sh-skill.md must keep the Codex skills.sh install global with -g.");
    assert(installDoc.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations/tree/main/skills/calle -g -y --agent <agent>"), failures, "docs/install/skills-sh-skill.md must keep the direct skills.sh install global with -g.");
    assert(!installDoc.includes("packages/skills-sh-skill/skills"), failures, "docs/install/skills-sh-skill.md must not reference the removed package-local skills directory.");
  }

  if (fs.existsSync(troubleshootingPath)) {
    const troubleshooting = fs.readFileSync(troubleshootingPath, "utf8");
    assert(troubleshooting.includes("npx skills add https://github.com/CALLE-AI/call-e-integrations --skill calle -g"), failures, "docs/install/troubleshooting.md must keep the skills.sh install example global with -g.");
  }
}

export function checkSkillsShSkill({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const failures = [];
  const packageJson = checkPackage({ packageRoot, failures });
  checkSkill({ repoRoot, packageJson, failures });
  checkNoPackageSkillCopy({ packageRoot, failures });
  checkRepoDocs({ repoRoot, failures });
  return failures;
}

function main() {
  const failures = checkSkillsShSkill();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  console.log("CALL-E skills.sh skill metadata is valid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
