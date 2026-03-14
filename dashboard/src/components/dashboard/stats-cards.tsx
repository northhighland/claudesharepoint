"use client";

import Link from "next/link";
import { HardDrive, Globe, DollarSign, Archive } from "lucide-react";
import { formatBytes, formatNumber } from "@/lib/utils";
import type { DashboardOverview } from "@/lib/types";

interface StatsCardsProps {
  overview: DashboardOverview | undefined;
  isLoading: boolean;
}

const ANIMATION_CLASSES = [
  "animate-fade-in-up",
  "animate-fade-in-up-delay-1",
  "animate-fade-in-up-delay-2",
  "animate-fade-in-up-delay-3",
];

export function StatsCards({ overview, isLoading }: StatsCardsProps): React.ReactElement {
  const cards = [
    {
      label: "Storage Reclaimed",
      value: overview ? formatBytes(overview.totalStorageReclaimedBytes) : "0 B",
      icon: <HardDrive className="h-5 w-5" />,
      color: "bg-primary/10 text-primary",
      href: "/jobs",
    },
    {
      label: "Sites Processed",
      value: (overview?.totalSitesProcessed ?? 0).toLocaleString(),
      icon: <Globe className="h-5 w-5" />,
      color: "bg-sky-500/10 text-sky-400",
      href: "/jobs",
    },
    {
      label: "Cost Avoidance",
      value: `$${formatNumber(overview?.costAvoidanceDollars ?? 0)}`,
      icon: <DollarSign className="h-5 w-5" />,
      color: "bg-emerald-500/10 text-emerald-400",
      href: "/quota",
    },
    {
      label: "Stale Sites Found",
      value: (overview?.staleSitesFound ?? 0).toLocaleString(),
      icon: <Archive className="h-5 w-5" />,
      color: "bg-amber-500/10 text-amber-400",
      href: "/stale-sites",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Link
          key={card.label}
          href={card.href}
          className={`glass-card rounded-xl p-5 transition-all hover:border-white/15 hover:bg-[rgba(15,25,50,0.75)] ${ANIMATION_CLASSES[i]}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {card.label}
            </p>
            <div className={`rounded-lg p-2 ${card.color}`}>{card.icon}</div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            ) : (
              <p className="font-mono text-2xl font-bold">{card.value}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
