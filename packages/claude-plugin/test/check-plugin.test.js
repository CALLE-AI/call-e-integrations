import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkClaudePlugin } from "../scripts/check-plugin.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const VERSION = "0.0.0";
const VALID_AUTH_GUIDANCE =
  "CALLE_SOURCE=claude CALLE_INTEGRATION=claude_code_plugin CALLE_INTEGRATION_VERSION=0.0.0\n\n" +
  "auth status\n\n" +
  "mcp tools\n\n" +
  "call plan\n\n" +
  "call run\n\n" +
  "call status\n\n" +
  "Use assistant_hint.message to include a brief post-auth help note after auth login.\n\n" +
  "Run blocking `auth login` and keep the command running until it exits.\n\n" +
  "do not ask the user to reply after browser authorization.\n\n" +
  "Before we start, please complete authorization here\n\n" +
  "Great, authorization is complete\n\n";
const VALID_PROGRESS_GUIDANCE =
  "Use plan_call, run_call, and get_call_run through the calle CLI.\n\n" +
  "Always plan first.\n\n" +
  "Do not guess phone numbers, country codes, language, region, plan_id, confirm_token, or run_id.\n\n" +
  "Phone call is in progress! Progress:\n\n" +
  "Do not stay silent until a terminal status.\n\n" +
  "Poll every 10 seconds.\n\n" +
  "Wait 10 seconds.\n\n" +
  "[Status]\n\n" +
  "[Transcript]\n";
const VALID_CLI_SELECTION_GUIDANCE = [
  "Do not run bare `calle` or use `npx` to select the CLI.",
  "Stop before authentication if either check fails.",
  "Reuse the verified entry point for every command.",
  "[Entry-point checks](references/commands.md#verify-the-cli-entry-point)",
  "`package.json`: `name` must be `@call-e/cli` and `bin.calle` must be `./bin/calle.js`.",
  "Resolve to an absolute path and run help without credentials or call arguments.",
  'node "$CALLE_CLI_ENTRY" auth login --help',
  'node "$CALLE_CLI_ENTRY" call plan --help',
  'node "$CALLE_CLI_ENTRY" call run --help',
  'node "$CALLE_CLI_ENTRY" call recover --help',
].join("\n") + "\n";

const VALID_RECOVERY_GUIDANCE =
  'When `call_started: "unknown"` and `retry_safe: false`, preserve `recovery_id` and `next_command`.\n' +
  "Use call recover --recovery-id with the original local recovery record.\n" +
  "Do not create a new plan or repeat `call start` or `call run`.\n" +
  "Do not loop `call recover`.\n" +
  "Keep `recovery_id` and the recovery command out of user-visible replies and shared logs.\n";
