import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

const app = express();
const server = createServer(app);
app.get("/", (req, res) => res.send("Server is alive!"));

const localDomains = [process.env.WEB_URL];

const io = new Server(server, {
  cors: {
    credentials: true,
    origin: localDomains,
  },
  maxHttpBufferSize: 1e8,
});

const redisClient = createClient({ url: process.env.REDIS_URL });

(async () => {
  await redisClient.connect();
  console.log("Connected to Redis");

  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  io.on("connection", async (socket) => {
    console.log("Client connected:", socket.id);

    let count = parseInt(await redisClient.get("count")) || 0;

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        socket.emit("update-redis-incr");
      }
    } else if (count < 0) {
      for (let i = 0; i < Math.abs(count); i++) {
        socket.emit("update-redis-decr");
      }
    }

    socket.on("incr", async () => {
      await redisClient.incr("count");
      io.emit("update-redis-incr");
    });

    socket.on("decr", async () => {
      await redisClient.decr("count");
      io.emit("update-redis-decr");
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  server.listen(4000, () => {
    console.log("Server listening on port 4000");
  });
})();
