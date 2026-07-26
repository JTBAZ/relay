"use client";

export type GoalCycleErrorStateProps = {
  title?: string;
  message: string;
  retryable?: boolean;
  conflict?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function GoalCycleErrorState({
  title = "Something went wrong",
  message,
  retryable = false,
  conflict = false,
  onRetry,
  onDismiss
}: GoalCycleErrorStateProps) {
  return (
    <div
      className="goal-cycle-error"
      role="alert"
      data-testid="goal-cycle-error-state"
      data-conflict={conflict ? "true" : "false"}
    >
      <h2 className="goal-cycle-error__title">{title}</h2>
      <p className="goal-cycle-error__message">{message}</p>
      <div className="goal-cycle-step__actions">
        {onDismiss ? (
          <button
            type="button"
            className="goal-cycle-btn goal-cycle-btn--ghost"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        ) : null}
        {retryable && onRetry ? (
          <button
            type="button"
            className="goal-cycle-btn goal-cycle-btn--primary"
            onClick={onRetry}
            data-testid="goal-cycle-error-retry"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
