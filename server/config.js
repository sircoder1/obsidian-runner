import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(serverDir, "..");

const localEnvPath = path.join(projectRoot, ".env");
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function runnerMode(value) {
  return ["preview", "local", "docker"].includes(value) ? value : "preview";
}

function defaultDockerExecutable() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) return "docker";
  const candidate = path.join(process.env.LOCALAPPDATA, "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
  return existsSync(candidate) ? candidate : "docker";
}

export const config = Object.freeze({
  port: positiveInteger(process.env.PORT, 4173),
  host: process.env.HOST || "127.0.0.1",
  runnerMode: runnerMode(process.env.RUNNER_MODE),
  allowLocalExecution: process.env.ALLOW_LOCAL_EXECUTION === "true",
  allowDockerExecution: process.env.ALLOW_DOCKER_EXECUTION === "true",
  pythonExecutable: process.env.PYTHON_EXECUTABLE || "python3",
  dockerExecutable: process.env.DOCKER_EXECUTABLE || defaultDockerExecutable(),
  dockerRunnerImage: process.env.DOCKER_RUNNER_IMAGE || "obsidian-runner-python:latest",
  dockerNetwork: process.env.DOCKER_NETWORK || "obsidian-lab",
  dockerMemory: process.env.DOCKER_MEMORY || "384m",
  dockerCpus: process.env.DOCKER_CPUS || "1.0",
  dockerPidsLimit: positiveInteger(process.env.DOCKER_PIDS_LIMIT, 128),
  jobTimeoutMs: positiveInteger(process.env.JOB_TIMEOUT_MS, 120_000),
  maxRepoBytes: positiveInteger(process.env.MAX_REPO_BYTES, 100 * 1024 * 1024),
  maxOutputBytes: positiveInteger(process.env.MAX_OUTPUT_BYTES, 25 * 1024 * 1024),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(projectRoot, "data"),
  jobsDir: process.env.JOBS_DIR ? path.resolve(process.env.JOBS_DIR) : path.join(projectRoot, "work", "jobs"),
  publicDir: path.join(projectRoot, "public"),
});
