import test from "node:test";
import assert from "node:assert/strict";
import { getLevel, publicCatalog } from "../server/catalog.js";

test("loads all approved challenge folders", async () => {
  const catalog = await publicCatalog();
  assert.equal(catalog.categories.length, 6);
  assert.equal(catalog.levels.length, 32);
  assert.equal(catalog.levels[0].id, "01-example");
  assert.ok(catalog.levels.every((level) => level.resources.length >= 2));
  assert.ok(catalog.levels.flatMap((level) => level.resources).every((resource) => resource.url.startsWith("https://")));
  assert.equal(await getLevel("not-approved"), null);
  assert.equal((await getLevel("30-sqlite")).runner.args[1], "sqlite");
  assert.deepEqual((await getLevel("21-ping")).runner.capabilities, ["NET_RAW"]);
  assert.equal((await getLevel("22-ports")).runner.prepare, "banner-service");
});
