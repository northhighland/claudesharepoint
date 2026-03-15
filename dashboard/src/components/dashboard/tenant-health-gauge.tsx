"use client";

import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface TenantHealthGaugeProps {
  score: number;
  quotaHealth: number;
  stalenessHealth: number;
  jobSuccess: number;
  isLoading: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "hsl(160, 84%, 39%)";
  if (score >= 40) return "hsl(38, 92%, 50%)";
  return "hsl(0, 72%, 51%)";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 40) return "Fair";
  return "Critical";
}

function getScoreLabelColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function SubMetric({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number;
  isLoading: boolean;
}): React.ReactElement {
  const barColor =
    value >= 70
      ? "bg-emerald-500"
      : value >= 40
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {isLoading ? (
          <div className="h-3 w-8 animate-pulse rounded bg-muted" />
        ) : (
          <span className="font-mono text-xs font-medium">{value}%</span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/50">
        {!isLoading && (
          <div
            className={cn("h-1.5 rounded-full transition-all duration-1000", barColor)}
            style={{ width: `${value}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function TenantHealthGauge({
  score,
  quotaHealth,
  stalenessHealth,
  jobSuccess,
  isLoading,
}: TenantHealthGaugeProps): React.ReactElement {
  // SVG arc calculations for a 180-degree semi-circle gauge
  const size = 220;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;

  // Arc from 180 degrees (left) to 0 degrees (right) — a top semi-circle
  const startAngle = Math.PI;
  const endAngle = 0;
  const totalArc = Math.PI;

  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy - radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy - radius * Math.sin(endAngle);

  const arcPath = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
  const circumference = totalArc * radius;
  const progress = isLoading ? 0 : (score / 100) * circumference;
  const dashOffset = circumference - progress;

  const scoreColor = getScoreColor(score);

  return (
    <div className="glass-card animate-fade-in-up rounded-xl p-6">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        Tenant Health Score
        <InfoTooltip text="Weighted score: Quota Health (40%) + Site Freshness (40%) + Job Reliability (20%). Higher is better." className="ml-1" />
      </h3>

      <div className="flex flex-col items-center">
        <svg
          width={size}
          height={size / 2 + 30}
          viewBox={`0 0 ${size} ${size / 2 + 40}`}
          className="overflow-visible"
        >
          {/* Background arc */}
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Foreground arc */}
          {!isLoading && (
            <path
              d={arcPath}
              fill="none"
              stroke={scoreColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: "stroke-dashoffset 1.5s ease-out, stroke 0.5s ease",
                filter: `drop-shadow(0 0 8px ${scoreColor})`,
              }}
            />
          )}
          {/* Score number */}
          {isLoading ? (
            <rect
              x={cx - 24}
              y={cy - 30}
              width={48}
              height={24}
              rx={4}
              className="animate-pulse fill-muted"
            />
          ) : (
            <>
              <text
                x={cx}
                y={cy - 10}
                textAnchor="middle"
                className="font-mono text-5xl font-bold"
                fill="white"
              >
                {score}
              </text>
              <text
                x={cx}
                y={cy + 16}
                textAnchor="middle"
                className="text-sm font-medium"
                fill={scoreColor}
              >
                {getScoreLabel(score)}
              </text>
            </>
          )}
        </svg>

        {/* Sub-metrics */}
        <div className="mt-2 w-full space-y-3">
          <SubMetric label="Quota Health" value={quotaHealth} isLoading={isLoading} />
          <SubMetric label="Site Freshness" value={stalenessHealth} isLoading={isLoading} />
          <SubMetric label="Job Reliability" value={jobSuccess} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
