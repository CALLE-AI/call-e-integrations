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
  assert(packageJson.files?.includes("skills"), failures, "package.json files must include skills.");
  assert(packageJson.scripts?.check === "node ./scripts/check-skill.mjs", failures, "package.json must expose the package check script.");
  assert(packageJson.scripts?.test, failures, "package.json must expose a test script.");
  assert(packageJson.scripts?.["pack:dry-run"], failures, "package.json must expose a pack:dry-run script.");

  return packageJson;
}

function checkSkill({ packageRoot, packageJson, failures }) {
  const skillDir = path.join(packageRoot, "skills", EXPECTED_SKILL_DIR);
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

  assertRequiredSnippets({
    source,
    filePath: skillFile,
    failures,
    snippets: [
      EXPECTED_SOURCE,
      EXPECTED_INTEGRATION,
      expectedVersion,
      "npx -y @call-e/cli@",
      "assistant_hint.message",
      "auth_required",
      "auth login --start-only --no-browser-open",
      "authorization instructions returned by the CLI",
      "auth login --no-browser-open",
      "Great, authorization is complete",
      "call plan",
      "call run",
      "call status",
      "Phone call is in progress! Progress:",
      "do not use `run_result`",
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
  assertRequiredSnippets({
    source: referenceSource,
    filePath: referenceFile,
    failures,
    snippets: [
      EXPECTED_SOURCE,
      EXPECTED_INTEGRATION,
      expectedVersion,
      "npx -y @call-e/cli@",
      "assistant_hint.message",
      "auth_required",
      "auth login --start-only --no-browser-open",
      "authorization instructions returned by the CLI",
      "auth login --no-browser-open",
      "Great, authorization is complete",
      "call plan",
      "call run",
      "call status",
      "Phone call is in progress! Progress:",
      "run_result",
      "status_result.structuredContent",
      "Never paraphrase call results",
      "the entire reply must be exactly this shape",
      "Wait 10 seconds",
    ],
  });
}

function checkRepoDocs({ repoRoot, failures }) {
  const readmePath = path.join(repoRoot, "README.md");
  const installDocPath = path.join(repoRoot, "docs", "install", "skills-sh-skill.md");
  const layoutPath = path.join(repoRoot, "docs", "agent-integration-layout.md");

  assert(fs.existsSync(installDocPath), failures, `Missing install guide: ${installDocPath}`);

  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, "utf8");
    assert(readme.includes("packages/skills-sh-skill"), failures, "README.md must mention packages/skills-sh-skill.");
    assert(readme.includes("docs/install/skills-sh-skill.md"), failures, "README.md must link to the skills.sh install guide.");
  }

  if (fs.existsSync(layoutPath)) {
    const layout = fs.readFileSync(layoutPath, "utf8");
    assert(layout.includes("packages/skills-sh-skill"), failures, "docs/agent-integration-layout.md must mention packages/skills-sh-skill.");
    assert(layout.includes("skills.sh"), failures, "docs/agent-integration-layout.md must describe the skills.sh skill boundary.");
  }
}

export function checkSkillsShSkill({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const failures = [];
  const packageJson = checkPackage({ packageRoot, failures });
  checkSkill({ packageRoot, packageJson, failures });
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
