import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkOpenClawCliSkill } from "../scripts/check-skill.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");

const VALID_CLI_SELECTION_GUIDANCE = [
  "Do not run bare `calle` or use `npx` to select the CLI.",
  "Stop before authentication if either check fails.",
  "Reuse the verified entry point for every command.",
  "[Entry-point checks](references/commands.md#verify-the-cli-entry-point)",
  "`package.json`: `name` must be `@call-e/cli` and `bin.calle` must name `bin/calle.js`.",
  "Resolve to an absolute path and run help without credentials or call arguments.",
  'The bundled scripts/run-agent-command.mjs checks auth login --help.',
  'The bundled scripts/run-agent-command.mjs checks call plan --help.',
  'The bundled scripts/run-agent-command.mjs checks call run --help.',
  'The bundled scripts/run-agent-command.mjs checks call recover --help.',
].join("\n") + "\n";

const VALID_RECOVERY_GUIDANCE =
  'When `call_started: "unknown"` and `retry_safe: false`, preserve `recovery_id` and `next_argv`.\n' +
  "Use call recover --recovery-id with the original local recovery record.\n" +
  "Do not create a new plan or repeat `call start` or `call run`.\n" +
  "Do not loop `call recover`.\n" +
  "Keep `recovery_id` and the recovery command out of user-visible replies and shared logs.\n";

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
  const packageRoot = path.join(root, "packages", "openclaw-cli-skill");
  const repoRoot = root;

  writeJson(path.join(packageRoot, "package.json"), {
    name: "@call-e/openclaw-cli-skill",
    version: "0.1.0",
    private: true,
    files: ["README.md", "skills"],
    scripts: {
      check: "node ./scripts/check-skill.mjs",
      test: "node --test ./test/*.test.js",
      "pack:dry-run": "npm pack --dry-run",
    },
  });

  writeFile(
    path.join(packageRoot, "skills", "phone-call-calle", "SKILL.md"),
    [
      "---",
      "name: Phone Call - CALL-E",
      "description: Test CALL-E CLI skill.",
      'metadata: {"openclaw":{"requires":{"bins":["node"]},"install":[{"kind":"node","package":"@call-e/cli","bins":["calle"]}]}}',
      "---",
      "",
      "# CALL-E CLI",
      VALID_CLI_SELECTION_GUIDANCE,
      VALID_RECOVERY_GUIDANCE,
      "",
      "Run auth login --start-only --no-browser-open and ask the user to use the authorization instructions returned by the CLI.",
      "Run auth login --no-browser-open to exchange a pending authorization.",
      "Great, authorization is complete",
      "Use assistant_hint.message after auth login and handle auth_required errors.",
      "Phone call is in progress! Progress:",
      "After call run, do not use `run_result` for the user-visible reply.",
      "Treat `status_result.structuredContent` as the latest get_call_run result.",
      "Never paraphrase call results.",
      "For non-terminal statuses, the entire reply must be exactly this shape.",
      "Poll every 10 seconds and Do not stay silent until a terminal status.",
      JSON.stringify({ integration: { source: "openclaw", name: "openclaw_cli_skill", version: "0.1.0" } }, null, 2),
      "",
    ].join("\n"),
  );

  writeFile(
    path.join(packageRoot, "skills", "phone-call-calle", "references", "commands.md"),
    [
      "# Commands",
      VALID_CLI_SELECTION_GUIDANCE,
      VALID_RECOVERY_GUIDANCE,
      "",
      JSON.stringify({ integration: { source: "openclaw", name: "openclaw_cli_skill", version: "0.1.0" } }, null, 2),
      "Run auth login --start-only --no-browser-open and ask the user to use the authorization instructions returned by the CLI.",
      "Run auth login --no-browser-open to exchange a pending authorization.",
      "Great, authorization is complete",
      "Handle auth_required and assistant_hint.message.",
      "Use call plan, call run, and call status.",
      "Phone call is in progress! Progress:",
      "Do not use run_result for the user-visible reply.",
      "Use status_result.structuredContent.",
      "Never paraphrase call results.",
      "For non-terminal statuses, the entire reply must be exactly this shape.",
      "Wait 10 seconds before polling again.",
      "",
    ].join("\n"),
  );

  writeFile(path.join(repoRoot, "README.md"), "CALL-E Integrations\n");
  writeFile(
    path.join(repoRoot, "docs", "agent-integration-layout.md"),
    "packages/openclaw-cli-skill\n\nUse `.agents/skills/` for repository-local Codex helper skills.\n",
  );

  return { packageRoot, repoRoot };
}

