# Linux VM deployment notes

Recommended runtime baseline:

- Node.js 22 or newer
- Git
- Docker Engine with the Compose plugin
- Nginx or another reverse proxy
- A dedicated `obsidian-runner` service account

Build the disposable runner and start the isolated lab service:

```bash
cd /opt/obsidian-runner
npm ci
npm run docker:build
npm run docker:lab
npm run docker:verify
```

Copy `deploy/obsidian-runner.env.example` to `/etc/obsidian-runner.env`. Docker mode is the recommended production mode. The Node service clones and pins the public repository, then starts one disposable container per run. Python, Paramiko, Pillow, psutil, ping, process tools, and Xvfb are already present in the image. Containers have all Linux capabilities removed by default; only the ping level receives `NET_RAW`. Inspection commands see the disposable container namespace rather than the Node host, and the ports level creates its own temporary listener for discovery.

The service account must be able to invoke Docker. On a dedicated VM, either use rootless Docker for that account or add it to the host's `docker` group. Membership in the rootful Docker group is effectively host-administrator access, so do not share this VM with unrelated workloads.

The bundled systemd unit expects the application at `/opt/obsidian-runner`, persistent metadata at `/opt/obsidian-runner/data`, and jobs at `/opt/obsidian-runner/work`. Adjust `ReadWritePaths` if those directories are mounted elsewhere.

The screenshot level receives its own Xvfb virtual display. The SSH password-audit level connects only to the `ssh-lab` container on the private `obsidian-lab` network; it does not expose port 22 on the VM.

After deploying an update, rebuild and verify the runtime before restarting the web service:

```bash
cd /opt/obsidian-runner
npm ci
npm test
npm run docker:build
npm run docker:lab
npm run docker:verify
sudo systemctl restart obsidian-runner
```
