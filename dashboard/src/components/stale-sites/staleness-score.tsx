"use client";

import { cn } from "@/lib/utils";

interface StalenessScoreProps {
  score: number;
  category: string;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-red-500";
  if (score >= 60) return "bg-orange-400";
  if (score >= 40) return "bg-yellow-400";
  return "bg-green-400";
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "Abandoned":
      return "text-red-400";
    case "Stale":
      return "text-orange-400";
    case "Low Activity":
      return "text-amber-400";
    case "Active":
      return "text-emerald-400";
    default:
      return "text-muted-foreground";
  }
}

export function StalenessScore({
  score,
  category,
  className,
}: StalenessScoreProps): React.ReactElement {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex-1">
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={cn("h-2 rounded-full transition-all", getScoreColor(score))}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      </div>
      <span className="w-8 text-right text-sm font-bold">{score}</span>
      <span className={cn("w-24 text-xs font-medium", getCategoryColor(category))}>
        {category}
      </span>
    </div>
  );
}
