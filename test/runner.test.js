import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { seedChallenge } from "../server/runner.js";

test("seeds an empty challenge when the optional environment folder is absent", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-runner-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const level = {
    id: "01-example",
    directory: path.join(root, "level"),
    runner: { outputSeeds: [] },
  };
  const challengeDir = path.join(root, "job", "challenge");
  const outputDir = path.join(root, "job", "output");
  await fs.mkdir(outputDir, { recursive: true });

  await seedChallenge(level, challengeDir, outputDir);

  assert.equal((await fs.stat(challengeDir)).isDirectory(), true);
  assert.deepEqual(await fs.readdir(challengeDir), []);
});

test("reports a clear error when required output seeds have no environment folder", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-runner-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const level = {
    id: "seeded-level",
    directory: path.join(root, "level"),
    runner: { outputSeeds: ["required.txt"] },
  };

  await assert.rejects(
    seedChallenge(level, path.join(root, "challenge"), path.join(root, "output")),
    /requires seeded files, but its environment folder is missing/,
  );
});
