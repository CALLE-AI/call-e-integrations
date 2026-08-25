#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function displayPath(value) {
  return String(value).split(path.sep).join("/");
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");

const EXPECTED_PACKAGE_NAME = "@call-e/hermes-plugin";
const EXPECTED_PLUGIN_NAME = "calle";
const EXPECTED_SKILL_NAME = "calle";
const EXPECTED_CLI_SOURCE = "hermes";
const EXPECTED_CLI_INTEGRATION = "hermes_plugin";
const EXPECTED_REFERENCE_FILE = "references/commands.md";
const EXPECTED_MANIFEST_FILE = "plugin.yaml";

// Hermes registers tools; it does not load a skill from a plugin directory.
// These five are the whole agent-facing surface.
const EXPECTED_TOOLS = [
  "calle_auth",
  "calle_plan",
  "calle_run",
  "calle_status",
  "calle_show",
];

// Raw CLI verbs that must never appear as commands in agent-facing text.
// Documenting them as *unavailable* is expected and allowed, so these are
// matched as commands -- backticked or fenced -- not as bare substrings.
// "a call plan" is ordinary English and appears in both markdown files.
const FORBIDDEN_CLI_VERBS = ["call plan", "call run", "call start", "call status"];

function assert(condition, failures, message) {
  if (!condition) failures.push(message);
}

function readJson(filePath, failures) {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing ${displayPath(filePath)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`Invalid JSON at ${displayPath(filePath)}: ${error.message}`);
    return null;
  }
}

/** Minimal YAML reader for the flat manifest this plugin ships. */
function readManifest(filePath, failures) {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing ${displayPath(filePath)}`);
    return null;
  }
  const source = fs.readFileSync(filePath, "utf8");
  const manifest = { _raw: source, provides_tools: [] };
  let inList = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const listItem = /^\s+-\s+(.+?)\s*$/u.exec(rawLine);
    if (inList && listItem) {
      manifest[inList].push(listItem[1]);
      continue;
    }
    const scalar = /^([a-z_]+):\s*(.*)$/u.exec(rawLine);
    if (scalar) {
      const [, key, value] = scalar;
      if (value === "" || value === ">-" || value === "|") {
        inList = key;
        if (!manifest[key]) manifest[key] = [];
      } else {
        inList = null;
        manifest[key] = value.replace(/^["']|["']$/gu, "");
      }
    }
  }
  return manifest;
}

/** Does `verb` appear as a command rather than as prose? */
/** Python source with comments and docstrings removed.
 *
 * A rule and its violation look identical to a substring match: a docstring
 * saying "the confirm_token never appears in a tool result" contains the very
 * identifier being prohibited. Scan code, not prose about code.
 */
function pythonCodeOnly(source) {
  return source
    .replace(/"""[\s\S]*?"""/gu, '""')
    .replace(/'''[\s\S]*?'''/gu, "''")
    .replace(/^\s*#.*$/gmu, "");
}

function usesCliVerb(source, verb) {
  const escaped = verb.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const backticked = new RegExp("`(?:calle\\s+)?" + escaped + "\\b", "u");
  if (backticked.test(source)) return true;
  for (const block of source.match(/```[\s\S]*?```/gu) || []) {
    if (new RegExp("(?:^|\\n)\\s*(?:\\$\\s*)?(?:calle|npx[^\\n]*)?\\s*" + escaped + "\\b", "u").test(block)) {
      return true;
    }
  }
  return false;
}

