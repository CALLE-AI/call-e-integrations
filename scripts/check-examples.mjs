#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  {
    cwd: "examples/mcp-oauth-client/typescript",
    command: "pnpm",
    args: ["install", "--ignore-workspace", "--lockfile=false"],
  },
  {
    cwd: "examples/mcp-oauth-client/typescript",
    command: "pnpm",
    args: ["check"],
  },
  {
    cwd: "examples/mcp-oauth-client/typescript",
    command: "pnpm",
    args: ["test:e2e"],
  },
  {
    cwd: "examples/mcp-broker-client/typescript",
    command: "pnpm",
    args: ["install", "--ignore-workspace", "--lockfile=false"],
  },
  {
    cwd: "examples/mcp-broker-client/typescript",
    command: "pnpm",
    args: ["check"],
  },
  {
    cwd: "examples/mcp-broker-client/typescript",
    command: "pnpm",
    args: ["test:e2e"],
  },
  {
    cwd: "examples/mcp-broker-client/typescript-standalone",
    command: "pnpm",
    args: ["install", "--ignore-workspace", "--lockfile=false"],
  },
  {
    cwd: "examples/mcp-broker-client/typescript-standalone",
    command: "pnpm",
    args: ["check"],
  },
  {
    cwd: "examples/mcp-broker-client/typescript-standalone",
    command: "pnpm",
    args: ["test:e2e"],
  },
  {
    cwd: "examples/mcp-oauth-client/python",
    command: "uv",
    args: ["run", "--isolated", "python", "-m", "py_compile", "client.py"],
  },
  {
    cwd: "examples/mcp-oauth-client/python",
    command: "uv",
    args: ["run", "--isolated", "pytest"],
  },
  {
    cwd: "examples/mcp-broker-client/python",
    command: "uv",
    args: ["run", "--isolated", "python", "-m", "py_compile", "client.py"],
  },
  {
    cwd: "examples/mcp-broker-client/python",
    command: "uv",
    args: ["run", "--isolated", "pytest"],
  },
];

for (const step of steps) {
  const cwd = path.join(repoRoot, step.cwd);
  console.log(`\n[examples] ${step.cwd}$ ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(step.command, step.args, {
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nExample checks passed.");
