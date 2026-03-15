"use client";

import { RefreshCw } from "lucide-react";
import { useNow } from "@/hooks/use-now";

interface DataFreshnessProps {
  lastUpdated?: string; // ISO date string
  pollInterval?: number; // ms
}

export function DataFreshness({ lastUpdated, pollInterval }: DataFreshnessProps): React.ReactElement {
  const now = useNow(10000);

  if (!lastUpdated) return <></>;

  const date = new Date(lastUpdated);
  if (isNaN(date.getTime())) return <></>;

  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  let timeAgo: string;
  if (diffMin < 1) timeAgo = "just now";
  else if (diffMin < 60) timeAgo = `${diffMin}m ago`;
  else timeAgo = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`;

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
      <RefreshCw className="h-3 w-3" />
      <span>Updated {timeAgo}</span>
      {pollInterval && (
        <span className="text-muted-foreground/40">
          · refreshes every {Math.round(pollInterval / 1000)}s
        </span>
      )}
    </div>
  );
}
