import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_PACKAGE_ROOT, "../..");

const EXPECTED_PACKAGE_NAME = "@call-e/claude-plugin";
const EXPECTED_MARKETPLACE_NAME = "call-e-claude";
const EXPECTED_MARKETPLACE_SOURCE = "./packages/claude-plugin/plugin";
const EXPECTED_PLUGIN_NAME = "calle";
const EXPECTED_SKILL_NAME = "calle";
const EXPECTED_SKILL_INVOCATION = `/${EXPECTED_PLUGIN_NAME}:${EXPECTED_SKILL_NAME}`;
const LEGACY_SKILL_INVOCATION = `/${EXPECTED_PLUGIN_NAME}:phone-call`;
const EXPECTED_CLI_SOURCE = "claude";
const EXPECTED_CLI_INTEGRATION = "claude_code_plugin";
const EXPECTED_REFERENCE_FILE = "references/commands.md";

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
    return null;
  }

  assert(packageJson.name === EXPECTED_PACKAGE_NAME, failures, "package.json name must be @call-e/claude-plugin.");
  assert(packageJson.private !== true, failures, "package.json must keep the Claude plugin package publishable.");
  assert(packageJson.files?.includes("README.md"), failures, "package.json files must include README.md.");
  assert(packageJson.files?.includes("plugin"), failures, "package.json files must include plugin.");
  assert(packageJson.publishConfig?.access === "public", failures, "package.json publishConfig.access must be public.");
  assert(packageJson.scripts?.check === "node ./scripts/check-plugin.mjs", failures, "package.json must expose the package check script.");
  assert(packageJson.scripts?.test, failures, "package.json must expose a test script.");
  assert(packageJson.scripts?.["pack:dry-run"], failures, "package.json must expose a pack:dry-run script.");

  return packageJson;
}

function checkManifest({ packageRoot, packageJson, failures }) {
  const pluginRoot = path.join(packageRoot, "plugin");
  const manifestPath = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  const manifest = readJson(manifestPath, failures);
  if (!manifest || !packageJson) {
    return;
  }

  assert(manifest.name === EXPECTED_PLUGIN_NAME, failures, `plugin.json name must be ${EXPECTED_PLUGIN_NAME}.`);
  assert(manifest.version === packageJson.version, failures, "plugin.json version must match package.json version.");
  assert(manifest.description?.includes("CALL-E"), failures, "plugin.json description must mention CALL-E.");
  assert(manifest.skills === "./skills/", failures, "plugin.json skills must be ./skills/.");
  assert(!Object.hasOwn(manifest, "mcpServers"), failures, "plugin.json must not declare mcpServers for the CLI-based Claude plugin.");
  assert(!Object.hasOwn(manifest, "commands"), failures, "plugin.json must not declare commands in v1.");
  assert(!Object.hasOwn(manifest, "agents"), failures, "plugin.json must not declare agents in v1.");
  assert(!Object.hasOwn(manifest, "hooks"), failures, "plugin.json must not declare hooks in v1.");
}

function checkNoMcp({ packageRoot, failures }) {
  const mcpPath = path.join(packageRoot, "plugin", ".mcp.json");
  assert(!fs.existsSync(mcpPath), failures, "plugin/.mcp.json must not exist for the CLI-based Claude plugin.");
}

