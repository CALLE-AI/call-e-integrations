import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_PACKAGE_ROOT, "../..");

const EXPECTED_PACKAGE_NAME = "@call-e/cursor-plugin";
const EXPECTED_MARKETPLACE_NAME = "call-e-cursor";
const EXPECTED_MARKETPLACE_SOURCE = "./packages/cursor-plugin/plugin";
const EXPECTED_PLUGIN_NAME = "calle";
const EXPECTED_DISPLAY_NAME = "CALL-E";
const EXPECTED_SKILL_NAME = "calle";
const EXPECTED_REMOTE_MCP_URL = "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth";
const EXPECTED_CLI_SOURCE = "cursor";
const EXPECTED_CLI_INTEGRATION = "cursor_plugin";
const EXPECTED_REFERENCE_FILE = "references/commands.md";
const EXPECTED_MARKETPLACE_DESCRIPTION =
  "Use CALL-E phone call workflows from Cursor with MCP, skills, and safety rules.";
const CURSOR_PLUGIN_MANIFEST_KEYS = new Set([
  "name",
  "displayName",
  "description",
  "version",
  "author",
  "publisher",
  "homepage",
  "repository",
  "license",
  "logo",
  "keywords",
  "category",
  "tags",
  "commands",
  "agents",
  "skills",
  "rules",
  "hooks",
  "mcpServers",
]);
const CURSOR_AUTHOR_KEYS = new Set(["name", "email"]);
const CURSOR_MARKETPLACE_KEYS = new Set(["name", "owner", "metadata", "plugins"]);
const CURSOR_MARKETPLACE_OWNER_KEYS = new Set(["name", "email"]);
const CURSOR_MARKETPLACE_ENTRY_KEYS = new Set(["name", "source", "description"]);

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

function assertAllowedKeys(value, allowedKeys, failures, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const key of Object.keys(value)) {
    assert(allowedKeys.has(key), failures, `${label} contains unsupported Cursor manifest field: ${key}.`);
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

  assert(packageJson.name === EXPECTED_PACKAGE_NAME, failures, "package.json name must be @call-e/cursor-plugin.");
  assert(typeof packageJson.version === "string" && packageJson.version.length > 0, failures, "package.json must include a version.");
  assert(packageJson.type === "module", failures, "package.json type must be module.");
  assert(packageJson.license === "MIT", failures, "package.json license must be MIT.");
  assert(packageJson.private !== true, failures, "package.json must keep the Cursor plugin package publishable.");
  assert(packageJson.files?.includes("README.md"), failures, "package.json files must include README.md.");
  assert(packageJson.files?.includes("plugin"), failures, "package.json files must include plugin.");
  assert(packageJson.publishConfig?.access === "public", failures, "package.json publishConfig.access must be public.");
  assert(packageJson.scripts?.check === "node ./scripts/check-plugin.mjs", failures, "package.json must expose the package check script.");
  assert(packageJson.scripts?.test === "node --test ./test/*.test.js", failures, "package.json must expose the package test script.");
  assert(packageJson.scripts?.["pack:dry-run"] === "npm pack --dry-run", failures, "package.json must expose a pack:dry-run script.");

  return packageJson;
}

function checkManifest({ packageRoot, packageJson, failures }) {
  const pluginRoot = path.join(packageRoot, "plugin");
  const manifestPath = path.join(pluginRoot, ".cursor-plugin", "plugin.json");
  const manifest = readJson(manifestPath, failures);
  if (!manifest || !packageJson) {
    return;
  }

  assertAllowedKeys(manifest, CURSOR_PLUGIN_MANIFEST_KEYS, failures, "plugin.json");
  assertAllowedKeys(manifest.author, CURSOR_AUTHOR_KEYS, failures, "plugin.json author");
  assert(manifest.name === EXPECTED_PLUGIN_NAME, failures, `plugin.json name must be ${EXPECTED_PLUGIN_NAME}.`);
  assert(manifest.displayName === EXPECTED_DISPLAY_NAME, failures, `plugin.json displayName must be ${EXPECTED_DISPLAY_NAME}.`);
  assert(manifest.version === packageJson.version, failures, "plugin.json version must match package.json version.");
  assert(manifest.description === "Use CALL-E from Cursor through MCP, the calle CLI, and safety-aware agent skills.", failures, "plugin.json description must match the Cursor plugin description.");
  assert(manifest.skills === "./skills/", failures, "plugin.json skills must be ./skills/.");
  assert(manifest.rules === "./rules/", failures, "plugin.json rules must be ./rules/.");
  assert(manifest.mcpServers === "./mcp.json", failures, "plugin.json mcpServers must be ./mcp.json.");
  assert(manifest.license === "MIT", failures, "plugin.json license must be MIT.");
  assert(manifest.category === "Productivity", failures, "plugin.json category must be Productivity.");
  assert(Array.isArray(manifest.tags) && manifest.tags.includes("call-e"), failures, "plugin.json tags must include call-e.");
}

