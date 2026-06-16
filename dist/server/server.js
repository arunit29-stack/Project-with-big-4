"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./fastify/app");
const postgres_1 = require("../lib/server/db/postgres");
async function main() {
    var _a, _b;
    const app = await (0, app_1.buildApp)();
    const port = Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 4000);
    const host = (_b = process.env.HOST) !== null && _b !== void 0 ? _b : "0.0.0.0";
    const shutdown = async () => {
        await app.close();
        await (0, postgres_1.closePostgresPool)();
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
