import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { main } from "../pack-skills.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_SKILLS = ["calle-cli", "callev2"];

function fixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "calle-skill-pack-"));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  for (const name of PUBLIC_SKILLS) {
    fs.cpSync(path.join(REPO_ROOT, "skills", name), path.join(repoRoot, "skills", name), {
      recursive: true,
      filter: (source) => !path.basename(source).startsWith("."),
    });
  }
  const helper = path.join(repoRoot, ".agents", "skills", "local-helper");
  fs.mkdirSync(helper, { recursive: true });
  fs.writeFileSync(path.join(helper, "SKILL.md"), "---\nname: local-helper\ndescription: Local test helper.\n---\n\nFixture.\n");
  return { repoRoot, log() {} };
}

// Independent bit-at-a-time CRC implementation checks the actual ZIP records.
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readZip(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054b50);
  const count = buffer.readUInt16LE(end + 10);
  let central = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(central), 0x02014b50);
    assert.equal(buffer.readUInt16LE(central + 10), 0, "ZIP uses stored entries");
    const size = buffer.readUInt32LE(central + 24);
    assert.equal(buffer.readUInt32LE(central + 20), size);
    const nameLength = buffer.readUInt16LE(central + 28);
    const name = buffer.subarray(central + 46, central + 46 + nameLength).toString("utf8");
    const offset = buffer.readUInt32LE(central + 42);
    assert.equal(buffer.readUInt32LE(offset), 0x04034b50);
    assert.equal(buffer.readUInt32LE(offset + 22), size);
    const localNameLength = buffer.readUInt16LE(offset + 26);
    assert.equal(buffer.subarray(offset + 30, offset + 30 + localNameLength).toString("utf8"), name);
    const dataStart = offset + 30 + localNameLength + buffer.readUInt16LE(offset + 28);
    const data = buffer.subarray(dataStart, dataStart + size);
    assert.equal(crc32(data), buffer.readUInt32LE(central + 16), `${name}: central CRC`);
    assert.equal(crc32(data), buffer.readUInt32LE(offset + 14), `${name}: local CRC`);
    assert.ok(!entries.has(name), `${name}: unique archive path`);
    entries.set(name, data);
    central += 46 + nameLength + buffer.readUInt16LE(central + 30) + buffer.readUInt16LE(central + 32);
  }
  assert.equal(central, end);
  return entries;
}

function sourceFiles(root, prefix = "") {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? sourceFiles(path.join(root, entry.name), relative)
      : [relative];
  }).sort();
}

test("unified public skill produces one ZIP with unchanged source bytes and valid CRCs", (t) => {
  const options = fixture(t);
  const results = main(["--public", "callev2"], options);
  assert.deepEqual(results.map((result) => result.skillName), PUBLIC_SKILLS.slice(1));
  for (const result of results) {
    assert.equal(result.zipPath, path.join(options.repoRoot, "dist", "skills", `${result.skillName}.zip`));
    const entries = readZip(result.zipPath);
    const sourceRoot = path.join(options.repoRoot, "skills", result.skillName);
    const relativeFiles = sourceFiles(sourceRoot);
    assert.deepEqual([...entries.keys()].sort(), relativeFiles.map((relative) => `${result.skillName}/${relative}`).sort());
    for (const relative of relativeFiles) {
      const original = fs.readFileSync(path.join(sourceRoot, relative));
      assert.deepEqual(entries.get(`${result.skillName}/${relative}`), original);
      assert.deepEqual(fs.readFileSync(path.join(result.distSkillRoot, relative)), original);
    }
    const firstZip = fs.readFileSync(result.zipPath);
    main(["--public", result.skillName], options);
    assert.deepEqual(fs.readFileSync(result.zipPath), firstZip, "packing is reproducible");
  }
});

test("public calle-cli preserves its existing CLI launcher", (t) => {
  const options = fixture(t);
  const [result] = main(["--public", "calle-cli"], options);
  const entries = readZip(result.zipPath);
  assert.deepEqual(entries.get("calle-cli/scripts/run-agent-command.mjs"), fs.readFileSync(path.join(options.repoRoot, "skills/calle-cli/scripts/run-agent-command.mjs")));
});

test("default and --all still package repository helpers while --public selects root skills", (t) => {
  const options = fixture(t);
  for (const args of [[], ["--all"], ["local-helper"]]) {
    const results = main(args, options);
    assert.deepEqual(results.map((result) => result.skillName), ["local-helper"]);
    assert.deepEqual([...readZip(results[0].zipPath).keys()], ["local-helper/SKILL.md"]);
  }
  for (const args of [["--public"], ["--public", "--all"]]) {
    assert.deepEqual(main(args, options).map((result) => result.skillName), PUBLIC_SKILLS);
  }
});

