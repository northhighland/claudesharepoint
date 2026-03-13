"use client";

import { useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { fetchStaleSites } from "@/lib/api";
import { SiteTable } from "@/components/stale-sites/site-table";
import { cn } from "@/lib/utils";
import type { StaleSiteRecommendation } from "@/lib/types";

type CategoryFilter = "all" | "Active" | "Low Activity" | "Stale" | "Abandoned";

const CATEGORIES: CategoryFilter[] = ["all", "Active", "Low Activity", "Stale", "Abandoned"];

export default function StaleSitesPage(): React.ReactElement {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const { data: sites, isLoading, mutate } = usePolling("stale-sites", fetchStaleSites, 60000);

  const allSites = sites ?? [];
  const filtered =
    category === "all" ? allSites : allSites.filter((s) => s.category === category);

  const counts: Record<CategoryFilter, number> = {
    all: allSites.length,
    Active: allSites.filter((s) => s.category === "Active").length,
    "Low Activity": allSites.filter((s) => s.category === "Low Activity").length,
    Stale: allSites.filter((s) => s.category === "Stale").length,
    Abandoned: allSites.filter((s) => s.category === "Abandoned").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stale Sites</h1>
        <p className="text-sm text-muted-foreground">
          Analyze site activity and manage stale site recommendations
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              category === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {cat === "all" ? "All" : cat}
            <span className="ml-1.5 text-xs opacity-70">({counts[cat]})</span>
          </button>
        ))}
      </div>

      <SiteTable
        sites={filtered}
        isLoading={isLoading}
        onActionComplete={() => mutate()}
      />
    </div>
  );
}