const VALID_SKILL = `---
name: calle
description: Test CALL-E phone call skill.
---

# CALL-E Phone Call

${VALID_AUTH_GUIDANCE}${VALID_PROGRESS_GUIDANCE}${VALID_CLI_SELECTION_GUIDANCE}${VALID_RECOVERY_GUIDANCE}
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

function createValidFixture(root) {
  const packageRoot = path.join(root, "packages", "claude-plugin");
  const repoRoot = root;

  writeJson(path.join(packageRoot, "package.json"), {
    name: "@call-e/claude-plugin",
    version: VERSION,
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

  writeJson(path.join(packageRoot, "plugin", ".claude-plugin", "plugin.json"), {
    name: "calle",
    version: VERSION,
    description: "Use CALL-E from Claude Code through the calle CLI.",
    skills: "./skills/",
  });

  writeFile(path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"), VALID_SKILL);
  writeFile(path.join(packageRoot, "plugin", "skills", "calle", "references", "commands.md"), VALID_SKILL);
  writeFile(path.join(packageRoot, "README.md"), "# Claude\n\n/calle:calle\n\ncalle auth login\n");
  writeFile(path.join(packageRoot, "plugin", "README.md"), "# Claude plugin\n\n/calle:calle\n\ncalle auth login\n");
  writeFile(
    path.join(repoRoot, "docs", "install", "claude-plugin.md"),
    "# Install\n\n/plugin marketplace add https://example.test/repo.git#@call-e/claude-plugin@latest\n/plugin install calle@call-e-claude\n/reload-plugins\n/calle:calle\nnode \"$CALLE_CLI_ENTRY\" auth login\ncli-reference.md#selecting-the-cli-entry-point\n",
  );

  writeJson(path.join(repoRoot, ".claude-plugin", "marketplace.json"), {
    name: "call-e-claude",
    owner: {
      name: "CALLE AI",
    },
    metadata: {
      description: "CALL-E plugins for Claude Code.",
    },
    plugins: [
      {
        name: "calle",
        source: "./packages/claude-plugin/plugin",
        description: "Use CALL-E from Claude Code.",
        version: VERSION,
        category: "Productivity",
      },
    ],
  });

  return { packageRoot, repoRoot };
}

test("current Claude Code plugin metadata is valid", () => {
  assert.deepEqual(checkClaudePlugin({ packageRoot: PACKAGE_ROOT, repoRoot: REPO_ROOT }), []);
});

test("reports a missing plugin manifest", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-missing-manifest"));
  fs.rmSync(path.join(packageRoot, "plugin", ".claude-plugin", "plugin.json"));

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("plugin.json")));
});

test("reports unexpected native MCP config", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-unexpected-mcp"));
  writeJson(path.join(packageRoot, "plugin", ".mcp.json"), {
    mcpServers: {
      calle: {
        type: "http",
        url: "https://example.test/mcp",
      },
    },
  });

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes(".mcp.json must not exist")));
});

test("reports mcpServers in plugin manifest", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-manifest-mcp"));
  const manifestPath = path.join(packageRoot, "plugin", ".claude-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.mcpServers = "./.mcp.json";
  writeJson(manifestPath, manifest);

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("must not declare mcpServers")));
});

test("reports a missing bundled skill", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-missing-skill"));
  fs.rmSync(path.join(packageRoot, "plugin", "skills", "calle"), { recursive: true, force: true });

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("skills/calle")));
});

test("reports a missing command reference", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-missing-reference"));
  fs.rmSync(path.join(packageRoot, "plugin", "skills", "calle", "references"), { recursive: true, force: true });

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("references/commands.md")));
});

test("reports missing authorization guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-missing-auth-guidance"));
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Test skill.\n---\n\n# Skill\n\n${VALID_PROGRESS_GUIDANCE}`,
  );

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("blocking authorization")));
  assert.ok(failures.some((failure) => failure.includes("manual chat reply")));
  assert.ok(failures.some((failure) => failure.includes("first authorization help")));
  assert.ok(failures.some((failure) => failure.includes("post-authorization success")));
});

test("reports missing call flow guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-missing-flow"));
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Test skill.\n---\n\n# Skill\n\n${VALID_AUTH_GUIDANCE}`,
  );

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("activity progress template")));
  assert.ok(failures.some((failure) => failure.includes("periodic polling")));
});

test("reports native MCP auth guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-native-auth-text"));
  const skillPath = path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md");
  fs.appendFileSync(skillPath, "\nTell the user to open /mcp and authorize the `calle` server.\n");

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("/mcp")));
  assert.ok(failures.some((failure) => failure.includes("native Claude MCP OAuth")));
});

test("reports wrong marketplace source path", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-bad-marketplace"));
  const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  marketplace.plugins[0].source = "./wrong/path";
  writeJson(marketplacePath, marketplace);

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("marketplace calle source")));
});

test("reports missing marketplace metadata description", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-missing-marketplace-metadata"));
  const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  delete marketplace.metadata;
  writeJson(marketplacePath, marketplace);

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("metadata.description")));
});

