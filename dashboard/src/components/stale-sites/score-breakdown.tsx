"use client";

import type { StaleSiteRecommendation } from "@/lib/types";
import { formatBytes, formatDate } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";

interface ScoreBreakdownProps {
  site: StaleSiteRecommendation;
}

export function ScoreBreakdown({ site }: ScoreBreakdownProps): React.ReactElement {
  const now = useNow(60000);
  const daysSinceActivity = Math.floor(
    (now - new Date(site.lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysSinceModified = Math.floor(
    (now - new Date(site.lastContentModified).getTime()) / (1000 * 60 * 60 * 24)
  );

  type Severity = "high" | "medium" | "low";

  const factors: { label: string; detail: string; applies: boolean; severity: Severity }[] = [
    {
      label: "No activity",
      detail: `${daysSinceActivity} days since last activity (${formatDate(site.lastActivityDate)})`,
      applies: daysSinceActivity > 90,
      severity: daysSinceActivity > 365 ? "high" : daysSinceActivity > 180 ? "medium" : "low",
    },
    {
      label: "No content changes",
      detail: `${daysSinceModified} days since last modification`,
      applies: daysSinceModified > 90,
      severity: daysSinceModified > 365 ? "high" : daysSinceModified > 180 ? "medium" : "low",
    },
    {
      label: "Low storage usage",
      detail: `Only ${formatBytes(site.storageUsedBytes)} used`,
      applies: site.storageUsedBytes < 100 * 1024 * 1024,
      severity: "low",
    },
    {
      label: "Few members",
      detail: `${site.memberCount} member${site.memberCount !== 1 ? "s" : ""}`,
      applies: site.memberCount < 5,
      severity: site.memberCount === 0 ? "high" : "low",
    },
  ];

  const severityColor = {
    high: "text-red-400 bg-red-500/10 border-red-500/20",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    low: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  };

  const applicableFactors = factors.filter((f) => f.applies);

  return (
    <div className="space-y-2 py-3 px-4 bg-muted/10 rounded-lg">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contributing Factors</p>
      {applicableFactors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No significant factors identified</p>
      ) : (
        <div className="space-y-1.5">
          {applicableFactors.map((factor) => (
            <div
              key={factor.label}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${severityColor[factor.severity]}`}
            >
              <span className="font-medium">{factor.label}</span>
              <span className="opacity-80">{factor.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
