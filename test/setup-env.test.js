import test from "node:test";
import assert from "node:assert/strict";
import { dockerSetupEnv } from "../scripts/setup-env.js";

test("migrates preview settings without losing custom Windows settings", () => {
  const source = "# My lab\r\nPORT=5000\r\nRUNNER_MODE=preview\r\nALLOW_LOCAL_EXECUTION=true\r\nALLOW_DOCKER_EXECUTION=false\r\nDOCKER_MEMORY=768m\r\n";
  const result = dockerSetupEnv(source);
  assert.equal(result, "# My lab\r\nPORT=5000\r\nRUNNER_MODE=docker\r\nALLOW_LOCAL_EXECUTION=false\r\nALLOW_DOCKER_EXECUTION=true\r\nDOCKER_MEMORY=768m\r\n");
  assert.equal(dockerSetupEnv(result), result);
});

test("adds absent settings and overrides all duplicate or exported assignments", () => {
  const result = dockerSetupEnv("export RUNNER_MODE = preview\nRUNNER_MODE=local\nPORT=5000");
  assert.equal(result, "RUNNER_MODE=docker\nRUNNER_MODE=docker\nPORT=5000\nALLOW_LOCAL_EXECUTION=false\nALLOW_DOCKER_EXECUTION=true\n");
  assert.equal(dockerSetupEnv(result), result);
});
