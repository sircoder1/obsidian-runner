import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { config } from "./config.js";
import { getJob, getParticipant, updateJob } from "./store.js";

const logHistory = new Map();
const MAX_HISTORY_LINES = 500;
const ALLOWED_DOCKER_CAPABILITIES = new Set(["NET_RAW"]);

function recordLog(io, jobId, stream, text) {
  const entry = { stream, text, at: new Date().toISOString() };
  const history = logHistory.get(jobId) ?? [];
  history.push(entry);
  if (history.length > MAX_HISTORY_LINES) history.splice(0, history.length - MAX_HISTORY_LINES);
  logHistory.set(jobId, history);
  io.to(`job:${jobId}`).emit("job:log", entry);
}

export function getLogHistory(jobId) {
  return structuredClone(logHistory.get(jobId) ?? []);
}

async function runProcess({ executable, args, cwd, env, timeoutMs, onStdout, onStderr }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
    });

    let settled = false;
    const timeout = setTimeout(() => {
      onStderr(`\n[runner] Time limit reached after ${Math.round(timeoutMs / 1000)} seconds.\n`);
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => onStdout(chunk.toString()));
    child.stderr.on("data", (chunk) => onStderr(chunk.toString()));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? 1, signal });
    });
  });
}

async function listFilesRecursive(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(root, fullPath)));
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      files.push({
        path: path.relative(root, fullPath).split(path.sep).join("/"),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function listArtifacts(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found.");
  return listFilesRecursive(path.join(config.jobsDir, jobId, "output"));
}

function startArtifactMonitor(io, jobId, outputDir) {
  let previous = "";
  const timer = setInterval(async () => {
    const files = await listFilesRecursive(outputDir);
    const signature = JSON.stringify(files);
    if (signature !== previous) {
      previous = signature;
      io.to(`job:${jobId}`).emit("job:artifacts", files);
    }
  }, 600);
  timer.unref();
  return () => clearInterval(timer);
}

function replaceTokens(values, context) {
  return values.map((value) => {
    let result = value;
    for (const [token, replacement] of Object.entries(context)) {
      result = result.replaceAll(`{${token}}`, String(replacement));
    }
    return result;
  });
}

async function directorySize(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(item);
    else if (entry.isFile()) total += (await fs.stat(item)).size;
    if (total > config.maxRepoBytes) return total;
  }
  return total;
}

async function executePreview(io, job, level, outputDir) {
  const lines = [
    ["system", "Preparing guided runner…"],
    ["system", "Validated GitHub repository format."],
    ["stdout", `[preview] Loading ${level?.title ?? "the selected level"}`],
    ["stdout", "[preview] Creating the challenge environment"],
    ["stdout", `[preview] Machine command: ${level?.command?.format ?? "not selected"}`],
    ["stdout", "[preview] Streaming stdout, stderr, and output artifacts"],
  ];

  for (const [stream, text] of lines) {
    recordLog(io, job.id, stream, `${text}\n`);
    await new Promise((resolve) => setTimeout(resolve, 340));
  }

  await fs.writeFile(
    path.join(outputDir, "runner-preview.json"),
    `${JSON.stringify({ jobId: job.id, levelId: level?.id ?? null, command: level?.command?.format ?? null, status: "ready" }, null, 2)}\n`,
  );
  recordLog(io, job.id, "system", "Preview complete. Run .\\setup.ps1 on Windows or sh setup.sh on Linux to configure Docker execution, then restart the website.\n");
  return { code: 0, commit: "preview" };
}

async function createRuntime(level) {
  const runtime = { tokens: {}, cleanup: async () => {} };
  if (level.runner.prepare === "sleeping-process") {
    const helper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true });
    runtime.tokens.helperPid = helper.pid;
    runtime.cleanup = async () => {
      if (!helper.killed) helper.kill("SIGTERM");
    };
  } else if (level.runner.prepare === "banner-service") {
    const service = net.createServer((socket) => socket.end("C3T challenge service\n"));
    await new Promise((resolve, reject) => {
      service.once("error", reject);
      service.listen(0, "127.0.0.1", resolve);
    });
    runtime.tokens.servicePort = service.address().port;
    runtime.cleanup = () => new Promise((resolve) => service.close(resolve));
  }
  return runtime;
}

