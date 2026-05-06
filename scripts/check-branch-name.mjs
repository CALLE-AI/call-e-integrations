import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const BRANCH_NAME_PATTERN =
  /^(feat|fix|docs|chore|refactor|test|ci|build|release|hotfix|spike)\/[a-z0-9]+(-[a-z0-9]+)*$/;

const DOC_PATH = "docs/git-naming-conventions.md";
const LONG_LIVED_BRANCHES = new Set(["main", "master"]);
const GENERATED_BRANCHES = new Set(["changeset-release/main"]);

function parseBranchArg(args) {
  const branchOptionIndex = args.indexOf("--branch");
  if (branchOptionIndex !== -1) {
    return args[branchOptionIndex + 1] ?? "";
  }

  const branchOption = args.find((arg) => arg.startsWith("--branch="));
  if (branchOption) {
    return branchOption.slice("--branch=".length);
  }

  return args.find((arg) => !arg.startsWith("-")) ?? "";
}

function readCurrentBranch() {
  const envBranch =
    process.env.GITHUB_HEAD_REF ||
    process.env.BRANCH_NAME ||
    process.env.GITHUB_REF_NAME;

  if (envBranch) {
    return envBranch;
  }

  const result = spawnSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    console.error("Unable to read the current git branch.");
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

export function validateBranchName(branchName, { allowLongLived = false } = {}) {
  if (!branchName) {
    return {
      ok: true,
      skipped: true,
      message: "No branch name found; skipping branch name check.",
    };
  }

  if (allowLongLived && LONG_LIVED_BRANCHES.has(branchName)) {
    return {
      ok: true,
      skipped: true,
      message: `Skipping branch name check for long-lived branch: ${branchName}`,
    };
  }

  if (allowLongLived && GENERATED_BRANCHES.has(branchName)) {
    return {
      ok: true,
      skipped: true,
      message: `Skipping branch name check for generated branch: ${branchName}`,
    };
  }

  if (!BRANCH_NAME_PATTERN.test(branchName)) {
    return {
      ok: false,
      message: [
        `Invalid branch name: ${branchName}`,
        `Expected <type>/<short-kebab-summary> from ${DOC_PATH}.`,
        "Allowed types: feat, fix, docs, chore, refactor, test, ci, build, release, hotfix, spike.",
        "Example: feat/codex-plugin-latest-ref",
      ].join("\n"),
    };
  }

  return {
    ok: true,
    skipped: false,
    message: `Branch name follows ${DOC_PATH}: ${branchName}`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const explicitBranch = parseBranchArg(args);
  const branchName = explicitBranch || readCurrentBranch();
  const result = validateBranchName(branchName, {
    allowLongLived: !explicitBranch,
  });

  if (result.ok) {
    console.log(result.message);
    process.exit(0);
  }

  console.error(result.message);
  process.exit(1);
}