test("reports shell plugin install commands in docs", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-shell-install-docs"));
  writeFile(
    path.join(repoRoot, "docs", "install", "claude-plugin.md"),
    "# Install\n\nclaude plugin marketplace add https://example.test/repo.git#@call-e/claude-plugin@latest\nclaude plugin install calle@call-e-claude\n/reload-plugins\nnode \"$CALLE_CLI_ENTRY\" auth login\ncli-reference.md#selecting-the-cli-entry-point\n",
  );

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("slash-command marketplace")));
  assert.ok(failures.some((failure) => failure.includes("shell marketplace commands")));
  assert.ok(failures.some((failure) => failure.includes("shell plugin install commands")));
});

test("reports sparse options in slash install docs", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-sparse-slash-docs"));
  writeFile(
    path.join(repoRoot, "docs", "install", "claude-plugin.md"),
    "# Install\n\n/plugin marketplace add https://example.test/repo.git#@call-e/claude-plugin@latest --sparse .claude-plugin packages/claude-plugin/plugin\n/plugin install calle@call-e-claude\n/reload-plugins\nnode \"$CALLE_CLI_ENTRY\" auth login\ncli-reference.md#selecting-the-cli-entry-point\n",
  );

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("CLI-only --sparse")));
});

test("reports missing reload command in install docs", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-claude-plugin-missing-reload-docs"));
  writeFile(
    path.join(repoRoot, "docs", "install", "claude-plugin.md"),
    "# Install\n\n/plugin marketplace add https://example.test/repo.git#@call-e/claude-plugin@latest\n/plugin install calle@call-e-claude\n/calle:calle\nnode \"$CALLE_CLI_ENTRY\" auth login\ncli-reference.md#selecting-the-cli-entry-point\n",
  );

  const failures = checkClaudePlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("/reload-plugins")));
});

test("reports missing CLI guidance in the skill or command reference", (t) => {
  for (const fileName of ["SKILL.md", "references/commands.md"]) {
    for (const snippet of [
      "Stop before authentication if either check fails.",
      ...(fileName === "references/commands.md"
        ? ["`bin.calle` must be `./bin/calle.js`"]
        : ["references/commands.md#verify-the-cli-entry-point"]),
      "call recover --recovery-id",
      "Do not create a new plan or repeat `call start` or `call run`.",
      "Do not loop `call recover`.",
      "Keep `recovery_id` and the recovery command out of user-visible replies and shared logs.",
    ]) {
      const root = makeTempRoot("calle-claude-plugin-missing-recovery");
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const { packageRoot, repoRoot } = createValidFixture(root);
      const filePath = path.join(packageRoot, "plugin/skills/calle", fileName);
      const source = fs.readFileSync(filePath, "utf8");
      assert.ok(source.includes(snippet));
      fs.writeFileSync(filePath, source.replace(snippet, ""));

      const failures = checkClaudePlugin({ packageRoot, repoRoot });
      assert.ok(failures.some((failure) => failure.includes(fileName) && failure.includes(snippet)), `${fileName}: ${snippet}`);
    }
  }
});

test("rejects bare calle and npx commands in the skill or command reference", (t) => {
  for (const fileName of ["SKILL.md", "references/commands.md"]) {
    for (const command of ["calle auth status", "npx -y @call-e/cli auth status"]) {
      const root = makeTempRoot("calle-claude-plugin-unsafe-cli");
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const { packageRoot, repoRoot } = createValidFixture(root);
      assert.deepEqual(checkClaudePlugin({ packageRoot, repoRoot }), []);
      const filePath = path.join(packageRoot, "plugin/skills/calle", fileName);
      fs.appendFileSync(filePath, `\n\`\`\`bash\nenv CALLE_SOURCE=test ${command}\n\`\`\`\n`);

      const failures = checkClaudePlugin({ packageRoot, repoRoot });
      assert.ok(failures.some((failure) => failure.includes(fileName) && failure.includes("must not invoke bare calle or npx")));
    }
  }
});