function assertCliGuidance({ source, filePath, failures }) {
  assert(source.includes(`CALLE_SOURCE=${EXPECTED_CLI_SOURCE}`), failures, `${filePath} must include Claude CLI source attribution.`);
  assert(
    source.includes(`CALLE_INTEGRATION=${EXPECTED_CLI_INTEGRATION}`),
    failures,
    `${filePath} must include Claude CLI integration attribution.`,
  );
  assert(source.includes("node packages/cli/bin/calle.js"), failures, `${filePath} must document the repository-local CLI command.`);
  assert(source.includes("npx -y @call-e/cli"), failures, `${filePath} must document the pinned npx CLI fallback.`);
  assert(source.includes("auth status"), failures, `${filePath} must document auth status checks.`);
  assert(source.includes("Run blocking `auth login`"), failures, `${filePath} must document blocking authorization login.`);
  assert(
    source.includes("do not ask the user to reply"),
    failures,
    `${filePath} must document that browser authorization should continue without a manual chat reply.`,
  );
  assert(
    source.includes("assistant_hint.message"),
    failures,
    `${filePath} must document how to display assistant_hint.message after auth login.`,
  );
  assert(
    source.includes("Before we start, please complete authorization here"),
    failures,
    `${filePath} must include the first authorization help message.`,
  );
  assert(source.includes("Great, authorization is complete"), failures, `${filePath} must include the post-authorization success message.`);
  assert(source.includes("mcp tools"), failures, `${filePath} must document CLI tool discovery.`);
  assert(source.includes("call plan"), failures, `${filePath} must document call planning through the CLI.`);
  assert(source.includes("call run"), failures, `${filePath} must document planned call execution through the CLI.`);
  assert(source.includes("call status"), failures, `${filePath} must document call status polling through the CLI.`);
  assert(!source.includes("/mcp"), failures, `${filePath} must not direct users to /mcp for CALL-E authorization.`);
  assert(!source.includes("authorize the `calle` server"), failures, `${filePath} must not document native Claude MCP OAuth authorization.`);
}

function checkSkill({ packageRoot, failures }) {
  const skillDir = path.join(packageRoot, "plugin", "skills", EXPECTED_SKILL_NAME);
  const skillFile = path.join(skillDir, "SKILL.md");
  const referenceFile = path.join(skillDir, EXPECTED_REFERENCE_FILE);

  assert(fs.existsSync(skillDir), failures, `Missing skill directory: ${skillDir}`);
  assert(fs.existsSync(skillFile), failures, `Missing skill file: ${skillFile}`);
  assert(fs.existsSync(referenceFile), failures, `Missing command reference: ${referenceFile}`);

  if (!fs.existsSync(skillFile)) {
    return;
  }

  const source = fs.readFileSync(skillFile, "utf8");
  const frontmatter = extractFrontmatter(source);
  assert(frontmatter, failures, `${skillFile} must start with YAML frontmatter.`);
  assertCliGuidance({ source, filePath: skillFile, failures });

  assert(source.includes("plan_call"), failures, `${skillFile} must document plan_call usage.`);
  assert(source.includes("run_call"), failures, `${skillFile} must document run_call usage.`);
  assert(source.includes("get_call_run"), failures, `${skillFile} must document get_call_run polling.`);
  assert(source.includes("Always plan first"), failures, `${skillFile} must require plan-first behavior.`);
  assert(source.includes("Do not guess phone numbers"), failures, `${skillFile} must forbid guessing call inputs.`);
  assert(
    source.includes("Phone call is in progress! Progress:"),
    failures,
    `${skillFile} must document the non-terminal call activity progress template.`,
  );
  assert(source.includes("Poll every 10 seconds"), failures, `${skillFile} must document periodic polling.`);
  assert(source.includes("Do not stay silent until a"), failures, `${skillFile} must require user-visible progress updates before terminal status.`);
  assert(source.includes("[Status]"), failures, `${skillFile} must document the final status section.`);
  assert(source.includes("[Transcript]"), failures, `${skillFile} must document the final transcript section.`);

  if (fs.existsSync(referenceFile)) {
    const referenceSource = fs.readFileSync(referenceFile, "utf8");
    assertCliGuidance({ source: referenceSource, filePath: referenceFile, failures });
    assert(
      referenceSource.includes("Phone call is in progress! Progress:"),
      failures,
      `${referenceFile} must document the non-terminal call activity progress template.`,
    );
    assert(referenceSource.includes("Wait 10 seconds"), failures, `${referenceFile} must document the non-terminal call polling interval.`);
  }

  if (!frontmatter) {
    return;
  }

  assert(frontmatterValue(frontmatter, "name") === EXPECTED_SKILL_NAME, failures, `${skillFile} frontmatter name must be ${EXPECTED_SKILL_NAME}.`);
  assert(Boolean(frontmatterValue(frontmatter, "description")), failures, `${skillFile} frontmatter must include description.`);
}

