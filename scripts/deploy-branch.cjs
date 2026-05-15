#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const readline = require("node:readline");

const target = process.argv[2];
const shouldConfirm = process.argv.includes("--confirm");
const requireBranchArgIndex = process.argv.indexOf("--require-branch");
const requiredSourceBranch =
  requireBranchArgIndex !== -1 ? process.argv[requireBranchArgIndex + 1] : null;
const validTargets = new Set(["dev", "production"]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function runOrThrow(command, args, message) {
  const result = run(command, args);
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const details = stderr || stdout;
    throw new Error(details ? `${message}: ${details}` : message);
  }
  return result;
}

function ensureGitRepo() {
  runOrThrow("git", ["rev-parse", "--is-inside-work-tree"], "Not a git repository");
}

function ensureCleanTree() {
  const status = runOrThrow("git", ["status", "--porcelain"], "Unable to read git status");
  const dirty = (status.stdout || "").trim();
  if (dirty) {
    throw new Error("Working tree is not clean. Commit or stash changes before deploying.");
  }
}

function ensureOriginRemote() {
  runOrThrow("git", ["remote", "get-url", "origin"], "Git remote 'origin' is not configured");
}

function getCurrentBranch() {
  const branch = runOrThrow(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    "Unable to determine current branch",
  );
  return (branch.stdout || "").trim();
}

function ensureRequiredSourceBranch() {
  if (!requiredSourceBranch) {
    return;
  }

  const currentBranch = getCurrentBranch();
  if (currentBranch !== requiredSourceBranch) {
    throw new Error(
      `Deploy blocked. Current branch is '${currentBranch}' but '${requiredSourceBranch}' is required.`,
    );
  }
}

async function confirmProductionDeploy() {
  if (!shouldConfirm || target !== "production") {
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question("Type PRODUCTION to confirm deploy: ", resolve);
  });

  rl.close();

  if ((answer || "").trim() !== "PRODUCTION") {
    throw new Error("Production deploy cancelled.");
  }
}

async function main() {
  if (!validTargets.has(target)) {
    console.error(
      "Usage: node scripts/deploy-branch.cjs <dev|production> [--confirm] [--require-branch <branch>]",
    );
    process.exit(1);
  }

  if (requireBranchArgIndex !== -1 && !requiredSourceBranch) {
    console.error("Usage error: --require-branch requires a branch name.");
    process.exit(1);
  }

  ensureGitRepo();
  ensureCleanTree();
  ensureOriginRemote();
  ensureRequiredSourceBranch();
  await confirmProductionDeploy();

  console.log(`Deploying current HEAD to origin/${target}...`);

  const pushResult = run("git", ["push", "origin", `HEAD:${target}`], {
    stdio: "inherit",
  });

  if (pushResult.status !== 0) {
    process.exit(pushResult.status || 1);
  }

  console.log(`Deployment push complete: origin/${target}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
