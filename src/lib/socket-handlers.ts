import type { Producer } from "kafkajs";
import type { Server, Socket } from "socket.io";
import type { RequestHandler } from "express";
import { publisher, redis } from "./redis.js";
import { isValidIncomingLocationPayload } from "./location-validation.js";

type SessionUser = {
  id: string;
  name?: string;
  email?: string;
};

type SessionSocket = Socket & {
  request: {
    session?: {
      user?: SessionUser;
    };
  };
};

export function attachSocketAuth(
  io: Server,
  sessionMiddleware: RequestHandler,
): void {
  io.use((socket, next) => {
    sessionMiddleware(socket.request as any, {} as any, () => {
      const user = (socket.request as SessionSocket["request"]).session?.user;
      if (!user) {
        next(new Error("Authentication required"));
        return;
      }
      next();
    });
  });
}

export function attachSocketHandlers(
  io: Server,
  kafkaProducer: Producer,
): void {
  io.on("connection", async (socket: SessionSocket) => {
    const user = socket.request.session?.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    console.log(`[Socket:${socket.id}]: Connected Success...`);

    const usersData = await redis.hgetall("users:metadata");
    const users = Object.values(usersData).map((data) => JSON.parse(data));
    socket.emit("server:user:list", { users });

    socket.on("client:location:update", async (locationData: unknown) => {
      if (!isValidIncomingLocationPayload(locationData)) return;
      const { latitude, longitude, name, color, eventId, timestamp } =
        locationData;
      console.log(
        `[Socket:${socket.id}]:client:location:update:`,
        locationData,
      );

      await kafkaProducer.send({
        topic: "location-updates",
        messages: [
          {
            key: user.id,
            value: JSON.stringify({
              eventId: eventId || crypto.randomUUID(),
              timestamp: timestamp || Date.now(),
              id: user.id,
              latitude,
              longitude,
              name: name || user.name || user.email || "Anonymous",
              color: color || "#4a90d9",
            }),
          },
        ],
      });
    });

    socket.on("disconnect", async () => {
      console.log(`[Socket:${socket.id}]: Disconnected`);

      const userData = await redis.hget("users:metadata", user.id);
      const metadataUser = userData ? JSON.parse(userData) : null;

      await redis.hdel("users:metadata", user.id);
      await redis.hdel("users:lastSeenAt", user.id);
      await redis.hdel("users:lastTimestamp", user.id);

      await publisher.publish(
        "location-updates:disconnect",
        JSON.stringify({
          id: user.id,
          name: metadataUser?.name || user.name || "Anonymous",
        }),
      );
    });
  });
}
