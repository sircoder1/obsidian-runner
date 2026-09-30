const MAX_NAME_LENGTH = 80;

export class InputError extends Error {}

export function normalizeStudentName(value) {
  if (typeof value !== "string") throw new InputError("Enter your name.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
    throw new InputError("Name must be between 2 and 80 characters.");
  }
  return name;
}

export function normalizeGitHubRepoUrl(value) {
  if (typeof value !== "string") throw new InputError("Enter a GitHub repository URL.");

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new InputError("Enter a valid GitHub repository URL.");
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new InputError("Use an HTTPS URL from github.com.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new InputError("Repository URLs cannot contain credentials, query strings, or fragments.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new InputError("Use a repository URL in the form https://github.com/owner/repository.");
  }

  const cleanPart = (part) => part.replace(/\.git$/i, "");
  const owner = cleanPart(parts[0]);
  const repo = cleanPart(parts[1]);
  const validSegment = /^[A-Za-z0-9_.-]+$/;
  if (!owner || !repo || !validSegment.test(owner) || !validSegment.test(repo)) {
    throw new InputError("The GitHub owner or repository name is not valid.");
  }

  return `https://github.com/${owner}/${repo}.git`;
}

export function displayRepoUrl(normalizedUrl) {
  return normalizedUrl.replace(/\.git$/i, "");
}

export function normalizeArtifactPath(value) {
  if (typeof value !== "string" || !value.trim()) throw new InputError("Artifact path is required.");
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new InputError("Artifact path is invalid.");
  }
  return normalized;
}
