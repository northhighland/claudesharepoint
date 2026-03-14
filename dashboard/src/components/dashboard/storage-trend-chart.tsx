"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { StorageTrendPoint } from "@/lib/types";

interface StorageTrendChartProps {
  data: StorageTrendPoint[] | undefined;
  isLoading: boolean;
}

export function StorageTrendChart({
  data,
  isLoading,
}: StorageTrendChartProps): React.ReactElement {
  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          Storage Reclaimed (Last 30 Days)
        </h3>
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-48 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  const chartData = data ?? [];

  return (
    <div className="glass-card rounded-xl p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        Storage Reclaimed (Last 30 Days)
      </h3>
      {chartData.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="storageGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(172, 100%, 39%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(172, 100%, 39%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: string) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value} GB`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
              labelFormatter={(label: string) =>
                new Date(label).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              }
              formatter={(value: number) => [`${value.toFixed(2)} GB`, "Reclaimed"]}
            />
            <Area
              type="monotone"
              dataKey="reclaimedGB"
              stroke="hsl(172, 100%, 39%)"
              strokeWidth={2}
              fill="url(#storageGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
