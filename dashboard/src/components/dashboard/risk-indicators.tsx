"use client";

import Link from "next/link";
import { AlertTriangle, Archive, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardOverview } from "@/lib/types";

interface RiskIndicatorsProps {
  overview: DashboardOverview | undefined;
  isLoading: boolean;
}

interface RiskItem {
  label: string;
  value: number;
  icon: React.ReactElement;
  href: string;
  severity: "red" | "amber" | "green";
}

function getSeverity(value: number, threshold: number): "red" | "amber" | "green" {
  if (value > threshold) return "red";
  if (value > 0) return "amber";
  return "green";
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  red: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    ring: "ring-red-500/20",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    ring: "ring-amber-500/20",
  },
  green: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    ring: "ring-emerald-500/20",
  },
};

export function RiskIndicators({
  overview,
  isLoading,
}: RiskIndicatorsProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="glass-card animate-fade-in-up rounded-xl p-6">
        <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
          Active Risks
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const criticalQuota = overview?.criticalQuotaSites ?? 0;
  const staleSites = overview?.staleSitesNeedingAction ?? overview?.staleSitesFound ?? 0;
  const failedJobs = overview?.failedJobsLast24h ?? 0;

  const risks: RiskItem[] = [
    {
      label: "Critical Quota Sites",
      value: criticalQuota,
      icon: <AlertTriangle className="h-4 w-4" />,
      href: "/quota",
      severity: getSeverity(criticalQuota, 5),
    },
    {
      label: "Stale Sites Pending",
      value: staleSites,
      icon: <Archive className="h-4 w-4" />,
      href: "/stale-sites",
      severity: staleSites > 50 ? "red" : staleSites > 0 ? "amber" : "green",
    },
    {
      label: "Failed Jobs (24h)",
      value: failedJobs,
      icon: <XCircle className="h-4 w-4" />,
      href: "/jobs",
      severity: getSeverity(failedJobs, 2),
    },
  ];

  return (
    <div className="glass-card animate-fade-in-up rounded-xl p-6">
      <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
        Active Risks
      </h3>
      <div className="space-y-3">
        {risks.map((risk) => {
          const styles = SEVERITY_STYLES[risk.severity];
          return (
            <Link
              key={risk.label}
              href={risk.href}
              className={cn(
                "flex items-center gap-3 rounded-lg p-3 ring-1 transition-all hover:brightness-125",
                styles.bg,
                styles.ring
              )}
            >
              <div className={cn("shrink-0", styles.text)}>{risk.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {risk.label}
                </p>
              </div>
              <span className={cn("font-mono text-xl font-bold", styles.text)}>
                {risk.value}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
