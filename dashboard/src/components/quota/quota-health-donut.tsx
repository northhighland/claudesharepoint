"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { QuotaStatus } from "@/lib/types";

interface QuotaHealthDonutProps {
  sites: QuotaStatus[];
  isLoading: boolean;
}

const SEGMENTS = [
  { label: "Healthy", color: "#10b981", min: 0, max: 80 },
  { label: "Warning", color: "#eab308", min: 80, max: 85 },
  { label: "High", color: "#f97316", min: 85, max: 90 },
  { label: "Critical", color: "#ef4444", min: 90, max: 101 },
];

interface SegmentData {
  label: string;
  value: number;
  color: string;
}

export function QuotaHealthDonut({ sites, isLoading }: QuotaHealthDonutProps): React.ReactElement {
  const data: SegmentData[] = SEGMENTS.map((seg) => ({
    label: seg.label,
    value: sites.filter((s) => s.percentUsed >= seg.min && s.percentUsed < seg.max).length,
    color: seg.color,
  })).filter((d) => d.value > 0);

  // If no data, show a placeholder segment
  const chartData = data.length > 0 ? data : [{ label: "No Data", value: 1, color: "#3f3f46" }];

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in-up">
      <h4 className="mb-4 text-sm font-medium">Quota Health Distribution</h4>
      {isLoading ? (
        <div className="flex items-center justify-center h-[260px]">
          <div className="h-40 w-40 animate-pulse rounded-full bg-muted" />
        </div>
      ) : (
        <>
          <div className="relative h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                  }}
                  formatter={(value: number, _name: string, props: { payload?: SegmentData }) => [
                    `${value} sites`,
                    props.payload?.label ?? "",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-mono text-3xl font-bold">{sites.length}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Sites
              </span>
            </div>
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {SEGMENTS.map((seg) => {
              const count = sites.filter(
                (s) => s.percentUsed >= seg.min && s.percentUsed < seg.max
              ).length;
              return (
                <div key={seg.label} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {seg.label}{" "}
                    <span className="font-mono font-medium text-foreground">{count}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
