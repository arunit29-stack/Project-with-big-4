export interface Notification {
  id: string;
  type: string;
  courseId: string | null;
  courseName: string | null;
  message: string;
  navigateTo: string | null;
  createdAt: string;
  readAt?: string | null;
  deletedAt?: string | null;
}

export interface NotificationsWsMessage {
  type: "notification" | "unread_count";
  notification?: Notification;
  unreadCount?: number;
}
