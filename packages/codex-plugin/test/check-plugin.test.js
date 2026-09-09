import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkCodexPlugin } from "../scripts/check-plugin.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const VALID_AUTH_GUIDANCE =
  "Use assistant_hint.message to include a brief post-auth help note after auth login.\n\n" +
  "Run blocking `auth login` and keep the command running until it exits.\n\n" +
  "do not ask the user to reply after browser authorization.\n\n" +
  "Before we start, please complete authorization here\n\n" +
  "Great, authorization is complete\n\n";
const VALID_ROUTING_GUIDANCE =
  "Use only the `calle` CLI flow.\n\n" +
  "Do not call ChatGPT App or connector tools.\n\n" +
  "mcp__codex_apps__\n\n";
const VALID_PROGRESS_GUIDANCE =
  "Phone call is in progress! Progress:\n\n" +
  "Do not stay silent until a terminal status.\n\n" +
  "Poll every 10 seconds.\n";

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
  const packageRoot = path.join(root, "packages", "codex-plugin");
  const repoRoot = root;

  writeJson(path.join(packageRoot, "package.json"), {
    name: "@call-e/codex-plugin",
    version: "0.0.0",
    files: ["README.md", "plugin"],
  });

  writeJson(path.join(packageRoot, "plugin", ".codex-plugin", "plugin.json"), {
    name: "calle",
    version: "0.0.0",
    description: "Use CALL-E from Codex through the calle CLI.",
    skills: "./skills/",
    interface: {
      displayName: "CALL-E",
      composerIcon: "./assets/CALL-E-Icon-Black.svg",
    },
  });

  writeFile(
    path.join(packageRoot, "plugin", "assets", "CALL-E-Icon-Black.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>\n',
  );

  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Test skill.\n---\n\n# calle\n\n${VALID_AUTH_GUIDANCE}${VALID_ROUTING_GUIDANCE}${VALID_PROGRESS_GUIDANCE}${VALID_CLI_SELECTION_GUIDANCE}${VALID_RECOVERY_GUIDANCE}`,
  );
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "agents", "openai.yaml"),
    'interface:\n  display_name: "CALL-E"\n',
  );
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "references", "commands.md"),
    `# Commands\n\n${VALID_CLI_SELECTION_GUIDANCE}${VALID_RECOVERY_GUIDANCE}${VALID_AUTH_GUIDANCE}${VALID_ROUTING_GUIDANCE}Use the \`calle\` CLI flow.\n\nPhone call is in progress! Progress:\n\nWait 10 seconds.\n`,
  );

  writeJson(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), {
    name: "call-e-codex",
    interface: {
      displayName: "CALL-E",
    },
    plugins: [
      {
        name: "calle",
        source: {
          source: "local",
          path: "./packages/codex-plugin/plugin",
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_USE",
        },
        category: "Productivity",
      },
    ],
  });

  return { packageRoot, repoRoot };
}

test("current Codex plugin metadata is valid", () => {
  assert.deepEqual(checkCodexPlugin({ packageRoot: PACKAGE_ROOT, repoRoot: REPO_ROOT }), []);
});

test("reports a missing plugin manifest", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-manifest"));
  fs.rmSync(path.join(packageRoot, "plugin", ".codex-plugin", "plugin.json"));

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("plugin.json")));
});

test("reports missing composer icon metadata", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-icon"));
  const manifestPath = path.join(packageRoot, "plugin", ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  delete manifest.interface.composerIcon;
  writeJson(manifestPath, manifest);

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("composerIcon")));
});

test("reports missing composer icon asset", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-icon-asset"));
  fs.rmSync(path.join(packageRoot, "plugin", "assets", "CALL-E-Icon-Black.svg"));

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("composerIcon asset")));
});

test("reports a missing bundled skill", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-skill"));
  fs.rmSync(path.join(packageRoot, "plugin", "skills", "calle"), { recursive: true, force: true });

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("skills/calle")));
});

test("reports missing skill UI metadata", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-skill-ui"));
  fs.rmSync(path.join(packageRoot, "plugin", "skills", "calle", "agents"), { recursive: true, force: true });

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("agents/openai.yaml")));
});

test("reports missing authorization guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-auth-guidance"));
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Test skill.\n---\n\n# calle\n\nUse assistant_hint.message to include a brief post-auth help note after auth login.\n\n${VALID_ROUTING_GUIDANCE}${VALID_PROGRESS_GUIDANCE}`,
  );

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("blocking authorization")));
  assert.ok(failures.some((failure) => failure.includes("manual chat reply")));
  assert.ok(failures.some((failure) => failure.includes("first authorization help")));
  assert.ok(failures.some((failure) => failure.includes("post-authorization success")));
});

test("reports missing ChatGPT App routing boundary guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-routing"));
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Test skill.\n---\n\n# calle\n\n${VALID_AUTH_GUIDANCE}${VALID_PROGRESS_GUIDANCE}`,
  );

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("ChatGPT App tools")));
});

test("reports missing non-terminal call progress guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-progress"));
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Test skill.\n---\n\n# calle\n\n${VALID_AUTH_GUIDANCE}${VALID_ROUTING_GUIDANCE}`,
  );

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("activity progress template")));
});

test("reports missing non-terminal call polling interval guidance", () => {
  const { packageRoot, repoRoot } = createValidFixture(makeTempRoot("calle-codex-plugin-missing-polling"));
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    `---\nname: calle\ndescription: Test skill.\n---\n\n# calle\n\n${VALID_AUTH_GUIDANCE}${VALID_ROUTING_GUIDANCE}Phone call is in progress! Progress:\n\nDo not stay silent until a terminal status.\n`,
  );

  const failures = checkCodexPlugin({ packageRoot, repoRoot });
  assert.ok(failures.some((failure) => failure.includes("periodic polling")));
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
      const root = makeTempRoot("calle-codex-plugin-missing-recovery");
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const { packageRoot, repoRoot } = createValidFixture(root);
      const filePath = path.join(packageRoot, "plugin/skills/calle", fileName);
      const source = fs.readFileSync(filePath, "utf8");
      assert.ok(source.includes(snippet));
      fs.writeFileSync(filePath, source.replace(snippet, ""));

      const failures = checkCodexPlugin({ packageRoot, repoRoot });
      assert.ok(failures.some((failure) => failure.includes(fileName) && failure.includes(snippet)), `${fileName}: ${snippet}`);
    }
  }
});

test("rejects bare calle and npx commands in the skill or command reference", (t) => {
  for (const fileName of ["SKILL.md", "references/commands.md"]) {
    for (const command of ["calle auth status", "npx -y @call-e/cli auth status"]) {
      const root = makeTempRoot("calle-codex-plugin-unsafe-cli");
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const { packageRoot, repoRoot } = createValidFixture(root);
      assert.deepEqual(checkCodexPlugin({ packageRoot, repoRoot }), []);
      const filePath = path.join(packageRoot, "plugin/skills/calle", fileName);
      fs.appendFileSync(filePath, `\n\`\`\`bash\nenv CALLE_SOURCE=test ${command}\n\`\`\`\n`);

      const failures = checkCodexPlugin({ packageRoot, repoRoot });
      assert.ok(failures.some((failure) => failure.includes(fileName) && failure.includes("must not invoke bare calle or npx")));
    }
  }
});