test("current OpenClaw CLI skill metadata is valid", () => {
  assert.deepEqual(checkOpenClawCliSkill({ packageRoot: PACKAGE_ROOT, repoRoot: REPO_ROOT }), []);
});

test("allows root README without OpenClaw package entry", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-openclaw-cli-skill-concise-readme"));

  assert.deepEqual(checkOpenClawCliSkill({ packageRoot, repoRoot }), []);
});

test("reports a missing skill", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-openclaw-cli-skill-missing"));
  fs.rmSync(path.join(packageRoot, "skills", "phone-call-calle"), { recursive: true, force: true });

  const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("skills/phone-call-calle")));
});

test("reports non-json metadata", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-openclaw-cli-skill-bad-metadata"));
  const skillFile = path.join(packageRoot, "skills", "phone-call-calle", "SKILL.md");
  const source = fs.readFileSync(skillFile, "utf8");
  fs.writeFileSync(skillFile, source.replace('metadata: {"openclaw"', "metadata: openclaw"));

  const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("metadata must be single-line JSON")));
});

test("reports plugin install commands in the command reference", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-openclaw-cli-skill-plugin-command"));
  const referenceFile = path.join(packageRoot, "skills", "phone-call-calle", "references", "commands.md");
  const bannedPluginInstallCommand = ["openclaw", "plugins", "install"].join(" ");
  fs.appendFileSync(referenceFile, `\n${bannedPluginInstallCommand} example\n`);

  const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes(bannedPluginInstallCommand)));
});

test("reports missing CLI guidance in the skill or command reference", (t) => {
  for (const fileName of ["SKILL.md", "references/commands.md"]) {
    for (const snippet of [
      "Stop before authentication if either check fails.",
      ...(fileName === "references/commands.md"
        ? ["`bin.calle` must name `bin/calle.js`"]
        : ["references/commands.md#verify-the-cli-entry-point"]),
      "call recover --recovery-id",
      "Do not create a new plan or repeat `call start` or `call run`.",
      "Do not loop `call recover`.",
      "Keep `recovery_id` and the recovery command out of user-visible replies and shared logs.",
    ]) {
      const root = makeTempRoot("calle-openclaw-cli-skill-missing-recovery");
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const { packageRoot, repoRoot } = createValidFixture(root);
      const filePath = path.join(packageRoot, "skills/phone-call-calle", fileName);
      const source = fs.readFileSync(filePath, "utf8");
      assert.ok(source.includes(snippet));
      fs.writeFileSync(filePath, source.replace(snippet, ""));

      const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
      assert.ok(failures.some((failure) => failure.includes(fileName) && failure.includes(snippet)), `${fileName}: ${snippet}`);
    }
  }
});

test("rejects bare calle and npx commands in the skill or command reference", (t) => {
  for (const fileName of ["SKILL.md", "references/commands.md"]) {
    for (const command of ["calle auth status", "npx -y @call-e/cli auth status"]) {
      const root = makeTempRoot("calle-openclaw-cli-skill-unsafe-cli");
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const { packageRoot, repoRoot } = createValidFixture(root);
      assert.deepEqual(checkOpenClawCliSkill({ packageRoot, repoRoot }), []);
      const filePath = path.join(packageRoot, "skills/phone-call-calle", fileName);
      fs.appendFileSync(filePath, `\n\`\`\`bash\nenv CALLE_SOURCE=test ${command}\n\`\`\`\n`);

      const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
      assert.ok(failures.some((failure) => failure.includes(fileName) && failure.includes("must not invoke bare calle or npx")));
    }
  }
});
