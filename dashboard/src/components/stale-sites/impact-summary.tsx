"use client";

import { formatBytes, clampPercent } from "@/lib/utils";
import { DollarSign, TrendingDown } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { StaleSiteRecommendation } from "@/lib/types";

interface ImpactSummaryProps {
  sites: StaleSiteRecommendation[];
}

interface CategorySummary {
  category: string;
  count: number;
  totalBytes: number;
  color: string;
  barColor: string;
}

// SharePoint Online storage cost estimate: $0.023/GB/month
const COST_PER_GB_MONTH = 0.023;

function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

function formatCost(dollars: number): string {
  if (dollars < 0.01) return "$0.00";
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ImpactSummary({ sites }: ImpactSummaryProps): React.ReactElement {
  const categories: CategorySummary[] = [
    { category: "Active", count: 0, totalBytes: 0, color: "text-emerald-400", barColor: "bg-emerald-500/50" },
    { category: "Low Activity", count: 0, totalBytes: 0, color: "text-blue-400", barColor: "bg-blue-500/50" },
    { category: "Stale", count: 0, totalBytes: 0, color: "text-amber-400", barColor: "bg-amber-500/50" },
    { category: "Abandoned", count: 0, totalBytes: 0, color: "text-red-400", barColor: "bg-red-500/50" },
  ];

  for (const site of sites) {
    const cat = categories.find((c) => c.category === site.category);
    if (cat) {
      cat.count++;
      cat.totalBytes += site.storageUsedBytes;
    }
  }

  const totalBytes = sites.reduce((sum, s) => sum + s.storageUsedBytes, 0);
  const maxBytes = Math.max(...categories.map((c) => c.totalBytes), 1);

  // Cost calculations
  const staleCat = categories.find((c) => c.category === "Stale");
  const abandonedCat = categories.find((c) => c.category === "Abandoned");
  const reclaimableBytes = (staleCat?.totalBytes ?? 0) + (abandonedCat?.totalBytes ?? 0);
  const reclaimableGB = bytesToGB(reclaimableBytes);
  const monthlySavings = reclaimableGB * COST_PER_GB_MONTH;
  const annualSavings = monthlySavings * 12;
  const totalMonthlyCost = bytesToGB(totalBytes) * COST_PER_GB_MONTH;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">
          Storage Impact by Category
          <InfoTooltip text="Estimated at $0.023/GB/month (Microsoft 365 SharePoint storage rate). Actual costs may vary by license agreement." className="ml-1" />
        </h4>
        <span className="font-mono text-sm text-muted-foreground">
          Total: {formatBytes(totalBytes)}
        </span>
      </div>
      <div className="space-y-3">
        {categories.map((cat) => {
          const catCostMonthly = bytesToGB(cat.totalBytes) * COST_PER_GB_MONTH;
          return (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={cat.color}>
                  {cat.category} <span className="text-muted-foreground">({cat.count} sites)</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-muted-foreground">{formatCost(catCostMonthly)}/mo</span>
                  <span className="font-mono font-bold">{formatBytes(cat.totalBytes)}</span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                <div
                  className={`h-full rounded-full ${cat.barColor} transition-all`}
                  style={{ width: `${clampPercent((cat.totalBytes / maxBytes) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Savings Summary */}
      {reclaimableBytes > 0 && (
        <div className="mt-5 pt-4 border-t border-border/50">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15">
                <DollarSign className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Monthly Cost</p>
                <p className="font-mono text-lg font-bold">{formatCost(totalMonthlyCost)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15">
                <TrendingDown className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Potential Monthly Savings</p>
                <p className="font-mono text-lg font-bold text-emerald-400">{formatCost(monthlySavings)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15">
                <TrendingDown className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Annual Savings Potential</p>
                <p className="font-mono text-lg font-bold text-emerald-400">{formatCost(annualSavings)}</p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Based on {formatBytes(reclaimableBytes)} reclaimable from Stale + Abandoned sites at $0.023/GB/month
          </p>
        </div>
      )}
    </div>
  );
}
