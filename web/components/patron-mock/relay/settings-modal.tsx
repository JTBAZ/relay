"use client";

import { useState } from "react";
import { X, Bell, Book, LogOut } from "lucide-react";
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [discoverSettings, setDiscoverSettings] = useState({
    showFollowedFirst: true,
    hideExplicit: false,
    personalized: true,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center animate-[fadeIn_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/95"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-[#0E0E0E] rounded-xl border border-[#1A1A1A] p-6 shadow-2xl animate-[scaleIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#E0E0E0]">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-[#555555] hover:text-[#888888] transition-colors"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Discover Feed Settings */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium text-[#C8C8C8] mb-3">
              <Bell size={14} className="text-[#40916C]" />
              Discover Feed
            </h3>
            <div className="space-y-3 pl-6">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#888888]">
                  Show followed creators first
                </label>
                <button
                  onClick={() =>
                    setDiscoverSettings({
                      ...discoverSettings,
                      showFollowedFirst: !discoverSettings.showFollowedFirst,
                    })
                  }
                  className={[
                    "w-9 h-5 rounded-full transition-colors",
                    discoverSettings.showFollowedFirst
                      ? "bg-[#40916C]"
                      : "bg-[#2A2A2A]",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "w-4 h-4 rounded-full bg-white transition-transform",
                      discoverSettings.showFollowedFirst
                        ? "translate-x-4"
                        : "translate-x-0.5",
                    ].join(" ")}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#888888]">
                  Personalized recommendations
                </label>
                <button
                  onClick={() =>
                    setDiscoverSettings({
                      ...discoverSettings,
                      personalized: !discoverSettings.personalized,
                    })
                  }
                  className={[
                    "w-9 h-5 rounded-full transition-colors",
                    discoverSettings.personalized
                      ? "bg-[#40916C]"
                      : "bg-[#2A2A2A]",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "w-4 h-4 rounded-full bg-white transition-transform",
                      discoverSettings.personalized
                        ? "translate-x-4"
                        : "translate-x-0.5",
                    ].join(" ")}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Account Settings */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium text-[#C8C8C8] mb-3">
              <Book size={14} className="text-[#40916C]" />
              Account
            </h3>
            <div className="space-y-2 pl-6">
              <button className="w-full text-left text-xs text-[#888888] hover:text-[#40916C] transition-colors py-1.5">
                Profile Settings
              </button>
              <button className="w-full text-left text-xs text-[#888888] hover:text-[#40916C] transition-colors py-1.5">
                Notification Preferences
              </button>
              <button className="w-full text-left text-xs text-[#888888] hover:text-[#40916C] transition-colors py-1.5">
                Privacy & Safety
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#1A1A1A]" />

          {/* Sign Out */}
          <button className="w-full flex items-center gap-2 text-xs text-[#888888] hover:text-[#E0E0E0] transition-colors py-2">
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
