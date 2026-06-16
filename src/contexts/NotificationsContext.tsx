"use client";

import { useAuth } from "@/contexts/AuthContext";
import type { Notification, NotificationsWsMessage } from "@/types/notification";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  clearAll: () => void;
  handleNotificationClick: (notification: Notification) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

function getWsUrl(): string {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/notifications`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token, status } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const markedReadRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !token) {
      wsRef.current?.close();
      wsRef.current = null;
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as NotificationsWsMessage;
        if (msg.type === "unread_count" && typeof msg.unreadCount === "number") {
          setUnreadCount(msg.unreadCount);
        }
        if (msg.type === "notification" && msg.notification) {
          setNotifications((prev) => [msg.notification!, ...prev]);
          setUnreadCount((c) => c + 1);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onerror = () => {
      if (process.env.NODE_ENV === "development") {
        setNotifications([
          {
            id: "dev-1",
            type: "course_announcement",
            courseId: null,
            courseName: "Biology 101",
            message: "New assignment posted",
            navigateTo: "/class",
            createdAt: new Date().toISOString(),
          },
        ]);
        setUnreadCount(1);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [status, token]);

  const markAllRead = useCallback(async () => {
    if (!token || markedReadRef.current) return;
    markedReadRef.current = true;

    fetch("/api/notifications/read-all", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {});

    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    markedReadRef.current = false;
  }, [token]);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    void markAllRead();
  }, [markAllRead]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const clearAll = useCallback(async () => {
    if (!token) return;
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    setNotifications([]);
    setUnreadCount(0);
  }, [token]);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      setDrawerOpen(false);
      if (notification.navigateTo) {
        router.push(notification.navigateTo);
      }
    },
    [router],
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      drawerOpen,
      openDrawer,
      closeDrawer,
      clearAll,
      handleNotificationClick,
    }),
    [
      notifications,
      unreadCount,
      drawerOpen,
      openDrawer,
      closeDrawer,
      clearAll,
      handleNotificationClick,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}
