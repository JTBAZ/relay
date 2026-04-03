"use client"

import { RefreshCw, ChevronRight, Users, DollarSign, TrendingUp, Eye, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TopBarProps {
  syncStatus?: "synced" | "syncing" | "error"
  creatorName?: string
  creatorLogo?: string
  patronCount?: number
  monthlyRevenue?: number
}

export function TopBar({ 
  syncStatus = "synced", 
  creatorName = "Studio Archive", 
  creatorLogo, 
  patronCount = 0, 
  monthlyRevenue = 0 
}: TopBarProps) {
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
      {/* Creator Branding Block - Interactive Analytics Portal */}
      <button className="flex items-center gap-3 px-3 py-1.5 -ml-3 rounded-lg hover:bg-muted/50 transition-colors group">
        {/* Logo Space */}
        <div className="w-8 h-8 rounded bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 group-hover:border-primary/50 transition-colors">
          {creatorLogo ? (
            <img src={creatorLogo} alt={creatorName} className="w-full h-full rounded object-cover" />
          ) : (
            <span className="text-xs font-bold text-primary">
              {creatorName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        
        {/* Name & Analytics Preview */}
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground tracking-tight">{creatorName}</span>
            <SyncStatusPill status={syncStatus} />
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {(patronCount ?? 0).toLocaleString()} Patrons
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              ${(monthlyRevenue ?? 0).toLocaleString()}/mo
            </span>
          </div>
        </div>
        
        {/* Trend Indicator */}
        <div className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/10 border border-success/20 opacity-0 group-hover:opacity-100 transition-opacity">
          <TrendingUp className="w-3 h-3 text-success" />
          <span className="text-[10px] font-medium text-success">+12%</span>
        </div>
      </button>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 px-3 text-xs gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Preview
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Apply
          </Button>
        </div>
      </div>
    </header>
  )
}

function SyncStatusPill({ status }: { status: "synced" | "syncing" | "error" }) {
  const statusConfig = {
    synced: {
      label: "Synced",
      dotClass: "bg-success",
      bgClass: "bg-success/10 border-success/20"
    },
    syncing: {
      label: "Syncing",
      dotClass: "bg-warning",
      bgClass: "bg-warning/10 border-warning/20"
    },
    error: {
      label: "Sync Error",
      dotClass: "bg-destructive",
      bgClass: "bg-destructive/10 border-destructive/20"
    }
  }

  const config = statusConfig[status]

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${config.bgClass}`}>
      {status === "syncing" ? (
        <RefreshCw className="w-3 h-3 text-warning animate-spin" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      )}
      <span className="text-foreground">{config.label}</span>
    </div>
  )
}
