"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = getRedisClient;
let redisClientPromise = null;
function getRedisUrl() {
    const url = process.env.REDIS_URL;
    if (!url) {
        return null;
    }
    return url;
}
async function loadRedisModule() {
    try {
        return (await new Function("return import('redis')")());
    }
    catch (_a) {
        return null;
    }
}
function getRedisClient() {
    if (!redisClientPromise) {
        redisClientPromise = (async () => {
            const url = getRedisUrl();
            if (!url) {
                return null;
            }
            const redisModule = await loadRedisModule();
            if (!redisModule) {
                return null;
            }
            const client = redisModule.createClient({ url });
            client.on("error", (error) => {
                console.error("[redis] client error", error);
            });
            try {
                await client.connect();
                return client;
            }
            catch (error) {
                console.error("[redis] connect failed", error);
                return null;
            }
        })();
    }
    return redisClientPromise;
}
