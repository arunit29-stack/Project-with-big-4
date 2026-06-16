import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { registerAuthRoutes } from "./auth-routes";

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

  app.get("/health", async () => ({ ok: true }));

  return app;
}