test("unknown skills and path traversal are rejected before creating output", (t) => {
  const options = fixture(t);
  for (const name of ["../calle", "..", "/calle", "nested/calle", "..\\calle", "--unknown"]) {
    assert.throws(() => main(["--public", name], options), /Invalid skill name/u);
  }
  assert.throws(() => main(["--public", "missing-skill"], options), /Unknown skill/u);
  assert.throws(() => main(["callev2"], options), /Unknown skill/u);
  assert.throws(() => main(["--public", "local-helper"], options), /Unknown skill/u);
  assert.equal(fs.existsSync(path.join(options.repoRoot, "dist")), false);
});

test("archives and copied trees exclude local state, secrets, caches and symlinks", (t) => {
  const options = fixture(t);
  const skillRoot = path.join(options.repoRoot, "skills", "callev2");
  const originalFiles = sourceFiles(skillRoot);
  for (const relative of [
    ".DS_Store", ".env", ".env.local", ".local/api-auth.env", ".git/config", ".venv/bin/python",
    "node_modules/dependency/index.js", "__pycache__/test.pyc", "venv/python",
    "dist/stale.zip", "coverage/report.json", "logs/debug.txt",
    "assets/api-auth.env", "assets/private.key", "assets/cert.pem", "assets/key.p12",
    "assets/key.pfx", "references/credentials.json", "references/token.json",
    "references/tokens.json", "references/secrets.json", "assets/debug.log",
  ]) {
    const destination = path.join(skillRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, "synthetic private fixture; never package\n");
  }
  const privateFile = path.join(options.repoRoot, "private-fixture.txt");
  fs.writeFileSync(privateFile, "synthetic private fixture\n");
  fs.symlinkSync(privateFile, path.join(skillRoot, "assets", "linked.txt"));
  fs.symlinkSync(path.dirname(privateFile), path.join(skillRoot, "linked-directory"), "dir");
  const [result] = main(["--public", "callev2"], options);
  assert.deepEqual([...readZip(result.zipPath).keys()].sort(), originalFiles.map((relative) => `callev2/${relative}`).sort());
  assert.deepEqual(sourceFiles(result.distSkillRoot), originalFiles);
  fs.symlinkSync(skillRoot, path.join(options.repoRoot, "skills", "linked-skill"), "dir");
  assert.throws(() => main(["--public", "linked-skill"], options), /not a symlink/u);
});

test("repacking removes test-only fixtures from ZIPs and stale installation trees", (t) => {
  const options = fixture(t);
  const skillRoot = path.join(options.repoRoot, "skills", "callev2");
  const runtimeFiles = sourceFiles(skillRoot);
  const oldFixture = path.join(skillRoot, "assets", "previously-bundled-evaluation.json");
  const fixtureData = Buffer.from('{"fixture":"synthetic evaluation data for repository tests only"}\n');
  fs.writeFileSync(oldFixture, fixtureData);
  const [previous] = main(["--public", "callev2"], options);
  assert.deepEqual(readZip(previous.zipPath).get("callev2/assets/previously-bundled-evaluation.json"), fixtureData);
  fs.rmSync(oldFixture);

  for (const relative of [
    "evals/evals.json", "tests/cases.json", "references/evals/cases.json",
    "assets/tests/cases.json", "TESTS/nested/cases.json",
  ]) {
    for (const root of [skillRoot, previous.distSkillRoot]) {
      const destination = path.join(root, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, fixtureData);
    }
  }

  const [result] = main(["--public", "callev2"], options);
  const entries = readZip(result.zipPath);
  assert.equal(result.fileCount, runtimeFiles.length);
  assert.deepEqual([...entries.keys()].sort(), runtimeFiles.map((relative) => `callev2/${relative}`).sort());
  assert.deepEqual(sourceFiles(result.distSkillRoot), runtimeFiles);
  for (const relative of runtimeFiles) {
    const original = fs.readFileSync(path.join(skillRoot, relative));
    assert.deepEqual(entries.get(`callev2/${relative}`), original);
    assert.deepEqual(fs.readFileSync(path.join(result.distSkillRoot, relative)), original);
  }
  assert.equal(fs.readFileSync(result.zipPath).includes(fixtureData), false);
});

test("a linked or mismatched SKILL.md is rejected", (t) => {
  const options = fixture(t);
  const entry = path.join(options.repoRoot, "skills", "callev2", "SKILL.md");
  fs.writeFileSync(entry, "---\nname: other-skill\ndescription: Fixture.\n---\n");
  assert.throws(() => main(["--public", "callev2"], options), /must match the directory name/u);
  fs.rmSync(entry);
  fs.symlinkSync(path.join(options.repoRoot, ".agents/skills/local-helper/SKILL.md"), entry);
  assert.throws(() => main(["--public", "callev2"], options), /missing SKILL.md/u);
});

test("the command-line entry point reports help and invalid names", () => {
  const script = path.join(REPO_ROOT, "scripts", "pack-skills.mjs");
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stderr, /\[--public\]/u);
  const invalid = spawnSync(process.execPath, [script, "--public", "../calle"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid skill name/u);
});
