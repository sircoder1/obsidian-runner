import test from "node:test";
import assert from "node:assert/strict";
import {
  displayRepoUrl,
  normalizeArtifactPath,
  normalizeGitHubRepoUrl,
  normalizeStudentName,
} from "../server/validation.js";

test("normalizes a student name", () => {
  assert.equal(normalizeStudentName("  Ada   Lovelace  "), "Ada Lovelace");
});

test("accepts and canonicalizes a public GitHub repository URL", () => {
  assert.equal(
    normalizeGitHubRepoUrl("https://github.com/openai/openai-node"),
    "https://github.com/openai/openai-node.git",
  );
  assert.equal(displayRepoUrl("https://github.com/openai/openai-node.git"), "https://github.com/openai/openai-node");
});

test("rejects non-GitHub and credential-bearing repository URLs", () => {
  assert.throws(() => normalizeGitHubRepoUrl("https://gitlab.com/a/b"), /github\.com/i);
  assert.throws(() => normalizeGitHubRepoUrl("https://token@github.com/a/b"), /credentials/i);
  assert.throws(() => normalizeGitHubRepoUrl("file:///tmp/repo"), /github\.com/i);
});

test("requires owner and repository only", () => {
  assert.throws(() => normalizeGitHubRepoUrl("https://github.com/a"), /form/i);
  assert.throws(() => normalizeGitHubRepoUrl("https://github.com/a/b/issues"), /form/i);
});

test("rejects output-folder traversal", () => {
  assert.equal(normalizeArtifactPath("reports/result.json"), "reports/result.json");
  assert.throws(() => normalizeArtifactPath("../state.json"), /invalid/i);
  assert.throws(() => normalizeArtifactPath("reports//result.json"), /invalid/i);
});