function checkMcpConfig({ packageRoot, failures }) {
  const mcpPath = path.join(packageRoot, "plugin", "mcp.json");
  const mcp = readJson(mcpPath, failures);
  if (!mcp) {
    return;
  }

  assert(mcp.mcpServers?.calle, failures, "plugin/mcp.json must contain mcpServers.calle.");
  assert(
    mcp.mcpServers?.calle?.url === EXPECTED_REMOTE_MCP_URL,
    failures,
    `plugin/mcp.json calle URL must be ${EXPECTED_REMOTE_MCP_URL}.`,
  );
  assert(!Object.hasOwn(mcp.mcpServers?.calle ?? {}, "command"), failures, "plugin/mcp.json must use the remote MCP URL, not a local command.");
}

function assertCliGuidance({ source, filePath, packageJson, failures }) {
  assert(source.includes(`CALLE_SOURCE=${EXPECTED_CLI_SOURCE}`), failures, `${filePath} must include Cursor CLI source attribution.`);
  assert(
    source.includes(`CALLE_INTEGRATION=${EXPECTED_CLI_INTEGRATION}`),
    failures,
    `${filePath} must include Cursor CLI integration attribution.`,
  );
  assert(
    source.includes(`CALLE_INTEGRATION_VERSION=${packageJson.version}`),
    failures,
    `${filePath} must include Cursor CLI integration version ${packageJson.version}.`,
  );
  assert(source.includes("node packages/cli/bin/calle.js"), failures, `${filePath} must document the repository-local CLI command.`);
  assert(source.includes("npx -y @call-e/cli"), failures, `${filePath} must document the npx CLI fallback.`);
  assert(source.includes("auth status"), failures, `${filePath} must document auth status checks.`);
  assert(source.includes("mcp tools"), failures, `${filePath} must document CLI tool discovery.`);
  assert(source.includes("call plan"), failures, `${filePath} must document call planning through the CLI.`);
  assert(source.includes("call run"), failures, `${filePath} must document planned call execution through the CLI.`);
  assert(source.includes("call status"), failures, `${filePath} must document call status polling through the CLI.`);
}

function assertCallGuidance({ source, filePath, failures }) {
  assert(source.includes("plan_call"), failures, `${filePath} must document plan_call usage.`);
  assert(source.includes("run_call"), failures, `${filePath} must document run_call usage.`);
  assert(source.includes("get_call_run"), failures, `${filePath} must document get_call_run polling.`);
  assert(source.includes("Always use plan_call before run_call."), failures, `${filePath} must require plan_call before run_call.`);
  assert(
    source.includes("Only call run_call when the user clearly intends to place the call."),
    failures,
    `${filePath} must require explicit user intent before run_call.`,
  );
  assert(source.includes("Preserve plan_id and confirm_token exactly."), failures, `${filePath} must require exact plan credential preservation.`);
  assert(source.includes("Do not guess phone numbers"), failures, `${filePath} must forbid guessing call inputs.`);
  assert(source.includes("Do not expose OAuth tokens"), failures, `${filePath} must forbid exposing auth secrets.`);
  assert(source.includes("Do not configure CALL-E run_call for auto-run."), failures, `${filePath} must forbid run_call auto-run configuration.`);
}

function checkSkill({ packageRoot, packageJson, failures }) {
  const skillDir = path.join(packageRoot, "plugin", "skills", EXPECTED_SKILL_NAME);
  const skillFile = path.join(skillDir, "SKILL.md");
  const referenceFile = path.join(skillDir, EXPECTED_REFERENCE_FILE);

  assert(fs.existsSync(skillDir), failures, `Missing skill directory: ${skillDir}`);
  assert(fs.existsSync(skillFile), failures, `Missing skill file: ${skillFile}`);
  assert(fs.existsSync(referenceFile), failures, `Missing command reference: ${referenceFile}`);

  if (!fs.existsSync(skillFile) || !packageJson) {
    return;
  }

  const source = fs.readFileSync(skillFile, "utf8");
  const frontmatter = extractFrontmatter(source);
  assert(frontmatter, failures, `${skillFile} must start with YAML frontmatter.`);
  assertCallGuidance({ source, filePath: skillFile, failures });
  assertCliGuidance({ source, filePath: skillFile, packageJson, failures });
  assert(source.includes("Prefer the Cursor MCP tools"), failures, `${skillFile} must prefer Cursor MCP tools when available.`);
  assert(
    source.includes("wait 60 seconds before the first `get_call_run`"),
    failures,
    `${skillFile} must document the first direct MCP status wait.`,
  );

  if (fs.existsSync(referenceFile)) {
    const referenceSource = fs.readFileSync(referenceFile, "utf8");
    assertCallGuidance({ source: referenceSource, filePath: referenceFile, failures });
    assertCliGuidance({ source: referenceSource, filePath: referenceFile, packageJson, failures });
  }

  if (!frontmatter) {
    return;
  }

  assert(frontmatterValue(frontmatter, "name") === EXPECTED_SKILL_NAME, failures, `${skillFile} frontmatter name must be ${EXPECTED_SKILL_NAME}.`);
  assert(
    frontmatterValue(frontmatter, "description") ===
      "Use CALL-E from Cursor for setup checks, authentication recovery, phone call planning, planned call execution, and call status checks.",
    failures,
    `${skillFile} frontmatter description must match the Cursor skill description.`,
  );
}

