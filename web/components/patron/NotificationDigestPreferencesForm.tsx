"use client";

import {
  DEFAULT_NOTIFICATION_DIGEST_CADENCE,
  DEFAULT_NOTIFICATION_DIGEST_SLOT,
  MUTED_NOTIFICATION_CADENCE,
  NOTIFICATION_DIGEST_CADENCES,
  NOTIFICATION_DIGEST_SLOTS,
  NOTIFICATION_DELIVERY_MODES,
  notificationDeliveryModeFromProfile,
  notificationDigestEnabledFromDeliveryMode,
  resolveNotificationDigestCadence,
  resolveNotificationDigestSlot,
  type NotificationCadencePreferenceId,
  type NotificationDeliveryModeId,
  type NotificationDigestSlotId,
} from "@/lib/notification-digest-preferences";

export function NotificationDigestPreferencesForm({
  digestEnabled,
  cadence,
  slot,
  onDigestEnabledChange,
  onCadenceChange,
  onSlotChange,
  disabled = false,
  variant = "default",
}: {
  digestEnabled: boolean;
  cadence: NotificationCadencePreferenceId;
  slot: NotificationDigestSlotId;
  onDigestEnabledChange: (digestEnabled: boolean) => void;
  onCadenceChange: (cadence: NotificationCadencePreferenceId) => void;
  onSlotChange: (slot: NotificationDigestSlotId) => void;
  disabled?: boolean;
  variant?: "default" | "onboarding";
}): React.ReactElement {
  const mode = notificationDeliveryModeFromProfile(digestEnabled, cadence);
  const isOnboarding = variant === "onboarding";

  const wrapperClass = isOnboarding ? "space-y-4" : "space-y-4";
  const fieldsetClass = isOnboarding
    ? "space-y-2 rounded-2xl border border-[rgba(82,183,136,0.14)] bg-[linear-gradient(180deg,var(--relay-surface-1)_0%,var(--relay-surface-2)_100%)] p-3"
    : "space-y-2";
  const legendClass = isOnboarding
    ? "mx-auto px-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--relay-green-400)]"
    : "text-[10px] uppercase tracking-wide text-[#666]";
  const gridClass = isOnboarding ? "grid gap-2 sm:grid-cols-2" : "grid gap-2 sm:grid-cols-2";
  const optionClass = (selected: boolean) =>
    [
      isOnboarding
        ? "group flex min-h-[72px] flex-col justify-between rounded-2xl border px-3 py-2.5 text-left transition-all duration-150"
        : "rounded border px-3 py-2.5 text-left transition-colors",
      selected
        ? isOnboarding
          ? "border-[var(--relay-electric)] bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_220%)] shadow-[inset_0_0_0_1px_rgba(82,183,136,0.2),0_10px_24px_-18px_var(--relay-glow)]"
          : "border-[#2D6A4F] bg-[#0c1e16]"
        : isOnboarding
          ? "border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_260%)] hover:border-[rgba(82,183,136,0.3)] hover:bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_190%)]"
          : "border-[#2A2A2A] bg-[#141414] hover:border-[#333]",
      disabled ? "cursor-not-allowed opacity-60" : ""
    ].join(" ");
  const labelClass = isOnboarding
    ? "text-[12px] font-semibold text-[var(--relay-fg)]"
    : "text-[12px] font-medium text-[#E0E0E0]";
  const descriptionClass = isOnboarding
    ? "mt-1 text-[10px] leading-snug text-[var(--relay-fg-muted)]"
    : "mt-1 text-[10px] leading-relaxed text-[#888]";
  const onboardingChoiceGridClass = "grid gap-2 sm:grid-cols-3";
  const onboardingChoiceClass = (selected: boolean) =>
    [
      "rounded-2xl border px-3 py-3 text-center transition-all duration-150",
      selected
        ? "border-[var(--relay-electric)] bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_220%)] shadow-[inset_0_0_0_1px_rgba(82,183,136,0.22),0_10px_24px_-18px_var(--relay-glow)]"
        : "border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_260%)] hover:border-[rgba(82,183,136,0.3)] hover:bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_190%)]",
      disabled ? "cursor-not-allowed" : ""
    ].join(" ");
  const setMode = (next: NotificationDeliveryModeId) => {
    onDigestEnabledChange(notificationDigestEnabledFromDeliveryMode(next));
    if (next === "never") {
      onCadenceChange(MUTED_NOTIFICATION_CADENCE);
    } else if (cadence === MUTED_NOTIFICATION_CADENCE) {
      onCadenceChange(DEFAULT_NOTIFICATION_DIGEST_CADENCE);
    }
  };

  return (
    <div className={wrapperClass}>
      <fieldset className={fieldsetClass} disabled={disabled}>
        <legend className={legendClass}>
          How should we notify you of new content drops?
        </legend>
        {isOnboarding ? (
          <div className={onboardingChoiceGridClass}>
            {NOTIFICATION_DELIVERY_MODES.map((option) => {
              const selected = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setMode(option.id);
                  }}
                  className={onboardingChoiceClass(selected)}
                >
                  <span className="block text-[12px] font-semibold text-[var(--relay-fg)]">
                    {option.label}
                  </span>
                  <span className="mt-2 block text-[10px] leading-snug text-[var(--relay-fg-muted)]">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={gridClass}>
            {NOTIFICATION_DELIVERY_MODES.map((option) => {
              const selected = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMode(option.id)}
                  className={optionClass(selected)}
                >
                  <span className={labelClass}>{option.label}</span>
                  <p className={descriptionClass}>{option.description}</p>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {mode === "scheduled" ? (
        <>
          {!isOnboarding ? (
            <fieldset className={fieldsetClass} disabled={disabled}>
              <legend className={legendClass}>
                How often?
              </legend>
              <div className={gridClass}>
                {NOTIFICATION_DIGEST_CADENCES.map((option) => {
                  const selected = cadence === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onCadenceChange(option.id)}
                      className={optionClass(selected)}
                    >
                      <span className={labelClass}>{option.label}</span>
                      <p className={descriptionClass}>
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <fieldset className={fieldsetClass} disabled={disabled}>
            <legend className={legendClass}>
              When do you usually browse?
            </legend>
            <div className={gridClass}>
              {NOTIFICATION_DIGEST_SLOTS.map((option) => {
                const selected = slot === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSlotChange(option.id)}
                    className={optionClass(selected)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={labelClass}>{option.label}</span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          selected
                            ? "bg-[var(--relay-electric)]/15 text-[var(--relay-electric)]"
                            : "bg-white/5 text-[var(--relay-fg-muted)]"
                        ].join(" ")}
                      >
                        {option.window}
                      </span>
                    </div>
                    <p className={descriptionClass}>
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      ) : null}
    </div>
  );
}

export function digestCadenceFromProfile(
  cadence: NotificationCadencePreferenceId | null | undefined
): NotificationCadencePreferenceId {
  return cadence === MUTED_NOTIFICATION_CADENCE
    ? MUTED_NOTIFICATION_CADENCE
    : resolveNotificationDigestCadence(cadence ?? DEFAULT_NOTIFICATION_DIGEST_CADENCE);
}

export function digestSlotFromProfile(
  slot: NotificationDigestSlotId | null | undefined
): NotificationDigestSlotId {
  return resolveNotificationDigestSlot(slot ?? DEFAULT_NOTIFICATION_DIGEST_SLOT);
}
