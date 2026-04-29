import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkOpenClawCliSkill } from "../scripts/check-skill.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");

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
    path.join(packageRoot, "skills", "calle-cli", "SKILL.md"),
    [
      "---",
      "name: Phone Call — Call-E",
      "description: Test Call-E CLI skill.",
      'metadata: {"openclaw":{"requires":{"bins":["node"],"anyBins":["calle","npx"]},"install":[{"kind":"node","package":"@call-e/cli","bins":["calle"]}]}}',
      "---",
      "",
      "# Call-E CLI",
      "",
      "Use assistant_hint.message after auth login and handle auth_required errors.",
      "Run with CALLE_INTEGRATION=openclaw_cli_skill.",
      "",
    ].join("\n"),
  );

  writeFile(
    path.join(packageRoot, "skills", "calle-cli", "references", "commands.md"),
    [
      "# Commands",
      "",
      "env CALLE_SOURCE=openclaw CALLE_INTEGRATION=openclaw_cli_skill node packages/cli/bin/calle.js",
      "env CALLE_SOURCE=openclaw CALLE_INTEGRATION=openclaw_cli_skill npx -y @call-e/cli@0.2.1",
      "Handle auth_required and assistant_hint.message.",
      "Use call plan, call run, and call status.",
      "",
    ].join("\n"),
  );

  writeFile(path.join(repoRoot, "README.md"), "packages/openclaw-cli-skill\n");
  writeFile(
    path.join(repoRoot, "docs", "agent-integration-layout.md"),
    "packages/openclaw-cli-skill\n\nRoot `skills/` is for repository-local skill source.\n",
  );

  return { packageRoot, repoRoot };
}

test("current OpenClaw CLI skill metadata is valid", () => {
  assert.deepEqual(checkOpenClawCliSkill({ packageRoot: PACKAGE_ROOT, repoRoot: REPO_ROOT }), []);
});

test("reports a missing skill", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-openclaw-cli-skill-missing"));
  fs.rmSync(path.join(packageRoot, "skills", "calle-cli"), { recursive: true, force: true });

  const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("skills/calle-cli")));
});

test("reports non-json metadata", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-openclaw-cli-skill-bad-metadata"));
  const skillFile = path.join(packageRoot, "skills", "calle-cli", "SKILL.md");
  const source = fs.readFileSync(skillFile, "utf8");
  fs.writeFileSync(skillFile, source.replace('metadata: {"openclaw"', "metadata: openclaw"));

  const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("metadata must be single-line JSON")));
});

test("reports plugin install commands in the command reference", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-openclaw-cli-skill-plugin-command"));
  const referenceFile = path.join(packageRoot, "skills", "calle-cli", "references", "commands.md");
  const bannedPluginInstallCommand = ["openclaw", "plugins", "install"].join(" ");
  fs.appendFileSync(referenceFile, `\n${bannedPluginInstallCommand} example\n`);

  const failures = checkOpenClawCliSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes(bannedPluginInstallCommand)));
});
