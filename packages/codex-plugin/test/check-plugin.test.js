import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkCodexPlugin } from "../scripts/check-plugin.mjs";

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
    description: "Use Call-E from Codex through the calle CLI.",
    skills: "./skills/",
    interface: {
      displayName: "Calle",
    },
  });

  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "SKILL.md"),
    "---\nname: calle\ndescription: Test skill.\n---\n\n# calle\n",
  );
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "agents", "openai.yaml"),
    'interface:\n  display_name: "Calle"\n',
  );
  writeFile(
    path.join(packageRoot, "plugin", "skills", "calle", "references", "commands.md"),
    "# Commands\n",
  );

  writeJson(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), {
    name: "call-e-codex",
    interface: {
      displayName: "Call-E",
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
