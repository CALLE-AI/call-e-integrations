import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkCursorPlugin } from "../scripts/check-plugin.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const VERSION = "0.1.0";
const REMOTE_MCP_URL = "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth";
const VALID_CALL_GUIDANCE =
  "Prefer the Cursor MCP tools when available.\n\n" +
  "Use plan_call, run_call, and get_call_run.\n\n" +
  "Always use plan_call before run_call.\n\n" +
  "Only call run_call when the user clearly intends to place the call.\n\n" +
  "Preserve plan_id and confirm_token exactly.\n\n" +
  "Do not guess phone numbers, country codes, language, region, plan_id, confirm_token, or run_id.\n\n" +
  "Do not expose OAuth tokens, bearer tokens, authorization codes, callback URLs, refresh tokens, or access tokens.\n\n" +
  "Do not configure CALL-E run_call for auto-run.\n\n" +
  "wait 60 seconds before the first `get_call_run`.\n\n";
function validCliGuidance(version = VERSION) {
  return (
    "CALLE_SOURCE=cursor CALLE_INTEGRATION=cursor_plugin CALLE_INTEGRATION_VERSION=" + version + "\n\n" +
    "node packages/cli/bin/calle.js\n\n" +
    "npx -y @call-e/cli\n\n" +
    "auth status\n\n" +
    "mcp tools\n\n" +
    "call plan\n\n" +
    "call run\n\n" +
    "call status\n\n"
  );
}
function validSkill(version = VERSION) {
  return `---
name: calle
description: Use CALL-E from Cursor for setup checks, authentication recovery, phone call planning, planned call execution, and call status checks.
---

# CALL-E For Cursor

${VALID_CALL_GUIDANCE}${validCliGuidance(version)}
`;
}
const VALID_RULE = `---
description: "CALL-E real phone call safety rules."
alwaysApply: true
---

CALL-E can place real outbound phone calls.

- Always use plan_call before run_call.
- Only use run_call when the user clearly intends to place the call.
- Preserve returned plan_id and confirm_token exactly.
- Never guess phone numbers, country codes, language, region, plan_id, confirm_token, or run_id.
- Never print, request, or expose OAuth tokens, bearer tokens, authorization codes, callback URLs, refresh tokens, or access tokens.
- Do not configure CALL-E run_call for auto-run.
`;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(filePath, source) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
}

function makeTempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function createValidFixture(root, { version = VERSION } = {}) {
  const packageRoot = path.join(root, "packages", "cursor-plugin");
  const repoRoot = root;

  writeJson(path.join(packageRoot, "package.json"), {
    name: "@call-e/cursor-plugin",
    version,
    type: "module",
    license: "MIT",
    files: ["README.md", "plugin"],
    publishConfig: {
      access: "public",
    },
    scripts: {
      check: "node ./scripts/check-plugin.mjs",
      test: "node --test ./test/*.test.js",
      "pack:dry-run": "npm pack --dry-run",
    },
  });

  writeJson(path.join(packageRoot, "plugin", ".cursor-plugin", "plugin.json"), {
    name: "calle",
    displayName: "CALL-E",
    version,
    description: "Use CALL-E from Cursor through MCP, the calle CLI, and safety-aware agent skills.",
    author: {
      name: "CALLE AI",
    },
    license: "MIT",
    category: "Productivity",
    tags: ["call-e"],
    skills: "./skills/",
    rules: "./rules/",
    mcpServers: "./mcp.json",
  });

  writeJson(path.join(packageRoot, "plugin", "mcp.json"), {
    mcpServers: {
      calle: {
        url: REMOTE_MCP_URL,
      },
    },
  });

  writeFile(path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"), validSkill(version));
  writeFile(path.join(packageRoot, "plugin", "skills", "calle", "references", "commands.md"), validSkill(version));
  writeFile(path.join(packageRoot, "plugin", "rules", "call-e-safety.mdc"), VALID_RULE);

  const doc = `${REMOTE_MCP_URL}\nplan_call\nrun_call\nget_call_run\nreal outbound\nauto-run\n`;
  writeFile(path.join(packageRoot, "README.md"), doc);
  writeFile(path.join(packageRoot, "plugin", "README.md"), doc);
  writeFile(path.join(repoRoot, "docs", "install", "cursor.md"), doc);
  writeFile(path.join(repoRoot, "docs", "install", "cursor-plugin.md"), doc);

  writeJson(path.join(repoRoot, ".cursor-plugin", "marketplace.json"), {
    name: "call-e-cursor",
    owner: {
      name: "CALLE AI",
    },
    metadata: {
      description: "CALL-E plugins for Cursor.",
    },
    plugins: [
      {
        name: "calle",
        source: "./packages/cursor-plugin/plugin",
        description: "Use CALL-E phone call workflows from Cursor with MCP, skills, and safety rules.",
      },
    ],
  });

  return { packageRoot, repoRoot };
}

test("current Cursor plugin metadata is valid", () => {
  assert.deepEqual(checkCursorPlugin({ packageRoot: PACKAGE_ROOT, repoRoot: REPO_ROOT }), []);
});

test("accepts release-bumped package versions", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-release-version"), {
    version: "0.1.1",
  });

  assert.deepEqual(checkCursorPlugin({ packageRoot, repoRoot }), []);
});

test("reports a missing plugin manifest", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-missing-manifest"));
  fs.rmSync(path.join(packageRoot, "plugin", ".cursor-plugin", "plugin.json"));

  const failures = checkCursorPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("plugin.json")));
});

test("reports wrong remote MCP URL", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-wrong-mcp-url"));
  writeJson(path.join(packageRoot, "plugin", "mcp.json"), {
    mcpServers: {
      calle: {
        url: "https://example.test/mcp",
      },
    },
  });

  const failures = checkCursorPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("calle URL")));
});

test("reports a local MCP command config", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-local-mcp-command"));
  writeJson(path.join(packageRoot, "plugin", "mcp.json"), {
    mcpServers: {
      calle: {
        url: REMOTE_MCP_URL,
        command: "node",
      },
    },
  });

  const failures = checkCursorPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("remote MCP URL")));
});

test("reports missing skill safety guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-missing-skill-guidance"));
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Use CALL-E from Cursor for setup checks, authentication recovery, phone call planning, planned call execution, and call status checks.\n---\n\n# Skill\n\n${validCliGuidance()}`,
  );

  const failures = checkCursorPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("plan_call before run_call")));
  assert.ok(failures.some((failure) => failure.includes("explicit user intent")));
});

test("reports missing rule alwaysApply", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-missing-rule-always"));
  writeFile(
    path.join(packageRoot, "plugin", "rules", "call-e-safety.mdc"),
    VALID_RULE.replace("alwaysApply: true", "alwaysApply: false"),
  );

  const failures = checkCursorPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("alwaysApply: true")));
});

test("reports wrong marketplace source path", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-bad-marketplace"));
  const marketplacePath = path.join(repoRoot, ".cursor-plugin", "marketplace.json");
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  marketplace.plugins[0].source = "./wrong/path";
  writeJson(marketplacePath, marketplace);

  const failures = checkCursorPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("marketplace calle source")));
});

test("reports missing docs warning against auto-run", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-cursor-plugin-doc-warning"));
  writeFile(
    path.join(repoRoot, "docs", "install", "cursor.md"),
    `${REMOTE_MCP_URL}\nplan_call\nrun_call\nget_call_run\nreal outbound\n`,
  );

  const failures = checkCursorPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("auto-run")));
});
