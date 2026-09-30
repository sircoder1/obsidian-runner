#!/usr/bin/env node
// This file uses only Node built-ins so it works before npm ci.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startAfterSetup = process.argv.includes("--start");
const node = process.execPath;

function run(label, executable, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    console.error(`${label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runNpm(label, args) {
  if (process.platform === "win32") {
    // cmd.exe is the supported launcher for npm.cmd on Windows. The arguments
    // below are fixed by this script rather than supplied by a user.
    run(label, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`]);
  } else {
    run(label, "npm", args);
  }
}

const major = Number.parseInt(process.versions.node.split(".")[0], 10);
if (major < 22) {
  console.error(`Node.js 22 or newer is required; found ${process.versions.node}.`);
  process.exit(1);
}

const envPath = path.join(projectRoot, ".env");
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(projectRoot, ".env.docker.example"), envPath);
  console.log("Created .env with safe Docker-runner defaults.");
} else {
  console.log("Keeping the existing .env file.");
}

runNpm("Install exact Node dependencies", ["ci"]);
runNpm("Run application tests", ["test"]);
run("Build the disposable Python runner", node, ["scripts/docker-task.js", "build"]);
run("Start the private SSH challenge service", node, ["scripts/docker-task.js", "lab"]);
run("Verify Docker, networking, helpers, and output mounts", node, ["scripts/docker-task.js", "verify"]);

console.log("\nLab setup passed.");
console.log("Open http://127.0.0.1:4173 after the service starts.");
console.log("Stop the service with Ctrl+C; stop the SSH lab with: npm run docker:down");

if (startAfterSetup) runNpm("Start Obsidian Runner", ["start"]);
else console.log("Start the site with: npm start");