function checkRule({ packageRoot, failures }) {
  const rulePath = path.join(packageRoot, "plugin", "rules", "call-e-safety.mdc");
  assert(fs.existsSync(rulePath), failures, `Missing safety rule: ${rulePath}`);
  if (!fs.existsSync(rulePath)) {
    return;
  }

  const source = fs.readFileSync(rulePath, "utf8");
  const frontmatter = extractFrontmatter(source);
  assert(frontmatter, failures, `${rulePath} must start with YAML frontmatter.`);
  assert(frontmatter?.includes('description: "CALL-E real phone call safety rules."'), failures, `${rulePath} must include the safety rule description.`);
  assert(frontmatter?.includes("alwaysApply: true"), failures, `${rulePath} must contain alwaysApply: true.`);
  assert(source.includes("CALL-E can place real outbound phone calls."), failures, `${rulePath} must warn that CALL-E can place real outbound calls.`);
  assert(source.includes("Always use plan_call before run_call."), failures, `${rulePath} must require plan_call before run_call.`);
  assert(source.includes("Only use run_call when the user clearly intends to place the call."), failures, `${rulePath} must require explicit user intent before run_call.`);
  assert(source.includes("Preserve returned plan_id and confirm_token exactly."), failures, `${rulePath} must require exact returned credential preservation.`);
  assert(source.includes("Never guess phone numbers"), failures, `${rulePath} must forbid guessing call inputs.`);
  assert(source.includes("Never print, request, or expose OAuth tokens"), failures, `${rulePath} must forbid exposing auth secrets.`);
  assert(source.includes("Do not configure CALL-E run_call for auto-run."), failures, `${rulePath} must forbid run_call auto-run configuration.`);
}

function checkMarketplace({ repoRoot, packageJson, failures }) {
  const marketplacePath = path.join(repoRoot, ".cursor-plugin", "marketplace.json");
  const marketplace = readJson(marketplacePath, failures);
  if (!marketplace || !packageJson) {
    return;
  }

  assertAllowedKeys(marketplace, CURSOR_MARKETPLACE_KEYS, failures, "marketplace.json");
  assertAllowedKeys(marketplace.owner, CURSOR_MARKETPLACE_OWNER_KEYS, failures, "marketplace.json owner");
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

  assertAllowedKeys(entry, CURSOR_MARKETPLACE_ENTRY_KEYS, failures, "marketplace calle entry");
  assert(entry.source === EXPECTED_MARKETPLACE_SOURCE, failures, `marketplace calle source must be ${EXPECTED_MARKETPLACE_SOURCE}.`);
  assert(entry.description === EXPECTED_MARKETPLACE_DESCRIPTION, failures, "marketplace calle description must match the Cursor plugin description.");

  const resolvedSourcePath = path.resolve(repoRoot, entry.source);
  assert(fs.existsSync(resolvedSourcePath), failures, `marketplace source path does not exist: ${resolvedSourcePath}`);
}

function checkDocs({ packageRoot, repoRoot, failures }) {
  const docFiles = [
    path.join(repoRoot, "docs", "install", "cursor.md"),
    path.join(repoRoot, "docs", "install", "cursor-plugin.md"),
    path.join(packageRoot, "README.md"),
    path.join(packageRoot, "plugin", "README.md"),
  ];

  for (const docFile of docFiles) {
    assert(fs.existsSync(docFile), failures, `Missing documentation file: ${docFile}`);
    if (!fs.existsSync(docFile)) {
      continue;
    }

    const source = fs.readFileSync(docFile, "utf8");
    assert(source.includes(EXPECTED_REMOTE_MCP_URL), failures, `${docFile} must document the CALL-E remote MCP URL.`);
    assert(source.includes("plan_call"), failures, `${docFile} must mention plan_call.`);
    assert(source.includes("run_call"), failures, `${docFile} must mention run_call.`);
    assert(source.includes("get_call_run"), failures, `${docFile} must mention get_call_run.`);
    assert(source.includes("real outbound"), failures, `${docFile} must warn that run_call places real outbound calls.`);
    assert(source.includes("auto-run"), failures, `${docFile} must warn against configuring run_call for auto-run.`);
  }
}

export function checkCursorPlugin({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const failures = [];
  const packageJson = checkPackage({ packageRoot, failures });

  checkManifest({ packageRoot, packageJson, failures });
  checkMcpConfig({ packageRoot, failures });
  checkSkill({ packageRoot, packageJson, failures });
  checkRule({ packageRoot, failures });
  checkMarketplace({ repoRoot, packageJson, failures });
  checkDocs({ packageRoot, repoRoot, failures });

  return failures;
}

function main() {
  const failures = checkCursorPlugin();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  console.log("CALL-E Cursor plugin metadata is valid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