function checkPackage({ packageRoot, failures }) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = readJson(packageJsonPath, failures);
  if (!packageJson) return null;

  assert(packageJson.name === EXPECTED_PACKAGE_NAME, failures, `package.json name must be ${EXPECTED_PACKAGE_NAME}.`);
  assert(packageJson.private !== true, failures, "package.json must keep the Hermes plugin package publishable.");
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
  const manifestPath = path.join(pluginRoot, EXPECTED_MANIFEST_FILE);
  const manifest = readManifest(manifestPath, failures);
  if (!manifest) return;

  assert(manifest.name === EXPECTED_PLUGIN_NAME, failures, `plugin.yaml name must be ${EXPECTED_PLUGIN_NAME}.`);
  assert(!manifest.name?.includes("/"), failures, "plugin.yaml name must not contain a slash; it becomes the install directory.");
  assert(manifest.version === packageJson?.version, failures, "plugin.yaml version must match package.json version.");
  assert(manifest.kind === "standalone", failures, "plugin.yaml kind must be standalone.");
  assert(/CALL-E/u.test(manifest._raw), failures, "plugin.yaml description must mention CALL-E.");

  // Omitted deliberately: the installer validates it only when present, and
  // declaring a version this package has not been tested against can only fail.
  assert(!/^manifest_version:/mu.test(manifest._raw), failures, "plugin.yaml must not declare manifest_version.");

  // Hermes has no marketplace registry; `hermes plugins install` resolves the
  // subdirectory from the identifier. A marketplace entry would have nothing
  // to register against.
  assert(!/mcp_servers?:/u.test(manifest._raw), failures, "plugin.yaml must not declare an MCP server for the CLI-based Hermes plugin.");

  const declared = manifest.provides_tools ?? [];
  for (const tool of EXPECTED_TOOLS) {
    assert(declared.includes(tool), failures, `plugin.yaml provides_tools must include ${tool}.`);
  }
  for (const tool of declared) {
    assert(EXPECTED_TOOLS.includes(tool), failures, `plugin.yaml declares unknown tool ${tool}.`);
  }

  // Everything the agent can reach must be registered here, and every name
  // registered must be declared. A drift either way is a tool the manifest
  // does not describe.
  const initPath = path.join(pluginRoot, "__init__.py");
  const toolsPath = path.join(pluginRoot, "tools.py");
  assert(fs.existsSync(initPath), failures, "plugin/__init__.py is required as the register(ctx) entry point.");
  assert(fs.existsSync(toolsPath), failures, "plugin/tools.py is required.");
  if (fs.existsSync(toolsPath)) {
    const toolsSource = fs.readFileSync(toolsPath, "utf8");
    const registered = new Set([...toolsSource.matchAll(/\("(calle_\w+)",/gu)].map((m) => m[1]));
    for (const tool of EXPECTED_TOOLS) {
      assert(registered.has(tool), failures, `tools.py does not register ${tool}.`);
    }
    for (const tool of registered) {
      assert(EXPECTED_TOOLS.includes(tool), failures, `tools.py registers undeclared tool ${tool}.`);
    }
  }
}

function assertAgentGuidance({ source, filePath, failures }) {
  assert(source.includes(`\`${EXPECTED_TOOLS[1]}\``) || source.includes(EXPECTED_TOOLS[1]), failures, `${displayPath(filePath)} must document ${EXPECTED_TOOLS[1]}.`);
  for (const tool of EXPECTED_TOOLS) {
    assert(source.includes(tool), failures, `${displayPath(filePath)} must document ${tool}.`);
  }

  // The agent reaches CALL-E through the plugin's tools and never through the
  // CLI. Documenting a raw verb hands it a path around the plan/run split.
  for (const verb of FORBIDDEN_CLI_VERBS) {
    if (!usesCliVerb(source, verb)) continue;
    // Naming a verb in order to say it is NOT available is exactly the
    // documentation we want. Only a line presenting it as usable fails.
    const linesUsing = source
      .split(/\r?\n/)
      .filter((line) => usesCliVerb(line, verb))
      .filter((line) => !/not exposed|not available|no code path|is not|never/iu.test(line));
    assert(linesUsing.length === 0, failures, `${displayPath(filePath)} must not present the raw CLI command \`${verb}\` as usable; the agent uses the plugin tools.`);
  }

  assert(!/\buser_input\b/u.test(source), failures, `${displayPath(filePath)} must not mention user_input.`);
  assert(source.includes("calle_auth"), failures, `${displayPath(filePath)} must document how to authorize.`);
  assert(/disclos/iu.test(source), failures, `${displayPath(filePath)} must document the disclosure behaviour on person calls.`);
}

