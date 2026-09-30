import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./config.js";

const challengeRoot = path.join(projectRoot, "challenges");

function validateManifest(manifest, directory) {
  const required = ["id", "categoryId", "order", "title", "situation", "command", "runner", "resources"];
  for (const key of required) {
    if (manifest[key] === undefined || manifest[key] === null) {
      throw new Error(`Challenge ${directory} is missing ${key}.`);
    }
  }
  if (!Array.isArray(manifest.runner.args) || typeof manifest.runner.executable !== "string") {
    throw new Error(`Challenge ${directory} has an invalid runner command.`);
  }
  if (manifest.runner.capabilities !== undefined && !Array.isArray(manifest.runner.capabilities)) {
    throw new Error(`Challenge ${directory} has invalid runner capabilities.`);
  }
  if (!Array.isArray(manifest.resources) || manifest.resources.length === 0) {
    throw new Error(`Challenge ${directory} must include learning resources.`);
  }
  for (const resource of manifest.resources) {
    if (typeof resource.title !== "string" || typeof resource.url !== "string") {
      throw new Error(`Challenge ${directory} has an invalid learning resource.`);
    }
    const url = new URL(resource.url);
    if (url.protocol !== "https:") throw new Error(`Challenge ${directory} has a non-HTTPS learning resource.`);
  }
}

export async function loadCatalog() {
  const categories = JSON.parse(await fs.readFile(path.join(challengeRoot, "categories.json"), "utf8"));
  const entries = await fs.readdir(challengeRoot, { withFileTypes: true });
  const levels = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(challengeRoot, entry.name);
    const manifestPath = path.join(directory, "manifest.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      validateManifest(manifest, entry.name);
      levels.push({ ...manifest, directory });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  categories.sort((a, b) => a.order - b.order);
  const categoryOrder = new Map(categories.map((category) => [category.id, category.order]));
  levels.sort((a, b) => (categoryOrder.get(a.categoryId) ?? 999) - (categoryOrder.get(b.categoryId) ?? 999) || a.order - b.order);
  return { categories, levels };
}

export async function getLevel(levelId) {
  const { levels } = await loadCatalog();
  return levels.find((item) => item.id === levelId) ?? null;
}

export async function publicCatalog() {
  const { categories, levels } = await loadCatalog();
  return {
    categories,
    levels: levels.map(({ runner: _runner, directory: _directory, ...item }) => item),
  };
}
