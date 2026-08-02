import assert from "node:assert/strict";
import test from "node:test";

import { extractFrontmatter } from "../scripts/check-plugin.mjs";

// Regression: the validators parsed YAML frontmatter with `\n`-anchored patterns.
//
// Git on Windows checks out with CRLF by default (core.autocrlf=true, and the
// repo shipped no .gitattributes), so every plugin and skill file arrived as
// `---\r\n...`. The delimiter never matched, and `pnpm -r test` reported six
// failures on a clean checkout -- valid files declared invalid, for a reason
// that had nothing to do with their contents.
//
// These cases run identically on POSIX, so a revert is caught on any machine
// rather than only on Windows.

const LF = "---\ndescription: \"CALL-E safety rules.\"\nalwaysApply: true\n---\nbody\n";
const CRLF = LF.replaceAll("\n", "\r\n");

test("frontmatter is recognised with LF line endings", () => {
  const frontmatter = extractFrontmatter(LF);
  assert.ok(frontmatter, "LF frontmatter should be recognised");
  assert.match(frontmatter, /alwaysApply: true/u);
});

test("frontmatter is recognised with CRLF line endings", () => {
  const frontmatter = extractFrontmatter(CRLF);
  assert.ok(frontmatter, "CRLF frontmatter should be recognised");
});

test("a CRLF field value carries no trailing carriage return", () => {
  const frontmatter = extractFrontmatter(CRLF);
  const match = /^alwaysApply:\s*([^\r\n]+)\s*$/mu.exec(frontmatter);
  assert.ok(match, "alwaysApply should be found");
  assert.equal(match[1], "true", "the captured value must not include \\r");
});

test("content without frontmatter is still rejected", () => {
  assert.equal(extractFrontmatter("no frontmatter here\n"), null);
  assert.equal(extractFrontmatter("---\nunterminated\n"), null);
});
