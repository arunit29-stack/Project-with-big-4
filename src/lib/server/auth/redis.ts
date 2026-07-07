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

      const client = redisModule.createClient({
        url,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 2) {
              // Stop retrying and return an error to reject the connection promise
              return new Error("Redis connection failed after 2 retries");
            }
            return 500; // Retry after 500ms
          },
          connectTimeout: 2000, // 2s timeout
        } as any,
      });

      let connectionWarningLogged = false;
      client.on("error", (error: any) => {
        const code = error?.code || error?.errno;
        if (code === "ECONNREFUSED" || code === "ENOTFOUND" || error?.message?.includes("ECONNREFUSED")) {
          if (!connectionWarningLogged) {
            console.warn("[redis] Redis server is unreachable. Running in local/offline auth mode.");
            connectionWarningLogged = true;
          }
          return;
        }
        console.error("[redis] client error:", error?.message || error);
      });

      try {
        await client.connect();
        return client;
      } catch (error: any) {
        const code = error?.code || error?.errno;
        if (code !== "ECONNREFUSED" && code !== "ENOTFOUND" && !error?.message?.includes("ECONNREFUSED")) {
          console.error("[redis] connect failed:", error instanceof Error ? error.message : error);
        }
        try {
          await client.disconnect();
        } catch {
          // ignore
        }
        return null;
      }
    })();
  }

  return redisClientPromise!;
}
