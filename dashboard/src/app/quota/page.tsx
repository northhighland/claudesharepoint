"use client";

import { usePolling } from "@/hooks/use-polling";
import { fetchQuotaStatus } from "@/lib/api";
import { QuotaHeatmap } from "@/components/quota/quota-heatmap";
import { QuotaHistory } from "@/components/quota/quota-history";

export default function QuotaPage(): React.ReactElement {
  const { data: sites, isLoading } = usePolling("quota", fetchQuotaStatus, 60000);

  const allSites = sites ?? [];
  const critical = allSites.filter((s) => s.percentUsed >= 95).length;
  const warning = allSites.filter((s) => s.percentUsed >= 85 && s.percentUsed < 95).length;
  const healthy = allSites.filter((s) => s.percentUsed < 70).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quota Management</h1>
        <p className="text-sm text-muted-foreground">
          Site collection quota usage and auto-increase history
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total Sites</p>
          <p className="mt-1 text-xl font-bold">{isLoading ? "--" : allSites.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Critical (&gt;95%)</p>
          <p className="mt-1 text-xl font-bold text-red-600">{isLoading ? "--" : critical}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Warning (85-95%)</p>
          <p className="mt-1 text-xl font-bold text-orange-500">{isLoading ? "--" : warning}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Healthy (&lt;70%)</p>
          <p className="mt-1 text-xl font-bold text-green-600">{isLoading ? "--" : healthy}</p>
        </div>
      </div>

      <QuotaHeatmap sites={allSites} isLoading={isLoading} />
      <QuotaHistory sites={allSites} isLoading={isLoading} />
    </div>
  );
}