function checkSkill({ packageRoot, failures }) {
  const skillDir = path.join(packageRoot, "plugin", "skills", EXPECTED_SKILL_NAME);
  const skillFile = path.join(skillDir, "SKILL.md");
  const referenceFile = path.join(skillDir, EXPECTED_REFERENCE_FILE);

  assert(fs.existsSync(skillDir), failures, `Missing skill directory: ${displayPath(skillDir)}`);
  assert(fs.existsSync(skillFile), failures, `Missing skill file: ${displayPath(skillFile)}`);
  assert(fs.existsSync(referenceFile), failures, `Missing command reference: ${displayPath(referenceFile)}`);
  if (!fs.existsSync(skillFile) || !fs.existsSync(referenceFile)) return;

  const source = fs.readFileSync(skillFile, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(source);
  assert(Boolean(frontmatter), failures, `${displayPath(skillFile)} must open with YAML frontmatter.`);
  if (frontmatter) {
    const nameLine = /^name:\s*(.+?)\s*$/mu.exec(frontmatter[1]);
    assert(nameLine?.[1] === EXPECTED_SKILL_NAME, failures, `${displayPath(skillFile)} frontmatter name must be ${EXPECTED_SKILL_NAME}.`);
  }

  // Hermes does not load a skill from a plugin directory. Saying so here keeps
  // a user from waiting for it to appear in `hermes skills list`.
  assert(/does not load|not appear in/iu.test(source), failures, `${displayPath(skillFile)} must state that it ships as documentation and does not load as a Hermes skill.`);

  assertAgentGuidance({ source, filePath: skillFile, failures });

  const referenceSource = fs.readFileSync(referenceFile, "utf8");
  assertAgentGuidance({ source: referenceSource, filePath: referenceFile, failures });

  assert(referenceSource.includes(`CALLE_SOURCE=${EXPECTED_CLI_SOURCE}`), failures, `${displayPath(referenceFile)} must include CLI source attribution.`);
  assert(referenceSource.includes(`CALLE_INTEGRATION=${EXPECTED_CLI_INTEGRATION}`), failures, `${displayPath(referenceFile)} must include CLI integration attribution.`);
  assert(referenceSource.includes("npx -y @call-e/cli"), failures, `${displayPath(referenceFile)} must document the npx CLI fallback.`);
}

function checkAdapter({ packageRoot, failures }) {
  const adapterPath = path.join(packageRoot, "plugin", "adapter.py");
  assert(fs.existsSync(adapterPath), failures, "plugin/adapter.py is required.");
  if (!fs.existsSync(adapterPath)) return;
  const source = pythonCodeOnly(fs.readFileSync(adapterPath, "utf8"));

  // `call start` plans and dials in one step without printing confirmation
  // data. Enforcement is by absence: no argv list may build it.
  assert(!/["']call["']\s*,\s*["']start["']/u.test(source), failures, "plugin/adapter.py must not build a `call start` invocation.");
  assert(!/\buser_input\b/u.test(source), failures, "plugin/adapter.py must not reference user_input.");

  // The call authorization is a spend credential valid for about a day and
  // cannot be revoked early. It stays on disk and out of any tool result.
  assert(/confirm_token/u.test(source), failures, "plugin/adapter.py should handle confirm_token explicitly.");
  // Redaction is what keeps the credential out of the recorded argv.
  assert(/_redact_argv/u.test(source), failures, "plugin/adapter.py must redact the confirm token from recorded argv.");

  // The pre-dial approval gate is the package's central safety property and
  // is one line in __init__.py. Assert it is still wired, in both files.
  const initPath = path.join(packageRoot, "plugin", "__init__.py");
  if (fs.existsSync(initPath)) {
    const initCode = pythonCodeOnly(fs.readFileSync(initPath, "utf8"));
    assert(
      /register_hook\(\s*["']pre_tool_call["']/u.test(initCode),
      failures,
      "plugin/__init__.py must register the pre_tool_call approval hook.",
    );
  }

  const handlerTestPath = path.join(packageRoot, "plugin", "test_handlers.py");
  assert(
    fs.existsSync(handlerTestPath),
    failures,
    "plugin/test_handlers.py is required: the handlers must be executed by a test, not only inspected.",
  );

  const toolsPath = path.join(packageRoot, "plugin", "tools.py");
  if (fs.existsSync(toolsPath)) {
    const toolsCode = pythonCodeOnly(fs.readFileSync(toolsPath, "utf8"));
    assert(!/confirm_token/u.test(toolsCode), failures, "plugin/tools.py must not touch confirm_token; it never leaves the adapter's local state.");
    assert(!/cache_path|expires_at/u.test(toolsCode), failures, "plugin/tools.py must not surface cache_path or expires_at.");
    assert(
      /def pre_tool_call/u.test(toolsCode),
      failures,
      "plugin/tools.py must define the pre_tool_call approval hook.",
    );
    assert(
      /["']action["']\s*:\s*["']approve["']/u.test(toolsCode),
      failures,
      "plugin/tools.py pre_tool_call must escalate calle_run to the human-approval gate.",
    );
    // Every attribute the adapter reads must be declared here. This is the
    // defect that shipped: tools.py built an args object the adapter then
    // read a missing field from -- AFTER the call had been placed.
    assert(
      /_VERB_ARGS/u.test(toolsCode) && /_assert_contract\(\)/u.test(toolsCode),
      failures,
      "plugin/tools.py must declare _VERB_ARGS and check it against the adapter at import.",
    );
  }
}

function main() {
  const failures = [];
  const packageRoot = DEFAULT_PACKAGE_ROOT;
  const packageJson = checkPackage({ packageRoot, failures });
  checkManifest({ packageRoot, packageJson, failures });
  checkSkill({ packageRoot, failures });
  checkAdapter({ packageRoot, failures });

  if (failures.length > 0) {
    console.error(`check-plugin: ${failures.length} problem(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("check-plugin: ok");
}

main();
