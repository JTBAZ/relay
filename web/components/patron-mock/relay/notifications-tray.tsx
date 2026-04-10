"use client";

import { Notification } from "@/lib/relay-fixtures";
import { Heart, MessageCircle, UserPlus, AtSign } from "lucide-react";

interface NotificationsTrayProps {
  notifications: Notification[];
  isOpen: boolean;
}

export function NotificationsTray({
  notifications,
  isOpen,
}: NotificationsTrayProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!isOpen) return null;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return <Heart size={12} className="text-red-500" />;
      case "comment":
        return <MessageCircle size={12} className="text-[#40916C]" />;
      case "follow":
        return <UserPlus size={12} className="text-blue-500" />;
      case "mention":
        return <AtSign size={12} className="text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="absolute top-14 right-0 w-80 bg-[#0E0E0E] rounded-lg border border-[#1A1A1A] shadow-xl animate-[slideIn_0.2s_ease-out] origin-top-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A]">
        <h3 className="text-sm font-semibold text-[#E0E0E0]">Notifications</h3>
        {unreadCount > 0 && (
          <span className="text-xs font-medium text-[#40916C] bg-[#0D1F17] px-2 py-1 rounded-full">
            {unreadCount} new
          </span>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[#555555]">
            No notifications yet
          </div>
        ) : (
          <div className="divide-y divide-[#1A1A1A]">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                className={[
                  "w-full px-4 py-3 text-left transition-colors hover:bg-[#1A1A1A]",
                  notification.read ? "" : "bg-[#0D1F17]/30",
                ].join(" ")}
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-[#2A2A2A] border border-[#1A1A1A]">
                    <img
                      src={notification.actor.avatarUrl}
                      alt={notification.actor.displayName}
                      className="w-full h-full object-cover"
                      width={32}
                      height={32}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-[#E0E0E0]">
                          <span className="font-medium">
                            {notification.actor.displayName}
                          </span>{" "}
                          <span className="text-[#888888]">
                            {notification.message}
                          </span>
                        </p>
                        {notification.target && (
                          <p className="text-xs text-[#555555] mt-1 truncate">
                            {notification.target.title}
                          </p>
                        )}
                      </div>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <p className="text-xs text-[#555555] mt-1.5">
                      {notification.timestamp}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <button className="w-full px-4 py-2.5 text-xs text-[#40916C] hover:text-[#55a87b] border-t border-[#1A1A1A] transition-colors text-center font-medium">
          View all notifications
        </button>
      )}
    </div>
  );
}