function checkMarketplace({ repoRoot, packageJson, failures }) {
  const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
  const marketplace = readJson(marketplacePath, failures);
  if (!marketplace || !packageJson) {
    return;
  }

  assert(marketplace.name === EXPECTED_MARKETPLACE_NAME, failures, `marketplace name must be ${EXPECTED_MARKETPLACE_NAME}.`);
  assert(marketplace.owner?.name === "CALLE AI", failures, "marketplace owner.name must be CALLE AI.");
  assert(
    marketplace.metadata?.description?.includes("CALL-E"),
    failures,
    "marketplace metadata.description must mention CALL-E.",
  );

  const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = entries.find((plugin) => plugin?.name === EXPECTED_PLUGIN_NAME);
  assert(entry, failures, "marketplace must contain a calle plugin entry.");

  if (!entry) {
    return;
  }

  assert(entry.source === EXPECTED_MARKETPLACE_SOURCE, failures, `marketplace calle source must be ${EXPECTED_MARKETPLACE_SOURCE}.`);
  assert(entry.version === packageJson.version, failures, "marketplace calle version must match package.json version.");
  assert(entry.description?.includes("CALL-E"), failures, "marketplace calle description must mention CALL-E.");
  assert(entry.category === "Productivity", failures, "marketplace category must be Productivity.");

  const resolvedSourcePath = path.resolve(repoRoot, entry.source);
  assert(fs.existsSync(resolvedSourcePath), failures, `marketplace source path does not exist: ${resolvedSourcePath}`);
}

function checkDocs({ packageRoot, repoRoot, failures }) {
  const docFiles = [
    path.join(repoRoot, "docs", "install", "claude-plugin.md"),
    path.join(packageRoot, "README.md"),
    path.join(packageRoot, "plugin", "README.md"),
  ];

  for (const docFile of docFiles) {
    assert(fs.existsSync(docFile), failures, `Missing documentation file: ${docFile}`);
    if (!fs.existsSync(docFile)) {
      continue;
    }

    const source = fs.readFileSync(docFile, "utf8");
    assert(source.includes(EXPECTED_SKILL_INVOCATION), failures, `${docFile} must document ${EXPECTED_SKILL_INVOCATION}.`);
    assert(!source.includes(LEGACY_SKILL_INVOCATION), failures, `${docFile} must not document legacy ${LEGACY_SKILL_INVOCATION}.`);
    assert(!source.includes("authorize the `calle` server"), failures, `${docFile} must not document native Claude MCP OAuth authorization.`);
  }

  const installDoc = path.join(repoRoot, "docs", "install", "claude-plugin.md");
  if (fs.existsSync(installDoc)) {
    const source = fs.readFileSync(installDoc, "utf8");
    assert(source.includes("@call-e/claude-plugin@latest"), failures, "Claude install doc must use @call-e/claude-plugin@latest by default.");
    assert(source.includes("/plugin marketplace add"), failures, "Claude install doc must use the Claude Code slash-command marketplace install path.");
    assert(source.includes("/plugin install calle@call-e-claude"), failures, "Claude install doc must use the Claude Code slash-command plugin install path.");
    assert(source.includes("/reload-plugins"), failures, "Claude install doc must document /reload-plugins after plugin installation.");
    assert(!source.includes("claude plugin marketplace add"), failures, "Claude install doc must not use unavailable shell marketplace commands.");
    assert(!source.includes("claude plugin install"), failures, "Claude install doc must not use unavailable shell plugin install commands.");
    assert(!source.includes("--sparse"), failures, "Claude install doc must not use CLI-only --sparse options with slash commands.");
    assert(source.includes("calle auth login"), failures, "Claude install doc must document CLI authorization.");
    assert(source.includes("npx -y @call-e/cli"), failures, "Claude install doc must document the npx CLI fallback.");
  }
}

export function checkClaudePlugin({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const failures = [];
  const packageJson = checkPackage({ packageRoot, failures });

  checkManifest({ packageRoot, packageJson, failures });
  checkNoMcp({ packageRoot, failures });
  checkSkill({ packageRoot, failures });
  checkMarketplace({ repoRoot, packageJson, failures });
  checkDocs({ packageRoot, repoRoot, failures });

  return failures;
}

function main() {
  const failures = checkClaudePlugin();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  console.log("CALL-E Claude Code plugin metadata is valid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
