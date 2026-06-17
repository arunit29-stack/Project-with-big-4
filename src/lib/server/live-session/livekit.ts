import { AccessToken } from "livekit-server-sdk";

function required(value: string | undefined, fallback?: string): string {
  const resolved = value ?? fallback;
  if (!resolved) {
    throw new Error("LiveKit credentials are required");
  }
  return resolved;
}

export async function createLiveKitToken(input: {
  sessionId: string;
  userId: string;
  name?: string;
  email?: string;
  role: "teacher" | "student";
  canPublish?: boolean;
}) {
  const apiKey = required(process.env.LIVEKIT_API_KEY);
  const apiSecret = required(process.env.LIVEKIT_API_SECRET, process.env.LIVEKIT_SECRET);
  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.userId,
    name: input.name ?? input.email ?? input.userId,
    ttl: "60m",
  });

  token.addGrant({
    roomJoin: true,
    room: input.sessionId,
    canSubscribe: true,
    canPublish: input.canPublish ?? input.role === "teacher",
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  return {
    serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "",
    token: await token.toJwt(),
  };
}
