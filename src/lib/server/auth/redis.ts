import { createClient, type RedisClientType } from "redis";

let redisClientPromise: Promise<RedisClientType> | null = null;

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required for RBAC blocklist checks");
  }
  return url;
}

export function getRedisClient(): Promise<RedisClientType> {
  if (!redisClientPromise) {
    const client = createClient({ url: getRedisUrl() });
    client.on("error", (error) => {
      console.error("[redis] client error", error);
    });
    redisClientPromise = client.connect().then(() => client);
  }

  return redisClientPromise;
}
