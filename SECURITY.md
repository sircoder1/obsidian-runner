# Security and deployment boundary

Obsidian Runner executes code cloned from public student repositories. Run it only on a dedicated lab machine or VM that does not contain personal files, credentials, production secrets, or unrelated workloads.

The recommended Docker mode provides disposable, resource-limited containers with a read-only root filesystem and narrowly scoped capabilities. It reduces risk but is not a substitute for isolating the host. Access to a rootful Docker socket or membership in the Docker group is effectively administrator-level access to that host.

Do not expose the development server directly to the public internet. For a shared deployment, place it behind an authenticated reverse proxy, restrict network access to the class or VPN, keep Docker and the host patched, and periodically remove old job data.

The bundled SSH service uses a deliberately weak classroom credential and is reachable only on the internal Docker network. Do not publish its port on the host.
