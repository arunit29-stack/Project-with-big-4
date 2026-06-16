import { getRedisPublisher } from "./redis";
import { insertNotification } from "./store";
import type { NotificationDTO, NotificationType } from "./types";

export type NotifyUserInput = {
  userId: string;
  type: NotificationType;
  courseId?: string | null;
  courseName?: string | null;
  message: string;
  navigateTo?: string | null;
  payload?: Record<string, unknown>;
};

function buildEnvelope(notification: NotificationDTO, userId: string) {
  return {
    userId,
    ...notification,
  };
}

export async function notifyUser(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<NotificationDTO> {
  const notification = await insertNotification({
    userId,
    type,
    courseId: typeof payload.courseId === "string" ? payload.courseId : null,
    courseName: typeof payload.courseName === "string" ? payload.courseName : null,
    message: typeof payload.message === "string" ? payload.message : "New notification",
    navigateTo: typeof payload.navigateTo === "string" ? payload.navigateTo : null,
    payload,
  });

  const publisher = await getRedisPublisher();
  if (publisher) {
    await publisher.publish(
      `notifications:${userId}`,
      JSON.stringify(buildEnvelope(notification, userId)),
    );
  }

  return notification;
}
