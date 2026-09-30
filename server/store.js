import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const statePath = path.join(config.dataDir, "state.json");
let state = { participants: {}, jobs: {} };
let writeQueue = Promise.resolve();

export async function initializeStore() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.jobsDir, { recursive: true });
  try {
    state = JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await persist();
  }
}

function persist() {
  writeQueue = writeQueue.then(async () => {
    const temporary = `${statePath}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(temporary, statePath);
  });
  return writeQueue;
}

export async function createParticipant({ name, repoUrl }) {
  const id = crypto.randomUUID();
  const participant = {
    id,
    name,
    repoUrl,
    createdAt: new Date().toISOString(),
    completedLevelIds: [],
  };
  state.participants[id] = participant;
  await persist();
  return structuredClone(participant);
}

export function getParticipant(id) {
  const participant = state.participants[id];
  return participant ? structuredClone(participant) : null;
}

export async function createJob({ participantId, levelId, mode }) {
  const id = crypto.randomUUID();
  const job = {
    id,
    participantId,
    levelId,
    mode,
    status: "queued",
    commit: null,
    exitCode: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString(),
    error: null,
  };
  state.jobs[id] = job;
  await persist();
  return structuredClone(job);
}

export function getJob(id) {
  const job = state.jobs[id];
  return job ? structuredClone(job) : null;
}

export async function updateJob(id, patch) {
  if (!state.jobs[id]) throw new Error("Job not found.");
  state.jobs[id] = { ...state.jobs[id], ...patch };
  await persist();
  return structuredClone(state.jobs[id]);
}
