import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@hexhaven/shared";
import { config, logConfig } from "./config.js";
import { registerSocketHandlers } from "./socket.js";
import { lobbyStore } from "./store.js";

const app = Fastify({
  logger: { level: logConfig.level },
  trustProxy: true,
});

app.get("/api/health", async () => {
  return {
    ok: true,
    lobbies: lobbyStore.size(),
    uptime: Math.round(process.uptime()),
  };
});

const webDist = resolve(process.cwd(), config.webDistDir);
if (config.serveWeb && existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    setHeaders: (response, path) => {
      if (path.includes(`${webDist}/assets/`)) {
        response.header("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });

  // Prerendered rulebook pages get their real HTML on direct load.
  app.get("/rules", (_request, reply) => reply.sendFile("rules/index.html"));
  app.get("/rules/:chapter", (request, reply) => {
    const { chapter } = request.params as { chapter: string };
    const relative = `rules/${chapter}/index.html`;
    if (!/^[a-z0-9-]+$/.test(chapter) || !existsSync(resolve(webDist, relative))) {
      return reply.code(404).send({ error: "not-found" });
    }
    return reply.sendFile(relative);
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api") || request.url.startsWith("/socket.io")) {
      return reply.code(404).send({ error: "not-found" });
    }
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname.startsWith("/rules") && !pathname.includes("..")) {
      const candidate = resolve(webDist, pathname.replace(/\/$/, "").slice(1), "index.html");
      if (existsSync(candidate)) return reply.sendFile(candidate.slice(webDist.length + 1));
    }
    return reply.sendFile("index.html");
  });
}

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: true },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 256 * 1024,
});

registerSocketHandlers(io);

const restored = lobbyStore.restore();
if (restored > 0) app.log.info(`Restored ${restored} match snapshot(s) from disk`);

await app.listen({ port: config.port, host: config.host });
app.log.info(`HexHaven server listening on ${config.host}:${config.port}`);

// Graceful shutdown: stop accepting connections, flush snapshots.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received — shutting down`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  });
}
