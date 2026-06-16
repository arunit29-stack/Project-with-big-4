type RedisLikeClient = {
  connect: () => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    options?: { EX?: number },
  ) => Promise<unknown>;
  on: (event: "error", listener: (error: Error) => void) => void;
};

type RedisModule = {
  createClient: (options: { url: string }) => RedisLikeClient;
};

let redisClientPromise: Promise<RedisLikeClient | null> | null = null;

function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }
  return url;
}

async function loadRedisModule(): Promise<RedisModule | null> {
  try {
    return (await new Function("return import('redis')")()) as RedisModule;
  } catch {
    return null;
  }
}

export function getRedisClient(): Promise<RedisLikeClient | null> {
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
      client.on("error", (error: Error) => {
        console.error("[redis] client error", error);
      });

      try {
        await client.connect();
        return client;
      } catch (error) {
        console.error("[redis] connect failed", error);
        return null;
      }
    })();
  }

  return redisClientPromise!;
}
