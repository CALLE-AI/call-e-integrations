import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_PACKAGE_ROOT, "../..");

const EXPECTED_PLUGIN_NAME = "calle";
const EXPECTED_SKILLS = ["calle"];

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

function checkSkill({ skillName, skillDir, failures }) {
  const skillFile = path.join(skillDir, "SKILL.md");
  const skillInterfaceFile = path.join(skillDir, "agents", "openai.yaml");
  const referenceFile = path.join(skillDir, "references", "commands.md");

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

  if (!frontmatter) {
    return;
  }

  const nameMatch = /^name:\s*([^\n]+)\s*$/mu.exec(frontmatter);
  const descriptionMatch = /^description:\s*/mu.exec(frontmatter);
  const declaredName = nameMatch?.[1]?.trim().replace(/^['"]|['"]$/g, "");

  assert(declaredName === skillName, failures, `${skillFile} frontmatter name must be "${skillName}".`);
  assert(descriptionMatch, failures, `${skillFile} frontmatter must include description.`);

  if (fs.existsSync(skillInterfaceFile)) {
    const skillInterfaceSource = fs.readFileSync(skillInterfaceFile, "utf8");
    assert(
      /display_name:\s*"Calle"/u.test(skillInterfaceSource),
      failures,
      `${skillInterfaceFile} must set interface.display_name to "Calle".`,
    );
  }
}

function checkManifest({ packageRoot, failures }) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const pluginRoot = path.join(packageRoot, "plugin");
  const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const packageJson = readJson(packageJsonPath, failures);
  const manifest = readJson(manifestPath, failures);

  if (!packageJson || !manifest) {
    return;
  }

  assert(packageJson.name === "@call-e/codex-plugin", failures, "package.json name must be @call-e/codex-plugin.");
  assert(packageJson.version === manifest.version, failures, "plugin.json version must match package.json version.");
  assert(packageJson.files?.includes("README.md"), failures, "package.json files must include README.md.");
  assert(packageJson.files?.includes("plugin"), failures, "package.json files must include plugin.");

  assert(manifest.name === EXPECTED_PLUGIN_NAME, failures, `plugin.json name must be ${EXPECTED_PLUGIN_NAME}.`);
  assert(manifest.skills === "./skills/", failures, "plugin.json skills must be ./skills/.");
  assert(!Object.hasOwn(manifest, "mcpServers"), failures, "plugin.json must not declare mcpServers in v1.");
  assert(!fs.existsSync(path.join(pluginRoot, ".mcp.json")), failures, "plugin/.mcp.json must not exist in v1.");
  assert(manifest.interface?.displayName === "Calle", failures, "plugin displayName must be Calle.");
}

function checkMarketplace({ repoRoot, failures }) {
  const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
  const marketplace = readJson(marketplacePath, failures);
  if (!marketplace) {
    return;
  }

  assert(marketplace.name === "call-e-codex", failures, "marketplace name must be call-e-codex.");
  assert(
    marketplace.interface?.displayName === "Call-E",
    failures,
    "marketplace displayName must be Call-E.",
  );

  const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = entries.find((plugin) => plugin?.name === EXPECTED_PLUGIN_NAME);
  assert(entry, failures, "marketplace must contain a calle plugin entry.");

  if (!entry) {
    return;
  }

  assert(entry.source?.source === "local", failures, "marketplace calle source must be local.");
  assert(
    entry.source?.path === "./packages/codex-plugin/plugin",
    failures,
    "marketplace calle source path must be ./packages/codex-plugin/plugin.",
  );
  assert(entry.policy?.installation === "AVAILABLE", failures, "marketplace installation policy must be AVAILABLE.");
  assert(entry.policy?.authentication === "ON_USE", failures, "marketplace authentication policy must be ON_USE.");
  assert(entry.category === "Productivity", failures, "marketplace category must be Productivity.");

  const sourcePath = entry.source?.path;
  if (typeof sourcePath === "string") {
    const resolvedSourcePath = path.resolve(repoRoot, sourcePath);
    assert(fs.existsSync(resolvedSourcePath), failures, `marketplace source path does not exist: ${resolvedSourcePath}`);
  }
}

export function checkCodexPlugin({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const failures = [];
  const pluginRoot = path.join(packageRoot, "plugin");
  const skillsRoot = path.join(pluginRoot, "skills");

  checkManifest({ packageRoot, failures });

  for (const skillName of EXPECTED_SKILLS) {
    checkSkill({
      skillName,
      skillDir: path.join(skillsRoot, skillName),
      failures,
    });
  }

  checkMarketplace({ repoRoot, failures });
  return failures;
}

function main() {
  const failures = checkCodexPlugin();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  console.log("Call-E Codex plugin metadata is valid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
