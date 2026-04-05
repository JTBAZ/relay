"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

type EmailView = "sign-in" | "sign-up" | "reset" | "verify" | "check-email" | "loading";

export function EmailPanel() {
  const [view, setView] = useState<EmailView>("sign-in");
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError(false);
    setPasswordError(false);
    const form = e.currentTarget;
    const emailVal = (form.querySelector('[name="email"]') as HTMLInputElement)?.value;
    const passVal = (form.querySelector('[name="password"]') as HTMLInputElement)?.value;

    if (!emailVal?.includes("@")) {
      setEmailError(true);
      return;
    }
    if (view === "sign-in" && passVal != null && passVal.length < 6) {
      setPasswordError(true);
      return;
    }

    const prevView = view;
    setView("loading");
    setTimeout(() => {
      if (prevView === "sign-in") setView("sign-in");
      else if (prevView === "sign-up") setView("verify");
      else if (prevView === "reset") setView("check-email");
    }, 1200);
  };

  const inputBase =
    "w-full bg-transparent text-sm placeholder:text-[#6B7280] focus:outline-none";

  const fieldWrapper = (hasError: boolean) =>
    `flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border transition-colors ${
      hasError ? "border-[#7F1D1D] bg-[#1A0A0A]" : "border-[#2A2A2A] bg-[#111111]"
    } focus-within:border-[#2D6A4F]`;

  return (
    <div className="space-y-4">
      {(view === "sign-in" || view === "sign-up") && (
        <div
          className="flex gap-0.5 rounded-lg p-0.5"
          style={{ background: "#111111", border: "1px solid #2A2A2A" }}
          role="tablist"
          aria-label="Authentication type"
        >
          {(["sign-in", "sign-up"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setView(v);
                setEmailError(false);
                setPasswordError(false);
              }}
              className="flex-1 rounded-md py-2 text-xs font-medium transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#2D6A4F]"
              style={
                view === v
                  ? { background: "#1A1A1A", color: "#F9FAFB", border: "1px solid #2A2A2A" }
                  : { color: "#9CA3AF", border: "1px solid transparent" }
              }
            >
              {v === "sign-in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}

      {(view === "reset" || view === "verify" || view === "check-email") && (
        <button
          type="button"
          onClick={() => setView("sign-in")}
          className="flex items-center gap-1.5 text-xs transition-colors"
          style={{ color: "#9CA3AF" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#F9FAFB")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF")}
        >
          <ArrowLeft size={12} aria-hidden />
          Back to sign in
        </button>
      )}

      {view === "loading" && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border py-8"
          style={{ background: "#111111", borderColor: "#2A2A2A" }}
        >
          <Loader2 size={24} className="animate-spin" style={{ color: "#2D6A4F" }} aria-hidden />
          <p className="text-sm" style={{ color: "#9CA3AF" }}>
            Verifying…
          </p>
        </div>
      )}

      {view === "sign-in" && (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <div className="space-y-2">
            <div className={fieldWrapper(emailError)}>
              <Mail size={14} style={{ color: "#9CA3AF" }} className="shrink-0" aria-hidden />
              <input
                name="email"
                type="email"
                placeholder="Email address"
                autoComplete="email"
                className={inputBase}
                style={{ color: "#F9FAFB" }}
                aria-label="Email address"
                aria-invalid={emailError}
              />
            </div>
            {emailError && (
              <p className="px-1 text-xs" style={{ color: "#FCA5A5" }} role="alert">
                Enter a valid email address.
              </p>
            )}

            <div className={fieldWrapper(passwordError)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden>
                <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#9CA3AF" strokeWidth="1.2" />
                <path
                  d="M4.5 6V4.5a2.5 2.5 0 015 0V6"
                  stroke="#9CA3AF"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                name="password"
                type={showPass ? "text" : "password"}
                placeholder="Password"
                autoComplete="current-password"
                className={`${inputBase} flex-1`}
                style={{ color: "#F9FAFB" }}
                aria-label="Password"
                aria-invalid={passwordError}
              />
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="shrink-0 transition-colors"
                style={{ color: "#6B7280" }}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            {passwordError && (
              <p className="px-1 text-xs" style={{ color: "#FCA5A5" }} role="alert">
                Password must be at least 6 characters.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setView("reset")}
              className="text-xs transition-colors"
              style={{ color: "#9CA3AF" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#40916C")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF")}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg py-2.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
            style={{ background: "#2D6A4F", color: "#F9FAFB" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#40916C")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#2D6A4F")}
          >
            Sign in
          </button>
        </form>
      )}

      {view === "sign-up" && (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <div className="space-y-2">
            <div className={fieldWrapper(emailError)}>
              <Mail size={14} style={{ color: "#9CA3AF" }} className="shrink-0" aria-hidden />
              <input
                name="email"
                type="email"
                placeholder="Email address"
                autoComplete="email"
                className={inputBase}
                style={{ color: "#F9FAFB" }}
                aria-label="Email address"
                aria-invalid={emailError}
              />
            </div>
            {emailError && (
              <p className="px-1 text-xs" style={{ color: "#FCA5A5" }} role="alert">
                Enter a valid email address.
              </p>
            )}

            <div className={fieldWrapper(passwordError)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden>
                <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#9CA3AF" strokeWidth="1.2" />
                <path
                  d="M4.5 6V4.5a2.5 2.5 0 015 0V6"
                  stroke="#9CA3AF"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                name="password"
                type={showPass ? "text" : "password"}
                placeholder="Create password"
                autoComplete="new-password"
                className={`${inputBase} flex-1`}
                style={{ color: "#F9FAFB" }}
                aria-label="Create password"
              />
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="shrink-0"
                style={{ color: "#6B7280" }}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>

            <div className={fieldWrapper(false)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden>
                <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#9CA3AF" strokeWidth="1.2" />
                <path
                  d="M4.5 6V4.5a2.5 2.5 0 015 0V6"
                  stroke="#9CA3AF"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                name="confirm"
                type={showConfirmPass ? "text" : "password"}
                placeholder="Confirm password"
                autoComplete="new-password"
                className={`${inputBase} flex-1`}
                style={{ color: "#F9FAFB" }}
                aria-label="Confirm password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass((p) => !p)}
                className="shrink-0"
                style={{ color: "#6B7280" }}
                aria-label={showConfirmPass ? "Hide password" : "Show password"}
              >
                {showConfirmPass ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          <p className="px-0.5 text-xs" style={{ color: "#6B7280" }}>
            By creating an account you agree to our{" "}
            <a href="#" className="underline" style={{ color: "#9CA3AF" }}>
              Terms
            </a>{" "}
            and{" "}
            <a href="#" className="underline" style={{ color: "#9CA3AF" }}>
              Privacy Policy
            </a>
            .
          </p>

          <button
            type="submit"
            className="w-full rounded-lg py-2.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
            style={{ background: "#2D6A4F", color: "#F9FAFB" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#40916C")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#2D6A4F")}
          >
            Create account
          </button>
        </form>
      )}

      {view === "reset" && (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium" style={{ color: "#F9FAFB" }}>
              Reset your password
            </p>
            <p className="mb-3 text-xs" style={{ color: "#9CA3AF" }}>
              We&apos;ll send a reset link to your inbox.
            </p>
            <div className={fieldWrapper(emailError)}>
              <Mail size={14} style={{ color: "#9CA3AF" }} className="shrink-0" aria-hidden />
              <input
                name="email"
                type="email"
                placeholder="Email address"
                autoComplete="email"
                className={inputBase}
                style={{ color: "#F9FAFB" }}
                aria-label="Email address"
                aria-invalid={emailError}
              />
            </div>
            {emailError && (
              <p className="mt-1 px-1 text-xs" style={{ color: "#FCA5A5" }} role="alert">
                Enter a valid email address.
              </p>
            )}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg py-2.5 text-sm font-medium transition-colors duration-150"
            style={{ background: "#2D6A4F", color: "#F9FAFB" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#40916C")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#2D6A4F")}
          >
            Send reset link
          </button>
        </form>
      )}

      {view === "check-email" && (
        <div
          className="flex flex-col items-center gap-4 rounded-lg border py-8 text-center"
          style={{ background: "#111111", borderColor: "#2A2A2A" }}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "#0D1F17" }}>
            <Mail size={20} style={{ color: "#40916C" }} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
              Check your inbox
            </p>
            <p className="mx-auto mt-1 max-w-[220px] text-xs" style={{ color: "#9CA3AF" }}>
              We sent a reset link. It expires in 15 minutes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView("sign-in")}
            className="text-xs transition-colors"
            style={{ color: "#9CA3AF" }}
          >
            Back to sign in
          </button>
        </div>
      )}

      {view === "verify" && (
        <div
          className="flex flex-col items-center gap-4 rounded-lg border py-8 text-center"
          style={{ background: "#0D1F17", borderColor: "#1B4332" }}
        >
          <CheckCircle2 size={28} style={{ color: "#40916C" }} aria-hidden />
          <div>
            <p className="text-sm font-medium" style={{ color: "#F9FAFB" }}>
              Verify your email
            </p>
            <p className="mx-auto mt-1 max-w-[220px] text-xs" style={{ color: "#9CA3AF" }}>
              We sent a confirmation link. Click it to activate your account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView("sign-in")}
            className="text-xs transition-colors"
            style={{ color: "#40916C" }}
          >
            Already verified? Sign in
          </button>
        </div>
      )}
    </div>
  );
}
