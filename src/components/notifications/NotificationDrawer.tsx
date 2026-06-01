"use client";

import { useNotifications } from "@/contexts/NotificationsContext";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

export function NotificationDrawer() {
  const {
    drawerOpen,
    closeDrawer,
    notifications,
    clearAll,
    handleNotificationClick,
  } = useNotifications();

  if (!drawerOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close notifications"
        className="fixed inset-0 z-50 bg-black/30"
        onClick={closeDrawer}
      />
      <aside
        role="dialog"
        aria-label="Notifications"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
          <button
            type="button"
            onClick={closeDrawer}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No notifications yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
                      !n.read ? "bg-brand-50/50" : ""
                    }`}
                  >
                    <p className="text-xs font-medium text-brand-700">{n.courseName}</p>
                    <p className="mt-0.5 text-sm text-slate-800">{n.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="border-t border-slate-200 p-3">
            <button
              type="button"
              onClick={() => void clearAll()}
              className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear all
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
