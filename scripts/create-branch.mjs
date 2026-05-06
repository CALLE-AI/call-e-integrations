import { spawnSync } from "node:child_process";
import { validateBranchName } from "./check-branch-name.mjs";

function runGit(args, options = {}) {
  return spawnSync("git", args, {
    encoding: "utf8",
    ...options,
  });
}

function fail(message, status = 1) {
  console.error(message);
  process.exit(status);
}

function parseBranchArg(args) {
  const branchOptionIndex = args.indexOf("--branch");
  if (branchOptionIndex !== -1) {
    return args[branchOptionIndex + 1] ?? "";
  }

  const branchOption = args.find((arg) => arg.startsWith("--branch="));
  if (branchOption) {
    return branchOption.slice("--branch=".length);
  }

  return args.find((arg) => arg !== "--" && !arg.startsWith("-")) ?? "";
}

const branchName = parseBranchArg(process.argv.slice(2));

if (!branchName) {
  fail("Usage: pnpm run branch:create -- <type>/<short-kebab-summary>");
}

const validation = validateBranchName(branchName);

if (!validation.ok) {
  fail(validation.message);
}

const refFormat = runGit(["check-ref-format", "--branch", branchName]);

if (refFormat.status !== 0) {
  fail(`Invalid git ref format: ${branchName}`, refFormat.status ?? 1);
}

const localBranch = runGit([
  "show-ref",
  "--verify",
  "--quiet",
  `refs/heads/${branchName}`,
]);

if (localBranch.status === 0) {
  fail(`Local branch already exists: ${branchName}`);
}

const remoteBranch = runGit([
  "show-ref",
  "--verify",
  "--quiet",
  `refs/remotes/origin/${branchName}`,
]);

if (remoteBranch.status === 0) {
  fail(`Fetched origin branch already exists: ${branchName}`);
}

console.log(validation.message);

const switchResult = runGit(["switch", "-c", branchName], { stdio: "inherit" });

process.exit(switchResult.status ?? 1);
