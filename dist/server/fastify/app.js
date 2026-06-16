"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const fastify_1 = __importDefault(require("fastify"));
const cron_1 = require("../../lib/server/notifications/cron");
const ws_1 = require("../../lib/server/notifications/ws");
const auth_routes_1 = require("./auth-routes");
const notifications_routes_1 = require("./notifications-routes");
const library_routes_1 = require("./library-routes");
async function buildApp() {
    const app = (0, fastify_1.default)({
        logger: true,
        trustProxy: true,
    });
    app.addContentTypeParser("text/plain", { parseAs: "string" }, (_request, body, done) => {
        done(null, body);
    });
    await app.register(rate_limit_1.default, {
        global: false,
    });
    await (0, auth_routes_1.registerAuthRoutes)(app);
    await (0, notifications_routes_1.registerNotificationRoutes)(app);
    await (0, library_routes_1.registerLibraryRoutes)(app);
    await (0, ws_1.attachNotificationSocketServer)(app.server);
    (0, cron_1.startNotificationCronJobs)();
    app.get("/health", async () => ({ ok: true }));
    return app;
}