export async function seedChallenge(level, challengeDir, outputDir) {
  const source = path.join(level.directory, "environment");
  await fs.mkdir(challengeDir, { recursive: true });

  try {
    const sourceInfo = await fs.stat(source);
    if (!sourceInfo.isDirectory()) throw new Error(`Challenge environment is not a directory: ${source}`);
    await fs.cp(source, challengeDir, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if ((level.runner.outputSeeds ?? []).length > 0) {
      throw new Error(`Challenge ${level.id} requires seeded files, but its environment folder is missing.`);
    }
  }

  for (const relativePath of level.runner.outputSeeds ?? []) {
    const sourceFile = path.resolve(challengeDir, relativePath);
    const destination = path.resolve(outputDir, relativePath);
    if (!sourceFile.startsWith(`${path.resolve(challengeDir)}${path.sep}`)) throw new Error("Invalid output seed path.");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(sourceFile, destination);
  }
}

async function checkoutRepository(io, job, participant, repoDir) {
  const log = (stream) => (text) => recordLog(io, job.id, stream, text);
  recordLog(io, job.id, "system", `Resolving ${participant.repoUrl}\n`);
  let commitOutput = "";
  const resolved = await runProcess({
    executable: "git",
    args: ["ls-remote", participant.repoUrl, "HEAD"],
    cwd: path.dirname(repoDir),
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 20_000,
    onStdout: (text) => {
      commitOutput += text;
    },
    onStderr: log("stderr"),
  });
  if (resolved.code !== 0) throw new Error("The repository revision could not be resolved.");
  const commit = commitOutput.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error("GitHub did not return a valid commit SHA.");
  await updateJob(job.id, { commit });

  recordLog(io, job.id, "system", `Cloning commit ${commit.slice(0, 12)}\n`);
  const clone = await runProcess({
    executable: "git",
    args: ["clone", "--no-checkout", "--filter=blob:none", participant.repoUrl, repoDir],
    cwd: path.dirname(repoDir),
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 60_000,
    onStdout: log("stdout"),
    onStderr: log("stderr"),
  });
  if (clone.code !== 0) throw new Error("Repository clone failed.");

  const checkout = await runProcess({
    executable: "git",
    args: ["checkout", "--detach", commit],
    cwd: repoDir,
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 30_000,
    onStdout: log("stdout"),
    onStderr: log("stderr"),
  });
  if (checkout.code !== 0) throw new Error("Commit checkout failed.");
  if ((await directorySize(repoDir)) > config.maxRepoBytes) throw new Error("Repository exceeds the configured size limit.");
  return commit;
}

async function executeLocal(io, job, level, participant, repoDir, outputDir, challengeDir) {
  if (!config.allowLocalExecution) {
    throw new Error("Local execution is disabled. Set ALLOW_LOCAL_EXECUTION=true only on the dedicated lab runner.");
  }

  const log = (stream) => (text) => recordLog(io, job.id, stream, text);
  const commit = await checkoutRepository(io, job, participant, repoDir);

  if (level.runner.installRequirements) {
    const requirements = path.join(repoDir, "requirements.txt");
    const exists = await fs.access(requirements).then(() => true).catch(() => false);
    if (exists) {
      recordLog(io, job.id, "system", "Installing approved level dependencies…\n");
      const install = await runProcess({
        executable: "python",
        args: ["-m", "pip", "install", "-r", requirements],
        cwd: repoDir,
        env: {},
        timeoutMs: config.jobTimeoutMs,
        onStdout: log("stdout"),
        onStderr: log("stderr"),
      });
      if (install.code !== 0) throw new Error("Dependency installation failed.");
    }
  }

  const runtime = await createRuntime(level);
  try {
    const context = {
      output: outputDir,
      challenge: challengeDir,
      jobId: job.id,
      levelId: level.id,
      baseUrl: `http://127.0.0.1:${config.port}`,
      sshTarget: "student:127.0.0.1:2222",
      ...runtime.tokens,
    };
    const args = replaceTokens(level.runner.args, context);
    recordLog(io, job.id, "system", `Running ${level.command.format}\n`);
    const result = await runProcess({
      executable: level.runner.executable === "python3" ? config.pythonExecutable : level.runner.executable,
      args,
      cwd: repoDir,
      env: {
        LAB_OUTPUT: outputDir,
        LAB_CHALLENGE_DIR: challengeDir,
        LAB_BASE_URL: context.baseUrl,
        LAB_JOB_ID: job.id,
        LAB_LEVEL: level.id,
        LAB_PARTICIPANT: participant.name,
      },
      timeoutMs: config.jobTimeoutMs,
      onStdout: log("stdout"),
      onStderr: log("stderr"),
    });
    if ((await directorySize(outputDir)) > config.maxOutputBytes) {
      throw new Error("Output folder exceeds the configured size limit.");
    }
    return { ...result, commit };
  } finally {
    await runtime.cleanup();
  }
}

function dockerMount(source, target, readOnly = false) {
  return `type=bind,source=${source},target=${target}${readOnly ? ",readonly" : ""}`;
}

async function removeDockerContainer(containerName) {
  await runProcess({
    executable: config.dockerExecutable,
    args: ["rm", "--force", containerName],
    cwd: config.jobsDir,
    env: {},
    timeoutMs: 10_000,
    onStdout: () => {},
    onStderr: () => {},
  }).catch(() => {});
}

async function executeDocker(io, job, level, participant, repoDir, outputDir, challengeDir) {
  if (!config.allowDockerExecution) {
    throw new Error("Docker execution is disabled. Set ALLOW_DOCKER_EXECUTION=true on the dedicated lab runner.");
  }

  const log = (stream) => (text) => recordLog(io, job.id, stream, text);
  const commit = await checkoutRepository(io, job, participant, repoDir);
  const containerName = `obsidian-job-${job.id.replaceAll("-", "").slice(0, 20)}`;
  const containerContext = {
    output: "/lab/output",
    challenge: "/lab/challenge",
    jobId: job.id,
    levelId: level.id,
    baseUrl: `http://host.docker.internal:${config.port}`,
    sshTarget: "student:ssh-lab:22",
  };
  const args = replaceTokens(level.runner.args, containerContext);
  const requestedCapabilities = level.runner.capabilities ?? [];
  for (const capability of requestedCapabilities) {
    if (!ALLOWED_DOCKER_CAPABILITIES.has(capability)) {
      throw new Error(`Level requested unsupported Docker capability: ${capability}`);
    }
  }
  const dockerArgs = [
    "run",
    "--rm",
    "--init",
    "--name", containerName,
    "--network", config.dockerNetwork,
    "--read-only",
    "--cap-drop", "ALL",
    ...requestedCapabilities.flatMap((capability) => ["--cap-add", capability]),
    "--security-opt", "no-new-privileges:true",
    "--memory", config.dockerMemory,
    "--cpus", config.dockerCpus,
    "--pids-limit", String(config.dockerPidsLimit),
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m,mode=1777",
    "--mount", dockerMount(repoDir, "/workspace/repo", true),
    "--mount", dockerMount(challengeDir, "/lab/challenge", true),
    "--mount", dockerMount(outputDir, "/lab/output"),
    "--env", "LAB_OUTPUT=/lab/output",
    "--env", "LAB_CHALLENGE_DIR=/lab/challenge",
    "--env", `LAB_BASE_URL=${containerContext.baseUrl}`,
    "--env", `LAB_JOB_ID=${job.id}`,
    "--env", `LAB_LEVEL=${level.id}`,
    "--env", `LAB_PARTICIPANT=${participant.name}`,
    config.dockerRunnerImage,
    "--executable", level.runner.executable === "python3" ? "python3" : level.runner.executable,
    "--args-json", JSON.stringify(args),
    "--prepare", level.runner.prepare ?? "",
  ];

  recordLog(io, job.id, "system", `Starting isolated container ${containerName}\n`);
  recordLog(io, job.id, "system", `Running ${level.command.format}\n`);
  try {
    const result = await runProcess({
      executable: config.dockerExecutable,
      args: dockerArgs,
      cwd: repoDir,
      env: {},
      timeoutMs: config.jobTimeoutMs,
      onStdout: log("stdout"),
      onStderr: log("stderr"),
    });
    if ((await directorySize(outputDir)) > config.maxOutputBytes) {
      throw new Error("Output folder exceeds the configured size limit.");
    }
    return { ...result, commit };
  } finally {
    await removeDockerContainer(containerName);
  }
}

export function startJob({ io, jobId, level = null }) {
  setImmediate(async () => {
    const job = getJob(jobId);
    const participant = getParticipant(job?.participantId);
    if (!job || !participant) return;

    const jobDir = path.join(config.jobsDir, job.id);
    const repoDir = path.join(jobDir, "repo");
    const outputDir = path.join(jobDir, "output");
    const challengeDir = path.join(jobDir, "challenge");
    let stopMonitor = () => {};

    try {
      await fs.mkdir(outputDir, { recursive: true });
      if (job.mode === "docker") await fs.chmod(outputDir, 0o777);
      if (level) await seedChallenge(level, challengeDir, outputDir);
      stopMonitor = startArtifactMonitor(io, job.id, outputDir);
      await updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });
      io.to(`job:${job.id}`).emit("job:status", getJob(job.id));
      const result = job.mode === "preview"
        ? await executePreview(io, job, level, outputDir)
        : job.mode === "docker"
          ? await executeDocker(io, job, level, participant, repoDir, outputDir, challengeDir)
          : await executeLocal(io, job, level, participant, repoDir, outputDir, challengeDir);
      const status = result.code === 0 ? "complete" : "failed";
      await updateJob(job.id, {
        status,
        exitCode: result.code,
        commit: result.commit ?? getJob(job.id).commit,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      recordLog(io, job.id, "stderr", `[runner] ${error.message}\n`);
      await updateJob(job.id, {
        status: "failed",
        exitCode: 1,
        error: error.message,
        finishedAt: new Date().toISOString(),
      });
    } finally {
      stopMonitor();
      io.to(`job:${job.id}`).emit("job:artifacts", await listArtifacts(job.id));
      io.to(`job:${job.id}`).emit("job:status", getJob(job.id));
    }
  });
}
