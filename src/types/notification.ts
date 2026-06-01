export interface Notification {
  id: string;
  courseName: string;
  description: string;
  createdAt: string;
  read: boolean;
  href: string;
}

export interface NotificationsWsMessage {
  type: "notification" | "unread_count";
  notification?: Notification;
  unreadCount?: number;
}
