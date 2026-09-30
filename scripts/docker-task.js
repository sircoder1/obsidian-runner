import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const windowsCandidate = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Programs", "DockerDesktop", "resources", "bin", "docker.exe")
  : null;
const candidates = [process.env.DOCKER_EXECUTABLE, "docker", windowsCandidate].filter(Boolean);

function dockerEnvironment(executable) {
  const executableDir = path.dirname(executable);
  if (executableDir === ".") return process.env;
  return { ...process.env, PATH: `${executableDir}${path.delimiter}${process.env.PATH ?? ""}` };
}

function works(executable) {
  const result = spawnSync(executable, ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    env: dockerEnvironment(executable),
    windowsHide: true,
  });
  return result.status === 0;
}

const docker = candidates.find(works);
if (!docker) {
  console.error("Docker is not reachable. Start Docker Desktop or set DOCKER_EXECUTABLE to the Docker CLI path.");
  process.exit(1);
}

function run(args, options = {}) {
  const result = spawnSync(docker, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: dockerEnvironment(docker),
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`Docker command failed with exit code ${result.status ?? "unknown"}.`);
  }
  return result;
}

function securedRun(outputDir, prepare, pythonCode, extra = []) {
  const commandArgs = ["-c", pythonCode];
  if (prepare === "banner-service") commandArgs.push("{servicePort}");
  if (prepare === "sleeping-process") commandArgs.push("{helperPid}");
  if (prepare === "download-service") commandArgs.push("{downloadUrl}");
  run([
    "run", "--rm", "--init",
    "--network", "obsidian-lab",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--memory", "384m",
    "--cpus", "1.0",
    "--pids-limit", "128",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m,mode=1777",
    "--mount", `type=bind,source=${outputDir},target=/lab/output`,
    ...extra,
    "obsidian-runner-python:latest",
    "--executable", "python3",
    "--args-json", JSON.stringify(commandArgs),
    "--prepare", prepare,
  ]);
}

function verify() {
  run(["image", "inspect", "obsidian-runner-python:latest"], { capture: true });
  run(["network", "inspect", "obsidian-lab"], { capture: true });
  const sshState = run(["inspect", "--format", "{{.State.Running}}", "obsidian-ssh-lab"], { capture: true });
  if (sshState.stdout.trim() !== "true") throw new Error("The isolated SSH lab is not running.");

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-docker-check-"));
  try {
    fs.chmodSync(outputDir, 0o777);
    securedRun(
      outputDir,
      "banner-service",
      "import pathlib,socket,sys; data=socket.create_connection(('127.0.0.1',int(sys.argv[1])),3).recv(128); pathlib.Path('/lab/output/banner.txt').write_bytes(data)",
    );
    securedRun(
      outputDir,
      "sleeping-process",
      "import os,pathlib,signal,sys; os.kill(int(sys.argv[1]),signal.SIGTERM); pathlib.Path('/lab/output/process.txt').write_text('terminated\\n')",
    );
    securedRun(
      outputDir,
      "download-service",
      "import pathlib,sys,urllib.request; data=urllib.request.urlopen(sys.argv[1],timeout=3).read(); pathlib.Path('/lab/output/download.json').write_bytes(data)",
      ["--mount", `type=bind,source=${path.join(projectRoot, "challenges", "25-download", "environment")},target=/lab/challenge,readonly`],
    );
    securedRun(
      outputDir,
      "virtual-display",
      "from PIL import ImageGrab; ImageGrab.grab().save('/lab/output/screenshot.png')",
    );
    securedRun(
      outputDir,
      "",
      "import paramiko,pathlib; c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect('ssh-lab',username='student',password='obsidian',look_for_keys=False,allow_agent=False,timeout=5); c.close(); pathlib.Path('/lab/output/ssh.txt').write_text('connected\\n')",
    );
    const expected = ["banner.txt", "process.txt", "download.json", "screenshot.png", "ssh.txt"];
    for (const name of expected) {
      const stat = fs.statSync(path.join(outputDir, name));
      if (!stat.isFile() || stat.size === 0) throw new Error(`${name} was not created correctly.`);
    }
    console.log("Docker verification passed: process, banner, download, virtual display, output mount, and SSH lab helpers are working.");
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

const action = process.argv[2];
if (action === "build") {
  run(["build", "--file", "Dockerfile.runner", "--tag", "obsidian-runner-python:latest", "."]);
} else if (action === "lab") {
  run(["compose", "--file", "compose.lab.yml", "up", "--detach", "--build"]);
} else if (action === "verify") {
  verify();
} else if (action === "down") {
  run(["compose", "--file", "compose.lab.yml", "down"]);
} else {
  console.error("Usage: node scripts/docker-task.js <build|lab|verify|down>");
  process.exit(2);
}
