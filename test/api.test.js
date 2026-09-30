import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createApi } from "../server/api.js";

test("returns a client error for a non-GitHub repository URL", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api", createApi({}));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/participants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Validation User", repoUrl: "https://example.com/not-github" }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Use an HTTPS URL from github.com." });
});
