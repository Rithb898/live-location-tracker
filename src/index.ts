import "dotenv/config";
import http from "node:http";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";
import { kafkaClient } from "./lib/kafka-client.js";
import { publisher, redis, subscriber } from "./lib/redis.js";
import { authRouter } from "./routes/auth.js";
import { requireAuth, sessionMiddleware } from "./lib/session.js";
import { startLocationConsumer } from "./lib/location-consumer.js";
import { startStaleUserCleanup } from "./lib/stale-user-cleanup.js";
import { attachSocketAuth, attachSocketHandlers } from "./lib/socket-handlers.js";

const PORT = process.env.PORT ?? 8888;
const USER_TTL_MS = Number(process.env.USER_TTL_MS ?? 15000);
const STALE_CLEANUP_INTERVAL_MS = Number(
  process.env.STALE_CLEANUP_INTERVAL_MS ?? 5000,
);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set("trust proxy", 1);
app.use(sessionMiddleware);
app.use("/auth", authRouter);

const kafkaProducer = kafkaClient.producer();
await kafkaProducer.connect();

const kafkaConsumer = kafkaClient.consumer({
  groupId: `socket-server-${PORT}`,
});
await kafkaConsumer.connect();

await startLocationConsumer({ kafkaConsumer, userTtlMs: USER_TTL_MS });

await subscriber.subscribe(
  "location-updates:broadcast",
  "location-updates:disconnect",
);
subscriber.on("message", (channel, message) => {
  if (channel === "location-updates:broadcast") {
    const data = JSON.parse(message);
    io.emit("server:location:update", data);
  }
  if (channel === "location-updates:disconnect") {
    const data = JSON.parse(message);
    io.emit("server:client:disconnect", data);
  }
});

io.attach(server);
attachSocketAuth(io, sessionMiddleware);
attachSocketHandlers(io, kafkaProducer);

startStaleUserCleanup({
  userTtlMs: USER_TTL_MS,
  staleCleanupIntervalMs: STALE_CLEANUP_INTERVAL_MS,
});

app.use(express.static(path.resolve("./src/public")));

app.get("/health", (req, res) => {
  return res.json({ healthy: true });
});

app.get("/api/protected-health", requireAuth, (req, res) => {
  res.json({ ok: true, userId: req.session.user?.id });
});

server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
