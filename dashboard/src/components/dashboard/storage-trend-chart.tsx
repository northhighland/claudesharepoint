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
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
        <h3 className="mb-4 text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
          Storage Reclaimed (Last 30 Days)
        </h3>
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-48 w-full animate-pulse rounded bg-[#1A1A1A]" />
        </div>
      </div>
    );
  }

  const chartData = data ?? [];

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
      <h3 className="mb-4 text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
        Storage Reclaimed (Last 30 Days)
      </h3>
      {chartData.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center text-[13px] text-[#6B7280]">
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="storageGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#6B7280", fontSize: 11 }}
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
              tick={{ fill: "#6B7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value} GB`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#141414",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
                borderLeft: "2px solid #10B981",
              }}
              labelStyle={{ color: "#6B7280" }}
              itemStyle={{ color: "#F9FAFB" }}
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
              stroke="#10B981"
              strokeWidth={1.5}
              fill="url(#storageGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
