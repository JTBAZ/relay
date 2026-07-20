"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Coins } from "lucide-react";
import {
  RelayApiError,
  fetchTipsWallet,
  type TipsWalletWire
} from "@/lib/relay-api";

/**
 * Consumer header wallet chip. Hidden when Tips beta is off (404 from wallet API).
 * Links to /plans for discoverability (MB-15B).
 */
export function TipWalletChip(): React.ReactElement | null {
  const [wallet, setWallet] = useState<TipsWalletWire | null>(null);
  const [hidden, setHidden] = useState(false);

  const refresh = useCallback(() => {
    void fetchTipsWallet()
      .then((w) => {
        setWallet(w);
        setHidden(false);
      })
      .catch((err) => {
        if (err instanceof RelayApiError && (err.status === 404 || err.status === 401)) {
          setHidden(true);
          setWallet(null);
          return;
        }
        setHidden(true);
      });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("relay-tips-wallet", refresh);
    return () => window.removeEventListener("relay-tips-wallet", refresh);
  }, [refresh]);

  if (hidden || !wallet) return null;

  const total = wallet.granted_balance + wallet.purchased_balance;
  const tipLabel = `Tips balance ${total}. Next free Tips: ${wallet.next_grant_period}. Open plans.`;

  return (
    <Link
      href="/plans"
      className="mr-2 flex items-center gap-1.5 rounded-full border border-[#1B4332] bg-[#0D1F17] px-2.5 py-1 text-[11px] text-[#9bf0c4] outline-none transition-colors hover:border-[#2D6A4F] focus-visible:ring-2 focus-visible:ring-[#00AA6F]/40"
      title={tipLabel}
      aria-label={tipLabel}
      data-testid="tip-wallet-chip"
    >
      <Coins size={12} aria-hidden />
      <span className="font-medium tabular-nums" data-testid="tip-wallet-balance">
        {total}
      </span>
      <span className="hidden text-[#40916C] sm:inline">Tips</span>
    </Link>
  );
}
