import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { startNotificationCronJobs } from "../../lib/server/notifications/cron";
import {
  attachNotificationSocketServer,
  getNotificationSocketServer,
} from "../../lib/server/notifications/ws";
import { registerAuthRoutes } from "./auth-routes";
import { registerAiRoutes } from "./ai-routes";
import { registerLiveSessionRoutes } from "./live-session-routes";
import { registerNotificationRoutes } from "./notifications-routes";
import { registerLibraryRoutes } from "./library-routes";
import { registerQuizRoutes } from "./quiz-routes";
import { registerGroupRoomsRoutes } from "./group-rooms-routes";
import { registerPeerReviewRoutes } from "./peer-review-routes";
import { registerAdminRoutes } from "./admin-routes";
import { attachLiveSessionSocketServer } from "../../lib/server/live-session/ws";
import { attachQuizSocketServer } from "../../lib/server/quiz/ws";
import { attachGroupRoomsChatServer } from "../../lib/server/group-rooms/ws";
import { initQuizDatabase } from "../../lib/server/quiz/init-db";
import { startInactivityDetectionCron } from "../../lib/server/group-rooms/inactivity-cron";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Initialize DB tables
  await initQuizDatabase();

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
  await registerAiRoutes(app);
  await registerNotificationRoutes(app);
  await registerLibraryRoutes(app);
  await registerQuizRoutes(app);
  await registerGroupRoomsRoutes(app);
  await registerPeerReviewRoutes(app);
  await registerAdminRoutes(app);
  await attachNotificationSocketServer(app.server);
  const io = getNotificationSocketServer();
  if (io) {
    attachLiveSessionSocketServer(io);
    attachQuizSocketServer(io);
    attachGroupRoomsChatServer(io);
  }
  await registerLiveSessionRoutes(app);
  startNotificationCronJobs();
  startInactivityDetectionCron();

  app.get("/health", async () => ({ ok: true }));

  return app;
}

