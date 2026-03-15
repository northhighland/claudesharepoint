"use client";

import Link from "next/link";
import { HardDrive, Globe, DollarSign, Clock } from "lucide-react";
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
  const hoursSaved = overview?.adminHoursSaved ?? 0;
  const personDays = Math.ceil(hoursSaved / 8);

  const cards = [
    {
      label: "Storage Reclaimed",
      value: overview ? formatBytes(overview.totalStorageReclaimedBytes) : "0 B",
      subtitle: undefined as string | undefined,
      icon: <HardDrive className="h-5 w-5" />,
      color: "bg-primary/10 text-primary",
      href: "/versions",
    },
    {
      label: "Admin Hours Saved",
      value: hoursSaved.toLocaleString(),
      subtitle: `${personDays} person-day${personDays !== 1 ? "s" : ""}`,
      icon: <Clock className="h-5 w-5" />,
      color: "bg-sky-500/10 text-sky-400",
      href: "/jobs",
    },
    {
      label: "Cost Avoidance",
      value: `$${formatNumber(overview?.costAvoidanceDollars ?? 0)}`,
      subtitle: undefined as string | undefined,
      icon: <DollarSign className="h-5 w-5" />,
      color: "bg-emerald-500/10 text-emerald-400",
      href: "/quota",
    },
    {
      label: "Sites Processed",
      value: (overview?.totalSitesProcessed ?? 0).toLocaleString(),
      subtitle: undefined as string | undefined,
      icon: <Globe className="h-5 w-5" />,
      color: "bg-sky-500/10 text-sky-400",
      href: "/versions",
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
              <>
                <p className="font-mono text-2xl font-bold">{card.value}</p>
                {card.subtitle && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.subtitle}</p>
                )}
              </>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
