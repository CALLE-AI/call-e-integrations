import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkSkillsShSkill } from "../scripts/check-skill.mjs";

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

function createValidFixture(root, { packageVersion = "0.1.0", integrationVersion = packageVersion } = {}) {
  const packageRoot = path.join(root, "packages", "skills-sh-skill");
  const repoRoot = root;

  writeJson(path.join(packageRoot, "package.json"), {
    name: "@call-e/skills-sh-skill",
    version: packageVersion,
    private: true,
    files: ["README.md", "skills"],
    scripts: {
      check: "node ./scripts/check-skill.mjs",
      test: "node --test ./test/*.test.js",
      "pack:dry-run": "npm pack --dry-run",
    },
  });

  writeFile(
    path.join(packageRoot, "skills", "calle", "SKILL.md"),
    [
      "---",
      "name: calle",
      "description: Test CALL-E skills.sh skill.",
      "---",
      "",
      "# calle",
      "",
      "Run auth login --start-only --no-browser-open and ask the user to use the authorization instructions returned by the CLI.",
      "Run auth login --no-browser-open to exchange a pending authorization.",
      "Great, authorization is complete",
      "Use assistant_hint.message after auth login and handle auth_required errors.",
      "Use call plan, call run, and call status.",
      "Phone call is in progress! Progress:",
      "After call run, do not use `run_result` for the user-visible reply.",
      "Use status_result.structuredContent.",
      "Never paraphrase call results.",
      "For non-terminal statuses, the entire reply must be exactly this shape.",
      "Poll every 10 seconds.",
      `Run with CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=${integrationVersion}.`,
      "Use npx -y @call-e/cli@0.3.2 when no local CLI exists.",
      "",
    ].join("\n"),
  );

  writeFile(
    path.join(packageRoot, "skills", "calle", "agents", "openai.yaml"),
    [
      "interface:",
      '  display_name: "calle"',
      '  short_description: "CALL-E phone calls from agent skills"',
      '  default_prompt: "Use $calle to place or check a CALL-E phone call."',
      "",
    ].join("\n"),
  );

  writeFile(
    path.join(packageRoot, "skills", "calle", "references", "commands.md"),
    [
      "# Commands",
      "",
      `env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=${integrationVersion} node packages/cli/bin/calle.js`,
      `env CALLE_SOURCE=skills_sh CALLE_INTEGRATION=skills_sh_skill CALLE_INTEGRATION_VERSION=${integrationVersion} npx -y @call-e/cli@0.3.2`,
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

  writeFile(path.join(repoRoot, "README.md"), "packages/skills-sh-skill\ndocs/install/skills-sh-skill.md\n");
  writeFile(path.join(repoRoot, "docs", "install", "skills-sh-skill.md"), "# Install\n");
  writeFile(path.join(repoRoot, "docs", "agent-integration-layout.md"), "skills.sh\npackages/skills-sh-skill\n");

  return { packageRoot, repoRoot };
}

test("current skills.sh skill metadata is valid", () => {
  assert.deepEqual(checkSkillsShSkill({ packageRoot: PACKAGE_ROOT, repoRoot: REPO_ROOT }), []);
});

test("reports a missing calle skill", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-skills-sh-skill-missing"));
  fs.rmSync(path.join(packageRoot, "skills", "calle"), { recursive: true, force: true });

  const failures = checkSkillsShSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("skills/calle")));
});

test("reports a non-standard skill name", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-skills-sh-skill-bad-name"));
  const skillFile = path.join(packageRoot, "skills", "calle", "SKILL.md");
  const source = fs.readFileSync(skillFile, "utf8");
  fs.writeFileSync(skillFile, source.replace("name: calle", "name: Phone Call - CALL-E"));

  const failures = checkSkillsShSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes('frontmatter name must be "calle"')));
});

test("reports stale integration attribution", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-skills-sh-skill-stale-attribution"));
  const referenceFile = path.join(packageRoot, "skills", "calle", "references", "commands.md");
  const source = fs.readFileSync(referenceFile, "utf8");
  fs.writeFileSync(referenceFile, source.replaceAll("CALLE_SOURCE=skills_sh", "CALLE_SOURCE=openclaw"));

  const failures = checkSkillsShSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("CALLE_SOURCE=skills_sh")));
});

test("reports stale integration version", () => {
  const { packageRoot, repoRoot } = createValidFixture(
    makeTempRoot("calle-skills-sh-skill-stale-version"),
    { packageVersion: "9.8.7", integrationVersion: "0.1.0" },
  );

  const failures = checkSkillsShSkill({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("CALLE_INTEGRATION_VERSION=9.8.7")));
});
