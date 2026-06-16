import { buildApp } from "./fastify/app";
import { closePostgresPool } from "../lib/server/db/postgres";

async function main() {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";

  const shutdown = async () => {
    await app.close();
    await closePostgresPool();
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  await app.listen({ port, host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
