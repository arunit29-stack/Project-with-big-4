import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { startNotificationCronJobs } from "../../lib/server/notifications/cron";
import {
  attachNotificationSocketServer,
  getNotificationSocketServer,
} from "../../lib/server/notifications/ws";
import { registerAuthRoutes } from "./auth-routes";
import { registerLiveSessionRoutes } from "./live-session-routes";
import { registerNotificationRoutes } from "./notifications-routes";
import { registerLibraryRoutes } from "./library-routes";
import { attachLiveSessionSocketServer } from "../../lib/server/live-session/ws";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  app.addContentTypeParser(
    "text/plain",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  await app.register(rateLimit, {
    global: false,
  });

  await registerAuthRoutes(app);
  await registerNotificationRoutes(app);
  await registerLibraryRoutes(app);
  await attachNotificationSocketServer(app.server);
  const io = getNotificationSocketServer();
  if (io) {
    attachLiveSessionSocketServer(io);
  }
  await registerLiveSessionRoutes(app);
  startNotificationCronJobs();

  app.get("/health", async () => ({ ok: true }));

  return app;
}
