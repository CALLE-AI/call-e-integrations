import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");

/** Copy the package to a temp dir, mutate it, and run the validator there. */
function checkWith(mutate) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "calle-hermes-"));
  try {
    for (const entry of ["plugin", "package.json", "README.md", "scripts"]) {
      const from = path.join(PACKAGE_ROOT, entry);
      if (fs.existsSync(from)) {
        fs.cpSync(from, path.join(work, entry), { recursive: true });
      }
    }
    if (mutate) mutate(work);
    try {
      execFileSync("node", ["./scripts/check-plugin.mjs"], {
        cwd: work,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { ok: true, output: "" };
    } catch (error) {
      return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function edit(work, relativePath, replace) {
  const target = path.join(work, relativePath);
  fs.writeFileSync(target, replace(fs.readFileSync(target, "utf8")));
}

test("the package as committed passes", () => {
  const { ok, output } = checkWith(null);
  assert.equal(ok, true, output);
});

// A validator that only ever passes proves nothing. Each case below is a
// defect the package exists to prevent; the validator has to fail on it.

test("rejects a `call start` invocation in the adapter", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/adapter.py", (s) =>
      s.replace("argv = (", 'argv = (["call", "start"] +')),
  );
  assert.equal(ok, false);
  assert.match(output, /call start/u);
});

test("rejects tools.py touching confirm_token", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/tools.py", (s) =>
      s.replace('TOOLSET = "calle"', 'TOOLSET = "calle"\n_leak = {}.get("confirm_token")')),
  );
  assert.equal(ok, false);
  assert.match(output, /confirm_token/u);
});

test("rejects tools.py surfacing token cache details", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/tools.py", (s) =>
      s.replace('TOOLSET = "calle"', 'TOOLSET = "calle"\n_x = {}["expires_at"]')),
  );
  assert.equal(ok, false);
  assert.match(output, /cache_path|expires_at/u);
});

test("rejects an adapter that stops redacting the confirm token", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/adapter.py", (s) => s.replaceAll("_redact_argv", "_keep_argv")),
  );
  assert.equal(ok, false);
  assert.match(output, /redact/u);
});

test("rejects a manifest tool that nothing registers", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/plugin.yaml", (s) => s.replace("  - calle_show", "  - calle_show\n  - calle_undeclared")),
  );
  assert.equal(ok, false);
  assert.match(output, /calle_undeclared/u);
});

test("rejects a version drift between manifest and package", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/plugin.yaml", (s) => s.replace(/version: \d+\.\d+\.\d+/u, "version: 9.9.9")),
  );
  assert.equal(ok, false);
  assert.match(output, /version must match/u);
});

test("rejects a declared manifest_version", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/plugin.yaml", (s) => `manifest_version: 99\n${s}`),
  );
  assert.equal(ok, false);
  assert.match(output, /manifest_version/u);
});

test("rejects agent docs that present a raw CLI verb as usable", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/skills/calle/SKILL.md", (s) => `${s}\nRun \`call run\` directly.\n`),
  );
  assert.equal(ok, false);
  assert.match(output, /call run/u);
});

// The inverse of the above: the docs SHOULD name these verbs in order to say
// they are unavailable. An assertion that cannot tell a rule from its breach
// would fail here, and this is the case that caught that during development.
test("allows agent docs to name a raw CLI verb as unavailable", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/skills/calle/SKILL.md", (s) => `${s}\n\`call run\` is not exposed here.\n`),
  );
  assert.equal(ok, true, output);
});

test("rejects any mention of user_input in agent docs", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/skills/calle/SKILL.md", (s) => `${s}\nuser_input is available.\n`),
  );
  assert.equal(ok, false);
  assert.match(output, /user_input/u);
});

test("rejects a skill file that omits the does-not-load notice", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/skills/calle/SKILL.md", (s) =>
      s.replace(/does not load/gu, "XX").replace(/not appear in/gu, "XX")),
  );
  assert.equal(ok, false);
  assert.match(output, /documentation/u);
});

test("rejects missing CLI attribution in the command reference", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "plugin/skills/calle/references/commands.md", (s) =>
      s.replace("CALLE_SOURCE=hermes", "CALLE_SOURCE=other")),
  );
  assert.equal(ok, false);
  assert.match(output, /attribution/u);
});

test("rejects an unpublishable package", () => {
  const { ok, output } = checkWith((work) =>
    edit(work, "package.json", (s) => s.replace('"type": "module",', '"private": true,\n  "type": "module",')),
  );
  assert.equal(ok, false);
  assert.match(output, /publishable/u);
});
