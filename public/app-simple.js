const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const socket = io();

const icons = {
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="m7 9 3 3-3 3M13 15h4"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="10" width="16" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m8 5 11 7-11 7V5Z"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,
};

const state = {
  participant: null,
  catalog: { categories: [], levels: [] },
  selectedLevelId: null,
  starredIds: new Set(),
  job: null,
  logs: [],
  artifacts: [],
};

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function toast(message, type = "info") {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;
  toastRegion.append(element);
  setTimeout(() => element.remove(), 4200);
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

function brand() {
  return `<div class="brand"><div class="brand-mark" aria-hidden="true"></div><div class="brand-copy"><span class="brand-name">OBSIDIAN RUNNER</span><span class="brand-sub">Python red team lab</span></div></div>`;
}

function onboardingView() {
  app.innerHTML = `
    <div class="setup-page">
      <header class="setup-header">${brand()}</header>
      <main class="setup-main">
        <section class="setup-intro">
          <h1>Build your Python<br><span>red-team tool.</span></h1>
          <p>Connect a public GitHub repository. Each course level will give you a task and an exact command contract, then show the live result from the lab machine.</p>
          <div class="simple-steps">
            <div class="simple-step"><b>1</b>Complete the level in your repository</div>
            <div class="simple-step"><b>2</b>Push your changes to GitHub</div>
            <div class="simple-step"><b>3</b>Run and inspect the output files</div>
          </div>
        </section>
        <form class="setup-card" id="onboarding-form">
          <h2>Set up your workspace</h2>
          <p>This information identifies your runs and repository.</p>
          <div class="field"><label for="student-name">Name</label><input id="student-name" name="name" autocomplete="name" minlength="2" maxlength="80" placeholder="Ada Lovelace" required /></div>
          <div class="field"><label for="repo-url">Public GitHub repository</label><input id="repo-url" name="repoUrl" type="url" inputmode="url" placeholder="https://github.com/you/redtool" required /><span class="field-help">Expected format: https://github.com/owner/repository</span></div>
          <button class="primary-button" type="submit"><span>Continue</span></button>
        </form>
      </main>
    </div>`;
  document.querySelector("#onboarding-form").addEventListener("submit", handleOnboarding);
}

async function handleOnboarding(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.querySelector("span").textContent = "Setting up…";
  try {
    state.participant = await api("/participants", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    localStorage.setItem("obsidianParticipantId", state.participant.id);
    state.catalog = await api("/catalog");
    loadProgress();
    dashboardView();
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
    button.querySelector("span").textContent = "Continue";
  }
}

function repoLabel(url) { return url.replace(/^https:\/\/github\.com\//, ""); }

function progressKey() { return `obsidianProgress:${state.participant.id}`; }

function loadProgress() {
  const saved = JSON.parse(localStorage.getItem(progressKey()) || "{}");
  state.starredIds = new Set(Array.isArray(saved.starredIds) ? saved.starredIds : []);
  state.selectedLevelId = state.catalog.levels.some((item) => item.id === saved.selectedLevelId)
    ? saved.selectedLevelId
    : state.catalog.levels[0]?.id ?? null;
}

function saveProgress() {
  localStorage.setItem(progressKey(), JSON.stringify({
    selectedLevelId: state.selectedLevelId,
    starredIds: [...state.starredIds],
  }));
}

function selectedLevel() {
  return state.catalog.levels.find((item) => item.id === state.selectedLevelId) ?? state.catalog.levels[0];
}

function levelListMarkup() {
  return state.catalog.categories.map((category) => {
    const levels = state.catalog.levels.filter((item) => item.categoryId === category.id);
    return `<div class="level-category"><div class="level-category-name">${escapeHtml(category.title)}<span>${levels.length}</span></div>${levels.map((item) => `
      <button class="level-item ${item.id === state.selectedLevelId ? "active" : ""}" data-level-id="${escapeHtml(item.id)}">
        <span class="level-index">${String(item.order).padStart(2, "0")}</span><span class="level-name">${escapeHtml(item.title)}</span><span class="level-star">${state.starredIds.has(item.id) ? "★" : ""}</span>
      </button>`).join("")}</div>`;
  }).join("");
}

function parameterMarkup(level) {
  if (!level.command.parameters.length) return `<p>No command arguments are supplied for this level.</p>`;
  return `<div class="parameter-list">${level.command.parameters.map((parameter) => `
    <div class="parameter"><code>${escapeHtml(parameter.name)}</code><div><strong>${escapeHtml(parameter.value)}</strong><span>${escapeHtml(parameter.description)}</span></div></div>`).join("")}</div>`;
}

function resourceMarkup(level) {
  return `<div class="resource-list">${level.resources.map((resource) => `
    <a class="resource-link" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">
      <span>${escapeHtml(resource.title)}</span><span aria-hidden="true">↗</span>
    </a>`).join("")}</div>`;
}

function dashboardView() {
  const person = state.participant;
  const level = selectedLevel();
  const currentIndex = state.catalog.levels.findIndex((item) => item.id === level.id);
  const isStarred = state.starredIds.has(level.id);
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        ${brand()}
        <div class="sidebar-label">Navigation</div>
        <nav class="nav" aria-label="Course navigation">
          <button class="nav-item">${icons.grid}<span>Overview</span></button>
          <button class="nav-item active">${icons.layers}<span>Levels</span><span class="nav-count">${state.catalog.levels.length}</span></button>
          <button class="nav-item">${icons.terminal}<span>Runs</span><span class="nav-count" id="run-count">${state.job ? "1" : "0"}</span></button>
        </nav>
        <div class="student-card"><div class="student-name">${escapeHtml(person.name)}</div><div class="student-repo">${escapeHtml(repoLabel(person.repoUrl))}</div><button class="text-button" id="change-profile">Change workspace</button></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-course"><div class="page-title">Course levels</div><div class="topbar-meta">${state.catalog.levels.length} levels · ${state.starredIds.size} starred</div></div>
          <div class="topbar-right"><div class="topbar-identity"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(repoLabel(person.repoUrl))}</span></div><div class="service-status"><i class="status-dot"></i>Service online</div></div>
        </header>
        <div class="content course-content">
          <section class="section course-section">
            <div class="course-layout">
              <aside class="level-list">${levelListMarkup()}</aside>
              <div class="level-workspace">
                <header class="level-header"><div><span class="level-counter">Level ${currentIndex + 1} of ${state.catalog.levels.length}</span><h2>${escapeHtml(level.title)}</h2></div><button class="star-button ${isStarred ? "active" : ""}" id="toggle-star" aria-label="${isStarred ? "Remove star" : "Star level"}">${isStarred ? "★ Starred" : "☆ Star"}</button></header>
                <div class="workspace">
                  <div class="briefing">
                    <div class="briefing-row"><h3>Situation</h3><p>${escapeHtml(level.situation)}</p></div>
                    <div class="briefing-row"><h3>Command template</h3><div class="command-box"><b>$</b> ${escapeHtml(level.command.template)}</div></div>
                    <div class="briefing-row"><h3>Command run by the machine</h3><div class="command-box"><b>$</b> ${escapeHtml(level.command.format)}</div></div>
                    <div class="briefing-row"><h3>Parameters</h3>${parameterMarkup(level)}</div>
                    <div class="briefing-row"><h3>Expected output</h3><p>${escapeHtml(level.expectedOutput)}</p></div>
                    <div class="briefing-row"><h3>Helpful resources</h3>${resourceMarkup(level)}</div>
                    <div class="run-row"><button class="primary-button" id="run-level">${icons.play}<span>Run level</span></button><button class="secondary-button" id="next-level">Next level</button></div>
                  </div>
                  <div class="runner-panel">
                    <div class="runner-tabs"><span class="runner-tab">Live output</span><span class="job-status" id="job-status">idle</span></div>
                    <div class="terminal-output" id="terminal-output"><span class="terminal-line system">runner$</span> waiting<span class="terminal-caret"></span></div>
                    <div class="artifacts"><div class="artifact-heading"><span>Output folder</span><span id="artifact-count">0 files</span></div><div class="artifact-list" id="artifact-list"><span class="artifact-empty">No files yet.</span></div></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>`;
  document.querySelector("#change-profile").addEventListener("click", resetWorkspace);
  document.querySelectorAll(".level-item").forEach((button) => button.addEventListener("click", () => selectLevel(button.dataset.levelId)));
  document.querySelector("#toggle-star").addEventListener("click", toggleStar);
  document.querySelector("#next-level").addEventListener("click", nextLevel);
  document.querySelector("#run-level").addEventListener("click", runLevel);
  renderJobState();
}

function selectLevel(levelId) {
  state.selectedLevelId = levelId;
  state.job = null;
  state.logs = [];
  state.artifacts = [];
  saveProgress();
  dashboardView();
}

function toggleStar() {
  if (state.starredIds.has(state.selectedLevelId)) state.starredIds.delete(state.selectedLevelId);
  else state.starredIds.add(state.selectedLevelId);
  saveProgress();
  dashboardView();
}

function nextLevel() {
  const current = state.catalog.levels.findIndex((item) => item.id === state.selectedLevelId);
  selectLevel(state.catalog.levels[(current + 1) % state.catalog.levels.length].id);
}

function resetWorkspace() {
  localStorage.removeItem("obsidianParticipantId");
  Object.assign(state, { participant: null, job: null, logs: [], artifacts: [] });
  onboardingView();
}

async function runLevel() {
  const button = document.querySelector("#run-level");
  button.disabled = true;
  button.querySelector("span").textContent = "Starting…";
  state.logs = [];
  state.artifacts = [];
  renderJobState();
  try {
    state.job = await api("/jobs", { method: "POST", body: JSON.stringify({ participantId: state.participant.id, levelId: state.selectedLevelId }) });
    socket.emit("watch-job", { jobId: state.job.id, participantId: state.participant.id });
    renderJobState();
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
    button.querySelector("span").textContent = "Run level";
  }
}

function renderJobState() {
  const terminal = document.querySelector("#terminal-output");
  const artifactList = document.querySelector("#artifact-list");
  const artifactCount = document.querySelector("#artifact-count");
  const jobStatus = document.querySelector("#job-status");
  const runCount = document.querySelector("#run-count");
  if (!terminal || !artifactList) return;
  if (runCount) runCount.textContent = state.job ? "1" : "0";
  if (jobStatus) jobStatus.textContent = state.job?.status || "idle";
  if (state.logs.length) {
    terminal.innerHTML = state.logs.map((line) => `<span class="terminal-line ${escapeHtml(line.stream)}">${escapeHtml(line.text)}</span>`).join("");
    if (["running", "queued"].includes(state.job?.status)) terminal.innerHTML += `<span class="terminal-caret"></span>`;
    terminal.scrollTop = terminal.scrollHeight;
  }
  artifactCount.textContent = `${state.artifacts.length} ${state.artifacts.length === 1 ? "file" : "files"}`;
  artifactList.innerHTML = state.artifacts.length
    ? state.artifacts.map((file) => {
        const href = `/api/jobs/${encodeURIComponent(state.job.id)}/artifacts/${file.path.split("/").map(encodeURIComponent).join("/")}?participantId=${encodeURIComponent(state.participant.id)}`;
        return `<a class="artifact" href="${href}" target="_blank" rel="noopener">${icons.file}<span>${escapeHtml(file.path)}</span><span class="artifact-size">${formatBytes(file.size)}</span></a>`;
      }).join("")
    : `<span class="artifact-empty">No files yet.</span>`;
  const button = document.querySelector("#run-level");
  if (button && ["complete", "failed"].includes(state.job?.status)) {
    button.disabled = false;
    button.querySelector("span").textContent = state.job.status === "complete" ? "Run again" : "Retry";
  }
}

function formatBytes(bytes) { return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`; }

socket.on("job:history", (history) => { state.logs = history; renderJobState(); });
socket.on("job:log", (entry) => { state.logs.push(entry); renderJobState(); });
socket.on("job:artifacts", (files) => { state.artifacts = files; renderJobState(); });
socket.on("job:status", (job) => {
  if (state.job?.id !== job.id) return;
  state.job = job;
  renderJobState();
  if (job.status === "complete") toast("Level run complete.");
  if (job.status === "failed") toast(job.error || "The systems check failed.", "error");
});
socket.on("job:error", ({ message }) => toast(message, "error"));

async function initialize() {
  const participantId = localStorage.getItem("obsidianParticipantId");
  if (!participantId) return onboardingView();
  try {
    [state.participant, state.catalog] = await Promise.all([api(`/participants/${encodeURIComponent(participantId)}`), api("/catalog")]);
    loadProgress();
    dashboardView();
  } catch {
    localStorage.removeItem("obsidianParticipantId");
    onboardingView();
  }
}

initialize();
