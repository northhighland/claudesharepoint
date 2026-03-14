"use client";

import { usePolling } from "@/hooks/use-polling";
import { fetchQuotaStatus } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { TopSitesList } from "@/components/quota/top-sites-list";
import { DistributionChart } from "@/components/quota/distribution-chart";
import { QuotaHeatmap } from "@/components/quota/quota-heatmap";
import { QuotaHistory } from "@/components/quota/quota-history";

export default function QuotaPage(): React.ReactElement {
  const { data, isLoading } = usePolling("quota", () => fetchQuotaStatus(), 60000);

  const sites = data?.sites ?? [];
  const distribution = data?.distribution ?? [];

  const critical = sites.filter((s) => s.percentUsed >= 95).length;
  const warning = sites.filter((s) => s.percentUsed >= 85 && s.percentUsed < 95).length;
  const healthy = sites.filter((s) => s.percentUsed < 70).length;
  const totalUsedBytes = sites.reduce((sum, s) => sum + s.usedBytes, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Quota Management</h1>
        <p className="text-sm text-muted-foreground">
          Storage health across the environment
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="glass-card rounded-xl p-4 animate-fade-in-up">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Sites</p>
          <p className="mt-1 font-mono text-2xl font-bold">{isLoading ? "--" : sites.length}</p>
        </div>
        <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Critical (&gt;95%)</p>
          <p className="mt-1 font-mono text-2xl font-bold text-red-400">{isLoading ? "--" : critical}</p>
        </div>
        <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Warning (85-95%)</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-400">{isLoading ? "--" : warning}</p>
        </div>
        <div className="glass-card rounded-xl p-4 animate-fade-in-up-delay-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Storage Used</p>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">{isLoading ? "--" : formatBytes(totalUsedBytes)}</p>
        </div>
      </div>

      {/* Top 20 lists side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopSitesList
          title="Top 20 — Highest % Used"
          sites={sites}
          metric="percentUsed"
          limit={20}
        />
        <TopSitesList
          title="Top 20 — Largest by GB"
          sites={sites}
          metric="usedBytes"
          limit={20}
        />
      </div>

      {/* Distribution chart */}
      <DistributionChart data={distribution} isLoading={isLoading} />

      {/* Heatmap */}
      <QuotaHeatmap sites={sites} isLoading={isLoading} />

      {/* Auto-increase history */}
      <QuotaHistory sites={sites} isLoading={isLoading} />
    </div>
  );
}
