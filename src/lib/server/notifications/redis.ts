import type { RedisClientType } from "redis";

type RedisModule = typeof import("redis");

let redisModulePromise: Promise<RedisModule | null> | null = null;
let publisherPromise: Promise<RedisClientType | null> | null = null;
let subscriberPromise: Promise<RedisClientType | null> | null = null;

function getRedisUrl(): string | null {
  return process.env.REDIS_URL ?? null;
}

async function loadRedisModule(): Promise<RedisModule | null> {
  redisModulePromise ??= import("redis").catch(() => null);
  return redisModulePromise;
}

async function createClient(): Promise<RedisClientType | null> {
  const url = getRedisUrl();
  if (!url) return null;

  const redisModule = await loadRedisModule();
  if (!redisModule) return null;

  const client = redisModule.createClient({ url }) as RedisClientType;
  client.on("error", (error) => {
    console.error("[redis] client error", error);
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    console.error("[redis] connect failed", error);
    return null;
  }
}

export async function getRedisPublisher(): Promise<RedisClientType | null> {
  publisherPromise ??= createClient();
  return publisherPromise;
}

export async function getRedisSubscriber(): Promise<RedisClientType | null> {
  subscriberPromise ??= createClient();
  return subscriberPromise;
}
