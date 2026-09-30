import http from "node:http";
import express from "express";
import { Server as SocketServer } from "socket.io";
import { createApi } from "./api.js";
import { config } from "./config.js";
import { getLogHistory } from "./runner.js";
import { getJob } from "./store.js";
import { initializeStore } from "./store.js";

await initializeStore();

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { serveClient: true });

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use("/api", createApi(io));
app.use(express.static(config.publicDir, { extensions: ["html"] }));
app.get("*splat", (_req, res) => res.sendFile(`${config.publicDir}/index.html`));

io.on("connection", (socket) => {
  socket.on("watch-job", ({ jobId, participantId } = {}) => {
    const job = getJob(jobId);
    if (!job || !participantId || job.participantId !== participantId) {
      socket.emit("job:error", { message: "Unable to watch that job." });
      return;
    }
    socket.join(`job:${job.id}`);
    socket.emit("job:history", getLogHistory(job.id));
    socket.emit("job:status", job);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "The service encountered an unexpected error." });
});

server.listen(config.port, config.host, () => {
  console.log(`Obsidian Runner listening on http://${config.host}:${config.port}`);
  console.log(`Runner mode: ${config.runnerMode}${config.allowLocalExecution ? " (local execution enabled)" : ""}`);
});
