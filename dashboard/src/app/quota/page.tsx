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
        <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB]">Quota Management</h1>
        <p className="text-[13px] text-[#6B7280]">
          Site collection quota usage and auto-increase history
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Total Sites</p>
          <p className="mt-1 text-xl font-semibold text-[#F9FAFB]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : allSites.length}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Critical (&gt;95%)</p>
          <p className="mt-1 text-xl font-semibold text-red-400" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : critical}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Warning (85-95%)</p>
          <p className="mt-1 text-xl font-semibold text-amber-400" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : warning}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">Healthy (&lt;70%)</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLoading ? "--" : healthy}
          </p>
        </div>
      </div>

      <QuotaHeatmap sites={allSites} isLoading={isLoading} />
      <QuotaHistory sites={allSites} isLoading={isLoading} />
    </div>
  );
}
