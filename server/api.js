import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "./config.js";
import { getLevel, publicCatalog } from "./catalog.js";
import { listArtifacts, startJob } from "./runner.js";
import { createJob, createParticipant, getJob, getParticipant } from "./store.js";
import {
  displayRepoUrl,
  InputError,
  normalizeArtifactPath,
  normalizeGitHubRepoUrl,
  normalizeStudentName,
} from "./validation.js";

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function requireOwnedJob(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) {
    fail(res, 404, "Job not found.");
    return null;
  }
  const participantId = req.query.participantId || req.header("x-participant-id");
  if (!participantId || job.participantId !== participantId) {
    fail(res, 403, "This job does not belong to the current participant.");
    return null;
  }
  return job;
}

export function createApi(io) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, runnerMode: config.runnerMode, curriculumStatus: "published", levelCount: 32 });
  });

  router.get("/catalog", async (_req, res, next) => {
    try {
      res.json({ ...(await publicCatalog()), status: "published" });
    } catch (error) {
      next(error);
    }
  });

  router.post("/participants", async (req, res, next) => {
    try {
      const name = normalizeStudentName(req.body?.name);
      const repoUrl = normalizeGitHubRepoUrl(req.body?.repoUrl);
      const participant = await createParticipant({ name, repoUrl });
      res.status(201).json({ ...participant, repoUrl: displayRepoUrl(participant.repoUrl) });
    } catch (error) {
      if (error instanceof InputError) {
        return fail(res, 400, error.message);
      }
      next(error);
    }
  });

  router.get("/participants/:participantId", (req, res) => {
    const participant = getParticipant(req.params.participantId);
    if (!participant) return fail(res, 404, "Participant not found.");
    res.json({ ...participant, repoUrl: displayRepoUrl(participant.repoUrl) });
  });

  router.post("/jobs/preview", async (req, res, next) => {
    try {
      const participant = getParticipant(req.body?.participantId);
      if (!participant) return fail(res, 404, "Participant not found.");
      const job = await createJob({ participantId: participant.id, levelId: "system-preview", mode: "preview" });
      startJob({ io, jobId: job.id });
      res.status(202).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.post("/jobs", async (req, res, next) => {
    try {
      const participant = getParticipant(req.body?.participantId);
      if (!participant) return fail(res, 404, "Participant not found.");
      const level = await getLevel(req.body?.levelId);
      if (!level) return fail(res, 404, "That level has not been approved or published.");
      const job = await createJob({ participantId: participant.id, levelId: level.id, mode: config.runnerMode });
      startJob({ io, jobId: job.id, level });
      res.status(202).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.get("/jobs/:jobId", (req, res) => {
    const job = requireOwnedJob(req, res);
    if (job) res.json(job);
  });

  router.get("/jobs/:jobId/artifacts", async (req, res, next) => {
    try {
      const job = requireOwnedJob(req, res);
      if (!job) return;
      res.json({ files: await listArtifacts(job.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/jobs/:jobId/artifacts/*artifactPath", async (req, res, next) => {
    try {
      const job = requireOwnedJob(req, res);
      if (!job) return;
      const rawPath = Array.isArray(req.params.artifactPath)
        ? req.params.artifactPath.join("/")
        : req.params.artifactPath;
      const artifactPath = normalizeArtifactPath(rawPath);
      const outputRoot = path.resolve(config.jobsDir, job.id, "output");
      const absolute = path.resolve(outputRoot, artifactPath);
      if (!absolute.startsWith(`${outputRoot}${path.sep}`)) return fail(res, 400, "Artifact path is invalid.");
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) return fail(res, 404, "Artifact not found.");
      res.sendFile(absolute);
    } catch (error) {
      if (error.code === "ENOENT") return fail(res, 404, "Artifact not found.");
      if (error instanceof InputError) return fail(res, 400, error.message);
      next(error);
    }
  });

  return router;
}
