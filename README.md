# Obsidian Runner

Obsidian Runner is the infrastructure and interface for a guided, Git-backed Python red-team class. A student identifies themselves, connects a public GitHub repository, opens an approved level, runs the exact server-owned command for that level, and sees live process output plus files written to that job's output folder.

The approved curriculum contains 32 independent levels across Foundations, Files, System, Network, Data, and Operations. Students can open any level, move forward at any time, and star levels locally for later review. There is intentionally no grading gate.

## Quick start from GitHub

Prerequisites:

- Git
- Node.js 22 or newer
- Docker Desktop on Windows/macOS, or Docker Engine with Compose on Linux

Clone the lab, enter its folder, and run one setup command:

```powershell
git clone https://github.com/sircoder1/obsidian-runner.git
cd obsidian-runner
.\setup.ps1
```

On Linux:

```bash
git clone https://github.com/sircoder1/obsidian-runner.git
cd obsidian-runner
sh setup.sh
```

The setup script creates a Docker-mode `.env` when needed, installs the locked Node dependencies, runs tests, builds the disposable runner, starts the private SSH lab, verifies the complete Docker environment, and starts the website. Open `http://127.0.0.1:4173`. Stop the website with `Ctrl+C`; stop the background lab service with `npm run docker:down`.

Setup is idempotent: rerun the same script after pulling updates. Setup always configures Docker execution, including when an existing `.env` uses preview or local mode. It sets `RUNNER_MODE=docker`, `ALLOW_DOCKER_EXECUTION=true`, and `ALLOW_LOCAL_EXECUTION=false`, while preserving other settings such as the port and Docker resource limits. To intentionally use preview mode, edit `.env` after setup and start the website with `npm start`.

## What is implemented

- Obsidian / black-and-gold responsive interface
- Student name and public GitHub repository onboarding
- Persistent participant and job metadata
- Folder-backed server-owned curriculum catalog with 32 levels
- Level browser with category navigation, Next, and persistent stars
- Per-level scenario, command template, exact machine format, parameters, and expected output
- Two level-specific learning links from W3Schools or the relevant primary documentation
- Socket.IO live job output
- Live output-folder artifact discovery
- Per-job artifact access restricted to the owning participant id
- Canonical GitHub URL validation and path-traversal rejection
- Exact Git commit resolution and detached checkout in the local runner
- Configurable time, repository-size, and output-size settings
- Harmless preview runner for interface review
- Disposable, resource-limited Docker runner for student code
- Opt-in local execution runner for the eventual approved levels

## Start the preview

```powershell
npm install
npm start
```

Open `http://127.0.0.1:4173`.

The default `RUNNER_MODE=preview` does not clone or execute student code. Any level can still be run to demonstrate its live event and artifact pipeline.

To return from Docker mode to preview mode, edit `.env` and set `RUNNER_MODE=preview` and `ALLOW_DOCKER_EXECUTION=false`.

## Runner modes

### Preview mode (default)

```env
RUNNER_MODE=preview
ALLOW_LOCAL_EXECUTION=false
```

This is the mode to use while reviewing the interface and curriculum.

### Docker execution mode (recommended)

Build the runner image and start the isolated SSH lab once:

```powershell
docker build --file Dockerfile.runner --tag obsidian-runner-python:latest .
docker compose --file compose.lab.yml up --detach --build
```

Then configure the Node service:

```env
RUNNER_MODE=docker
ALLOW_DOCKER_EXECUTION=true
DOCKER_RUNNER_IMAGE=obsidian-runner-python:latest
DOCKER_NETWORK=obsidian-lab
```

Each run gets a fresh container with a read-only root filesystem, a PID limit, one CPU, 384 MB of memory, an internal-only lab network, and only three explicit mounts: a read-only repository checkout, a read-only challenge folder, and a writable output folder. Linux capabilities are removed by default; the ping level receives only `NET_RAW` so ICMP can run. The container is removed after the command exits or times out. The Node service stays on the host; it does not need access to the Docker socket from inside another container.

System inspection commands report the disposable lab container, not the Node host or VM. The ports level therefore starts a temporary TCP service inside that same container so students have a real listening endpoint to discover without exposing the web service or weakening namespace isolation.

### Local execution mode

```env
RUNNER_MODE=local
ALLOW_LOCAL_EXECUTION=true
```

Local mode clones the student's public repository, checks out the exact recorded commit, and executes the approved level command directly on the server. It is deliberately gated by both values so it cannot be enabled accidentally.

> Local mode runs repository code with the service account's permissions. Docker mode is the intended deployment configuration; keep local mode only for trusted debugging.

## Challenge folders

Every level lives beneath `challenges/<level-id>/` with a `manifest.json` and an `environment/` folder. The browser submits only a `levelId`; it never supplies an executable or argument list. The service loads the trusted manifest and copies that level's environment into a fresh job directory.

Each manifest defines:

1. Category and progression position
2. Student-facing situation and objective
3. Command template shown to the student
4. Exact command format and machine-supplied parameters
5. Server-only executable and argument list
6. Expected files or structured results
7. Optional runtime preparation such as a disposable process or banner service
8. Helpful implementation resources displayed alongside the level

Regenerate all manifests and deterministic fixtures with:

```powershell
npm run challenges:generate
```

## Repository contract

The final contract will be agreed with the levels. The current runner already provides these environment variables:

```text
LAB_OUTPUT       absolute path to the only published output folder
LAB_JOB_ID       unique execution id
LAB_LEVEL        approved level id
LAB_PARTICIPANT  student's display name
```

Only files beneath `LAB_OUTPUT` are listed and served by the results API.

## Project layout

```text
challenges/            one manifest and environment folder per level
scripts/               deterministic challenge generator
public/                single-page classroom interface
server/api.js          participants, catalog, jobs, artifacts
server/catalog.js      challenge-folder loader
server/runner.js       preview, Docker, and local Git-backed execution
server/store.js        small persistent JSON metadata store
server/validation.js   GitHub and artifact-path boundaries
test/                  built-in Node test suite
work/jobs/             generated job repositories and output folders
```

## Verify

```powershell
npm test
```

For a complete Docker verification, run:

```powershell
npm run docker:verify
```

GitHub Actions runs the Node tests plus the complete Docker build and verification workflow for every push and pull request.

## Updating an installed copy

```bash
git pull --ff-only
sh setup.sh
```

On Windows, replace the second line with `.\setup.ps1`.

Before sharing or deploying this project, read [SECURITY.md](SECURITY.md). The runner executes student repository code and belongs on a dedicated lab machine or VM.
